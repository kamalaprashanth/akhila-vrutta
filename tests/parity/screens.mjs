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
const harness = await bundle("tests/parity/oracle.ts", "esm");   // the old planner on its own, with the export
const screens = await bundle("tests/parity/screens-entry.ts", "iife");
const T = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/export.json") return res.writeHead(200).end(await readFile(EXPORT));
  if (url === "/harness.js") return res.writeHead(200, { "content-type": T[".js"] }).end(harness);
  if (url === "/harness.html") return res.writeHead(200, { "content-type": T[".html"] }).end('<!doctype html><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/money/mv.css"><main id="main"></main><script type="module" src="/harness.js"></script>');
  // the old planner (dist-planner, never deployed) first, then the site
  let file = join("dist-planner", normalize(url)); if (!extname(file)) file += ".html";
  if (!existsSync(file)) { file = join("dist", normalize(url)); if (!extname(file)) file += ".html"; }
  try { res.writeHead(200, { "content-type": T[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.route(/fonts\.g/, (r) => r.abort());
await page.goto(`http://127.0.0.1:${server.address().port}/harness.html`);
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
      { id: "hn", type: "NPS", instrument: "NPS2", name: "NPS2", npsMode: "units", unitsAsOf: `${ym1}-15`, yearly: 50000, updatedAt: 1,
        npsLines: [{ k: "E", units: 3456.789, price: 45.6789, priceDate: `${ym1}-20` }, { nm: "Scheme C - Tier I", units: 1200.1, price: 38.12 }, { nm: "Scheme G Tier I", units: 900, price: 29.5, priceSrc: "NPS Trust" }],
        nps: { alloc: { E: 75, C: 10, G: 15 }, retireAge: 60, dob: "1990-06-15", contrib: 300000, charges: 1234.5, stmtDate: `${ym1}-15`, xirr: 11.2, pfm: "SBI Pension Funds", choice: "Active" } },
    ],
    props: [...(real.props || []),
      { id: "pz", name: "Test flat", kind: "flat", place: "Whitefield", status: "construction", since: "2025-02-01", value: 9000000, nw: true, loanId: loan?.id, note: "Tower B, 12th floor", updatedAt: 1,
        fund: { by: addM(nowM, 10), ltv: 80, start: 25000 },
        plan: [{ id: "a", name: "Slab 3", amt: 900000, gst: 45000, when: `${addM(nowM, 1)}-10`, who: "split", tds: true },
          { id: "b", name: "Registration", amt: 600000, when: addM(nowM, 8), who: "you", status: "estimate" },
          { id: "c", name: "Interiors", amt: 300000.5, who: "you" },
          { id: "d", name: "Booking", amt: 100000, when: "2025-02-01", who: "you", done: true }] }],
    propItems: [...(real.propItems || []),
      { id: "pi1", prop: "pz", cat: "token", amt: 100000, date: "2025-02-01", accountId: acc, updatedAt: 1 },
      { id: "pi2", prop: "pz", cat: "stamp", amt: 450000.5, date: "2025-06-10", note: "e-stamp", updatedAt: 1 },
      { id: "pi3", prop: "pz", cat: "bank", amt: 1500000, date: "2025-08-01", updatedAt: 1 }],
  };
  MEMO = new Map();
  const d2 = N.dataFrom(S.data, today());
  const run2 = (label, f, month, extra) => { const keep = d; try { dd = d2; run(`made-up: ${label}`, f, month, extra); } finally { dd = keep; } };
  for (const [l, f, m] of [["this month", blank(), nowM], ["last month", blank(), ym1], ["all time", blank({ period: "all" }), nowM], ["EPF & PPF", blank({ type: "epf", period: "all" }), nowM],
    ["view Big spends", blank({ min: "5000", period: "all" }), nowM], ["tag Trip", blank({ tag: "Trip" }), nowM], ["tag Home", blank({ tag: "Home", period: "all" }), nowM],
    ["paid by Amma", blank({ acc: "@sp2", period: "all" }), nowM], ["paid by removed payer", blank({ acc: "@old", period: "all" }), nowM], ["uncategorised", blank({ uncat: true }), nowM],
    ["search dinner", blank({ q: "dinner" }), nowM], ["search 400.5", blank({ q: "400.5", period: "all" }), nowM], ["investments", blank({ type: "investment" }), nowM]]) run2(l, f, m);
  run2("selecting", blank(), nowM, { selOn: true, sel: ["x1", "x5"] });
  // Moved on purpose (26 Nov 2026): the profile is its own page (Profile, in the side menu), so the links to it changed
  const moved = (h) => typeof h !== "string" ? h : h.replaceAll('<a href="#" data-go="more">Open Settings › My profile</a>', '<a href="#/profile">Open your Profile</a>')
    .replaceAll('<a href="#" data-go="more">', '<a href="#/profile">').replaceAll("Settings › My profile › About me", "Profile › About you").replaceAll("(Settings › My profile)", "(Profile)").replaceAll("Retirement age comes from Settings › My profile (now", "Retirement age comes from your Profile (now")
    .replace(/\n  <h2>My profile for the advisor[\s\S]*?A reminder to review it shows every April\.<\/p>/, "");
  // Sheets: the new ones against the planner's, as drawn (markup, values, pickers, balances).
  const sheetHtml = (sel) => document.querySelector(sel)?.innerHTML ?? "(none)";
  const cmpSheet = (label, openOld, openNew) => {
    n++;
    const kid = (h) => h.replace(/data-kidid="([^"]+)"/g, (m, v) => (knownIds.has(v) ? m : 'data-kidid="NEW"'));
    openOld(); const a = moved(kid(sheetHtml("#modal"))); closeModal();
    openNew(); const b = kid(sheetHtml("#mvLayer #modal")); N.kit.closeModal();
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
    try { a = moved(oldFn()); } catch (e) { a = "old threw: " + e.message; }
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
      page(`${tag} overview ${JSON.stringify(st)}`, () => { Object.assign(S, { ptNext: undefined, insOpen: undefined, view: "home" }, st); return vHome(); }, () => { const x = N.home.homeParts(dx, { ...st }, host); return `${x.first}\n  ${x.adv}<div class="cols"><div>${x.pay}${x.short}${x.invest}${x.renew}${x.hero}${x.needs}</div><div>${x.ins}${x.recent}</div></div>`; });
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
    const a = moved(ADV_RULES(advContext())) + "\n\nQUESTION: " + ADV_CHECK, b = N.advisor.ADV_RULES(N.advisor.advContext(dx)) + "\n\nQUESTION: " + ADV_CHECK;
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
  // EPF: every tab, and the passbook for each financial year.
  const epfPages = (dx, tag) => {
    const keep = { epfId: S.epfId, epfTab: S.epfTab, epfFy: S.epfFy, view: S.view };
    for (const h of live("holdings").filter((h) => h.type === "EPF" && h.epf)) {
      const e = epfCalc(h), fys = e ? [...new Set([...e.rows.map((r) => r.fy), e.fyNow])] : [];
      for (const [tab, fy] of [["overview"], ["passbook"], ...fys.map((y) => ["passbook", y]), ["projection"], ["pension"]]) {
        const st = { epfId: h.id, epfTab: tab, epfFy: fy };
        page(`${tag} EPF ${tab} ${fy ?? ""}`, () => { Object.assign(S, st, { view: "epf" }); return vEpf(); }, () => N.epf.epfHtml(dx, st) ?? "(no EPF)");
      }
    }
    Object.assign(S, keep);
  };
  epfPages(d2, "made-up");
  // PPF: every tab, and the statement for each financial year.
  const ppfPages = (dx, tag) => {
    const keep = { ppfId: S.ppfId, ppfTab: S.ppfTab, ppfFy: S.ppfFy, view: S.view };
    for (const h of live("holdings").filter((h) => h.type === "PPF" && h.ppf)) {
      const p = ppfCalc(h), fys = []; if (p) for (let y = p.fy0; y <= p.fyNow; y++) fys.push(y);
      for (const [tab, fy] of [["overview"], ["statement"], ...fys.map((y) => ["statement", y]), ["projection"]]) {
        const st = { ppfId: h.id, ppfTab: tab, ppfFy: fy };
        page(`${tag} PPF ${tab} ${fy ?? ""}`, () => { Object.assign(S, st, { view: "ppf" }); return vPpf(); }, () => N.ppf.ppfHtml(dx, st) ?? "(no PPF)");
      }
    }
    Object.assign(S, keep);
  };
  ppfPages(d2, "made-up");
  const npsPages = (dx, tag) => {
    const keep = { npsId: S.npsId, npsTab: S.npsTab, view: S.view };
    for (const h of live("holdings").filter((h) => h.type === "NPS" && h.nps)) for (const tab of ["overview", "entries", "projection"]) {
      const st = { npsId: h.id, npsTab: tab };
      page(`${tag} NPS ${tab}`, () => { Object.assign(S, st, { view: "nps" }); return vNps(); }, () => N.nps.npsHtml(dx, st) ?? "(no NPS)");
    }
    Object.assign(S, keep);
  };
  npsPages(d2, "made-up");
  const propPages = (dx, tag) => {
    const keep = { propId: S.propId, propTab: S.propTab, view: S.view, accTab: S.accTab };
    for (const p of live("props").filter((p) => p.rec !== "cats")) for (const tab of ["overview", "payments", "expected", "loan"]) {
      const st = { propId: p.id, propTab: tab };
      page(`${tag} property ${p.name} ${tab}`, () => { Object.assign(S, st, { view: "prop" }); return vProp(); }, () => N.prop.propHtml(dx, st) ?? "(no property)");
    }
    Object.assign(S, keep);
  };
  propPages(d2, "made-up");
  sheets(d2, "made-up");
  // Forms, saved: the same values typed into the planner's form and the new one must store the same records
  // (the planner's in rupees, converted to paise as an import would; new ids and save times aside).
  let formN = 0; const fixedSaves = [], nothingOld = new Set();
  const fillIn = (root, vals) => {
    for (const [k, v] of Object.entries(vals)) {
      if (k.startsWith("click:")) { const b = root.querySelector(k.slice(6)); if (b) b.click(); else out.push(`form fill: nothing to click at ${k}`); continue; }
      const e = k.startsWith("#") || k.startsWith("input") ? root.querySelector(k) : root.querySelector("#f_" + k);
      if (!e) { out.push(`form fill: no field ${k}`); continue; }
      if (e.type === "checkbox" || e.type === "radio") e.checked = !!v; else e.value = v;
      e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  const sortK = (o) => Object.keys(o).sort().reduce((a, k) => ((a[k] = o[k]), a), {});
  // A record saved again unchanged (only its time) isn't a change.
  const norm = (ops, before, dx) => ops.map(({ c, r }) => { const o = { ...r }; delete o.updatedAt; const was = dx.all(c).find((x) => x.id === o.id); if (was) { const w = { ...was }; delete w.updatedAt; if (JSON.stringify(sortK(w)) === JSON.stringify(sortK(o))) return null; } if (!before.has(c + ":" + o.id)) o.id = "NEW"; return JSON.stringify([c, sortK(o)]).replace(/"(id|mid|loanId|prop|txnId|budgetId|splitOf|wifeCat)":"([^"]+)"/g, (m, k, v) => (knownIds.has(v) ? m : `"${k}":"NEW"`)).replace(/"k":"(c[a-z0-9]{10,})"/g, (m, v) => (knownIds.has(v) ? m : `"k":"NEW"`)); }).filter(Boolean).sort();
  // ids already in the data (nested ones too, e.g. a loan's rate changes); any other id was just made
  const knownIds = new Set(JSON.stringify(S.data).match(/"(?:id|mid|k)":"[^"]+"/g)?.map((x) => x.split('":"')[1].slice(0, -1)) ?? []);
  // fix: the planner's known fault for this form, applied to what it saved (or "crash": it couldn't save at all)
  const cmpForm = (dx, label, openOld, openNew, vals, steps = ["#sv"], fix) => {
    n++; formN++;
    const keepData = S.data, snap = JSON.parse(JSON.stringify(S.data)), ids = new Set();
    S.data = JSON.parse(JSON.stringify(keepData)); MEMO = new Map();   // the planner's forms change records in place
    for (const c of Object.keys(snap)) if (Array.isArray(snap[c])) for (const r of snap[c]) ids.add(c + ":" + r.id);
    openOld(); const m1 = document.querySelector("#modal"); fillIn(m1, vals);
    for (const st of steps) document.querySelector("#modal " + st)?.click();
    const oldOps = [];
    for (const c of Object.keys(S.data)) if (Array.isArray(S.data[c])) for (const r of S.data[c]) {
      const b = (snap[c] || []).find((x) => x.id === r.id), strip = (x) => { const y = { ...x }; delete y.updatedAt; return JSON.stringify(y); };
      // a month's carried balance made by the planner's redraw isn't part of the form (the app makes those itself)
      if (!b && c === "txns" && (r.type === "carry" || r.cemi)) continue;   // and card EMIs it posts
      if (!b || strip(b) !== strip(r)) oldOps.push({ c, r: N.toStored(c, r) });
    }
    closeModal(); S.data = keepData; MEMO = new Map();
    const newOps = [];
    N.setEnv({ data: () => dx, state: () => S, write: (o) => newOps.push(...o), refresh: () => {}, planner: () => {} });
    openNew(); const m2 = document.querySelector("#mvLayer #modal"); fillIn(m2, vals);
    for (const st of steps) document.querySelector("#mvLayer #modal " + st)?.click();
    N.kit.closeModal();
    if (fix === "crash") { if (!newOps.length) out.push(`form ${label}: the new form saved nothing either`); else fixedSaves.push(label); return; }
    if (fix) { fix(oldOps); fixedSaves.push(label); }
    const A = norm(oldOps, ids, dx), B = norm(newOps, ids, dx);
    if (!A.length && !/unchanged|no name|already used|nothing/.test(label)) out.push(`form ${label}: nothing saved by either (the test didn't reach Save)`);
    if (JSON.stringify(A) !== JSON.stringify(B)) out.push(`form ${label}: saves differ\n    old ${A.join("\n        ").slice(0, 900)}\n    new ${B.join("\n        ").slice(0, 900)}`);
  };
  const formCases = (dx, tag) => {
    const F = N.forms, accs = live("accounts"), banks = accs.filter((a) => a.type !== "card"), cards = accs.filter((a) => a.type === "card");
    // As drawn first.
    N.setEnv({ data: () => dx, state: () => S, write: () => {}, refresh: () => {}, planner: () => {} });
    cmpSheet(`${tag} new account`, () => accForm(), () => F.accForm());
    for (const a of accs) cmpSheet(`${tag} edit account ${a.name}`, () => accForm({ ...a }), () => F.accForm({ ...dx.byId("accounts", a.id) }));
    cmpSheet(`${tag} new payer`, () => payerForm(), () => F.payerForm());
    for (const p of live("payers")) cmpSheet(`${tag} edit payer ${p.name}`, () => payerForm({ ...p }), () => F.payerForm({ ...dx.byId("payers", p.id) }));
    cmpSheet(`${tag} new category`, () => catForm(), () => F.catForm());
    for (const c of live("categories").slice(0, 25)) cmpSheet(`${tag} edit category ${c.name}`, () => catForm({ ...c }), () => F.catForm({ ...dx.byId("categories", c.id) }));
    cmpSheet(`${tag} Home balance account`, () => pickMainSheet(), () => F.pickMainSheet());
    for (const g of allTags().slice(0, 3)) cmpSheet(`${tag} tag ${g}`, () => tagSheet(g), () => F.tagSheet(g));
    // Taps the app now answers itself: the planner's handler for the same tap must open the same sheet.
    const mk = (attrs) => { const b = document.createElement("button"); for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v); return b; };
    const oldTap = (attrs) => { const b = mk(attrs); b.hidden = true; document.querySelector("#view").appendChild(b); b.click(); b.remove(); };
    const cmpTap = (label, attrs, st = {}) => cmpSheet(`${tag} tap ${label}`, () => { Object.assign(S, st); oldTap(attrs); if (!document.querySelector("#modal .sheet")) nothingOld.add(label); }, () => { Object.assign(S, st); N.actions.appAct(mk(attrs), dx); });
    for (const a of cards) for (const ca of ["pay", "spend", "edit"]) cmpTap(`card ${a.name} ${ca}`, { "data-ca": ca }, { cardId: a.id });
    for (const a of cards.slice(0, 3)) cmpTap(`Plan card bill ${a.name}`, { "data-cpay": a.id });
    for (const a of accs.slice(0, 3)) cmpTap(`account ${a.name}`, { "data-acc": a.id });
    for (const [id] of [["addAcc"], ["addCat"], ["addPayer"], ["pickMain"], ["addLoan"], ["restore"]]) cmpTap(id, { id });
    // Loans: every button and row on each loan's page, as drawn, then saved with typed values.
    const tapSave = (label, attrs, st, vals, steps, fix) => cmpForm(dx, `${tag} ${label}`, () => { Object.assign(S, st); oldTap(attrs); }, () => { Object.assign(S, st); N.actions.appAct(mk(attrs), dx); }, vals, steps, fix);
    const lastPlanAcc = (acc) => (ops) => { const r = ops.find((o) => o.c === "loans")?.r; if (r?.plans?.length) r.plans[r.plans.length - 1].accountId = acc; };
    const nowM = ymOf(today()), b0 = banks[0]?.id ?? "";
    for (const l of live("loans")) {
      const st = { loanId: l.id }, k = l.kind || "emi", bk = k === "hybrid" ? l.bank || {} : l;
      // the buttons its page shows (each tab)
      const las = new Set(); for (const tab of ["overview", "schedule", "history"]) for (const m of (N.loan.loanHtml(dx, { loanId: l.id, loanTab: tab }) || "").matchAll(/data-la="(\w+)"/g)) las.add(m[1]);
      for (const la of las) if (la !== "reopen") cmpTap(`loan ${l.name} ${la}`, { "data-la": la }, st);
      if (las.has("reopen")) tapSave(`loan ${l.name} reopen`, { "data-la": "reopen" }, st, {}, ["#cy"]);
      for (const r of bk.rates || []) cmpTap(`loan ${l.name} rate change ${r.ym}`, { "data-rc": r.id }, st);
      for (const pl of l.plans || []) cmpTap(`loan ${l.name} planned ${pl.start}`, { "data-pl": pl.id }, st);
      if (las.has("prepay")) {
        tapSave(`loan ${l.name} part payment`, { "data-la": "prepay" }, st, { amount: "10,000", date: today(), accountId: b0, 'input[name="mode"][value="tenure"]': true, note: "test" });
        tapSave(`loan ${l.name} part payment, lower EMI`, { "data-la": "prepay" }, st, { amount: "25000.5", 'input[name="mode"][value="emi"]': true, hist: true });
      }
      if (las.has("rate")) tapSave(`loan ${l.name} rate change`, { "data-la": "rate" }, st, { ym: addM(nowM, 1), rate: "8.15", 'input[name="mode"][value="emi"]': true });
      if (las.has("sync")) tapSave(`loan ${l.name} match the bank`, { "data-la": "sync" }, st, { sdate: today(), sbal: "123456.78", 'input[name="smode"][value="emi"]': true });
      tapSave(`loan ${l.name} edit`, { "data-la": "edit" }, st, { name: l.name + " X", ...(k === "family" ? {} : { rate: "9.99", emi: "" }) });
      if (las.has("close")) tapSave(`loan ${l.name} close`, { "data-la": "close" }, st, { ym: nowM });
      if (las.has("borrow")) {
        tapSave(`loan ${l.name} borrow`, { "data-la": "borrow" }, st, { amount: "5000", accountId: b0 });
        tapSave(`loan ${l.name} repay`, { "data-la": "repay" }, st, { amount: "1", date: today() });
        tapSave(`loan ${l.name} plan monthly`, { "data-la": "plan" }, st, { "click:#fseg [data-k=monthly]": 1, amount: "2,500", start: nowM, end: addM(nowM, 12), accountId: b0 }, undefined, lastPlanAcc(b0));
        tapSave(`loan ${l.name} plan once`, { "data-la": "plan" }, st, { amount: "10000", start: addM(nowM, 3) });
      }
      for (const r of bk.rates || []) tapSave(`loan ${l.name} delete rate change ${r.ym}`, { "data-rc": r.id }, st, {}, ["#dl", "#cy"]);
      for (const pl of l.plans || []) tapSave(`loan ${l.name} change planned ${pl.start}`, { "data-pl": pl.id }, st, { amount: "999" });
      if (k === "hybrid") {
        const s0 = schedule(l), um = s0 && s0.rows.find((r) => r.ym <= nowM && !paidMap().has(`l:${l.id}|${r.ym}`));
        if (um) { cmpTap(`loan ${l.name} missed ${um.ym}`, { "data-miss": `l:${l.id}|${um.ym}` }); tapSave(`loan ${l.name} mark missed ${um.ym}`, { "data-miss": `l:${l.id}|${um.ym}` }, {}, {}); }
        if (missedInfo(l).list.some((m) => !m.by)) tapSave(`loan ${l.name} pay back missed`, { "data-la": "catchup" }, st, { accountId: b0 });
      }
    }
    const cat0 = live("categories").find((c) => c.kind === "expense" && !c.parentId)?.id ?? "";
    tapSave("new bank loan", { id: "addLoan" }, {}, { "click:#kseg [data-k=emi]": 1, name: "Car loan", lender: "HDFC", principal: "5,00,000", rate: "9.5", tenure: "60", start: nowM, day: "5", accountId: b0 });
    tapSave("new bank loan, no schedule", { id: "addLoan" }, {}, { name: "Gold loan", lender: "Muthoot", principal: "75000.25", rate: "12" });
    tapSave("new family loan", { id: "addLoan" }, {}, { "click:#kseg [data-k=family]": 1, name: "From Ravi", lender: "Ravi", ownAmt: "1,00,000", ownDate: today(), ownAcc: b0 });
    tapSave("new hybrid loan", { id: "addLoan" }, {}, { "click:#kseg [data-k=hybrid]": 1, name: "Flat loan", lender: "Amma", bankName: "SBI", principal: "20,00,000", rate: "8.4", tenure: "240", start: nowM, emi: "17,500", day: "10", accountId: b0, ownAmt: "3,00,000", ownAcc: b0 });
    if (cards[0]) tapSave("new card EMI", { id: "addLoan" }, {}, { "click:#kseg [data-k=cardemi]": 1, name: "Phone EMI", cardId: cards[0].id, categoryId: cat0, principal: "60000", rate: "15", tenure: "6", start: nowM, fee: "199", gst: "18" });
    tapSave("new loan, no lender (nothing)", { id: "addLoan" }, {}, { "click:#kseg [data-k=family]": 1, name: "x", lender: "" });
    // Plan: regular items, a month's amount, marking paid and undoing, Invest day, Pay by Tuesday, holidays, goals, the emergency fund.
    const tapThen = (label, attrs, steps, st = {}) => cmpSheet(`${tag} ${label}`, () => { Object.assign(S, st); oldTap(attrs); for (const x of steps) document.querySelector("#modal " + x)?.click(); }, () => { Object.assign(S, st); N.actions.appAct(mk(attrs), dx); for (const x of steps) document.querySelector("#mvLayer #modal " + x)?.click(); });
    const recs = live("recurring");
    for (const r of recs.slice(0, 30)) cmpTap(`regular item ${r.name}`, { "data-rec": r.id });
    cmpTap("add regular item", { id: "addRec" });
    for (const r of recs.slice(0, 6)) tapSave(`regular item ${r.name} changed`, { "data-rec": r.id }, {}, { amount: "1,234.5", day: "7", end: addM(nowM, 6), remind: "15", provider: "Test", auto: true });
    for (const r of recs.filter((r) => r.type === "investment").slice(0, 2)) tapSave(`SIP ${r.name} with charges`, { "data-rec": r.id }, {}, { charges: "12.5" });
    const ecat = live("categories").find((c) => c.kind === "expense" && !c.parentId)?.id, icat = live("categories").find((c) => c.kind === "income" && !c.parentId)?.id;
    tapSave("new expense item", { id: "addRec" }, {}, { name: "Gym", amount: "2,000", freq: "monthly", start: nowM, day: "3", accountId: b0, categoryId: ecat, budget: true, shift: true });
    tapSave("new income item", { id: "addRec" }, {}, { "click:#rseg [data-k=income]": 1, name: "Rent in", amount: "15000", freq: "monthly", start: nowM, categoryId: icat });
    tapSave("new investment item", { id: "addRec" }, {}, { "click:#rseg [data-k=investment]": 1, name: "Index SIP", amount: "5000", freq: "monthly", start: nowM, day: "5", accountId: b0, invType: "Mutual Fund" });
    const vb = banks.filter((a) => !a.hidden && !a.noTotal);
    if (vb[1]) tapSave("new transfer item", { id: "addRec" }, {}, { "click:#rseg [data-k=transfer]": 1, name: "To savings", amount: "10000", freq: "quarterly", start: nowM, accountId: vb[0].id, toAccountId: vb[1].id });
    tapSave("new item once", { id: "addRec" }, {}, { name: "Trip", amount: "50000", freq: "once", start: addM(nowM, 2), end: addM(nowM, 5), categoryId: ecat });
    tapSave("new item, no amount (nothing)", { id: "addRec" }, {}, { name: "x", amount: "" });
    if (recs[0]) tapSave(`delete regular item ${recs[0].name}`, { "data-rec": recs[0].id }, {}, {}, ["#dl", "#cy"]);
    for (const r of recs.filter((r) => r.freq === "monthly" && !r.budget).slice(0, 3)) {
      cmpTap(`month amount ${r.name}`, { "data-mi": `${r.id}|${nowM}` });
      tapSave(`month amount ${r.name} changed`, { "data-mi": `${r.id}|${nowM}` }, {}, { amt: "999.99" });
      tapSave(`month amount ${r.name} skipped`, { "data-mi": `${r.id}|${addM(nowM, 1)}` }, {}, {}, ["#sk"]);
    }
    for (const r of recs.filter((r) => r.ov && Object.keys(r.ov).length).slice(0, 3)) { const ym = Object.keys(r.ov)[0]; cmpTap(`month amount ${r.name} ${ym}`, { "data-mi": `${r.id}|${ym}` }); tapSave(`month amount ${r.name} back to usual`, { "data-mi": `${r.id}|${ym}` }, {}, {}, ["#rs"]); }
    const P0 = planned(nowM), pm = paidMap();
    for (const it of P0.filter((x) => !pm.has(x.key) && x.src !== "c" && x.src !== "b").slice(0, 12)) cmpTap(`mark paid ${it.name}`, { "data-pay": it.key });
    for (const [k] of [...pm.entries()].slice(0, 6)) { cmpTap(`undo ${k}`, { "data-undo": k }); tapThen(`undo ${k}, edit`, { "data-undo": k }, ["#ed"]); }
    for (const [k] of [...pm.entries()].filter(([, t]) => t.act !== "missed").slice(0, 2)) tapSave(`undo ${k}`, { "data-undo": k }, {}, {}, ["#un"]);
    for (const [k] of [...pm.entries()].filter(([, t]) => t.act === "missed").slice(0, 1)) tapSave(`undo missed ${k}`, { "data-undo": k }, {}, {}, ["#dl"]);
    const inv = forecast(1).months[0].rows.filter((r) => r.type === "investment" && r.amount > 0.5 && !r.paid);
    for (const r of inv.slice(0, 3)) cmpTap(`invest ${r.name}`, { "data-invpay": r.key });
    if (inv.length) { cmpTap("invest all", { "data-invall": "1" }); tapSave("invest all", { "data-invall": "1" }, {}, {}, ["#cy"]); }
    cmpTap("market holidays", { "data-holi": "1" });
    tapSave("add a market holiday", { "data-holi": "1" }, {}, { hd: `${+nowM.slice(0, 4) + 1}-01-26` }, ["#hadd"]);
    const O = obligations(21).filter((o) => o.src !== "pp");
    for (const o of O.slice(0, 10)) { cmpTap(`Pay by Tuesday ${o.name}`, { "data-ptpay": o.key }); tapThen(`Pay by Tuesday ${o.name}, record`, { "data-ptpay": o.key }, ["#pp_rec"]); tapThen(`Pay by Tuesday ${o.name}, already in`, { "data-ptpay": o.key }, ["#pp_link"]); }
    for (const o of O.filter((o) => o.src === "r").slice(0, 2)) tapSave(`Pay by Tuesday ${o.name}, skip`, { "data-ptpay": o.key }, {}, {}, ["#pp_skip"]);
    if (banks[1]) cmpTap("move money in", { "data-ptmove": `${banks[0].id}|${banks[1].id}|12345.5|Rent` });
    cmpTap("set aside", { "data-ptaside": "reserve|5000" }); cmpTap("set aside extra", { "data-ptaside": "reserve|extra" });
    for (const p of live("props").filter((p) => p.rec !== "cats").slice(0, 2)) cmpTap(`set aside for ${p.name}`, { "data-ptaside": `prop:${p.id}|25000` });
    for (const g of live("goals")) { cmpTap(`goal ${g.name}`, { "data-goal": g.id }); tapSave(`goal ${g.name} priority`, { "data-goal": g.id }, {}, { gp: "2" }); }
    cmpTap("add goal", { id: "addGoal" });
    for (const k of ["loans", "edu", "retire", "custom"]) cmpSheet(`${tag} new goal ${k}`, () => goalForm({ kind: k }), () => N.planforms.goalForm({ kind: k }));
    cmpForm(dx, `${tag} new savings goal`, () => goalForm({ kind: "custom" }), () => N.planforms.goalForm({ kind: "custom" }), { name: "Car", target: "9,00,000", by: addM(nowM, 18), saved: "1,25,000.5", gp: "3" });
    cmpForm(dx, `${tag} new education goal`, () => goalForm({ kind: "edu" }), () => N.planforms.goalForm({ kind: "edu" }), { name: "Edu", es: "1,80,000", eu: "25,00,000", ep: "", ei: "9", er: "" });
    cmpForm(dx, `${tag} new retirement goal`, () => goalForm({ kind: "retire" }), () => N.planforms.goalForm({ kind: "retire" }), { rs: "85,000", ri: "6.5", rl: "88" });
    cmpForm(dx, `${tag} new loans goal`, () => goalForm({ kind: "loans" }), () => N.planforms.goalForm({ kind: "loans" }), { name: "Debt free", by: addM(nowM, 24) });
    cmpTap("emergency fund", { id: "emSet" });
    tapSave("emergency fund months", { id: "emSet" }, {}, { em: "9", emt: "" });
    tapSave("emergency fund own target", { id: "emSet" }, {}, { em: "6", emt: "4,50,000" });
    const ek = [...(N.calc_insights?.spendByCat?.(dx) ?? [])];
    for (const c of live("categories").filter((c) => c.kind === "expense" && !c.parentId).slice(0, 2)) tapSave(`emergency fund leaves out ${c.name}`, { "data-emcat": c.id }, {}, {});
    void ek;
    for (const r of findRepeats().slice(0, 4)) { cmpTap(`add repeat ${r.name}`, { "data-repadd": r.key }); tapSave(`add repeat ${r.name}`, { "data-repadd": r.key }, {}, {}); }
    // Properties: the page's buttons and rows, typed payments, picking from Transactions, categories, expected payments, demands, the fund.
    cmpTap("add a property", { "data-pact": "newprop" }); cmpTap("property categories", { "data-pact": "cats" });
    tapSave("new property", { "data-pact": "newprop" }, {}, { pn: "Test plot", pk: "plot", ps: "booked", pp: "Kanakapura Road", pd: "2025-01-10", pv: "45,00,000", pnw: true, pcur: "50,00,000", pcd: today(), pnote: "Corner plot" });
    tapSave("property categories renamed", { "data-pact": "cats" }, {}, { "input[data-nm=token]": "Booking amount", 'input[data-new="legal"]': "Notary", "input[data-hd=club]": false });
    for (const p of live("props").filter((p) => p.rec !== "cats")) {
      const st = { propId: p.id };
      for (const pa of ["edit", "add", "pick", "planadd", "planfund"]) cmpTap(`property ${p.name} ${pa}`, { "data-pact": pa }, st);
      for (const r of p.plan || []) { cmpTap(`property ${p.name} expected ${r.name}`, { "data-pplan": r.id }, st); tapThen(`property ${p.name} demand ${r.name}`, { "data-pplan": r.id }, ["#dm"], st); }
      for (const it of live("propItems").filter((i) => i.prop === p.id).slice(0, 6)) { cmpTap(`property ${p.name} payment ${it.id}`, { "data-pitem": it.id }); tapSave(`property ${p.name} payment ${it.id} note`, { "data-pitem": it.id }, {}, { pnt: "changed note" }); }
      tapSave(`property ${p.name} edit`, { "data-pact": "edit" }, st, { pn: p.name + " X", pv: "1,23,45,678", pnw: !p.nw, pl: "" });
      tapSave(`property ${p.name} payment with transaction`, { "data-pact": "add" }, st, { pa: "1,50,000", pdt: today(), pacc: b0, pnt: "Khata", phist: true });
      tapSave(`property ${p.name} payment, no transaction`, { "data-pact": "add" }, st, { pa: "25000.5", pacc: "", ptx: false });
      tapSave(`property ${p.name} pick from transactions`, { "data-pact": "pick" }, st, { "click:#pkList input": 1 });
      tapSave(`property ${p.name} new expected`, { "data-pact": "planadd" }, st, { xn: "Slab 9", xa: "9,00,000", xg: "45000", "click:#xw [data-k=date]": 1, xd: addM(nowM, 2) + "-10", xwho: "split", xs: "confirmed", xt: true }, undefined, "crash");
      tapSave(`property ${p.name} new expected, around a month`, { "data-pact": "planadd" }, st, { xn: "Registration", xa: "6,00,000", "click:#xw [data-k=month]": 1, xm: addM(nowM, 8), xwho: "you" }, undefined, "crash");
      for (const r of (p.plan || []).slice(0, 2)) { tapSave(`property ${p.name} change expected ${r.name}`, { "data-pplan": r.id }, st, { xa: "123456" }, undefined, "crash"); tapSave(`property ${p.name} demand for ${r.name}`, { "data-pplan": r.id }, st, { "click:#dm": 1, dA: "9,45,000", dD: addM(nowM, 1) + "-15", dB: "7,00,000" }, ["#sv"]); }
      if ((p.plan || [])[0]) tapSave(`property ${p.name} delete expected`, { "data-pplan": p.plan[0].id }, st, {}, ["#dl"]);
      tapSave(`property ${p.name} fund`, { "data-pact": "planfund" }, st, { fb: addM(nowM, 11), fl: "80", fs: "30,000" }, undefined, (ops) => { const r = ops.find((o) => o.c === "props")?.r; if (r?.fund) r.fund.start = 3000000; });
      tapSave(`property ${p.name} usual costs`, { "data-pact": "planest" }, st, {}, []);
    }
    for (const o of obligations(21).filter((o) => o.src === "pp").slice(0, 4)) { cmpTap(`Pay by Tuesday property ${o.name}`, { "data-ptpay": o.key }); tapSave(`Pay by Tuesday property ${o.name}`, { "data-ptpay": o.key }, {}, o.tds ? {} : { pacc: b0 }, o.tds ? [] : ["#sv"]); }
    // EPF, PPF and NPS entries.
    const setAcc = (acc) => (ops) => { const r = ops.find((o) => o.c === "txns")?.r; if (r) r.accountId = acc; };
    for (const h of live("holdings").filter((h) => h.type === "EPF" && h.epf)) {
      const st = { epfId: h.id };
      cmpTap(`EPF add entry ${h.name}`, { "data-ea": "add" }, st);
      for (const m of h.epf.manual || []) { cmpTap(`EPF entry ${m.id}`, { "data-epfm": m.id }, st); tapSave(`EPF entry ${m.id} changed`, { "data-epfm": m.id }, st, { emp: "1,900" }); tapSave(`EPF entry ${m.id} removed`, { "data-epfm": m.id }, st, {}, ["#dl"]); }
      tapSave(`EPF ${h.name} new contribution`, { "data-ea": "add" }, st, { wm: addM(nowM, -1), d: today(), emp: "1,800", er: "550.5", eps: "1250" });
      tapSave(`EPF ${h.name} new interest`, { "data-ea": "add" }, st, { "click:#ekSeg [data-k=int]": 1, emp: "12,345", er: "3,456" });
      tapSave(`EPF ${h.name} new withdrawal`, { "data-ea": "add" }, st, { "click:#ekSeg [data-k=wd]": 1, d: today(), emp: "50000", er: "0", note: "Housing" });
    }
    for (const h of live("holdings").filter((h) => h.type === "PPF" && h.ppf)) {
      const st = { ppfId: h.id };
      cmpTap(`PPF add entry ${h.name}`, { "data-pa": "add" }, st);
      const ppfAcc = live("txns").filter((t) => t.type === "investment" && (t.instrument || "").trim().toLowerCase() === (h.instrument || "PPF").toLowerCase()).sort((a, b) => b.date.localeCompare(a.date))[0]?.accountId || mainAcc()?.id;
      for (const m of h.ppf.manual || []) { cmpTap(`PPF entry ${m.id}`, { "data-ppfm": m.id }, st); tapSave(`PPF entry ${m.id} changed`, { "data-ppfm": m.id }, st, { amt: "777" }, undefined, m.k === "dep" ? setAcc(ppfAcc) : undefined); }
      tapSave(`PPF ${h.name} new deposit`, { "data-pa": "add" }, st, { amt: "12,500", d: today(), acc: b0 }, undefined, setAcc(b0));
      tapSave(`PPF ${h.name} new interest`, { "data-pa": "add" }, st, { "click:#pkSeg [data-k=int]": 1, amt: "9,876.5" });
      tapSave(`PPF ${h.name} new withdrawal`, { "data-pa": "add" }, st, { "click:#pkSeg [data-k=wd]": 1, amt: "20000", d: today() });
    }
    for (const h of live("holdings").filter((h) => h.type === "NPS" && h.nps)) {
      const st = { npsId: h.id };
      cmpTap(`NPS contribution ${h.name}`, { "data-na": "add" }, st); cmpTap(`NPS units ${h.name}`, { "data-na": "units" }, st);
      tapSave(`NPS ${h.name} new contribution`, { "data-na": "add" }, st, { amt: "5,000", d: today(), acc: b0 }, undefined, setAcc(b0));
      tapSave(`NPS ${h.name} units from statement`, { "data-na": "units" }, st, { u0: "3500.1234", p0: "46.12", sd: today(), ct: "3,10,000", xr: "11.5" });
    }
    // Opening an entry from a list: loan entries, carry-overs, EPF / PPF lines, trades.
    for (const t of live("txns").filter((t) => t.type === "loan").slice(0, 8)) cmpTap(`list loan entry ${t.act} ${t.id}`, { "data-tx": t.id });
    for (const t of live("txns").filter((t) => t.type === "carry").slice(0, 2)) cmpTap(`list carry ${t.id}`, { "data-tx": t.id });
    for (const it of [...N.txlist.epfTxItems(dx).slice(0, 4), ...N.txlist.epfTxItems(dx).filter((x) => x.mid).slice(0, 3), ...N.txlist.ppfTxItems(dx).slice(0, 4), ...N.txlist.ppfTxItems(dx).filter((x) => x.mid).slice(0, 3), ...N.txlist.tradeTxItems(dx).slice(0, 3)]) cmpTap(`list ${it.id}`, { "data-tx": it.id });
    { n++; const a = JSON.stringify(epfTxItems().map((x) => [x.id, x.epfMid ?? null, x.epfFy])), b = JSON.stringify(N.txlist.epfTxItems(dx).map((x) => [x.id, x.mid ?? null, x.fy])); if (a !== b) out.push(`EPF lines' entries differ\n    old ${a.slice(0, 400)}\n    new ${b.slice(0, 400)}`); }
    { n++; const a = JSON.stringify(ppfTxItems().map((x) => [x.id, x.ppfHid, x.ppfMid ?? null])), b = JSON.stringify(N.txlist.ppfTxItems(dx).map((x) => [x.id, x.hid, x.mid ?? null])); if (a !== b) out.push(`PPF lines' entries differ\n    old ${a.slice(0, 400)}\n    new ${b.slice(0, 400)}`); }
    // My profile for the advisor, and the goals made from it.
    for (const k of ["about", "income", "ins", "prop", "assets", "estate"]) cmpTap(`profile ${k}`, { "data-prof": k });
    cmpForm(dx, `${tag} profile about`, () => profForm("about"), () => N.profform.profForm("about"), { pdob: "1985-04-12", pr: "58", sn: "Wife", sd: "1988-01-01", "click:#addKid": 1, "#kidRows .fam:last-child input[type=text]": "Son", "#kidRows .fam:last-child input[type=date]": "2016-08-20", "#dpm": true, pd: "parents partly", pj: "Stable", pk: "Medium" });
    if ((dx.byId("settings", "profile")?.kids || []).length) cmpForm(dx, `${tag} profile about, a child removed`, () => profForm("about"), () => N.profform.profForm("about"), { "click:#kidRows .fam:first-child [data-kidx]": 1 });
    cmpForm(dx, `${tag} profile income`, () => profForm("income"), () => N.profform.profForm("income"), { ps: "1,85,000", pb: "2 lakh in April", pg: "New" });
    cmpForm(dx, `${tag} profile income, wife's category`, () => profForm("income"), () => N.profform.profForm("income"), { pw: "__new" });
    cmpForm(dx, `${tag} profile insurance`, () => profForm("ins"), () => N.profform.profForm("ins"), { it: "20000000", iu: "60", ip: "18000", ih: "1000000", iy: "Family floater", ihp: "25000", io: "", ie: "500000", iq: "No", ia: "", ig: "3000000" });
    cmpForm(dx, `${tag} profile property use`, () => profForm("prop"), () => N.profform.profForm("prop"), Object.fromEntries(live("props").map((p) => ["pu_" + p.id, "Rented out"])));
    cmpForm(dx, `${tag} profile assets`, () => profForm("assets"), () => N.profform.profForm("assets"), { as: "20 g gold" });
    cmpForm(dx, `${tag} profile estate`, () => profForm("estate"), () => N.profform.profForm("estate"), { en: "Some", ew: "No", ex: "to do" });
    // Investments: the holding form (tap a holding, + Add, Edit on the EPF / PPF / NPS pages).
    const UNITS = ["Mutual Fund", "Stock", "US Stocks", "Gold"];
    cmpTap("add investment", { id: "addHold" });
    for (const h of live("holdings")) {
      cmpTap(`holding ${h.name}`, { "data-hold": h.id });
      const sub = (h.type === "PPF" && h.ppf) || (h.type === "NPS" && h.nps) || (h.type === "EPF" && h.epf); if (sub) continue;
      tapSave(`holding ${h.name} unchanged`, { "data-hold": h.id }, {}, {});
      tapSave(`holding ${h.name} changed`, { "data-hold": h.id }, {}, UNITS.includes(h.type) ? { price: "123.45", openUnits: "10.5", platform: "Groww" } : { value: "123456.7", platform: "Bank" });
      tapSave(`holding ${h.name} out of net worth`, { "data-hold": h.id }, {}, { excl: !h.excludeNW });
    }
    for (const [a, k, st] of [["data-ea", "EPF", "epfId"], ["data-pa", "PPF", "ppfId"], ["data-na", "NPS", "npsId"]]) for (const h of live("holdings").filter((h) => h.type === k && h[k.toLowerCase()])) {
      cmpTap(`${k} edit ${h.name}`, { [a]: "edit" }, { [st]: h.id });
      tapSave(`${k} edit ${h.name} saved`, { [a]: "edit" }, { [st]: h.id }, k === "EPF" ? { epfRate: "8.1", epfAge: "60" } : k === "NPS" ? { "click:#npsSeg [data-k=value]": 1, value: "512345.5", platform: "Protean" } : { platform: "SBI" });
    }
    const nh = (label, vals) => tapSave(`new investment ${label}`, { id: "addHold" }, {}, vals);
    nh("fund", { name: "Test Flexi Cap", openInvested: "10000", openUnits: "100.123", price: "105.5", unitsAsOf: today() });
    nh("share", { type: "Stock", name: "TESTCO", openInvested: "5000.5", openUnits: "12", price: "450" });
    nh("US share", { type: "US Stocks", name: "VOO", openInvested: "40000", openUnits: "1.5", price: "512.3", fx: "84.25" });
    nh("gold", { type: "Gold", name: "", openInvested: "30000", openUnits: "4.2513", price: "7150" });
    nh("FD", { type: "FD / RD", name: "SBI FD", openInvested: "100000", value: "104500" });
    nh("plot", { type: "Real estate", name: "Plot", openInvested: "1500000", value: "2500000" });
    nh("EPF by details", { type: "EPF", name: "", value: "350000", epfEmp: "1800", epfEr: "550", joined: addM(nowM, -30), rateE: "8.25" });
    nh("PPF by details", { type: "PPF", name: "", value: "250000", opened: "2019-05-10", yearly: "150000", rateP: "7.1" });
    nh("NPS balance", { type: "NPS", name: "", value: "420000", platform: "Protean" });
    nh("no name", { type: "Stock", name: "" });
    // Kite tradebooks: rows read the same way, and the trades shown on a share.
    { const H = ["Symbol", "ISIN", "Trade Date", "Exchange", "Segment", "Series", "Trade Type", "Auction", "Quantity", "Price", "Trade ID", "Order ID", "Order Execution Time"];
      const rows = [["Client ID", "AB1234"], [], H, ["INFY", "INE009A01021", "2025-04-03", "NSE", "EQ", "EQ", "buy", "false", 10, 1500.5, "111", "222", "2025-04-03T09:20:00"],
        ["INFY", "INE009A01021", "2025-06-03", "NSE", "EQ", "EQ", "sell", "false", 4, 1650, "113", "223", "2025-06-03T10:00:00"], ["INFY-BE", "INE009A01021", "2025-08-01", "BSE", "EQ", "BE", "Buy", "false", 3, 1499.95, 115, 225, ""],
        ["TCS", "INE467B01029", "2025-07-01 00:00:00", "BSE", "EQ", "EQ", "Buy", "false", 2, 3400, "114", "224", ""], ["", "", "", ""], ["BAD", "x", "notdate", "NSE", "", "", "buy", "", 1, 1, "", "", ""], ["ZERO", "y", "2025-01-01", "NSE", "", "", "buy", "", 0, 1, "", "", ""]];
      n++; const a = kiteTrades(rows), b = N.trades.kiteTrades(rows); if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`Kite tradebook read differently\n    old ${JSON.stringify(a).slice(0, 500)}\n    new ${JSON.stringify(b).slice(0, 500)}`);
      let bad = 0; try { N.trades.kiteTrades([["x"]]); } catch { bad = 1; } if (!bad) out.push("Kite tradebook: a sheet without the header wasn't refused");
      const keep = S.data.trades; S.data.trades = [...(keep || []), ...a]; MEMO = new Map(); const dT = N.dataFrom(S.data, today());
      for (const h of [{ id: "th1", type: "Stock", name: "INFY", platform: "Kite" }, { id: "th2", type: "Stock", name: "Tata Consultancy", px: "stk:INE467B01029" }, { id: "th3", type: "Stock", name: "INFY", platform: "Groww" }, { id: "th4", type: "Mutual Fund", name: "INFY" }, ...live("holdings").filter((h) => ["Stock", "US Stocks", "Gold"].includes(h.type))]) {
        n++; const x = tradesBlock(h), y = N.trades.tradesBlock(dT, dT.byId("holdings", h.id) || h); if (x !== y) out.push(`trades on ${h.name} (${h.id}) drawn differently\n    old ${x.slice(0, 600)}\n    new ${y.slice(0, 600)}`);
      }
      S.data.trades = keep; MEMO = new Map(); }
    // Goals made once from the profile (nothing seeded yet, and a child added later).
    for (const [lbl, tweak] of [["first time", (D) => { const a = (D.settings || []).find((x) => x.id === "app"); if (a) { delete a.goalsSeeded; delete a.goalKids; } D.goals = (D.goals || []).filter((g) => !["retire", "loans", "edu"].includes(g.kind)); }],
      ["a child added", (D) => { let p = (D.settings || []).find((x) => x.id === "profile"); if (!p) { p = { id: "profile" }; (D.settings = D.settings || []).push(p); } p.kids = [...(p.kids || []), { id: "kidT", name: "Tara", dob: "2019-03-03" }]; }]]) {
      n++; const keep = S.data, D = JSON.parse(JSON.stringify(keep)); tweak(D); S.data = JSON.parse(JSON.stringify(D)); MEMO = new Map();
      const before = JSON.parse(JSON.stringify(S.data)); ensureSmartGoals();
      const ids = new Set(); for (const c of Object.keys(before)) if (Array.isArray(before[c])) for (const r of before[c]) ids.add(c + ":" + r.id);
      const A = []; for (const c of Object.keys(S.data)) if (Array.isArray(S.data[c])) for (const r of S.data[c]) { const b = (before[c] || []).find((x) => x.id === r.id); if (!b || JSON.stringify(b) !== JSON.stringify(r)) A.push({ c, r: N.toStored(c, r) }); }
      S.data = keep; MEMO = new Map(); const dD = N.dataFrom(D, today());
      const a = norm(A, ids, dD), b = norm(N.profform.smartGoalWrites(dD), ids, dD); if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`goals from the profile (${lbl}) differ\n    old ${a.join("\n        ").slice(0, 700)}\n    new ${b.join("\n        ").slice(0, 700)}`);
    }
    // Backup: the Excel sheets, the data file, restoring (merge and replace) and the calendar file.
    { const r2 = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v), rows = (sh) => JSON.stringify(sh.map((x) => ({ ...x, rows: x.rows.map((r) => r.map(r2)) })));
      n++; const a = rows(excelSheets()), b = rows(N.backup.excelSheets(dx)); if (a !== b) { const A = JSON.parse(a), B = JSON.parse(b); for (let i = 0; i < A.length; i++) if (JSON.stringify(A[i]) !== JSON.stringify(B[i])) { const k = A[i].rows.findIndex((r, j) => JSON.stringify(r) !== JSON.stringify(B[i].rows[j])); out.push(`Excel sheet ${A[i].name} differs (row ${k + 2})\n    old ${JSON.stringify(A[i].rows[k] ?? A[i].cols).slice(0, 400)}\n    new ${JSON.stringify(B[i].rows[k] ?? B[i].cols).slice(0, 400)}`); } }
      n++; const sk = (o) => JSON.stringify(Object.keys(o).sort().reduce((x, c) => ((x[c] = Array.isArray(o[c]) ? o[c].map(sortK).sort((p, q) => String(p.id).localeCompare(String(q.id))) : o[c]), x), {}));
      if (sk(S.data) !== sk(N.backup.plannerData(dx))) out.push("Download data: the file differs from the planner's data");
      let got = null; const keepSave = window.saveFile; window.saveFile = (name, bytes) => { got = String(bytes); }; icsAll(); window.saveFile = keepSave;
      n++; const strip = (t) => String(t).replace(/DTSTAMP:[^\r\n]*/g, ""); if (strip(got) !== strip(N.backup.icsText(dx))) out.push(`calendar file differs\n    old ${strip(got).slice(0, 400)}\n    new ${strip(N.backup.icsText(dx)).slice(0, 400)}`);
      // a backup: some records newer, some older, one new, one missing
      const B0 = JSON.parse(JSON.stringify(S.data)), T0 = Date.now() + 60000;
      (B0.txns || []).slice(0, 3).forEach((t, i) => { t.note = "from backup " + i; t.updatedAt = T0; }); (B0.txns || []).slice(3, 5).forEach((t) => { t.note = "older"; t.updatedAt = 1; });
      (B0.accounts || []).push({ id: "bk1", name: "Backup bank", type: "bank", opening: 1234.5, updatedAt: T0 }); (B0.categories || []).splice(0, 1);
      for (const repl of [false, true]) for (const wrap of [false, true]) {
        n++; const j = wrap ? { app: "KP Money Planner", data: B0 } : B0, NOW = Date.now() + 1000;
        const was = JSON.parse(JSON.stringify(S.data)), oldN = Date.now; Date.now = () => NOW; let after;
        try { if (repl) after = replaceWith(was, JSON.parse(JSON.stringify(B0))); else { const cur = JSON.parse(JSON.stringify(was)); if ((B0.categories || []).length) for (const c of ["accounts", "categories"]) for (const x of (cur[c] || [])) if (x.seed && !x.deleted) { x.deleted = true; delete x.seed; x.updatedAt = NOW; } after = merge(cur, JSON.parse(JSON.stringify(B0))); } } finally { Date.now = oldN; }
        const A = []; for (const c of Object.keys(after)) if (Array.isArray(after[c])) for (const r of after[c]) { const p = (was[c] || []).find((x) => x.id === r.id); if (!p || JSON.stringify(sortK(p)) !== JSON.stringify(sortK(r))) A.push(c + " " + JSON.stringify(sortK(N.toStored(c, r)))); }
        const Bn = N.backup.restoreWrites(dx, JSON.parse(JSON.stringify(j)), repl, NOW).map(({ c, r }) => c + " " + JSON.stringify(sortK(r)));
        if (JSON.stringify(A.sort()) !== JSON.stringify(Bn.sort())) out.push(`restore (${repl ? "replace" : "merge"}${wrap ? ", downloaded file" : ""}) writes differ: old ${A.length} new ${Bn.length}\n    old ${A.filter((x) => !Bn.includes(x)).slice(0, 3).join("\n        ").slice(0, 900)}\n    new ${Bn.filter((x) => !A.includes(x)).slice(0, 3).join("\n        ").slice(0, 900)}`);
      }
    }
    // The PDF readers, on the same text lines.
    const planLines = ["Some agreement text", "PAYMENT PLAN", "On Booking | 10% | 900000 | 45000", "On Agreement | 10.0% | 900000 | 45000", "On Completion of 6th Floor Slab | 6.0% | 1217655 | 60883", "Advance Maintenance | charges", "| 79,200 | 14256", "Total | 100% | 9000000", "Grand Total | 9500000"];
    const stmtLines = ["ICICI Bank", "Statement for LBBLR00012345678", "Loan Account Details As on 15-Oct-2026", "Debits | 1,23,456.00 | 2,34,567.89 | 12,345.00 | 0.00 | 0.00 | 5,900.00 | 0.00", "10-Sep-2026 | ref | EMI | Due for Sep", "10-Oct-26 | ref | Pre-EMI | Due for Oct", "Current OS", "1,000.00 | 2,000.00 | 3,000.00 | 4,000.00 | 5,000.00 | 6,000.00 | 98,76,543.21 | 8,000.00"];
    const pbLines = (fy, extra = []) => ["EMPLOYEES' PROVIDENT FUND ORGANISATION", "Member ID / Name | KNBNG00123450000012345 / KP", "Establishment ID/Name | KNBNG0012345 / TEST EMPLOYER PVT LTD", "Date of Birth | 15-06-1990", `Financial Year - ${fy} - ${fy + 1}`,
      `OB Int. Updated upto 31/03/${fy} | 1,00,000 | 30,000 | 50,000`, `Apr-${fy} | 15-05-${fy} | CR | Cont. For Due-Month 05${fy} | 50,000 | 15,000 | 6,000 | 1,833 | 1,250`,
      `May-${fy} | 15-06-${fy} | CR | Cont. For Due-Month 06${fy} | 50,000 | 15,000 | 6,000 | 1,833 | 1,250`, `Jun-${fy} | 20-07-${fy} | DR | Claim: Against PARA 68BD | 0 | 0 | 20,000 | 5,000 | 0`, "Old Member Id: KNBNG00999990000012345 TRANSFER IN",
      `Jul-${fy} | 10-08-${fy} | CR | TRANSFER IN | 0 | 0 | 12,000 | 3,000 | 0`, `Int. Updated upto 31/03/${fy + 1} | 9,000 | 2,700 | 0`, `Closing Balance as on 31/03/${fy + 1} | 1,21,000 | 36,366 | 52,500`, ...extra];
    { const B = N.epfpdf.epfParse(pbLines(2025)); if (!(B.acc && B.fy === 2025 && B.ob && B.rows.length >= 4 && B.close)) out.push(`EPF passbook: test lines not read (${JSON.stringify(B).slice(0, 200)})`); }
    for (const fy of [2023, 2024, 2025]) { n++; const a = JSON.stringify(epfParse(pbLines(fy))), b = JSON.stringify(N.epfpdf.epfParse(pbLines(fy))); if (a !== b) out.push(`EPF passbook ${fy}: read differently\n    old ${a.slice(0, 500)}\n    new ${b.slice(0, 500)}`); }
    { n++; const L = [2024, 2025].map((y) => epfParse(pbLines(y))), E0 = { rate: 8.25, books: { X: { est: "OLD", fys: { 2020: { ob: [1, 2, 3], rows: [] } } } } };
      const a = JSON.stringify(epfMerge(JSON.parse(JSON.stringify(E0)), L)), b = JSON.stringify(N.epfpdf.epfMerge(JSON.parse(JSON.stringify(E0)), L)); if (a !== b) out.push(`EPF passbooks merged differently\n    old ${a.slice(0, 500)}\n    new ${b.slice(0, 500)}`); }
    n++; if (JSON.stringify(propPlanParse(planLines)) !== JSON.stringify(N.propforms.propPlanParse(planLines))) out.push(`payment plan PDF: read differently\n    old ${JSON.stringify(propPlanParse(planLines))}\n    new ${JSON.stringify(N.propforms.propPlanParse(planLines))}`);
    n++; if (JSON.stringify(propStmtParse(stmtLines)) !== JSON.stringify(N.propforms.propStmtParse(stmtLines))) out.push(`loan statement PDF: read differently\n    old ${JSON.stringify(propStmtParse(stmtLines))}\n    new ${JSON.stringify(N.propforms.propStmtParse(stmtLines))}`);
    cmpForm(dx, `${tag} new bank account`, () => accForm(), () => F.accForm(), { name: "Test bank", type: "bank", group: "Savings", opening: "12,345.67", minBal: "5000", reserve: true, reserveStart: "1000.5", emTarget: "" });
    cmpForm(dx, `${tag} new card`, () => accForm(), () => F.accForm(), { name: "Test card", type: "card", opening: "-12000", stmtDay: "5", dueDay: "25", payFrom: banks[0]?.id ?? "", limit: "2,00,000", apr: "3.75", fee: "499", feeWaive: "150000", reward: "1.5", rewardNote: "5% on Swiggy", hidden: true });
    cmpForm(dx, `${tag} new account, no name`, () => accForm(), () => F.accForm(), { name: "" });
    for (const a of accs.slice(0, 8)) {
      cmpForm(dx, `${tag} edit ${a.name} unchanged`, () => accForm({ ...a }), () => F.accForm({ ...dx.byId("accounts", a.id) }), {});
      cmpForm(dx, `${tag} edit ${a.name} changed`, () => accForm({ ...a }), () => F.accForm({ ...dx.byId("accounts", a.id) }), { opening: "777.77", noTotal: true, ...(a.type === "card" ? { limit: "", reward: "0" } : { minBal: "" }) });
    }
    for (const a of cards.slice(0, 2)) cmpForm(dx, `${tag} card ${a.name} made a bank`, () => accForm({ ...a }), () => F.accForm({ ...dx.byId("accounts", a.id) }), { type: "bank" });
    cmpForm(dx, `${tag} new payer`, () => payerForm(), () => F.payerForm(), { name: "Test payer", 'input[name="own"][value="0"]': true, tag: "Home" });
    for (const p of live("payers").slice(0, 3)) cmpForm(dx, `${tag} edit payer ${p.name}`, () => payerForm({ ...p }), () => F.payerForm({ ...dx.byId("payers", p.id) }), { tag: "Trip" });
    if (live("payers")[0]) cmpForm(dx, `${tag} payer, a name already used`, () => payerForm(), () => F.payerForm(), { name: live("payers")[0].name.toUpperCase() });
    const top = live("categories").find((c) => c.kind === "expense" && !c.parentId);
    cmpForm(dx, `${tag} new category with a limit`, () => catForm(), () => F.catForm(), { name: "Test cat", kind: "expense", limit: "5,000" });
    if (top) cmpForm(dx, `${tag} new subcategory (limit dropped)`, () => catForm(), () => F.catForm(), { name: "Sub", kind: "expense", parentId: top.id, limit: "100" });
    cmpForm(dx, `${tag} new income category`, () => catForm(), () => F.catForm(), { name: "Bonus", kind: "income", limit: "100" });
    for (const c of live("categories").filter((c) => c.kind === "expense" && (c.limit > 0 || !c.parentId)).slice(0, 4)) cmpForm(dx, `${tag} edit category ${c.name}`, () => catForm({ ...c }), () => F.catForm({ ...dx.byId("categories", c.id) }), { limit: "2500.5" });
    if (top) cmpForm(dx, `${tag} delete category ${top.name}`, () => catForm({ ...top }), () => F.catForm({ ...dx.byId("categories", top.id) }), {}, ["#dl", "#cy"]);
    if (accs[0]) cmpForm(dx, `${tag} delete account ${accs[0].name}`, () => accForm({ ...accs[0] }), () => F.accForm({ ...dx.byId("accounts", accs[0].id) }), {}, ["#dl", "#cy"]);
    const other = banks.find((a) => !a.hidden && a.id !== mainAcc()?.id);
    if (other) cmpForm(dx, `${tag} Home balance account`, () => pickMainSheet(), () => F.pickMainSheet(), { acc: other.id }, undefined, (ops) => { for (const o of ops) delete o.r.seed; });
    for (const g of allTags().slice(0, 2)) {
      cmpForm(dx, `${tag} rename tag ${g}`, () => tagSheet(g), () => F.tagSheet(g), { name: g + " X" });
      cmpForm(dx, `${tag} remove tag ${g}`, () => tagSheet(g), () => F.tagSheet(g), {}, ["#dl", "#cy"]);
    }
  };
  formCases(d2, "made-up");
  // What the planner filled in by itself on each redraw (carry-overs, card EMIs, the month's snapshot) vs the app's.
  const autoCase = (tag, mut) => {
    n++;
    const keep = S.data, base = JSON.parse(JSON.stringify(S.data)); if (mut) mut(base);
    S.data = JSON.parse(JSON.stringify(base)); MEMO = new Map(); S.snapT = 0;
    const A0 = window.__plannerAuto; A0.ensurePayers(); A0.ensureCarry(); A0.ensureCardEmi(); A0.ensureSnap();
    const oldOps = []; for (const c of Object.keys(S.data)) if (Array.isArray(S.data[c])) for (const r of S.data[c]) { const b = (base[c] || []).find((x) => x.id === r.id); const st = (x) => { const y = { ...x }; delete y.updatedAt; return JSON.stringify(y); }; if (!b || st(b) !== st(r)) oldOps.push({ c, r: N.toStored(c, r) }); }
    S.data = keep; MEMO = new Map();
    N.auto.resetSnapClock();
    const newOps = N.auto.autoEntries(N.dataFrom(base, today()));
    const key = (o) => { const x = { ...o.r }; delete x.updatedAt; return JSON.stringify([o.c, Object.keys(x).sort().reduce((a, k) => ((a[k] = x[k]), a), {})]); };
    const A = oldOps.map(key).sort(), B = newOps.map(key).sort();
    if (JSON.stringify(A) !== JSON.stringify(B)) out.push(`automatic entries ${tag}: differ\n    old ${A.join("\n        ").slice(0, 1200)}\n    new ${B.join("\n        ").slice(0, 1200)}`);
    return A.length;
  };
  let autoN = 0;
  autoN += autoCase("made-up, as is");
  autoN += autoCase("made-up, carry-overs and snapshot made again", (x) => { x.txns = x.txns.filter((t) => t.type !== "carry"); x.snaps = []; });
  autoN += autoCase("made-up, no payers yet", (x) => { x.payers = []; });
  S.data = real; MEMO = new Map();
  sheets(d, "yours");
  formCases(d, "yours");
  autoN += autoCase("yours, as is");
  autoN += autoCase("yours, carry-overs, card EMIs and snapshot made again", (x) => { x.txns = x.txns.filter((t) => t.type !== "carry" && !t.cemi); x.snaps = (x.snaps || []).filter((s) => s.ym !== ymOf(today())); });
  accPages(d, "yours");
  planPages(d, "yours");
  homePages(d, "yours");
  insPages(d, "yours");
  advPages(d, "yours");
  morePages(d, "yours");
  cardPages(d, "yours");
  loanPages(d, "yours");
  epfPages(d, "yours");
  ppfPages(d, "yours");
  npsPages(d, "yours");
  propPages(d, "yours");
  Object.assign(S, save); MEMO = new Map();
  // Also the money formats, on awkward amounts.
  for (const r of [0, 0.004, 0.005, -0.5, 0.5, 1.5, 2.5, -2.5, 999.995, 1234.56, -1234.56, 12345678.9, 1e9]) {
    const p = Math.round(r * 100); n++;
    if (money(p / 100) !== N.txlist.money(p)) out.push(`money(${r}): old ${money(p / 100)} new ${N.txlist.money(p)}`);
    if (moneyP(p / 100) !== N.txlist.moneyP(p)) out.push(`moneyP(${r}): old ${moneyP(p / 100)} new ${N.txlist.moneyP(p)}`);
  }
  // a tap the planner answered with nothing must open nothing here either (checked by the sheet comparison); taps
  // that open nothing in both are fine only when there's a reason in the data (e.g. no reserve account yet)
  if (!autoN) out.push("automatic entries: the planner made none in any case (the test checks nothing)");
  return { n, formN, autoN, fixedSaves, nothingOld: [...nothingOld], txns: live("txns").length, out, estRounding, fixedCrash };
});
// Automatic prices: the same price lists applied by the planner and by the app must leave the same holdings.
const pxOut = await f.evaluate(async () => {
  const N = window.SCREENS, out = [], td = today(), clone = (x) => JSON.parse(JSON.stringify(x));
  const HS = [
    { id: "pm1", type: "Mutual Fund", name: "F1", px: "mf:111", price: 10, priceAuto: "2026-11-01", openUnits: 100, openInvested: 1000, inclTo: "2026-01-01", navHist: [["2026-11-01", 10]], updatedAt: 1 },
    { id: "pm2", type: "Mutual Fund", name: "F2", isin: "INF1", openUnits: 5, openInvested: 90, inclTo: "2026-01-01", updatedAt: 1 },
    { id: "ps1", type: "Stock", name: "S1", px: "stk:INE1", price: 100, priceManual: true, priceDate: td, openUnits: 3, updatedAt: 1 },
    { id: "ps2", type: "Stock", name: "S2", px: "stk:INE2", price: 100, priceAuto: "2026-11-01", openUnits: 1, updatedAt: 1 },
    { id: "pu1", type: "US Stocks", name: "AAPL", px: "us:AAPL", ccy: "USD", price: 150, fx: 83, openUnits: 2, openInvested: 25000, updatedAt: 1 },
    { id: "pn1", type: "NPS", name: "NPS3", npsMode: "units", npsLines: [{ nm: "SBI PENSION FUND SCHEME E - TIER I", units: 100, price: 40 }, { px: "nps:SM001002", units: 50, price: 30 }], updatedAt: 1 },
  ];
  const tables = { mf: { date: td, rows: { "111": { p: 11.5, d: td }, "222": { p: 20.25, d: td } } }, stk: { date: td, rows: { INE1: { p: 105, d: "2026-11-20" }, INE2: { p: 150, d: td } } },
    us: { date: td, rows: { AAPL: { p: 190.5, d: td }, USDINR: { p: 84.2, d: td } }, hist: `AAPL\t180\t2026-11-10\nAAPL\t185\t2026-11-11` }, nps: { date: td, rows: { SM001001: { p: 45.5, d: td }, SM001002: { p: 33, d: td } } } };
  const names = { mf: [{ k: "222", n: "F2 fund", isin: "INF1,INF9" }], nps: [{ k: "SM001001", n: "SBI PENSION FUND SCHEME E - TIER I", f: "SBI" }, { k: "SM001002", n: "SBI PENSION FUND SCHEME C - TIER I", f: "SBI" }] };
  const base = { ...clone(S.data), holdings: [...clone(S.data.holdings || []), ...clone(HS)] };
  // the planner
  const keep = S.data; S.data = clone(base); MEMO = new Map();
  P.tables = clone(tables); P.names = clone(names); P.at = Date.now();
  const thr = () => { throw new Error("no Firebase in the test"); };
  Object.assign(H, { fb: { fs: { getDoc: thr, doc: thr, query: thr, collection: thr, where: thr, orderBy: thr, getDocs: thr, setDoc: thr } }, user: { uid: "t" }, key: true });
  const nOld = await pxApply();
  const oldH = Object.fromEntries(S.data.holdings.map((h) => [h.id, N.toStored("holdings", h)]));
  S.data = keep; MEMO = new Map();
  // the app
  const cols = {}; for (const c of Object.keys(base)) if (Array.isArray(base[c])) cols[c] = base[c].map((r) => N.toStored(c, r));
  let cur = new N.MoneyData(cols, td);
  N.setEnv({ data: () => cur, state: () => S, write: (ops) => { for (const { c, r } of ops) { const i = cols[c].findIndex((x) => x.id === r.id); if (i >= 0) cols[c][i] = r; else cols[c].push(r); } cur = new N.MoneyData(cols, td); }, refresh: () => {}, planner: () => {} });
  N.prices.pxTest(clone(tables), clone(names));
  const nNew = await N.prices.pxApply();
  const strip = (h) => { const x = { ...h }; delete x.updatedAt; return JSON.stringify(Object.keys(x).sort().reduce((a, k) => ((a[k] = x[k]), a), {})); };
  for (const h of cols.holdings) if (strip(h) !== strip(oldH[h.id] || {})) out.push(`prices: holding ${h.name} differs\n    old ${strip(oldH[h.id] || {}).slice(0, 600)}\n    new ${strip(h).slice(0, 600)}`);
  const changed = cols.holdings.filter((h) => HS.some((x) => x.id === h.id) && strip(h) !== strip(N.toStored("holdings", HS.find((x) => x.id === h.id)))).length;
  // the lists' search and the Investments line
  for (const q of ["f2", "222", "inf9", "sbi tier", "x"]) for (const src of ["mf", "nps"]) if (JSON.stringify(pxSearch(names[src], q)) !== JSON.stringify(N.prices.pxSearch(names[src], q))) out.push(`prices: search ${q} differs`);
  return { out, n: nOld, nNew, changed };
});
report.out.push(...pxOut.out);
console.log(`automatic entries: ${report.autoN} made the same way by the planner and the app`);
console.log(`automatic prices: ${pxOut.changed} test holdings priced the same way by the planner and the app`);
if (pxOut.changed < 5) report.out.push(`prices: only ${pxOut.changed} test holdings were priced (${pxOut.n} by the planner, ${pxOut.nNew} by the app)`);
await browser.close(); server.close();
const SHOW = +(process.env.SHOW || 6);
console.log(`screen parity on ${EXPORT.includes("sample") ? "the made-up sample" : "the real export"}: ${report.n} pages and sheets, ${report.formN} of them forms saved (${report.txns} transactions)${report.estRounding ? ` · ${report.estRounding} with a total ₹1 apart (half-rupee rounding)` : ""}`);
if (report.fixedSaves.length) console.log(`  (${report.fixedSaves.length} saves where the old planner lost a field or couldn't save — the new form keeps them: ${[...new Set(report.fixedSaves.map((l) => l.replace(/^(made-up|yours) /, "").replace(/^(loan|property) \S+( \S+)? /, "")))].slice(0, 6).join(", ")})`);
if (report.fixedCrash.length) console.log(`  (the old planner crashes on ${report.fixedCrash.length} of these — ${[...new Set(report.fixedCrash.map((l) => l.replace(/^(made-up|yours) /, "")))].join(", ")} — the new page shows them)`);
if (report.out.length) { console.log(`✗ ${report.out.length} differences:`); for (const x of report.out.slice(0, SHOW)) console.log("  " + x); process.exit(1); }
console.log("✓ Transactions (page, form, split, carry-over, filters, clean-up, bulk) Accounts (every section), Plan (every tab), Overview, Insights (every tab) the Advisor (page and what Claude is sent), Money settings, credit cards, loans, EPF, PPF, NPS and properties are identical to the planner's");
