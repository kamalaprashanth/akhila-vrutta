import { test } from "node:test";
import assert from "node:assert/strict";
import { grouped, parse, searchAll, type Reader } from "../../app/modules/search/data.ts";

const data: Record<string, Record<string, unknown>[]> = {
  txns: [
    { id: "t1", type: "expense", amount: 50000, date: "2026-11-18", note: "Petrol for Activa", categoryId: "c1", accountId: "a1" },
    { id: "t2", type: "expense", amount: 185000, date: "2026-10-02", note: "Activa service", categoryId: "c1", accountId: "a1" },
    { id: "t3", type: "expense", amount: 500000, date: "2026-11-01", note: "Rent", categoryId: "c2", accountId: "a1" },
    { id: "t4", type: "carry", amount: 500000, date: "2026-11-01", note: "carry" },
    { id: "t5", type: "expense", amount: 99, date: "2026-11-01", note: "Activa wash", deleted: true },
  ],
  categories: [{ id: "c1", name: "Vehicle" }, { id: "c2", name: "Rent & maintenance" }],
  accounts: [{ id: "a1", name: "Test Bank", type: "bank" }],
  hhVehicles: [{ id: "v1", name: "Activa", reg: "KA 05 XY 1234", kind: "bike" }],
  hlMeds: [{ id: "m1", name: "Vitamin D3 60K", person: "p1" }],
  docOwners: [{ id: "p1", name: "KP", group: "people", rel: "me" }],
  habits: [{ id: "h1", name: "Walk 30 minutes", kind: "check", start: "2026-11-01" }],
};
const r: Reader = { all: (c) => (data[c] ?? []) as never, get: (c, id) => (data[c] ?? []).find((x) => x.id === id) as never };

test("every word must appear, in any order and case", () => {
  const h = searchAll(r, "activa SERVICE");
  assert.deepEqual(h.map((x) => x.key), ["t:t2"]);
});
test("finds things in every section, not deleted ones or carry-overs", () => {
  const keys = searchAll(r, "activa").map((x) => x.key).sort();
  assert.deepEqual(keys, ["t:t1", "t:t2", "v:v1"]);
  assert.deepEqual(searchAll(r, "vitamin").map((x) => x.area), ["Health"]);
  assert.deepEqual(searchAll(r, "walk").map((x) => x.area), ["Habits"]);
  assert.deepEqual(searchAll(r, "ka 05").map((x) => x.key), ["v:v1"]);
});
test("an amount finds Money entries of that amount, however it's typed", () => {
  for (const q of ["5000", "5,000", "₹5,000", "₹ 5000"]) assert.deepEqual(searchAll(r, q).map((x) => x.key), ["t:t3"], q);
  assert.equal(parse("1,850.50").rupees, 1850.5);
  assert.equal(parse("rent").rupees, null);
});
test("a category name finds its entries; one letter finds nothing", () => {
  assert.deepEqual(searchAll(r, "vehicle").map((x) => x.key).sort(), ["t:t1", "t:t2"]);
  assert.deepEqual(searchAll(r, "a"), []);
});
test("grouped by area, newest first", () => {
  const g = grouped(searchAll(r, "activa"));
  assert.deepEqual(g.map(([a]) => a), ["Money", "Household"]);
  assert.deepEqual(g[0]![1].map((x) => x.key), ["t:t1", "t:t2"]);
});
