/**
 * What the money screens drawn by Akhila Vrutta need from the Money tab: the stored data (paise), a way to
 * save records, and the planner's shared page state. Set once by the Money tab (index.ts).
 */
import type { MoneyData, Rec } from "../calc/data.ts";
import type { PlannerState } from "../views/transactions.ts";

export interface WriteOp { c: string; r: Rec }
export interface Env {
  data(): MoneyData;
  /** Saves records (already in paise), then redraws whatever is on screen. */
  write(ops: WriteOp[]): void;
  /** The planner's live page state (filters, month, tabs). */
  state(): PlannerState | null;
  /** Redraws the screen (after a change to the page state only). */
  refresh(): void;
  /** Opens something only the planner can show yet (a loan entry, an EPF page…). */
  planner(name: string, ...args: unknown[]): void;
}
let env: Env | null = null;
export const setEnv = (e: Env): void => { env = e; };
export const E = (): Env => { if (!env) throw new Error("money screens used before the Money tab started"); return env; };

export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
/** Saves one record (stamped with the time, as the planner did). */
export function upsert(c: string, r: Rec): void { E().write([{ c, r: { ...r, updatedAt: Date.now() } }]); }
/** Marks a record deleted (kept, so other devices learn of it). */
export function del(c: string, id: string): void {
  const x = E().data().byId(c, id);
  if (!x) return;
  const r: Rec = { ...x, deleted: true, updatedAt: Date.now() };
  delete (r as Record<string, unknown>).seed;
  E().write([{ c, r }]);
}

/** Small per-device settings the planner keeps in this browser ("kpmp.ui.*"); shared with it (same site). */
export const prefGet = <T>(k: string, dflt: T): T => { try { const v = localStorage.getItem("kpmp.ui." + k); return v == null ? dflt : JSON.parse(v) as T; } catch { return dflt; } };
export const prefSet = (k: string, v: unknown): void => { try { localStorage.setItem("kpmp.ui." + k, JSON.stringify(v)); } catch { /* storage off */ } };
