// Health, used the way a person would, on phone and laptop, on a fixed day (Thursday 26 Nov 2026): adding
// yourself, readings (BMI with a height, a weigh-in habit ticked), a lab report from a PDF read by Claude
// (stand-in) and checked, compared with an earlier one, medicines ticked (stock down), a check-up done, a
// doctor's visit with its fee into Money, and an amount habit shown as a tile.
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const harness = (await build({ entryPoints: ["tests/e2e/hl-harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
const T = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".wasm": "application/wasm" };
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
// a one-page PDF with a few lines of a lab report (made up)
const lines = ["SAMPLE DIAGNOSTICS", "Test | Result | Unit | Reference", "LDL Cholesterol | 142 | mg/dL | < 100", "HDL Cholesterol | 46 | mg/dL | > 40", "Vitamin D | 22 | ng/mL | 30 - 100"];
const content = lines.map((l, i) => `BT /F1 11 Tf 50 ${780 - i * 18} Td (${l}) Tj ET`).join("\n");
const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
let pdf = "%PDF-1.4\n"; const offs = [];
objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
await writeFile("test-results/lab-report.pdf", pdf);

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
  await p.goto(`${base}/harness.html#/health`);
  const V = "#hlView", L = "#mvLayer", settle = () => p.waitForTimeout(300);
  await p.waitForSelector(`${V} #hlAddP`, { timeout: 15000 });
  const recs = (c) => p.evaluate((c) => [...(window.FAKE.data.get(c)?.values() ?? [])], c);
  const text = () => p.innerText(V);
  const toasts = () => p.evaluate(() => [...document.querySelectorAll("#mvLayer .toast")].map((t) => t.textContent).join(" | "));

  ok(/Whose health/.test(await text()), "with nobody in People, Health asks to add yourself");
  await p.click(`${V} #hlAddP`); await settle();
  await p.fill(`${L} #f_oname`, "KP"); await p.fill(`${L} #f_orel`, "me"); await p.click(`${L} #sv`); await settle();
  ok(/KP/.test(await text()) && (await recs("docOwners")).some((o) => o.name === "KP" && o.group === "people"), "KP is added (to People, shared with Documents)");
  // a weigh-in habit and a steps habit, to see the link
  await p.evaluate(() => window.FAKE.writeMany([{ c: "habits", id: "hw", r: { id: "hw", name: "Weigh in", kind: "check", start: "2026-11-01" } }, { c: "habits", id: "hs", r: { id: "hs", name: "Steps", kind: "amount", target: 8000, unit: "steps", start: "2026-11-01" } }, ...[20, 21, 22, 23, 24, 25, 26].map((d) => ({ c: "habitLog", id: `hs_2026-11-${d}`, r: { id: `hs_2026-11-${d}`, h: "hs", d: `2026-11-${d}`, v: 7000 + d * 10 } }))]));
  await p.evaluate(() => window.REDRAW()); await settle();
  ok(/Steps · from Habits[\s\S]*7,230/.test(await text()), "the Steps habit shows as a tile (7,230 a day over the last 7 days)");

  // readings
  await p.click(`${V} #hlRead`); await settle();
  await p.fill(`${L} #f_rv`, "80"); await p.fill(`${L} #f_rdate`, "2026-10-26"); await p.click(`${L} #sv`); await settle();
  await p.click(`${V} #hlRead`); await settle();
  await p.fill(`${L} #f_rv`, "78.4"); await p.click(`${L} #sv`); await settle();
  ok((await recs("habitLog")).some((l) => l.h === "hw" && l.d === "2026-11-26"), "a weight reading ticks the Weigh in habit for the day");
  await p.click(`${V} [data-kind="weight"]`); await settle();
  await p.click(`${L} #hgt`); await settle();
  await p.fill(`${L} #f_hh`, "175"); await p.click(`${L} #sv`); await settle();
  ok(/78\.4 kg[\s\S]*−1\.6 kg in 30 days · BMI 25\.6, a little high/.test(await text()), `the weight tile: 78.4 kg, −1.6 kg in 30 days, BMI 25.6 (${(await text()).match(/Weight[^\n]*\n[^\n]*\n[^\n]*/)?.[0]?.replace(/\n/g, " ")})`);
  await p.click(`${V} #hlRead`); await settle();
  await p.selectOption(`${L} #f_rkind`, "bp"); await settle();
  await p.fill(`${L} #f_rv`, "134"); await p.fill(`${L} #f_rv2`, "86"); await p.click(`${L} #sv`); await settle();
  ok(/134\/86[\s\S]*a little high/.test(await text()), "blood pressure 134/86: a little high");

  // an earlier lab report, typed
  await p.evaluate(() => window.FAKE.writeMany([{ c: "hlLabs", id: "old", r: { id: "old", person: [...window.FAKE.data.get("docOwners").values()][0].id, date: "2026-05-10", values: [{ group: "Lipid profile", name: "LDL Cholesterol", value: 156, unit: "mg/dL", high: 100 }] } }]));
  // a new one from a PDF, read by Claude
  await p.click(`${V} #hlLab`); await settle();
  await p.setInputFiles(`${L} #lFilesPick`, "test-results/lab-report.pdf");
  await p.waitForSelector(`${L} #lFiles [data-file]`);
  await p.click(`${L} #lread`);
  await p.waitForSelector(`${L} .lvrow`, { timeout: 20000 });
  const sent = await p.evaluate(() => window.SENT.at(-1) ?? "");
  ok(/LDL Cholesterol \| 142/.test(sent) && /Reply with JSON only/.test(await p.evaluate(() => "")) === false || /LDL Cholesterol \| 142/.test(sent), "Read values with Claude sends the report's text (read here from the PDF)");
  ok((await p.$$(`${L} .lvrow`)).length === 3 && await p.inputValue(`${L} #f_ldate`) === "2026-11-12" && await p.inputValue(`${L} #f_llab`) === "Sample Diagnostics", "…and fills 3 values, the date and the lab, to check");
  await p.fill(`${L} .lvrow >> nth=1 >> .lvv`, "48");   // corrected by hand
  await p.click(`${L} #lvadd`);
  await p.fill(`${L} .lvrow >> nth=-1 >> .lvn`, "HbA1c"); await p.fill(`${L} .lvrow >> nth=-1 >> .lvv`, "5.6"); await p.fill(`${L} .lvrow >> nth=-1 >> .lvu`, "%"); await p.fill(`${L} .lvrow >> nth=-1 >> .lvh`, "5.7");
  await p.click(`${L} #sv`); await settle();
  let v = await text();
  ok(/Lab report · 12 Nov/.test(v) && /LDL Cholesterol[\s\S]*High[\s\S]*142 mg\/dL · normal below 100 · May 2026 156 → 142 ↓/.test(v), "the report's page: LDL flagged High, compared with May (156 → 142 ↓)");
  ok(/HDL Cholesterol[\s\S]*48 mg\/dL/.test(v) && /HbA1c[\s\S]*5\.6 %/.test(v) && /Vitamin D[\s\S]*Low/.test(v), "…the corrected HDL, the typed HbA1c, and Vitamin D flagged Low");
  await p.click(`${V} #hlBack`); await settle();
  v = await text();
  ok(/Latest lab report · 12 Nov/i.test(v) && /[\s\S]*LDL Cholesterol[\s\S]*High[\s\S]*Vitamin D[\s\S]*Low[\s\S]*All 4 values/i.test(v), "Health shows the latest report's flagged values first, and All 4 values");

  // medicines
  await p.click(`${V} #hlMed`); await settle();
  await p.fill(`${L} #f_mname`, "Multivitamin"); await p.fill(`${L} #f_mt1`, "09:00"); await p.fill(`${L} #f_mstock`, "8");
  await p.click(`${L} #sv`); await settle();
  await p.click(`${V} [data-take]`); await settle();
  const med = (await recs("hlMeds"))[0];
  ok((await recs("hlMedLog")).length === 1 && med.stock === 7 && /running low/.test(await text()), "ticking today's dose: taken, 7 left, running low (a week's worth)");
  await p.click(`${V} [data-take]`); await settle();
  ok((await recs("hlMedLog")).length === 0 && (await recs("hlMeds"))[0].stock === 8, "…unticking puts it back");

  // a check-up, done
  await p.click(`${V} #hlCk`); await settle();
  await p.click(`${L} [data-st="Dentist"]`); await p.fill(`${L} #f_cdue`, "2026-11-20"); await p.click(`${L} #sv`); await settle();
  ok(/Dentist[\s\S]*overdue/.test(await text()), `a dentist check-up due on 20 Nov shows overdue (${JSON.stringify(await recs("hlCheckups"))})`);
  await p.click(`${V} [data-ck]`); await settle(); await p.click(`${L} #done`); await settle();
  ok(/Dentist[\s\S]*26 May 2027/.test(await text()), "Mark done: next due 26 May 2027");

  // a doctor's visit with its fee into Money
  const t0 = (await recs("txns")).length;
  await p.click(`${V} #hlVisit`); await settle();
  await p.fill(`${L} #f_vdoc`, "Dr Rao"); await p.fill(`${L} #f_vwhy`, "annual review"); await p.fill(`${L} #f_dcost`, "800");
  await p.click(`${L} #sv`); await settle();
  ok(/Dr Rao/.test(await text()) && (await recs("txns")).length === t0 + 1, "a doctor's visit is saved, and its ₹800 fee added to Money");

  ok(!/<(span|div|b|button)\b/.test(await text()), "no markup shows as text");
  if (name === "phone") { await p.screenshot({ path: "test-results/health-phone.png", fullPage: true }); await p.click(`${V} [data-lab]`); await settle(); await p.screenshot({ path: "test-results/health-lab.png", fullPage: true }); await p.click(`${V} #hlBack`); await settle(); }
  ok(!errors.length, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  // for the layout check: the records this flow made, as a starting point for every page
  if (name === "phone") { const dir = process.env.AV_DUMP ?? "test-results/seed"; await mkdir(dir, { recursive: true }); await writeFile(`${dir}/hlflow.json`, JSON.stringify(await p.evaluate(() => Object.fromEntries([...window.FAKE.data].map(([c, m]) => [c, [...m.values()]]))))); }
  await ctx.close();
}
await browser.close(); server.close();
if (failed) { console.error(`hlflow: ${failed} failed`); process.exit(1); }
console.log("hlflow: all passed");
