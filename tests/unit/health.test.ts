import { test } from "node:test";
import assert from "node:assert/strict";
import { change30, flag, healthNotes, kindOf, parseLabJson, previous, rangeText, runningLow, schedule, sortValues, sparkPoints, type Lab } from "../../app/modules/health/data.ts";
import type { Rec } from "../../app/core/store.ts";

const store = (d: Record<string, Rec[]>) => ({ all: <T extends Rec>(c: string) => (d[c] ?? []) as T[], get: <T extends Rec>(c: string, id: string) => (d[c] ?? []).find((r) => r.id === id) as T | undefined });

test("readings are judged against the usual adult ranges", () => {
  assert.deepEqual(kindOf("bp").status(134, 86), ["warn", "a little high"]);
  assert.deepEqual(kindOf("bp").status(118, 76), ["ok", "normal"]);
  assert.deepEqual(kindOf("bp").status(150, 95), ["high", "high"]);
  assert.deepEqual(kindOf("sugar_f").status(96), ["ok", "normal"]);
  assert.deepEqual(kindOf("sugar_f").status(110), ["warn", "a little high"]);
  assert.deepEqual(kindOf("sugar_f").status(130), ["high", "high"]);
  assert.deepEqual(kindOf("weight").status(78.4, undefined, 175), ["warn", "BMI 25.6, a little high"]);
  assert.deepEqual(kindOf("weight").status(78.4), ["", ""], "no height, no BMI");
  assert.deepEqual(kindOf("temp").status(101), ["high", "fever"]);
});

test("weight change over about 30 days", () => {
  const r = (date: string, v: number) => ({ id: date, person: "p", kind: "weight", v, date });
  assert.equal(change30([r("2026-10-25", 80), r("2026-11-01", 79.5), r("2026-11-25", 78.4)]), -1.6);
  assert.equal(change30([r("2026-11-20", 80), r("2026-11-25", 79)]), null);
});

test("lab values from Claude's answer: JSON in or out of a code fence, numbers checked, private details absent", () => {
  const got = parseLabJson('Here you go:\n```json\n{"date":"2026-11-12","lab":"Sample Diagnostics","values":[{"group":"Lipid profile","name":"LDL Cholesterol","value":"142","unit":"mg/dL","low":null,"high":100},{"name":"Blood group","value":"B+","unit":null,"low":null,"high":null},{"name":"","value":1}]}\n```');
  assert.equal(got.date, "2026-11-12");
  assert.deepEqual(got.values[0], { group: "Lipid profile", name: "LDL Cholesterol", value: 142, unit: "mg/dL", low: null, high: 100 });
  assert.equal(got.values[1]!.value, "B+");
  assert.equal(got.values.length, 2);
  assert.throws(() => parseLabJson("Sorry, I can't"), /didn't return/);
});

test("flags, ranges and the last report's value", () => {
  assert.equal(flag({ name: "LDL", value: 142, high: 100 }), "high");
  assert.equal(flag({ name: "Vit D", value: 22, low: 30, high: 100 }), "low");
  assert.equal(flag({ name: "HbA1c", value: 5.6, high: 5.7 }), "ok");
  assert.equal(flag({ name: "Group", value: "B+" }), "");
  assert.equal(rangeText({ name: "x", value: 1, low: 30, high: 100 }), "normal 30–100");
  assert.equal(rangeText({ name: "x", value: 1, high: 100 }), "normal below 100");
  assert.deepEqual(sortValues([{ name: "a", value: 1, high: 5 }, { name: "b", value: 9, high: 5 }, { name: "c", value: 1, low: 2 }]).map((v) => v.name), ["b", "c", "a"]);
  const may: Lab = { id: "m", person: "p", date: "2026-05-10", values: [{ name: "LDL cholesterol", value: 156 }] };
  const nov: Lab = { id: "n", person: "p", date: "2026-11-12", values: [{ name: "LDL Cholesterol (direct)", value: 142 }] };
  const r = store({ hlLabs: [may, nov] });
  assert.equal(previous(r, nov, "LDL Cholesterol (direct)")?.v.value, 156);
  assert.equal(previous(r, may, "LDL cholesterol"), null);
});

test("medicines: schedule, running low, and reminders that name no medicine", () => {
  const m = { id: "m1", person: "p", name: "Vitamin D3 60K", times: ["09:00"], days: [6], stock: 1, start: "2026-11-01" };
  assert.equal(schedule(m), "weekly · Sun · 9 AM");
  assert.equal(runningLow(m), true);
  assert.equal(runningLow({ ...m, stock: 5 }), false);
  const r = store({ docOwners: [{ id: "p", group: "people", name: "KP", rel: "me" }], hlMeds: [m, { id: "m2", person: "p", name: "Multivitamin", times: ["09:00"], start: "2026-11-01" }], hlCheckups: [{ id: "c", person: "p", name: "Dentist", every: 6, due: "2026-11-30" }] });
  const notes = healthNotes(r, new Date(2026, 10, 26, 8));
  assert.ok(notes.some((n) => n.title === "A medicine due now (KP)" && n.at.getDate() === 26));
  assert.ok(notes.some((n) => n.title === "2 medicines due now (KP)" && n.at.getDate() === 29));   // Sunday
  assert.ok(notes.some((n) => n.title === "A check-up is due today (KP)"));
  assert.ok(notes.every((n) => !/Vitamin|Multivitamin|Dentist/.test(n.title)));
});

test("the little charts", () => {
  assert.equal(sparkPoints([1]), "");
  assert.equal(sparkPoints([1, 2, 3]), "0.0,26.0 50.0,14.0 100.0,2.0");
});
