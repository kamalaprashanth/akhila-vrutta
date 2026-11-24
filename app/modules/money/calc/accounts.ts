/**
 * Account balances and credit-card cycles. Same rules as KP Money Planner, in paise.
 *
 * Effects on a balance: income adds, expenses and investments subtract, transfers move money,
 * loan borrowings add and repayments subtract, carry-over pairs net to zero over the month change.
 * Imported history (hist) and spends paid by someone else (paidBy) never move balances.
 */
import { dayIn, ymOf, type Day, type YM } from "./dates.ts";
import { num, type MoneyData, type Paise, type Rec, type Txn } from "./data.ts";

export interface Account extends Rec {
  name?: string;
  type?: "bank" | "card" | "cash" | "wallet" | "invest" | "loan" | string;
  opening?: Paise;
  openingDate?: Day;
  stmtDay?: number;
  dueDay?: number;
  hidden?: boolean;
  noTotal?: boolean;
  payFrom?: string;
}

/** Transactions as the balance rules read them. */
export interface BalTxn extends Txn {
  toAccountId?: string;
  dir?: "in" | "out";
  carry?: Paise;
  paidBy?: string;
}

/** Hidden accounts, and ones marked "not in totals", are left out of totals, card dues, forecast and net worth. */
export const countsAcc = (a: Account | undefined | null): boolean => !!a && !a.hidden && !a.noTotal;
/** Imported Money Manager history shows in lists and reports but never moves today's balances. */
export const isHist = (t: Txn): boolean => !!t.hist;

/**
 * The day an account's starting balance applies from. Cards imported from Money Manager on 10 Nov 2026
 * carry balances that belong to the cycle after that day.
 */
export const openDateOf = (a: Account): Day | null =>
  a.openingDate || (a.type === "card" && String(a.id).startsWith("mm-") ? "2026-11-10" : null);

/** Each account's balance at the end of `upto` (or now): positive is money you have, negative is owed. */
export function balances(d: MoneyData, upto?: Day): Map<string, Paise> {
  return d.memo(`bal:${upto ?? ""}`, () => {
    const b = new Map<string, Paise>(d.live<Account>("accounts").map((a) => {
      const od = openDateOf(a);
      return [a.id, !upto || !od || upto >= od ? num(a.opening) : 0];
    }));
    const add = (id: string | undefined, v: number): void => { if (id !== undefined) b.set(id, (b.get(id) ?? 0) + v); };
    for (const t of d.live<BalTxn>("txns")) {
      if (upto && (t.date ?? "") > upto) continue;
      if (t.paidBy || t.hist) continue;
      const amt = num(t.amount);
      if (t.type === "income") add(t.accountId, amt);
      else if (t.type === "transfer") { add(t.accountId, -amt); add(t.toAccountId, amt); }
      else if (t.type === "loan") { if (t.accountId && b.has(t.accountId)) add(t.accountId, t.act === "borrow" ? amt : -amt); }
      else if (t.type === "carry") { if (t.accountId && b.has(t.accountId)) add(t.accountId, t.dir === "in" ? num(t.carry) : -num(t.carry)); }
      else add(t.accountId, -amt);
    }
    return b;
  });
}

/** One transaction's effect on one account (carry-overs included). */
export function accEff(id: string, t: BalTxn): Paise {
  const amt = num(t.amount);
  if (t.type === "carry") return t.accountId === id ? (t.dir === "in" ? num(t.carry) : -num(t.carry)) : 0;
  if (t.type === "transfer") return t.toAccountId === id ? amt : t.accountId === id ? -amt : 0;
  if (t.accountId !== id) return 0;
  if (t.type === "income") return amt;
  if (t.type === "loan") return t.act === "borrow" ? amt : -amt;
  return -amt;
}

/** An account's net change in a month, leaving out history (and the outgoing carry when asked). */
export function monthNet(d: MoneyData, accId: string, ym: YM, skipCarryOut = false): Paise {
  let n = 0;
  for (const t of d.live<BalTxn>("txns")) {
    if (isHist(t) || ymOf(t.date ?? "") !== ym) continue;
    if (skipCarryOut && t.type === "carry" && t.dir === "out") continue;
    n += accEff(accId, t);
  }
  return Math.round(n);
}

/** Income, spending and investing recorded in a month (carried-in balance counts as income). */
export function monthActuals(d: MoneyData, ym: YM): { income: Paise; expense: Paise; investment: Paise } {
  const a = { income: 0, expense: 0, investment: 0 };
  for (const t of d.live<BalTxn>("txns")) {
    if (ymOf(t.date ?? "") !== ym) continue;
    if (t.type === "income" || t.type === "expense" || t.type === "investment") a[t.type] += num(t.amount);
    else if (t.type === "carry" && t.dir === "in") a.income += num(t.carry);
  }
  return a;
}

/* ---------- credit cards ---------- */

const ymd = (d: Day): [number, number] => { const [y, m] = d.split("-").map(Number); return [y ?? 0, m ?? 0]; };

/** The statement date a spend on day `day` falls into. */
export function stmtFor(a: Account, day: Day): Day {
  let [y, m] = ymd(day);
  const st = dayIn(y, m, num(a.stmtDay));
  if (day > st) { m++; if (m > 12) { m = 1; y++; } }
  return dayIn(y, m, num(a.stmtDay));
}

/** When the bill for statement `stmt` is due. */
export function dueOf(a: Account, stmt: Day): Day {
  if (!num(a.dueDay)) return stmt;
  let [y, m] = ymd(stmt);
  if (num(a.dueDay) <= num(a.stmtDay)) { m++; if (m > 12) { m = 1; y++; } }
  return dayIn(y, m, num(a.dueDay));
}

const isCycledCard = (a: Account | undefined): a is Account => !!a && a.type === "card" && num(a.stmtDay) >= 1;

/** The month a transaction counts as spending in: card spends count when their bill is due. */
export function expMonth(d: MoneyData, t: Txn): YM {
  const a = t.accountId ? d.byId<Account>("accounts", t.accountId) : undefined;
  if (t.type === "expense" && isCycledCard(a)) return ymOf(dueOf(a, stmtFor(a, t.date ?? "")));
  return ymOf(t.date ?? "");
}

/** A history card spend already inside the card's opening balance (so it isn't counted twice). */
export function histCovered(d: MoneyData, t: Txn): boolean {
  if (!t.hist || t.type !== "expense" || !t.accountId) return false;
  const a = d.byId<Account>("accounts", t.accountId);
  if (!isCycledCard(a) || !(num(a.opening) < 0)) return false;
  const od = openDateOf(a);
  return !!od && expMonth(d, t) >= ymOf(dueOf(a, stmtFor(a, od)));
}

export interface Cycle { stmt: Day; prev: Day; next: Day; due: Day | null }

/** Statement k cycles back (0 = the latest statement on or before today). */
export function cardCycle(d: MoneyData, a: Account, k = 0): Cycle {
  let [y, m] = ymd(d.today);
  const day = Number(d.today.slice(8));
  if (day < num(a.stmtDay)) m--;
  m -= k;
  while (m < 1) { m += 12; y--; }
  const at = (yy: number, mm: number): Day => {
    while (mm < 1) { mm += 12; yy--; }
    while (mm > 12) { mm -= 12; yy++; }
    return dayIn(yy, mm, num(a.stmtDay));
  };
  let due: Day | null = null;
  if (num(a.dueDay)) {
    let dm = m + (num(a.dueDay) <= num(a.stmtDay) ? 1 : 0);
    let dy = y;
    while (dm > 12) { dm -= 12; dy++; }
    due = dayIn(dy, dm, num(a.dueDay));
  }
  return { stmt: at(y, m), prev: at(y, m - 1), next: at(y, m + 1), due };
}

/** A transaction's effect on a card's balance (negative = more owed). */
export function cardEff(a: Account, t: BalTxn): Paise {
  const amt = num(t.amount);
  if (t.type === "transfer") return t.toAccountId === a.id ? amt : t.accountId === a.id ? -amt : 0;
  if (t.accountId !== a.id) return 0;
  if (t.type === "income") return amt;
  if (t.type === "loan") return t.act === "borrow" ? amt : -amt;
  return -amt;
}

/** A card's transactions after `from` up to `to`, newest first. */
export function cardTx(d: MoneyData, a: Account, from: Day, to?: Day): BalTxn[] {
  return d.live<BalTxn>("txns")
    .filter((t) => !isHist(t) && (t.date ?? "") > from && (!to || (t.date ?? "") <= to) && cardEff(a, t) !== 0)
    .sort((p, q) => (q.date ?? "").localeCompare(p.date ?? "") || num(q.updatedAt) - num(p.updatedAt));
}

export interface CardInfo extends Cycle {
  /** what the statement asked for */
  billed: Paise;
  /** paid toward it since */
  paid: Paise;
  /** still to pay on that bill */
  dueLeft: Paise;
  /** owed in total now */
  owed: Paise;
  /** spent since the statement */
  unbilled: Paise;
  /** days until due (negative = overdue) */
  days: number | null;
}

/** Where a card stands: last statement, what's left to pay on it, unbilled spend, days to the due date. */
export function cardInfo(d: MoneyData, a: Account, k = 0): CardInfo | null {
  if (!isCycledCard(a)) return null;
  const cy = cardCycle(d, a, k);
  const until = k === 0 ? d.today : cy.next;
  const atStmt = balances(d, cy.stmt).get(a.id) ?? 0;
  const now = balances(d).get(a.id) ?? 0;
  let paid = 0;
  for (const x of cardTx(d, a, cy.stmt, until)) { const e = cardEff(a, x); if (e > 0) paid += e; }
  const billed = Math.max(0, -atStmt);
  const dueLeft = Math.max(0, billed - paid);
  const owed = Math.max(0, -now);
  const unbilled = Math.max(0, owed - dueLeft);
  const days = cy.due ? Math.round((Date.parse(`${cy.due}T00:00`) - Date.parse(`${d.today}T00:00`)) / 864e5) : null;
  return { ...cy, billed, paid, dueLeft, owed, unbilled, days };
}
