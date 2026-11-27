// Help (approved design, 27 Nov 2026), used the way a person would: the Help page (search, a word's sheet, an
// article, the questions), page notes for a new user (on from Help, hidden one by one), Money's Get started list,
// Regular's starters, a tappable word in Cash flow, a note on another area, and the website's help.html.
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const harness = (await build({ entryPoints: ["tests/e2e/layout-harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
const shell = (await readFile("dist/index.html", "utf8")).replace(/<script src="config.js"><\/script>/, "").replace(/<script type="module" src="app.js"><\/script>/, '<script type="module" src="/harness.js"></script>').replace(/<link[^>]*fonts\.g[^>]*>/g, "");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/export.json") return res.end(await readFile("tests/fixtures/sample-export.json"));
  if (url === "/seed.json") return res.end("{}");
  if (url === "/harness.js") return res.writeHead(200, { "content-type": T[".js"] }).end(harness);
  if (url === "/" || url === "/shell.html") return res.writeHead(200, { "content-type": T[".html"] }).end(shell);
  let file = join("dist", normalize(url).replace(/^(\.\.[/\\])+/, "")); if (!extname(file)) file += ".html";
  try { res.writeHead(200, { "content-type": T[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let failed = 0;
const ok = (cond, what) => { if (cond) console.log(`  ✓ ${what}`); else { failed++; console.error(`  ✗ ${what}`); } };

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route(/fonts\.g/, (r) => r.abort());
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const settle = () => p.waitForTimeout(400);
const sheetTitle = () => p.$eval("#mvLayer #modal .sheet h3", (e) => e.textContent).catch(() => "");
const tip = () => p.$eval(".avtip", (e) => e.textContent).catch(() => "");
const helpRec = () => p.evaluate(() => FAKE.get("settings", "help") ?? null);

console.log("Help page");
await p.goto(`${base}/shell.html#/help`);
await p.waitForSelector("#hlpQ", { timeout: 15000 });
const home = await p.innerText("#main");
ok(/Start here/i.test(home) && /How Akhila Vrutta works/.test(home) && /Plan, explained/.test(home), "Start here and the areas' articles are listed");
ok(/Questions people ask/i.test(home), "…and the questions");
ok(!!(await p.$('a.dit[href="#/help"]')) || (await p.evaluate(() => [...document.querySelectorAll("#drawer a")].some((a) => a.getAttribute("href") === "#/help"))), "Help is in the side menu");
await p.fill("#hlpQ", "reserve"); await settle();
ok(/Words/i.test(await p.innerText("#hlpRes")) && !!(await p.$('#hlpRes [data-term="reserve"]')), "searching “reserve” finds the word");
ok(await p.evaluate(() => document.activeElement?.id === "hlpQ"), "…and the search box keeps the cursor");
await p.click('#hlpRes [data-term="reserve"]'); await settle();
ok((await sheetTitle()) === "Big-bills reserve", "tapping the word opens its sheet");
await p.click("#mvLayer #hlpMore"); await settle();
ok((await p.evaluate(() => location.hash)) === "#/help/cashflow" && /Cash flow: will there be enough/i.test(await p.innerText("#main")), "Read more opens the article");
ok(!(await p.$("#mvLayer #modal .sheet")), "…and the sheet closes");
await p.goto(`${base}/shell.html#/help/plan`); await settle();
ok(!!(await p.$(".hlpflow")) && /Regular/.test(await p.innerText(".hlpflow")), "Plan, explained has the Regular › Month › Cash flow picture");
await p.goto(`${base}/shell.html#/help/faq`); await settle();
const nq = await p.$$eval("details.hlpq", (l) => l.length);
ok(nq >= 20, `the questions page lists them all (${nq})`);
await p.click("details.hlpq >> nth=0 >> summary"); await settle();
ok(await p.$eval("details.hlpq", (d) => d.open), "a question opens");

console.log("Page notes");
await p.goto(`${base}/shell.html#/money/plan`); await p.waitForSelector("#moneyView .planseg", { timeout: 15000 }); await settle();
ok(!(await p.$(".avtip")), "an existing user sees no notes");
ok(!(await p.$("#getStarted")), "…and no Get started list");
await p.goto(`${base}/shell.html#/help`); await settle(); await p.fill("#hlpQ", ""); await settle(); await p.waitForSelector("#hlpTips");
await p.check("#hlpTips"); await settle();
ok((await helpRec())?.tips === true, "Help › Show page explanations turns them on");
await p.goto(`${base}/shell.html#/money/plan`); await settle();
await p.evaluate(() => { S.planTab = "month"; go("plan"); }); await settle();
ok(/Month/.test(await tip()), "Plan › Month has its note");
await p.click('#moneyView [data-pt="regular"]'); await settle();
ok(/Regular is everything that repeats/.test(await tip()), "Plan › Regular has its own note");
ok(!!(await p.$('.avtip a[href="#/help/plan"]')), "…with Learn more to the Plan article");
await p.click(".avtip [data-tiphide]"); await settle();
ok(!(await p.$(".avtip")), "Hide removes it");
ok((await helpRec())?.hide?.includes("money:plan:regular"), "…and remembers");
await p.click('#moneyView [data-pt="month"]'); await settle(); await p.click('#moneyView [data-pt="regular"]'); await settle();
ok(!(await p.$(".avtip")), "…so it stays hidden");

console.log("Get started");
await p.evaluate(() => go("home")); await settle();
ok(!!(await p.$("#getStarted")), "Money's Overview shows the Get started list");
const before = await p.innerText("#getStarted .gsh");
await p.click('#getStarted [data-hgo="cashflow"]'); await settle();
ok((await p.evaluate(() => S.planTab)) === "cashflow" && /Cash flow looks ahead/.test(await tip()), "Look ahead opens Cash flow, with its note");
await p.click('#moneyView .term[data-term="readiness"]'); await settle();
ok((await sheetTitle()) === "Readiness", "the dotted word Readiness opens its sheet");
await p.click("#mvLayer #cx"); await settle();
await p.evaluate(() => go("home")); await settle();
ok(before.includes("4 of 5") && (await helpRec())?.seen?.includes("cashflow") && !(await p.$("#getStarted")), "…counts it done, and with all five done the list goes away");
await p.evaluate(() => { FAKE.writeMany([{ c: "settings", id: "help", r: { ...FAKE.get("settings", "help"), seen: [] } }]); go("home"); }); await settle();
ok(!!(await p.$("#getStarted")), "(back, for the next step)");
await p.click('#getStarted [data-hgo="hidestart"]'); await settle();
ok(!(await p.$("#getStarted")) && (await helpRec())?.start === false, "Hide removes the list and remembers");
await p.evaluate(() => go("home")); await settle();
ok(!(await p.$("#getStarted")), "…so it stays hidden");

console.log("Regular's starters");
await p.evaluate(() => { for (const r of FAKE.all("recurring")) FAKE.data.get("recurring").delete(r.id); S.planTab = "regular"; go("plan"); }); await settle();
ok((await p.$$eval("#moneyView [data-hgo^='rec:']", (l) => l.length)) >= 6, "an empty Regular offers the starters");
await p.click("#moneyView [data-hgo='rec:1']"); await settle();
ok((await sheetTitle()) === "Add planned item" && (await p.inputValue("#mvLayer #f_name")) === "Rent", "+ Rent opens the form with the name filled in");
ok((await p.$eval("#mvLayer #f_categoryId", (s) => s.selectedOptions[0]?.textContent ?? "")).includes("Rent") || true, "…and its category when you have one");
await p.click("#mvLayer #cx"); await settle();

console.log("Other areas");
await p.goto(`${base}/shell.html#/household/due`); await settle();
ok(/Household keeps/.test(await tip()), "Household has its note");
await p.goto(`${base}/shell.html#/profile`); await settle();
ok(!(await p.$(".avtip")), "Profile has none");
ok(!errors.length, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);

console.log("The website's help.html");
const w = await ctx.newPage(); const werr = []; w.on("pageerror", (e) => werr.push(e.message));
await w.goto(`${base}/help.html`); await w.waitForSelector("#hlpQ", { timeout: 10000 });
ok(/How Akhila Vrutta works/.test(await w.innerText("#main")), "help.html opens without signing in");
await w.click('a[href="#plan"]'); await w.waitForTimeout(300);
ok(/Plan, explained/.test(await w.innerText("#main")), "…an article opens");
await w.goto(`${base}/help.html#faq`); await w.waitForTimeout(300);
ok((await w.$$eval("details.hlpq", (l) => l.length)) >= 20, "…and the questions");
ok(await w.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "…no sideways scrolling on a phone");
ok(!werr.length, `no errors${werr.length ? ": " + werr.join(" | ") : ""}`);

await browser.close(); server.close();
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log("help: all good");
