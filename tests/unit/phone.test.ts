import { test } from "node:test";
import assert from "node:assert/strict";
import { dueDays, phoneReminders } from "../../app/modules/money/ui/phone.ts";

test("due days follow the repeat rule", () => {
  assert.deepEqual(dueDays("2026-11-28", "FREQ=MONTHLY;BYMONTHDAY=28", "2026-11-25", "2027-01-31"), ["2026-11-28", "2026-12-28", "2027-01-28"]);
  // the 31st falls on each month's last day
  assert.deepEqual(dueDays("2027-01-31", "FREQ=MONTHLY;BYMONTHDAY=31", "2027-01-01", "2027-04-30"), ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  assert.deepEqual(dueDays("2026-12-05", "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=5", "2026-11-25", "2027-07-01"), ["2026-12-05", "2027-03-05", "2027-06-05"]);
  assert.deepEqual(dueDays("2026-12-10", "FREQ=MONTHLY;BYMONTHDAY=10;UNTIL=20270131", "2026-11-25", "2027-12-31"), ["2026-12-10", "2027-01-10"]);
});

test("phone reminders: the day before and on the day at 9 AM, names only, nothing in the past", () => {
  const items = [
    { t: "HDFC card bill due", d: "2026-11-25", rr: "FREQ=MONTHLY;BYMONTHDAY=25" },
    { t: "Home loan EMI", d: "2026-12-05", rr: "FREQ=MONTHLY;BYMONTHDAY=5" },
    { t: "Salary", d: "2026-11-30", rr: "FREQ=MONTHLY;BYMONTHDAY=30" },
    { t: "Nifty SIP due", d: "2026-11-26", rr: "FREQ=MONTHLY;BYMONTHDAY=26" },
  ];
  const now = new Date(2026, 10, 25, 10, 0, 0);
  const r = phoneReminders(items, now);
  // today's 9 AM has passed (so no "tomorrow" for the 26th, nothing for today's bill); salary is income, not a bill
  assert.deepEqual(r.slice(0, 3).map((x) => [x.title, x.at.getDate()]), [["Nifty SIP due today", 26], ["Home loan EMI due tomorrow", 4], ["Home loan EMI due today", 5]]);
  assert.ok(!r.some((x) => /Salary/.test(x.title)));
  assert.ok(r.some((x) => x.title === "HDFC card bill due tomorrow" && x.at.getMonth() === 11 && x.at.getDate() === 24));
  for (const x of r) { assert.ok(x.at > now && x.at.getHours() === 9 && x.at.getMinutes() === 0); assert.doesNotMatch(`${x.title} ${x.body}`, /₹|\d/); }
  assert.equal(new Set(r.map((x) => x.id)).size, r.length);
});
