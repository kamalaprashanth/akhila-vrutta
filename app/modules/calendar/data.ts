/**
 * Family days: birthdays, anniversaries and other dates on their English date; a shraddha on its tithi (and its
 * date too if asked). Changed with the owner on 26 Nov 2026: only a shraddha has a tithi.
 *   famDays { kind, name, date?, tithi?: { m: month 0–11 from Chaitra, t: tithi 0–29 }, byDate, byTithi, before? (days), note? }
 */
import type { Rec } from "../../core/store.ts";
import { addDays, label, nextTithi } from "./panchang.ts";

type Day = string;
export type Kind = "birthday" | "anniversary" | "shraddha" | "other";
export interface FamDay extends Rec { kind: Kind; name: string; date?: Day; tithi?: { m: number; t: number }; byDate: boolean; byTithi: boolean; before?: number; note?: string; deleted?: boolean }
export const KINDS: [Kind, string, string][] = [["birthday", "Birthday", "Whose? e.g. Amma"], ["anniversary", "Anniversary", "e.g. Wedding"], ["shraddha", "Shraddha", "Whose? e.g. Thatha"], ["other", "Other", "e.g. Griha pravesham"]];

export function famTitle(f: Pick<FamDay, "kind" | "name">): string {
  const n = f.name.trim();
  if (f.kind === "birthday") return `${n}'s birthday`;
  if (f.kind === "shraddha") return `${n}'s shraddha`;
  if (f.kind === "anniversary") return /anniversary$/i.test(n) ? n : `${n} anniversary`;
  return n;
}
export const tithiLabel = (x: { m: number; t: number }): string => label({ month: x.m, tithi: x.t });

export interface Occ { id: string; date: Day; by: "date" | "tithi"; years?: number; title: string }
/** This family day's occurrences from `from` for `days` days. */
export function occurrences(f: FamDay, from: Day, days: number): Occ[] {
  const end = addDays(from, days), out: Occ[] = [], title = famTitle(f);
  if ((f.byDate || f.kind !== "shraddha") && f.date) {   // birthdays, anniversaries, other days: always by date
    for (let y = +from.slice(0, 4); y <= +end.slice(0, 4); y++) {
      let d = `${y}${f.date.slice(4)}`;
      if (f.date.slice(5) === "02-29" && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) d = `${y}-02-28`;
      if (d >= from && d <= end) out.push({ id: f.id, date: d, by: "date", years: f.kind === "other" ? undefined : y - +f.date.slice(0, 4), title });
    }
  }
  if (f.byTithi && f.tithi && f.kind === "shraddha") {   // only a shraddha is kept by its tithi
    let at = from;
    for (let k = 0; k < 3; k++) {
      const d = nextTithi(f.tithi.m, f.tithi.t, at);
      if (!d || d > end) break;
      out.push({ id: f.id, date: d, by: "tithi", title });
      at = addDays(d, 300);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

interface Reader { all<T extends Rec = Rec>(c: string): T[] }
export const famDays = (r: Reader): FamDay[] => r.all<FamDay>("famDays").filter((x) => !x.deleted);
/** Every family day's occurrences in a window, soonest first. */
export const upcoming = (r: Reader, from: Day, days: number): Occ[] => famDays(r).flatMap((f) => occurrences(f, from, days)).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
