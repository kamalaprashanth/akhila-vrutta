// Accounts, drawn by Akhila Vrutta, used the way a person would: chips, search, months, opening and
// saving an entry (in the planner's form), selecting and tagging, filters, clean-up, other tabs, links
// and the pages and forms that still open in the planner. Runs on the made-up sample, phone and laptop.
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
  await p.waitForSelector(`${V} .nwh`, { timeout: 15000 });
  const frameShown = () => p.$eval("#moneyFrame", (e) => !e.hidden && getComputedStyle(e).display !== "none");
  const settle = () => p.waitForTimeout(450);
  const pressed = () => p.$eval(`${V} .accseg [aria-pressed="true"]`, (e) => e.dataset.acct);

  ok(!(await frameShown()), "Accounts is drawn by the app; the planner frame is hidden");
  ok((await p.textContent(`${V} .nwh`)).includes("Net worth at the end of"), "net worth heading");
  for (const t of ["banks", "invest", "loans", "props", "overview"]) {
    await p.click(`${V} .accseg [data-acct="${t}"]`); await settle();
    ok((await pressed()) === t, `section ${t}`);
  }
  ok(await f.evaluate(() => S.accTab === "overview" && localStorage.getItem("kpmp.ui.accTab") === '"overview"'), "the section is remembered (as the planner did)");
  await p.click(`${V} .acct[data-acct="banks"]`); await settle();
  ok((await pressed()) === "banks", "a tile opens its section");
  ok(await p.$eval(V, (e) => e.textContent.includes("Test Bank") && e.textContent.includes("Credit cards")), "banks and cards listed");

  // A card opens its page (drawn here): tabs, earlier statements, Pay bill (the planner's form), back.
  await p.click(`${V} [data-card]`); await p.waitForTimeout(700);
  ok(!(await frameShown()) && await f.evaluate(() => S.view === "card") && /Credit card/.test(await p.textContent(`${V} .monthbar`)), "a card opens its page (drawn by the app)");
  if (await p.$(`${V} [data-ct="unbilled"]`)) {
    await p.click(`${V} [data-ct="unbilled"]`); await settle();
    ok(await p.$eval(`${V} [data-ct="unbilled"]`, (e) => e.getAttribute("aria-pressed") === "true") && /unbilled since/.test(await p.textContent(V)), "Unbilled tab");
    await p.click(`${V} [data-ct="billed"]`); await settle();
    const span = await p.textContent(`${V} .monthbar .m`);
    await p.click(`${V} [data-cyc="1"]`); await settle();
    ok((await p.textContent(`${V} .monthbar .m`)) !== span && await p.$eval(`${V} [data-cyc="-1"]`, (e) => !e.disabled), "‹ shows the earlier statement");
  }
  await p.click(`${V} [data-ca="pay"]`); await settle();
  ok(!(await frameShown()) && await p.$eval("#mvLayer #tseg [data-k=transfer]", (e) => e.getAttribute("aria-pressed") === "true") && /bill/.test(await p.inputValue("#mvLayer #f_note")), "Pay bill opens the app's transfer form, noted as the bill");
  await p.click("#mvLayer #modal #cx"); await settle();
  ok(!(await p.$("#mvLayer #modal .sheet")) && await f.evaluate(() => S.view === "card"), "…and closes back to the card");
  await p.click(`${V} .monthbar [data-go="accounts"]`); await p.waitForTimeout(700);
  ok(!(await frameShown()) && (await pressed()) === "banks", "back on Accounts, same section");

  // + Add account: the app's own form. A new card, saved in paise, then listed.
  const L = "#mvLayer #modal";
  await p.click(`${V} #addAcc`); await settle();
  ok(!(await frameShown()) && /Add account/.test(await p.textContent(`${L} h3`)), "+ Add account opens the app's form");
  ok(await p.$eval(`${L} #g_card`, (e) => e.hidden), "…card settings hidden for a bank");
  await p.selectOption(`${L} #f_type`, "card"); await settle();
  ok(await p.$eval(`${L} #g_card`, (e) => !e.hidden) && await p.$eval(`${L} #g_bank`, (e) => e.hidden), "…shown once the type is Credit card");
  await p.fill(`${L} #f_name`, "Flow card"); await p.fill(`${L} #f_opening`, "1500"); await p.click(`${L} [data-neg="f_opening"]`);
  await p.fill(`${L} #f_stmtDay`, "5"); await p.fill(`${L} #f_dueDay`, "25"); await p.fill(`${L} #f_limit`, "100000");
  const before = await f.evaluate(() => S.data.accounts.length);
  await p.click(`${L} #sv`); await p.waitForTimeout(900);
  const nc = await f.evaluate(() => S.data.accounts.find((a) => a.name === "Flow card"));
  ok(await f.evaluate(() => S.data.accounts.length) === before + 1 && nc?.opening === -1500 && nc?.limit === 100000 && nc?.stmtDay === 5, `saved: owes ₹1,500, limit ₹1,00,000, statement on the 5th (${JSON.stringify(nc && { o: nc.opening, l: nc.limit, s: nc.stmtDay })})`);
  ok(!(await p.$(`${L} .sheet`)) && /Flow card/.test(await p.textContent(V)), "…the sheet closes and the card is listed");
  // Editing it: Delete asks first, Cancel keeps it.
  await p.click(`${V} [data-card="${nc.id}"]`); await settle();
  await p.click(`${V} [data-ca="edit"]`); await settle();
  ok(/Edit account/.test(await p.textContent(`${L} h3`)) && (await p.inputValue(`${L} #f_limit`)) === "1,00,000", "Edit card opens the app's form with the limit");
  await p.click(`${L} #dl`); await settle();
  ok(/Are you sure/.test(await p.textContent(`${L} h3`)), "Delete asks first");
  await p.click(`${L} #cn`); await settle();
  ok(await f.evaluate((id) => !S.data.accounts.find((a) => a.id === id).deleted, nc.id), "…Cancel keeps it");
  await p.click(`${V} .monthbar [data-go="accounts"]`); await settle();

  // Loans: the payoff plan's settings are remembered and redraw the plan.
  await p.click(`${V} .accseg [data-acct="loans"]`); await settle();
  ok(await p.$eval(V, (e) => e.textContent.includes("Sample loan")), "the loan is listed");
  if (await p.$(`${V} #f_poExtra`)) {
    await p.fill(`${V} #f_poExtra`, "20,000"); await p.press(`${V} #f_poExtra`, "Tab"); await settle();
    ok(await f.evaluate(() => prefGet("poExtra", 0) === 20000), "extra each month is saved as ₹20,000 (commas understood)");
    await p.click(`${V} [data-po="snow"]`); await settle();
    ok(await p.$eval(`${V} [data-po="snow"]`, (e) => e.getAttribute("aria-pressed") === "true"), "smallest-first order");
  } else ok(false, "the payoff plan shows");
  // A loan opens its page (drawn here): the part-payment calculator, tabs, a form.
  await p.click(`${V} [data-loan]`); await p.waitForTimeout(700);
  ok(!(await frameShown()) && await f.evaluate(() => S.view === "loan") && !!(await p.$(`${V} .tiles`)), "a loan opens its page (drawn by the app)");
  if (await p.$(`${V} #spGo`)) {
    await p.click(`${V} #spGo`); await settle();
    ok(!(await p.$(`${V} .simout`)), "Work it out with nothing typed: nothing worked out");
    await p.fill(`${V} #f_spAmt`, "1,00,000"); await p.click(`${V} #spGo`); await settle();
    ok(!!(await p.$(`${V} .simout`)) && /Interest saved/.test(await p.textContent(`${V} .simout`)), "a part payment of ₹1,00,000 shows the interest saved");
    await p.click(`${V} [data-spm="emi"]`); await settle();
    ok(/New EMI/.test(await p.textContent(`${V} .simout`)) && /^1,?00,?000$/.test(await p.inputValue(`${V} #f_spAmt`)), "keep end date: a new EMI, the amount kept");
    await p.click(`${V} #spClr`); await settle();
    ok(!(await p.$(`${V} .simout`)), "Clear");
  } else ok(false, "the calculator shows");
  await p.click(`${V} [data-lt="history"]`); await settle();
  ok(await p.$eval(`${V} [data-lt="history"]`, (e) => e.getAttribute("aria-pressed") === "true") && /History/i.test(await p.textContent(V)), "History tab");
  await p.click(`${V} [data-la="edit"]`); await settle();
  ok(!(await frameShown()) && /Edit loan/.test(await p.textContent("#mvLayer #modal h3")), "Edit opens the app's loan form");
  await p.click("#mvLayer #modal #cx"); await settle();
  // A part payment, saved in paise; its toast says what changed.
  if (await p.$(`${V} [data-la="prepay"]`)) {
    const n0 = await f.evaluate(() => S.data.txns.filter((t) => t.act === "prepay" && t.loanId === S.loanId).length);
    await p.click(`${V} [data-la="prepay"]`); await settle();
    await p.fill("#mvLayer #f_amount", "10,000");
    if (await p.$('#mvLayer input[name="mode"]')) await p.click('#mvLayer input[name="mode"][value="tenure"]');
    await p.click("#mvLayer #modal #sv"); await p.waitForTimeout(900);
    const pp = await f.evaluate(() => S.data.txns.filter((t) => t.act === "prepay" && t.loanId === S.loanId));
    ok(pp.length === n0 + 1 && pp.some((t) => t.amount === 10000), "a ₹10,000 part payment is saved on the loan");
    ok(/interest saved|Saved|Added|closed/i.test(await p.textContent("#mvLayer").catch(() => "")), "…and a message says what it changed");
  }
  await p.evaluate(() => { location.hash = "#/money/accounts"; }); await p.waitForTimeout(700);

  // Net worth range and the chart's tooltip.
  await p.click(`${V} .accseg [data-acct="overview"]`); await settle();
  if (await p.$(`${V} [data-nwn="12"]`)) {
    await p.click(`${V} [data-nwn="12"]`); await settle();
    ok(await p.$eval(`${V} [data-nwn="12"]`, (e) => e.getAttribute("aria-pressed") === "true"), "net worth range: 1 year");
    const hit = await p.$(`${V} svg[data-ch] .hit`);
    await hit.hover(); await p.waitForTimeout(200);
    ok(await p.$eval("#ctip", (e) => !e.hidden && e.textContent.includes("Net worth")), "the chart shows a tooltip");
  } else ok(true, "(no net worth history in the sample)");

  // Investments: + Add opens the app's holding form; a new fund is saved and listed; tapping it opens it again.
  await p.click(`${V} .accseg [data-acct="invest"]`); await settle();
  await p.click(`${V} #addHold`); await settle();
  ok(!(await frameShown()) && /Add investment/.test(await p.textContent("#mvLayer #modal h3")), "+ Add investment opens the app's form");
  await p.fill("#mvLayer #f_name", "Test Flexi Cap Fund"); await p.fill("#mvLayer #f_openInvested", "25,000"); await p.fill("#mvLayer #f_openUnits", "250"); await p.fill("#mvLayer #f_price", "110");
  await p.click("#mvLayer #modal #sv"); await settle();
  ok(/₹27,500 worth now/.test(await p.innerText(V)), "the new investment counts (₹27,500 worth now)");
  if (await p.$(`${V} [data-hg]`)) { await p.click(`${V} [data-hg]`); await settle(); }
  ok((await p.innerText(V)).includes("Test Flexi Cap Fund"), "…and is listed under Mutual Fund");
  const nh = await p.$(`${V} [data-hold]:has-text("Test Flexi Cap Fund")`);
  if (nh) { await nh.click(); await settle(); ok(/Test Flexi Cap Fund/.test(await p.textContent("#mvLayer #modal h3")) && /value ₹27,500/.test(await p.textContent("#mvLayer #hcalc")), "…opens again with its value (250 × ₹110)"); await p.click("#mvLayer #modal #cx"); await settle(); }
  else ok(false, "…its row can be tapped");

  ok(errors.length === 0, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(failed ? `✗ ${failed} failed` : "accflow: all passed");
process.exit(failed ? 1 : 0);
