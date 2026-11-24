// The EPF, PPF, NPS and property pages, drawn by Akhila Vrutta, used the way a person would. The sample has
// none of these, so they're added first through the planner (saved the normal way), then opened from Accounts.
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const EXPORT = "tests/fixtures/sample-export.json";
const harness = (await build({ entryPoints: ["tests/parity/harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
const T = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/export.json") return res.writeHead(200, { "content-type": T[".json"] }).end(await readFile(EXPORT));
  if (url === "/harness.js") return res.writeHead(200, { "content-type": T[".js"] }).end(harness);
  if (url === "/harness.html") return res.writeHead(200, { "content-type": T[".html"] }).end('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/money/mv.css"><main id="main"></main><script type="module" src="/harness.js"></script>');
  let file = join("dist", normalize(url).replace(/^(\.\.[/\\])+/, "")); if (!extname(file)) file += ".html";
  try { res.writeHead(200, { "content-type": T[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let failed = 0;
const ok = (cond, what) => { if (cond) console.log(`  ✓ ${what}`); else { failed++; console.error(`  ✗ ${what}`); } };

// A payment-plan PDF like a builder's agreement, printed by the browser.
const PLAN_PDF = await (async () => {
  const b = await chromium.launch(), pg = await b.newPage();
  await pg.setContent(`<h3>PAYMENT PLAN</h3><table style="font:14px sans-serif;border-spacing:40px 6px">
    <tr><td>On Booking</td><td>10%</td><td>900000</td><td>45000</td></tr>
    <tr><td>On Agreement</td><td>10%</td><td>900000</td><td>45000</td></tr>
    <tr><td>On Completion of 6th Floor Slab</td><td>6.0%</td><td>1217655</td><td>60883</td></tr>
    <tr><td>Grand Total</td><td></td><td>9500000</td><td></td></tr></table>`);
  const buf = await pg.pdf({ format: "A4" }); await b.close(); return buf;
})();
const ADD = () => {
  const nowM = ymOf(today()), ym1 = addM(nowM, -1), acc = live("accounts")[0].id;
  upsert("holdings", { id: "hp", type: "PPF", instrument: "PPF2", name: "PPF2", rate: 7.1, ppf: { opened: "2018-05-01", stmtDate: `${addM(nowM, -3)}-01`, rows: [{ k: "dep", d: "2025-05-01", amt: 1000 }, { k: "int", d: "2026-03-31", amt: 71.25 }],
    manual: [{ id: "m1", k: "dep", d: `${ym1}-04`, amt: 500 }] } });
  upsert("holdings", { id: "he", type: "EPF", name: "EPF2", epf: { rate: 8.25, dob: "1990-06-15", books: { A: { est: "TEST EMPLOYER PVT LTD", fys: { 2025: { ob: [1000, 800, 300], rows: [{ k: "cont", wm: "2025-05", d: "2025-06-15", wage: 15000, epsw: 15000, emp: 1800, er: 550, eps: 1250 }] } } } },
    manual: [{ id: "e1", k: "cont", wm: ym1, d: `${nowM}-01`, emp: 1800, er: 550, eps: 1250, epsw: 15000 }] } });
  upsert("holdings", { id: "hn", type: "NPS", instrument: "NPS2", name: "NPS2", npsMode: "units", unitsAsOf: `${ym1}-15`, yearly: 50000,
    npsLines: [{ k: "E", units: 3456.789, price: 45.6789 }, { nm: "Scheme C - Tier I", units: 1200.1, price: 38.12 }],
    nps: { alloc: { E: 75, C: 10, G: 15 }, retireAge: 60, dob: "1990-06-15", contrib: 300000, stmtDate: `${ym1}-15` } });
  upsert("props", { id: "pz", name: "Test flat", kind: "flat", place: "Whitefield", status: "construction", since: "2025-02-01", value: 9000000, nw: true,
    plan: [{ id: "a", name: "Slab 3", amt: 900000, gst: 45000, when: `${addM(nowM, 1)}-10`, who: "split", tds: true }, { id: "c", name: "Interiors", amt: 300000, who: "you" }] });
  upsert("propItems", { id: "pi1", prop: "pz", cat: "token", amt: 100000, date: "2025-02-01", accountId: acc });
};

for (const [name, vp] of [["phone", { width: 390, height: 844 }], ["laptop", { width: 1280, height: 860 }]]) {
  console.log(name);
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route(/fonts\.g/, (r) => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/harness.html#/money/accounts`);
  const f = await (await p.waitForSelector("#moneyFrame", { state: "attached" })).contentFrame();
  const V = "#moneyView #view";
  await p.waitForSelector(`${V} .accseg`, { timeout: 15000 });
  await f.waitForFunction(() => typeof S === "object" && !!S.data);
  const settle = () => p.waitForTimeout(500);
  const frameShown = () => p.$eval("#moneyFrame", (e) => !e.hidden && getComputedStyle(e).display !== "none");
  const pressed = (sel) => p.$eval(sel, (e) => e.getAttribute("aria-pressed") === "true");
  const view = () => f.evaluate(() => S.view);
  const appForm = async (sel, re, what) => {
    await p.click(sel); await settle();
    ok(!(await frameShown()) && re.test(await p.textContent("#mvLayer #modal h3").catch(() => "")), `${what} opens the app's form`);
    await p.click("#mvLayer #modal #cx"); await settle();
  };
  const formOpens = async (sel, re, what) => {
    await p.click(sel); await settle();
    ok(await frameShown() && re.test(await f.textContent("#modal h3").catch(() => "")), `${what} opens the planner's form`);
    await f.evaluate(() => closeModal()); await settle();
    ok(!(await frameShown()), "…and closes back to the page");
  };
  await f.evaluate(ADD); await p.waitForTimeout(1200);
  ok(await f.evaluate(() => ["hp", "he", "hn"].every((id) => byId("holdings", id)) && !!byId("props", "pz")), "test EPF, PPF, NPS and property saved");

  // EPF from Investments.
  await p.click(`${V} .accseg [data-acct="invest"]`); await settle();
  await p.click(`${V} [data-hold="he"]`); await settle();
  ok(!(await frameShown()) && (await view()) === "epf" && /EPF balance/i.test(await p.textContent(V)), "EPF opens (drawn by the app)");
  ok(/Test Employer/.test(await p.textContent(V)), "…with the employer's name tidied");
  for (const t of ["passbook", "projection", "pension", "overview"]) { await p.click(`${V} [data-et="${t}"]`); await settle(); ok(await pressed(`${V} [data-et="${t}"]`), `EPF ${t} tab`); }
  await p.click(`${V} [data-et="passbook"]`); await settle();
  const chip = await p.$(`${V} [data-efy]:not([aria-pressed="true"])`);
  if (chip) { const y = await chip.getAttribute("data-efy"); await chip.click(); await settle(); ok(await pressed(`${V} [data-efy="${y}"]`), "a passbook year"); }
  if (await p.$(`${V} [data-epfm]`)) await appForm(`${V} [data-epfm]`, /EPF entry/i, "an entry you added");
  await appForm(`${V} [data-ea="add"]`, /EPF entry/i, "Add entry");
  // An EPF month added by hand, saved in paise on the holding.
  await p.click(`${V} [data-ea="add"]`); await settle();
  await p.fill("#mvLayer #f_emp", "2,000"); await p.fill("#mvLayer #f_er", "611"); await p.click("#mvLayer #modal #sv"); await p.waitForTimeout(900);
  ok(await f.evaluate(() => (byId("holdings", "he").epf.manual || []).some((m) => m.emp === 2000 && m.er === 611 && m.k === "cont")), "…a ₹2,000 + ₹611 month is saved");
  ok(await p.$eval(`${V} #epfPdfV`, (e) => e.type === "file" && e.multiple), "Load passbooks has its file picker");
  // The PDF reading is still the planner's: the chosen files reach it (stubbed here; no real passbook in the test).
  await f.evaluate(() => { window.__got = null; window.epfPdfToHolding = (h, files) => { window.__got = [h.id, files.length, files[0].name]; }; });
  await p.setInputFiles(`${V} #epfPdfV`, { name: "passbook.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") }); await settle();
  ok(JSON.stringify(await f.evaluate(() => window.__got)) === '["he",1,"passbook.pdf"]', "chosen passbooks reach the planner's reader");
  await p.click(`${V} .monthbar [data-go="accounts"]`); await settle();
  ok((await view()) === "accounts", "‹ back to Accounts");

  // PPF.
  await p.click(`${V} .accseg [data-acct="invest"]`); await settle();
  await p.click(`${V} [data-hold="hp"]`); await settle();
  ok(!(await frameShown()) && (await view()) === "ppf" && /PPF balance/i.test(await p.textContent(V)), "PPF opens (drawn by the app)");
  for (const t of ["statement", "projection", "overview"]) { await p.click(`${V} [data-pt2="${t}"]`); await settle(); ok(await pressed(`${V} [data-pt2="${t}"]`), `PPF ${t} tab`); }
  await appForm(`${V} [data-pa="add"]`, /PPF/i, "Add entry");
  await p.click(`${V} [data-pa="add"]`); await settle();
  await p.fill("#mvLayer #f_amt", "12,000"); await p.click("#mvLayer #modal #sv"); await p.waitForTimeout(900);
  const dep = await f.evaluate(() => S.data.txns.find((t) => t.instrument === "PPF2" && t.amount === 12000));
  ok(dep && dep.accountId, "a PPF deposit is saved as an entry from its account (the planner lost the account)");
  await p.click(`${V} .monthbar [data-go="accounts"]`); await settle();

  // NPS.
  await p.click(`${V} .accseg [data-acct="invest"]`); await settle();
  await p.click(`${V} [data-hold="hn"]`); await settle();
  ok(!(await frameShown()) && (await view()) === "nps" && /NPS value/i.test(await p.textContent(V)), "NPS opens (drawn by the app)");
  for (const t of ["entries", "projection", "overview"]) { await p.click(`${V} [data-nt="${t}"]`); await settle(); ok(await pressed(`${V} [data-nt="${t}"]`), `NPS ${t} tab`); }
  await appForm(`${V} [data-na="units"]`, /statement/i, "Update from statement");
  await p.click(`${V} [data-na="units"]`); await settle();
  await p.fill("#mvLayer #f_u0", "3600"); await p.click("#mvLayer #modal #sv"); await p.waitForTimeout(900);
  ok(await f.evaluate(() => byId("holdings", "hn").npsLines[0].units === 3600), "…new units are saved");
  await p.click(`${V} .monthbar [data-go="accounts"]`); await settle();

  // Property.
  await p.click(`${V} .accseg [data-acct="props"]`); await settle();
  await p.click(`${V} [data-prop="pz"]`); await settle();
  ok(!(await frameShown()) && (await view()) === "prop" && /Test flat/.test(await p.textContent(`${V} .monthbar`)), "a property opens (drawn by the app)");
  for (const t of ["payments", "loan", "expected"]) { await p.click(`${V} [data-ptab="${t}"]`); await settle(); ok(await pressed(`${V} [data-ptab="${t}"]`), `property ${t} tab`); }
  // A real payment-plan PDF (made here), read on this device by the app: the rows it finds go into Expected.
  p.on("console", (m) => { if (process.env.DBG) console.log("console:", m.text()); });
  await p.setInputFiles(`${V} #planPdf`, { name: "plan.pdf", mimeType: "application/pdf", buffer: PLAN_PDF }); await p.waitForTimeout(2500);
  if (process.env.DBG) console.log("toasts:", await p.$$eval(".toast", (t) => t.map((x) => x.textContent)));
  const L = "#mvLayer #modal";
  ok(/Payment plan found/.test(await p.textContent(`${L} h3`).catch(() => "")) && (await p.$$(`${L} .list .row`)).length === 3, "a payment plan PDF is read: 3 payments found");
  ok(await p.$eval(`${L} .list input[data-i="0"]`, (e) => e.checked) && !(await p.$eval(`${L} .list input[data-i="2"]`, (e) => e.checked)), "…booking ticked as paid, the slab not");
  await p.click(`${L} #sv`); await p.waitForTimeout(900);
  const plan = await f.evaluate(() => S.data.props.find((x) => x.id === "pz").plan);
  ok(plan.length === 5 && plan.some((r) => r.name === "Booking" && r.done && r.amt === 900000) && plan.some((r) => /6th Floor Slab/.test(r.name) && !r.done && r.gst === 60883), "…saved to Expected (₹9,00,000 booking done; slab with its GST)");
  await p.fill(`${V} [data-lsearch]`, "slab"); await settle();
  ok(await p.$$eval(`${V} [data-pplan]`, (r) => r.filter((x) => !x.hidden).length === 2 && r.length === 5), "searching the expected payments");
  await p.fill(`${V} [data-lsearch]`, ""); await settle();
  // An expected payment, changed and saved (the planner couldn't save this form).
  await p.click(`${V} [data-pplan="c"]`); await settle();
  ok(!(await frameShown()) && /Interiors/.test(await p.textContent(`${L} h3`)), "an expected payment opens the app's form");
  await p.fill(`${L} #f_xa`, "3,50,000"); await p.selectOption(`${L} #f_xwho`, "split"); await p.click(`${L} #sv`); await p.waitForTimeout(900);
  const c1 = await f.evaluate(() => S.data.props.find((x) => x.id === "pz").plan.find((r) => r.id === "c"));
  ok(c1.amt === 350000 && c1.who === "split", `…saved: ₹3,50,000, bank / you (${JSON.stringify({ amt: c1.amt, who: c1.who })})`);
  await p.click(`${V} [data-pact="edit"]`); await settle();
  ok(/Edit property/.test(await p.textContent(`${L} h3`)) && (await p.inputValue(`${L} #f_pv`)) === "90,00,000", "Edit opens the app's form with the agreement value");
  await p.click(`${L} #cx`); await settle();
  await p.click(`${V} .monthbar [data-acct="props"]`); await settle();
  ok((await view()) === "accounts" && await pressed(`${V} .accseg [data-acct="props"]`), "‹ back to Properties");
  ok(errors.length === 0, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(failed ? `✗ ${failed} failed` : "detflow: all passed");
process.exit(failed ? 1 : 0);
