/**
 * What's planned for a month: regular payments and income, budgets, loan EMIs, planned family repayments,
 * card bills and card EMIs. Same rules as KP Money Planner, in paise.
 */
import { addM, dayIn, dLabel, diffM, pad, ymOf, type Day, type YM } from "./dates.ts";
import { num, type Loan, type MoneyData, type Paise, type Rec, type Txn } from "./data.ts";
import { bankOf, kindOf, ownTotals, schedule, isEmiLike } from "./loans.ts";
import { balances, cardEff, cardInfo, cardTx, countsAcc, dueOf, stmtFor, type Account } from "./accounts.ts";

/* ---------- names ---------- */

interface Category extends Rec { name?: string; kind?: string; parentId?: string | null }

const catParent = (d: MoneyData, c: Category | undefined): Category | null | undefined =>
  c && c.parentId ? d.byId<Category>("categories", c.parentId) : null;

export function catName(d: MoneyData, id: string | undefined | null): string {
  const c = id ? d.byId<Category>("categories", id) : undefined;
  if (!c) return "Uncategorised";
  const p = catParent(d, c);
  return p && !p.deleted ? `${p.name} › ${c.name}` : String(c.name);
}
export function catTop(d: MoneyData, id: string): string {
  const p = catParent(d, d.byId<Category>("categories", id));
  return p && !p.deleted ? p.id : id;
}
export const accName = (d: MoneyData, id: string | undefined | null): string => (id && d.byId<Account>("accounts", id)?.name) || "—";

/** "5 Nov", with the year when it isn't this year. */
export const fmtD = (d: MoneyData, day: Day): string => `${dLabel(day)}${day.slice(0, 4) !== d.today.slice(0, 4) ? " " + day.slice(0, 4) : ""}`;
export const rateTxt = (r: unknown): string => String(Math.round(num(r) * 100) / 100);

/** First expense category with one of these names (case-insensitive), in order of preference. */
export function catByName(d: MoneyData, ...names: string[]): string | null {
  for (const n of names) {
    const c = d.live<Category>("categories").find((x) => x.kind === "expense" && String(x.name).toLowerCase() === n.toLowerCase());
    if (c) return c.id;
  }
  return null;
}

/* ---------- regular items ---------- */

export const FREQ: Record<string, number> = { monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12, biennial: 24, triennial: 36, once: 0 };

export interface Recurring extends Rec {
  name?: string;
  type?: string;
  amount?: Paise;
  start: YM;
  end?: YM | null;
  freq?: string;
  day?: number;
  shift?: string;
  ov?: Record<YM, Paise>;
  budget?: boolean;
  categoryId?: string;
  accountId?: string;
  toAccountId?: string;
  invType?: string;
  charges?: Paise | "" | null;
}

/** Whether a regular item falls in month ym. */
export function recurs(r: Recurring, ym: YM): boolean {
  if (ym < r.start) return false;
  if (r.end && ym > r.end) return false;
  const step = FREQ[r.freq ?? ""];
  if (!step) return ym === r.start;
  return diffM(r.start, ym) % step === 0;
}

/** NSE equity holidays on weekdays (the year's official list); more can be added in Plan › Cash flow. */
export const NSE_HOL = new Set(["2026-01-15", "2026-01-26", "2026-03-03", "2026-03-26", "2026-03-31", "2026-04-03", "2026-04-14", "2026-05-01",
  "2026-05-28", "2026-06-26", "2026-09-14", "2026-10-02", "2026-10-20", "2026-11-10", "2026-11-24", "2026-12-25"]);

interface AppSettings extends Rec { holidays?: Day[] }
const appSet = (d: MoneyData): AppSettings => d.byId<AppSettings>("settings", "app") ?? { id: "app" };
export const isHoliday = (d: MoneyData, day: Day): boolean => NSE_HOL.has(day) || (appSet(d).holidays ?? []).includes(day);
export function isTradingDay(d: MoneyData, day: Day): boolean {
  const g = new Date(`${day}T00:00`).getDay();
  return g !== 0 && g !== 6 && !isHoliday(d, day);
}
export function nextTrading(d: MoneyData, day: Day): Day {
  let x = day;
  let n = 0;
  while (!isTradingDay(d, x) && n++ < 10) {
    const y = new Date(`${x}T00:00`);
    y.setDate(y.getDate() + 1);
    x = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
  }
  return x;
}

/** The day a regular item falls on in a month, moved to the next trading day when it asks for that. */
export function recDay(d: MoneyData, r: Recurring, ym: YM): number | null {
  if (!r.day) return null;
  if (r.shift !== "trading") return r.day;
  const x = nextTrading(d, dayIn(Number(ym.slice(0, 4)), Number(ym.slice(5)), r.day));
  return x.slice(0, 7) === ym ? Number(x.slice(8)) : r.day;
}

interface BudgetTxn extends Txn { budgetId?: string; link?: string }

/** Spending tagged to a budget in month ym. */
export const budgetSpent = (d: MoneyData, id: string, ym: YM): Paise =>
  d.memo(`b:${id}|${ym}`, () => d.live<BudgetTxn>("txns")
    .filter((t) => t.budgetId === id && ymOf(t.date ?? "") === ym && (t.type === "expense" || t.type === "transfer"))
    .reduce((s, t) => s + num(t.amount), 0));

export const activeBudgets = (d: MoneyData, ym: YM): Recurring[] =>
  d.live<Recurring>("recurring").filter((r) => r.budget && r.type === "expense" && recurs(r, ym));

/** Mutual-fund stamp duty: 0.005% of the amount. */
export const stampDuty = (amt: Paise): Paise => Math.round(num(amt) * 0.00005);
/** Charges on a SIP: what's set on it, else stamp duty for mutual funds. */
export const sipChg = (r: Recurring | undefined, amt: Paise): Paise =>
  r && r.charges != null && r.charges !== "" ? Math.max(0, num(r.charges)) : r && r.invType === "Mutual Fund" ? stampDuty(amt) : 0;

/** Transactions that settle a plan item, by its key. */
export const paidMap = (d: MoneyData): Map<string, BudgetTxn> => d.memo("paidMap", () => {
  const m = new Map<string, BudgetTxn>();
  for (const t of d.live<BudgetTxn>("txns")) if (t.link) m.set(t.link, t);
  return m;
});

/* ---------- loans in the plan ---------- */

export interface FamPlanItem { ym: YM; key: string; amount: Paise; plan: NonNullable<Loan["plans"]>[number] }

/** Planned interest-free repayments, capped so they stop once the own-money part is cleared. */
export function famPlan(d: MoneyData, l: Loan): FamPlanItem[] {
  if (isEmiLike(kindOf(l)) || !(l.plans ?? []).length || l.closedOn) return [];
  return d.memo(`p:${l.id}`, () => {
    const now = ymOf(d.today);
    const paid = paidMap(d);
    const out: FamPlanItem[] = [];
    let rem = ownTotals(d, l).out;
    const plans = l.plans ?? [];
    for (let i = 0; i < 120; i++) {
      const ym = addM(now, i);
      for (const p of plans) {
        const hit = p.freq === "monthly" ? ym >= p.start && (!p.end || ym <= p.end) : ym === p.start;
        if (!hit) continue;
        const key = `p:${l.id}:${p.id}|${ym}`;
        const pd = paid.get(key);
        if (pd) { out.push({ ym, key, amount: num(pd.amount), plan: p }); continue; }
        if (rem <= 50) continue;
        const amt = Math.min(num(p.amount), rem);
        rem -= amt;
        out.push({ ym, key, amount: amt, plan: p });
      }
      if (rem <= 50 && !plans.some((p) => p.freq === "monthly" && (!p.end || p.end > ym))) break;
    }
    return out;
  });
}

/* ---------- card EMIs ---------- */

interface CardEmiLoan extends Loan { accountId?: string; categoryId?: string; gstRate?: number; fee?: Paise; postFrom?: Day; name?: string }

export interface CemiPart { ym: YM; stmt: Day; k: number; n: number; prin: Paise; intg: Paise; fee: Paise }

/** Each card-EMI statement: principal, interest + GST, and (first time) the processing fee + GST. */
export function cemiParts(d: MoneyData, l: CardEmiLoan): CemiPart[] {
  const a = l.accountId ? d.byId<Account>("accounts", l.accountId) : undefined;
  const sd = num(a?.stmtDay) || 1;
  const s = schedule(d, l);
  const g = (l.gstRate ?? 18) / 100;
  if (!s) return [];
  return s.rows.map((r) => {
    const [y, m] = r.ym.split("-").map(Number);
    return { ym: r.ym, stmt: dayIn(y ?? 0, m ?? 0, sd), k: r.k, n: s.rows.length,
      prin: Math.round(r.prin), intg: Math.round(r.int * (1 + g)), fee: r.k === 1 ? Math.round(num(l.fee) * (1 + g)) : 0 };
  });
}

export interface CemiDue { l: CardEmiLoan; card: string; cat: string | null | undefined; v: Paise }

/** Card-EMI amounts not yet posted whose bill is due in month ym. */
export function cemiDue(d: MoneyData, ym: YM): CemiDue[] {
  const out: CemiDue[] = [];
  const intCat = catByName(d, "Interest Charges", "Fees & Charges", "Fees, legal & tax");
  const feeCat = catByName(d, "Service Charges", "Fees & Charges", "Fees, legal & tax");
  for (const l of d.live<CardEmiLoan>("loans")) {
    if (kindOf(l) !== "cardemi" || !l.accountId) continue;
    const a = d.byId<Account>("accounts", l.accountId);
    if (!a) continue;
    for (const p of cemiParts(d, l)) {
      if (!(p.stmt > d.today && ymOf(dueOf(a, p.stmt)) === ym)) continue;
      out.push({ l, card: a.id, cat: l.categoryId, v: p.prin });
      if (p.intg > 0.5) out.push({ l, card: a.id, cat: intCat, v: p.intg });
      if (p.fee > 0.5) out.push({ l, card: a.id, cat: feeCat, v: p.fee });
    }
  }
  return out;
}

/** Card-EMI amounts still to be posted on a card for statement date st. */
export function cemiFuture(d: MoneyData, cardId: string, st: Day): Paise {
  let v = 0;
  for (const l of d.live<CardEmiLoan>("loans")) {
    if (kindOf(l) !== "cardemi" || l.accountId !== cardId) continue;
    for (const p of cemiParts(d, l)) if (p.stmt === st && p.stmt > d.today) v += p.prin + p.intg + p.fee;
  }
  return v;
}

/* ---------- plan items ---------- */

export interface PlanItem {
  key: string;
  /** r regular, b budget, l loan EMI, p planned repayment, c card bill */
  src: "r" | "b" | "l" | "p" | "c";
  id: string;
  name: string;
  type: string;
  amount: Paise;
  day: number | null;
  ends: boolean;
  accountId?: string | null;
  categoryId?: string | null;
  changed?: boolean;
  budget?: Paise;
  spent?: Paise;
  moved?: number;
  chg?: Paise;
  toAccountId?: string;
  sub?: string;
  canMiss?: boolean;
  paidC?: boolean;
}

/** Card bills due in month ym: generated bills show what's left; the next statement shows what's built up so far. */
export function cardBills(d: MoneyData, ym: YM): PlanItem[] {
  const td = d.today;
  const out: PlanItem[] = [];
  for (const a of d.live<Account>("accounts")) {
    if (a.type !== "card" || !(num(a.stmtDay) >= 1) || !countsAcc(a)) continue;
    let [y, m] = ym.split("-").map(Number) as [number, number];
    if (num(a.dueDay) && num(a.dueDay) <= num(a.stmtDay)) { m--; if (m < 1) { m = 12; y--; } }
    const c = cardInfo(d, a);
    // In the current month, also carry an unpaid bill whose due date has already passed.
    const sts = [dayIn(y, m, num(a.stmtDay))];
    if (ym === ymOf(td)) { let py = y; let pm = m - 1; if (pm < 1) { pm = 12; py--; } sts.unshift(dayIn(py, pm, num(a.stmtDay))); }
    for (const st of sts) {
      const due = dueOf(a, st);
      const key = `c:${a.id}|${st}`;
      const overdue = st !== sts[sts.length - 1];
      if (st <= td) {
        const billed = Math.max(0, -(balances(d, st).get(a.id) ?? 0));
        if (billed < 50) continue;
        let paid = 0;
        for (const x of cardTx(d, a, st, td)) { const e = cardEff(a, x); if (e > 0) paid += e; }
        const left = Math.max(0, billed - paid);
        if (overdue && left < 50) continue;
        out.push({ key, src: "c", id: a.id, name: `${a.name} bill`, type: "expense", amount: left > 50 ? left : billed, accountId: a.payFrom || null,
          day: overdue ? 1 : num(a.dueDay) || null, ends: false, paidC: left < 50,
          sub: `Statement ${fmtD(d, st)} · ${overdue ? "overdue since" : "due"} ${fmtD(d, due)}` });
      } else {
        const sofar = c && st === c.next ? c.unbilled : 0;
        const emis = cemiFuture(d, a.id, st);
        const amt = sofar + emis;
        if (amt > 50) out.push({ key, src: "c", id: a.id, name: `${a.name} bill`, type: "expense", amount: amt, accountId: a.payFrom || null,
          day: num(a.dueDay) || null, ends: false,
          sub: `Statement ${fmtD(d, st)} · ${sofar > 50 ? "spent so far" : ""}${sofar > 50 && emis > 50 ? " + " : ""}${emis > 50 ? "card EMIs" : ""} · due ${fmtD(d, due)}` });
      }
    }
  }
  return out;
}

/** Everything planned for month ym, in day order. */
export function planned(d: MoneyData, ym: YM): PlanItem[] {
  const items: PlanItem[] = [];
  const now = ymOf(d.today);
  for (const r of d.live<Recurring>("recurring")) {
    if (!recurs(r, ym)) continue;
    const ends = r.end === ym && r.freq !== "once";
    // A per-month change: ov[ym] is that month's amount, or 0 to skip the month.
    const ov = r.ov && r.ov[ym] !== undefined ? num(r.ov[ym]) : null;
    if (ov === 0) continue;
    const base = ov !== null ? ov : num(r.amount);
    if (r.budget && r.type === "expense") {
      // A budget: spends tagged to it are already in the accounts, so only what's left still goes out.
      const spent = budgetSpent(d, r.id, ym);
      const left = Math.max(0, base - spent);
      items.push({ key: `r:${r.id}|${ym}`, src: "b", id: r.id, name: String(r.name), type: "expense", amount: ym < now ? 0 : ym === now ? left : base,
        budget: base, changed: ov !== null, spent, categoryId: r.categoryId, accountId: r.accountId, day: r.day ?? null, ends } as PlanItem);
      continue;
    }
    const day = recDay(d, r, ym);
    items.push({ key: `r:${r.id}|${ym}`, src: "r", id: r.id, name: String(r.name), type: String(r.type), amount: base, changed: ov !== null,
      categoryId: r.categoryId, accountId: r.accountId,
      ...(r.shift === "trading" && r.day && day !== r.day ? { moved: r.day } : {}),
      ...(r.type === "investment" ? { chg: sipChg(r, base) } : {}),
      ...(r.type === "transfer" ? { toAccountId: r.toAccountId, sub: `${accName(d, r.accountId)} → ${accName(d, r.toAccountId)}` } : {}),
      day, ends } as PlanItem);
  }
  const emiCat = d.live<Category>("categories").find((c) => c.name === "Loan EMI")?.id;
  for (const l of d.live<Loan & { accountId?: string; day?: number; lender?: string; name?: string }>("loans")) {
    if (kindOf(l) === "cardemi") continue; // card EMIs reach the plan through the card's bill
    const s = schedule(d, l);
    const b = bankOf(l) as (ReturnType<typeof bankOf> & { accountId?: string; day?: number }) | null;
    const row = s && s.rows.find((x) => x.ym === ym);
    if (s && b && row) items.push({ key: `l:${l.id}|${ym}`, src: "l", id: l.id, name: `${l.name} EMI`, type: "expense", amount: row.emi, categoryId: emiCat,
      accountId: b.accountId, day: b.day ?? null, ends: ym === s.end, canMiss: kindOf(l) === "hybrid", sub: `EMI ${row.k} of ${s.rows.length} · ${rateTxt(row.rate)}%` } as PlanItem);
    for (const p of famPlan(d, l)) if (p.ym === ym) {
      items.push({ key: p.key, src: "p", id: l.id, name: `Repay ${l.lender || l.name}`, type: "expense", amount: p.amount,
        accountId: (p.plan as { accountId?: string }).accountId, day: null, ends: false, sub: "Planned repayment · interest-free" } as PlanItem);
    }
  }
  items.push(...cardBills(d, ym));
  return items.sort((a, b) => (a.day || 99) - (b.day || 99));
}

/**
 * Planned items as Insights counts them in month ym: a planned spend on a card counts in the month
 * its bill is due, like card transactions do.
 */
export function planFor(d: MoneyData, ym: YM): (PlanItem & { _m: YM })[] {
  const now = ymOf(d.today);
  const out: (PlanItem & { _m: YM })[] = [];
  for (let k = 2; k >= 0; k--) {
    const m = addM(ym, -k);
    if (m < now) continue;
    for (const it of planned(d, m)) {
      const a = it.type === "expense" && it.src !== "c" && it.accountId ? d.byId<Account>("accounts", it.accountId) : undefined;
      const card = !!a && a.type === "card" && num(a.stmtDay) >= 1;
      const bm = card ? ymOf(dueOf(a!, stmtFor(a!, dayIn(Number(m.slice(0, 4)), Number(m.slice(5)), it.day || 1)))) : m;
      if (bm === ym) out.push({ ...it, _m: m });
    }
  }
  return out;
}
