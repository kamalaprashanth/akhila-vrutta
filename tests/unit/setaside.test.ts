// The month's set-aside on the 1st (approved 27 Nov 2026): the reserve's share less reserve money due back this month,
// one transfer with its parts; what's left over comes back on its card bill's Tuesday.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MoneyData } from "../../app/modules/money/calc/data.ts";
import { monthSetAside, reserveBack, reserveHeld, reserveState } from "../../app/modules/money/calc/reserve.ts";

const accounts = [
  { id: "hdfc", name: "HDFC", type: "bank", main: true, opening: 50000000, openDate: "2026-01-01" },
  { id: "slice", name: "Slice", type: "bank", reserve: true, opening: 10000000, openDate: "2026-01-01" },
  { id: "icici", name: "ICICI", type: "card", stmtDay: 15, dueDay: 3 },
  { id: "sbi", name: "SBI", type: "card", stmtDay: 20, dueDay: 8 },
];
const sp = (id: string, acc: string, date: string, amt: number, note: string) => ({ id, type: "expense", accountId: acc, date, amount: amt * 100, note, pot: "reserve" });
const spends = [
  sp("a", "icici", "2026-11-12", 2199, "Hotstar"), sp("b", "icici", "2026-11-14", 4000, "Insurance"),   // ICICI bill due 3 Dec
  sp("c", "sbi", "2026-11-09", 1499, "Prime"), sp("d", "sbi", "2026-11-14", 499, "Domain"), sp("e", "sbi", "2026-11-18", 253, "Antivirus"),   // SBI due 8 Dec
  sp("f", "icici", "2026-11-20", 999, "Later"),   // ICICI's next bill: due 3 Jan, not this month
];
const car = { id: "car", name: "Car insurance", type: "expense", amount: 1800000, freq: "yearly", start: "2027-03" };   // ₹6,000 a month
const fees = { id: "fees", name: "School fees", type: "expense", amount: 3000000, freq: "yearly", start: "2027-06" };   // ₹5,000 a month
const D = (recurring: object[], extra: object[] = []) => new MoneyData({ accounts, txns: [...spends, ...extra], recurring, categories: [] } as never, "2026-12-01");

test("the share less what comes back this month, in one transfer", () => {
  const d = D([car, fees]), m = monthSetAside(d)!;
  assert.equal(m.share, 1100000);
  assert.equal(m.netted, 619900 + 225100);   // ICICI (3 Dec) and SBI (8 Dec); the 20 Nov spend waits for January
  assert.equal(m.reserve, 1100000 - 845000);
  assert.equal(m.total, 255000);
  assert.equal(m.from.name, "HDFC"); assert.equal(m.to.name, "Slice");
  // nothing more to move back this month on Tuesdays: it's netted
  assert.equal(reserveBack(d, "2026-12-14", m.netted).length, 0);
});
test("recorded with its parts: done for the month, the bills counted as back, the reserve held right", () => {
  const before = reserveHeld(D([car, fees]));
  const move = { id: "m1", type: "transfer", date: "2026-12-01", accountId: "hdfc", toAccountId: "slice", amount: 255000, parts: [{ pot: "reserve", amt: 1100000 }, { back: "reserve", amt: 845000 }] };
  const d = D([car, fees], [move]);
  assert.equal(monthSetAside(d), null);
  assert.equal(reserveState(d).doneThis, true);
  assert.equal(reserveBack(d, "2026-12-31").length, 0);
  assert.equal(reserveHeld(d), before + 1100000);   // the reserve's share went in; the netted back doesn't touch the pot
  // in January, the 20 Nov spend comes back on its own
  const jan = reserveBack(new MoneyData({ accounts, txns: [...spends, move], recurring: [car, fees], categories: [] } as never, "2026-12-28"), "2027-01-03");
  assert.equal(jan[0]!.amt, 99900);
});
test("more coming back than the share: nothing for the reserve, the rest on Tuesday", () => {
  const d = D([car]), m = monthSetAside(d)!;
  assert.equal(m.share, 600000);
  assert.equal(m.reserve, 0);
  assert.equal(m.rest, 845000 - 600000);
  const tue = reserveBack(d, "2026-12-14", m.netted);
  assert.equal(tue[0]!.amt, 245000);
});
