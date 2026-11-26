// Layout check: every page (and the sheets its buttons open) at phone, tablet and laptop widths, on the real
// shell. Reports: the page scrolling sideways, things cut off at the edge, things hidden under the tab bar,
// taps smaller than 40px on touch widths, text under 12px. Screenshots go to test-results/layout/.
// Seed data: what the Household, Habits, Documents and Health flows made (they leave it in test-results/seed).
// Fails on: sideways scrolling, things cut off, hidden under the tab bar or the + button, a page that won't open,
// errors. Small taps and small text are listed in test-results/layout/report.json.
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const SEED = process.env.AV_SEED ?? "test-results/seed";
const seed = {};
if (SEED) for (const f of await readdir(SEED)) for (const [c, l] of Object.entries(JSON.parse(await readFile(join(SEED, f), "utf8")))) if (!["txns", "accounts", "categories", "recurring", "goals", "loans", "holdings", "settings", "payers", "snaps", "trades", "views", "propItems"].includes(c)) (seed[c] ??= []).push(...l);
const harness = (await build({ entryPoints: ["tests/e2e/layout-harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
const shell = (await readFile("dist/index.html", "utf8")).replace(/<script src="config.js"><\/script>/, "").replace(/<script type="module" src="app.js"><\/script>/, '<script type="module" src="/harness.js"></script>').replace(/<link[^>]*fonts\.g[^>]*>/g, "");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/export.json") return res.end(await readFile("tests/fixtures/sample-export.json"));
  if (url === "/seed.json") return res.end(JSON.stringify(seed));
  if (url === "/harness.js") return res.writeHead(200, { "content-type": T[".js"] }).end(harness);
  if (url === "/" || url === "/shell.html") return res.writeHead(200, { "content-type": T[".html"] }).end(shell);
  const file = join("dist", normalize(url).replace(/^(\.\.[/\\])+/, ""));
  try { res.writeHead(200, { "content-type": T[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/shell.html`;
await mkdir("test-results/layout", { recursive: true });

const WIDTHS = [["small phone", 320, 640, true], ["phone", 390, 844, true], ["big phone", 430, 932, true], ["phone landscape", 844, 390, true], ["tablet", 768, 1024, true], ["laptop", 1280, 800, false], ["desktop", 1920, 1080, false]];
const PAGES = [["today", "#/today"], ["money home", "#/money/home"], ["money activity", "#/money/activity"], ["money accounts", "#/money/accounts"], ["money plan", "#/money/plan"], ["money insights", "#/money/insights"], ["money advisor", "#/money/advisor"], ["money more", "#/money/more"],
  ["household due", "#/household/due"], ["household appliances", "#/household/appl"], ["household vehicles", "#/household/veh"], ["household lists", "#/household/lists"],
  ["habits", "#/habits"], ["habit page", "#/habits", null, "[data-habit]"], ["health", "#/health"], ["health lab", `#/health/lab/${seed.hlLabs?.[0]?.id}`], ["documents", "#/docs"], ["documents owner", "#/docs", null, "[data-owner]"], ["settings", "#/settings"], ["search", "#/search"]];

const audit = (touch) => {
  const W = innerWidth, H = innerHeight, out = { sideways: document.documentElement.scrollWidth > W + 1 ? document.documentElement.scrollWidth : 0, cut: [], under: [], small: [], tiny: [] };
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity !== 0; };
  const scroller = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""} "${(e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28)}"`;
  const layer = document.querySelector("#mvLayer #modal > *");
  const root = layer ? document.querySelector("#mvLayer") : document.querySelector("#main") ?? document.body;
  const all = [...root.querySelectorAll("*")].filter(vis);
  for (const e of all) {
    const r = e.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !scroller(e)) out.cut.push(`${name(e)} ${Math.round(r.left)}–${Math.round(r.right)}`);
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own && parseFloat(getComputedStyle(e).fontSize) < 12) out.small.push(`${name(e)} ${getComputedStyle(e).fontSize}`);
    if (touch && e.matches("a[href],button,[role=button],input:not([type=hidden]),select,textarea,[data-tick],label.chk") && (r.height < 40 && r.width < 40 || r.height < 32) && !e.closest("p, .note, .hint")) out.tiny.push(`${name(e)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  // the last thing on the page, scrolled to the bottom, must sit above the tab bar
  const nav = document.querySelector("#nav");
  if (!layer && nav && getComputedStyle(nav).position === "fixed" && nav.getBoundingClientRect().width > W * 0.9) {
    scrollTo(0, document.documentElement.scrollHeight);
    const top = nav.getBoundingClientRect().top;
    if (top < H - 1) { const last = all.filter((e) => !e.children.length).sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0]; if (last && last.getBoundingClientRect().bottom > top + 1) out.under.push(name(last)); }
    scrollTo(0, 0);
  }
  // the floating + button must not cover anything once the page is scrolled to its end
  out.fab = [];
  const fab = document.querySelector(".fab");
  if (!layer && fab && vis(fab)) {
    const sc = [document.querySelector("#moneyView"), document.scrollingElement].find((x) => x && x.scrollHeight > x.clientHeight + 2) ?? document.scrollingElement;
    sc.scrollTop = sc.scrollHeight;
    const f = fab.getBoundingClientRect();
    for (const e of [...root.querySelectorAll("button,a[href],input,select,b,strong,.amt,[class*=amt]")].filter(vis)) { if (fab.contains(e)) continue; const r = e.getBoundingClientRect(); if (r.right > f.left + 2 && r.left < f.right - 2 && r.bottom > f.top + 2 && r.top < f.bottom - 2) out.fab.push(name(e)); }
    sc.scrollTop = 0;
  }
  for (const k of ["cut", "small", "tiny"]) out[k] = [...new Set(out[k])];
  return out;
};

const browser = await chromium.launch();
const report = [];
for (const [wname, w, h, touch] of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 900 });
  await ctx.route(/fonts\.g/, (r) => r.abort());
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date(2026, 10, 26, 10, 0));
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "#/today"); await p.waitForSelector("#drawer .dit", { state: "attached", timeout: 20000 });
  for (const [pname, hash, tab, open] of PAGES) {
    await p.evaluate((x) => { document.querySelector("#mvLayer #modal")?.replaceChildren(); location.hash = x; }, hash);
    await p.waitForTimeout(hash.startsWith("#/money") ? 900 : 300);
    if (tab) { await p.click(`[data-tab="${tab}"]`).catch(() => {}); await p.waitForTimeout(200); }
    if (open) { const ok = await p.locator(open).first().click({ timeout: 2000 }).then(() => true, () => false); if (!ok) { report.push({ w: wname, page: pname, missing: true }); continue; } await p.waitForTimeout(400); }
    const r = await p.evaluate(audit, touch);
    report.push({ w: wname, page: pname, ...r });
    if (["phone", "laptop", "tablet"].includes(wname)) await p.screenshot({ path: `test-results/layout/${wname}-${pname.replace(/ /g, "-")}.png`, fullPage: true });
    // the sheets this page's own buttons open
    if (["small phone", "phone", "laptop"].includes(wname)) {
      const ids = await p.evaluate(() => [...document.querySelectorAll("#main button[id]")].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.id));
      for (const id of ids) {
        await p.evaluate((i) => document.getElementById(i)?.click(), id);
        await p.waitForTimeout(250);
        if (await p.$("#mvLayer #modal > *")) {
          const s = await p.evaluate(audit, touch);
          report.push({ w: wname, page: `${pname} › sheet #${id}`, ...s });
          if (wname === "phone") await p.screenshot({ path: `test-results/layout/sheet-${pname.replace(/ /g, "-")}-${id}.png` });
          await p.evaluate(() => document.querySelector("#mvLayer #modal")?.replaceChildren());
        }
        if (!(await p.evaluate((x) => location.hash.startsWith(x), hash))) break;
      }
    }
  }
  if (errors.length) report.push({ w: wname, page: "errors", errors: [...new Set(errors)] });
  await ctx.close();
}
await browser.close(); server.close();
await writeFile("test-results/layout/report.json", JSON.stringify(report, null, 1));
const bad = report.filter((r) => r.sideways || r.cut?.length || r.under?.length || r.fab?.length || r.missing || r.errors);
console.log(`${report.length} screens; sideways/cut/under/missing/errors on ${bad.length}; tiny taps on ${report.filter((r) => r.tiny?.length).length}; small text on ${report.filter((r) => r.small?.length).length}`);
if (bad.length) { for (const r of bad) console.error("  ✗", r.w, r.page, JSON.stringify({ sideways: r.sideways, cut: r.cut, under: r.under, fab: r.fab, missing: r.missing, errors: r.errors })); process.exit(1); }
console.log("layout: all passed");
