// Function-level parity: every rewritten calculation against the planner's own, on the same data.
// Old answers are in rupees, new in paise; they must agree to within float noise (a millionth of a rupee).
// Needs AV_EXPORT (or uses the made-up sample). Run: node tests/parity/calc.mjs
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const EXPORT = process.env.AV_EXPORT && existsSync(process.env.AV_EXPORT) ? process.env.AV_EXPORT : "tests/fixtures/sample-export.json";
const bundle = async (e, fmt) => (await build({ entryPoints: [e], bundle: true, format: fmt, write: false, target: "es2022" })).outputFiles[0].text;
const harness = await bundle("tests/parity/harness.ts", "esm");
const calc = await bundle("tests/parity/calc-entry.ts", "iife");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/export.json") return res.writeHead(200).end(await readFile(EXPORT));
  if (url === "/harness.js") return res.writeHead(200, { "content-type": T[".js"] }).end(harness);
  if (url === "/harness.html") return res.writeHead(200, { "content-type": T[".html"] }).end('<!doctype html><link rel="stylesheet" href="/app.css"><main id="main"></main><script type="module" src="/harness.js"></script>');
  let file = join("dist", normalize(url)); if (!extname(file)) file += ".html";
  try { res.writeHead(200, { "content-type": T[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.route(/fonts\.g/, (r) => r.abort());
await page.goto(`http://127.0.0.1:${server.address().port}/harness.html#/money/home`);
const f = await (await page.waitForSelector("#moneyFrame")).contentFrame();
await f.waitForSelector("#view *", { timeout: 20000 });
await f.addScriptTag({ content: calc });

const report = await f.evaluate(() => {
  const N = window.NEW, out = [];
  const T = today();
  const d = N.dataFrom(S.data, T);
  let checked = 0;
  const close = (oldR, newP, what) => {
    checked++;
    const a = oldR == null ? oldR : +oldR, b = newP == null ? newP : newP / 100;
    if (a === b) return;
    if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a))) return;
    if (a === Infinity && b === Infinity) return;
    out.push(`${what}: old ${a} new ${b}`);
  };
  const same = (a, b, what) => { checked++; if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${what}: old ${JSON.stringify(a)} new ${JSON.stringify(b)}`); };

  // dates
  for (const ym of ["2024-01", "2024-12", "2025-02", "2026-11"]) for (const n of [-25, -13, -1, 0, 1, 11, 12, 37]) same(addM(ym, n), N.dates.addM(ym, n), `addM(${ym},${n})`);
  for (const [a, b] of [["2024-01", "2026-11"], ["2026-11", "2024-01"], ["2025-12", "2026-01"]]) same(diffM(a, b), N.dates.diffM(a, b), `diffM(${a},${b})`);
  for (const ym of ["2024-02", "2025-02", "2026-04", "2026-12"]) { same(lastDay(ym), N.dates.lastDay(ym), `lastDay(${ym})`); same(mLabel(ym), N.dates.mLabel(ym), `mLabel`); same(mShort(ym), N.dates.mShort(ym), `mShort`); }
  same(dLabel("2026-11-05"), N.dates.dLabel("2026-11-05"), "dLabel");
  for (const [y, m, dd] of [[2026, 2, 31], [2024, 2, 30], [2026, 4, 31], [2026, 11, 5]]) same(dayIn(y, m, dd), N.dates.dayIn(y, m, dd), `dayIn(${y},${m},${dd})`);

  // pmt / nper on a grid (amounts scale: old rupees vs new paise)
  for (const P of [100000, 2500000.5, 4567890]) for (const r of [0, 0.0075, 0.0095 / 12 * 12 / 12]) for (const n of [1, 12, 60, 240]) {
    close(pmt(P, r, n), N.loans.pmt(P * 100, r, n), `pmt(${P},${r},${n})`);
    const E = pmt(P, r, n);
    same(nper(P, r, E), N.loans.nper(P * 100, r, E * 100), `nper(${P},${r},${E})`);
  }

  // Made-up loans that exercise every path: rate changes (both modes), part payments (both modes),
  // bank-statement matches, a loan closed early, a hybrid with missed EMIs paid back, a card EMI, zero rate.
  const ym0 = addM(ymOf(T), -18);
  const L = (id, x) => ({ id, name: id, updatedAt: 1, start: ym0, ...x });
  const synthLoans = [
    L("float-emi", { kind: "emi", principal: 2500000, rate: 8.5, tenure: 120, rates: [{ ym: addM(ym0, 3), rate: 9.25, mode: "emi" }, { ym: addM(ym0, 9), rate: 8.1 }] }),
    L("float-tenure", { kind: "emi", principal: 1800000, rate: 9, tenure: 180, emi: 18256.33, rates: [{ ym: addM(ym0, 2), rate: 10.5 }, { ym: addM(ym0, -4), rate: 9.4, mode: "emi" }] }),
    L("prepaid", { kind: "emi", principal: 900000, rate: 10.25, tenure: 60 }),
    L("synced", { kind: "emi", principal: 600000, rate: 11, tenure: 48, syncs: [{ ym: addM(ym0, 5), bal: 512345.67 }, { ym: addM(ym0, 11), bal: 401000, mode: "emi" }] }),
    L("closed", { kind: "emi", principal: 300000, rate: 12, tenure: 36, closedOn: addM(ym0, 7) }),
    L("zero-rate", { kind: "cardemi", principal: 45999, rate: 0, tenure: 9 }),
    L("tiny", { kind: "emi", principal: 1000, rate: 14, tenure: 3 }),
    L("hybrid", { kind: "hybrid", bank: { principal: 1500000, rate: 8.75, tenure: 84, start: addM(ym0, -6), emi: 24000 }, plans: [] }),
    L("family", { kind: "family", plans: [] }),
  ];
  const tx = (id, x) => ({ id, type: "loan", updatedAt: 1, ...x });
  const synthTxns = [
    tx("p1", { loanId: "prepaid", act: "prepay", amount: 150000, date: `${addM(ym0, 4)}-15`, mode: "tenure" }),
    tx("p2", { loanId: "prepaid", act: "prepay", amount: 75000.5, date: `${addM(ym0, 4)}-02`, mode: "emi" }),
    tx("p3", { loanId: "prepaid", act: "prepay", amount: 50000, date: `${addM(ym0, -2)}-10` }),
    tx("p4", { loanId: "tiny", act: "prepay", amount: 999.6, date: `${addM(ym0, 1)}-01` }),
    tx("h1", { loanId: "hybrid", act: "borrow", part: "own", amount: 500000, date: `${ym0}-05` }),
    tx("h2", { loanId: "hybrid", act: "repay", part: "own", amount: 120000.25, date: `${addM(ym0, 6)}-05` }),
    tx("h3", { loanId: "hybrid", act: "missed", part: "bank", ym: addM(ym0, 2), amount: 24000, date: `${addM(ym0, 2)}-05` }),
    tx("h4", { loanId: "hybrid", act: "missed", part: "bank", ym: addM(ym0, 3), amount: 24000, date: `${addM(ym0, 3)}-05` }),
    tx("h5", { loanId: "hybrid", act: "catchup", part: "missed", covers: ["h3"], amount: 24000, date: `${addM(ym0, 8)}-05` }),
    tx("h6", { loanId: "hybrid", act: "prepay", part: "bank", amount: 200000, date: `${addM(ym0, 10)}-20`, mode: "emi" }),
    tx("f1", { loanId: "family", act: "borrow", amount: 300000, date: `${ym0}-01` }),
    tx("f2", { loanId: "family", act: "repay", amount: 300000, date: `${addM(ym0, 12)}-01` }),
    tx("x1", { loanId: "prepaid", act: "prepay", amount: 999999, date: `${ym0}-01`, deleted: true }),
  ];
  const real = S.data;
  S.data = { ...real, loans: synthLoans, txns: synthTxns };
  MEMO = new Map();
  const dS = N.dataFrom(S.data, T);
  const synth = compareLoans(dS, "made-up");
  S.data = real;
  MEMO = new Map();
  const realRes = compareLoans(d, "yours");
  return { checked, diffs: out, loans: realRes, synth };

  function compareLoans(d, label) {
  let n = 0;
  for (const l of S.data.loans.filter((x) => !x.deleted)) { n++;
    const nl = d.byId("loans", l.id);
    same(kindOf(l), N.loans.kindOf(nl), `${l.name}: kind`);
    close(emiOf(l), N.loans.emiOf(nl), `${l.name}: emiOf`);
    same(loanEnd(l), N.loans.loanEnd(nl), `${l.name}: loanEnd`);
    const so = schedule(l), sn = N.loans.schedule(d, nl);
    same(!!so, !!sn, `${l.name}: has schedule`);
    if (so && sn) {
      same(so.rows.length, sn.rows.length, `${l.name}: schedule length`);
      same([so.end, so.closed, so.start], [sn.end, sn.closed, sn.start], `${l.name}: schedule dates`);
      close(so.totalInt, sn.totalInt, `${l.name}: total interest`);
      so.rows.forEach((r, i) => { const q = sn.rows[i]; if (!q) return;
        same([r.ym, r.k], [q.ym, q.k], `${l.name} row ${i}: month`);
        for (const k of ["open", "emi", "int", "prin", "bal"]) close(r[k], q[k], `${l.name} row ${r.ym}: ${k}`);
        checked++; if (Math.abs(r.rate - q.rate) > 1e-9) out.push(`${l.name} row ${r.ym}: rate ${r.rate} vs ${q.rate}`);
      });
      for (let ym = addM(so.start, -2); ym <= addM(so.end || so.start, 2); ym = addM(ym, 1)) close(bankOut(l, ym), N.loans.bankOut(d, nl, ym), `${l.name}: owed at ${ym}`);
    }
    const a = loanSum(l), b = N.loans.loanSum(d, nl);
    for (const k of ["bank", "missed", "out", "emiNow", "totalInt", "paidInt"]) close(a[k], b[k], `${l.name}: summary ${k}`);
    for (const k of ["borrowed", "repaid", "out"]) close(a.own[k], b.own[k], `${l.name}: own ${k}`);
    same([a.k, a.end, !!a.closedByYou, a.mi.list.length], [b.k, b.end, !!b.closedByYou, b.mi.list.length], `${l.name}: summary fields`);
    checked++; if (Math.abs(a.rateNow - b.rateNow) > 1e-9) out.push(`${label} ${l.name}: rateNow ${a.rateNow} vs ${b.rateNow}`);
  }
  return n;
  }
});
await browser.close();
server.close();
console.log(`calc parity on ${EXPORT.includes("sample") ? "the sample" : "the real export"}: ${report.checked} comparisons, ${report.loans} of your loans + ${report.synth} made-up loans covering every path`);
if (report.diffs.length) { console.error(`✗ ${report.diffs.length} differences:\n  ${report.diffs.slice(0, 30).join("\n  ")}`); process.exit(1); }
console.log("✓ dates, EMI maths, schedules, amounts owed and loan summaries match the planner exactly");
