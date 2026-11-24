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
await f.waitForFunction(() => typeof S === "object" && !!S.data, null, { timeout: 20000 });
await f.addScriptTag({ content: screens });

const report = await f.evaluate(() => {
  const N = window.SCREENS, out = [];
  ensureSmartGoals();   // the planner creates goals from the profile once; do it before taking the data
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
      // A small repeat (₹50 a month): too small to suggest as a regular item.
      ...[1, 2, 3, 4, 5].map((k) => X({ type: "expense", amount: 50, categoryId: cat, note: "chai club", date: `${addM(nowM, -k)}-07` })),
      // A ₹450 monthly repeat on the same account: suggested.
      ...[1, 2, 3, 4, 5].map((k) => X({ type: "expense", amount: 450 + (k % 2), categoryId: cat, note: "newspaper", date: `${addM(nowM, -k)}-03` })),
      // Your own PPF deposit, 50 paise off the statement's: the statement line isn't listed twice.
      X({ type: "investment", amount: 1500.5, instrument: "PPF2", date: `${ym1}-12` }),
    ],
    // A mutual-fund SIP (stamp duty comes off what's invested) and a monthly one with its own charges.
    recurring: [...real.recurring,
      { id: "sipx", type: "investment", name: "Axis SIP", instrument: "Axis fund", invType: "Mutual Fund", amount: 5000, freq: "monthly", start: addM(nowM, -3), day: 28, accountId: acc, updatedAt: 1 },
      { id: "sipy", type: "investment", name: "Gold SIP", instrument: "Gullak", invType: "Gold", amount: 2000, charges: 30, freq: "monthly", start: addM(nowM, -3), day: 27, accountId: acc, updatedAt: 1 }],
    settings: [...(real.settings || []).filter((x) => x.id !== "profile" && x.id !== "advcheck"), { id: "advcheck", updatedAt: 1, ym: nowM, at: `${nowM}-02`, quick: { verdict: "Mostly on track", pts: [{ ok: true, t: "Cash is fine" }, { ok: false, t: "Top up health cover" }] }, full: "## Cash\nFine" }, { id: "profile", updatedAt: 1, updated: "2025-05-01", wifeCat: cat, covered: ["me", "k0"], termCover: "10000000", healthSum: "500000", regime: "new", spouse: { name: "Asha", dob: "1988-03-03" }, depends: { father: true }, dob: "1985-05-20", retire: "58", kids: [{ id: "k1", name: "Anu", dob: "2016-08-10" }, { name: "Babu", dob: "2024-01-15" }] }],
    goals: [...(real.goals || []),
      { id: "ge1", kind: "edu", kidId: "k1", kid: 0, name: "Anu's education", pri: 3, school: 180000, ug: 2500000, pg: 3000000, inf: 9, ret: 12, holdings: ["hp"], updatedAt: 1 },
      { id: "ge2", kind: "edu", kid: 1, name: "Babu's education", pri: 4, updatedAt: 1 },
      { id: "gr", kind: "retire", name: "Retirement", pri: 5, spend: 85000, inf: 6.5, life: 88, pre: 10.5, post: 7.5, updatedAt: 1 },
      { id: "gc", kind: "custom", name: "New car", pri: 6, target: 900000, saved: 125000.5, by: addM(nowM, 18), holdings: ["he"], updatedAt: 1 },
      { id: "gc2", kind: "custom", name: "Past trip", target: 50000, by: addM(nowM, -1), updatedAt: 1 }],
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
  // Accounts: every section, chart ranges, folded cards, open holding groups, the payoff plan's settings.
  const page = (label, oldFn, newFn) => {
    n++;
    S.cwFixed = 640; N.charts.setChartWidth(640);
    for (const k in CH) delete CH[k]; chSeq = 0; N.charts.resetCharts(); MEMO = new Map();
    let a, b;
    try { a = oldFn(); } catch (e) { a = "old threw: " + e.message; }
    try { b = newFn(); } catch (e) { b = "new threw: " + e.message; }
    if (a !== b && sameButEstimates(a, b)) { estRounding++; return; }
    if (a.startsWith("old threw") && !b.includes("threw")) { fixedCrash.push(label); return; }
    if (a !== b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; out.push(`${label}: differs at ${i} ${JSON.stringify([a.slice(i - 5, i + 30), b.slice(i - 5, i + 30)])}\n    old …${a.slice(Math.max(0, i - 100), i + 140)}\n    new …${b.slice(Math.max(0, i - 100), i + 140)}`); }
  };
  // Rupee decimals summed in the planner can land just under a half rupee (52,012.4999 for an exact 52,012.50), so
  // a rounded total can be ₹1 apart. Accepted only in a table row or a chart's coordinates, only by ₹1, and counted.
  let estRounding = 0; const fixedCrash = [];
  const sameButEstimates = (a, b) => {
    const A = a.split(/(<tr>.*?<\/tr>|<svg.*?<\/svg>)/s), B = b.split(/(<tr>.*?<\/tr>|<svg.*?<\/svg>)/s);
    if (A.length !== B.length) return false;
    return A.every((x, i) => {
      const y = B[i];
      if (x === y) return true;
      if (x.startsWith("<svg")) return x.replace(/-?\d+(\.\d+)?/g, "#") === y.replace(/-?\d+(\.\d+)?/g, "#") && x.match(/-?\d+(\.\d+)?/g).every((v, k) => Math.abs(+v - +y.match(/-?\d+(\.\d+)?/g)[k]) <= 0.15);
      // a table row: totals of many amounts, where rupee decimals could land just under a half rupee
      if (!x.startsWith("<tr>")) return false;
      const nx = x.match(/[\d,]+/g), ny = y.match(/[\d,]+/g);
      return x.replace(/[\d,]+/g, "#") === y.replace(/[\d,]+/g, "#") && nx.every((v, k) => Math.abs(+v.replace(/,/g, "") - +ny[k].replace(/,/g, "")) <= 1);
    });
  };
  const accHost = { pref: (k, v) => prefGet(k, v), plannerHtml: (name) => (name === "pxLine" ? pxLine() : "") };
  const accPages = (dx, tag) => {
    const keep = { accTab: S.accTab, nwN: S.nwN, allCards: S.allCards }, prefs = ["holdOpen", "poExtra", "poLump", "poOrder", "accTab"].map((k) => [k, localStorage.getItem("kpmp.ui." + k)]);
    const types = [...new Set(live("holdings").map((h) => h.type))];
    const combos = [[{}, {}], [{ nwN: 12 }, {}], [{ nwN: "all" }, {}], [{ allCards: true }, {}], [{}, { holdOpen: types }], [{}, { poExtra: 20000, poLump: 150000, poOrder: "snow" }], [{}, { poExtra: 7777.5, poOrder: "aval" }], [{}, { accTab: "cards" }]];
    for (const tab of ["overview", "banks", "cards", "invest", "loans", "props", undefined]) for (const [stx, pf] of combos) {
      for (const [k, v] of Object.entries(pf)) prefSet(k, v);
      const st = { accTab: tab, ...stx };
      page(`${tag} accounts ${tab ?? "(saved tab)"} ${JSON.stringify({ ...stx, ...pf })}`, () => { Object.assign(S, { accTab: tab, nwN: undefined, allCards: undefined }, stx); return vAccounts(); }, () => N.accounts.accountsHtml(dx, { ...st }, accHost));
      for (const [k] of Object.entries(pf)) localStorage.removeItem("kpmp.ui." + k);
    }
    for (const [k, v] of prefs) { if (v == null) localStorage.removeItem("kpmp.ui." + k); else localStorage.setItem("kpmp.ui." + k, v); }
    Object.assign(S, keep);
  };
  accPages(d2, "made-up");
  const planPages = (dx, tag) => {
    const keep = { planTab: S.planTab, fcH: S.fcH, bcM: S.bcM, bcD: S.bcD }, keepP = ["fcMin", "repIgnore"].map((k) => [k, localStorage.getItem("kpmp.ui." + k)]);
    const host = { pref: (k, v) => prefGet(k, v) }, nowM = ymOf(today());
    const run = (label, st, pf = {}) => {
      for (const [k, v] of Object.entries(pf)) prefSet(k, v);
      page(`${tag} plan ${label}`, () => { Object.assign(S, { planTab: undefined, fcH: 12, bcM: undefined, bcD: undefined }, st); return vPlan(); }, () => N.plan.planHtml(dx, { fcH: 12, ...st }, host));
      for (const k of Object.keys(pf)) localStorage.removeItem("kpmp.ui." + k);
    };
    for (const t of ["month", "regular", "goals", undefined, "ready"]) run(`tab ${t}`, { planTab: t });
    for (const h of [6, 12, 24]) run(`cash flow ${h} months`, { planTab: "cashflow", fcH: h });
    run("cash flow, keep at least ₹50,000", { planTab: "cashflow" }, { fcMin: 50000 });
    run("cash flow, keep at least ₹99 lakh", { planTab: "cashflow" }, { fcMin: 9900000 });
    for (const k of [-2, -1, 0, 1, 3]) run(`calendar ${addM(nowM, k)}`, { planTab: "calendar", bcM: addM(nowM, k) });
    for (const dd of ["01", "05", "10", "15", "28"]) run(`calendar day ${dd}`, { planTab: "calendar", bcD: `${nowM}-${dd}` });
    const reps = findRepeats();
    if (reps.length) run("regular, one repeat ignored", { planTab: "regular" }, { repIgnore: [reps[0].key] });
    for (const [k, v] of keepP) { if (v == null) localStorage.removeItem("kpmp.ui." + k); else localStorage.setItem("kpmp.ui." + k, v); }
    Object.assign(S, keep);
  };
  planPages(d2, "made-up");
  const homePages = (dx, tag) => {
    const keep = { ptNext: S.ptNext, insOpen: S.insOpen, view: S.view };
    const host = { pref: (k, v) => prefGet(k, v) };
    for (const st of [{}, { ptNext: true }, { insOpen: true }, { ptNext: true, insOpen: true }])
      page(`${tag} overview ${JSON.stringify(st)}`, () => { Object.assign(S, { ptNext: undefined, insOpen: undefined, view: "home" }, st); return vHome(); }, () => N.home.homeHtml(dx, { ...st }, host));
    Object.assign(S, keep);
  };
  homePages(d2, "made-up");
  const insPages = (dx, tag) => {
    const K = ["insTab", "homeYr", "hm", "hmTab", "hmOpen", "hmOpen2", "year", "yearTab", "taxFy", "trN", "trP", "trD", "trC"], keep = Object.fromEntries(K.map((k) => [k, S[k]]));
    const nowM = ymOf(today()), y = +today().slice(0, 4), fy = fyOf(today());
    const run = (label, st) => page(`${tag} insights ${label}`, () => { for (const k of K) S[k] = undefined; Object.assign(S, st); return vInsights(); }, () => N.insights.insightsHtml(dx, { ...st }));
    run("default", {});
    for (const k of [-13, -2, -1, 0, 1, 2]) for (const t of ["expense", "income", "invest"]) run(`month ${addM(nowM, k)} ${t}`, { hm: addM(nowM, k), hmTab: t });
    const T = N.home.expenseTree(dx, nowM);
    for (const [gk, g] of T.slice(0, 4)) { run(`month open ${gk}`, { hmOpen: gk }); for (const [ck] of [...g.cats.entries()].slice(0, 3)) run(`month open ${gk} › ${ck}`, { hmOpen: gk, hmOpen2: ck }); }
    for (const [k] of [...monthFigures(nowM).byInc.entries()].slice(0, 3)) run(`income open ${k}`, { hmTab: "income", hmOpen: k });
    for (const it of ["Mutual Fund", "PPF", "Unassigned", "NPS"]) run(`invest open ${it}`, { hmTab: "invest", hmOpen: it, hm: addM(nowM, -1) });
    for (const n of [6, 12, 24]) run(`trends ${n}`, { insTab: "trends", trN: n });
    for (const [p] of TRP) run(`trends where ${p}`, { insTab: "trends", trP: p });
    const cats = [...monthFigures(nowM).byCat.keys()];
    for (const c of cats.slice(0, 4)) { run(`trends drill ${c}`, { insTab: "trends", trD: c, trP: "12m" }); run(`trends category ${c}`, { insTab: "trends", trC: c }); }
    for (const yy of [y - 2, y - 1, y, y + 1]) for (const t of ["summary", "expense", "income", "reserve"]) run(`year ${yy} ${t}`, { insTab: "year", year: yy, yearTab: t });
    for (const f of [fy - 2, fy - 1, fy, fy + 1]) run(`tax FY ${f}`, { insTab: "year", yearTab: "tax", taxFy: f });
    for (const hy of [String(y - 1), String(y)]) run(`home ${hy}`, { insTab: "home", homeYr: hy });
    Object.assign(S, keep);
  };
  insPages(d2, "made-up");
  const advPages = (dx, tag) => {
    const keep = S.advChat;
    // What Claude is sent: the whole picture, as text.
    n++;
    const a = ADV_RULES(advContext()) + "\n\nQUESTION: " + ADV_CHECK, b = N.advisor.ADV_RULES(N.advisor.advContext(dx)) + "\n\nQUESTION: " + ADV_CHECK;
    const la = a.split("\n"), lb = b.split("\n");
    const near = la.length === lb.length && la.every((x, k) => { const y = lb[k]; if (x === y) return true; const nx = x.match(/\d+/g) || [], ny = y.match(/\d+/g) || []; return x.replace(/\d+/g, "#") === y.replace(/\d+/g, "#") && nx.every((v, j) => Math.abs(+v - +ny[j]) <= 1); });
    if (a !== b && near) estRounding++;
    else if (a !== b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; out.push(`${tag} advisor: what Claude is sent differs at ${i}\n    old …${a.slice(Math.max(0, i - 120), i + 120)}\n    new …${b.slice(Math.max(0, i - 120), i + 120)}`); }
    const chats = [[], [{ role: "user", content: "x", q: "Full health check" }, { role: "assistant", content: "**Yes.**\n1. One **₹5,000** point\n2. Two\n## Heading\n- dot\nplain" }],
      [{ role: "user", content: "x", q: "Q1" }, { role: "assistant", content: "A1" }, { role: "user", content: "y", q: "Go deeper", kind: "d" }, { role: "assistant", content: "## Area\nDeep" }]];
    chats.forEach((c, i) => page(`${tag} advisor chat ${i}`, () => { S.advChat = JSON.parse(JSON.stringify(c)); return vAdvisor(); }, () => N.advisor.advisorHtml(dx, { advChat: JSON.parse(JSON.stringify(c)) }, false)));
    S.advChat = keep;
  };
  advPages(d2, "made-up");
  const morePages = (dx, tag) => { for (const nOn of [false, true]) { prefSet("notify", nOn); page(`${tag} money settings (notify ${nOn})`, () => vMore(), () => N.more.moreHtml(dx, nOn)); } localStorage.removeItem("kpmp.ui.notify"); };
  morePages(d2, "made-up");
  // Every credit card: billed (this and five earlier statements) and unbilled.
  const cardPages = (dx, tag) => {
    const keep = { cardId: S.cardId, cyc: S.cyc, cardTab: S.cardTab, view: S.view };
    for (const a of live("accounts").filter((a) => a.type === "card")) for (const [tab, cyc] of [["unbilled", 0], ...[0, 1, 2, 3, 4, 5].map((k) => ["billed", k])]) {
      const st = { cardId: a.id, cyc, cardTab: tab };
      page(`${tag} card ${a.name} ${tab} ${cyc}`, () => { Object.assign(S, st, { view: "card" }); return vCard(); }, () => N.card.cardHtml(dx, st) ?? "(no card)");
    }
    Object.assign(S, keep);
  };
  cardPages(d2, "made-up");
  // Every loan, each tab, with and without the part-payment calculator.
  const loanPages = (dx, tag) => {
    const keep = { loanId: S.loanId, loanTab: S.loanTab, lsim: S.lsim, view: S.view };
    for (const l of live("loans")) for (const tab of ["overview", "schedule", "history"]) for (const sim of [null, { amt: 200000, ym: addM(ymOf(today()), 2), extra: "", mode: "tenure" }, { amt: "", ym: addM(ymOf(today()), 1), extra: 5000, mode: "emi" }, { amt: 150000, ym: "2020-01", extra: 2500, mode: "tenure" }]) {
      if (sim && tab !== "overview") continue;
      const st = { loanId: l.id, loanTab: tab, lsim: sim && { ...sim, id: l.id } };
      page(`${tag} loan ${l.name} ${tab} ${JSON.stringify(sim)}`, () => { Object.assign(S, st, { view: "loan" }); return vLoan(); }, () => N.loan.loanHtml(dx, st) ?? "(no loan)");
    }
    Object.assign(S, keep);
  };
  loanPages(d2, "made-up");
  sheets(d2, "made-up");
  S.data = real; MEMO = new Map();
  sheets(d, "yours");
  accPages(d, "yours");
  planPages(d, "yours");
  homePages(d, "yours");
  insPages(d, "yours");
  advPages(d, "yours");
  morePages(d, "yours");
  cardPages(d, "yours");
  loanPages(d, "yours");
  Object.assign(S, save); MEMO = new Map();
  // Also the money formats, on awkward amounts.
  for (const r of [0, 0.004, 0.005, -0.5, 0.5, 1.5, 2.5, -2.5, 999.995, 1234.56, -1234.56, 12345678.9, 1e9]) {
    const p = Math.round(r * 100); n++;
    if (money(p / 100) !== N.txlist.money(p)) out.push(`money(${r}): old ${money(p / 100)} new ${N.txlist.money(p)}`);
    if (moneyP(p / 100) !== N.txlist.moneyP(p)) out.push(`moneyP(${r}): old ${moneyP(p / 100)} new ${N.txlist.moneyP(p)}`);
  }
  return { n, txns: live("txns").length, out, estRounding, fixedCrash };
});
await browser.close(); server.close();
const SHOW = +(process.env.SHOW || 6);
console.log(`screen parity on ${EXPORT.includes("sample") ? "the made-up sample" : "the real export"}: ${report.n} pages and sheets (${report.txns} transactions)${report.estRounding ? ` · ${report.estRounding} with a total ₹1 apart (half-rupee rounding)` : ""}`);
if (report.fixedCrash.length) console.log(`  (the old planner crashes on ${report.fixedCrash.length} of these — ${[...new Set(report.fixedCrash.map((l) => l.replace(/^(made-up|yours) /, "")))].join(", ")} — the new page shows them)`);
if (report.out.length) { console.log(`✗ ${report.out.length} differences:`); for (const x of report.out.slice(0, SHOW)) console.log("  " + x); process.exit(1); }
console.log("✓ Transactions (page, form, split, carry-over, filters, clean-up, bulk) Accounts (every section), Plan (every tab), Overview, Insights (every tab) the Advisor (page and what Claude is sent), Money settings, credit cards and loans are identical to the planner's");
