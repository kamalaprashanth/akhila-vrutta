// The shell, used the way a person would on a phone and a laptop (Thursday 26 Nov 2026), over the sample Money
// data and what the Household, Habits, Documents and Health flows made (test-results/seed): Today lists what's
// due from every section and ticks medicines and habits in place; the side menu opens (button, edge swipe),
// closes (scrim, Escape) and moves between sections; a section's own tabs sit at the bottom on a phone.
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
const base = `http://127.0.0.1:${server.address().port}/shell.html`;
const browser = await chromium.launch();
let failed = 0;
const ok = (c, w) => { if (c) console.log(`  ✓ ${w}`); else { failed++; console.error(`  ✗ ${w}`); } };

for (const [name, vp, touch] of [["phone", { width: 390, height: 844 }, true], ["laptop", { width: 1280, height: 800 }, false]]) {
  console.log(name);
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
  await ctx.route(/fonts\.g/, (r) => r.abort());
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.clock.setFixedTime(new Date(2026, 10, 26, 10, 0));
  await p.goto(base + "#/today");
  await p.waitForSelector(".tdy .tdcard", { timeout: 20000 });
  const text = () => p.innerText("#main");
  const t = await text();
  ok(/Good morning/.test(t) && /Thursday, 26 November/.test(t), "Today greets with the date");
  ok(/Sample rent/.test(t) && /₹18,000/.test(t), "…lists a bill from Money with its amount");
  ok(await p.locator('.tdtick[data-tk="med"]').count() > 0, "…today's medicines from Health, with a tick");
  ok(await p.locator('.tdtick[data-tk="habit"]').count() > 0, "…and today's habits, with a tick");
  // tick a habit right here
  const hb = p.locator('.tdtick[data-tk="habit"][aria-pressed="false"]').first();
  const hid = await hb.getAttribute("data-id");
  await hb.click(); await p.waitForTimeout(300);
  ok(await p.getAttribute(`.tdtick[data-tk="habit"][data-id="${hid}"]`, "aria-pressed") === "true", "ticking a habit on Today marks it done");
  const md = p.locator('.tdtick[data-tk="med"]').first(), mid = await md.getAttribute("data-id"), mt = await md.getAttribute("data-time");
  const was = await md.getAttribute("aria-pressed");
  await md.click(); await p.waitForTimeout(300);
  ok(await p.getAttribute(`.tdtick[data-tk="med"][data-id="${mid}"][data-time="${mt}"]`, "aria-pressed") !== was, "…and ticking a medicine records the dose");
  ok(/\d/.test(await p.innerText("#drawer .dit.on i").catch(() => "")), "the side menu shows how many things today still needs");

  if (touch) {
    const tb = await p.$$eval("#nav .tab", (l) => l.map((a) => a.textContent.trim()));
    ok(tb.join(",") === "Today,Money,Home,Health,Menu", `Today's bottom bar has the main sections and the menu (${tb.join(", ")})`);
    await p.click("#navMenu"); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.body.classList.contains("dopen")), "…Menu there opens the side menu");
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    ok(!(await p.evaluate(() => document.body.classList.contains("dopen"))), "on a phone the side menu starts closed");
    await p.click("#menuBtn"); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.body.classList.contains("dopen")), "the menu button opens it");
    await p.click("#scrim", { position: { x: 370, y: 400 } }); await p.waitForTimeout(300);
    ok(!(await p.evaluate(() => document.body.classList.contains("dopen"))), "…tapping outside closes it");
    await p.evaluate(() => { const t = (x) => new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 400 }); document.dispatchEvent(new TouchEvent("touchstart", { touches: [t(8)], changedTouches: [t(8)] })); document.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [t(140)] })); });
    await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.body.classList.contains("dopen")), "swiping in from the left edge opens it");
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    ok(!(await p.evaluate(() => document.body.classList.contains("dopen"))), "…Escape closes it");
    await p.click("#menuBtn"); await p.waitForTimeout(300);
  }
  await p.click('#drawer a.dit[href="#/money"]'); await p.waitForTimeout(1200);
  ok(await p.innerText("#title") === "Money", "the side menu opens Money");
  if (touch) {
    ok(!(await p.evaluate(() => document.body.classList.contains("dopen"))), "…and closes behind itself");
    const tabs = await p.$$eval("#nav .tab", (l) => l.map((a) => a.textContent.trim()));
    ok(tabs.join(",") === "Overview,Activity,Plan,Accounts", `Money's own tabs are at the bottom (${tabs.join(", ")})`);
    await p.click('#nav [data-sub="money:plan"]'); await p.waitForTimeout(800);
    ok((await p.evaluate(() => location.hash)) === "#/money/plan" && await p.getAttribute('#nav [data-sub="money:plan"]', "aria-current") === "page", "…Plan opens from them and shows as the open one");
  } else {
    ok(await p.isHidden("#nav") && await p.isVisible('#drawer [data-sub="money:plan"]'), "on a laptop the tabs are in the side menu, always open");
    await p.click('#drawer [data-sub="money:plan"]'); await p.waitForTimeout(800);
    ok((await p.evaluate(() => location.hash)) === "#/money/plan", "…Plan opens from there");
  }
  ok(touch || (await p.isVisible('#drawer [data-sub="money:advisor"]') && await p.isVisible('#drawer [data-sub="money:more"]')), "Advisor and Money settings are in the side menu");
  await p.evaluate(() => { location.hash = "#/money/activity"; }); await p.waitForTimeout(800);
  ok(await p.isVisible('#mvSw [data-sw="insights"]'), "Activity has Transactions and Insights at the top");
  await p.click('#mvSw [data-sw="insights"]'); await p.waitForTimeout(800);
  ok((await p.evaluate(() => location.hash)) === "#/money/insights" && (touch ? await p.getAttribute('#nav [data-sub="money:activity"]', "aria-current") === "page" : await p.getAttribute('#drawer [data-sub="money:activity"]', "class") === "on"), "…Insights opens there, still under Activity");
  await p.evaluate(() => { location.hash = "#/money/home"; }); await p.waitForTimeout(800);
  ok(await p.isHidden("#mvSw"), "…and the switch isn't on other Money pages");
  await p.evaluate(() => { location.hash = "#/household/veh"; }); await p.waitForTimeout(400);
  ok(await p.innerText("#title") === "Home" && /Add vehicle/.test(await text()), "Home opens on the tab in the address (Vehicles)");
  if (touch) ok(await p.getAttribute('#nav [data-sub="household:veh"]', "aria-current") === "page", "…with Vehicles shown as the open tab");
  await p.evaluate(() => { location.hash = "#/health"; }); await p.waitForTimeout(400);
  ok(!(await p.evaluate(() => document.body.classList.contains("hassubs"))) && await p.isHidden("#nav"), "a section without tabs has no bottom bar");
  ok(errors.length === 0, `no errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
}
await browser.close(); server.close();
if (failed) { console.error(`shellflow: ${failed} failed`); process.exit(1); }
console.log("shellflow: all passed");
