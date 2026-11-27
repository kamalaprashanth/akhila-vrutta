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
  await p.evaluate(() => { location.hash = "#/household/veh"; }); await settle();
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
  await p.evaluate(() => { location.hash = "#/household/due"; }); await p.click('#hhView [data-home=""]'); await settle();
  ok(/Car puc renewal/i.test(await p.innerText("#hhView")), "Household's Due list shows the car's PUC renewal");

  /* ---------- Documents ---------- */
  await p.evaluate(() => { location.hash = "#/docs"; }); await settle();
  let v = await p.innerText("#dView");
  ok(/PROPERTIES/i.test(v) && /Test Flat/.test(v) && /VEHICLES/i.test(v) && /Car/.test(v), "Documents lists the properties (from Money) and the car (from Household)");
  ok(!/Property tax/.test(v), "the property tax receipt is optional: not asked for in needs attention");
  ok(!/LOANS AND ACCOUNTS/i.test(v), "accounts and loans without a document aren't listed");
  await p.click('#dView [data-owner="props/prB"]'); await settle();
  v = await p.innerText("#dView");
  ok(/0 of 12 key documents/.test(v) && /YEARLY, OPTIONAL/i.test(v) && /Remind me each April/.test(v), "Test Flat's page: 12 key documents, none yet; the tax receipt under Yearly, optional");
  // sale deed with a file and a number
  await p.click('#dView .dchk[data-add="sale_deed"]'); await settle();
  ok(await p.inputValue(`${L} #f_dtype`) === "sale_deed", "tapping Sale deed opens Add document for it");
  await p.setInputFiles(`${L} #dPick`, "test-results/sale-deed.png");
  await p.waitForSelector(`${L} [data-file]`);
  ok(!(await p.isVisible(`${L} #f_dnum`)) && !(await p.isVisible(`${L} #f_dvalid`)), "a sale deed asks for no number and no Valid till");
  await p.fill(`${L} #f_dnote`, "Registered at Jayanagar");
  // "Name it": the file's own name
  await p.click(`${L} [data-fname]`); await p.fill(`${L} .dfin`, "All pages"); await p.press(`${L} .dfin`, "Enter"); await settle();
  ok((await recs("files")).some((f) => f.label === "All pages") && /All pages/.test(await p.innerText(`${L} #dFiles`)), "Name it: the file is called All pages");
  await p.click(`${L} #sv`); await settle();
  const sale = (await recs("docs")).find((d) => d.type === "sale_deed");
  ok(sale?.note === "Registered at Jayanagar" && !sale.num && !sale.num4, "the sale deed is saved with its note");
  ok(/1 file: All pages/.test(await p.innerText("#dView")), "…its line says 1 file: All pages");
  ok(/1 of 12 key documents/.test(await p.innerText("#dView")) && /1 file/.test(await p.innerText("#dView")), "…sale deed ticked, with its file");
  // this year's tax
  await p.click('#dView .dyears [data-year="2026-27"]'); await settle();
  ok(await p.inputValue(`${L} #f_dyear`) === "2026-27" && await p.isVisible(`${L} #f_dyear`), "the 2026–27 tax chip opens Add document for that year");
  await p.click(`${L} #sv`); await settle();
  // not needed
  await p.click('#dView [data-na="rtc"]'); await settle();
  v = await p.innerText("#dView");
  ok(/1 of 11 key documents/.test(v) && /Not needed/.test(v), "RTC marked not needed: 1 of 11 (the tax receipt doesn't count)");
  await p.click('#dView [data-need="rtc"]'); await settle();
  ok(/1 of 12/.test(await p.innerText("#dView")), "…and needed again");
  await p.click("#dView #dTaxRemind"); await settle();
  ok((await recs("docPrefs")).some((x) => x.id === "props:prB" && x.taxRemind === true) && /On: reminded on 10 and 25 April/.test(await p.innerText("#dView")), "the April reminder for the tax receipt can be switched on");
  await p.click("#dView #dBack"); await settle();
  ok(!/Property tax 2026–27 · Test Flat/.test(await p.innerText("#dView")), "needs attention no longer asks for Test Flat's tax");
  // a person and their passport
  await p.click('#dView [data-addowner="people"]'); await settle();
  await p.fill(`${L} #f_oname`, "KP"); await p.fill(`${L} #f_orel`, "me");
  await p.click(`${L} #sv`); await settle();
  await p.click('#dView [data-add="passport"]'); await settle();
  await p.fill(`${L} #f_dvalid`, "2027-03-01"); await p.click(`${L} #sv`); await settle();
  // Aadhaar: the full number, hidden until 👁, copy; no note, no Valid till (27 Nov 2026)
  await p.click('#dView [data-add="aadhaar"]'); await settle();
  ok(/Aadhaar number/.test(await p.innerText(`${L} #w_dnum`)) && !(await p.isVisible(`${L} #f_dnote`)) && !(await p.isVisible(`${L} #f_dvalid`)), "Aadhaar asks for the Aadhaar number, with no note and no Valid till");
  await p.fill(`${L} #f_dnum`, "1234 5678 9012"); await p.click(`${L} #sv`); await settle();
  const aad = (await recs("docs")).find((d) => d.type === "aadhaar");
  ok(aad?.num === "1234 5678 9012", "the full number is kept (encrypted, like everything else)");
  let kv = await p.innerText("#dView");
  ok(/•••• •••• 9012/.test(kv) && !/1234 5678 9012/.test(kv), "…and shows hidden: •••• •••• 9012");
  await p.click(`#dView [data-shownum="${aad.id}"]`); await settle();
  ok(/1234 5678 9012/.test(await p.innerText("#dView")), "👁 shows it");
  await p.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await p.click(`#dView [data-cpnum="${aad.id}"]`); await settle();
  ok((await p.evaluate(() => navigator.clipboard.readText().catch(() => ""))) === "123456789012", "copy puts the number on the clipboard, without spaces");
  // your own type, kept for every person
  await p.click("#dView #dAddHere"); await settle();
  await p.selectOption(`${L} #f_dtype`, "__new"); await settle();
  ok(await p.isVisible(`${L} #f_dtnew`), "+ Add your own type… asks for its name");
  await p.fill(`${L} #f_dtnew`, "Gym membership"); await p.click(`${L} #sv`); await settle();
  const mt = (await recs("docPrefs")).find((x) => x.id === "types");
  const gym = (await recs("docs")).find((d) => mt?.list?.some((y) => y.k === d.type && y.label === "Gym membership"));
  ok(!!gym && /Gym membership/.test(await p.innerText("#dView")), "the document is saved as Gym membership");
  await p.click("#dView #dAddHere"); await settle();
  ok((await p.$$eval(`${L} #f_dtype optgroup[label="Your types"] option`, (l) => l.map((o) => o.textContent))).includes("Gym membership"), "…and Gym membership is offered under Your types next time");
  await p.click(`${L} #cx`); await settle();
  await p.click("#dView #dBack"); await settle();
  ok(/Passport · KP[\s\S]*Expires in 95 days/.test(await p.innerText("#dView")), "needs attention: KP's passport expires in 95 days");
  ok(/Your document types/i.test(await p.innerText("#dView")) && /Gym membership[\s\S]*1 document/.test(await p.innerText("#dView")), "Your document types lists it, with 1 document");
  await p.fill("#dView #dq", "gym"); await settle();
  ok(/1 found/i.test(await p.innerText("#dView")), "search finds it by its type's name");
  await p.fill("#dView #dq", ""); await settle();
  // + : what it's for, whose, then the document form with the right type
  await p.click("#addDoc"); await settle();
  ok((await p.$$(`${L} [data-cat]`)).length === 12, "+ asks what the document is for (12 choices)");
  await p.click(`${L} [data-cat="tax"]`); await settle();
  const kp = (await recs("docOwners")).find((o) => o.name === "KP");
  await p.click(`${L} [data-key="docOwners/${kp.id}"]`); await p.waitForTimeout(400);
  ok(await p.inputValue(`${L} #f_dtype`) === "itr" && await p.inputValue(`${L} #f_downer`) === `docOwners/${kp.id}`, "…Tax › KP opens Add document as KP's ITR acknowledgement");
  await p.click(`${L} #cx`); await settle();
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
    await p.evaluate(() => { location.hash = "#/household/due"; }); await settle(); await p.evaluate(() => { location.hash = "#/household/veh"; }); await settle();
    await p.screenshot({ path: "test-results/vehicles-tab.png" });
    await p.click("#hhView [data-veh]"); await settle(); await p.screenshot({ path: "test-results/vehicle-page.png" });
    ok(!/<(span|div|b|button)\b/.test(await sheet()), "the vehicle page shows no markup as text");
    await p.click(`${L} #cx`); await settle();
  }
  ok(!errors.length, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  // for the layout check: the records this flow made, as a starting point for every page
  if (name === "phone") { const dir = process.env.AV_DUMP ?? "test-results/seed"; await mkdir(dir, { recursive: true }); await writeFile(`${dir}/dcflow.json`, JSON.stringify(await p.evaluate(() => Object.fromEntries([...window.FAKE.data].map(([c, m]) => [c, [...m.values()]]))))); }
  await ctx.close();
}
await browser.close(); server.close();
if (failed) { console.error(`dcflow: ${failed} failed`); process.exit(1); }
console.log("dcflow: all passed");
