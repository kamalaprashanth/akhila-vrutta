// Money settings, drawn by Akhila Vrutta, used the way a person would: the checklist, the profile, payers,
// reminders, tags, categories and backups, whose forms still open in the planner. Phone and laptop.
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
  await p.goto(`${base}/harness.html#/money/more`);
  const f = p;   // the planner's names (S, go, upsert, byId…) are test hooks on the app's page; there is no frame
  const V = "#moneyView #view";
  await p.waitForSelector(`${V} #addPayer`, { timeout: 15000 });
  await f.waitForFunction(() => typeof S === "object" && !!S.data);
  const settle = () => p.waitForTimeout(500);
  const frameShown = async () => !!(await p.$("#moneyFrame"));   // never: the planner frame is gone
  const plannerSheet = () => f.evaluate(() => !!document.querySelector("#modal .sheet, #modal h3"));
  const closeIt = async () => { await f.evaluate(() => closeModal()); await settle(); };
  ok(!(await frameShown()), "Money settings is drawn by the app");
  ok(!(await p.$(`${V} [data-prof]`)), "the profile isn't here any more (it's the Profile page)");
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
  // Restore and the downloads: all the app's own now.
  for (const [sel, what] of [[`${V} #restore`, "Restore from backup"]]) {
    if (!(await p.$(sel))) { ok(false, `${what}: not on the page`); continue; }
    await p.evaluate((s) => { const el = document.querySelector(s); el.closest("details")?.setAttribute("open", ""); el.scrollIntoView(); }, sel);
    await p.click(sel); await settle();
    ok(await appSheet() && !(await frameShown()), `${what} opens the app's form`);
    await p.click("#mvLayer #modal #cx"); await settle();
    ok(!(await appSheet()), "…and closes back to Money settings");
  }
  // Profile › About you (moved out of Money settings)
  await p.evaluate(() => { location.hash = "#/profile"; }); await settle();
  const P = "#main .pfv";
  ok((await p.$$(`${P} [data-prof]`)).length === 7, "Profile: seven sections about you");
  for (const [sel, what] of [[`${P} [data-prof="about"]`, "About me"], [`${P} [data-prof="ins"]`, "Insurance"]]) {
    await p.click(sel); await settle();
    ok(await appSheet(), `${what} opens its form`);
    await p.click("#mvLayer #modal #cx"); await settle();
    ok(!(await appSheet()), "…and closes back to Profile");
  }
  await p.click(`${P} [data-prof="about"]`); await settle();
  await p.fill("#mvLayer #f_pr", "57"); await p.click("#mvLayer #addKid"); await settle();
  await p.fill("#mvLayer #kidRows .fam:last-child input[type=text]", "Test child"); await p.fill("#mvLayer #kidRows .fam:last-child input[type=date]", "2018-06-01");
  await p.click("#mvLayer #modal #sv"); await settle(); await settle();
  const pr = await f.evaluate(() => S.data.settings.find((x) => x.id === "profile"));
  ok(pr && pr.retire === "57" && pr.kids.some((k) => k.name === "Test child" && k.dob === "2018-06-01"), "About me saved: retire at 57, the new child");
  await p.evaluate(() => { location.hash = "#/profile/again"; }); await settle();   // the app redraws on a save; this harness on a new address
  ok(/retire at 57/.test(await p.innerText(P)), "…and the profile line shows it");
  await p.evaluate(() => { location.hash = "#/money/more"; }); await settle();
  for (const [id, re, what] of [["dlJson", /^KP_Money_Planner_data_.*\.json$/, "Download data"], ["xlsx", /^KP Money Planner .*\.xlsx$/, "Download Excel"]]) {
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 8000 }).catch(() => null), p.click(`${V} #${id}`)]);
    if (!dl) { ok(false, `${what}: no file`); continue; }
    const buf = await readFile(await dl.path());
    if (id === "dlJson") { const j = JSON.parse(buf.toString()); ok(re.test(dl.suggestedFilename()) && j.app === "KP Money Planner" && Array.isArray(j.data.txns) && j.data.txns.length > 0, `${what} gives the planner's file (${j.data.txns.length} transactions, in rupees)`);
      const t0 = j.data.txns.find((t) => t.amount); const st = await f.evaluate((id) => S.data.txns.find((t) => t.id === id)?.amount, t0.id); ok(t0.amount === st, "…amounts in rupees, as the planner keeps them"); }
    else ok(re.test(dl.suggestedFilename()) && buf[0] === 0x50 && buf[1] === 0x4b && buf.includes(Buffer.from("xl/worksheets/sheet7.xml")), `${what} gives a 7-sheet .xlsx`);
  }
  // Restore a backup that renames one account: merged in, shown in the planner's data and here.
  { const D = await f.evaluate(() => JSON.parse(JSON.stringify(S.data))); const a = D.accounts.find((x) => !x.deleted); a.name = "Restored name"; a.updatedAt = Date.now() + 5000; delete D.categories;   // (with categories, the planner also drops the starter ones)
    await p.click(`${V} #restore`); await settle();
    await p.fill("#mvLayer #f_json", JSON.stringify({ app: "KP Money Planner", data: D })); await p.click("#mvLayer #modal #sv"); await settle(); await settle();
    ok(await f.evaluate((id) => S.data.accounts.find((x) => x.id === id)?.name, a.id) === "Restored name", "Restore merges a newer copy in"); }
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
