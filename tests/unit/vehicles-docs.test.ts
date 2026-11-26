import { test } from "node:test";
import assert from "node:assert/strict";
import { mileage, nextService, vehicleDue, vehicleNotes, type Fuel, type Vehicle } from "../../app/modules/household/vehicles.ts";
import { attention, checklist, docNotes, fyOf, keyScore, last4, recentFys, search, type Doc } from "../../app/modules/documents/data.ts";
import type { Rec } from "../../app/core/store.ts";

const store = (d: Record<string, Rec[]>) => ({
  all: <T extends Rec>(c: string) => (d[c] ?? []) as T[],
  get: <T extends Rec>(c: string, id: string) => (d[c] ?? []).find((r) => r.id === id) as T | undefined,
});
const T = "2026-11-26";

test("mileage the full-tank way: km between full fills ÷ fuel put in after the first", () => {
  const f = (odo: number, litres: number, full = true): Fuel => ({ id: String(odo), vehicleId: "v", date: T, odo, litres, full });
  assert.equal(mileage([f(1000, 30)]), null);
  assert.equal(mileage([f(1000, 30), f(1500, 25)]), 20);
  assert.equal(mileage([f(1000, 30), f(1200, 10, false), f(1500, 15)]), 20);   // a part fill counts in the fuel
  assert.equal(mileage([f(0, 40), f(1000, 30), f(1500, 25), f(2000, 25), f(2500, 25), f(3000, 25)], 4), 20);
});

test("service: every N km or N months, whichever comes first", () => {
  const v: Vehicle = { id: "v", name: "Car", service: { km: 10000, months: 12, lastDate: "2026-03-12", lastKm: 35000 } };
  assert.deepEqual(nextService(v, 42180), { date: "2027-03-12", km: 45000, kmLeft: 2820 });
  assert.equal(nextService({ id: "x", name: "Bike" }, 0), null);
  const r = store({ hhVehicles: [{ ...v, odo: 44700 }] });
  assert.ok(vehicleDue(r, T).some((x) => x.key === "service"), "within 500 km: due");
  assert.ok(!vehicleDue(store({ hhVehicles: [{ ...v, odo: 40000 }] }), T).some((x) => x.key === "service"));
});

test("renewals: due within 60 days, reminders name the vehicle only", () => {
  const r = store({ hhVehicles: [{ id: "v", name: "Car", reg: "KA 01 AB 1234", renew: { insurance: "2026-12-08", puc: "2027-02-14", rc: "2034-01-01" } }] });
  const due = vehicleDue(r, T);
  assert.deepEqual(due.map((x) => x.key), ["insurance"]);
  const notes = vehicleNotes(r, new Date(2026, 10, 26, 8));
  assert.ok(notes.some((n) => n.title === "Car: Insurance ends today" && n.at.getDate() === 8));
  assert.ok(notes.every((n) => !/₹|\d{3,}/.test(n.title.replace("Car", ""))));
});

test("financial years and last 4", () => {
  assert.equal(fyOf("2026-03-31"), "2025-26");
  assert.equal(fyOf("2026-04-01"), "2026-27");
  assert.deepEqual(recentFys(T, 3), ["2026-27", "2025-26", "2024-25"]);
  assert.equal(last4("1234 5678 9012"), "9012");
  assert.equal(last4("abcde12x"), "E12X");
});

const prop = { id: "p1", name: "Lakeview flat" };
const doc = (id: string, type: string, extra: Partial<Doc> = {}): Doc => ({ id, owner: { c: "props", id: "p1" }, type, added: T, ...extra });

test("a property's checklist: present and not needed; the tax receipt is optional (not in it)", () => {
  const r = store({ props: [prop], docs: [doc("1", "sale_deed"), doc("2", "khata"), doc("3", "tax", { year: "2025-26" }), doc("4", "rtc", { na: true }), doc("5", "mutation", { na: true })] });
  const rows = checklist(r, { c: "props", id: "p1" }, T);
  assert.equal(rows.length, 12);
  assert.equal(rows.some((x) => x.type.k === "tax"), false);
  assert.deepEqual(keyScore(rows), { have: 2, of: 10 });   // sale deed, khata; 2 not needed
});

test("needs attention: expiring papers, and this year's tax from April; a renewed one hides the old", () => {
  const r = store({
    props: [prop],
    docOwners: [{ id: "kp", group: "people", name: "KP" }],
    docs: [doc("t", "tax", { year: "2026-27" }), { id: "pp", owner: { c: "docOwners", id: "kp" }, type: "passport", validTo: "2027-03-01", added: T }, { id: "dl", owner: { c: "docOwners", id: "kp" }, type: "dl", validTo: "2026-12-01", added: T }, { id: "dl2", owner: { c: "docOwners", id: "kp" }, type: "dl", validTo: "2046-12-01", added: T }],
  });
  const a = attention(r, T);
  assert.deepEqual(a.map((x) => x.title), ["Passport · KP"]);   // licence renewed; tax for 2026-27 is there
  // the tax receipt only shows as missing, and is only reminded, where its April reminder is switched on
  assert.deepEqual(attention(store({ props: [prop], docs: [] }), T).map((x) => x.title), []);
  assert.deepEqual(docNotes(store({ props: [prop], docs: [] }), new Date(2027, 2, 20, 8)), []);
  const on = { docPrefs: [{ id: "props:p1", taxRemind: true }] };
  const r2 = store({ props: [prop], docs: [], ...on });
  assert.deepEqual(attention(r2, T).map((x) => x.title), ["Property tax 2026–27 · Lakeview flat"]);
  const notes = docNotes(store({ props: [prop], docs: [], ...on }), new Date(2027, 2, 20, 8));
  assert.deepEqual(notes.map((n) => [n.title, n.at.getDate()]), [["Property tax 2027–28 for Lakeview flat: receipt not added", 10], ["Property tax 2027–28 for Lakeview flat: receipt not added", 25]]);
});

test("search finds by type, owner, year, note and file name", () => {
  const r = store({ props: [prop], docOwners: [{ id: "kp", group: "people", name: "KP" }], docs: [doc("1", "khata"), doc("2", "tax", { year: "2025-26", note: "paid online" }), { id: "3", owner: { c: "docOwners", id: "kp" }, type: "passport", added: T }] });
  const f = (id: string) => (id === "3" ? ["passport-scan.pdf"] : []);
  assert.deepEqual(search(r, "khata", f).map((h) => h.doc.id), ["1"]);
  assert.deepEqual(search(r, "lakeview 2025", f).map((h) => h.doc.id), ["2"]);
  assert.deepEqual(search(r, "online", f).map((h) => h.doc.id), ["2"]);
  assert.deepEqual(search(r, "scan", f).map((h) => h.doc.id), ["3"]);
});
