// Backup and restore in Settings, on phone and laptop: a downloaded backup (nothing readable in it), the
// weekly switch, a backup to Drive (a stand-in), and restoring from Drive and from a file: a wrong passphrase
// refused, what's inside shown, a copy of the current data saved first, then everything put back.
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const harness = (await build({ entryPoints: ["tests/e2e/bk-harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
const T = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/harness.js") return res.writeHead(200, { "content-type": T[".js"] }).end(harness);
  if (url === "/harness.html") return res.writeHead(200, { "content-type": T[".html"] }).end('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><main id="main"></main><div id="toast"></div><script type="module" src="/harness.js"></script>');
  const file = join("dist", normalize(url).replace(/^(\.\.[/\\])+/, ""));
  try { res.writeHead(200, { "content-type": T[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let failed = 0;
const ok = (cond, what) => { if (cond) console.log(`  ✓ ${what}`); else { failed++; console.error(`  ✗ ${what}`); } };

for (const [name, vp] of [["phone", { width: 390, height: 844 }], ["laptop", { width: 1280, height: 860 }]]) {
  console.log(name);
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  await ctx.route(/fonts\.g/, (r) => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/harness.html`);
  await p.waitForSelector("#bkCard", { timeout: 15000 });
  const C = "#bkCard";
  const toast = () => p.innerText("#toast").catch(() => "");
  const recs = (c) => p.evaluate((c) => [...(window.FAKE.data.get(c)?.values() ?? [])], c);
  ok(/No backup yet/.test(await p.innerText(C)) && await p.isChecked(`${C} #bkWeekly`), "Settings shows Backup first: no backup yet, weekly on");

  // download
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click(`${C} #bkDown`)]);
  const file = await readFile(await dl.path()), text = file.toString("utf8");
  ok(/^akhila-vrutta-backup-\d{4}-\d\d-\d\d\.avb$/.test(dl.suggestedFilename()) && JSON.parse(text).kind === "akhila-vrutta-backup", `Download a backup now saves ${dl.suggestedFilename()}`);
  ok(!/Sample rent|bathroom tap|Walk 30 min/.test(text), "…nothing in it is readable without the passphrase");
  await p.waitForTimeout(300);
  ok(/Last backup: .*downloaded/.test(await p.innerText(C)), "…and the card says when");

  // weekly switch
  await p.click(`${C} #bkWeekly`);
  ok((await recs("backupLog")).find((r) => r.id === "settings")?.weekly === false, "the weekly switch is kept (off)");
  await p.click(`${C} #bkWeekly`);

  // to Drive
  await p.click(`${C} #bkDrive`); await p.waitForTimeout(800);
  ok(await p.evaluate(() => window.BACKUPS.length) === 1 && /Backed up to your Google Drive/.test(await toast()), "Back up to Drive now puts one in Drive");

  // change things, then restore from Drive
  await p.evaluate(() => window.FAKE.writeMany([{ c: "hhItems", id: "i2", r: { id: "i2", list: "todo", text: "Added after the backup", added: "2026-11-25" } }, { c: "txns", id: "t1", r: null }]));
  await p.click(`${C} #bkRestore`);
  await p.click(`${C} #bkFromDrive`);
  await p.waitForSelector(`${C} .bkpick`);
  await p.click(`${C} .bkpick`);
  await p.waitForSelector(`${C} #bkPass`);
  await p.fill(`${C} #bkPass`, "not the passphrase"); await p.click(`${C} #bkPassF .btn.pri`);
  await p.waitForTimeout(1500);
  ok(/doesn't open this backup/.test(await toast()) && await p.isVisible(`${C} #bkPass`), "a wrong passphrase is refused");
  await p.fill(`${C} #bkPass`, "five test words for backup"); await p.click(`${C} #bkPassF .btn.pri`);
  await p.waitForSelector(`${C} .bkinc`, { timeout: 10000 });
  const inc = await p.innerText(`${C} .bkinc`);
  ok(/Transactions\s*1/.test(inc) && /Household.*\s*1/.test(inc) && /Habits.*\s*1/.test(inc), `what's inside is shown (${inc.replace(/\s+/g, " ")})`);
  ok(/replaces what's in the app now/.test(await p.innerText(C)), "…with a warning that it replaces what's here");
  const [before] = await Promise.all([p.waitForEvent("download"), p.click(`${C} #bkGo`)]);
  ok(/before-restore\.avb$/.test(before.suggestedFilename()), `a copy of the current data is saved first (${before.suggestedFilename()})`);
  await p.waitForFunction(() => /Restored from/.test(document.querySelector("#toast")?.textContent ?? ""), null, { timeout: 10000 });
  const items = (await recs("hhItems")).map((i) => i.text), txns = (await recs("txns")).map((t) => t.note);
  ok(items.length === 1 && items[0] === "Fix the bathroom tap" && txns.includes("Sample rent"), "everything is put back as it was in the backup");

  // restore from the downloaded file
  await p.evaluate(() => window.FAKE.writeMany([{ c: "habits", id: "h1", r: null }]));
  await p.click(`${C} #bkRestore`);
  await p.setInputFiles(`${C} #bkFile`, await dl.path());
  await p.fill(`${C} #bkPass`, "five test words for backup"); await p.click(`${C} #bkPassF .btn.pri`);
  await p.waitForSelector(`${C} #bkGo`);
  await Promise.all([p.waitForEvent("download"), p.click(`${C} #bkGo`)]);
  await p.waitForFunction(() => /Restored from/.test(document.querySelector("#toast")?.textContent ?? ""), null, { timeout: 10000 });
  ok((await recs("habits")).length === 1, "restoring from a downloaded file works too");
  await p.click(`${C} #bkRestore`);
  await p.setInputFiles(`${C} #bkFile`, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await p.waitForTimeout(300);
  ok(/isn't an Akhila Vrutta backup/.test(await toast()), "a file that isn't a backup is said to be so");

  if (name === "phone") await p.screenshot({ path: "test-results/backup-phone.png", fullPage: true });
  ok(!errors.length, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close(); server.close();
if (failed) { console.error(`bkflow: ${failed} failed`); process.exit(1); }
console.log("bkflow: all passed");
