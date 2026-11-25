/**
 * Habits, kept in the encrypted store like everything else.
 *   habits      what to do (or avoid): kind, target, which days, from when; a set number of days (goal)
 *   habitLog    one record per habit per day it has something: id <habit>_<day>, v = done (1), the amount,
 *               or for "avoid" habits a slip (1). No record: not done (or, for "avoid", a clean day).
 *   habitPrefs  the evening nudge's time ("" = off)
 * Days are local "YYYY-MM-DD"; weeks run Monday to Sunday.
 */
import type { Rec } from "../../core/store.ts";

export type Day = string;
export type Kind = "check" | "amount" | "weekly" | "avoid";
export interface Habit extends Rec {
  name: string; icon?: string; kind: Kind;
  /** amount: per day; weekly: times a week */
  target?: number; unit?: string;
  /** check and amount: which weekdays (0 = Monday); none = every day */
  days?: number[];
  start: Day;
  /** a set number of done days (missed days move the finish on); completed when reached */
  goal?: number; completed?: Day;
  stopped?: Day; order?: number; deleted?: boolean;
}
export interface Log extends Rec { h: string; d: Day; v: number; deleted?: boolean }
export interface Prefs extends Rec { nudge: string }
export const HABITS = "habits", LOG = "habitLog", PREFS = "habitPrefs";
export const logId = (h: string, d: Day): string => `${h}_${d}`;
export const DEFAULT_NUDGE = "21:00";

export interface Reader { all<T extends Rec = Rec>(c: string): T[]; get<T extends Rec = Rec>(c: string, id: string): T | undefined }
const live = <T extends Rec>(r: Reader, c: string): T[] => r.all<T>(c).filter((x) => !(x as { deleted?: boolean }).deleted);

/* ---------- days ---------- */
const pad = (n: number): string => String(n).padStart(2, "0");
export const dayOf = (d: Date): Day => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (d: Day): Date => new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const addDays = (d: Day, n: number): Day => { const x = parseDay(d); x.setDate(x.getDate() + n); return dayOf(x); };
export const daysBetween = (a: Day, b: Day): number => Math.round((+parseDay(b) - +parseDay(a)) / 864e5);
/** 0 = Monday … 6 = Sunday */
export const dow = (d: Day): number => (parseDay(d).getDay() + 6) % 7;
export const weekStart = (d: Day): Day => addDays(d, -dow(d));
const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const dayLabel = (d: Day, today: Day): string => `${+d.slice(8, 10)} ${MN[+d.slice(5, 7) - 1]}${d.slice(0, 4) === today.slice(0, 4) ? "" : ` ${d.slice(0, 4)}`}`;
export const monthName = (d: Day): string => MN[+d.slice(5, 7) - 1]!;

/* ---------- the store, read ---------- */
export const habitsOf = (r: Reader): Habit[] => live<Habit>(r, HABITS).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
/** Is it going on: started, not stopped, not a finished set of days. */
export const active = (h: Habit, d: Day): boolean => d >= h.start && (!h.stopped || d < h.stopped) && (!h.completed || d <= h.completed);
export type Logs = Map<string, Map<Day, number>>;
export function logsOf(r: Reader): Logs {
  const m: Logs = new Map();
  for (const l of live<Log>(r, LOG)) { if (!m.has(l.h)) m.set(l.h, new Map()); m.get(l.h)!.set(l.d, l.v); }
  return m;
}
export const valueOn = (L: Logs, h: Habit, d: Day): number => L.get(h.id)?.get(d) ?? 0;
export const nudgeTime = (r: Reader): string => r.get<Prefs>(PREFS, "prefs")?.nudge ?? DEFAULT_NUDGE;

/** Is the habit asked for on this day (weekly and avoid habits: every day it's going on). */
export const dueOn = (h: Habit, d: Day): boolean => active(h, d) && (!!h.goal || h.kind === "weekly" || h.kind === "avoid" || !h.days?.length || h.days.includes(dow(d)));
/** Done that day (for avoid: a clean day, no slip). */
export function doneOn(L: Logs, h: Habit, d: Day): boolean {
  const v = valueOn(L, h, d);
  if (h.kind === "avoid") return v < 1;
  if (h.kind === "amount") return v >= (h.target ?? 1);
  return v >= 1;
}
/** Times done in the week of `d`, up to `upto`. */
export function weekCount(L: Logs, h: Habit, d: Day, upto: Day): number {
  let n = 0;
  for (let x = weekStart(d), i = 0; i < 7 && x <= upto; i++, x = addDays(x, 1)) if (active(h, x) && valueOn(L, h, x) >= 1) n++;
  return n;
}

/* ---------- streaks ---------- */
/** Days in a row (weeks in a row for weekly habits). Today not done yet doesn't break it. */
export function streak(L: Logs, h: Habit, today: Day): number {
  if (h.kind === "weekly") {
    const tgt = h.target ?? 1;
    let n = weekCount(L, h, today, today) >= tgt ? 1 : 0;
    for (let w = addDays(weekStart(today), -7); w >= weekStart(h.start); w = addDays(w, -7)) { if (weekCount(L, h, w, addDays(w, 6)) >= tgt) n++; else break; }
    return n;
  }
  const end = h.completed && h.completed < today ? h.completed : today;
  let n = 0;
  for (let d = end; d >= h.start; d = addDays(d, -1)) {
    if (!dueOn(h, d)) continue;
    if (doneOn(L, h, d)) n++;
    else if (d === today && h.kind !== "avoid") continue;
    else break;
  }
  return n;
}
/** The longest run there has been. */
export function best(L: Logs, h: Habit, today: Day): number {
  let b = 0, n = 0;
  if (h.kind === "weekly") {
    const tgt = h.target ?? 1;
    for (let w = weekStart(h.start); w <= today; w = addDays(w, 7)) { if (weekCount(L, h, w, today) >= tgt) b = Math.max(b, ++n); else if (w !== weekStart(today)) n = 0; }
    return b;
  }
  for (let d = h.start; d <= today; d = addDays(d, 1)) {
    if (!dueOn(h, d)) continue;
    if (doneOn(L, h, d)) b = Math.max(b, ++n);
    else if (!(d === today && h.kind !== "avoid")) n = 0;
  }
  return b;
}

/* ---------- a set number of days ---------- */
export interface GoalState { done: number; left: number; day: number; ends: Day; todayDone: boolean; complete: boolean }
/** Counted in done days: a missed day moves the finish on by a day. */
export function goalState(L: Logs, h: Habit, today: Day): GoalState {
  const goal = h.goal ?? 0, end = h.completed ?? today;
  let done = 0;
  for (let d = h.start; d <= end; d = addDays(d, 1)) if (doneOn(L, h, d)) done++;
  const todayDone = doneOn(L, h, today) && active(h, today), left = Math.max(0, goal - done);
  return { done, left, day: Math.min(goal, done + (todayDone || !left ? 0 : 1)), ends: left ? addDays(today, todayDone ? left : left - 1) : end, todayDone, complete: done >= goal };
}

/* ---------- today and the week's score ---------- */
/** Counts as done today: ticked, the amount reached, no slip, or a weekly habit's week already met. */
export function doneToday(L: Logs, h: Habit, today: Day): boolean {
  if (h.kind === "weekly") return valueOn(L, h, today) >= 1 || weekCount(L, h, today, today) >= (h.target ?? 1);
  return doneOn(L, h, today);
}
export function todayCount(habits: Habit[], L: Logs, today: Day): { done: number; due: number } {
  const due = habits.filter((h) => dueOn(h, today));
  return { done: due.filter((h) => doneToday(L, h, today)).length, due: due.length };
}
/**
 * The week's score: done ÷ asked for, Monday to Sunday (up to today for this week). A weekly habit is asked
 * for its target spread over the days gone (so midweek isn't counted against it), and extra times don't
 * push past 100%.
 */
export function weekScore(habits: Habit[], L: Logs, anyDay: Day, today: Day): number | null {
  const ws = weekStart(anyDay), upto = addDays(ws, 6) < today ? addDays(ws, 6) : today;
  if (upto < ws) return null;
  let done = 0, due = 0;
  for (const h of habits) {
    if (h.kind === "weekly") {
      const days = Array.from({ length: daysBetween(ws, upto) + 1 }, (_, i) => addDays(ws, i)).filter((d) => active(h, d)).length;
      if (!days) continue;
      const ask = Math.min(h.target ?? 1, Math.ceil(((h.target ?? 1) * days) / 7));
      due += ask; done += Math.min(ask, weekCount(L, h, ws, upto));
      continue;
    }
    for (let d = ws; d <= upto; d = addDays(d, 1)) {
      if (!dueOn(h, d)) continue;
      if (d === today && !doneOn(L, h, d)) continue;   // today isn't over yet
      due++; if (doneOn(L, h, d)) done++;
    }
  }
  return due ? Math.round((done / due) * 100) : null;
}
/** How much of a day was done (0..1), for the week strip; null when nothing was asked. */
export function dayShare(habits: Habit[], L: Logs, d: Day, today: Day): number | null {
  if (d > today) return null;
  const due = habits.filter((h) => dueOn(h, d) && h.kind !== "weekly");
  const wk = habits.filter((h) => h.kind === "weekly" && active(h, d) && valueOn(L, h, d) >= 1);
  if (!due.length && !wk.length) return null;
  return (due.filter((h) => doneOn(L, h, d)).length + wk.length) / (due.length + wk.length);
}

/* ---------- the habit's page ---------- */
export type Cell = "done" | "missed" | "off" | "future";
/** Day by day for a habit, oldest first, whole weeks (Monday first), the last `weeks` weeks. */
export function heat(L: Logs, h: Habit, today: Day, weeks = 26): { d: Day; c: Cell }[] {
  const from = addDays(weekStart(today), -7 * (weeks - 1)), out: { d: Day; c: Cell }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(from, i);
    const c: Cell = d > today ? "future" : h.kind === "weekly" ? (!active(h, d) ? "off" : valueOn(L, h, d) >= 1 ? "done" : "off") : !dueOn(h, d) ? "off" : doneOn(L, h, d) ? "done" : d === today ? "off" : "missed";
    out.push({ d, c });
  }
  return out;
}
/** Share of days done over the last 30 (weekly: times done against the target). */
export function last30(L: Logs, h: Habit, today: Day): number | null {
  if (h.kind === "weekly") {
    let n = 0, days = 0;
    for (let i = 0; i < 30; i++) { const d = addDays(today, -i); if (active(h, d)) { days++; if (valueOn(L, h, d) >= 1) n++; } }
    return days ? Math.min(100, Math.round((n / ((h.target ?? 1) * days / 7)) * 100)) : null;
  }
  let n = 0, due = 0;
  for (let i = 0; i < 30; i++) { const d = addDays(today, -i); if (!dueOn(h, d) || (d === today && !doneOn(L, h, d))) continue; due++; if (doneOn(L, h, d)) n++; }
  return due ? Math.round((n / due) * 100) : null;
}

/* ---------- the evening nudge ---------- */
/** What's left on a day (avoid habits need nothing; weekly ones only when the rest of the week needs them). */
export function leftOn(habits: Habit[], L: Logs, d: Day, today: Day): number {
  return habits.filter((h) => {
    if (!dueOn(h, d) || h.kind === "avoid") return false;
    if (h.kind === "weekly") {
      const have = weekCount(L, h, d, today);
      if (valueOn(L, h, d) >= 1) return false;
      return (h.target ?? 1) - have >= daysBetween(d, addDays(weekStart(d), 6)) + 1;
    }
    return d !== today || !doneOn(L, h, d);
  }).length;
}
/** Nudges for the next 7 evenings, counting what's left (names none). */
export function habitNotes(r: Reader, now: Date): { title: string; at: Date }[] {
  const time = nudgeTime(r);
  if (!/^\d\d:\d\d$/.test(time)) return [];
  const habits = habitsOf(r), L = logsOf(r), today = dayOf(now), out: { title: string; at: Date }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i), at = parseDay(d);
    at.setHours(+time.slice(0, 2), +time.slice(3, 5), 0, 0);
    if (at <= now) continue;
    const n = leftOn(habits, L, d, today);
    if (n) out.push({ title: `${n} habit${n === 1 ? "" : "s"} left for today`, at });
  }
  return out;
}

/* ---------- labels ---------- */
export const daysLabel = (h: Habit): string => {
  if (h.goal) return `${h.goal} days`;
  if (h.kind === "weekly") return `${h.target ?? 1}× a week`;
  if (!h.days?.length || h.days.length === 7) return "every day";
  if (h.days.length === 5 && h.days.every((x) => x < 5)) return "weekdays";
  if (h.days.length === 2 && h.days.includes(5) && h.days.includes(6)) return "weekends";
  return [...h.days].sort().map((x) => DN[x]).join(", ");
};

export const ICONS = ["🚶", "🏃", "💧", "🧘", "📖", "🙏", "🏋️", "😴", "💊", "🥗", "🍬", "🚭", "📵", "✍️", "🎵", "🌅"];
export const STARTERS: Pick<Habit, "name" | "icon" | "kind" | "target" | "unit">[] = [
  { name: "Walk 30 min", icon: "🚶", kind: "check" },
  { name: "Water", icon: "💧", kind: "amount", target: 8, unit: "glasses" },
  { name: "Yoga", icon: "🧘", kind: "weekly", target: 3 },
  { name: "Read 20 pages", icon: "📖", kind: "check" },
  { name: "Sleep by 11", icon: "😴", kind: "check" },
  { name: "No sugar", icon: "🍬", kind: "avoid" },
];
