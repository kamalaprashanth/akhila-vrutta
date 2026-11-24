/**
 * Loans: EMIs, amortisation, what's owed. Same rules as KP Money Planner, in paise.
 * Interest is kept at full precision while a schedule is worked out; round only where it's shown.
 *
 * kind "emi"     bank loan with an EMI schedule; rate changes in `rates`, part payments are txns.
 * kind "family"  interest-free running ledger with one person; borrowings and repayments are txns.
 * kind "hybrid"  family loan whose `bank` part is a relative's bank loan you pay the EMI on.
 * kind "cardemi" an EMI on a credit card, scheduled like a bank loan.
 */
import { addM, ymOf, type YM } from "./dates.ts";
import { num, type BankPart, type Loan, type MoneyData, type Paise, type Txn } from "./data.ts";

/** "Paid off" threshold: anything at or under half a rupee. */
const DUST: Paise = 50;

/** EMI for principal P over n months at monthly rate r. */
export function pmt(P: number, r: number, n: number): number {
  if (n <= 0) return P;
  if (!r) return P / n;
  const f = Math.pow(1 + r, n);
  return (P * r * f) / (f - 1);
}

/** Months needed to repay P at monthly rate r with EMI E (Infinity if E never covers the interest). */
export function nper(P: number, r: number, E: number): number {
  if (!(E > 0)) return Infinity;
  if (!r) return Math.ceil(P / E - 1e-9);
  if (E <= P * r) return Infinity;
  return Math.ceil(-Math.log(1 - (P * r) / E) / Math.log(1 + r) - 1e-9);
}

export const kindOf = (l: Loan): string => l.kind || "emi";
export const isEmiLike = (k: string): boolean => k === "emi" || k === "cardemi";

/** The interest-bearing part, or null for a purely family loan. */
export function bankOf(l: Loan): BankPart | null {
  const k = kindOf(l);
  return isEmiLike(k) ? l : k === "hybrid" ? (l.bank ?? null) : null;
}

export function emiOf(l: Loan): Paise {
  if (num(l.emi)) return num(l.emi);
  return num(l.principal) && num(l.tenure) ? pmt(num(l.principal), num(l.rate) / 1200, num(l.tenure)) : 0;
}

export const loanEnd = (l: Loan): YM | null => (l.tenure ? addM(l.start ?? "", num(l.tenure) - 1) : null);

export const loanTx = (d: MoneyData, id: string): Txn[] => d.live<Txn>("txns").filter((t) => t.type === "loan" && t.loanId === id);

export interface ScheduleRow {
  ym: YM;
  open: number;
  emi: number;
  int: number;
  prin: number;
  bal: number;
  /** yearly rate in % */
  rate: number;
  /** 1-based EMI number */
  k: number;
}
export interface Schedule {
  rows: ScheduleRow[];
  end: YM | null;
  closed: YM | null;
  totalInt: number;
  start: YM;
  principal: Paise;
}

/** Month-by-month amortisation of the EMI part, applying rate changes and part payments in their month. */
export function schedule(d: MoneyData, l: Loan, skipTxn?: string): Schedule | null {
  const b = bankOf(l);
  if (!b || !(num(b.principal) > 0) || !(num(b.tenure) > 0) || !b.start) return null;
  const start = b.start;
  const run = (): Schedule => {
    const groupBy = <T>(list: T[], ymOfItem: (x: T) => YM): Map<YM, T[]> => {
      const m = new Map<YM, T[]>();
      for (const x of list) {
        const k0 = ymOfItem(x);
        const k = k0 < start ? start : k0;
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(x);
      }
      return m;
    };
    const pre = groupBy(loanTx(d, l.id).filter((t) => t.act === "prepay" && t.id !== skipTxn), (t) => ymOf(t.date ?? ""));
    for (const v of pre.values()) v.sort((x, y) => (x.date ?? "").localeCompare(y.date ?? ""));
    const rates = groupBy(b.rates ?? [], (rc) => rc.ym);
    const syncs = groupBy(b.syncs ?? [], (x) => x.ym);

    let bal = num(b.principal);
    let r = num(b.rate) / 1200;
    let left = num(b.tenure);
    let emi = num(b.emi) || pmt(bal, r, left);
    let ym = start;
    let totalInt = 0;
    let closed: YM | null = null;
    const rows: ScheduleRow[] = [];
    // After a lump sum: either keep the tenure and lower the EMI ("emi"), or keep the EMI and shorten the tenure.
    const reshape = (mode: string | undefined): void => {
      if (mode === "emi") emi = pmt(bal, r, left);
      else { const n = nper(bal, r, emi); if (isFinite(n)) left = n; }
    };
    for (let i = 0; i < 720; i++) {
      for (const rc of rates.get(ym) ?? []) {
        r = num(rc.rate) / 1200;
        if (rc.mode === "emi") emi = pmt(bal, r, left);
        else { const n = nper(bal, r, emi); if (isFinite(n)) left = n; else emi = pmt(bal, r, left); }
      }
      for (const p of pre.get(ym) ?? []) {
        bal = Math.max(0, bal - num(p.amount));
        if (bal <= DUST) break;
        reshape(p.mode);
      }
      // Matched to a bank statement: the bank's figure replaces ours from this month on.
      for (const x of syncs.get(ym) ?? []) {
        bal = Math.max(0, num(x.bal));
        if (bal <= DUST) break;
        reshape(x.mode);
      }
      if (bal <= DUST) { closed = ym; break; }
      const open = bal;
      const int = bal * r;
      const pay = left <= 1 ? bal + int : Math.min(emi, bal + int);
      const prin = pay - int;
      bal = Math.max(0, bal - prin);
      left--;
      totalInt += int;
      rows.push({ ym, open, emi: pay, int, prin, bal, rate: r * 1200, k: rows.length + 1 });
      if (bal <= DUST) break;
      ym = addM(ym, 1);
    }
    // A loan you closed yourself stops after its closing month.
    if (l.closedOn) {
      while (rows.length && rows[rows.length - 1]!.ym > l.closedOn) rows.pop();
      totalInt = rows.reduce((a, x) => a + x.int, 0);
    }
    return { rows, end: rows.length ? rows[rows.length - 1]!.ym : null, closed, totalInt, start, principal: num(b.principal) };
  };
  return skipTxn ? run() : d.memo(`s:${l.id}`, run);
}

/** Owed on the EMI part at the start of month ym (after that month's part payments, before its EMI). */
export function bankOut(d: MoneyData, l: Loan, ym: YM): number {
  const b = bankOf(l);
  if (!b) return 0;
  const s = schedule(d, l);
  if (!s) return Math.max(0, num(b.principal) - loanTx(d, l.id).filter((t) => t.act === "prepay").reduce((a, t) => a + num(t.amount), 0));
  if (ym < s.start) return s.principal;
  const row = s.rows.find((x) => x.ym === ym);
  return row ? row.open : 0;
}

export interface OwnTotals { borrowed: Paise; repaid: Paise; out: Paise }

/** The interest-free part: what was borrowed and repaid in person. */
export function ownTotals(d: MoneyData, l: Loan): OwnTotals {
  let borrowed = 0;
  let repaid = 0;
  for (const t of loanTx(d, l.id)) {
    if (t.part === "bank") continue;
    if (t.act === "borrow") borrowed += num(t.amount);
    else if (t.act === "repay") repaid += num(t.amount);
  }
  return { borrowed, repaid, out: Math.max(0, borrowed - repaid) };
}

export interface Missed { t: Txn; ym: YM; amount: Paise; by: Txn | null }

/** Hybrid only: EMIs the relative paid for you, and which are paid back. */
export function missedInfo(d: MoneyData, l: Loan): { list: Missed[]; owed: Paise } {
  if (kindOf(l) !== "hybrid") return { list: [], owed: 0 };
  const tx = loanTx(d, l.id);
  const by = new Map<string, Txn>();
  for (const t of tx) if (t.act === "catchup") for (const id of t.covers ?? []) by.set(id, t);
  const list = tx.filter((t) => t.act === "missed")
    .map((t) => ({ t, ym: t.ym ?? "", amount: num(t.amount), by: by.get(t.id) ?? null }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
  return { list, owed: list.filter((m) => !m.by).reduce((a, m) => a + m.amount, 0) };
}

export interface LoanSum {
  k: string;
  b: BankPart | null;
  s: Schedule | null;
  bank: number;
  own: OwnTotals;
  missed: Paise;
  mi: { list: Missed[]; owed: Paise };
  out: number;
  emiNow: number;
  rateNow: number;
  end: YM | null;
  totalInt: number;
  paidInt: number;
  closedByYou?: true;
}

/** Where a loan stands this month. */
export function loanSum(d: MoneyData, l: Loan): LoanSum {
  return d.memo(`x:${l.id}`, () => {
    const now = ymOf(d.today);
    const k = kindOf(l);
    const b = bankOf(l);
    const s = schedule(d, l);
    const own = isEmiLike(k) ? { borrowed: 0, repaid: 0, out: 0 } : ownTotals(d, l);
    const bank = b ? bankOut(d, l, now) : 0;
    const row = s && (s.rows.find((x) => x.ym === now) ?? s.rows.find((x) => x.ym > now));
    const last = s && s.rows.filter((x) => x.ym <= now).pop();
    const paidInt = s ? s.rows.filter((x) => x.ym < now).reduce((a, x) => a + x.int, 0) : 0;
    const mi = missedInfo(d, l);
    if (l.closedOn && now >= l.closedOn) {
      return { k, b, s, bank: 0, own: { ...own, out: 0 }, missed: 0, mi, out: 0, emiNow: 0, rateNow: last ? last.rate : num(b?.rate),
        end: l.closedOn, totalInt: s ? s.totalInt : 0, paidInt, closedByYou: true };
    }
    const r = row || last;
    return { k, b, s, bank, own, missed: mi.owed, mi, out: bank + own.out + mi.owed, emiNow: row ? row.emi : 0,
      rateNow: r ? r.rate : num(b?.rate), end: s ? s.end : null, totalInt: s ? s.totalInt : 0, paidInt };
  });
}
