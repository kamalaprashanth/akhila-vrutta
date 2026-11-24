/**
 * The money data as the calculations see it: stored records (amounts in paise), with deleted ones
 * filtered out, plus a per-data cache. "today" is fixed per instance so results are repeatable.
 */
import { todayOf, type Day, type YM } from "./dates.ts";

/** A money field: paise in storage. Old records may hold anything; read with `num`. */
export type Paise = number;

export interface Rec {
  id: string;
  deleted?: boolean;
  updatedAt?: number;
  [k: string]: unknown;
}

export interface Txn extends Rec {
  type?: string;
  date?: Day;
  amount?: Paise;
  accountId?: string;
  loanId?: string;
  act?: string;
  part?: string;
  mode?: string;
  ym?: YM;
  covers?: string[];
  key?: string;
  hist?: boolean;
}

export interface RateChange { ym: YM; rate?: number; mode?: string }
export interface BankSync { ym: YM; bal?: Paise; mode?: string }
export interface RepayPlan { id: string; amount?: Paise; freq?: string; start: YM; end?: YM | null }

/** The interest-bearing part of a loan (the loan itself for bank loans, `bank` for hybrid ones). */
export interface BankPart {
  principal?: Paise;
  rate?: number;
  tenure?: number;
  start?: YM;
  emi?: Paise;
  rates?: RateChange[];
  syncs?: BankSync[];
}

export interface Loan extends Rec, BankPart {
  kind?: "emi" | "family" | "hybrid" | "cardemi" | string;
  bank?: BankPart | null;
  plans?: RepayPlan[];
  closedOn?: YM;
}

/** Reads a stored number the way the planner always has (`+x || 0`). */
export const num = (x: unknown): number => Number(x) || 0;

export type Collections = Record<string, Rec[]>;

export class MoneyData {
  readonly today: Day;
  private readonly cols: Collections;
  private cache = new Map<string, unknown>();
  private liveCache = new Map<string, Rec[]>();

  constructor(cols: Collections, today: Day = todayOf()) {
    this.cols = cols;
    this.today = today;
  }

  /** Records that aren't deleted. */
  live<T extends Rec = Rec>(c: string): T[] {
    let l = this.liveCache.get(c);
    if (!l) { l = (this.cols[c] ?? []).filter((x) => !x.deleted); this.liveCache.set(c, l); }
    return l as T[];
  }

  byId<T extends Rec = Rec>(c: string, id: string): T | undefined {
    return (this.cols[c] ?? []).find((x) => x.id === id) as T | undefined;
  }

  /** Computes once per data snapshot. */
  memo<T>(key: string, f: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, f());
    return this.cache.get(key) as T;
  }
}
