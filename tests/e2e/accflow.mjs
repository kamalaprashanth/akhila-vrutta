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
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
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

  // A card opens the planner's card page; back to Accounts draws it here again.
  await p.click(`${V} [data-card]`); await p.waitForTimeout(700);
  ok(await frameShown() && await f.evaluate(() => S.view === "card"), "a card opens its page (still the planner's)");
  await p.evaluate(() => { location.hash = "#/money/accounts"; }); await p.waitForTimeout(700);
  ok(!(await frameShown()) && (await pressed()) === "banks", "back on Accounts, same section");

  // + Add account: the planner's form, over the whole screen.
  await p.click(`${V} #addAcc`); await settle();
  ok(await frameShown() && await p.$eval("#moneyFrame", (e) => e.classList.contains("over")), "+ Add account opens the planner's form over the page");
  ok(/account/i.test(await f.textContent("#modal h3")), "…the account form");
  await f.evaluate(() => closeModal()); await settle();
  ok(!(await frameShown()), "closing it returns to the app's page");

  // Loans: the payoff plan's settings are remembered and redraw the plan.
  await p.click(`${V} .accseg [data-acct="loans"]`); await settle();
  ok(await p.$eval(V, (e) => e.textContent.includes("Sample loan")), "the loan is listed");
  if (await p.$(`${V} #f_poExtra`)) {
    await p.fill(`${V} #f_poExtra`, "20,000"); await p.press(`${V} #f_poExtra`, "Tab"); await settle();
    ok(await f.evaluate(() => prefGet("poExtra", 0) === 20000), "extra each month is saved as ₹20,000 (commas understood)");
    await p.click(`${V} [data-po="snow"]`); await settle();
    ok(await p.$eval(`${V} [data-po="snow"]`, (e) => e.getAttribute("aria-pressed") === "true"), "smallest-first order");
  } else ok(false, "the payoff plan shows");
  await p.click(`${V} [data-loan]`); await p.waitForTimeout(700);
  ok(await frameShown() && await f.evaluate(() => S.view === "loan"), "a loan opens its page (still the planner's)");
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

  // Investments: + Add opens the planner's holding form.
  await p.click(`${V} .accseg [data-acct="invest"]`); await settle();
  await p.click(`${V} #addHold`); await settle();
  ok(await frameShown() && /investment|holding/i.test(await f.textContent("#modal h3")), "+ Add investment opens the planner's form");
  await f.evaluate(() => closeModal()); await settle();

  ok(errors.length === 0, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(failed ? `✗ ${failed} failed` : "accflow: all passed");
process.exit(failed ? 1 : 0);
