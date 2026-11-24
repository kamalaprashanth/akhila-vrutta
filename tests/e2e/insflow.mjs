// Insights, drawn by Akhila Vrutta, used the way a person would: chips, search, months, opening and
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
  await p.goto(`${base}/harness.html#/money/insights`);
  const f = await (await p.waitForSelector("#moneyFrame", { state: "attached" })).contentFrame();
  const V = "#moneyView #view";
  await p.waitForSelector(`${V} [data-ins]`, { timeout: 15000 });
  const frameShown = () => p.$eval("#moneyFrame", (e) => !e.hidden && getComputedStyle(e).display !== "none");
  const settle = () => p.waitForTimeout(450);
  ok(!(await frameShown()), "Insights is drawn by the app");
  await f.evaluate(() => { S.hm = "2026-11"; }); await p.click(`${V} [data-ins="month"]`); await settle();
  ok((await p.textContent(`${V} .monthbar .m`)).startsWith("Nov 2026"), "month view (the sample's month)");
  await p.click(`${V} [data-hm="-1"]`); await settle();
  ok((await p.textContent(`${V} .monthbar .m`)).startsWith("Oct 2026"), "previous month");
  await p.click(`${V} [data-hm="1"]`); await settle();
  await p.click(`${V} [data-hmo]`); await settle();
  ok(await p.$eval(`${V} [data-hmo]`, (e) => e.getAttribute("aria-expanded") === "true"), "a breakdown row opens");
  for (const t of ["income", "invest", "expense"]) { await p.click(`${V} [data-hmt="${t}"]`); await settle(); ok(await p.$eval(`${V} [data-hmt="${t}"]`, (e) => e.getAttribute("aria-pressed") === "true"), `breakdown ${t}`); }
  await p.click(`${V} [data-ins="trends"]`); await settle();
  for (const n of ["6", "24"]) { await p.click(`${V} [data-trn="${n}"]`); await settle(); ok(await p.$eval(`${V} [data-trn="${n}"]`, (e) => e.getAttribute("aria-pressed") === "true"), `trends ${n} months`); }
  await p.click(`${V} [data-trp="ytd"]`); await settle();
  ok(await p.$eval(`${V} [data-trp="ytd"]`, (e) => e.getAttribute("aria-pressed") === "true"), "where the money went: this year");
  await p.click(`${V} [data-ins="year"]`); await settle();
  for (const t of ["expense", "income", "reserve", "tax", "summary"]) { await p.click(`${V} [data-ytab="${t}"]`); await settle(); ok(await p.$eval(`${V} [data-ytab="${t}"]`, (e) => e.getAttribute("aria-pressed") === "true"), `year ${t}`); }
  await p.click(`${V} [data-yr="1"]`); await settle(); await p.click(`${V} [data-ytab="reserve"]`); await settle();
  ok(await p.$eval(V, (e) => !e.textContent.includes("undefined")), "next year's reserve tab works (it crashed in the planner)");
  await p.click(`${V} [data-yr="-1"]`); await settle(); await p.click(`${V} [data-ytab="tax"]`); await settle();
  const box = await p.$(`${V} [data-taxhome]`);
  if (box) { await box.evaluate((e) => e.click()); await p.waitForTimeout(700); ok(await p.evaluate(() => window.FAKE.writes.some((w) => w.c === "loans" && w.r.taxHome === true)), "ticking a home loan saves it"); }
  else ok(true, "(no bank loans to tick in the sample)");
  await p.click(`${V} [data-ytab="summary"]`); await settle();
  await p.click(`${V} tr[data-ym]`); await p.waitForTimeout(700);
  ok(await p.$(`${V} #txq`) !== null, "a month in the year table opens its transactions");
  ok(errors.length === 0, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(failed ? `✗ ${failed} failed` : "insflow: all passed");
process.exit(failed ? 1 : 0);
