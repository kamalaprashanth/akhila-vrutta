// Phone reminders for credit cards: only when there's a bill to pay. With the sample data (a card bill not yet
// paid) the card is reminded; once the card owes nothing, it isn't (it used to be, every month).
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const harness = (await build({ entryPoints: ["tests/parity/harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/export.json") return res.end(await readFile("tests/fixtures/sample-export.json"));
  if (url === "/harness.js") return res.writeHead(200, { "content-type": T[".js"] }).end(harness);
  if (url === "/harness.html") return res.writeHead(200, { "content-type": T[".html"] }).end('<!doctype html><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/money/mv.css"><main id="main"></main><script type="module" src="/harness.js"></script>');
  const file = join("dist", normalize(url).replace(/^(\.\.[/\\])+/, ""));
  try { res.writeHead(200, { "content-type": T[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch();
let failed = 0;
const ok = (c, w) => { if (c) console.log(`  ✓ ${w}`); else { failed++; console.error(`  ✗ ${w}`); } };
const p = await browser.newPage();
await p.route(/fonts\.g/, (r) => r.abort());
await p.clock.setFixedTime(new Date(2026, 10, 26, 10, 0));
await p.goto(`http://127.0.0.1:${server.address().port}/harness.html#/money/home`);
await p.waitForFunction(() => typeof window.phoneReminders === "function", null, { timeout: 20000 });
// the sample card gets a statement day (20th) and a due day (8th of the next month). In the sample it's in
// credit (₹5,000 paid in, ₹499 spent): nothing to pay, so no reminder; then ₹10,000 spent on 10 Nov makes a bill.
await p.evaluate(() => { for (const a of window.FAKE.all("accounts")) if (a.type === "card") { a.stmtDay = 20; a.dueDay = 8; } });
const cardRem0 = await p.evaluate(() => window.phoneReminders().filter((r) => r.title.startsWith("Test Card")).length);
ok(cardRem0 === 0, `a card in credit isn't reminded (${cardRem0})`);
await p.evaluate(() => { const c = window.FAKE.all("accounts").find((a) => a.type === "card"); const t = window.FAKE.all("txns").find((x) => x.accountId === c.id && x.type === "expense"); window.FAKE.data.get("txns").set("tbig", { ...t, id: "tbig", date: "2026-11-10", amount: 1000000 }); });
const cardNames = await p.evaluate(() => window.FAKE.all("accounts").filter((a) => a.type === "card" && !a.deleted).map((a) => a.name));
const cardRem = () => p.evaluate((names) => window.phoneReminders().filter((r) => names.some((n) => r.title.startsWith(`${n} bill`))).map((r) => `${r.title} ${r.at.slice(0, 10)}`), cardNames);
const before = await cardRem();
ok(cardNames.length > 0 && before.length > 0 && before.length <= 4, `a card with a bill to pay is reminded, for that bill only (${before.join(", ")})`);
// the bill paid in full on 25 Nov: no more reminders for it
await p.evaluate(() => { const c = window.FAKE.all("accounts").find((a) => a.type === "card"); const t = window.FAKE.all("txns").find((x) => x.toAccountId === c.id && x.type === "transfer"); window.FAKE.data.get("txns").set("tpay", { ...t, id: "tpay", date: "2026-11-25", amount: 549900 }); });
const paid = await cardRem();
ok(paid.length === 0, `once the bill is paid it isn't reminded (${paid.join(", ") || "none"})`);
await p.evaluate(() => window.FAKE.data.get("txns").delete("tpay"));
// now the card owes nothing: no spending on it, nothing brought forward
await p.evaluate(() => {
  const ids = new Set(window.FAKE.all("accounts").filter((a) => a.type === "card").map((a) => a.id));
  for (const t of window.FAKE.all("txns")) if (ids.has(t.accountId) || ids.has(t.toAccountId)) window.FAKE.data.get("txns").delete(t.id);
  for (const a of window.FAKE.all("accounts")) if (ids.has(a.id)) a.opening = 0;
  for (const l of window.FAKE.all("loans")) if (ids.has(l.cardId)) window.FAKE.data.get("loans").delete(l.id);
});
const after = await cardRem();
ok(after.length === 0, `a card that owes nothing isn't reminded (${after.join(", ") || "none"})`);
await browser.close(); server.close();
if (failed) { console.error(`cardremind: ${failed} failed`); process.exit(1); }
console.log("cardremind: all passed");
