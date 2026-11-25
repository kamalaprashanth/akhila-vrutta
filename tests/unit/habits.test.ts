import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, best, dayShare, doneToday, dueOn, goalState, habitNotes, heat, last30, leftOn, logsOf, streak, todayCount, weekScore, weekStart, type Habit, type Reader } from "../../app/modules/habits/data.ts";
import type { Rec } from "../../app/core/store.ts";

const store = (d: Record<string, Rec[]>): Reader => ({
  all: <T extends Rec>(c: string) => (d[c] ?? []) as T[],
  get: <T extends Rec>(c: string, id: string) => (d[c] ?? []).find((r) => r.id === id) as T | undefined,
});
const T = "2026-11-25"; // a Wednesday
const log = (h: string, days: string[], v = 1): Rec[] => days.map((d) => ({ id: `${h}_${d}`, h, d, v }));
const back = (n: number): string => addDays(T, -n);

test("weeks start on Monday", () => {
  assert.equal(weekStart(T), "2026-11-23");
  assert.equal(weekStart("2026-11-29"), "2026-11-23");
  assert.equal(weekStart("2026-11-30"), "2026-11-30");
});

test("a daily habit: the streak runs back over done days; today not ticked yet doesn't break it", () => {
  const h: Habit = { id: "w", name: "Walk", kind: "check", start: back(40) };
  const L = logsOf(store({ habitLog: log("w", [back(1), back(2), back(3), back(5), back(6)]) }));
  assert.equal(streak(L, h, T), 3);
  assert.equal(best(L, h, T), 3);
  const L2 = logsOf(store({ habitLog: log("w", [T, back(1), back(2), back(3), back(5), back(6)]) }));
  assert.equal(streak(L2, h, T), 4);
});

test("chosen weekdays: other days are skipped, not missed", () => {
  const h: Habit = { id: "g", name: "Gym", kind: "check", start: back(30), days: [0, 2, 4] }; // Mon Wed Fri
  const L = logsOf(store({ habitLog: log("g", ["2026-11-23", "2026-11-20", "2026-11-18", "2026-11-16"]) }));
  assert.equal(dueOn(h, "2026-11-24"), false);
  assert.equal(streak(L, h, T), 4);          // Wed today not done yet; Mon, Fri, Wed, Mon done
});

test("amounts: done when the target is reached", () => {
  const h: Habit = { id: "a", name: "Water", kind: "amount", target: 8, unit: "glasses", start: back(10) };
  const L = logsOf(store({ habitLog: [...log("a", [back(1)], 8), ...log("a", [back(2)], 5), ...log("a", [T], 9)] }));
  assert.equal(streak(L, h, T), 2);
  assert.equal(doneToday(L, h, T), true);
});

test("times a week: weeks in a row meeting the target; today counts once the week is met", () => {
  const h: Habit = { id: "y", name: "Yoga", kind: "weekly", target: 3, start: "2026-11-02" };
  const L = logsOf(store({ habitLog: log("y", ["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-09", "2026-11-11", "2026-11-13", "2026-11-17", "2026-11-23", "2026-11-24", "2026-11-25"]) }));
  assert.equal(streak(L, h, T), 1);          // this week met; last week only 1
  assert.equal(best(L, h, T), 2);
  assert.equal(doneToday(L, h, T), true);
});

test("avoid: clean days count up from the last slip", () => {
  const h: Habit = { id: "s", name: "No sugar", kind: "avoid", start: back(30) };
  assert.equal(streak(logsOf(store({ habitLog: log("s", [back(18)]) })), h, T), 18);
  assert.equal(streak(logsOf(store({ habitLog: log("s", [T]) })), h, T), 0);
  assert.equal(streak(logsOf(store({})), h, T), 31);
});

test("a set number of days: missed days move the finish on", () => {
  const h: Habit = { id: "n", name: "Surya namaskara", kind: "check", start: back(9), goal: 40 };
  // 10 days so far (9 back to today); 2 missed, today not done yet
  const done = [9, 8, 7, 5, 4, 3, 2, 1].map(back);
  let g = goalState(logsOf(store({ habitLog: log("n", done) })), h, T);
  assert.deepEqual([g.done, g.left, g.day, g.ends, g.complete], [8, 32, 9, addDays(T, 31), false]);
  g = goalState(logsOf(store({ habitLog: log("n", [...done, T]) })), h, T);
  assert.deepEqual([g.done, g.left, g.day, g.ends], [9, 31, 9, addDays(T, 31)]);   // ticking today doesn't move the finish
  const all = Array.from({ length: 40 }, (_, i) => addDays(T, i - 39));
  g = goalState(logsOf(store({ habitLog: log("n", all) })), { ...h, start: addDays(T, -39) }, T);
  assert.equal(g.complete, true);
  assert.equal(dueOn({ ...h, days: [0] }, "2026-11-24"), true);   // every day, whatever days were set
});

test("the week's score: done ÷ asked for, today left out until it's done; weekly habits spread over the days gone", () => {
  const w: Habit = { id: "w", name: "Walk", kind: "check", start: back(30) };
  const y: Habit = { id: "y", name: "Yoga", kind: "weekly", target: 3, start: back(30) };
  const L = logsOf(store({ habitLog: [...log("w", ["2026-11-23"]), ...log("y", ["2026-11-23"])] }));
  // Walk: Mon done, Tue missed (1 of 2; today not counted). Yoga: 3 × 3/7 days → asked 2, done 1.
  assert.equal(weekScore([w, y], L, T, T), Math.round((2 / 4) * 100));
  assert.deepEqual(todayCount([w, y], L, T), { done: 0, due: 2 });
  assert.equal(dayShare([w, y], L, "2026-11-23", T), 1);
  assert.equal(dayShare([w, y], L, "2026-11-26", T), null);
});

test("the evening nudge: how many are left, never which; nothing when all is done or it's off", () => {
  const w: Rec = { id: "w", name: "Walk", kind: "check", start: back(5) };
  const s: Rec = { id: "s", name: "No sugar", kind: "avoid", start: back(5) };
  const now = new Date(2026, 10, 25, 18, 0);
  let notes = habitNotes(store({ habits: [w, s] }), now);
  assert.equal(notes.length, 7);
  assert.equal(notes[0]!.title, "1 habit left for today");
  assert.equal(notes[0]!.at.getHours(), 21);
  assert.ok(notes.every((n) => !/Walk|sugar/.test(n.title)));
  notes = habitNotes(store({ habits: [w, s], habitLog: log("w", ["2026-11-25"]) }), now);
  assert.equal(notes[0]!.at.getDate(), 26);   // today done: no nudge today
  assert.equal(habitNotes(store({ habits: [w], habitPrefs: [{ id: "prefs", nudge: "" }] }), now).length, 0);
  assert.equal(habitNotes(store({ habits: [w], habitPrefs: [{ id: "prefs", nudge: "20:30" }] }), now)[0]!.at.getMinutes(), 30);
});

test("weekly habits nudge only when the rest of the week needs every day", () => {
  const y: Habit = { id: "y", name: "Yoga", kind: "weekly", target: 3, start: back(30) };
  const none = logsOf(store({}));
  assert.equal(leftOn([y], none, "2026-11-27", T), 1);   // Fri: 3 still needed, 3 days left
  assert.equal(leftOn([y], none, T, T), 0);              // Wed: 5 days left for 3
});

test("the 6-month calendar and the last 30 days", () => {
  const h: Habit = { id: "w", name: "Walk", kind: "check", start: back(10) };
  const L = logsOf(store({ habitLog: log("w", [back(1), back(2)]) }));
  const cells = heat(L, h, T, 26);
  assert.equal(cells.length, 182);
  assert.equal(cells.find((c) => c.d === back(1))?.c, "done");
  assert.equal(cells.find((c) => c.d === back(3))?.c, "missed");
  assert.equal(cells.find((c) => c.d === back(20))?.c, "off");
  assert.equal(cells.find((c) => c.d === addDays(T, 1))?.c, "future");
  assert.equal(last30(L, h, T), Math.round((2 / 10) * 100));
});
