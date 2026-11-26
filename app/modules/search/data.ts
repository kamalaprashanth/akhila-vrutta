/**
 * Search everything: one search over every section's records, run on this device (the data is only ever
 * decrypted here, so the words never leave it). Every word must appear (in any order, any case); an amount
 * like 5000, 5,000 or ₹5,000 also finds Money entries of that amount.
 */
import type { Rec } from "../../core/store.ts";

type Day = string;
export type Area = "Money" | "Household" | "Health" | "Papers" | "Habits";
export const AREAS: Area[] = ["Money", "Household", "Health", "Papers", "Habits"];
export interface Hit { area: Area; key: string; title: string; sub: string; date?: Day; amount?: number; href: string; open?: { c: string; id: string } }
export interface Reader { all<T extends Rec = Rec>(c: string): T[]; get<T extends Rec = Rec>(c: string, id: string): T | undefined }

type R = Rec & Record<string, unknown>;
const live = (r: Reader, c: string): R[] => r.all<R>(c).filter((x) => !x.deleted);
const s = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayLabel = (d: Day): string => (d && /^\d{4}-\d\d-\d\d/.test(d) ? `${+d.slice(8, 10)} ${MN[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : "");

/** The words of a query, lower case; an amount also as whole rupees. */
export function parse(q: string): { words: string[]; rupees: number | null } {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const m = q.replace(/[₹,\s]/g, "").match(/^(\d+(?:\.\d{1,2})?)$/);
  return { words, rupees: m ? Number(m[1]) : null };
}
const hit = (hay: string[], words: string[]): boolean => { const h = hay.filter(Boolean).join(" ").toLowerCase(); return words.every((w) => h.includes(w)); };

export function searchAll(r: Reader, q: string, opts: { catName?: (id: string) => string; accName?: (id: string) => string; fileNames?: (c: string, id: string) => string[] } = {}): Hit[] {
  const { words, rupees } = parse(q);
  if (!words.length || q.trim().length < 2) return [];
  const cat = opts.catName ?? ((id: string) => s(r.get<R>("categories", id)?.name));
  const acc = opts.accName ?? ((id: string) => s(r.get<R>("accounts", id)?.name));
  const files = opts.fileNames ?? (() => []);
  const out: Hit[] = [];
  const homeName = (id: unknown): string => s(r.get<R>("hhHomes", s(id))?.name) || s(r.get<R>("props", s(id))?.name);

  /* Money */
  for (const t of live(r, "txns")) {
    if (t.type === "carry") continue;
    const amt = Number(t.amount) || 0, c = cat(s(t.categoryId)), a = acc(s(t.accountId)), to = acc(s(t.toAccountId));
    const byAmount = rupees != null && Math.abs(Math.abs(amt) / 100 - rupees) < 0.005;
    if (byAmount || hit([s(t.note), c, a, to, ...((t.tags as string[]) ?? []), s(t.type)], words)) {
      out.push({ area: "Money", key: `t:${t.id}`, title: s(t.note) || c || (t.type === "transfer" ? `${a} → ${to}` : s(t.type)), sub: [dayLabel(s(t.date)), c && s(t.note) ? c : "", a].filter(Boolean).join(" · "), date: s(t.date), amount: amt, href: "#/money/activity", open: { c: "txns", id: t.id } });
    }
  }
  for (const [c, what, href] of [["accounts", "Account", "#/money/accounts"], ["loans", "Loan", "#/money/accounts"], ["recurring", "Regular item", "#/money/plan"], ["goals", "Goal", "#/money/plan"], ["holdings", "Investment", "#/money/accounts"], ["props", "Property", "#/money/accounts"]] as const) {
    for (const x of live(r, c)) if (hit([s(x.name), s(x.bank), s(x.sym), s(x.note)], words)) out.push({ area: "Money", key: `${c}:${x.id}`, title: s(x.name) || s(x.sym), sub: what, href });
  }
  /* Home */
  for (const x of live(r, "hhVehicles")) if (hit([s(x.name), s(x.reg), s(x.model), s(x.kind)], words)) out.push({ area: "Household", key: `v:${x.id}`, title: s(x.name), sub: [s(x.reg), s(x.model)].filter(Boolean).join(" · ") || "Vehicle", href: "#/household/veh", open: { c: "hhVehicles", id: x.id } });
  for (const x of live(r, "hhFuel")) { const v = r.get<R>("hhVehicles", s(x.vehicleId)); if (v && hit([s(v.name), s(x.note), "fuel"], words)) out.push({ area: "Household", key: `f:${x.id}`, title: "Fuel", sub: [s(v.name), dayLabel(s(x.date))].filter(Boolean).join(" · "), date: s(x.date), href: "#/household/veh" }); }
  for (const x of live(r, "hhAppliances")) if (hit([s(x.name), s(x.model), s(x.service), s(x.note), homeName(x.home)], words)) out.push({ area: "Household", key: `a:${x.id}`, title: s(x.name), sub: [s(x.model), homeName(x.home)].filter(Boolean).join(" · ") || "Appliance", href: "#/household/appl", open: { c: "hhAppliances", id: x.id } });
  for (const x of live(r, "hhJobs")) if (hit([s(x.name), s(x.note), homeName(x.home)], words)) out.push({ area: "Household", key: `j:${x.id}`, title: s(x.name), sub: [homeName(x.home), x.due ? `next ${dayLabel(s(x.due))}` : ""].filter(Boolean).join(" · "), date: s(x.due), href: "#/household/due" });
  for (const x of live(r, "hhItems")) if (hit([s(x.text)], words)) out.push({ area: "Household", key: `i:${x.id}`, title: s(x.text), sub: `${x.list === "grocery" ? "Groceries" : "To do"}${x.doneOn ? " · done" : ""}`, href: "#/household/lists" });
  for (const x of live(r, "hhHomes")) if (hit([s(x.name)], words)) out.push({ area: "Household", key: `h:${x.id}`, title: s(x.name), sub: "Home", href: "#/household/due" });
  /* Health */
  const person = (id: unknown): string => s(r.get<R>("docOwners", s(id))?.name);
  for (const x of live(r, "hlMeds")) if (hit([s(x.name), s(x.dose), s(x.note), person(x.person)], words)) out.push({ area: "Health", key: `m:${x.id}`, title: s(x.name), sub: ["Medicine", person(x.person), x.stopped ? "stopped" : ""].filter(Boolean).join(" · "), href: "#/health" });
  for (const x of live(r, "hlLabs")) {
    const vals = ((x.values as { name?: string }[]) ?? []).map((v) => s(v.name));
    const match = vals.filter((n) => words.some((w) => n.toLowerCase().includes(w)));
    if (hit([s(x.lab), person(x.person), "lab report", ...vals, ...files("hlLabs", x.id)], words)) out.push({ area: "Health", key: `l:${x.id}`, title: match.length ? match.slice(0, 3).join(", ") : "Lab report", sub: ["Lab report", dayLabel(s(x.date)), person(x.person)].filter(Boolean).join(" · "), date: s(x.date), href: `#/health/lab/${encodeURIComponent(x.id)}` });
  }
  for (const x of live(r, "hlVisits")) if (hit([s(x.doctor), s(x.reason), s(x.notes), person(x.person), ...files("hlVisits", x.id)], words)) out.push({ area: "Health", key: `w:${x.id}`, title: s(x.doctor) || "Doctor visit", sub: ["Visit", dayLabel(s(x.date)), s(x.reason)].filter(Boolean).join(" · "), date: s(x.date), href: "#/health" });
  for (const x of live(r, "hlCheckups")) if (hit([s(x.name), person(x.person), "check-up checkup"], words)) out.push({ area: "Health", key: `c:${x.id}`, title: s(x.name), sub: ["Check-up", person(x.person), x.due ? `due ${dayLabel(s(x.due))}` : ""].filter(Boolean).join(" · "), href: "#/health" });
  /* Habits */
  for (const x of live(r, "habits")) if (hit([s(x.name)], words)) out.push({ area: "Habits", key: `b:${x.id}`, title: s(x.name), sub: x.stopped ? "Stopped" : "Habit", href: `#/habits/${encodeURIComponent(x.id)}` });
  return out;
}

/** Hits by area, newest first inside an area (undated ones first: things rather than entries). */
export function grouped(hits: Hit[]): [Area, Hit[]][] {
  return AREAS.map((a) => [a, hits.filter((h) => h.area === a).sort((x, y) => (x.date ? 1 : 0) - (y.date ? 1 : 0) || (y.date ?? "").localeCompare(x.date ?? ""))] as [Area, Hit[]]).filter(([, l]) => l.length);
}
