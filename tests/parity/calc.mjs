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
  const accReal = compareAccounts(d, "yours");

  // Made-up accounts and transactions for the card and balance edge cases.
  const ymA = addM(ymOf(T), -5);
  const A = (id, x) => ({ id, name: id, updatedAt: 1, ...x });
  const synthAcc = [
    A("bank1", { type: "bank", opening: 125000.75 }),
    A("bank2", { type: "bank", opening: 0, openingDate: `${addM(ymA, 2)}-10` }),
    A("card31", { type: "card", opening: -15000, stmtDay: 31, dueDay: 20 }),
    A("card5", { type: "card", opening: 0, stmtDay: 5, dueDay: 25 }),
    A("cardNoDue", { type: "card", opening: -999.99, stmtDay: 15 }),
    A("mm-card", { type: "card", opening: -42000, stmtDay: 12, dueDay: 2 }),
    A("cardNoCycle", { type: "card", opening: -100 }),
    A("hidden", { type: "bank", opening: 5000, hidden: true }),
    A("cash", { type: "cash", opening: 2500 }),
  ];
  const day = (k, dd) => `${addM(ymA, k)}-${String(dd).padStart(2, "0")}`;
  let n2 = 0; const X = (x) => ({ id: `t${++n2}`, updatedAt: n2, ...x });
  const synthTx = [
    X({ type: "income", amount: 90000, date: day(0, 1), accountId: "bank1" }),
    X({ type: "expense", amount: 1234.56, date: day(0, 3), accountId: "card31" }),
    X({ type: "expense", amount: 499, date: day(0, 31) > day(0, 28) ? day(0, 28) : day(0, 28), accountId: "card31" }),
    X({ type: "expense", amount: 2500, date: day(1, 5), accountId: "card5" }),
    X({ type: "expense", amount: 2600, date: day(1, 6), accountId: "card5" }),
    X({ type: "transfer", amount: 15000, date: day(1, 20), accountId: "bank1", toAccountId: "card31" }),
    X({ type: "transfer", amount: 2500, date: day(2, 24), accountId: "bank1", toAccountId: "card5" }),
    X({ type: "expense", amount: 300, date: day(2, 15), accountId: "cardNoDue" }),
    X({ type: "expense", amount: 700, date: day(3, 12), accountId: "mm-card" }),
    X({ type: "expense", amount: 8800, date: day(-1, 20), accountId: "mm-card", hist: true }),
    X({ type: "expense", amount: 450, date: day(2, 2), accountId: "bank1", paidBy: "spouse" }),
    X({ type: "investment", amount: 5000.5, date: day(2, 10), accountId: "bank1" }),
    X({ type: "loan", act: "borrow", amount: 20000, date: day(2, 12), accountId: "bank2" }),
    X({ type: "loan", act: "repay", amount: 5000, date: day(3, 12), accountId: "bank2" }),
    X({ type: "loan", act: "repay", amount: 100, date: day(3, 13), accountId: "ghost" }),
    X({ type: "carry", dir: "out", carry: 1500.25, amount: 1500.25, date: `${lastDay(addM(ymA, 1))}`, accountId: "bank1", ym: addM(ymA, 1) }),
    X({ type: "carry", dir: "in", carry: 1500.25, amount: 1500.25, date: day(2, 1), accountId: "bank1", ym: addM(ymA, 1) }),
    X({ type: "income", amount: 1000, date: day(4, 2), accountId: "card5" }),
    X({ type: "expense", amount: 60, date: day(4, 1), accountId: "hidden" }),
    X({ type: "expense", amount: 75, date: day(3, 9), accountId: "cash", deleted: true }),
    X({ type: "expense", amount: 333.33, date: ymOf(T) + "-01", accountId: "card5" }),
    X({ type: "transfer", amount: 50, date: day(4, 6), accountId: "card5", toAccountId: "cash" }),
  ];
  S.data = { ...real, accounts: synthAcc, txns: synthTx, loans: [] };
  MEMO = new Map();
  const accSynth = compareAccounts(N.dataFrom(S.data, T), "made-up");
  S.data = real;
  MEMO = new Map();
  return { checked, diffs: out, loans: realRes, synth, accReal, accSynth };

  function compareAccounts(d, label) {
    const NA = N.accounts, accs = S.data.accounts.filter((a) => !a.deleted), txs = S.data.txns.filter((t) => !t.deleted);
    const nAcc = (a) => d.byId("accounts", a.id), nTx = (t) => d.byId("txns", t.id);
    const balAt = (upto) => { const o = balances(upto), n = NA.balances(d, upto); for (const a of accs) close(o.get(a.id) ?? 0, n.get(a.id) ?? 0, `${label} ${a.name}: balance at ${upto ?? "now"}`); };
    balAt(undefined);
    for (let k = 0; k <= 24; k++) balAt(lastDay(addM(ymOf(T), -k)));
    const months = []; for (let k = -1; k <= 24; k++) months.push(addM(ymOf(T), -k));
    for (const ym of months) {
      const o = monthActuals(ym), n = NA.monthActuals(d, ym);
      for (const k of ["income", "expense", "investment"]) close(o[k], n[k], `${label} ${ym}: actual ${k}`);
      for (const a of accs) { close(monthNet(a.id, ym), NA.monthNet(d, a.id, ym), `${label} ${a.name} ${ym}: month net`); close(monthNet(a.id, ym, true), NA.monthNet(d, a.id, ym, true), `${label} ${a.name} ${ym}: month net w/o carry`); }
    }
    for (const a of accs) {
      same(countsAcc(a), NA.countsAcc(nAcc(a)), `${label} ${a.name}: counts`);
      same(openDateOf(a), NA.openDateOf(nAcc(a)), `${label} ${a.name}: opening date`);
      for (const t of txs.slice(0, 400)) {
        checked++; const o = accEff(a.id, t), n = NA.accEff(a.id, nTx(t)); if (Math.abs(o - n / 100) > 1e-6) out.push(`${label} ${a.name} ${t.id}: accEff ${o} vs ${n / 100}`);
      }
      if (a.type !== "card") continue;
      if (+a.stmtDay >= 1) for (const t of txs.slice(0, 600)) {
        same(stmtFor(a, t.date), NA.stmtFor(nAcc(a), t.date), `${label} ${a.name}: statement for ${t.date}`);
        same(dueOf(a, stmtFor(a, t.date)), NA.dueOf(nAcc(a), NA.stmtFor(nAcc(a), t.date)), `${label} ${a.name}: due for ${t.date}`);
      }
      for (let k = 0; k <= 6; k++) {
        if (+a.stmtDay >= 1) same(cardCycle(a, k), NA.cardCycle(d, nAcc(a), k), `${label} ${a.name}: cycle ${k}`);
        const o = cardInfo(a, k), n = NA.cardInfo(d, nAcc(a), k);
        same(!!o, !!n, `${label} ${a.name}: has card info`);
        if (o && n) {
          for (const f of ["billed", "paid", "dueLeft", "owed", "unbilled"]) close(o[f], n[f], `${label} ${a.name} cycle ${k}: ${f}`);
          same([o.stmt, o.prev, o.next, o.due, o.days], [n.stmt, n.prev, n.next, n.due, n.days], `${label} ${a.name} cycle ${k}: dates`);
          same(cardTx(a, o.stmt, k === 0 ? T : o.next).map((t) => t.id), NA.cardTx(d, nAcc(a), n.stmt, k === 0 ? T : n.next).map((t) => t.id), `${label} ${a.name} cycle ${k}: transactions`);
        }
      }
    }
    for (const t of txs) { same(expMonth(t), NA.expMonth(d, nTx(t)), `${label} ${t.id}: spending month`); same(histCovered(t), NA.histCovered(d, nTx(t)), `${label} ${t.id}: in opening balance`); }
    return accs.length;
  }

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
console.log(`calc parity on ${EXPORT.includes("sample") ? "the sample" : "the real export"}: ${report.checked} comparisons · loans: ${report.loans} yours + ${report.synth} made-up · accounts: ${report.accReal} yours + ${report.accSynth} made-up`);
if (report.diffs.length) { console.error(`✗ ${report.diffs.length} differences:\n  ${report.diffs.slice(0, 30).join("\n  ")}`); process.exit(1); }
console.log("✓ dates, loans, balances, month totals, card cycles and bills match the planner exactly");
