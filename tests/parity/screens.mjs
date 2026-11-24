// Screen parity: each rewritten screen's HTML against the planner's own, character for character,
// on the same data and in many states (filters, months, search, selection).
// Needs AV_EXPORT (or uses the made-up sample). Run: node tests/parity/screens.mjs
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const EXPORT = process.env.AV_EXPORT && existsSync(process.env.AV_EXPORT) ? process.env.AV_EXPORT : "tests/fixtures/sample-export.json";
const bundle = async (e, fmt) => (await build({ entryPoints: [e], bundle: true, format: fmt, write: false, target: "es2022" })).outputFiles[0].text;
const harness = await bundle("tests/parity/harness.ts", "esm");
const screens = await bundle("tests/parity/screens-entry.ts", "iife");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/export.json") return res.writeHead(200).end(await readFile(EXPORT));
  if (url === "/harness.js") return res.writeHead(200, { "content-type": T[".js"] }).end(harness);
  if (url === "/harness.html") return res.writeHead(200, { "content-type": T[".html"] }).end('<!doctype html><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/money/mv.css"><main id="main"></main><script type="module" src="/harness.js"></script>');
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
await f.addScriptTag({ content: screens });

const report = await f.evaluate(() => {
  const N = window.SCREENS, out = [];
  const d = N.dataFrom(S.data, today());
  let dd = d;
  const blank = (x = {}) => ({ type: "all", cat: "", acc: "", tag: "", period: "month", from: "", to: "", q: "", ...x });
  const states = [];
  const nowM = ymOf(today());
  for (let i = 0; i < 14; i++) states.push([`month ${addM(nowM, -i)}`, blank(), addM(nowM, -i)]);
  states.push([`next month`, blank(), addM(nowM, 1)]);
  for (const [k] of TX_TYPES) for (const p of ["month", "all"]) states.push([`type ${k} · ${p}`, blank({ type: k, period: p }), nowM]);
  for (const p of ["3m", "year", "all"]) states.push([`period ${p}`, blank({ period: p }), nowM]);
  states.push(["custom range", blank({ period: "custom", from: addM(nowM, -4) + "-10", to: addM(nowM, -1) + "-05" }), nowM]);
  states.push(["custom from only", blank({ period: "custom", from: addM(nowM, -2) + "-01" }), nowM]);
  for (const g of allTags().slice(0, 8)) { states.push([`tag ${g}`, blank({ tag: g, period: "all" }), nowM]); states.push([`tag ${g} month`, blank({ tag: g }), nowM]); }
  for (const a of S.data.accounts.filter((x) => !x.deleted)) { states.push([`account ${a.name}`, blank({ acc: a.id }), nowM]); states.push([`account ${a.name} · all`, blank({ acc: a.id, period: "all" }), nowM]); }
  for (const p of PAYERS_ALL()) states.push([`paid by ${p.name}`, blank({ acc: "@" + p.id, period: "all" }), nowM]);
  const tops = live("categories").filter((c) => !c.parentId).slice(0, 25);
  for (const c of tops) states.push([`category ${c.name}`, blank({ cat: c.id, period: "all" }), nowM]);
  for (const q of ["a", "rent", "5000", "1,000", "transfer", "hdfc", "zzzz", "epf", "ppf", "interest", "salary", "home"]) states.push([`search "${q}"`, blank({ q, period: "all" }), nowM]);
  states.push(["amount from 1000", blank({ min: "1000", period: "all" }), nowM]);
  states.push(["amount up to 499.5", blank({ max: "499.5", period: "all" }), nowM]);
  states.push(["amount 100-20000", blank({ min: "100", max: "20000" }), addM(nowM, -1)]);
  states.push(["history only", blank({ hist: "only", period: "all" }), nowM]);
  states.push(["no history", blank({ hist: "none", period: "all" }), nowM]);
  states.push(["uncategorised", blank({ uncat: true, period: "all" }), nowM]);
  for (const v of live("views")) states.push([`saved view ${v.name}`, blank(v.f), nowM]);
  const ids = live("txns").slice(0, 6).map((t) => t.id);
  const save = { f: S.f, month: S.month, view: S.view, selOn: S.selOn, sel: S.sel, txLimit: S.txLimit };
  let n = 0;
  const run = (label, f, month, extra = {}) => {
    S.view = "activity"; S.f = JSON.parse(JSON.stringify(f)); S.month = month; S.selOn = !!extra.selOn; S.sel = new Set(extra.sel || []); S.txLimit = extra.txLimit || 0; MEMO = new Map();
    // Intended: rupee decimals could leave a net of −0.0000001, shown as a red ₹0; in paise it is exactly 0.
    const a = vActivity().replace(/class="neg">₹0</g, 'class="">₹0<');
    const b = N.txlist.activityHtml(dd, { f: JSON.parse(JSON.stringify(f)), month, selOn: !!extra.selOn, sel: new Set(extra.sel || []), txLimit: extra.txLimit || 0 });
    n++;
    if (a !== b) {
      let i = 0; while (i < a.length && a[i] === b[i]) i++;
      out.push(`${label}: differs at ${i}\n    old …${a.slice(Math.max(0, i - 80), i + 120)}\n    new …${b.slice(Math.max(0, i - 80), i + 120)}`);
    }
  };
  for (const [l, f, m] of states) run(l, f, m);
  run("selecting, some picked", blank({ period: "all" }), nowM, { selOn: true, sel: ids });
  run("selecting, none picked", blank(), nowM, { selOn: true });
  run("show more (600)", blank({ period: "all" }), nowM, { txLimit: 600 });
  run("show fewer (30)", blank({ period: "all" }), nowM, { txLimit: 30 });
  // Made-up additions for row kinds your data may not have: saved views, splits, money from a loan,
  // investment charges, paid by someone else (and by a removed payer), PPF and EPF entries you added.
  const real = S.data, ym1 = addM(nowM, -1), loan = live("loans")[0], acc = live("accounts")[0]?.id, cat = live("categories").find((c) => c.kind === "expense")?.id;
  let k = 0; const X = (o) => ({ id: `x${++k}`, updatedAt: 1000 + k, accountId: acc, date: `${nowM}-02`, ...o });
  S.data = { ...real,
    views: [{ id: "v1", name: "Big spends", f: { min: "5000", period: "all" }, updatedAt: 1 }, { id: "v2", name: "Trip", f: { tag: "Trip", type: "expense" }, updatedAt: 1 }, { id: "v3", name: "Gone", f: {}, deleted: true, updatedAt: 1 }],
    payers: [...(real.payers || []), { id: "sp2", name: "Amma", own: false, tag: "Home", updatedAt: 1 }, { id: "old", name: "Old wallet", own: true, deleted: true, updatedAt: 1 }],
    txns: [...real.txns,
      X({ type: "expense", amount: 600, categoryId: cat, note: "dinner", splitOf: "x1", tags: ["Trip"] }), X({ type: "expense", amount: 400.5, categoryId: cat, note: "dinner", splitOf: "x1", tags: ["Trip"] }),
      X({ type: "expense", amount: 25000, categoryId: cat, note: "sofa", fromLoan: loan?.id }), X({ type: "expense", amount: 9000, categoryId: cat, fundLoan: loan?.id, fundAmt: 4000 }),
      X({ type: "investment", amount: 10010, charges: 10, instrument: "Axis fund", date: `${nowM}-03` }),
      X({ type: "expense", amount: 1200, categoryId: cat, paidBy: "sp2", tags: ["Home"] }), X({ type: "expense", amount: 300, categoryId: cat, paidBy: "old" }),
      X({ type: "income", amount: 777, note: "no category" }), X({ type: "expense", amount: -250, categoryId: cat, note: "refund" }),
      X({ type: "transfer", amount: 5000, toAccountId: live("accounts")[1]?.id, note: "to savings", date: `${ym1}-20` }),
      X({ type: "expense", amount: 100, categoryId: "gone-cat", note: "category deleted" }),
      // Your own PPF deposit, 50 paise off the statement's: the statement line isn't listed twice.
      X({ type: "investment", amount: 1500.5, instrument: "PPF2", date: `${ym1}-12` }),
    ],
    holdings: [...real.holdings,
      { id: "hp", type: "PPF", instrument: "PPF2", name: "PPF2", rate: 7.1, updatedAt: 1, ppf: { opened: "2018-05-01", stmtDate: `${addM(nowM, -3)}-01`, rows: [{ k: "dep", d: "2025-05-01", amt: 1000 }, { k: "int", d: "2026-03-31", amt: 71.25 }, { k: "dep", d: `${ym1}-10`, amt: 1500 }],
        manual: [{ id: "m1", k: "dep", d: `${ym1}-04`, amt: 500 }, { id: "m2", k: "wd", d: `${nowM}-01`, amt: 200 }] } },
      { id: "he", type: "EPF", name: "EPF2", updatedAt: 1, epf: { rate: 8.25, books: { A: { est: "X", fys: { 2025: { ob: [1000, 800, 300], rows: [{ k: "cont", wm: "2025-05", d: "2025-06-15", wage: 15000, epsw: 15000, emp: 1800, er: 550, eps: 1250 }] } } } },
        manual: [{ id: "e1", k: "cont", wm: ym1, d: `${nowM}-01`, emp: 1800, er: 550, eps: 1250, epsw: 15000 }, { id: "e2", k: "wd", d: `${ym1}-09`, emp: 5000, er: 0, eps: 0 }] } },
    ],
  };
  MEMO = new Map();
  const d2 = N.dataFrom(S.data, today());
  const run2 = (label, f, month, extra) => { const keep = d; try { dd = d2; run(`made-up: ${label}`, f, month, extra); } finally { dd = keep; } };
  for (const [l, f, m] of [["this month", blank(), nowM], ["last month", blank(), ym1], ["all time", blank({ period: "all" }), nowM], ["EPF & PPF", blank({ type: "epf", period: "all" }), nowM],
    ["view Big spends", blank({ min: "5000", period: "all" }), nowM], ["tag Trip", blank({ tag: "Trip" }), nowM], ["tag Home", blank({ tag: "Home", period: "all" }), nowM],
    ["paid by Amma", blank({ acc: "@sp2", period: "all" }), nowM], ["paid by removed payer", blank({ acc: "@old", period: "all" }), nowM], ["uncategorised", blank({ uncat: true }), nowM],
    ["search dinner", blank({ q: "dinner" }), nowM], ["search 400.5", blank({ q: "400.5", period: "all" }), nowM], ["investments", blank({ type: "investment" }), nowM]]) run2(l, f, m);
  run2("selecting", blank(), nowM, { selOn: true, sel: ["x1", "x5"] });
  // Sheets: the new ones against the planner's, as drawn (markup, values, pickers, balances).
  const sheetHtml = (sel) => document.querySelector(sel)?.innerHTML ?? "(none)";
  const cmpSheet = (label, openOld, openNew) => {
    n++;
    openOld(); const a = sheetHtml("#modal"); closeModal();
    openNew(); const b = sheetHtml("#mvLayer #modal"); N.kit.closeModal();
    if (a !== b) {
      let i = 0; while (i < a.length && a[i] === b[i]) i++;
      out.push(`sheet ${label}: differs at ${i}\n    old …${a.slice(Math.max(0, i - 100), i + 120)}\n    new …${b.slice(Math.max(0, i - 100), i + 120)}`);
    }
  };
  const sheets = (dx, tag) => {
    N.setEnv({ data: () => dx, state: () => S, write: () => {}, refresh: () => {}, planner: () => {} });
    const stored = (id) => dx.byId("txns", id);
    const pick = (f) => live("txns").filter(f).slice(-2);
    const kinds = [["expense", (t) => t.type === "expense" && !t.paidBy && !t.funds && !t.fundLoan], ["income", (t) => t.type === "income"], ["transfer", (t) => t.type === "transfer"],
      ["investment", (t) => t.type === "investment"], ["investment with charges", (t) => t.type === "investment" && t.charges > 0], ["paid by someone", (t) => !!t.paidBy], ["money from loans", (t) => !!(t.funds || t.fundLoan)],
      ["paid from a loan", (t) => !!t.fromLoan], ["tagged", (t) => (t.tags || []).length > 0], ["budget", (t) => !!t.budgetId], ["history", (t) => !!t.hist], ["negative", (t) => t.amount < 0], ["split", (t) => !!t.splitOf]];
    for (const [k, f] of kinds) for (const t of pick(f)) cmpSheet(`${tag} edit ${k} ${t.id}`, () => txnForm({ ...t }), () => N.txform.txnForm({ ...stored(t.id) }));
    const acc0 = (mainAcc() || live("accounts")[0] || {}).id;
    cmpSheet(`${tag} add`, () => txnForm({}, { accountId: acc0 }), () => N.txform.txnForm({}, { accountId: acc0 }));
    for (const t of live("txns").filter((x) => x.type === "carry").slice(-2)) cmpSheet(`${tag} carry ${t.id}`, () => carrySheet(t), () => N.txform.carrySheet(stored(t.id)));
    S.f = blank({ tag: allTags()[0] || "", min: "100" }); cmpSheet(`${tag} filters`, () => txFilterSheet(), () => N.txsheets.txFilterSheet());
    S.f = blank(); cmpSheet(`${tag} clean up`, () => cleanupSheet(), () => N.txsheets.cleanupSheet());
    const two = live("txns").filter((x) => x.type === "expense" || x.type === "income").slice(-3).map((x) => x.id);
    S.selOn = true; S.sel = new Set(two);
    cmpSheet(`${tag} bulk tag`, () => bulkAct("tag"), () => N.txsheets.bulkAct("tag"));
    cmpSheet(`${tag} bulk category`, () => bulkAct("cat"), () => N.txsheets.bulkAct("cat"));
    cmpSheet(`${tag} bulk delete`, () => bulkAct("del"), () => N.txsheets.bulkAct("del"));
    for (const t of live("txns").filter((x) => x.type === "expense" && x.amount > 0).slice(-2)) cmpSheet(`${tag} split ${t.id}`, () => splitSheet({ ...t }), () => N.txform.splitSheet({ ...stored(t.id) }));
    S.selOn = false; S.sel = new Set();
  };
  sheets(d2, "made-up");
  S.data = real; MEMO = new Map();
  sheets(d, "yours");
  Object.assign(S, save); MEMO = new Map();
  // Also the money formats, on awkward amounts.
  for (const r of [0, 0.004, 0.005, -0.5, 0.5, 1.5, 2.5, -2.5, 999.995, 1234.56, -1234.56, 12345678.9, 1e9]) {
    const p = Math.round(r * 100); n++;
    if (money(p / 100) !== N.txlist.money(p)) out.push(`money(${r}): old ${money(p / 100)} new ${N.txlist.money(p)}`);
    if (moneyP(p / 100) !== N.txlist.moneyP(p)) out.push(`moneyP(${r}): old ${moneyP(p / 100)} new ${N.txlist.moneyP(p)}`);
  }
  return { n, txns: live("txns").length, out };
});
await browser.close(); server.close();
const SHOW = +(process.env.SHOW || 6);
console.log(`screen parity on ${EXPORT.includes("sample") ? "the made-up sample" : "the real export"}: Transactions in ${report.n} states (${report.txns} transactions)`);
if (report.out.length) { console.log(`✗ ${report.out.length} differences:`); for (const x of report.out.slice(0, SHOW)) console.log("  " + x); process.exit(1); }
console.log("✓ the Transactions page and its sheets (form, split, carry-over, filters, clean-up, bulk) are identical to the planner's");
