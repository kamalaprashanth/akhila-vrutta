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
  const planReal = comparePlan(d, "yours");
  const fcReal = compareForecast(d, "yours");

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
  const fcSynth = compareForecast(dP, "made-up");
  S.data = real;
  MEMO = new Map();
  return { checked, diffs: out, loans: realRes, synth, accReal, accSynth, planReal, planSynth, fcReal, fcSynth };

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
    try { ensureCarry(); } catch (e) { out.push(`${label}: ensureCarry threw ${e.message}`); }
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
console.log(`calc parity on ${EXPORT.includes("sample") ? "the sample" : "the real export"}: ${report.checked} comparisons · loans: ${report.loans} yours + ${report.synth} made-up · accounts: ${report.accReal} yours + ${report.accSynth} made-up · plan items over 28 months: ${report.planReal} yours + ${report.planSynth} made-up · carry-overs to make: ${report.fcReal} yours, ${report.fcSynth} made-up`);
if (report.diffs.length) { console.error(`✗ ${report.diffs.length} differences:\n  ${report.diffs.slice(0, 30).join("\n  ")}`); process.exit(1); }
console.log("✓ dates, loans, balances, month totals, card cycles, bills, plan items, carry-overs and the 36-month forecast match the planner exactly");
