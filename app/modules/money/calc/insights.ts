/**
 * Month figures (income, spending by category, investing, set-aside) and the emergency fund built on them.
 * Same rules as KP Money Planner, in paise.
 *
 * Past months are actual entries; this month is entries so far plus planned items not yet paid; future months
 * are the plan. Card spends count in the month their bill is due. With a reserve account, big bills are a
 * monthly "set aside" cost, and the bill itself isn't counted again.
 */
import { addM, ymOf, type YM } from "./dates.ts";
import { num, type MoneyData, type Paise, type Rec, type Txn } from "./data.ts";
import { countsAcc, dueOf, expMonth, histCovered, openDateOf, stmtFor, type Account } from "./accounts.ts";
import { catName, catTop, cemiDue, paidMap, planFor, type Recurring } from "./plan.ts";
import { resvPaid, resvPlanned, setAsideOf } from "./reserve.ts";

interface InvTxn extends Txn { categoryId?: string; instrument?: string; charges?: Paise; paidBy?: string; dir?: string; carry?: Paise; pot?: string }
interface Category extends Rec { name?: string; kind?: string; parentId?: string | null }

/** Investment charges: the part of what you paid that didn't go into the investment. */
export const invChg = (t: InvTxn): Paise => Math.max(0, num(t.charges));
export const invNet = (t: InvTxn): Paise => num(t.amount) - invChg(t);
/** The category investment charges count under (a top-level "fees"/"charges" expense category). */
export function feeCat(d: MoneyData): string | null {
  const c = d.live<Category>("categories").find((x) => x.kind === "expense" && !x.parentId && /fees|charges/i.test(String(x.name)));
  return c ? c.id : null;
}
/** Paid by someone else: shown, but not in your totals. */
export const offBook = (t: InvTxn): boolean => !!t.paidBy;

export interface MonthFigures {
  income: Paise;
  expense: Paise;
  investment: Paise;
  kind: "actual" | "projected" | "plan";
  byCat: Map<string, Paise>;
  byInc: Map<string, Paise>;
  sub: Map<string, Map<string, Paise>>;
  byInv: Map<string, Paise>;
  setAside: Paise;
  balance: Paise;
}

export function monthFigures(d: MoneyData, ym: YM): MonthFigures {
  return d.memo(`mf:${ym}`, () => {
    const now = ymOf(d.today);
    const r: MonthFigures = { income: 0, expense: 0, investment: 0, kind: ym < now ? "actual" : ym === now ? "projected" : "plan",
      byCat: new Map(), byInc: new Map(), sub: new Map(), byInv: new Map(), setAside: 0, balance: 0 };
    const addS = (top: string, id: string, v: number): void => {
      if (!r.sub.has(top)) r.sub.set(top, new Map());
      const m = r.sub.get(top)!;
      m.set(id, (m.get(id) ?? 0) + v);
    };
    const addC = (m: Map<string, number>, k: string, v: number): void => { m.set(k, (m.get(k) ?? 0) + v); };
    const top = (id: string | null | undefined): string => (id ? catTop(d, id) : null) || "none";
    const fee = (v: number): void => { const f = feeCat(d), t = top(f); r.expense += v; addC(r.byCat, t, v); addS(t, f || "none", v); };

    for (const t of d.live<InvTxn>("txns")) {
      if ((t.type === "expense" ? expMonth(d, t) : ymOf(t.date ?? "")) !== ym) continue;
      if (offBook(t) || histCovered(d, t) || resvPaid(d, t)) continue;
      if (t.type === "expense") { r.expense += num(t.amount); addC(r.byCat, top(t.categoryId), num(t.amount)); addS(top(t.categoryId), t.categoryId || "none", num(t.amount)); }
      else if (t.type === "income") { r.income += num(t.amount); addC(r.byInc, top(t.categoryId), num(t.amount)); addS(top(t.categoryId), t.categoryId || "none", num(t.amount)); }
      else if (t.type === "investment") { r.investment += invNet(t); addC(r.byInv, t.instrument || "Investment", invNet(t)); const c = invChg(t); if (c) fee(c); }
      else if (t.type === "carry" && t.dir === "in") { r.income += num(t.carry); addC(r.byInc, "carry", num(t.carry)); }
    }
    // Balances brought in from Money Manager are owed for past card spends: they count in the bill they fall into.
    for (const a of d.live<Account>("accounts")) {
      const od = openDateOf(a);
      if (a.type === "card" && countsAcc(a) && num(a.stmtDay) >= 1 && num(a.opening) < 0 && od && ymOf(dueOf(a, stmtFor(a, od))) === ym) {
        r.expense += -num(a.opening);
        addC(r.byCat, "cardopen", -num(a.opening));
      }
    }
    if (ym >= now) {
      const paid = paidMap(d);
      for (const it of planFor(d, ym)) {
        if (it.src === "c" || it.type === "transfer" || (it._m === now && paid.has(it.key)) || resvPlanned(d, it)) continue;
        const v = num(it.amount);
        if (!v) continue;
        if (it.type === "income") { r.income += v; addC(r.byInc, top(it.categoryId), v); addS(top(it.categoryId), it.categoryId || "none", v); }
        else if (it.type === "investment") {
          const c = Math.min(v, it.chg || 0);
          r.investment += v - c;
          addC(r.byInv, d.byId<Recurring & { instrument?: string }>("recurring", it.id)?.instrument || it.name, v - c);
          if (c) fee(c);
        } else {
          const t = it.src === "p" ? "repay" : top(it.categoryId);
          r.expense += v;
          addC(r.byCat, t, v);
          addS(t, it.src === "p" ? "repay" : it.categoryId || "none", v);
        }
      }
      for (const e of cemiDue(d, ym)) { const t = top(e.cat); r.expense += e.v; addC(r.byCat, t, e.v); addS(t, e.cat || "none", e.v); }
    }
    r.setAside = setAsideOf(d, ym);
    r.balance = r.income - r.expense - r.investment - r.setAside;
    return r;
  });
}

/** Names for the special category keys used in figures. */
export const catLbl = (d: MoneyData, k: string): string =>
  k === "none" ? "Uncategorised" : k === "cardopen" ? "Card balances from Money Manager" : k === "repay" ? "Loan repayments"
    : k === "carry" ? "Last month balance" : k === "__other" ? "Other" : catName(d, k);

/** Average monthly spending by category over the last 12 full months. */
export function spendByCat(d: MoneyData): Map<string, number> {
  return d.memo("sbc", () => {
    const now = ymOf(d.today), cat = new Map<string, number>();
    for (let i = 1; i <= 12; i++) for (const [k, v] of monthFigures(d, addM(now, -i)).byCat) cat.set(k, (cat.get(k) ?? 0) + v / 12);
    return cat;
  });
}

interface AppSettings extends Rec { emEx?: string[]; emMonths?: number }
const appSet = (d: MoneyData): AppSettings => d.byId<AppSettings>("settings", "app") ?? { id: "app" };
const EM_OFF_DEFAULT = /^(property|investments?|loan given)$/i;

/** Categories left out of the emergency fund: your choice, else Property, Investment and Loan given. */
export function emExcluded(d: MoneyData): Set<string> {
  const s = appSet(d);
  if (Array.isArray(s.emEx)) return new Set(s.emEx);
  return new Set([...spendByCat(d).keys()].filter((k) => EM_OFF_DEFAULT.test(catLbl(d, k))));
}
/** Usual monthly spending the emergency fund covers. */
export function emBase(d: MoneyData): number {
  const ex = emExcluded(d);
  let t = 0;
  for (const [k, v] of spendByCat(d)) if (!ex.has(k)) t += v;
  return t;
}
export const emMonths = (d: MoneyData): number => num(appSet(d).emMonths) || 6;
/** Retirement: usual spending without loan EMIs and the non-living categories. */
export function retireBase(d: MoneyData): number {
  let t = 0;
  for (const [k, v] of spendByCat(d)) if (!/^(property|investments?|loan given|loan emi|loan repayments?)$/i.test(catLbl(d, k)) && k !== "repay") t += v;
  return t;
}
