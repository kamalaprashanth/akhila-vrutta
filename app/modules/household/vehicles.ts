/**
 * Vehicles (a tab in Household): renewals (insurance, PUC, RC, FASTag, permit), the service schedule (every N km
 * or N months, whichever first), the fuel log with mileage, and costs offered to Money.
 *   hhVehicles  name, kind, reg, model, fuel, bought, renewals { insurance, puc, rc, fastag, permit }: valid-till
 *               days; service { km, months, lastDate, lastKm }
 *   hhFuel      a fill: date, odometer km, litres, amount (paise), full tank, Money txn
 *   hhDone      service and renewal history (vehicleId)
 */
import type { Rec } from "../../core/store.ts";
import { addMonths, dayLabel, daysBetween, live, parseDay, type Day, type Done, type Reader } from "./data.ts";

export type Renewal = "insurance" | "puc" | "rc" | "fastag" | "permit";
export const RENEWALS: [Renewal, string][] = [["insurance", "Insurance"], ["puc", "PUC"], ["rc", "Registration (RC)"], ["fastag", "FASTag"], ["permit", "Permit"]];
export const KINDS: [string, string, string][] = [["car", "Car", "🚗"], ["bike", "Bike / scooter", "🏍️"], ["other", "Other", "🚙"]];
export const FUELS: [string, string][] = [["petrol", "Petrol"], ["diesel", "Diesel"], ["cng", "CNG"], ["ev", "Electric"], ["hybrid", "Hybrid"]];

export interface Vehicle extends Rec {
  name: string; kind?: string; reg?: string; model?: string; fuel?: string; bought?: Day; price?: number;
  renew?: Partial<Record<Renewal, Day>>;
  service?: { km?: number; months?: number; lastDate?: Day; lastKm?: number };
  odo?: number; deleted?: boolean;
}
export interface Fuel extends Rec { vehicleId: string; date: Day; odo: number; litres: number; amount?: number; full: boolean; txnId?: string; deleted?: boolean }

export const vehicles = (r: Reader): Vehicle[] => live<Vehicle>(r, "hhVehicles").sort((a, b) => a.name.localeCompare(b.name));
export const fuelOf = (r: Reader, id: string): Fuel[] => live<Fuel>(r, "hhFuel").filter((f) => f.vehicleId === id).sort((a, b) => a.odo - b.odo || a.date.localeCompare(b.date));
export const icon = (v: Vehicle): string => KINDS.find((k) => k[0] === v.kind)?.[2] ?? "🚗";
export const vehicleTitle = (v: Vehicle): string => [v.name, v.reg].filter(Boolean).join(" · ");

/** The highest odometer reading known: the vehicle's own, fills, services. */
export function odometer(r: Reader, v: Vehicle): number {
  const fills = fuelOf(r, v.id).map((f) => f.odo), svc = live<Done & { odo?: number; vehicleId?: string }>(r, "hhDone").filter((d) => d.vehicleId === v.id).map((d) => d.odo ?? 0);
  return Math.max(v.odo ?? 0, v.service?.lastKm ?? 0, ...fills, ...svc);
}

/**
 * Mileage (km per litre, or per kWh), the full-tank way: between the earliest and latest of the last few full
 * fills, the km driven ÷ the fuel put in after the first of them. Null until there are two full fills.
 */
export function mileage(fills: Fuel[], last = 4): number | null {
  const full = fills.filter((f) => f.full);
  if (full.length < 2) return null;
  const end = full[full.length - 1]!, start = full[Math.max(0, full.length - last)]!;
  const km = end.odo - start.odo;
  const litres = fills.filter((f) => f.odo > start.odo && f.odo <= end.odo).reduce((s, f) => s + f.litres, 0);
  return km > 0 && litres > 0 ? Math.round((km / litres) * 10) / 10 : null;
}

/** The next service: by date and by km, whichever comes first. */
export function nextService(v: Vehicle, odo: number): { date?: Day; km?: number; kmLeft?: number } | null {
  const s = v.service;
  if (!s || (!s.km && !s.months)) return null;
  const date = s.months && s.lastDate ? addMonths(s.lastDate, s.months) : undefined;
  const km = s.km != null && s.lastKm != null ? s.lastKm + s.km : undefined;
  return { date, km, kmLeft: km != null ? km - odo : undefined };
}

export interface VehRow { id: string; key: Renewal | "service"; title: string; sub: string; date: Day; late: number }
/** Renewals within 60 days (or ended in the last 30), and a service due within 30 days or 500 km. */
export function vehicleDue(r: Reader, today: Day): VehRow[] {
  const out: VehRow[] = [];
  for (const v of vehicles(r)) {
    for (const [k, label] of RENEWALS) {
      const d = v.renew?.[k];
      if (!d || daysBetween(today, d) > 60 || daysBetween(today, d) < -30) continue;
      out.push({ id: v.id, key: k, title: `${v.name} ${label.toLowerCase().replace(" (rc)", "")} ${d < today ? "expired" : "renewal"}`, sub: [v.reg, d < today ? `ended ${dayLabel(d, today)}` : `valid till ${dayLabel(d, today)}`].filter(Boolean).join(" · "), date: d, late: daysBetween(d, today) });
    }
    const odo = odometer(r, v), n = nextService(v, odo);
    if (n) {
      const byKm = n.kmLeft != null && n.kmLeft <= 500, byDate = !!n.date && daysBetween(today, n.date) <= 30;
      if (byKm || byDate) {
        const date = byDate ? n.date! : today;
        out.push({ id: v.id, key: "service", title: `${v.name} service`, sub: [v.reg, n.km != null ? (n.kmLeft! <= 0 ? `${(-n.kmLeft!).toLocaleString("en-IN")} km over` : `at ${n.km.toLocaleString("en-IN")} km`) : "", n.date ? `or ${dayLabel(n.date, today)}` : ""].filter(Boolean).join(" · "), date, late: daysBetween(date, today) });
      }
    }
  }
  return out;
}

/** Phone reminders: insurance 15 days before and on the day; PUC, FASTag, permit 7 days before; RC 60 days before; service on its date. Names only. */
export function vehicleNotes(r: Reader, now: Date, days = 45): { title: string; at: Date }[] {
  const end = new Date(now.getTime() + days * 864e5), out: { title: string; at: Date }[] = [];
  const at = (d: Day, back: number): Date => { const x = parseDay(d); x.setHours(9, 0, 0, 0); x.setDate(x.getDate() - back); return x; };
  const add = (title: string, when: Date): void => { if (when > now && when <= end) out.push({ title, at: when }); };
  const before: Record<Renewal, number[]> = { insurance: [15, 0], puc: [7, 0], fastag: [7], permit: [15, 0], rc: [60] };
  for (const v of vehicles(r)) {
    for (const [k, label] of RENEWALS) {
      const d = v.renew?.[k]; if (!d) continue;
      for (const b of before[k]) add(b ? `${v.name}: ${label} ends in ${b} days` : `${v.name}: ${label} ends today`, at(d, b));
    }
    const n = nextService(v, odometer(r, v));
    if (n?.date) add(`${v.name}: service due`, at(n.date, 0));
  }
  return out;
}
