// Makes tests/fixtures/sample-export.json: made-up data created by KP Money Planner itself (no real data).
// Run: OLD_APP=/path/to/kp-money-planner/public/index.html node tests/fixtures/make-sample.mjs
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const OLD = process.env.OLD_APP;
if (!OLD) throw new Error("set OLD_APP");
const b = await chromium.launch();
const p = await b.newPage();
await p.route(/fonts\.g|config\.js/, (r) => r.abort());
await p.goto(`file://${OLD}#home`);
await p.waitForTimeout(800);
const data = await p.evaluate(() => {
  const acc = (name, type, opening) => { const a = { id: uid(), name, type, opening, updatedAt: Date.now() }; upsert("accounts", a); return a; };
  const bank = acc("Test Bank", "bank", 150000.5), card = acc("Test Card", "card", 0);
  const cat = (n) => S.data.categories.find((c) => c.name === n)?.id;
  const day = (d) => { const t = new Date(); t.setDate(d); return t.toISOString().slice(0, 10); };
  const tx = (type, amount, d, extra) => upsert("txns", { id: uid(), type, amount, date: day(d), accountId: bank.id, note: `sample ${type} ${amount}`, updatedAt: Date.now(), ...extra });
  tx("income", 85000, 1, { categoryId: cat("Salary") });
  tx("expense", 1234.56, 2, { categoryId: cat("Groceries") });
  tx("expense", 499, 3, { categoryId: cat("Subscriptions"), accountId: card.id });
  tx("expense", 18000, 5, { categoryId: cat("Rent & maintenance") });
  tx("transfer", 5000, 6, { toAccountId: card.id });
  const ym = day(1).slice(0, 7);
  upsert("recurring", { id: uid(), type: "expense", name: "Sample rent", amount: 18000, day: 5, freq: "monthly", start: ym, end: null, accountId: bank.id, categoryId: cat("Rent & maintenance"), updatedAt: Date.now() });
  upsert("loans", { id: uid(), kind: "emi", name: "Sample loan", lender: "Sample lender", principal: 500000, emi: 10500.75, rate: 9.5, tenure: 60, day: 10, start: ym, accountId: bank.id, plans: [], updatedAt: Date.now() });
  return S.data;
});
await b.close();
writeFileSync("tests/fixtures/sample-export.json", JSON.stringify({ app: "KP Money Planner", exported: "2026-01-01T00:00:00.000Z", data }, null, 1));
console.log(Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k}:${v.length}`).join(" "));
