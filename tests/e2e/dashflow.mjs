// The Dashboard and the Money changes (approved design, 27 Nov 2026), used the way a person would: the Dashboard's cards,
// the Calendar's bills, Add transaction's (i), calculator, borrowed money folded and used-up budgets left out, a reserve bill paid by
// card brought back from the reserve's account on Pay by Tuesday, and Regular's filter. Phone.
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
const settle = () => p.waitForTimeout(450);
const V = "#moneyView #view";
await p.goto(`${base}/shell.html#/today`);
await p.waitForSelector(".tdy", { timeout: 15000 });
// made-up data: a to-do, a habit, a reserve account, two budgets this month (one used up)
await p.evaluate(() => {
  const t = new Date(), d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`, ym = d.slice(0, 7);
  const cat = FAKE.all("categories").find((c) => c.kind !== "income") ?? FAKE.all("categories")[0];
  FAKE.writeMany([
    { c: "hhItems", id: "td1", r: { id: "td1", list: "todo", text: "Call the plumber", added: d } },
    { c: "habits", id: "hb1", r: { id: "hb1", name: "Morning walk", kind: "check", start: "2026-01-01" } },
    { c: "accounts", id: "sav1", r: { id: "sav1", name: "Savings", type: "bank", opening: 5000000, reserve: true } },
    { c: "recurring", id: "bud1", r: { id: "bud1", name: "Groceries", type: "expense", budget: true, amount: 100000, freq: "monthly", start: ym, categoryId: cat.id } },
    { c: "recurring", id: "bud2", r: { id: "bud2", name: "Vaastu", type: "expense", budget: true, amount: 50000, freq: "once", start: ym, categoryId: cat.id } },
    { c: "txns", id: "vs1", r: { id: "vs1", type: "expense", amount: 50000, date: d, accountId: FAKE.all("accounts").find((a) => a.type === "bank").id, categoryId: cat.id, budgetId: "bud2" } },
  ]);
  window.CAT = cat.id;
});
await p.goto(`${base}/shell.html#/money/home`); await settle();
await p.goto(`${base}/shell.html#/today`); await settle();

console.log("Dashboard");
const dash = await p.innerText("#main");
ok((await p.innerText("#title")) === "Dashboard" && (await p.textContent('#nav [data-sub="today:today"]'))?.includes("Dashboard"), "Today is called Dashboard (title and bottom bar)");
ok(/Money/.test(dash) && !!(await p.$(".dbmoney")) && /Month-end/.test(await p.innerText(".dbmoney")) && /Spent this month/.test(await p.innerText(".dbmoney")), "a Money card: today, month-end, Pay by Tuesday, spent this month");
ok(/Habits · 0 of 1 today/i.test(dash) && /Morning walk/.test(dash), "a Habits card with today's habits");
ok(/To do · 1/i.test(dash) && /Call the plumber/.test(dash), "a To do card from Household › Lists");
ok(/Next up/i.test(dash) && !/Nothing in the next 7 days/.test(dash) && (await p.$$(".dbnext .dbday")).length >= 1, "Next up shows what's next with its day");
await p.click('.dbbox[data-todo="td1"]'); await settle();
ok(!!(await p.evaluate(() => FAKE.get("hhItems", "td1").doneOn)) && !/Call the plumber/.test(await p.innerText("#main")), "ticking a to-do marks it done");

console.log("Calendar");
await p.goto(`${base}/shell.html#/calendar`); await settle();
ok(/Bills and payments · next 30 days/i.test(await p.innerText("#main")) && /Sample rent/.test(await p.innerText("#main")), "the Calendar page lists the bills due in the next 30 days");

console.log("Add transaction");
await p.goto(`${base}/shell.html#/money/home`); await settle();
await p.click("#moneyAdd"); await settle();
ok(await p.$eval("#mvLayer #why_hist", (e) => e.hidden) && /Already in my balances/.test(await p.innerText("#mvLayer #w_hist")), "Already in my balances is one line, its explanation hidden");
await p.click('#mvLayer [data-swi="hist"]'); await settle();
ok(await p.$eval("#mvLayer #why_hist", (e) => !e.hidden && /adding late/.test(e.textContent)), "(i) shows the explanation");
await p.click('#mvLayer label[for="f_hist"]'); await settle();
ok(await p.$eval("#mvLayer #f_hist", (e) => e.checked), "tapping the line switches it on");
await p.click('#mvLayer label[for="f_hist"]'); await settle();
ok(!(await p.$eval("#mvLayer #w_pot", (e) => e.hidden)), "Paid from the big-bills reserve is offered (there's a reserve account)");
ok(await p.$eval("#mvLayer #w_more", (e) => !e.open && !e.hidden) && /borrowed money/i.test(await p.innerText("#mvLayer #w_more summary")), "borrowed money is folded away");
ok(await p.$eval("#mvLayer #w_note", (e) => !e.hidden) && await p.$eval("#mvLayer #w_tags", (e) => !e.hidden), "Note and Tags are always there");
ok(await p.$eval("#mvLayer #calcPad", (e) => e.hidden), "the calculator is closed until asked for");
await p.click("#mvLayer #calcBtn"); await settle();
for (const k of ["4", "5", "0", "+", "1", "2", "0", "×", "2"]) await p.click(`#mvLayer [data-ck="${k}"]`);
ok(/= ₹690/.test(await p.innerText("#mvLayer #calcEq")), "450 + 120 × 2 = ₹690");
await p.click("#mvLayer #calcUse"); await settle();
ok((await p.inputValue("#mvLayer #f_amount")) === "690" && await p.$eval("#mvLayer #calcPad", (e) => e.hidden), "Use it puts ₹690 in the amount and closes it");
const opts = await p.$$eval("#mvLayer #f_budgetId option", (l) => l.map((o) => o.textContent));
ok(opts.some((o) => /Groceries/.test(o)) && !opts.some((o) => /Vaastu/.test(o)), `a used-up budget isn't offered (${opts.join(" | ")})`);
// a big bill paid by card from the reserve
const setSel = (id, pick) => p.evaluate(([id, pick]) => { const s = document.querySelector(`#mvLayer #${id}`); const o = [...s.options].find((x) => x.value === pick || new RegExp(pick).test(x.textContent)); s.value = o.value; s.dispatchEvent(new Event("change", { bubbles: true })); }, [id, pick]);
await setSel("f_accountId", "Test Card");
await setSel("f_categoryId", await p.evaluate(() => CAT));
await p.fill("#mvLayer #f_note", "Hotstar");
await p.click('#mvLayer label[for="f_pot"]');
await p.click("#mvLayer #sv"); await p.waitForTimeout(900);
const tx = await p.evaluate(() => FAKE.all("txns").find((t) => t.note === "Hotstar"));
ok(tx && tx.pot === "reserve" && tx.amount === 69000, "the card spend is saved, paid from the reserve");

console.log("Pay by Tuesday: move it back from the reserve, in the week the card bill is due");
// the card's bill for today's spend is due next month: nothing to move yet
await p.evaluate(() => { const c = FAKE.all("accounts").find((a) => a.name === "Test Card"), day = new Date().getDate(); FAKE.writeMany([{ c: "accounts", id: c.id, r: { ...c, stmtDay: day, dueDay: day } }]); go("home"); }); await settle();
ok(!/Savings → Test Bank/.test(await p.innerText(`${V} .ptcard`).catch(() => "")), "not shown while the card bill is weeks away");
// a card without bill dates: the bill is due straight away
await p.evaluate(() => { const c = FAKE.all("accounts").find((a) => a.name === "Test Card"); const { stmtDay, dueDay, ...rest } = c; FAKE.writeMany([{ c: "accounts", id: c.id, r: rest }]); go("home"); }); await settle();
const card = await p.innerText(`${V} .ptcard`).catch(() => "");
ok(/Savings → Test Bank/.test(card) && /690/.test(card) && /1 reserve bill · Test Card/.test(card) && !/Hotstar/.test(card), "in the card bill's week: Savings → Test Bank ₹690 · 1 reserve bill · Test Card (names in the ⓘ)");
await p.click(`${V} .ptcard [data-rback]`); await settle();
const sh = await p.innerText("#mvLayer #modal .sheet").catch(() => "");
ok(/Savings → Test Bank/.test(sh) && /Test Card/.test(sh) && /Hotstar/.test(sh) && /690/.test(sh), "ⓘ lists the bills by card bill, and why");
await p.click("#mvLayer #bkMove"); await settle();
ok((await p.inputValue("#mvLayer #f_amount")) === "690", "Move opens the transfer for ₹690");
await p.click("#mvLayer #sv"); await p.waitForTimeout(900);
const back = await p.evaluate(() => FAKE.all("txns").find((t) => t.back === "reserve"));
ok(back && back.type === "transfer" && back.accountId === "sav1" && back.amount === 69000, "…saved as a transfer from Savings, marked as back from the reserve");
ok(!/Savings → Test Bank/.test(await p.innerText(`${V} .ptcard`).catch(() => "")), "…and the line goes away");

console.log("Regular");
await p.evaluate(() => { S.planTab = "regular"; go("plan"); }); await settle();
ok((await p.$$(`${V} .rgh`)).length >= 4 && !(await p.$eval(`${V} .rgl`, (e) => !e.hidden)), "groups start folded");
await p.click(`${V} [data-rgf="once"]`); await settle();
ok(/Budgets/.test(await p.innerText(V)) && !/Bills & payments/.test(await p.innerText(V)), "the Once filter shows only groups with one-off items");
await p.click(`${V} [data-rgf="all"]`); await settle();
ok(!errors.length, `no errors${errors.length ? ": " + errors.join(" | ") : ""}`);

await browser.close(); server.close();
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log("dashflow: all good");
