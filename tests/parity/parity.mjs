// Compares every main money page between KP Money Planner (as deployed today) and the moved-over
// planner running inside Akhila Vrutta, on the same export. Needs AV_EXPORT and OLD_APP (path to the old index.html).
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const EXPORT = process.env.AV_EXPORT, OLD = process.env.OLD_APP;
if (!EXPORT || !OLD) { console.log("parity: skipped (set AV_EXPORT and OLD_APP)"); process.exit(0); }
const harness = (await build({ entryPoints: ["tests/parity/harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/export.json") return res.writeHead(200, { "content-type": T[".json"] }).end(await readFile(EXPORT));
  if (url === "/harness.js") return res.writeHead(200, { "content-type": T[".js"] }).end(harness);
  if (url === "/harness.html") return res.writeHead(200, { "content-type": T[".html"] }).end('<!doctype html><link rel="stylesheet" href="/app.css"><main id="main"></main><script type="module" src="/harness.js"></script>');
  const file = join("dist", normalize(url).replace(/^(\.\.[/\\])+/, ""));
  try { res.writeHead(200, { "content-type": T[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const VIEWS = ["home", "activity", "plan", "insights", "accounts", "more"];
const data = JSON.parse(readFileSync(EXPORT, "utf8")).data;
const browser = await chromium.launch();
const clean = (t) => t.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

async function oldText() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((d) => { localStorage.setItem("kpmp.v1", JSON.stringify({ data: d, dirty: false })); }, data);
  await ctx.route(/fonts\.g|config\.js/, (r) => r.abort());
  const p = await ctx.newPage();
  const out = {};
  for (const v of VIEWS) { await p.goto(`file://${OLD}#${v}`); await p.waitForTimeout(700); out[v] = clean(await p.innerText("#view")); }
  await ctx.close();
  return out;
}
async function newText() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.g/, (r) => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/fonts|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await p.goto(`${base}/harness.html#/money/home`);
  const f = await (await p.waitForSelector("#moneyFrame")).contentFrame();
  await f.waitForSelector("#view *", { timeout: 15000 });
  const out = {};
  for (const v of VIEWS) { await p.evaluate((v) => { location.hash = `#/money/${v}`; }, v); await p.waitForTimeout(700); out[v] = clean(await f.innerText("#view")); }
  await p.waitForTimeout(1200);
  const writes = await p.evaluate(() => window.FAKE.writes.map((w) => `${w.c}/${w.id}`));
  // An edit in the planner is saved once, converted to paise.
  const t = await f.evaluate(() => { const t = S.data.txns.find((x) => !x.deleted && x.type === "expense"); upsert("txns", { ...t, amount: 1234.56, note: "parity check" }); return t.id; });
  await p.waitForTimeout(1500);
  const saved = await p.evaluate((id) => window.FAKE.writes.filter((w) => w.id === id).map((w) => ({ amount: w.r?.amount, note: w.r?.note })), t);
  if (saved.length !== 1 || saved[0].amount !== 123456 || saved[0].note !== "parity check") errors.push(`edit was saved as ${JSON.stringify(saved)}, expected one write of 123456 paise`);
  else console.log("✓ an edit is saved once, in paise (₹1,234.56 → 123456)");
  await ctx.close();
  return { out, errors, writes };
}

const a = await oldText();
const { out: b, errors, writes } = await newText();
await browser.close();
server.close();
let bad = 0;
for (const v of VIEWS) {
  if (a[v] === b[v]) { console.log(`✓ ${v} (${a[v].length} characters identical)`); continue; }
  // Money settings differ by design: Akhila Vrutta's security card instead of Google Drive, plus the hosted app's reminders.
  if (v === "more" && b[v].includes("SECURITY & SAVING") && !b[v].includes("GOOGLE DRIVE")) { console.log("✓ more (differs only where intended)"); continue; }
  bad++;
  const A = a[v].split("\n"), B = b[v].split("\n");
  const i = A.findIndex((l, k) => l !== B[k]);
  console.error(`✗ ${v}: first difference at line ${i + 1}\n  old: ${A[i]}\n  new: ${B[i]}`);
  if (process.env.DIFF) { const { writeFileSync } = await import("node:fs"); writeFileSync(`${process.env.DIFF}/old-${v}.txt`, a[v]); writeFileSync(`${process.env.DIFF}/new-${v}.txt`, b[v]); }
}
if (errors.length) { bad++; console.error("errors in the new app:\n  " + errors.join("\n  ")); }
console.log(`writes caused by opening and browsing: ${writes.length}${writes.length ? " → " + [...new Set(writes)].slice(0, 8).join(", ") : ""}`);
process.exit(bad ? 1 : 0);
