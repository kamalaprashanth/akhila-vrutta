/**
 * Household data, kept in the encrypted store like everything else.
 *   hhHomes       homes that aren't Money properties (where you live, a rented flat)
 *   hhJobs        maintenance that repeats: every N months, last done, next due
 *   hhDone        what was done when (a job or an appliance's service), with its cost in paise
 *   hhAppliances  appliances in a home: model, bought, price (paise), warranty and AMC end, files
 *   hhItems       the To do and Groceries lists
 * Homes are Money's properties plus hhHomes; a record's `home` is either id.
 */
import type { Rec } from "../../core/store.ts";

export type Day = string;
export type Paise = number;

export interface Home { id: string; name: string; fromMoney: boolean; kind?: string }
export interface Job extends Rec { home: string; name: string; every: number; last?: Day; due: Day; note?: string; applianceId?: string; deleted?: boolean; updatedAt?: number }
export interface Done extends Rec { home: string; date: Day; jobId?: string; applianceId?: string; what: string; cost?: Paise; note?: string; txnId?: string; deleted?: boolean }
export interface Appliance extends Rec { home: string; name: string; model?: string; bought?: Day; price?: Paise; warrantyTo?: Day; amcTo?: Day; service?: string; note?: string; files?: string[]; deleted?: boolean }
export interface Item extends Rec { list: "todo" | "grocery"; text: string; home?: string; due?: Day; doneOn?: Day; added: Day; deleted?: boolean }

/** What a reader of the store gives this module. */
export interface Reader { all<T extends Rec = Rec>(c: string): T[]; get<T extends Rec = Rec>(c: string, id: string): T | undefined }

export const live = <T extends Rec>(r: Reader, c: string): T[] => r.all<T>(c).filter((x) => !(x as { deleted?: boolean }).deleted);

/** Money's properties first, then the homes added here. */
export function homes(r: Reader): Home[] {
  const props = live<Rec & { name?: string; kind?: string }>(r, "props").map((p) => ({ id: p.id, name: String(p.name || "Property"), fromMoney: true, kind: p.kind }));
  const own = live<Rec & { name?: string }>(r, "hhHomes").map((h) => ({ id: h.id, name: String(h.name || "Home"), fromMoney: false }));
  return [...own, ...props];
}
export const homeName = (r: Reader, id?: string): string => (id ? homes(r).find((h) => h.id === id)?.name ?? "" : "");

/* ---------- dates ---------- */
const pad = (n: number): string => String(n).padStart(2, "0");
export const dayOf = (d: Date): Day => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (d: Day): Date => new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
/** A day plus whole months, on the same day of the month (or the month's last day). */
export function addMonths(d: Day, n: number): Day {
  let y = +d.slice(0, 4), m = +d.slice(5, 7) + n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad(m)}-${pad(Math.min(+d.slice(8, 10), last))}`;
}
export const daysBetween = (a: Day, b: Day): number => Math.round((+parseDay(b) - +parseDay(a)) / 864e5);
const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "14 Dec", or "14 Dec 2027" when it isn't this year. */
export const dayLabel = (d: Day, today: Day): string => `${+d.slice(8, 10)} ${MN[+d.slice(5, 7) - 1]}${d.slice(0, 4) === today.slice(0, 4) ? "" : ` ${d.slice(0, 4)}`}`;
export const everyLabel = (n: number): string => (n === 12 ? "every year" : n === 1 ? "every month" : n % 12 === 0 ? `every ${n / 12} years` : `every ${n} months`);

/* ---------- what's due ---------- */
export interface DueRow { kind: "job" | "warranty" | "amc" | "todo"; id: string; home?: string; title: string; sub: string; date: Day; late: number }

/** Jobs, warranties and AMCs ending within 60 days, and dated to-dos, soonest first. */
export function dueRows(r: Reader, today: Day, home?: string): DueRow[] {
  const inHome = (h?: string): boolean => !home || h === home;
  const out: DueRow[] = [];
  for (const j of live<Job>(r, "hhJobs")) if (inHome(j.home)) out.push({ kind: "job", id: j.id, home: j.home, title: j.name, sub: [homeName(r, j.home), everyLabel(j.every), j.last ? `last ${dayLabel(j.last, today)}` : ""].filter(Boolean).join(" · "), date: j.due, late: daysBetween(j.due, today) });
  for (const a of live<Appliance>(r, "hhAppliances")) {
    if (!inHome(a.home)) continue;
    for (const [k, d, w] of [["warranty", a.warrantyTo, "warranty"], ["amc", a.amcTo, "AMC"]] as const) {
      if (!d || daysBetween(today, d) > 60 || daysBetween(today, d) < -30) continue;
      out.push({ kind: k, id: a.id, home: a.home, title: `${a.name} ${w} ${d < today ? "ended" : "ends"}`, sub: [homeName(r, a.home), a.model, d < today ? "renew it?" : "extend it?"].filter(Boolean).join(" · "), date: d, late: daysBetween(d, today) });
    }
  }
  for (const i of live<Item>(r, "hhItems")) if (i.list === "todo" && i.due && !i.doneOn && inHome(i.home)) out.push({ kind: "todo", id: i.id, home: i.home, title: i.text, sub: [homeName(r, i.home), "to do"].filter(Boolean).join(" · "), date: i.due, late: daysBetween(i.due, today) });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
export function dueGroups(rows: DueRow[], today: Day): [string, DueRow[]][] {
  const month = today.slice(0, 7);
  const g: [string, DueRow[]][] = [["Overdue", rows.filter((x) => x.date < today)], ["This month", rows.filter((x) => x.date >= today && x.date.slice(0, 7) === month)], ["Coming up", rows.filter((x) => x.date.slice(0, 7) > month)]];
  return g.filter(([, l]) => l.length);
}
export function dueChip(x: DueRow, today: Day): [string, string] {
  if (x.date < today) return [x.late === 1 ? "1 day late" : `${x.late} days late`, "bad"];
  const n = daysBetween(today, x.date);
  if (n === 0) return ["today", "warn"];
  if (n === 1) return ["tomorrow", "warn"];
  if (n <= 7) return [`in ${n} days`, "warn"];
  return [dayLabel(x.date, today), x.kind === "warranty" || x.kind === "amc" ? "warn" : ""];
}

/** Marking a job done on `date`: the next due date counts from that day. */
export const nextDue = (date: Day, every: number): Day => addMonths(date, every);

/* ---------- starter jobs ---------- */
export const STARTERS: { name: string; every: number }[] = [
  { name: "AC service", every: 6 },
  { name: "RO filter change", every: 4 },
  { name: "Pest control", every: 3 },
  { name: "Water tank cleaning", every: 6 },
  { name: "Chimney deep clean", every: 6 },
  { name: "Fire extinguisher refill", every: 12 },
];

/* ---------- phone reminders ---------- */
export interface PhoneNote { title: string; at: Date }
const nine = (d: Day, back = 0): Date => { const x = parseDay(d); x.setHours(9, 0, 0, 0); x.setDate(x.getDate() - back); return x; };
/** Jobs and dated to-dos: the day before and on the day. Warranty and AMC: 30 days before. Names only. */
export function householdNotes(r: Reader, now: Date, days = 45): PhoneNote[] {
  const end = new Date(now.getTime() + days * 864e5), out: PhoneNote[] = [];
  const add = (title: string, at: Date): void => { if (at > now && at <= end) out.push({ title, at }); };
  for (const j of live<Job>(r, "hhJobs")) { add(`${j.name} due tomorrow`, nine(j.due, 1)); add(`${j.name} due today`, nine(j.due)); }
  for (const i of live<Item>(r, "hhItems")) if (i.list === "todo" && i.due && !i.doneOn) { add(`To do tomorrow: ${i.text}`, nine(i.due, 1)); add(`To do today: ${i.text}`, nine(i.due)); }
  for (const a of live<Appliance>(r, "hhAppliances")) {
    if (a.warrantyTo) add(`${a.name} warranty ends in 30 days`, nine(a.warrantyTo, 30));
    if (a.amcTo) add(`${a.name} AMC ends in 30 days`, nine(a.amcTo, 30));
  }
  return out.sort((a, b) => +a.at - +b.at);
}
