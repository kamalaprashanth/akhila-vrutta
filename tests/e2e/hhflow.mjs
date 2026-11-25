// Household, used the way a person would, on phone and laptop: homes, the usual jobs, marking a job done
// (its cost added to Money), appliances with encrypted files (a photo and a PDF), warranties showing as due,
// and the To do and Groceries lists. Google Drive is an in-memory stand-in that only ever sees ciphertext.
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const EXPORT = "tests/fixtures/sample-export.json";
const harness = (await build({ entryPoints: ["tests/e2e/hh-harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
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

// a small PNG and a one-page PDF made on the spot
await mkdir("test-results", { recursive: true });
{
  const b = await browser.newPage();
  await b.setContent('<div style="width:120px;height:80px;background:#0e5e4c;color:#fff;font:20px sans-serif">BILL</div>');
  await writeFile("test-results/hh-photo.png", await b.locator("div").screenshot());
  await b.setContent("<h1>Invoice</h1><p>LG washing machine ₹38,990</p>");
  await writeFile("test-results/hh-invoice.pdf", await b.pdf({ width: "400px", height: "300px" }));
  await b.close();
}
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

for (const [name, vp] of [["phone", { width: 390, height: 844 }], ["laptop", { width: 1280, height: 860 }]]) {
  console.log(name);
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route(/fonts\.g/, (r) => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/harness.html`);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  const V = "#hhView", L = "#mvLayer";
  await p.waitForSelector(`${V} .hchip`, { timeout: 15000 });
  const settle = () => p.waitForTimeout(400);
  const recs = (c) => p.evaluate((c) => [...(window.FAKE.data.get(c)?.values() ?? [])], c);
  const sheet = () => p.evaluate(() => !!document.querySelector("#mvLayer #modal .sheet"));
  const fill = async (id, v) => { const s = `${L} #f_${id}`; if ((await p.$eval(s, (e) => e.tagName)) === "SELECT") await p.selectOption(s, v); else await p.fill(s, v); };

  // homes: Money's properties are there; add the one we live in
  const chips = await p.$$eval(`${V} .hchip`, (l) => l.map((e) => e.textContent.trim()));
  ok(chips.includes("All homes") && chips.includes("Test Plot") && chips.includes("Test Flat"), `Money's properties are homes here (${chips.join(", ")})`);
  await p.click(`${V} #addHome`); await settle();
  await fill("hname", "Where we live"); await p.click(`${L} #sv`); await settle();
  ok((await p.innerText(`${V} .hhtop`)).includes("Where we live"), "a home added here appears with them");
  const homeId = (await recs("hhHomes"))[0]?.id;

  // the usual jobs
  ok((await p.$$(`${V} [data-starter]`)).length === 3, "each home without jobs offers the usual ones");
  await p.click(`${V} [data-starter="${homeId}"]`); await settle();
  const labels = await p.$$eval(`${L} .hhstart b`, (l) => l.map((e) => e.textContent));
  ok(labels.length === 6 && labels.includes("AC service") && labels.includes("Pest control"), `six usual jobs to pick from (${labels.join(", ")})`);
  await p.check(`${L} #st0`); await p.check(`${L} #st2`);
  await p.fill(`${L} #sd0`, addDays(5));
  await p.click(`${L} #sv`); await settle();
  let jobs = await recs("hhJobs");
  ok(jobs.length === 2 && jobs.every((j) => j.home === homeId) && jobs.find((j) => j.name === "AC service")?.every === 6, "AC service (6 months) and pest control (3 months) added for this home");
  ok(/this month|coming up/i.test(await p.innerText(V)) && /AC service/.test(await p.innerText(V)), "they show as due");
  ok(/in 5 days/.test(await p.innerText(V)), "…AC service in 5 days");

  // mark a job done, its cost added to Money
  const ac = jobs.find((j) => j.name === "AC service");
  await p.click(`${V} [data-job="${ac.id}"]`); await settle();
  ok(await sheet() && /Mark done/.test(await p.innerText(L)), "tapping a job offers Mark done");
  ok((await p.$eval(`${L} #f_categoryId`, (e) => e.selectedOptions[0]?.textContent ?? "")).length > 0, `a Money category is chosen (${await p.$eval(`${L} #f_categoryId`, (e) => e.selectedOptions[0]?.textContent ?? "")})`);
  await fill("dcost", "1,200"); await fill("dnote", "two units");
  const txBefore = (await recs("txns")).length;
  await p.click(`${L} #sv`); await settle();
  jobs = await recs("hhJobs");
  const done = await recs("hhDone"), tx = await recs("txns"), newTx = tx.find((t) => t.id === done[0]?.txnId);
  const today = addDays(0);
  ok(done.length === 1 && done[0].cost === 120000 && done[0].date === today && done[0].note === "two units", "what was done is kept (₹1,200 as 120000 paise)");
  ok(jobs.find((j) => j.id === ac.id)?.last === today && jobs.find((j) => j.id === ac.id)?.due > addDays(170), "the next AC service moves 6 months on");
  ok(tx.length === txBefore + 1 && newTx?.type === "expense" && newTx.amount === 120000 && newTx.date === today && /AC service \(Where we live\)/.test(newTx.note), "…and it's an expense in Money");

  // an appliance with a warranty ending soon, a photo and a PDF
  await p.click(`${V} [data-tab="appl"]`); await settle();
  await p.click(`${V} #addAppl`); await settle();
  await fill("aname", "Washing machine"); await fill("ahome", homeId); await fill("amodel", "LG FHM1408");
  await fill("abought", "2025-01-03"); await fill("aprice", "38,990"); await fill("awarr", addDays(40));
  await p.setInputFiles(`${L} #hhPick`, ["test-results/hh-photo.png", "test-results/hh-invoice.pdf"]);
  await p.waitForFunction(() => document.querySelectorAll("#mvLayer [data-file]").length === 2, null, { timeout: 15000 });
  ok(true, "a photo and a PDF are added (encrypted here, then kept in Drive)");
  const drive = await p.evaluate(() => [...window.DRIVE.values()].map((b) => [...b.slice(0, 8)]));
  const png = [0x89, 0x50, 0x4e, 0x47], pdf = [0x25, 0x50, 0x44, 0x46];
  ok(drive.length === 2 && drive.every((b) => b.join() !== png.join() && b.slice(0, 4).join() !== pdf.join()), "Drive holds only ciphertext (no PNG or PDF header)");
  const files = await recs("files");
  ok(files.length === 2 && files.every((f) => f.drive && f.iv && /hh-(photo|invoice)/.test(f.name) && f.owner.c === "hhAppliances"), "each file's name and type are in the encrypted record, not in Drive");
  // Google's permission window blocked by the browser: the file waits, and "Allow Drive" saves it
  await p.evaluate(() => { window.BLOCK_ONCE = true; });
  await p.setInputFiles(`${L} #hhPick`, ["test-results/hh-photo.png"]);
  await p.waitForSelector(`${L} #hhAllow`, { timeout: 10000 });
  ok((await p.$$(`${L} [data-file]`)).length === 2, "a blocked permission window leaves the file waiting, with an Allow Drive button");
  await p.click(`${L} #hhAllow`);
  await p.waitForFunction(() => document.querySelectorAll("#mvLayer [data-file]").length === 3 && !document.querySelector("#mvLayer #hhAllow"), null, { timeout: 10000 });
  ok(true, "…tapping it saves the waiting file");
  const third = (await recs("files")).find((f) => !files.some((g) => g.id === f.id));
  await p.click(`${L} [data-file="${third.id}"]`); await settle();
  await p.click(`${L} #dl`); await settle();
  await p.click(`${L} .sheet .btn.danger, ${L} .sheet .btn.pri`); await settle();
  await p.waitForFunction(() => document.querySelectorAll("#mvLayer [data-file]").length === 2, null, { timeout: 10000 });
  ok((await recs("files")).length === 2, "…and a file can be deleted again");
  await p.click(`${L} #sv`); await settle();
  const appl = (await recs("hhAppliances"))[0];
  ok(appl?.name === "Washing machine" && appl.price === 3899000 && appl.warrantyTo === addDays(40) && files.every((f) => f.owner.id === appl.id), "the appliance is saved (₹38,990 as paise), its files with it");
  ok(/under warranty/i.test(await p.innerText(V)) && /2 files/.test(await p.innerText(V)), "listed under warranty, with 2 files");
  await p.click(`${V} [data-tab="due"]`); await settle();
  ok(/Washing machine warranty ends/.test(await p.innerText(V)), "a warranty ending within 60 days shows in Due");

  // open the files: decrypted here
  await p.click(`${V} [data-tab="appl"]`); await settle();
  await p.click(`${V} [data-appl="${appl.id}"]`); await settle();
  const photo = files.find((f) => f.mime === "image/png"), inv = files.find((f) => f.mime === "application/pdf");
  await p.click(`${L} [data-file="${photo.id}"]`);
  await p.waitForSelector(`${L} .hhview img`, { timeout: 10000 });
  ok(await p.$eval(`${L} .hhview img`, (i) => new Promise((r) => (i.complete ? r(i.naturalWidth) : (i.onload = () => r(i.naturalWidth))))) > 50, "the photo opens (decrypted on this device)");
  await p.click(`${L} #cx`); await settle();
  await p.click(`${L} [data-file="${inv.id}"]`);
  await p.waitForSelector(`${L} .hhview canvas`, { timeout: 15000 });
  ok((await p.$$(`${L} .hhview canvas`)).length === 1, "the PDF opens as its page");
  await p.screenshot({ path: `test-results/hh-${name}-file.png` });
  await p.click(`${L} #cx`); await settle();
  await p.click(`${L} #cx`); await settle();

  // service logged for the appliance
  await p.click(`${V} [data-appl="${appl.id}"]`); await settle();
  await p.click(`${L} #svcLog`); await settle();
  await fill("dwhat", "drum clean"); await p.uncheck(`${L} #f_tomoney`); await fill("dcost", "500");
  const txN = (await recs("txns")).length;
  await p.click(`${L} #sv`); await settle();
  ok((await recs("hhDone")).some((x) => x.applianceId === appl.id && x.cost === 50000 && !x.txnId) && (await recs("txns")).length === txN, "a service with Add to Money unticked stays out of Money");
  ok(/done before/i.test(await p.innerText(L)) && /₹500/.test(await p.innerText(L)), "…and shows in the appliance's history");
  await p.click(`${L} #cx`); await settle();

  // lists
  await p.click(`${V} [data-tab="lists"]`); await settle();
  await p.fill(`${V} #hhNew`, "Fix the bathroom tap"); await p.press(`${V} #hhNew`, "Enter"); await settle();
  await p.fill(`${V} #hhNew`, "Change the hall light"); await p.press(`${V} #hhNew`, "Enter"); await settle();
  let items = await recs("hhItems");
  ok(items.length === 2 && items.every((i) => i.list === "todo"), "two to-dos added");
  const tap = items.find((i) => i.text === "Fix the bathroom tap");
  await p.click(`${V} [data-item="${tap.id}"]`); await settle();
  await fill("idue", addDays(2)); await fill("ihome", homeId); await p.click(`${L} #sv`); await settle();
  await p.click(`${V} [data-tab="due"]`); await settle();
  ok(/Fix the bathroom tap/.test(await p.innerText(V)), "a to-do with a date shows in Due");
  await p.click(`${V} [data-tab="lists"]`); await settle();
  const hall = items.find((i) => i.text === "Change the hall light");
  await p.click(`${V} [data-tick="${hall.id}"]`); await settle();
  ok((await recs("hhItems")).find((i) => i.id === hall.id)?.doneOn === today && /done/i.test(await p.innerText(V)), "ticking one moves it to Done");
  await p.click(`${V} [data-list="grocery"]`); await settle();
  await p.fill(`${V} #hhNew`, "Rice 5 kg"); await p.press(`${V} #hhNew`, "Enter"); await settle();
  items = await recs("hhItems");
  const rice = items.find((i) => i.text === "Rice 5 kg");
  ok(rice?.list === "grocery", "groceries have their own list");
  await p.click(`${V} [data-tick="${rice.id}"]`); await settle();
  await p.click(`${V} #clearDone`); await settle();
  ok(!(await recs("hhItems")).some((i) => i.id === rice.id), "Clear removes bought groceries");

  // one home at a time
  await p.click(`${V} [data-home="prB"]`); await settle();
  await p.click(`${V} [data-tab="due"]`); await settle();
  const other = await p.$$eval(`${V} .hhbody .row`, (l) => l.map((e) => e.textContent).join(" | "));
  ok(!/AC service|bathroom tap|Washing machine/.test(other) && /nothing due for this home/i.test(await p.innerText(`${V} .hhbody`)), `choosing another home shows only its things${other ? ": " + other.slice(0, 200) : ""}`);
  await p.click(`${V} [data-home=""]`); await settle();
  await p.screenshot({ path: `test-results/hh-${name}-due.png`, fullPage: true });

  // removing the appliance removes its files from Drive
  await p.click(`${V} [data-tab="appl"]`); await settle();
  await p.click(`${V} [data-appl="${appl.id}"]`); await settle();
  await p.click(`${L} #dl`); await settle();
  await p.click(`${L} .sheet .btn.danger, ${L} .sheet .btn.pri`); await settle();
  ok((await recs("hhAppliances")).length === 0 && (await recs("files")).length === 0 && (await p.evaluate(() => window.DRIVE.size)) === 0, "removing the appliance removes its files from Drive");

  ok(errors.length === 0, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close(); server.close();
console.log(failed ? `hhflow: ${failed} failed` : "hhflow: all passed");
process.exit(failed ? 1 : 0);
