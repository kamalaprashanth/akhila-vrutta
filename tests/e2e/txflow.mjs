// Transactions, drawn by Akhila Vrutta, used the way a person would: chips, search, months, opening and
// saving an entry (in the planner's form), selecting and tagging, filters, clean-up, other tabs, links
// from other pages, and the sheet faults that were fixed. Runs on the made-up sample, phone and laptop.
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const EXPORT = "tests/fixtures/sample-export.json";
const harness = (await build({ entryPoints: ["tests/parity/harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
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
  await p.goto(`${base}/harness.html#/money/activity`);
  const frameEl = await p.waitForSelector("#moneyFrame", { state: "attached" });
  const f = await frameEl.contentFrame();
  const V = "#moneyView #view";
  await p.waitForSelector(`${V} .sumcard`, { timeout: 15000 });
  // The sample's entries are dated November 2026: show that month whatever today is.
  await f.waitForFunction(() => typeof S === "object" && !!S.data);
  await f.evaluate(() => { S.month = "2026-11"; go("activity"); });
  await p.waitForSelector(`${V} .dayhd`, { timeout: 15000 });
  const rows = () => p.$$eval(`${V} .row[data-tx] .t`, (es) => es.map((e) => e.textContent));
  const frameShown = () => p.$eval("#moneyFrame", (e) => !e.hidden && getComputedStyle(e).display !== "none");
  const settle = () => p.waitForTimeout(450);

  ok(!(await frameShown()), "the page is drawn by the app; the planner frame is hidden");
  ok((await rows()).length === 5, "this month's 5 entries are listed");

  await p.click(`${V} [data-ftype="expense"]`); await settle();
  ok((await rows()).every((t) => /expense/.test(t)) && (await rows()).length === 3, "Expense chip: only the 3 expenses");
  ok(await f.evaluate(() => S.f.type === "expense"), "…and the planner's filter follows (shared with its pages)");
  await p.click(`${V} [data-ftype="all"]`); await settle();

  await p.fill(`${V} #txq`, "18000"); await p.waitForTimeout(600);
  ok((await rows()).length === 1, "search by amount finds one entry");
  ok(await p.$eval(`${V} #txq`, (e) => e === document.activeElement && e.value === "18000"), "the search box keeps focus and text");
  await p.click(`${V} [data-fclear="q"]`); await settle();
  ok((await rows()).length === 5, "removing the search chip brings them all back");

  await p.click(`${V} [data-m="-1"]`); await settle();
  ok((await p.textContent(`${V} .monthbar`)).includes("Oct"), "previous month");
  await p.click(`${V} [data-m="1"]`); await settle();

  // Open an entry: the form is Akhila Vrutta's, over the whole screen, nothing covering its buttons.
  const L = "#mvLayer #modal";
  const sheetUp = () => p.$eval(L, (e) => !!e.querySelector(".sheet"));
  await p.click(`${V} .row[data-tx]:has-text("sample expense 18000")`); await settle();
  ok(await sheetUp() && (await p.textContent(`${L} h3`)) === "Edit transaction", "tapping an entry opens the form");
  ok(!(await frameShown()), "…drawn by the app (the planner's frame stays hidden)");
  ok(await p.$eval(`${L} .scrim`, (e) => { const r = e.getBoundingClientRect(); return r.top === 0 && Math.round(r.bottom) === innerHeight; }), "the sheet's backdrop covers the whole screen");
  ok(await p.$eval(`${L} .sheet`, (e) => innerWidth >= 700 || Math.round(e.getBoundingClientRect().bottom) === innerHeight), "on a phone the sheet reaches the bottom");
  ok(await p.$eval(".fab", (e) => getComputedStyle(e).display === "none"), "the + button is hidden while a sheet is open");
  {
    const b = await (await p.$(`${L} #dl`)).boundingBox();
    const hit = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [b.x + b.width / 2, b.y + b.height / 2]);
    ok(hit === "dl", "the Delete button isn't covered by anything");
  }
  ok(await p.$eval(`${L} #cp_lbl`, (e) => e.textContent === "Rent & maintenance"), "the category picker shows the entry's category");
  const before = await p.evaluate(() => window.FAKE.writes.length);
  await p.fill(`${L} #f_amount`, "");
  await p.type(`${L} #f_amount`, "1850025");
  ok(await p.$eval(`${L} #f_amount`, (e) => e.value === "18,50,025"), "₹ amounts group Indian-style as you type");
  ok(await p.$eval(`${L} .inrh`, (e) => e.textContent === "₹ 18.5 lakh"), "…with lakh shown underneath");
  await p.fill(`${L} #f_amount`, "18,500.25");
  await p.click(`${L} #sv`); await p.waitForTimeout(900);
  ok(!(await sheetUp()) && !(await frameShown()), "saving closes the form");
  ok(await p.$eval(`${V}`, (e) => e.textContent.includes("18,500.25")), "the list shows the new amount straight away");
  const w = await p.evaluate((n) => window.FAKE.writes.slice(n).filter((x) => x.c === "txns").map((x) => x.r.amount), before);
  ok(w.length === 1 && w[0] === 1850025, `saved once, in paise (${JSON.stringify(w)})`);
  ok(await f.evaluate(() => S.data.txns.some((t) => t.amount === 18500.25)), "…and the planner's pages have it too (in rupees)");

  // Add a new expense with the pickers, a tag and a note.
  await p.click(".fab"); await settle();
  ok((await p.textContent(`${L} h3`)) === "Add transaction", "+ opens the add form");
  await p.fill(`${L} #f_amount`, "250");
  await p.click(`${L} #cp_btn`); await p.fill(`${L} #cp_q`, "groc"); await p.press(`${L} #cp_q`, "Enter");
  ok(await p.$eval(`${L} #cp_lbl`, (e) => e.textContent === "Groceries"), "category search picks Groceries");
  await p.click(`${L} #ap_btn_f_accountId`);
  await p.click(`${L} .aprow:has-text("Test Card")`);
  ok(await p.$eval(`${L} #f_accountId`, (e) => e.selectedOptions[0].textContent.startsWith("Test Card")), "account picker picks the card");
  await p.fill(`${L} #f_note`, "sample exp");
  ok(await p.$eval(`${L} #noteSugg`, (e) => !e.hidden && e.textContent.includes("sample expense")), "the note suggests earlier notes");
  await p.fill(`${L} #f_note`, "veg market");
  await p.fill(`${L} #tagNew`, "Weekly"); await p.click(`${L} #tagAdd`);
  await p.click(`${L} #sv`); await p.waitForTimeout(900);
  ok(await p.$eval(V, (e) => e.textContent.includes("veg market") && e.textContent.includes("Weekly")), "the new expense is listed with its tag");
  const added = await p.evaluate(() => window.FAKE.writes.filter((x) => x.c === "txns" && x.r.note === "veg market").map((x) => x.r));
  ok(added.length === 1 && added[0].amount === 25000 && added[0].tags?.[0] === "Weekly" && !!added[0].categoryId, "saved once: ₹250 as 25000 paise, with category and tag");

  // Split it into two categories.
  await p.click(`${V} .row[data-tx]:has-text("veg market")`); await settle();
  await p.click(`${L} #spl`); await settle();
  ok((await p.textContent(`${L} h3`)) === "Split ₹250", "Split opens with the full amount");
  await p.fill(`${L} #f_sa0`, "150");
  await p.selectOption(`${L} #f_sc1`, { label: "Rent & maintenance" });
  await p.fill(`${L} #f_sa1`, "100");
  ok((await p.textContent(`${L} #splitLeft`)) === "✓ Adds up", "the parts add up");
  await p.click(`${L} #sv`); await p.waitForTimeout(900);
  ok((await p.$$eval(`${V} .row[data-tx] .s`, (es) => es.filter((e) => e.textContent.includes("split")).length)) === 2, "two split entries are listed");

  // Delete with a confirm step.
  await p.click(`${V} .row[data-tx]:has-text("veg market") >> nth=1`); await settle();
  await p.click(`${L} #dl`); await settle();
  ok((await p.textContent(`${L} h3`)) === "Are you sure?", "Delete asks first");
  await p.click(`${L} #cy`); await p.waitForTimeout(900);
  ok((await p.$$eval(`${V} .row[data-tx] .t`, (es) => es.filter((e) => e.textContent === "veg market").length)) === 1, "one part is deleted");
  ok(await p.evaluate(() => window.FAKE.writes.some((x) => x.c === "txns" && x.r.deleted === true)), "…kept as deleted so other devices learn of it");

  // Select two and tag them.
  await p.click(`${V} #txSel`); await settle();
  await p.click(`${V} .row[data-tx]:has-text("sample expense 499")`);
  await p.click(`${V} .row[data-tx]:has-text("sample income 85000")`); await settle();
  ok((await p.textContent(`${V} .bulkbar b`)) === "2 selected", "selecting picks rows instead of opening them");
  ok(!(await sheetUp()), "…without opening the form");
  const bar = await p.$eval(`${V} .bulkbar`, (e) => { const r = e.getBoundingClientRect(); return { bottom: r.bottom, top: r.top }; });
  ok(Math.round(vp.height - bar.bottom) === (vp.width < 900 ? 146 : 24), `the selection bar sits where it did, above the app's tabs (${Math.round(vp.height - bar.bottom)}px up)`);
  await p.click(`${V} [data-bulk="tag"]`); await settle();
  ok(await sheetUp(), "Add tag opens its sheet");
  await p.fill(`${L} #f_tag`, "Trip");
  await p.click(`${L} #sv`); await p.waitForTimeout(900);
  ok(!(await sheetUp()), "the sheet closes");
  ok((await p.$$eval(`${V} .tagmini`, (es) => es.filter((e) => e.textContent === "Trip").length)) === 2, "both entries show the new tag");
  ok(await p.$eval("#mvLayer", (e) => !!e.querySelector(".toast") && e.textContent.includes("Tagged 2")), "a message confirms it");
  await p.click(`${V} [data-bulk="done"]`); await settle();
  ok(!(await p.$(`${V} .bulkbar`)), "Done leaves selection mode");

  // Filters, and saving them as a view.
  await p.click(`${V} #txFilters`); await settle();
  ok((await p.textContent(`${L} h3`)) === "Filter transactions", "Filters opens");
  await p.selectOption(`${L} #f_period`, "all");
  ok(await p.$eval(`${L} #w_range`, (e) => e.hidden), "custom dates only show for a custom range");
  await p.fill(`${L} #f_vname`, "Everything");
  await p.click(`${L} #vsave`); await p.waitForTimeout(800);
  ok(await p.$eval(V, (e) => e.textContent.includes("All time ✕") && e.textContent.includes("★ Everything")), "the filter applies and the saved view shows as a chip");
  await p.click(`${V} [data-fclear="all"]`); await settle();
  await p.click(`${V} [data-view]`); await settle();
  ok(await p.$eval(V, (e) => e.textContent.includes("All time ✕")), "tapping the saved view brings its filter back");
  await p.click(`${V} [data-fclear="all"]`); await settle();

  await p.click(`${V} #txClean`); await settle();
  ok((await p.textContent(`${L} h3`)) === "Clean up", "Clean up opens");
  await p.click(`${L} #cx`); await settle();
  ok(!(await sheetUp()), "…and closes");

  // Another tab and back.
  await p.evaluate(() => { location.hash = "#/money/insights"; }); await p.waitForTimeout(700);
  ok(await frameShown() && await p.$eval("#moneyView", (e) => e.hidden), "Insights is the planner's page again");
  // A sheet on a planner page: full screen, then back to its normal place.
  await f.evaluate(() => txFilterSheet()); await settle();
  ok(await p.$eval("#moneyFrame", (e) => e.classList.contains("over") && e.getBoundingClientRect().top === 0), "a planner page's sheet also fills the screen");
  await f.evaluate(() => closeModal()); await settle();
  ok(await p.$eval("#moneyFrame", (e) => !e.classList.contains("over") && e.getBoundingClientRect().top > 0), "…and the frame goes back under the tabs");
  ok(await f.evaluate(() => !document.documentElement.classList.contains("avfull")), "…with the planner's page back in place");

  // A link from another planner page into Transactions, with its filter.
  await f.evaluate(() => { S.f = { type: "expense", cat: "", acc: "", tag: "", period: "custom", from: "2026-11-02", to: "2026-11-03", q: "" }; go("activity"); }); await p.waitForTimeout(700);
  ok(!(await frameShown()) && (await rows()).length === 2, "a link from another page opens Transactions with its filter");
  await f.evaluate(() => { S.f = null; }); await p.evaluate(() => { location.hash = "#/money/home"; }); await p.waitForTimeout(500);
  await p.evaluate(() => { location.hash = "#/money/activity"; }); await p.waitForTimeout(700);
  ok((await rows()).length === 6, "back to the default view (the 5 entries and the one added above)");

  // Keyboard: Enter on a row opens it.
  await p.focus(`${V} .row[data-tx]`); await p.keyboard.press("Enter"); await settle();
  ok(await p.$eval("#mvLayer #modal", (e) => !!e.querySelector(".sheet")), "Enter on a row opens it");
  await p.press("#mvLayer #modal #cx", "Enter"); await settle();

  ok(errors.length === 0, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(failed ? `✗ ${failed} failed` : "txflow: all passed");
process.exit(failed ? 1 : 0);
