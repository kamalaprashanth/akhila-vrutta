/**
 * The main account, month-end carry-overs and the cash-flow forecast. Same rules as KP Money Planner, in paise.
 */
import { addM, lastDay, ymOf, type YM } from "./dates.ts";
import type { MoneyData, Paise } from "./data.ts";
import { accEff, balances, countsAcc, isHist, monthNet, type Account, type BalTxn } from "./accounts.ts";
import { paidMap, planned, type PlanItem } from "./plan.ts";

/** The account the month-end balance and carry-overs follow: marked main, else "HDFC", else the first bank. */
export function mainAcc(d: MoneyData): Account | null {
  const b = d.live<Account & { main?: boolean }>("accounts").filter((a) => a.type !== "card" && countsAcc(a));
  return b.find((a) => a.main) ?? b.find((a) => /^hdfc$/i.test(String(a.name).trim())) ?? b.find((a) => a.type === "bank") ?? null;
}

/**
 * Carry-over pairs still to be made: on the 1st, the main account's net for the month just ended is carried as
 * "Carried to next month" (last day) and "Last month balance" (the 1st). The pair nets to zero on the balance.
 * Ids are fixed per account and month, and a pair that was ever made (even deleted) is never made again.
 * Covers at most the last 12 months.
 */
export function carriesToMake(d: MoneyData, allTxnIds: Set<string>): BalTxn[] {
  const m = mainAcc(d);
  if (!m) return [];
  const now = ymOf(d.today);
  const touched = d.live<BalTxn>("txns")
    .filter((t) => !isHist(t) && accEff(m.id, t) !== 0 && t.type !== "carry")
    .map((t) => ymOf(t.date ?? "")).sort();
  if (!touched.length) return [];
  const out: BalTxn[] = [];
  // Each new pair's "Last month balance" lands on the 1st of the next month and counts in that month's net,
  // so carries roll forward month by month, exactly as when the planner made them one at a time.
  const carriedIn = new Map<YM, Paise>();
  let ym = touched[0]! < addM(now, -12) ? addM(now, -12) : touched[0]!;
  for (; ym < now; ym = addM(ym, 1)) {
    const oid = `carry-out-${m.id}-${ym}`;
    if (allTxnIds.has(oid)) continue;
    const net = Math.round(monthNet(d, m.id, ym, true) + (carriedIn.get(ym) ?? 0));
    if (Math.abs(net) < 0.5) continue;
    const nx = addM(ym, 1);
    carriedIn.set(nx, (carriedIn.get(nx) ?? 0) + net);
    out.push({ id: oid, type: "carry", dir: "out", accountId: m.id, ym, carry: net, amount: Math.abs(net), date: lastDay(ym), note: "" } as BalTxn);
    out.push({ id: `carry-in-${m.id}-${ym}`, type: "carry", dir: "in", accountId: m.id, ym, carry: net, amount: Math.abs(net), date: `${nx}-01`, note: "" } as BalTxn);
  }
  return out;
}

export interface ForecastRow extends PlanItem { paid: boolean; missed: boolean }
export interface ForecastMonth {
  ym: YM;
  rows: ForecastRow[];
  inc: Paise;
  out: Paise;
  inv: Paise;
  emi: Paise;
  net: Paise;
  /** all counted accounts together at the end of the month */
  bal: Paise;
  ending: ForecastRow[];
}

/** The next h months: what comes in and goes out, and where the counted accounts end up. */
export function forecast(d: MoneyData, h: number): { months: ForecastMonth[]; start: Paise } {
  const now = ymOf(d.today);
  const paid = paidMap(d);
  const bal = balances(d);
  const start = d.live<Account>("accounts").filter(countsAcc).reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);
  let run = start;
  const months: ForecastMonth[] = [];
  for (let i = 0; i < h; i++) {
    const ym = addM(now, i);
    let inc = 0, out = 0, inv = 0, emi = 0;
    const rows: ForecastRow[] = planned(d, ym).map((it) => {
      const p = paid.get(it.key) as (BalTxn & { act?: string }) | undefined;
      return { ...it, paid: !!p || !!it.paidC, missed: !!(p && p.act === "missed") };
    });
    for (const it of rows) {
      if (i === 0 && it.paid) continue; // already in this month's balance
      if (it.type === "transfer") {
        const fa = it.accountId ? d.byId<Account>("accounts", it.accountId) : undefined;
        const ta = it.toAccountId ? d.byId<Account>("accounts", it.toAccountId) : undefined;
        run += (ta && countsAcc(ta) ? it.amount : 0) - (fa && countsAcc(fa) ? it.amount : 0);
        continue;
      }
      if (it.type === "income") inc += it.amount;
      else if (it.type === "investment") inv += it.amount;
      else { out += it.amount; if (it.src === "l") emi += it.amount; }
    }
    run += inc - out - inv;
    months.push({ ym, rows, inc, out, inv, emi, net: inc - out - inv, bal: run, ending: rows.filter((r) => r.ends) });
  }
  return { months, start };
}

