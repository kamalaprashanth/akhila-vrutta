// Money settings, drawn by Akhila Vrutta, used the way a person would: the checklist, the profile, payers,
// reminders, tags, categories and backups, whose forms still open in the planner. Phone and laptop.
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
  await p.goto(`${base}/harness.html#/money/more`);
  const f = await (await p.waitForSelector("#moneyFrame", { state: "attached" })).contentFrame();
  const V = "#moneyView #view";
  await p.waitForSelector(`${V} [data-prof]`, { timeout: 15000 });
  await f.waitForFunction(() => typeof S === "object" && !!S.data);
  const settle = () => p.waitForTimeout(500);
  const frameShown = () => p.$eval("#moneyFrame", (e) => !e.hidden && getComputedStyle(e).display !== "none");
  const plannerSheet = () => f.evaluate(() => !!document.querySelector("#modal .sheet, #modal h3"));
  const closeIt = async () => { await f.evaluate(() => closeModal()); await settle(); };
  ok(!(await frameShown()), "Money settings is drawn by the app");
  ok((await p.$$(`${V} [data-prof]`)).length === 7, "seven profile sections");
  ok(/\d+ transactions · \d+ regular items/.test(await p.innerText(V)), "the backup card counts the data");
  ok(!(await p.$(`${V} #syncNow`)) && !(await p.$(`${V} #imp25`)), "no Drive or old import sections here");
  const appSheet = () => p.$eval("#mvLayer #modal", (e) => !!e.querySelector(".sheet")).catch(() => false);
  for (const [sel, what] of [[`${V} #addPayer`, "Add payer"], [`${V} [data-payer]`, "a payer"], [`${V} #addCat`, "Add category"]]) {
    if (!(await p.$(sel))) { ok(false, `${what}: not on the page`); continue; }
    await p.evaluate((s) => { const el = document.querySelector(s); el.closest("details")?.setAttribute("open", ""); el.scrollIntoView(); }, sel);
    await p.click(sel); await settle();
    ok(await appSheet() && !(await frameShown()), `${what} opens the app's form`);
    await p.click("#mvLayer #modal #cx"); await settle();
    ok(!(await appSheet()), "…and closes");
  }
  for (const [sel, what] of [[`${V} [data-prof="about"]`, "About me"], [`${V} #restore`, "Restore from backup"]]) {
    if (!(await p.$(sel))) { ok(false, `${what}: not on the page`); continue; }
    await p.evaluate((s) => { const el = document.querySelector(s); el.closest("details")?.setAttribute("open", ""); el.scrollIntoView(); }, sel);
    await p.click(sel); await settle();
    ok(await plannerSheet() && await p.$eval("#moneyFrame", (e) => e.classList.contains("over")), `${what} opens its form full screen`);
    await closeIt();
    ok(!(await p.$eval("#moneyFrame", (e) => e.classList.contains("over"))) && !(await frameShown()), "…and closes back to Money settings");
  }
  // A category from the list.
  await p.evaluate(() => document.querySelectorAll("#moneyView details.fm").forEach((d) => d.setAttribute("open", "")));
  await p.click(`${V} .row[data-cat]`); await settle();
  ok(await appSheet() && /Edit category/.test(await p.textContent("#mvLayer #modal h3")), "a category opens its form"); await p.click("#mvLayer #modal #cx"); await settle();
  // Something the app saves elsewhere, drawn again here: a new payer saved through the planner shows up.
  const before = (await p.$$(`${V} [data-payer]`)).length;
  await p.click(`${V} #addPayer`); await settle();
  await p.fill("#mvLayer #modal #f_name", "Test payer"); await p.click('#mvLayer #modal input[name="own"][value="0"]'); await p.fill("#mvLayer #modal #f_tag", "Home");
  await p.click("#mvLayer #modal #sv"); await settle(); await settle();
  const np = await f.evaluate(() => S.data.payers.find((x) => x.name === "Test payer"));
  ok(np && np.own === false && np.tag === "Home", "…saved as someone else's money, tagged Home");
  ok((await p.$$(`${V} [data-payer]`)).length === before + 1 && (await p.innerText(V)).includes("Test payer"), "a new payer shows on the page");
  ok(errors.length === 0, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(failed ? `✗ ${failed} failed` : "moreflow: all passed");
process.exit(failed ? 1 : 0);
