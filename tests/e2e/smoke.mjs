// Serves dist/ and checks every tab renders with no console errors, on a phone and a desktop.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".webmanifest": "application/manifest+json", ".map": "application/json" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let file = join("dist", path.endsWith("/") ? `${path}index.html` : path);
  if (!extname(file)) file += ".html"; // like Firebase Hosting's cleanUrls
  try { res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;

const TABS = [["today", "Good"], ["money", "Money"], ["household", "Household"], ["health", "Health"], ["docs", "Documents"], ["settings", "Help and feedback"]];
const browser = await chromium.launch();
let failed = 0;
for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  const page = await browser.newPage({ viewport: vp });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g/.test(m.location().url ?? "")) errors.push(`${m.text()} ${m.location().url ?? ""}`); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // Run the shell without the cloud: the real build would stop at the lock screen.
  await page.route(/\/config\.js$/, (r) => r.fulfill({ contentType: "text/javascript", body: 'window.AV_CONFIG={firebase:null,build:"test"};' }));
  for (const [id, text] of TABS) {
    await page.goto(`${base}#/${id}`);
    await page.waitForSelector(`#drawer a.dit.on[href="#/${id}"]`, { state: "attached" });
    const ok = (await page.textContent("#main"))?.includes(text);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (!ok || overflow) { failed++; console.error(`✗ ${vp.width}px #/${id}: ${!ok ? `missing "${text}"` : "horizontal overflow"}`); }
    else console.log(`✓ ${vp.width}px #/${id}`);
  }
  if (errors.length) { failed++; console.error(`✗ ${vp.width}px console errors:\n  ${errors.join("\n  ")}`); }
  await page.close();
}
await browser.close();
server.close();
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log("smoke: all passed");
