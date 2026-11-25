import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, dueChip, dueGroups, dueRows, homes, householdNotes, nextDue, type Reader } from "../../app/modules/household/data.ts";
import type { Rec } from "../../app/core/store.ts";

const store = (d: Record<string, Rec[]>): Reader => ({
  all: <T extends Rec>(c: string) => (d[c] ?? []) as T[],
  get: <T extends Rec>(c: string, id: string) => (d[c] ?? []).find((r) => r.id === id) as T | undefined,
});

test("months move on the same day, or the month's last day", () => {
  assert.equal(addMonths("2026-11-25", 6), "2027-05-25");
  assert.equal(addMonths("2026-08-31", 6), "2027-02-28");
  assert.equal(addMonths("2027-12-15", 1), "2028-01-15");
  assert.equal(addMonths("2026-01-10", -2), "2025-11-10");
  assert.equal(nextDue("2026-11-25", 3), "2027-02-25");
});

test("homes: added here first, then Money's properties; deleted ones gone", () => {
  const r = store({ props: [{ id: "p1", name: "Plot" }, { id: "p2", name: "Old", deleted: true }], hhHomes: [{ id: "h1", name: "Where we live" }] });
  assert.deepEqual(homes(r).map((h) => [h.id, h.fromMoney]), [["h1", false], ["p1", true]]);
});

test("due: jobs, warranties within 60 days, dated to-dos; grouped and labelled", () => {
  const today = "2026-11-25";
  const r = store({
    hhHomes: [{ id: "h1", name: "Home" }],
    hhJobs: [{ id: "j1", home: "h1", name: "Tank cleaning", every: 6, due: "2026-11-15" }, { id: "j2", home: "h1", name: "AC service", every: 6, due: "2026-11-30" }, { id: "j3", home: "p9", name: "Pest control", every: 3, due: "2027-01-10" }],
    hhAppliances: [{ id: "a1", home: "h1", name: "Washer", warrantyTo: "2027-01-02" }, { id: "a2", home: "h1", name: "Fridge", warrantyTo: "2030-01-01" }],
    hhItems: [{ id: "i1", list: "todo", text: "Fix tap", due: "2026-11-26", added: today }, { id: "i2", list: "todo", text: "Done one", due: "2026-11-26", doneOn: today, added: today }, { id: "i3", list: "grocery", text: "Rice", added: today }],
  });
  const rows = dueRows(r, today);
  assert.deepEqual(rows.map((x) => x.title), ["Tank cleaning", "Fix tap", "AC service", "Washer warranty ends", "Pest control"]);
  assert.deepEqual(dueGroups(rows, today).map(([g, l]) => [g, l.length]), [["Overdue", 1], ["This month", 2], ["Coming up", 2]]);
  assert.deepEqual(dueChip(rows[0]!, today), ["10 days late", "bad"]);
  assert.deepEqual(dueChip(rows[1]!, today), ["tomorrow", "warn"]);
  assert.deepEqual(dueChip(rows[2]!, today), ["in 5 days", "warn"]);
  assert.equal(dueRows(r, today, "h1").length, 3);   // the to-do has no home: only under All homes
});

test("phone notes: 9 AM, day before and the day; warranty 30 days before; names only", () => {
  const now = new Date(2026, 10, 25, 10, 0);
  const r = store({
    hhJobs: [{ id: "j1", home: "h", name: "AC service", every: 6, due: "2026-11-30" }],
    hhAppliances: [{ id: "a1", home: "h", name: "Washer", warrantyTo: "2027-01-02", price: 3899000 }],
    hhItems: [{ id: "i1", list: "todo", text: "Fix tap", due: "2026-11-25", added: "2026-11-20" }],
  });
  const n = householdNotes(r, now);
  assert.deepEqual(n.map((x) => [x.title, x.at.getDate(), x.at.getHours()]), [["AC service due tomorrow", 29, 9], ["AC service due today", 30, 9], ["Washer warranty ends in 30 days", 3, 9]]);
  assert.ok(n.every((x) => !/₹|\d{4}/.test(x.title)));
});
