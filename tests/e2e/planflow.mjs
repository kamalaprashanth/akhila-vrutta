// Plan, drawn by Akhila Vrutta, used the way a person would: chips, search, months, opening and
// saving an entry (in the planner's form), selecting and tagging, filters, clean-up, other tabs, links
// and the pages and forms that still open in the planner. Runs on the made-up sample, phone and laptop.
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
  await p.goto(`${base}/harness.html#/money/plan`);
  const f = await (await p.waitForSelector("#moneyFrame", { state: "attached" })).contentFrame();
  const V = "#moneyView #view";
  await p.waitForSelector(`${V} .planseg`, { timeout: 15000 });
  const frameShown = () => p.$eval("#moneyFrame", (e) => !e.hidden && getComputedStyle(e).display !== "none");
  const settle = () => p.waitForTimeout(450);
  const tab = () => p.$eval(`${V} .planseg [aria-pressed="true"]`, (e) => e.dataset.pt);
  ok(!(await frameShown()), "Plan is drawn by the app");
  for (const t of ["regular", "cashflow", "calendar", "goals", "month"]) { await p.click(`${V} [data-pt="${t}"]`); await settle(); ok((await tab()) === t, `tab ${t}`); }
  ok(await f.evaluate(() => S.planTab === "month"), "the tab is the planner's shared state");

  // Mark an item paid: the planner records it; the page redraws with it done.
  const pay = await p.$(`${V} [data-pay]`);
  if (pay) {
    const key = await pay.getAttribute("data-pay");
    await pay.click(); await p.waitForTimeout(900);
    ok(!(await frameShown()) && /Add transaction/.test(await p.textContent("#mvLayer #modal h3")), "Paid opens the app's entry, filled in");
    await p.click("#mvLayer #modal #sv"); await p.waitForTimeout(900);
    ok(await p.$(`${V} [data-undo="${key}"]`) !== null && await f.evaluate((k) => S.data.txns.some((t) => t.link === k && !t.deleted), key), "…saving it marks the item done (linked entry saved, page redraws)");
    await p.click(`${V} details.fm summary:has-text("Done this month")`); await settle();
    await p.click(`${V} [data-undo="${key}"]`); await settle();
    ok(/Marked/.test(await p.textContent("#mvLayer #modal h3")), "tapping Paid ▾ shows what was recorded");
    await p.click("#mvLayer #modal #un"); await p.waitForTimeout(900);
    ok(await p.$(`${V} [data-pay="${key}"]`) !== null && !(await f.evaluate((k) => S.data.txns.some((t) => t.link === k && !t.deleted), key)), "…and Undo makes it due again");
  } else ok(false, "an item to mark paid");

  // Regular: + Add opens the app's form and saves a new item; the list search filters rows.
  await p.click(`${V} [data-pt="regular"]`); await settle();
  await p.fill(`${V} [data-lsearch]`, "rent"); await settle();
  ok(await p.$$eval(`${V} .list > .row:not([hidden])`, (r) => r.length >= 1 && r.every((x) => /rent/i.test(x.textContent))), "searching the regular items filters them");
  await p.fill(`${V} [data-lsearch]`, ""); await settle();
  await p.click(`${V} #addRec`); await settle();
  ok(!(await frameShown()) && /Add planned item/.test(await p.textContent("#mvLayer #modal h3")), "+ Add regular item opens the app's form");
  await p.click("#mvLayer #rseg [data-k=investment]"); await settle();
  ok(await p.$eval("#mvLayer #w_categoryId", (e) => e.hidden) && await p.$eval("#mvLayer #w_invType", (e) => !e.hidden), "an investment asks for its type, not a category");
  await p.fill("#mvLayer #f_name", "Flow SIP"); await p.fill("#mvLayer #f_amount", "2,500"); await p.selectOption("#mvLayer #f_invType", "Mutual Fund"); await p.fill("#mvLayer #f_day", "5");
  await p.click("#mvLayer #modal #sv"); await p.waitForTimeout(900);
  const sip = await f.evaluate(() => S.data.recurring.find((r) => r.name === "Flow SIP"));
  ok(sip && sip.amount === 2500 && sip.type === "investment" && sip.invType === "Mutual Fund" && sip.day === 5, "…a ₹2,500 SIP on the 5th is saved");
  await p.click(`${V} [data-rec="${sip?.id}"]`); await settle();
  ok(/Edit planned item/.test(await p.textContent("#mvLayer #modal h3")) && (await p.inputValue("#mvLayer #f_amount")) === "2,500", "a regular item opens its form with its amount");
  await p.click("#mvLayer #modal #cx"); await settle();

  // Cash flow: forecast length and the keep-at-least line.
  await p.click(`${V} [data-pt="cashflow"]`); await settle();
  await p.click(`${V} [data-h="24"]`); await settle();
  ok(await p.$eval(`${V} [data-h="24"]`, (e) => e.getAttribute("aria-pressed") === "true") && (await p.$$(`${V} details.fm`)).length >= 24, "24-month forecast");
  await p.fill(`${V} #fcMin`, "500000"); await p.press(`${V} #fcMin`, "Tab"); await settle();
  ok(await p.$eval(V, (e) => /keep ≥ 5L|below ₹5,00,000|above ₹5,00,000/.test(e.textContent)), "the keep-at-least line is drawn");
  await p.fill(`${V} #fcMin`, ""); await p.press(`${V} #fcMin`, "Tab"); await settle();

  // Calendar: months and days.
  await p.click(`${V} [data-pt="calendar"]`); await settle();
  const m0 = await p.textContent(`${V} .monthbar .m`);
  await p.click(`${V} [data-bcm="1"]`); await settle();
  ok((await p.textContent(`${V} .monthbar .m`)) !== m0, "next month in the calendar");
  await p.click(`${V} [data-bcm="-1"]`); await settle();
  await p.click(`${V} .bcal .bd[data-bcd]:not(.x) >> nth=4`); await settle();
  ok(await p.$eval(`${V} .sh h3`, (e) => /^\d+ \w{3}$/.test(e.textContent)), "tapping a day lists that day");

  // Goals: + Add goal opens the app's form; changing the kind redraws it for that kind.
  await p.click(`${V} [data-pt="goals"]`); await settle();
  await p.click(`${V} #addGoal`); await settle();
  ok(!(await frameShown()) && /Add goal/.test(await p.textContent("#mvLayer #modal h3")), "+ Add goal opens the app's form");
  await p.selectOption("#mvLayer #f_gk", "retire"); await settle();
  ok(!!(await p.$("#mvLayer #f_rs")) && !(await p.$("#mvLayer #f_target")), "…choosing Retirement shows its fields");
  await p.click("#mvLayer #modal #cx"); await settle();

  ok(errors.length === 0, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(failed ? `✗ ${failed} failed` : "planflow: all passed");
process.exit(failed ? 1 : 0);
