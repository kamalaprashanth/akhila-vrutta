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
const T = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
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
await f.waitForFunction(() => typeof S === "object" && !!S.data, null, { timeout: 20000 });
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
  const planReal = comparePlan(d, "yours");
  const fcReal = compareForecast(d, "yours");
  const propReal = compareProps(d, "yours");
  const resReal = compareReserve(d, "yours");
  const invReal = compareInvest(d, "yours");

  // Made-up plan items: every frequency, month changes and skips, a budget with spends, trading-day shifts,
  // SIPs with and without charges, transfers, a card EMI, family repayment plans (monthly and one-off, one paid).
  const ymP = ymOf(T);
  const cats = real.categories;
  const anyCat = (cats.find((c) => !c.deleted && c.kind === "expense") || {}).id;
  const R = (id, x) => ({ id, name: id, updatedAt: 1, type: "expense", amount: 1000, start: addM(ymP, -3), day: 5, accountId: "pb", categoryId: anyCat, ...x });
  const synthRec = [
    R("monthly", { freq: "monthly", amount: 2499.5 }),
    R("quarterly", { freq: "quarterly", start: addM(ymP, -1), day: 31 }),
    R("half", { freq: "halfyearly", start: addM(ymP, -5) }),
    R("yearly-ends", { freq: "yearly", start: addM(ymP, -12), end: addM(ymP, 12) }),
    R("biennial", { freq: "biennial", start: addM(ymP, -24) }),
    R("triennial", { freq: "triennial", start: addM(ymP, 1) }),
    R("once", { freq: "once", start: addM(ymP, 2) }),
    R("ended", { freq: "monthly", end: addM(ymP, 1) }),
    R("ov", { freq: "monthly", ov: { [addM(ymP, 1)]: 0, [addM(ymP, 2)]: 3333.33, [ymP]: 1500 } }),
    R("budget", { freq: "monthly", budget: true, amount: 8000 }),
    R("sip-mf", { type: "investment", invType: "Mutual Fund", freq: "monthly", amount: 10000, day: 7, shift: "trading" }),
    R("sip-chg", { type: "investment", invType: "Stocks", freq: "monthly", amount: 5000, charges: 15.9, day: 14, shift: "trading" }),
    R("sip-zero", { type: "investment", invType: "Mutual Fund", freq: "monthly", amount: 3000, charges: "", day: 1 }),
    R("sip-odd", { type: "investment", invType: "Stocks", freq: "monthly", amount: 10, charges: 15, day: 2 }),
    R("salary", { type: "income", freq: "monthly", amount: 185000, day: 30 }),
    R("move", { type: "transfer", freq: "monthly", amount: 20000, accountId: "pb", toAccountId: "pc", day: 28 }),
    // money leaving the counted accounts for one left out of totals
    R("to-broker", { type: "transfer", freq: "monthly", amount: 15000, accountId: "pb", toAccountId: "pinv", day: 2 }),
    R("from-broker", { type: "transfer", freq: "quarterly", amount: 4000, accountId: "pinv", toAccountId: "pb", day: 9 }),
    R("holiday-shift", { type: "investment", invType: "Mutual Fund", freq: "monthly", amount: 2000, day: 24, shift: "trading" }),
    // month-end on a weekend or holiday: the next trading day is in the next month, so the day stays
    R("eom-shift", { type: "investment", invType: "Mutual Fund", freq: "monthly", amount: 1500, day: 31, shift: "trading" }),
    R("eom-shift-30", { type: "income", freq: "monthly", amount: 700, day: 30, shift: "trading" }),
  ];
  const synthAcc2 = [
    { id: "pb", name: "Plan bank", type: "bank", opening: 50000, updatedAt: 1 },
    { id: "pc", name: "Plan card", type: "card", opening: -4200, stmtDay: 18, dueDay: 7, payFrom: "pb", updatedAt: 1 },
    { id: "pc2", name: "Plan card 2", type: "card", opening: 0, stmtDay: 3, dueDay: 23, updatedAt: 1 },
    { id: "pinv", name: "Brokerage (not in totals)", type: "invest", opening: 0, noTotal: true, updatedAt: 1 },
  ];
  const synthLoans2 = [
    { id: "cemi", name: "Phone", kind: "cardemi", principal: 59999, rate: 15, tenure: 6, start: addM(ymP, -1), accountId: "pc", fee: 199, categoryId: anyCat, updatedAt: 1 },
    { id: "cemi2", name: "Laptop", kind: "cardemi", principal: 90000, rate: 13, tenure: 9, start: ymP, accountId: "pc2", gstRate: 0, updatedAt: 1 },
    { id: "fam", name: "Uncle", lender: "Uncle", kind: "family", updatedAt: 1, plans: [
      { id: "m", freq: "monthly", amount: 25000, start: ymP, end: addM(ymP, 10), accountId: "pb" },
      { id: "o", freq: "once", amount: 40000, start: addM(ymP, 3), accountId: "pb" } ] },
    // leaves 30 paise owed: too small for a final repayment
    { id: "fam-dust", name: "Aunt", lender: "Aunt", kind: "family", updatedAt: 1, plans: [{ id: "m", freq: "monthly", amount: 25000, start: ymP, accountId: "pb" }] },
    { id: "emi", name: "Car", kind: "emi", principal: 700000, rate: 9.1, tenure: 60, start: addM(ymP, -10), accountId: "pb", day: 10, updatedAt: 1 },
  ];
  let n3 = 0; const Y = (x) => ({ id: `q${++n3}`, updatedAt: n3, ...x });
  const synthTx2 = [
    Y({ type: "loan", loanId: "fam", act: "borrow", amount: 200000, date: `${addM(ymP, -6)}-01`, accountId: "pb" }),
    Y({ type: "loan", loanId: "fam-dust", act: "borrow", amount: 100000.3, date: `${addM(ymP, -2)}-01`, accountId: "pb" }),
    Y({ type: "loan", loanId: "fam", act: "repay", amount: 25000, date: `${ymP}-02`, accountId: "pb", link: `p:fam:m|${ymP}` }),
    Y({ type: "expense", amount: 1999, date: `${ymP}-02`, accountId: "pb", budgetId: "budget" }),
    // paid early: next month's and the month after's items already settled
    Y({ type: "expense", amount: 2499.5, date: `${ymP}-04`, accountId: "pb", link: `r:monthly|${addM(ymP, 1)}` }),
    Y({ type: "income", amount: 185000, date: `${ymP}-04`, accountId: "pb", link: `r:salary|${addM(ymP, 2)}` }),
    Y({ type: "transfer", amount: 500, date: `${ymP}-03`, accountId: "pb", toAccountId: "pc", budgetId: "budget" }),
    Y({ type: "expense", amount: 700, date: `${addM(ymP, -1)}-20`, accountId: "pb", budgetId: "budget" }),
    Y({ type: "expense", amount: 1234.5, date: `${addM(ymP, -1)}-20`, accountId: "pc" }),
    Y({ type: "expense", amount: 88.8, date: T, accountId: "pc" }),
    Y({ type: "expense", amount: 250, date: `${addM(ymP, -1)}-05`, accountId: "pc2" }),
  ];
  S.data = { ...real, accounts: synthAcc2, recurring: synthRec, loans: synthLoans2, txns: synthTx2, settings: [{ id: "app", holidays: [`${ymP}-07`, `${addM(ymP, 1)}-14`] }] };
  MEMO = new Map();
  const dP = N.dataFrom(S.data, T);
  const planSynth = comparePlan(dP, "made-up");
  compareReserve(dP, "made-up (no reserve)");
  const fcSynth = compareForecast(dP, "made-up");
  S.data = real;
  MEMO = new Map();
  // Made-up properties: items paid by the property's loan, by a hybrid loan's two parts and by another bank loan,
  // linked transactions (one a refund, one deleted), principal prepaid from another loan, a statement, plan rows
  // of every kind (you, bank, split, TDS after payment), a reserve account with property-fund transfers.
  const ymQ = ymOf(T);
  const Pa = [
    { id: "rb", name: "Reserve bank", type: "bank", opening: 300000, reserve: true, updatedAt: 1 },
    { id: "mb", name: "HDFC", type: "bank", opening: 700000, updatedAt: 1 }, // its low point sits just above its minimum: a partly capped set-aside
  ];
  const PL = [
    { id: "hl", name: "Home loan", lender: "SBI", kind: "emi", principal: 4000000, rate: 8.4, tenure: 240, start: addM(ymQ, -14), day: 5, accountId: "mb", updatedAt: 1 },
    { id: "hy", name: "Uncle loan", lender: "Uncle", kind: "hybrid", bank: { principal: 600000, rate: 9, tenure: 60, start: addM(ymQ, -10), emi: 12455, day: 7 }, plans: [], updatedAt: 1 },
    { id: "pl", name: "Personal loan", lender: "HDFC", kind: "emi", principal: 300000, rate: 12.5, tenure: 36, start: addM(ymQ, -8), updatedAt: 1 },
  ];
  let n4 = 0; const Z = (x) => ({ id: `z${++n4}`, updatedAt: n4, ...x });
  const PT = [
    Z({ id: "pt1", type: "expense", amount: 500000, date: `${addM(ymQ, -13)}-02`, accountId: "mb", funds: [{ loan: "hy", amt: 300000, part: "own" }, { loan: "hy", amt: 150000, part: "bank" }] }),
    Z({ id: "pt2", type: "income", amount: 2500, date: `${addM(ymQ, -12)}-11`, accountId: "mb" }),
    Z({ id: "pt3", type: "expense", amount: 80000, date: `${addM(ymQ, -11)}-04`, accountId: "mb", deleted: true }),
    Z({ id: "pt4", type: "expense", amount: 120000, date: `${addM(ymQ, -6)}-09`, accountId: "mb", fundLoan: "pl", fundAmt: 100000 }),
    Z({ type: "loan", loanId: "hy", act: "borrow", part: "own", amount: 400000, date: `${addM(ymQ, -13)}-01`, accountId: "mb" }),
    Z({ type: "loan", loanId: "hy", act: "repay", part: "own", amount: 50000.5, date: `${addM(ymQ, -3)}-01`, accountId: "mb" }),
    Z({ type: "loan", loanId: "hl", act: "prepay", amount: 200000, date: `${addM(ymQ, -2)}-15`, accountId: "mb" }),
    // before the bank statement's date: already inside the statement's figures
    Z({ type: "loan", loanId: "hl", act: "prepay", amount: 111111, date: `${addM(ymQ, -7)}-20`, accountId: "mb" }),
    Z({ type: "transfer", amount: 50000, date: `${addM(ymQ, -1)}-05`, accountId: "mb", toAccountId: "rb", pot: "prop:p2" }),
    Z({ type: "transfer", amount: 7000, date: `${ymQ}-02`, accountId: "rb", toAccountId: "mb", pot: "prop:p2" }),
  ];
  const PI = [
    Z({ prop: "p1", cat: "token", amt: 100000, date: `${addM(ymQ, -15)}-20` }),
    // linked items carry the amount and date from when they were linked, as the planner saves them
    Z({ prop: "p1", cat: "agree", txnId: "pt1", amt: 500000, date: `${addM(ymQ, -13)}-02` }),
    Z({ prop: "p1", cat: "stamp", txnId: "pt2", amt: 2500, date: `${addM(ymQ, -12)}-11` }),
    Z({ prop: "p1", cat: "lawyer", txnId: "pt3", amt: 80000, date: `${addM(ymQ, -11)}-04` }),
    Z({ prop: "p1", cat: "bank", amt: 3600000, date: `${addM(ymQ, -14)}-01`, loanId: "hl" }),
    Z({ prop: "p1", cat: "lprepay", txnId: "pt4", amt: 120000, date: `${addM(ymQ, -6)}-09` }),
    Z({ prop: "p1", cat: "interior", amt: 350000, date: `${addM(ymQ, -4)}-10`, accountId: "mb" }),
    Z({ prop: "p1", cat: "cash", amt: 75000, date: `${addM(ymQ, -15)}-21` }),
    Z({ prop: "p1", cat: "pemi", amt: 18000.25, date: `${addM(ymQ, -14)}-28` }),
    Z({ prop: "p1", cat: "maint", amt: 4500, date: `${addM(ymQ, -1)}-03`, funds: [{ loan: "pl", amt: 9999 }] }),
    Z({ prop: "p1", cat: "mycat", amt: 1200, date: `${addM(ymQ, -1)}-03` }),
    // hybrid-loan money with no part given; a cost paid in full from the property's own loan via its funding rows
    Z({ prop: "p1", cat: "plc", amt: 60000, date: `${addM(ymQ, -9)}-06`, funds: [{ loan: "hy", amt: 60000 }] }),
    Z({ prop: "p1", cat: "inst", amt: 250000, date: `${addM(ymQ, -7)}-06`, funds: [{ loan: "hl", amt: 250000 }] }),
    Z({ prop: "p2", cat: "token", amt: 200000, date: `${addM(ymQ, -2)}-01`, loanId: "pl", loanAmt: 50000 }),
    Z({ prop: "p2", cat: "inst", amt: 900000, date: `${addM(ymQ, 2)}-01` }),
  ];
  const PP = [
    { id: "propcats", rec: "cats", custom: [{ k: "mycat", g: "setup", name: "Curtains" }], hide: ["dg"], names: { token: "Booking amount" }, updatedAt: 1 },
    { id: "p1", name: "Flat", status: "possession", since: `${addM(ymQ, -14)}-01`, value: 5200000, cur: 6100000, curDate: `${addM(ymQ, -2)}-01`, nw: true, loanId: "hl",
      stmt: { asOf: `${addM(ymQ, -5)}-30`, through: addM(ymQ, -6), int: 210000.5, pemi: 18000.25, prin: 95000, out: 3700000 }, updatedAt: 1 },
    { id: "p2", name: "Plot", status: "booked", since: `${addM(ymQ, -2)}-01`, value: 2800000, nw: false, fund: { by: addM(ymQ, 8), ltv: 70, start: 25000 }, updatedAt: 1,
      plan: [
        { id: "a", name: "Agreement", amt: 312345, gst: 15617.25, when: `${addM(ymQ, 1)}-10`, who: "you", tds: true, paidOn: `${addM(ymQ, -1)}-12` },
        { id: "b", name: "Slab 1", amt: 500000, gst: 25000, when: `${addM(ymQ, 3)}-01`, who: "split", youAmt: 125000, bankAmt: 400000 },
        { id: "c", name: "Slab 2", amt: 500000, gst: 25000, when: addM(ymQ, 5), who: "bank" },
        { id: "d", name: "Registration", amt: 140000, gst: 0, when: "", who: "you", tds: false },
        { id: "e", name: "Paid", amt: 10000, gst: 0, when: `${ymQ}-01`, who: "you", done: true },
        { id: "f", name: "Bank only", amt: 400000, gst: 0, when: `${addM(ymQ, 4)}-15`, who: "bank", tds: true, paidOn: `${ymQ}-02`, tdsDone: true },
      ] },
    { id: "p3", name: "Land", status: "registered", since: `${addM(ymQ, 6)}-01`, value: 0, nw: true, updatedAt: 1 },
  ];
  const RR = (id, x) => ({ id, name: id, updatedAt: 1, type: "expense", amount: 1000, start: ymQ, day: 10, accountId: "mb", ...x });
  const PR = [
    RR("insurance", { freq: "yearly", amount: 42000, start: addM(ymQ, 3), day: 15 }),
    RR("car-ins", { freq: "yearly", amount: 18500.5, start: addM(ymQ, -11), day: 3 }),
    RR("school", { freq: "quarterly", amount: 60000, start: addM(ymQ, -1), day: 5 }),
    RR("paid-now", { freq: "halfyearly", amount: 9000, start: ymQ, day: 1 }),
    RR("rent", { freq: "monthly", amount: 45000, day: 1 }),
    RR("salary", { type: "income", freq: "monthly", amount: 210000, day: 28 }),
    RR("sip", { type: "investment", invType: "Mutual Fund", freq: "monthly", amount: 25000, day: 7, accountId: "mb" }),
    RR("groceries", { freq: "monthly", budget: true, amount: 15000 }),
  ];
  PT.push(
    Z({ type: "transfer", amount: 30000, date: `${addM(ymQ, -2)}-05`, accountId: "mb", toAccountId: "rb", pot: "reserve" }),
    Z({ type: "transfer", amount: 12000, date: `${ymQ}-03`, accountId: "mb", toAccountId: "rb", pot: "reserve" }),
    Z({ type: "expense", amount: 18500.5, date: `${addM(ymQ, -1)}-03`, accountId: "rb", pot: "reserve" }),
    Z({ type: "expense", amount: 9000, date: `${ymQ}-01`, accountId: "mb", link: `r:paid-now|${ymQ}` }),
    Z({ type: "expense", amount: 6200, date: `${addM(ymQ, -3)}-14`, accountId: "mb", categoryId: (real.categories.find((c) => !c.deleted && c.kind === "expense") || {}).id }),
    Z({ type: "investment", amount: 25000, date: `${addM(ymQ, -1)}-07`, accountId: "mb", charges: 1.25, instrument: "Index fund" }),
    Z({ type: "income", amount: 210000, date: `${addM(ymQ, -1)}-28`, accountId: "mb" }),
  );
  // a high minimum on the main account: it can't spare the full set-aside this month, so the ask is capped
  Pa[0].reserveStart = 20000; Pa[0].emTarget = 0; Pa[1].minBal = 70000;
  S.data = { ...real, accounts: Pa, loans: PL, txns: PT, props: PP, propItems: PI, recurring: PR, settings: [{ id: "app", emMonths: 9 }] };
  MEMO = new Map();
  const dQ = N.dataFrom(S.data, T);
  const propSynth = compareProps(dQ, "made-up");
  const resSynth = compareReserve(dQ, "made-up");
  compareInvest(dQ, "made-up (property set)");
  S.data = real;
  MEMO = new Map();
  // Made-up investments: every kind of holding.
  const ymI = ymOf(T), dI = (k, dd) => `${addM(ymI, k)}-${String(dd).padStart(2, "0")}`;
  const fyNowI = (() => { const m = +ymI.slice(5); const y = +ymI.slice(0, 4); return m >= 4 ? y : y - 1; })();
  const H = (id, x) => ({ id, name: id, instrument: id, updatedAt: 1, ...x });
  const epfRow = (k, wm, d, emp, er, eps, extra) => ({ k, wm, d, wage: 30000, epsw: 15000, emp, er, eps, ...extra });
  const IH = [
    H("Axis Bluechip", { type: "Mutual Fund", openInvested: 100000, openUnits: 2000.5, price: 61.2345, priceDate: dI(0, 1), unitsAsOf: dI(-2, 1) }),
    H("Infosys", { type: "Stock", openInvested: 150000, openUnits: 100, price: 1834.55, priceDate: dI(-1, 28) }),
    H("Apple", { type: "US Stocks", ccy: "USD", openInvested: 210000, openUnits: 12.345, price: 187.42, fx: 83.4567, priceDate: dI(-1, 27) }),
    H("Nvidia", { type: "US Stocks", ccy: "USD", openInvested: 50000, openUnits: 3, price: 450.1, priceDate: dI(-1, 27) }),
    H("SGB", { type: "Gold", openInvested: 60000, openUnits: 10, price: 6900.25 }),
    H("FD", { type: "Fixed Deposit", value: 250000.75, valueDate: dI(-3, 10), openInvested: 200000, history: [{ date: dI(-12, 1), value: 210000 }] }),
    H("Old fund", { type: "Mutual Fund", openUnits: 5, price: 10, excludeNW: true }),
    H("NPS", { type: "NPS", npsMode: "units", unitsAsOf: dI(-2, 15), yearly: 50000,
      npsLines: [{ k: "E", units: 3456.789, price: 45.6789, priceDate: dI(-1, 20) }, { nm: "Scheme C - Tier I", units: 1200.1, price: 38.12, priceDate: dI(-1, 18) }, { nm: "Scheme G Tier I", units: 900, price: 29.5 }],
      nps: { alloc: { E: 75, C: 10, G: 15 }, retireAge: 60, dob: "1990-06-15", contrib: 300000, charges: 1234.5, stmtDate: dI(-2, 15) } }),
    H("PPF", { type: "PPF", rate: 7.1, yearly: 150000, ppf: { opened: `${fyNowI - 8}-05-10`, stmtDate: dI(-2, 25),
      rows: [{ k: "dep", d: `${fyNowI - 8}-05-10`, amt: 150000 }, { k: "int", d: `${fyNowI - 7}-03-31`, amt: 9876.5 }, { k: "dep", d: `${fyNowI - 2}-04-04`, amt: 150000 },
        { k: "wd", d: `${fyNowI - 1}-06-15`, amt: 40000 }, { k: "dep", d: dI(-3, 3), amt: 12500 }, { k: "dep", d: dI(-2, 7), amt: 12500 }],
      manual: [{ id: "m1", k: "dep", d: dI(-1, 4), amt: 12500 }, { id: "m2", k: "dep", d: dI(-4, 4), amt: 99 }] } }),
    H("EPF", { type: "EPF", epf: { rate: 8.25, raise: 5, retireAge: 58, dob: "1988-02-20",
      books: {
        OLD123: { est: "Old employer", fys: {
          [fyNowI - 3]: { ob: [100000, 80000, 30000], int: [8000, 6400, 0], close: [108000 + 3600, 86400 + 1100, 30000 + 1250], rows: [epfRow("cont", `${fyNowI - 3}-05`, `${fyNowI - 3}-06-15`, 3600, 1100, 1250)] },
          [fyNowI - 2]: { ob: [111600, 87500, 31250], int: [0, 0, 0], rows: [epfRow("dr", null, `${fyNowI - 2}-08-01`, 111600, 87500, 0)] } } },
        // Moved out with a small gap (within ₹10) and with a big gap (a withdrawal, not the transfer).
        OLD2: { est: "Second job", fys: { [fyNowI - 2]: { ob: [200, 100, 0], rows: [epfRow("dr", null, `${fyNowI - 2}-07-01`, 200, 100, 0)] } } },
        OLD3: { est: "Third job", fys: { [fyNowI - 2]: { ob: [40000, 10000, 0], rows: [epfRow("dr", null, `${fyNowI - 2}-07-02`, 40000, 10000, 0)] } } },
        NEW456: { est: "New employer", fys: {
          [fyNowI - 2]: { ob: [0, 0, 0], int: [9100, 7000, 0], rows: [epfRow("tin", null, `${fyNowI - 2}-09-01`, 111600, 87500, 0, { from: "OLD123" }), epfRow("tin", null, `${fyNowI - 2}-09-02`, 195, 97, 0, { from: "OLD2" }), epfRow("tin", null, `${fyNowI - 2}-09-03`, 30000, 5000, 0, { from: "OLD3" }), epfRow("cont", `${fyNowI - 2}-09`, `${fyNowI - 2}-10-15`, 3600, 1100, 1250)] },
          [fyNowI - 1]: { ob: [124300, 95600, 0], int: [10500, 8200, 0], rows: [epfRow("cont", `${fyNowI - 1}-04`, `${fyNowI - 1}-05-15`, 3800, 1150, 1250), epfRow("ipr", null, `${fyNowI - 1}-04-01`, 0, 0, 0)] },
          [fyNowI]: { ob: [138600, 104950, 0], rows: [epfRow("cont", `${addM(ymI, -3)}`, `${addM(ymI, -2)}-15`, 3800, 1150, 1250)] } } } },
      manual: [{ id: "x1", k: "cont", wm: addM(ymI, -2), d: `${addM(ymI, -1)}-15`, emp: 3800, er: 1150, eps: 1250, epsw: 15000 }, { id: "x2", k: "wd", d: dI(-1, 20), emp: 5000, er: 0, eps: 0 }, { id: "x3", k: "int", fy: fyNowI - 2, emp: 1, er: 1 }] } }),
    // Third year of PPF (loan window), a deposit on the 5th this year; EPF with no pension wage given.
    H("PPF young", { type: "PPF", rate: 7.1, ppf: { opened: `${fyNowI - 2}-06-01`, stmtDate: dI(-1, 28),
      rows: [{ k: "dep", d: `${fyNowI - 2}-06-01`, amt: 50000 }, { k: "dep", d: `${fyNowI - 1}-04-05`, amt: 50000 }, { k: "dep", d: dI(-1, 5), amt: 20000 }, { k: "dep", d: dI(-1, 6), amt: 1000 }] } }),
    H("EPF no wage", { type: "EPF", epf: { rate: 8.25, retireAge: 58, dob: "1975-01-10", books: { ABC9: { est: "Long job", fys: {
      [fyNowI - 1]: { ob: [900000, 700000, 400000], rows: [{ k: "cont", wm: `${fyNowI - 1}-04`, d: `${fyNowI - 1}-05-15`, wage: 0, epsw: 0, emp: 1800, er: 550, eps: 1250 }] } } } } } }),
    H("NPS Tier II", { type: "NPS", npsMode: "units", npsLines: [{ k: "E", units: 100, price: 40 }], nps: { dob: "1985-03-03" } }),
    H("EPF simple", { type: "EPF", value: 500000, rate: 8.1, epfEmp: 3600, epfEr: 1100, joined: addM(ymI, -30) }),
    H("PPF simple", { type: "PPF", value: 300000, rate: 7.1, yearly: 100000, opened: `${fyNowI - 9}-07-01` }),
  ];
  let n5 = 0; const W = (x) => ({ id: `w${++n5}`, updatedAt: n5, accountId: "pb", ...x });
  const IT = [
    W({ type: "investment", instrument: "Axis Bluechip", amount: 5000, units: 81.2, date: dI(-1, 7) }),
    W({ type: "investment", instrument: "Axis Bluechip", amount: 5000.25, charges: 0.25, date: dI(0, 7) }),
    W({ type: "investment", instrument: "Apple", amount: 16000, units: 1, date: dI(-1, 3) }),
    W({ type: "investment", instrument: "NPS", amount: 4166.67, date: dI(-1, 25) }),
    W({ type: "investment", instrument: "NPS", amount: 10000, date: dI(-3, 1) }),
    W({ type: "investment", instrument: "PPF", amount: 12500, date: dI(0, 3) }),
    W({ type: "investment", instrument: "FD", amount: 1000, date: dI(-13, 1) }),
    W({ type: "investment", instrument: "Infosys", amount: 9000, units: 5, date: dI(-2, 2), hist: true }),
    W({ type: "investment", instrument: "Unknown", amount: 700, date: dI(-2, 2), invType: "PPF" }),
  ];
  const IR = [{ id: "nps2-sip", name: "NPS Tier II SIP", type: "investment", instrument: "NPS Tier II", invType: "NPS", amount: 9000, freq: "quarterly", start: addM(ymI, -9), day: 10, accountId: "pb", updatedAt: 1 }, { id: "nps-sip", name: "NPS SIP", type: "investment", instrument: "NPS", invType: "NPS", amount: 4166.67, freq: "monthly", start: addM(ymI, -6), day: 25, accountId: "pb", updatedAt: 1 }];
  S.data = { ...real, holdings: IH, txns: IT, recurring: IR, accounts: [{ id: "pb", name: "HDFC", type: "bank", opening: 400000, updatedAt: 1 }], loans: [], props: [], propItems: [] };
  MEMO = new Map();
  const invSynth = compareInvest(N.dataFrom(S.data, T), "made-up");
  S.data = real;
  MEMO = new Map();
  return { checked, diffs: out, loans: realRes, synth, accReal, accSynth, planReal, planSynth, fcReal, fcSynth, propReal, propSynth, resReal, resSynth, invReal, invSynth };

  function compareInvest(d, label) {
    const NV = N.invest, hs = S.data.holdings.filter((h) => !h.deleted);
    const num = (a, b, w) => { checked++; const x = a == null ? a : +a, y = b == null ? b : +b; if (x === y) return; if (typeof x === "number" && typeof y === "number" && Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x))) return; out.push(`${w}: old ${x} new ${y}`); };
    for (const h of hs) {
      const nh = d.byId("holdings", h.id), w = `${label} ${h.name || h.instrument}`;
      const a = holdingSum(h), b = NV.holdingSum(d, nh);
      for (const k of ["inv", "value", "gain", "atCost"]) close(a[k], b[k], `${w}: ${k}`);
      for (const k of ["units", "usdValue", "pct"]) num(a[k], b[k], `${w}: ${k}`);
      same([a.byUnits, a.isUsd, a.fxMissing, a.asOf ?? null, a.age ?? null, a.lastBuy], [b.byUnits, b.isUsd, b.fxMissing, b.asOf ?? null, b.age ?? null, b.lastBuy], `${w}: details`);
      if (h.type === "EPF" && h.epf) {
        const e = epfCalc(h), f = NV.epfCalc(d, nh);
        same(!!e, !!f, `${w}: EPF calculated`);
        if (e && f) {
          for (const k of ["epfBal", "epsBal", "contEmp", "contEr", "contEps", "wd", "tinExt", "interest", "invested", "expAmt", "expEps", "value", "inv", "accrued", "corpus", "sal", "pension", "pensionLow", "partial"]) close(e[k], f[k], `${w} EPF: ${k}`);
          same([e.issues, e.lastWm, e.fyNow, e.retYm, e.svcNow, e.svcAt58, e.svcYrs, e.bonus, e.pYrs, e.lastCredit, e.expected.map((r) => r.wm), e.rows.map((r) => [r.k, r.d ?? null]), e.manualOld.length, e.epsLeft.map((a) => a.acc)],
               [f.issues, f.lastWm, f.fyNow, f.retYm, f.svcNow, f.svcAt58, f.svcYrs, f.bonus, f.pYrs, f.lastCredit, f.expected.map((r) => r.wm), f.rows.map((r) => [r.k, r.d ?? null]), f.manualOld.length, f.epsLeft.map((a) => a.acc)], `${w} EPF: details`);
          e.proj.forEach((p, i) => { const q = f.proj[i]; if (q) { same(p[0], q[0], `${w} EPF projection ${i}: date`); close(p[1], q[1], `${w} EPF projection ${p[0]}`); } });
          same(e.proj.length, f.proj.length, `${w} EPF: projection length`);
          for (const [fy, v] of e.fyEnd) close(v, f.fyEnd.get(fy), `${w} EPF: FY ${fy} end`);
        }
      }
      if (h.type === "PPF" && h.ppf) {
        const p = ppfCalc(h), q = NV.ppfCalc(d, nh);
        for (const k of ["bal", "dep", "int", "wd", "inv", "accrued", "fyDepNow", "yearly", "mv", "wdMax", "loanMax"]) close(p[k], q[k], `${w} PPF: ${k}`);
        same([p.fy0, p.fyNow, p.idx, p.matures, p.wdOk, p.loanOk, p.rows.map((r) => [r.k, r.d, r.src]), p.proj.length], [q.fy0, q.fyNow, q.idx, q.matures, q.wdOk, q.loanOk, q.rows.map((r) => [r.k, r.d, r.src]), q.proj.length], `${w} PPF: details`);
        p.proj.forEach((x, i) => q.proj[i] && close(x[1], q.proj[i][1], `${w} PPF projection ${x[0]}`));
        for (const [fy, v] of p.fyEnd) close(v, q.fyEnd.get(fy), `${w} PPF: FY ${fy} end`);
      }
      if (h.type === "NPS") {
        const p = npsCalc(h), q = NV.npsCalc(d, nh);
        for (const k of ["yearly", "corpus", "lump", "annuity", "pension", "fyIn"]) close(p[k], q[k], `${w} NPS: ${k}`);
        num(p.ret, q.ret, `${w} NPS: return`);
        same([p.dob, p.at, p.retYm, p.unitsAsOf, p.lines.map((l) => l.key), p.entries.map((t) => t.id), p.proj.length], [q.dob, q.at, q.retYm, q.unitsAsOf, q.lines.map((l) => l.key), q.entries.map((t) => t.id), q.proj.length], `${w} NPS: details`);
        p.lines.forEach((l, i) => { if (q.lines[i]) { close(l.value, q.lines[i].value, `${w} NPS ${l.key}: value`); num(l.pct, q.lines[i].pct, `${w} NPS ${l.key}: share`); } });
        p.proj.forEach((x, i) => q.proj[i] && close(x[1], q.proj[i][1], `${w} NPS projection ${x[0]}`));
      }
      if (h.type === "EPF" && !(h.epf && h.epf.books)) { const p = epfInfo(h, a), q = NV.epfInfo(d, nh, b); for (const k of ["mon", "bal", "wd", "int", "p5", "p10"]) close(p[k], q[k], `${w} EPF info: ${k}`); same([p.svc, p.can], [q.svc, q.can], `${w} EPF info: service`); }
      if (h.type === "PPF" && !h.ppf) { const p = ppfInfo(h, a), q = NV.ppfInfo(d, nh, b); for (const k of ["bal", "w", "ln", "mv"]) close(p[k], q[k], `${w} PPF info: ${k}`); same([p.fy0 ?? null, p.idx ?? null, p.matures ?? null, p.yrsLeft ?? null, p.wdOk ?? null, p.loanOk ?? null, p.haveDeps ?? null], [q.fy0 ?? null, q.idx ?? null, q.matures ?? null, q.yrsLeft ?? null, q.wdOk ?? null, q.loanOk ?? null, q.haveDeps ?? null], `${w} PPF info: details`); }
    }
    for (const t of S.data.txns.filter((x) => !x.deleted && x.type === "investment").slice(0, 400)) same(invTypeOf(t), NV.invTypeOf(d, d.byId("txns", t.id)), `${label} ${t.id}: investment type`);
    const a = netWorth(), b = NV.netWorth(d);
    for (const k of ["banks", "mainEnd", "otherBanks", "sipPend", "inv", "invested", "excluded", "prop", "propOff", "cards", "loans", "total"]) close(a[k], b[k], `${label} net worth: ${k}`);
    same(a.mainAcc?.id ?? null, b.mainAcc?.id ?? null, `${label} net worth: main account`);
    return hs.length;
  }

  function compareReserve(d, label) {
    const NI = N.insights, NR = N.reserve, map = (m, scale) => Object.fromEntries([...m.entries()].map(([k, v]) => [k, scale ? v / 100 : v]));
    const cmpMap = (a, b, what) => { for (const k of new Set([...a.keys(), ...b.keys()])) close(a.get(k) ?? 0, b.get(k) ?? 0, `${what} ${k}`); };
    let n = 0;
    for (let k = -24; k <= 12; k++) {
      const ym = addM(ymOf(T), k), a = monthFigures(ym), b = NI.monthFigures(d, ym); n++;
      for (const f of ["income", "expense", "investment", "setAside", "balance"]) close(a[f], b[f], `${label} ${ym}: ${f}`);
      same(a.kind, b.kind, `${label} ${ym}: kind`);
      cmpMap(a.byCat, b.byCat, `${label} ${ym}: spending in`); cmpMap(a.byInc, b.byInc, `${label} ${ym}: income in`); cmpMap(a.byInv, b.byInv, `${label} ${ym}: investing in`);
      for (const top of new Set([...a.sub.keys(), ...b.sub.keys()])) cmpMap(a.sub.get(top) ?? new Map(), b.sub.get(top) ?? new Map(), `${label} ${ym}: ${top} ›`);
      close(setAsideOf(ym), NR.setAsideOf(d, ym), `${label} ${ym}: set aside`);
    }
    cmpMap(spendByCat(), NI.spendByCat(d), `${label}: 12-month average for`);
    same([...emExcluded()].sort(), [...NI.emExcluded(d)].sort(), `${label}: left out of the emergency fund`);
    close(emBase(), NI.emBase(d), `${label}: emergency base`); same(emMonths(), NI.emMonths(d), `${label}: emergency months`); close(retireBase(), NI.retireBase(d), `${label}: retirement base`);
    same(payTue(), NR.payTue(d), `${label}: payment Tuesday`);
    const bb = bigBills(), nb = NR.bigBills(d);
    same(bb.map((x) => [x.r.id, x.next, x.left, x.months, x.step]), nb.map((x) => [x.r.id, x.next, x.left, x.months, x.step]), `${label}: big bills`);
    close(reserveHeld(), NR.reserveHeld(d), `${label}: reserve held`);
    const rs = reserveState(), ns = NR.reserveState(d);
    for (const f of ["held", "target", "monthly", "thisIn", "setAside", "setAsideFull", "avg", "emSuggest", "emTarget", "emergency", "bal"]) close(rs[f], ns[f], `${label} reserve: ${f}`);
    same([rs.capped, rs.doneThis, rs.spareFrom?.id ?? null, rs.a?.id ?? null], [ns.capped, ns.doneThis, ns.spareFrom?.id ?? null, ns.a?.id ?? null], `${label} reserve: flags`);
    rs.B.forEach((x, i) => { const y = ns.B[i]; if (y) { close(x.have, y.have, `${label} big bill ${x.r.id}: have`); close(x.ask, y.ask, `${label} big bill ${x.r.id}: ask`); } });
    rs.funds.forEach((f, i) => { const g = ns.funds[i]; if (g) for (const k of ["need", "have", "monthly"]) close(f[k], g[k], `${label} fund ${f.p.id}: ${k}`); });
    for (const days of [45, 60]) {
      const ob = obligations(days), nob = NR.obligations(d, days);
      same(ob.map((o) => [o.key, o.date, o.anyDay, !!o.auto, !!o.budget, !!o.big, o.acc]), nob.map((o) => [o.key, o.date, o.anyDay, !!o.auto, !!o.budget, !!o.big, o.acc]), `${label}: obligations ${days} days`);
      ob.forEach((o, i) => nob[i] && close(o.amount, nob[i].amount, `${label} obligation ${o.key}: amount`));
    }
    const ra = readiness(45), rb = NR.readiness(d, 45);
    same(ra.map((s) => [s.acc.id, s.date, s.item.key, s.from?.id ?? null, s.by]), rb.map((s) => [s.acc.id, s.date, s.item.key, s.from?.id ?? null, s.by]), `${label}: dips below minimum`);
    ra.forEach((s, i) => { if (rb[i]) { close(s.need, rb[i].need, `${label} dip ${s.acc.id} ${s.date}: need`); close(s.bal, rb[i].bal, `${label} dip ${s.acc.id} ${s.date}: balance`); } });
    same(ra.lows.map((x) => [x.acc.id, x.lowD]), rb.lows.map((x) => [x.acc.id, x.lowD]), `${label}: lowest points`);
    ra.lows.forEach((x, i) => { if (rb.lows[i]) { close(x.low, rb.lows[i].low, `${label} ${x.acc.id}: lowest`); close(x.min, rb.lows[i].min, `${label} ${x.acc.id}: minimum`); } });
    return n;
  }

  function compareProps(d, label) {
    const NP = N.props, list = propList(), nlist = NP.propList(d);
    same(list.map((p) => p.id), nlist.map((p) => p.id), `${label}: properties`);
    same(propCats().map((c) => [c.k, c.g, c.name, c.f, c.hidden]), NP.propCats(d).map((c) => [c.k, c.g, c.name, c.f, c.hidden]), `${label}: property categories`);
    const nums = (o, n, what, keys) => { for (const k of keys) close(o[k], n[k], `${what}: ${k}`); };
    for (const p of list) {
      const np = d.byId("props", p.id), w = `${label} ${p.name}`;
      const oi = propItems(p), ni = NP.propItems(d, np);
      same(oi.map((i) => [i.id, i.date, !!i.gone, i.fund ?? "", (i.funds || []).map((f) => [f.loan, f.part])]), ni.map((i) => [i.id, i.date, !!i.gone, i.fund ?? "", (i.funds || []).map((f) => [f.loan, f.part])]), `${w}: items`);
      oi.forEach((x, i) => { const y = ni[i]; if (!y) return; close(x.amt, y.amt, `${w} item ${x.id}: amount`); close(x.fundAmt ?? 0, y.fundAmt ?? 0, `${w} item ${x.id}: loan-paid`); (x.funds || []).forEach((f, j) => y.funds[j] && close(f.amt, y.funds[j].amt, `${w} item ${x.id}: fund ${j}`)); });
      const I = propInt(p), J = NP.propInt(d, np);
      nums(I, J, `${w} interest`, ["stInt", "estInt", "estPrin", "prepay", "toCome", "out"]);
      same([I.est.map((r) => r.date), I.next && I.next.date], [J.est.map((r) => r.date), J.next && J.next.date], `${w} interest: dates`);
      const c = propCalc(p), e = NP.propCalc(d, np);
      nums(c, e, `${w} totals`, ["cost", "interest", "withInt", "sep", "off", "bankPaid", "loanPaid", "lInt", "lPaid", "mine", "price", "own", "prin", "prinFunded", "owed", "owedBank", "owedFam", "paidBank", "paidFam", "toCome", "everything"]);
      for (const k of new Set([...Object.keys(c.by), ...Object.keys(e.by)])) close(c.by[k] ?? 0, e.by[k] ?? 0, `${w} by category ${k}`);
      for (const k of new Set([...Object.keys(c.grp), ...Object.keys(e.grp)])) close(c.grp[k] ?? 0, e.grp[k] ?? 0, `${w} by group ${k}`);
      same(c.loans.map((o) => o.l.id), e.loans.map((o) => o.l.id), `${w}: loans used`);
      c.loans.forEach((o, i) => { const q = e.loans[i]; if (!q) return; nums(o, q, `${w} loan ${o.l.id}`, ["amt", "prep", "int", "paid", "owed", "come"]);
        for (const k of ["share", "iShare"]) { checked++; if (Math.abs(o[k] - q[k]) > 1e-9) out.push(`${w} loan ${o.l.id}: ${k} ${o[k]} vs ${q[k]}`); } });
      same(c.owedBy.map((x) => [x.name, x.bank]), e.owedBy.map((x) => [x.name, x.bank]), `${w}: owed to`);
      for (let k = -18; k <= 8; k += 2) { const at = `${addM(ymOf(T), k)}-15`; close(propNwAt(p, at), NP.propNwAt(d, np, at), `${w}: net worth value at ${at}`); }
      close(propNwAt({ ...p, nw: true }), NP.propNwAt(d, { ...np, nw: true }), `${w}: value if counted`);
      close(propFundNeed(p), NP.propFundNeed(d, np), `${w}: still needed`);
      close(propFundHeld(p), NP.propFundHeld(d, np), `${w}: fund held`);
      const pd = propPlanDue(p), nd = NP.propPlanDue(d, np);
      same(pd.map((x) => [x.key, x.date, x.big, x.acc, !!x.tds]), nd.map((x) => [x.key, x.date, x.big, x.acc, !!x.tds]), `${w}: plan dues`);
      pd.forEach((x, i) => nd[i] && close(x.amount, nd[i].amount, `${w} ${x.key}: amount`));
    }
    const a = propNw(), b = NP.propNw(d); close(a.on, b.on, `${label}: property net worth`); close(a.off, b.off, `${label}: properties left out`);
    same(reserveAcc()?.id ?? null, NP.reserveAcc(d)?.id ?? null, `${label}: reserve account`);
    return list.length;
  }

  function compareForecast(d, label) {
    const NF = N.forecast;
    same(mainAcc()?.id ?? null, NF.mainAcc(d)?.id ?? null, `${label}: main account`);
    const o = forecast(36), n = NF.forecast(d, 36);
    close(o.start, n.start, `${label} forecast: starting balance`);
    o.months.forEach((m, i) => { const q = n.months[i]; if (!q) return;
      for (const k of ["inc", "out", "inv", "emi", "net", "bal"]) close(m[k], q[k], `${label} forecast ${m.ym}: ${k}`);
      same(m.rows.map((r) => [r.key, r.paid, r.missed]), q.rows.map((r) => [r.key, r.paid, r.missed]), `${label} forecast ${m.ym}: rows`);
      same(m.ending.map((r) => r.key), q.ending.map((r) => r.key), `${label} forecast ${m.ym}: ending`);
    });
    // Carry-overs: run the planner's own ensureCarry on a copy and compare what it adds with what the new code would make.
    const keep = S.data;
    S.data = JSON.parse(JSON.stringify(keep)); MEMO = new Map();
    const before = new Set(S.data.txns.map((t) => t.id));
    const ids = new Set(keep.txns.map((t) => t.id));
    try { (window.__plannerAuto?.ensureCarry ?? ensureCarry)(); } catch (e) { out.push(`${label}: ensureCarry threw ${e.message}`); }
    const made = S.data.txns.filter((t) => !before.has(t.id));
    S.data = keep; MEMO = new Map();
    const want = NF.carriesToMake(d, ids);
    same(made.map((t) => [t.id, t.dir, t.date, t.ym, t.accountId]), want.map((t) => [t.id, t.dir, t.date, t.ym, t.accountId]), `${label}: carry-overs to make`);
    made.forEach((t, i) => { if (want[i]) { close(t.carry, want[i].carry, `${label} ${t.id}: carry`); close(t.amount, want[i].amount, `${label} ${t.id}: amount`); } });
    return made.length;
  }

  function comparePlan(d, label) {
    const NP = N.plan, months = [];
    for (let k = -3; k <= 24; k++) months.push(addM(ymOf(T), k));
    const MONEY = ["amount", "budget", "spent", "chg"];
    const norm = (it, scale) => { const o = {}; for (const [k, v] of Object.entries(it)) { if (k === "plan" || k === "l") continue; o[k] = MONEY.includes(k) ? (v == null ? v : Math.round((scale ? v / 100 : v) * 1e6) / 1e6) : v ?? null; } return o; };
    const cmpItems = (a, b, what) => {
      same(a.length, b.length, `${what}: count`);
      a.forEach((x, i) => { const y = b[i]; if (!y) return; const A = norm(x, false), B = norm(y, true);
        for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
          if (MONEY.includes(k)) close(x[k], y[k], `${what} ${x.key}: ${k}`);
          else same(A[k] ?? null, B[k] ?? null, `${what} ${x.key}: ${k}`);
        } });
    };
    let items = 0;
    for (const ym of months) {
      const o = planned(ym), n = NP.planned(d, ym); items += o.length;
      cmpItems(o, n, `${label} planned ${ym}`);
      cmpItems(planFor(ym), NP.planFor(d, ym), `${label} planFor ${ym}`);
      cmpItems(cardBills(ym), NP.cardBills(d, ym), `${label} card bills ${ym}`);
      const cd = cemiDue(ym), nd = NP.cemiDue(d, ym);
      same(cd.length, nd.length, `${label} card EMI due ${ym}: count`);
      cd.forEach((x, i) => { if (nd[i]) { close(x.v, nd[i].v, `${label} card EMI due ${ym} #${i}`); same([x.card, x.cat ?? null], [nd[i].card, nd[i].cat ?? null], `${label} card EMI due ${ym} #${i}: where`); } });
      for (const r of S.data.recurring.filter((x) => !x.deleted)) {
        const nr = d.byId("recurring", r.id);
        same(recurs(r, ym), NP.recurs(nr, ym), `${label} ${r.name}: recurs ${ym}`);
        same(recDay(r, ym), NP.recDay(d, nr, ym), `${label} ${r.name}: day in ${ym}`);
        if (r.budget) close(budgetSpent(r.id, ym), NP.budgetSpent(d, r.id, ym), `${label} ${r.name}: budget spent ${ym}`);
      }
    }
    for (const l of S.data.loans.filter((x) => !x.deleted)) {
      const nl = d.byId("loans", l.id);
      const a = famPlan(l), b = NP.famPlan(d, nl);
      same(a.map((x) => [x.ym, x.key]), b.map((x) => [x.ym, x.key]), `${label} ${l.name}: repayment plan`);
      a.forEach((x, i) => b[i] && close(x.amount, b[i].amount, `${label} ${l.name}: repayment ${x.key}`));
      if (kindOf(l) === "cardemi") {
        const p = cemiParts(l), q = NP.cemiParts(d, nl);
        same(p.map((x) => [x.ym, x.stmt, x.k, x.n]), q.map((x) => [x.ym, x.stmt, x.k, x.n]), `${label} ${l.name}: card EMI statements`);
        p.forEach((x, i) => { if (q[i]) for (const k of ["prin", "intg", "fee"]) close(x[k], q[i][k], `${label} ${l.name} ${x.ym}: ${k}`); });
      }
    }
    for (const c of S.data.categories.filter((x) => !x.deleted)) same(catName(c.id), NP.catName(d, c.id), `${label} category name ${c.id}`);
    for (const a of S.data.accounts) same(accName(a.id), NP.accName(d, a.id), `${label} account name ${a.id}`);
    for (const amt of [0, 1, 99.99, 1000, 2499.5, 10000, 123456.78]) close(stampDuty(amt), NP.stampDuty(Math.round(amt * 100)), `stamp duty on ${amt}`);
    for (const dd of months.flatMap((m) => [`${m}-01`, `${m}-07`, `${m}-14`, `${m}-24`, `${m}-26`])) { same(isTradingDay(dd), NP.isTradingDay(d, dd), `${label} trading day ${dd}`); same(nextTrading(dd), NP.nextTrading(d, dd), `${label} next trading ${dd}`); }
    return items;
  }

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
console.log(`calc parity on ${EXPORT.includes("sample") ? "the sample" : "the real export"}: ${report.checked} comparisons · loans: ${report.loans} yours + ${report.synth} made-up · accounts: ${report.accReal} yours + ${report.accSynth} made-up · plan items over 28 months: ${report.planReal} yours + ${report.planSynth} made-up · carry-overs to make: ${report.fcReal} yours, ${report.fcSynth} made-up · properties: ${report.propReal} yours + ${report.propSynth} made-up · month figures: ${report.resReal} months · holdings: ${report.invReal} yours + ${report.invSynth} made-up`);
if (report.diffs.length) { console.error(`✗ ${report.diffs.length} differences:\n  ${report.diffs.slice(0, Number(process.env.SHOW || 30)).join("\n  ")}`); process.exit(1); }
console.log("✓ dates, loans, balances, month totals, card cycles, bills, plan items, carry-overs, the 36-month forecast, properties, month figures, the emergency fund, the reserve, readiness, investments and net worth match the planner exactly");
