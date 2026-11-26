import { test } from "node:test";
import assert from "node:assert/strict";
import { label, nextTithi, panchang } from "../../app/modules/calendar/panchang.ts";
import { famTitle, occurrences } from "../../app/modules/calendar/data.ts";

// The tithi at sunrise in Bengaluru, checked against published Telugu calendars (festivals with their own
// timing rule, like Vinayaka Chaturthi at midday, can fall a day earlier than the sunrise tithi).
test("days by their sunrise tithi and amanta month", () => {
  assert.equal(nextTithi(0, 0, "2025-01-01"), "2025-03-30");   // Ugadi 2025
  assert.equal(nextTithi(0, 8, "2025-01-01"), "2025-04-06");   // Sri Rama Navami 2025
  assert.equal(nextTithi(3, 14, "2025-01-01"), "2025-07-10");  // Guru Purnima 2025
  assert.equal(nextTithi(5, 3, "2025-01-01"), "2025-08-27");   // Vinayaka Chaturthi 2025
  assert.equal(nextTithi(6, 29, "2025-01-01"), "2025-10-21");  // Deepavali amavasya 2025
  assert.equal(nextTithi(6, 9, "2025-01-01"), "2025-10-02");   // Vijayadashami 2025
  assert.equal(nextTithi(0, 0, "2026-01-01"), "2026-03-20");   // Chaitra Shukla Pratipada at sunrise (Ugadi is kept on the 19th)
});
test("2026 has an Adhika Jyeshtha; a day in it is never picked", () => {
  const p = panchang("2026-05-20");
  assert.equal(p.adhika, true);
  assert.equal(label(p), "Adhika Jyeshtha Shukla Chaturthi");
  assert.equal(panchang("2026-06-20").adhika, false);
  const d = nextTithi(2, 3, "2026-05-01")!;   // Jyeshtha Shukla Chaturthi: the real (nija) month, in June
  assert.ok(d >= "2026-06-15" && d <= "2026-06-20", d);
});
test("family days come round on the date and on the tithi", () => {
  const f = { id: "a", kind: "birthday" as const, name: "Amma", date: "1958-08-14", tithi: { m: 4, t: 6 }, byDate: true, byTithi: true };
  assert.equal(famTitle(f), "Amma's birthday");
  const o = occurrences(f, "2026-11-26", 400);
  assert.ok(o.some((x) => x.by === "date" && x.date === "2027-08-14" && x.years === 69));
  const t = o.find((x) => x.by === "tithi")!;
  assert.equal(panchang(t.date).month, 4); assert.equal(panchang(t.date).tithi, 6);
  const leap = occurrences({ id: "b", kind: "birthday", name: "X", date: "2000-02-29", byDate: true, byTithi: false }, "2026-01-01", 120);
  assert.equal(leap[0]!.date, "2026-02-28");
});
