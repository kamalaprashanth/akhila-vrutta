/**
 * Health, for each person in People (Documents' list of family members), in the encrypted store:
 *   hlProfiles  per person: height (cm), for BMI
 *   hlReadings  weight, blood pressure, sugar, heart rate, SpO2, temperature, waist: { person, kind, v, v2?, date }
 *   hlLabs      a lab report: { person, date, lab?, values: [{ group?, name, value, unit?, low?, high? }] }; its PDF
 *               or photos are vault files owned by it
 *   hlMeds      a medicine or supplement: { person, name, dose?, times ["08:00"], days? (0 = Monday; none = daily),
 *               stock?, start, stopped? }
 *   hlMedLog    a dose taken: id <med>_<day>_<time>
 *   hlVisits    a doctor visit: { person, date, doctor, reason?, notes?, cost?, txnId? }; prescriptions as files
 *   hlCheckups  a repeating check-up: { person, name, every (months), last?, due }
 * Not medical advice: ranges are the usual adult ones, shown as a guide.
 */
import type { Rec } from "../../core/store.ts";

export type Day = string;
export interface Reader { all<T extends Rec = Rec>(c: string): T[]; get<T extends Rec = Rec>(c: string, id: string): T | undefined }
const live = <T extends Rec>(r: Reader, c: string): T[] => r.all<T>(c).filter((x) => !(x as { deleted?: boolean }).deleted);

export interface Person extends Rec { name: string; rel?: string; group: string; deleted?: boolean }
export interface Profile extends Rec { height?: number }
export interface Reading extends Rec { person: string; kind: string; v: number; v2?: number; date: Day; note?: string; deleted?: boolean }
export interface LabValue { group?: string; name: string; value: number | string; unit?: string; low?: number | null; high?: number | null }
export interface Lab extends Rec { person: string; date: Day; lab?: string; values: LabValue[]; note?: string; deleted?: boolean }
export interface Med extends Rec { person: string; name: string; dose?: string; times: string[]; days?: number[]; stock?: number; start: Day; stopped?: Day; note?: string; deleted?: boolean }
export interface MedLog extends Rec { med: string; day: Day; time: string; deleted?: boolean }
export interface Visit extends Rec { person: string; date: Day; doctor: string; reason?: string; notes?: string; cost?: number; txnId?: string; deleted?: boolean }
export interface Checkup extends Rec { person: string; name: string; every: number; last?: Day; due: Day; deleted?: boolean }

/* ---------- people ---------- */
export const people = (r: Reader): Person[] => live<Person>(r, "docOwners").filter((p) => p.group === "people").sort((a, b) => (isMe(b) ? 1 : 0) - (isMe(a) ? 1 : 0) || a.name.localeCompare(b.name));
export const isMe = (p: Person): boolean => /^(me|self|myself)$/i.test((p.rel ?? "").trim());
/** Whose habits these are: the person marked "me", else the first. */
export const habitsPerson = (r: Reader): Person | undefined => { const l = people(r); return l.find(isMe) ?? l[0]; };

/* ---------- days ---------- */
const pad = (n: number): string => String(n).padStart(2, "0");
export const dayOf = (d: Date): Day => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (d: Day): Date => new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const addDays = (d: Day, n: number): Day => { const x = parseDay(d); x.setDate(x.getDate() + n); return dayOf(x); };
export const daysBetween = (a: Day, b: Day): number => Math.round((+parseDay(b) - +parseDay(a)) / 864e5);
export function addMonths(d: Day, n: number): Day {
  let y = +d.slice(0, 4), m = +d.slice(5, 7) + n;
  while (m > 12) { m -= 12; y++; }
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad(m)}-${pad(Math.min(+d.slice(8, 10), last))}`;
}
const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayLabel = (d: Day, today: Day): string => `${+d.slice(8, 10)} ${MN[+d.slice(5, 7) - 1]}${d.slice(0, 4) === today.slice(0, 4) ? "" : ` ${d.slice(0, 4)}`}`;
export const monthLabel = (d: Day): string => `${MN[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
export const ago = (d: Day, today: Day): string => { const n = daysBetween(d, today); return n <= 0 ? "today" : n === 1 ? "yesterday" : n < 14 ? `${n} days ago` : n < 60 ? `${Math.round(n / 7)} weeks ago` : `${Math.round(n / 30)} months ago`; };

/* ---------- readings ---------- */
export type Status = "ok" | "warn" | "high" | "low" | "";
export interface Kind { k: string; label: string; unit: string; dp: number; two?: boolean; status(v: number, v2?: number, height?: number): [Status, string] }
const band = (v: number, lo: number, warnHi: number, hi: number): [Status, string] => (v < lo ? ["low", "low"] : v >= hi ? ["high", "high"] : v >= warnHi ? ["warn", "a little high"] : ["ok", "normal"]);
export const KINDS: Kind[] = [
  { k: "weight", label: "Weight", unit: "kg", dp: 1, status: (v, _, h) => { if (!h) return ["", ""]; const b = v / (h / 100) ** 2; return b < 18.5 ? ["low", `BMI ${b.toFixed(1)}, low`] : b < 25 ? ["ok", `BMI ${b.toFixed(1)}`] : b < 30 ? ["warn", `BMI ${b.toFixed(1)}, a little high`] : ["high", `BMI ${b.toFixed(1)}, high`]; } },
  { k: "bp", label: "Blood pressure", unit: "mmHg", dp: 0, two: true, status: (s, d = 0) => (s < 90 || d < 60 ? ["low", "low"] : s >= 140 || d >= 90 ? ["high", "high"] : s >= 120 || d >= 80 ? ["warn", "a little high"] : ["ok", "normal"]) },
  { k: "sugar_f", label: "Fasting sugar", unit: "mg/dL", dp: 0, status: (v) => band(v, 70, 100, 126) },
  { k: "sugar_pp", label: "Sugar after a meal", unit: "mg/dL", dp: 0, status: (v) => band(v, 70, 140, 200) },
  { k: "hr", label: "Resting heart rate", unit: "bpm", dp: 0, status: (v) => (v < 50 ? ["low", "low"] : v > 100 ? ["high", "high"] : ["ok", "normal"]) },
  { k: "spo2", label: "Oxygen (SpO2)", unit: "%", dp: 0, status: (v) => (v < 90 ? ["high", "low, see a doctor"] : v < 95 ? ["warn", "a little low"] : ["ok", "normal"]) },
  { k: "temp", label: "Temperature", unit: "°F", dp: 1, status: (v) => (v < 95 ? ["low", "low"] : v >= 100.4 ? ["high", "fever"] : v > 99 ? ["warn", "a little high"] : ["ok", "normal"]) },
  { k: "waist", label: "Waist", unit: "cm", dp: 1, status: () => ["", ""] },
];
export const kindOf = (k: string): Kind => KINDS.find((x) => x.k === k) ?? KINDS[0]!;
export const fmt = (r: Reading): string => { const k = kindOf(r.kind); return k.two ? `${Math.round(r.v)}/${Math.round(r.v2 ?? 0)}` : r.v.toFixed(k.dp).replace(/\.0$/, ""); };
export const readingsOf = (r: Reader, person: string, kind?: string): Reading[] => live<Reading>(r, "hlReadings").filter((x) => x.person === person && (!kind || x.kind === kind)).sort((a, b) => a.date.localeCompare(b.date) || (a.updatedAt as number ?? 0) - (b.updatedAt as number ?? 0));
export const heightOf = (r: Reader, person: string): number | undefined => r.get<Profile>("hlProfiles", person)?.height;
/** Change over about 30 days (the latest against the reading nearest 30 days before it). */
export function change30(list: Reading[]): number | null {
  const last = list[list.length - 1]; if (!last) return null;
  const before = list.filter((x) => daysBetween(x.date, last.date) >= 20).sort((a, b) => Math.abs(daysBetween(a.date, last.date) - 30) - Math.abs(daysBetween(b.date, last.date) - 30))[0];
  return before ? Math.round((last.v - before.v) * 10) / 10 : null;
}

/* ---------- lab reports ---------- */
export const labsOf = (r: Reader, person: string): Lab[] => live<Lab>(r, "hlLabs").filter((x) => x.person === person).sort((a, b) => b.date.localeCompare(a.date));
export const keyOf = (name: string): string => name.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
export function flag(v: LabValue): Status {
  const n = typeof v.value === "number" ? v.value : parseFloat(String(v.value));
  if (!Number.isFinite(n)) return "";
  if (v.high != null && n > v.high) return "high";
  if (v.low != null && n < v.low) return "low";
  return v.high != null || v.low != null ? "ok" : "";
}
export const rangeText = (v: LabValue): string => (v.low != null && v.high != null ? `normal ${v.low}–${v.high}` : v.high != null ? `normal below ${v.high}` : v.low != null ? `normal above ${v.low}` : "");
/** The same test in the latest earlier report. */
export function previous(r: Reader, lab: Lab, name: string): { lab: Lab; v: LabValue } | null {
  const k = keyOf(name);
  for (const l of labsOf(r, lab.person)) {
    if (l.date >= lab.date || l.id === lab.id) continue;
    const v = l.values.find((x) => keyOf(x.name) === k);
    if (v) return { lab: l, v };
  }
  return null;
}
/** Flagged values first (high, then low), then the rest. */
export const sortValues = (vs: LabValue[]): LabValue[] => [...vs].sort((a, b) => ["high", "low", "warn", "ok", ""].indexOf(flag(a)) - ["high", "low", "warn", "ok", ""].indexOf(flag(b)));

/** What Claude is asked to do with a report's text; the answer is JSON only. */
export const LAB_PROMPT = `Below is the text of a medical lab report, read from a PDF (columns separated by " | ").
Extract every test result. Reply with JSON only, no other text:
{"date": "YYYY-MM-DD" or null, "lab": "the laboratory's name" or null,
 "values": [{"group": "section, e.g. Lipid profile", "name": "test name", "value": number (or text if not a number),
   "unit": "unit" or null, "low": number or null, "high": number or null}]}
Use the report's own reference range for low and high ("< 100" means high 100, low null). Keep the report's order.
Leave out the patient's name, age, IDs, the doctor's name, addresses and phone numbers.

REPORT:
`;
/** Reads Claude's answer: the JSON (inside a code fence or not), with values checked. */
export function parseLabJson(text: string): { date?: Day; lab?: string; values: LabValue[] } {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Claude didn't return the values.");
  const j = JSON.parse(m[0]) as { date?: string | null; lab?: string | null; values?: unknown[] };
  const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() && Number.isFinite(+x) ? +x : null);
  const values = (j.values ?? []).flatMap((x): LabValue[] => {
    const o = x as Record<string, unknown>;
    if (!o || typeof o.name !== "string" || !o.name.trim() || o.value == null || o.value === "") return [];
    const n = num(o.value);
    return [{ ...(typeof o.group === "string" && o.group ? { group: o.group } : {}), name: o.name.trim(), value: n ?? String(o.value), ...(typeof o.unit === "string" && o.unit ? { unit: o.unit } : {}), low: num(o.low), high: num(o.high) }];
  });
  return { ...(j.date && /^\d{4}-\d\d-\d\d$/.test(j.date) ? { date: j.date } : {}), ...(j.lab ? { lab: j.lab } : {}), values };
}

/* ---------- medicines ---------- */
export const medsOf = (r: Reader, person: string, today: Day): Med[] => live<Med>(r, "hlMeds").filter((m) => m.person === person && !(m.stopped && m.stopped <= today)).sort((a, b) => (a.times[0] ?? "").localeCompare(b.times[0] ?? "") || a.name.localeCompare(b.name));
const dow = (d: Day): number => (parseDay(d).getDay() + 6) % 7;
export const dueOn = (m: Med, d: Day): boolean => d >= m.start && !(m.stopped && m.stopped <= d) && (!m.days?.length || m.days.includes(dow(d)));
export const logId = (med: string, day: Day, time: string): string => `${med}_${day}_${time}`;
export const taken = (r: Reader, m: Med, d: Day, time: string): boolean => !!r.get<MedLog>("hlMedLog", logId(m.id, d, time)) && !r.get<MedLog>("hlMedLog", logId(m.id, d, time))!.deleted;
/** Doses a week, for "running low". */
export const perWeek = (m: Med): number => m.times.length * (m.days?.length || 7);
export const runningLow = (m: Med): boolean => m.stock != null && m.stock <= perWeek(m);
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const schedule = (m: Med): string => `${!m.days?.length || m.days.length === 7 ? "daily" : m.days.length === 1 ? `weekly · ${DAYS[m.days[0]!]}` : m.days.map((x) => DAYS[x]).join(", ")} · ${m.times.map(timeLabel).join(", ")}`;
export const timeLabel = (hm: string): string => { const h = +hm.slice(0, 2), mm = hm.slice(3, 5); return `${h % 12 || 12}${mm === "00" ? "" : `:${mm}`} ${h < 12 ? "AM" : "PM"}`; };

/* ---------- check-ups ---------- */
export const checkupsOf = (r: Reader, person: string): Checkup[] => live<Checkup>(r, "hlCheckups").filter((c) => c.person === person).sort((a, b) => a.due.localeCompare(b.due));
export const visitsOf = (r: Reader, person: string): Visit[] => live<Visit>(r, "hlVisits").filter((v) => v.person === person).sort((a, b) => b.date.localeCompare(a.date));
export const CHECKUP_STARTERS: { name: string; every: number }[] = [
  { name: "Full body check-up", every: 12 }, { name: "Dentist", every: 6 }, { name: "Eye test", every: 24 }, { name: "Lipid profile", every: 6 },
];

/* ---------- phone reminders (no medicine or test names on the lock screen) ---------- */
export function healthNotes(r: Reader, now: Date, horizon = 7): { title: string; at: Date }[] {
  const out: { title: string; at: Date }[] = [], end = new Date(now.getTime() + horizon * 864e5), today = dayOf(now);
  const add = (title: string, at: Date): void => { if (at > now && at <= end) out.push({ title, at }); };
  for (const p of people(r)) {
    const meds = live<Med>(r, "hlMeds").filter((m) => m.person === p.id);
    for (let i = 0; i < horizon; i++) {
      const d = addDays(today, i), byTime = new Map<string, number>();
      for (const m of meds) if (dueOn(m, d)) for (const t of m.times) if (!(i === 0 && taken(r, m, d, t))) byTime.set(t, (byTime.get(t) ?? 0) + 1);
      for (const [t, n] of byTime) { const at = parseDay(d); at.setHours(+t.slice(0, 2), +t.slice(3, 5), 0, 0); add(`${n === 1 ? "A medicine" : `${n} medicines`} due now (${p.name})`, at); }
    }
    for (const c of checkupsOf(r, p.id)) { const at = parseDay(c.due); at.setHours(9, 0, 0, 0); add(`A check-up is due today (${p.name})`, at); const b = new Date(at); b.setDate(b.getDate() - 7); add(`A check-up is due in a week (${p.name})`, b); }
  }
  return out.sort((a, b) => +a.at - +b.at);
}

/** A tiny line chart (SVG points in a 100×28 box) of values, oldest first. */
export function sparkPoints(vals: number[]): string {
  if (vals.length < 2) return "";
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  return vals.map((v, i) => `${((i / (vals.length - 1)) * 100).toFixed(1)},${(26 - ((v - lo) / span) * 24).toFixed(1)}`).join(" ");
}
