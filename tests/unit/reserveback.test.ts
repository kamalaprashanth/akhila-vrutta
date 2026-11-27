// A reserve bill paid by card (approved 27 Nov 2026): it's moved back in the week its card bill is due, one line per
// account, grouped by card bill; what's been moved settles the oldest first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MoneyData } from "../../app/modules/money/calc/data.ts";
import { reserveBack } from "../../app/modules/money/calc/reserve.ts";

const accounts = [
  { id: "hdfc", name: "HDFC", type: "bank", main: true },
  { id: "slice", name: "Slice", type: "bank", reserve: true },
  { id: "icici", name: "ICICI", type: "card", stmtDay: 15, dueDay: 3 },
  { id: "sbi", name: "SBI", type: "card", stmtDay: 20, dueDay: 8 },
];
const sp = (id: string, acc: string, date: string, amt: number, note: string, more = {}) => ({ id, type: "expense", accountId: acc, date, amount: amt * 100, note, pot: "reserve", ...more });
const txns = [
  sp("a", "icici", "2026-11-12", 2199, "Hotstar"), sp("b", "icici", "2026-11-14", 4000, "Car insurance"),   // ICICI bill: 15 Nov → due 3 Dec
  sp("c", "sbi", "2026-11-09", 1499, "Prime"), sp("d", "sbi", "2026-11-14", 499, "Domain"), sp("e", "sbi", "2026-11-18", 253, "Antivirus"),   // SBI: 20 Nov → due 8 Dec
  sp("f", "icici", "2026-11-20", 999, "Later"),   // after ICICI's statement: due 3 Jan
  sp("g", "icici", "2026-11-12", 500, "Old", { hist: true }),   // already in balances: never
  { id: "x", type: "expense", accountId: "icici", date: "2026-11-12", amount: 70000, note: "Not reserve" },
];
const D = (extra: object[] = []) => new MoneyData({ accounts, txns: [...txns, ...extra], categories: [] } as never, "2026-11-27");

test("only what's due by then; one line per account; grouped by card bill", () => {
  const w1 = reserveBack(D(), "2026-12-07");   // the week of Tue 1 Dec: ICICI (3 Dec) only
  assert.equal(w1.length, 1);
  assert.equal(w1[0]!.from.name, "Slice"); assert.equal(w1[0]!.to.name, "HDFC");
  assert.equal(w1[0]!.amt, 619900);
  assert.deepEqual(w1[0]!.groups.map((g) => [g.acc, g.due, g.amt, g.items.length]), [["ICICI", "2026-12-03", 619900, 2]]);
  const w2 = reserveBack(D(), "2026-12-14");   // by then SBI (8 Dec) too: one line, two card bills
  assert.equal(w2[0]!.amt, 619900 + 225100);
  assert.deepEqual(w2[0]!.groups.map((g) => g.acc), ["ICICI", "SBI"]);
});
test("moved back: settles the oldest first, a part payment leaves the rest", () => {
  const mv = (amt: number) => ({ id: "m" + amt, type: "transfer", accountId: "slice", toAccountId: "hdfc", date: "2026-12-01", amount: amt * 100, back: "reserve" });
  assert.equal(reserveBack(D([mv(6199)]), "2026-12-07").length, 0);
  const r = reserveBack(D([mv(6199), mv(1000)]), "2026-12-14");
  assert.equal(r[0]!.amt, 225100 - 100000);
  assert.equal(r[0]!.groups[0]!.items[0]!.name, "Prime");   // ₹1,499 − ₹1,000 moved = ₹499 left on Prime
  assert.equal(r[0]!.groups[0]!.items[0]!.amt, 49900);
});
test("a reserve bill paid from another bank goes back to that bank, at once", () => {
  const r = reserveBack(D([sp("h", "hdfc", "2026-11-26", 1200, "Paid from HDFC")]), "2026-12-07");
  const g = r[0]!.groups.find((x) => x.acc === "HDFC")!;
  assert.equal(g.due, "2026-11-26");
  assert.equal(g.amt, 120000);
});
