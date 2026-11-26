// Habits, used the way a person would, on phone and laptop, on a fixed day (Wednesday 25 Nov 2026):
// the usual habits, ticking, amounts, a slip, times a week, a set number of days (and what happens when
// it's done), another day of the week, a habit's page and its calendar, the evening nudge, stopping.
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const harness = (await build({ entryPoints: ["tests/e2e/hb-harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
const T = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/harness.js") return res.writeHead(200, { "content-type": T[".js"] }).end(harness);
  if (url === "/harness.html") return res.writeHead(200, { "content-type": T[".html"] }).end('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/money/mv.css"><main id="main"></main><div id="toast"></div><script type="module" src="/harness.js"></script>');
  const file = join("dist", normalize(url).replace(/^(\.\.[/\\])+/, ""));
  try { res.writeHead(200, { "content-type": T[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
await mkdir("test-results", { recursive: true });
let failed = 0;
const ok = (cond, what) => { if (cond) console.log(`  ✓ ${what}`); else { failed++; console.error(`  ✗ ${what}`); } };
const DAY = "2026-11-25";
const add = (d, n) => { const x = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

for (const [name, vp] of [["phone", { width: 390, height: 844 }], ["laptop", { width: 1280, height: 860 }]]) {
  console.log(name);
  const ctx = await browser.newContext({ hasTouch: name === "phone", isMobile: name === "phone", viewport: vp });
  await ctx.route(/fonts\.g/, (r) => r.abort());
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date(2026, 10, 25, 18, 0));
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/harness.html#/habits`);
  const V = "#hbView", L = "#mvLayer";
  await p.waitForSelector(`${V} #addHabit`, { timeout: 15000 });
  const settle = () => p.waitForTimeout(250);
  const recs = (c) => p.evaluate((c) => [...(window.FAKE.data.get(c)?.values() ?? [])], c);
  const text = () => p.innerText(V);
  const row = (n) => p.locator(`${V} .hbrow`, { hasText: n });
  const habitId = async (n) => (await recs("habits")).find((h) => h.name === n)?.id;

  // the usual ones
  ok(/Start with a few habits/.test(await text()), "with no habits, it offers the usual ones");
  await p.click(`${V} #hbStarters`); await settle();
  const offered = await p.$$eval(`${L} .opt b`, (l) => l.map((e) => e.textContent.trim()));
  ok(offered.length === 6, `six usual habits to pick from (${offered.join(", ")})`);
  for (const i of [0, 1, 5]) await p.check(`${L} #hs${i}`);
  await p.click(`${L} #sv`); await settle();
  ok((await p.$$(`${V} .hbrow`)).length === 3 && /Walk 30 min/.test(await text()) && /0 of 8 glasses/.test(await text()) && /No sugar/.test(await text()), "Walk, Water and No sugar are on today's list");
  ok(/Today 1 of 3 done/.test(await text()), "…No sugar counts as done until a slip (1 of 3)");

  // tick, count, slip
  await row("Walk").locator(".hbtick").click(); await settle();
  for (let i = 0; i < 3; i++) await row("Water").locator("[data-plus]").click();
  await settle();
  ok(/3 of 8 glasses/.test(await text()) && /Today 2 of 3 done/.test(await text()), "ticking Walk and three glasses of water: 3 of 8, today 2 of 3");
  const walk = await habitId("Walk 30 min"), water = await habitId("Water");
  ok((await recs("habitLog")).some((l) => l.h === walk && l.d === DAY && l.v === 1) && (await recs("habitLog")).some((l) => l.h === water && l.v === 3), "…kept as a record for the day");
  for (let i = 0; i < 5; i++) await row("Water").locator("[data-plus]").click();
  await settle();
  ok(/Today 3 of 3 done/.test(await text()) && /This week 100%/.test(await text()), "8 glasses reach the target: 3 of 3, this week 100%");
  await row("No sugar").locator(".hbslip").click(); await settle();
  ok(/Slipped on this day/.test(await text()) && /Today 2 of 3 done/.test(await text()), "Slipped marks the day");
  await row("No sugar").locator(".hbslip").click(); await settle();
  ok(/1 day without/.test(await text()), "…and Undo takes it back (1 day without: it started today)");
  await row("Walk").locator(".hbtick").click(); await settle();
  ok(!(await recs("habitLog")).some((l) => l.h === walk), "un-ticking removes the day's record");
  await row("Walk").locator(".hbtick").click(); await settle();

  // a new habit: times a week, then a set number of days
  await p.click(`${V} #addHabit`); await settle();
  await p.fill(`${L} #f_hbname`, "Yoga");
  await p.click(`${L} [data-kind="weekly"]`);
  ok(await p.isVisible(`${L} #f_hbtimes`) && !(await p.isVisible(`${L} #f_hbtarget`)) && !(await p.isVisible(`${L} #hbGoalOn`)), "the form shows only what the kind needs (times a week)");
  await p.selectOption(`${L} #f_hbtimes`, "3");
  await p.click(`${L} [data-icon="🧘"]`);
  await p.click(`${L} #sv`); await settle();
  ok(/0 of 3 this week/.test(await text()), "Yoga, 3× a week: 0 of 3 this week");
  await row("Yoga").locator(".hbtick").click(); await settle();
  ok(/1 of 3 this week/.test(await text()), "…ticking it today: 1 of 3");

  await p.click(`${V} #addHabit`); await settle();
  await p.fill(`${L} #f_hbname`, "Surya namaskara");
  await p.check(`${L} #hbGoalOn`); await settle();
  ok(await p.isVisible(`${L} #f_hbgoal`) && !(await p.isVisible(`${L} #hbDays`)), "For a set number of days asks how many (and every day)");
  await p.fill(`${L} #f_hbgoal`, "40");
  await p.click(`${L} [data-icon="🙏"]`);
  await p.click(`${L} #sv`); await settle();
  ok(/Day 1 of 40 · ends 3 Jan 2027/.test(await text()), "Surya namaskara · 40 days: Day 1 of 40, ends 3 Jan 2027");
  await row("Surya").locator(".hbtick").click(); await settle();
  ok(/Day 1 of 40 · ends 3 Jan 2027/.test(await text()), "…ticked today: still day 1, same finish");

  // another day this week: Monday (Walk, Water and No sugar as if started a week ago)
  await p.evaluate((ids) => window.FAKE.writeMany(ids.map((id) => ({ c: "habits", id, r: { ...window.FAKE.get("habits", id), start: "2026-11-16" } }))), [walk, water, await habitId("No sugar")]);
  await p.click(`${V} [data-day="2026-11-23"]`); await settle();
  ok(/Mon 23 Nov 1 of 3 done/.test(await text()), `Monday can be ticked afterwards (${(await text()).match(/Mon 23 Nov[^\n]*/)?.[0]})`);
  await row("Walk").locator(".hbtick").click(); await settle();
  await p.click(`${V} [data-day="2026-11-24"]`); await settle();
  await row("Walk").locator(".hbtick").click(); await settle();
  ok(await p.isDisabled(`${V} [data-day="2026-11-26"]`), "days still to come can't be ticked");
  await p.click(`${V} #hbPrev`); await settle();
  ok(/Last week/.test(await text()) && await p.isDisabled(`${V} #hbPrev`), "last week can be opened too, not further");
  await p.click(`${V} #hbNext`); await settle();
  ok(/🔥 3 days · every day/.test(await row("Walk").innerText()), `Walk: 3 days in a row (${(await row("Walk").innerText()).replace(/\s+/g, " ")})`);

  // the habit's page
  await row("Walk").locator(".main").click(); await settle();
  ok(/Days in a row/.test(await text()) && /Last 6 months/.test(await text()), "tapping a habit opens its page: streaks and the calendar");
  ok((await p.$$(`${V} .hbheat button`)).length === 182 && (await p.$$(`${V} .hbheat .done`)).length === 3, "…26 weeks of days, 3 of them done");
  await p.click(`${V} .hbheat [data-cell="2026-11-10"]`); await settle();
  if (name === "phone") { ok(!!(await p.$(`${L} #dYes`)), "on a phone a day's square opens a sheet with big buttons"); await p.click(`${L} #dYes`); await settle(); }
  ok((await p.$$(`${V} .hbheat .done`)).length === 3, "a day before it started can't be ticked");
  if (name === "phone") {
    const day = await p.getAttribute(`${V} .hbheat .done >> nth=0`, "data-cell");
    await p.click(`${V} .hbheat [data-cell="${day}"]`); await settle();
    ok(/Now: Done/.test(await p.innerText(`${L} .sheet`)), "…saying how the day stands");
    await p.screenshot({ path: "test-results/habit-day-sheet.png" });
    await p.click(`${L} #dNo`); await settle();
    ok((await p.$$(`${V} .hbheat .done`)).length === 2, "…Not done unticks it");
    await p.click(`${V} .hbheat [data-cell="${day}"]`); await settle(); await p.click(`${L} #dYes`); await settle();
    ok((await p.$$(`${V} .hbheat .done`)).length === 3, "…and Done ticks it again");
  }
  await p.click(`${V} #hbEdit`); await settle();
  await p.fill(`${L} #f_hbname`, "Walk 30 minutes");
  await p.click(`${L} #sv`); await settle();
  ok(/Walk 30 minutes/i.test(await text()), `Edit renames it (${(await text()).slice(0, 80).replace(/\s+/g, " ")} | sheet: ${await p.evaluate(() => !!document.querySelector("#mvLayer .sheet"))})`);
  await p.click(`${V} #hbBack`); await settle();
  ok(/This week/.test(await text()), "Back returns to today");

  // the 40 days done: carry on daily
  await p.evaluate(({ id, days }) => window.FAKE.writeMany([{ c: "habits", id, r: { ...window.FAKE.get("habits", id), start: days[0] } }, ...days.map((d) => ({ c: "habitLog", id: `${id}_${d}`, r: { id: `${id}_${d}`, h: id, d, v: 1 } }))]), { id: await habitId("Surya namaskara"), days: Array.from({ length: 39 }, (_, i) => add(DAY, i - 39)) });
  await p.evaluate(() => window.REDRAW()); await settle();
  ok(/40 days done/.test(await text()) && (await p.$$(`${V} [data-goaldone]`)).length === 1, "when the 40th day is ticked: 40 days done, What next?");
  await p.click(`${V} [data-goaldone]`); await settle();
  await p.click(`${L} #goOn`); await settle();
  const surya = (await recs("habits")).find((h) => h.name === "Surya namaskara");
  ok(!surya.goal && /🔥 40 days · every day/.test(await row("Surya").innerText()), `Carry on daily: an everyday habit now, its 40 days its streak (${(await row("Surya").innerText()).replace(/\s+/g, " ")})`);

  // the evening nudge
  ok(/9 PM nudge/.test(await text()), "the evening nudge is at 9 PM to start with");
  await p.click(`${V} #hbNudge`); await settle();
  await p.fill(`${L} #f_nutime`, "20:30");
  await p.click(`${L} #sv`); await settle();
  ok(/8:30 PM nudge/.test(await text()) && (await recs("habitPrefs"))[0]?.nudge === "20:30", "…changed to 8:30 PM");

  // stop, and start again
  await row("Yoga").locator(".main").click(); await settle();
  await p.click(`${V} #hbStop`); await settle();
  ok(/Stopped or finished/i.test(await text()) && !(await row("Yoga").count()), `Stop habit moves it under Stopped or finished (${(await text()).slice(-300).replace(/\s+/g, " ")})`);
  await p.click(`${V} .row[data-habit="${await habitId("Yoga")}"]`); await settle();
  await p.click(`${V} #hbRestart`); await settle();
  await p.click(`${V} #hbBack`); await settle();
  ok(await row("Yoga").count() === 1, "…Start again brings it back");

  if (name === "phone") { await p.screenshot({ path: "test-results/habits-phone.png", fullPage: true }); }
  ok(!errors.length, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  // for the layout check: the records this flow made, as a starting point for every page
  if (name === "phone") { const dir = process.env.AV_DUMP ?? "test-results/seed"; await mkdir(dir, { recursive: true }); await writeFile(`${dir}/hbflow.json`, JSON.stringify(await p.evaluate(() => Object.fromEntries([...window.FAKE.data].map(([c, m]) => [c, [...m.values()]]))))); }
  await ctx.close();
}
await browser.close(); server.close();
if (failed) { console.error(`hbflow: ${failed} failed`); process.exit(1); }
console.log("hbflow: all passed");
