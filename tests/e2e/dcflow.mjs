// Vehicles (in Household) and Documents, used the way a person would, on phone and laptop, on a fixed day
// (Thursday 26 Nov 2026): a car with its renewals, service and fuel (mileage, costs into Money); then the
// Documents tab: a property's checklist (a sale deed with a file, this year's tax, "not needed"), a person and
// their passport, the car's insurance paper moving the car's renewal on, needs attention, search, and a file
// viewed and deleted with its document.
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const harness = (await build({ entryPoints: ["tests/e2e/dc-harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
const T = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/export.json") return res.end(await readFile("tests/fixtures/sample-export.json"));
  if (url === "/harness.js") return res.writeHead(200, { "content-type": T[".js"] }).end(harness);
  if (url === "/harness.html") return res.writeHead(200, { "content-type": T[".html"] }).end('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/money/mv.css"><main id="main"></main><div id="toast"></div><script type="module" src="/harness.js"></script>');
  const file = join("dist", normalize(url).replace(/^(\.\.[/\\])+/, ""));
  try { res.writeHead(200, { "content-type": T[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir("test-results", { recursive: true });
// a small PNG to attach
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC", "base64");
await writeFile("test-results/sale-deed.png", png);
const browser = await chromium.launch();
let failed = 0;
const ok = (cond, what) => { if (cond) console.log(`  ✓ ${what}`); else { failed++; console.error(`  ✗ ${what}`); } };

for (const [name, vp] of [["phone", { width: 390, height: 844 }], ["laptop", { width: 1280, height: 860 }]]) {
  console.log(name);
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route(/fonts\.g/, (r) => r.abort());
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date(2026, 10, 26, 10, 0));
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/harness.html#/household`);
  const L = "#mvLayer", settle = () => p.waitForTimeout(300);
  await p.waitForSelector("#hhView .hchip", { timeout: 15000 });
  const recs = (c) => p.evaluate((c) => [...(window.FAKE.data.get(c)?.values() ?? [])], c);
  const txns = async () => (await recs("txns")).length;
  const sheet = () => p.innerText(`${L} .sheet`);

  /* ---------- Vehicles ---------- */
  await p.click('#hhView [data-tab="veh"]'); await settle();
  ok(/No vehicles yet/.test(await p.innerText("#hhView")), "Household has a Vehicles tab, empty to start");
  await p.click("#hhView #addVeh"); await settle();
  await p.fill(`${L} #f_vname`, "Car"); await p.fill(`${L} #f_vreg`, "KA 01 AB 4321"); await p.fill(`${L} #f_vmodel`, "Hatchback");
  await p.fill(`${L} #f_vodo`, "42180");
  await p.fill(`${L} #f_vr_insurance`, "2026-12-08"); await p.fill(`${L} #f_vr_puc`, "2027-02-14"); await p.fill(`${L} #f_vr_rc`, "2034-01-01");
  await p.fill(`${L} #f_vsdate`, "2026-03-12"); await p.fill(`${L} #f_vskm0`, "35000");
  await p.click(`${L} #sv`); await settle();
  let s = await sheet();
  ok(/Insurance[\s\S]*in 12 days/.test(s) && /due at 45,000 km or 12 Mar 2027/.test(s), "the car's page: insurance in 12 days; service due at 45,000 km or 12 Mar 2027");
  // fuel: two full tanks → mileage; the amount into Money
  const t0 = await txns();
  await p.click(`${L} #vFuel`); await settle();
  await p.fill(`${L} #f_fodo`, "42200"); await p.fill(`${L} #f_flit`, "30"); await p.fill(`${L} #f_dcost`, "3150");
  await p.click(`${L} #sv`); await settle();
  await p.click(`${L} #vFuel`); await settle();
  await p.fill(`${L} #f_fodo`, "42650"); await p.fill(`${L} #f_flit`, "25"); await p.fill(`${L} #f_dcost`, "2625");
  await p.click(`${L} #sv`); await settle();
  s = await sheet();
  ok(/Mileage[\s\S]*18 km\/l/.test(s) && (await txns()) === t0 + 2, `two full tanks: 18 km/l, both fills added to Money as expenses`);
  await p.click(`${L} #vFuel`); await settle();
  await p.fill(`${L} #f_fodo`, "40000"); await p.fill(`${L} #f_flit`, "10");
  await p.click(`${L} #sv`); await settle();
  ok(/check the reading/.test(await p.evaluate(() => [...document.querySelectorAll("#mvLayer .toast")].map((t) => t.textContent).join(" "))), "a reading lower than the last fill is questioned");
  await p.click(`${L} #cx`); await settle();
  // renew insurance
  await p.click(`${L} [data-renew="insurance"]`); await settle();
  ok(await p.inputValue(`${L} #f_rto`) === "2027-12-08", "Renew suggests a year on (8 Dec 2027)");
  await p.fill(`${L} #f_dcost`, "7000"); await p.click(`${L} #sv`); await settle();
  const car = (await recs("hhVehicles"))[0];
  ok(car.renew.insurance === "2027-12-08" && (await txns()) === t0 + 3, "renewed: the car's insurance runs to 8 Dec 2027, and the premium is in Money");
  await p.click(`${L} #cx`); await settle();
  await p.evaluate((id) => { const f = window.FAKE; f.writeMany([{ c: "hhVehicles", id, r: { ...f.get("hhVehicles", id), renew: { ...f.get("hhVehicles", id).renew, puc: "2026-12-01" } } }]); }, car.id);
  await p.click('#hhView [data-tab="due"]'); await p.click('#hhView [data-home=""]'); await settle();
  ok(/Car puc renewal/i.test(await p.innerText("#hhView")), "Household's Due list shows the car's PUC renewal");

  /* ---------- Documents ---------- */
  await p.evaluate(() => { location.hash = "#/docs"; }); await settle();
  let v = await p.innerText("#dView");
  ok(/PROPERTIES/i.test(v) && /Test Flat/.test(v) && /VEHICLES/i.test(v) && /Car/.test(v), "Documents lists the properties (from Money) and the car (from Household)");
  ok(/Property tax 2026–27 · Test Flat/.test(v), "needs attention: this year's property tax receipt isn't added");
  await p.click('#dView [data-owner="props/prB"]'); await settle();
  v = await p.innerText("#dView");
  ok(/0 of 13 key documents/.test(v) && (await p.$$("#dView .dchk")).length === 13, "Test Flat's page: the full checklist of 13 key documents, none yet");
  // sale deed with a file and a number
  await p.click('#dView .dchk[data-add="sale_deed"]'); await settle();
  ok(await p.inputValue(`${L} #f_dtype`) === "sale_deed", "tapping Sale deed opens Add document for it");
  await p.setInputFiles(`${L} #dPick`, "test-results/sale-deed.png");
  await p.waitForSelector(`${L} [data-file]`);
  await p.fill(`${L} #f_dnum`, "1234 5678"); await p.fill(`${L} #f_dnote`, "Registered at Jayanagar");
  await p.click(`${L} #sv`); await settle();
  const sale = (await recs("docs")).find((d) => d.type === "sale_deed");
  ok(sale?.num4 === "5678", "only the last 4 of the number are kept (…5678)");
  ok(/1 of 13 key documents/.test(await p.innerText("#dView")) && /1 file/.test(await p.innerText("#dView")), "…sale deed ticked, with its file");
  // this year's tax
  await p.click('#dView .dyears [data-year="2026-27"]'); await settle();
  ok(await p.inputValue(`${L} #f_dyear`) === "2026-27" && await p.isVisible(`${L} #f_dyear`), "the 2026–27 tax chip opens Add document for that year");
  await p.click(`${L} #sv`); await settle();
  // not needed
  await p.click('#dView [data-na="rtc"]'); await settle();
  v = await p.innerText("#dView");
  ok(/2 of 12 key documents/.test(v) && /Not needed/.test(v), "RTC marked not needed: 2 of 12");
  await p.click('#dView [data-need="rtc"]'); await settle();
  ok(/2 of 13/.test(await p.innerText("#dView")), "…and needed again");
  await p.click("#dView #dBack"); await settle();
  ok(!/Property tax 2026–27 · Test Flat/.test(await p.innerText("#dView")), "needs attention no longer asks for Test Flat's tax");
  // a person and their passport
  await p.click('#dView [data-addowner="people"]'); await settle();
  await p.fill(`${L} #f_oname`, "KP"); await p.fill(`${L} #f_orel`, "me");
  await p.click(`${L} #sv`); await settle();
  await p.click('#dView [data-add="passport"]'); await settle();
  await p.fill(`${L} #f_dvalid`, "2027-03-01"); await p.click(`${L} #sv`); await settle();
  await p.click("#dView #dBack"); await settle();
  ok(/Passport · KP[\s\S]*Expires in 95 days/.test(await p.innerText("#dView")), "needs attention: KP's passport expires in 95 days");
  // the car's insurance paper moves the car's renewal on
  await p.click(`#dView [data-owner="hhVehicles/${car.id}"]`); await settle();
  await p.click('#dView .dchk[data-add="insurance"]'); await settle();
  await p.fill(`${L} #f_dvalid`, "2028-12-08"); await p.click(`${L} #sv`); await settle();
  ok((await recs("hhVehicles"))[0].renew.insurance === "2028-12-08", "the car's insurance policy (valid till 8 Dec 2028) moves the car's renewal date on");
  await p.click("#dView #dBack"); await settle();
  // search
  await p.fill("#dView #dq", "jayanagar"); await settle();
  v = await p.innerText("#dView");
  ok(/1 found/i.test(v) && /Sale deed/.test(v) && await p.evaluate(() => document.activeElement?.id === "dq"), "search finds the sale deed by its note, and keeps typing in the box");
  // view the file, then delete the document with it
  await p.click(`#dView [data-doc="${sale.id}"]`); await settle();
  await p.click(`${L} [data-file]`); await p.waitForSelector(`${L} .hhview img`, { timeout: 10000 });
  ok(true, "the sale deed's file opens (decrypted here)");
  await p.click(`${L} #cx`); await settle();
  ok(await p.inputValue(`${L} #f_dnote`) === "Registered at Jayanagar", "…and Back returns to the document");
  const before = await p.evaluate(() => window.DRIVE.size);
  await p.click(`${L} #dl`); await settle(); await p.click(`${L} #ok, ${L} .btn.danger`).catch(() => {}); await p.waitForTimeout(500);
  ok(!(await recs("docs")).some((d) => d.id === sale.id) && await p.evaluate(() => window.DRIVE.size) === before - 1, "deleting the document removes its file from Drive too");
  await p.fill("#dView #dq", ""); await settle();

  ok(!/<(span|div|b|button)\b/.test(await p.innerText("#dView")), "no markup shows as text");
  if (name === "phone") {
    await p.screenshot({ path: "test-results/documents-phone.png", fullPage: true });
    await p.click('#dView [data-owner="props/prB"]'); await settle(); await p.screenshot({ path: "test-results/documents-property.png", fullPage: true });
    await p.click('#dView .dchk[data-add="khata"]'); await settle(); await p.screenshot({ path: "test-results/documents-add.png" }); await p.click(`${L} #cx`); await settle();
    await p.evaluate(() => { location.hash = "#/household"; }); await settle(); await p.click('#hhView [data-tab="veh"]'); await settle();
    await p.screenshot({ path: "test-results/vehicles-tab.png" });
    await p.click("#hhView [data-veh]"); await settle(); await p.screenshot({ path: "test-results/vehicle-page.png" });
    ok(!/<(span|div|b|button)\b/.test(await sheet()), "the vehicle page shows no markup as text");
    await p.click(`${L} #cx`); await settle();
  }
  ok(!errors.length, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close(); server.close();
if (failed) { console.error(`dcflow: ${failed} failed`); process.exit(1); }
console.log("dcflow: all passed");
