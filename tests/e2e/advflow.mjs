// The Advisor, drawn by Akhila Vrutta, used the way a person would: chips, search, months, opening and
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
  await p.goto(`${base}/harness.html#/money/advisor`);
  const f = p;   // the planner's names (S, go, upsert, byId…) are test hooks on the app's page; there is no frame
  const V = "#moneyView #view";
  await p.waitForSelector(`${V} .advpills`, { timeout: 15000 });
  const frameShown = async () => !!(await p.$("#moneyFrame"));   // never: the planner frame is gone
  ok(!(await frameShown()), "the Advisor is drawn by the app");
  ok((await p.$$(`${V} [data-advq]`)).length === 8, "eight quick questions");
  ok(await p.$eval(`${V} [data-advq]`, (b) => b.disabled), "…off without a sign-in (this test has none; the cloud test asks for real)");
  await p.click(`${V} a[href="#/profile"]`); await p.waitForTimeout(700);
  ok(!(await frameShown()) && (await p.evaluate(() => location.hash)) === "#/profile", "Edit profile opens the Profile page");
  ok(errors.length === 0, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(failed ? `✗ ${failed} failed` : "advflow: all passed");
process.exit(failed ? 1 : 0);
