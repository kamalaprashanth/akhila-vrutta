// Search everything, used the way a person would on a phone (Thursday 26 Nov 2026), over the sample Money data
// and what the other flows made (test-results/seed): the 🔍 opens it, results come grouped by section with the
// words marked, the chips narrow it, an amount finds entries, a result opens its page (a transaction its form).
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const seed = {};
for (const f of await readdir("test-results/seed")) for (const [c, l] of Object.entries(JSON.parse(await readFile(join("test-results/seed", f), "utf8")))) if (!["txns", "accounts", "categories", "recurring", "goals", "loans", "holdings", "settings", "payers", "snaps", "trades", "views", "propItems"].includes(c)) (seed[c] ??= []).push(...l);
const harness = (await build({ entryPoints: ["tests/e2e/layout-harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
const shell = (await readFile("dist/index.html", "utf8")).replace(/<script src="config.js"><\/script>/, "").replace('src="app.js"', 'src="/harness.js"').replace(/<link[^>]*fonts\.g[^>]*>/g, "");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/export.json") return res.end(await readFile("tests/fixtures/sample-export.json"));
  if (url === "/seed.json") return res.end(JSON.stringify(seed));
  if (url === "/harness.js") return res.writeHead(200, { "content-type": T[".js"] }).end(harness);
  if (url === "/shell.html") return res.writeHead(200, { "content-type": T[".html"] }).end(shell);
  const file = join("dist", normalize(url).replace(/^(\.\.[/\\])+/, ""));
  try { res.writeHead(200, { "content-type": T[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch();
let failed = 0;
const ok = (c, w) => { if (c) console.log(`  ✓ ${w}`); else { failed++; console.error(`  ✗ ${w}`); } };
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await ctx.route(/fonts\.g/, (r) => r.abort());
const p = await ctx.newPage();
const errors = []; p.on("pageerror", (e) => errors.push(e.message));
await p.clock.setFixedTime(new Date(2026, 10, 26, 10, 0));
await p.goto(`http://127.0.0.1:${server.address().port}/shell.html#/today`);
await p.waitForSelector(".tdy", { timeout: 20000 });
await p.click("#searchBtn"); await p.waitForSelector("#srIn");
await p.waitForTimeout(200); const dbg = await p.evaluate(() => [location.hash, document.activeElement?.id, document.activeElement?.tagName]); ok(dbg[0] === "#/search" && dbg[1] === "srIn", `the 🔍 opens Search with the cursor in the box (${dbg})`);
ok(/never leave/.test(await p.innerText("#main")), "…saying it searches on this device");
ok(await p.isHidden("#searchBtn"), "…and the 🔍 itself steps aside");
const typeQ = async (q) => { await p.fill("#srIn", q); await p.waitForTimeout(400); return p.innerText("#srRes"); };
let t = await typeQ("sample");
ok(/results? in Money/.test(t) && await p.locator("#srRes mark").count() > 0, `"sample" finds Money entries, the words marked (${t.split("\n")[0]})`);
t = await typeQ("car");
ok(/HOME/i.test(t) && /Car/.test(t), "\"car\" finds the vehicle under Home");
t = await typeQ("passport");
ok(/PAPERS/i.test(t) && /Passport/i.test(t), "\"passport\" finds the document under Papers");
t = await typeQ("multivitamin");
ok(/HEALTH/i.test(t), "\"multivitamin\" finds the medicine under Health");
t = await typeQ("yoga");
ok(/HABITS/i.test(t), "\"yoga\" finds the habit");
t = await typeQ("₹18,000");
ok(/₹18,000/.test(t) && /MONEY/i.test(t), "an amount typed with ₹ and commas finds Money entries of that amount");
t = await typeQ("zzzzqq");
ok(/Nothing found/.test(t), "nothing found says so");
await typeQ("sample"); await p.keyboard.press("Enter");
await p.click('[data-area="Home"]'); await p.waitForTimeout(300);
ok(/Nothing found for “sample” in Home/.test(await p.innerText("#srRes")), "a chip narrows the results to one section");
await p.click('[data-area="All"]'); await p.waitForTimeout(300);
await p.fill("#srIn", ""); await p.waitForTimeout(300);
ok(/RECENT/i.test(await p.innerText("#srRes")) && /sample/.test(await p.innerText("#srRes")), "searches you made come back under Recent (this session only)");
await typeQ("sample");
await p.locator('#srRes a.srrow[data-key^="t:"]').first().click(); await p.waitForTimeout(900);
ok((await p.evaluate(() => location.hash)) === "#/money/activity" && !!(await p.$("#mvLayer #modal > *")), "a transaction opens its form over Activity");
ok(errors.length === 0, `no errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close(); server.close();
if (failed) { console.error(`searchflow: ${failed} failed`); process.exit(1); }
console.log("searchflow: all passed");
