/**
 * The Accounts page: net worth on top, then one section at a time (Overview · Banks & cards ·
 * Investments · Loans · Property). Same page as KP Money Planner's, built from the stored data (paise).
 */
import { esc } from "../../../core/dom.ts";
import { addM, dLabel, lastDay, mLabel, MN, mShort, ymOf, type Day, type YM } from "../calc/dates.ts";
import { num, type Loan, type MoneyData, type Paise, type Rec } from "../calc/data.ts";
import { accEff, balances, cardInfo, countsAcc, type Account, type CardInfo } from "../calc/accounts.ts";
import { bankOf, bankOut, isEmiLike, kindOf, loanSum, loanTx, schedule, type LoanSum } from "../calc/loans.ts";
import { accName, fmtD, rateTxt } from "../calc/plan.ts";
import { mainAcc } from "../calc/forecast.ts";
import { invNet, monthFigures } from "../calc/insights.ts";
import { holdingSum, netWorth, npsKey, npsLines, type Holding, type HoldingSum } from "../calc/invest.ts";
import { propCalc, propList, propNw, propNwAt, propRegd, type Property } from "../calc/properties.ts";
import { reserveState } from "../calc/reserve.ts";
import { money } from "./txlist.ts";
import { AX, chartCard, donutChart, fmtMoney, legendHtml, lineChart, barChart, mTick, mTicks, tableHtml, tipRows, topN, VC } from "./charts.ts";
import { field } from "../ui/kit.ts";
import type { Page } from "./pages.ts";
import { INV_TYPES } from "../ui/txform.ts";

/** The planner's page state this page uses (shared with the planner until it is gone). */
export interface AccState { accTab?: string; nwN?: number | "all"; allCards?: boolean }
/** Small per-device settings (shared with the planner), and fragments only the planner can draw yet. */
export interface AccHost { pref<T>(k: string, d: T): T; plannerHtml(name: string): string }

const R = (p: Paise): number => p / 100;
/** ₹1.23Cr / ₹12.34L / ₹950 (the planner's `short`). */
export const short = (p: Paise): string => { const v = Math.round(p) / 100, a = Math.abs(v), s = v < 0 ? "-" : ""; if (a >= 1e7) return s + "₹" + (a / 1e7).toFixed(2) + "Cr"; if (a >= 1e5) return s + "₹" + (a / 1e5).toFixed(2) + "L"; return money(p); };
export const rs0 = (p: Paise): string => (p < 0 ? "−" : "") + "₹" + Math.abs(Math.round(p / 100)).toLocaleString("en-IN");
export const shortR = (p: Paise): string => (Math.abs(p) >= 1e7 ? short(p) : rs0(p));
const usd = (n: number): string => "$" + (+n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const CC = ["var(--v1)", "var(--v2)", "var(--v3)", "var(--v4)", "var(--v5)"];
export const KIND_LBL: Record<string, string> = { emi: "Bank loan", family: "Family & friends", hybrid: "Hybrid", cardemi: "Card EMI" };
export const ONE_OF = ["EPF", "PPF", "NPS", "Gold", "Real estate"];
export const unitWord = (type: string | undefined, n: number): string => (type === "Gold" ? "g" : type === "US Stocks" ? (n === 1 ? "share" : "shares") : n === 1 ? "unit" : "units");
export const PROP_ST: Record<string, string> = { booked: "Booked", agreement: "Agreement", construction: "Under construction", registered: "Registered", possession: "Possession" };
export const ACC_TABS: [string, string][] = [["overview", "Overview"], ["banks", "Banks<span class=\"lgw\"> &amp; cards</span>"], ["invest", "Invest<span class=\"lgw\">ments</span>"], ["loans", "Loans"], ["props", "Property"]];
export const lastMonths = (d: MoneyData, n: number, end: YM = ymOf(d.today)): YM[] => Array.from({ length: n }, (_, i) => addM(end, i - n + 1));

interface Acc extends Account { hidden?: boolean; noTotal?: boolean; main?: boolean; reserve?: boolean; limit?: Paise; stmtDay?: number; dueDay?: number }
type LoanX = [Loan & { name?: string; lender?: string; plans?: { freq?: string; end?: YM; amount?: Paise }[] }, LoanSum];
export const isClosed = (d: MoneyData, l: Loan, x: LoanSum): boolean =>
  !!l.closedOn || (x.out <= 50 && (x.k === "family" ? x.own.borrowed > 0 : true) && !(x.s && x.s.rows.some((r) => r.ym >= ymOf(d.today))));

/* ---------- cards ---------- */
export function dueText(d: MoneyData, c: CardInfo): string {
  if (c.billed < 50) return `<span class="ccmut">No bill this cycle · next statement ${fmtD(d, c.next)}</span>`;
  if (c.dueLeft < 50) return `<span class="ccok">Paid</span> · next statement ${fmtD(d, c.next)}`;
  if (!c.due || c.days == null) return `Statement ${fmtD(d, c.stmt)}`;
  if (c.days < 0) return `<span class="ccbad">Overdue by ${-c.days} day${c.days === -1 ? "" : "s"}</span> · was due ${fmtD(d, c.due)}`;
  if (c.days === 0) return `<span class="ccbad">Due today</span>`;
  return `Due ${fmtD(d, c.due)} · <span class="${c.days <= 5 ? "ccbad" : "ccsoon"}">${c.days} day${c.days === 1 ? "" : "s"} left</span>`;
}
export function cardTable(d: MoneyData, bal: Map<string, Paise>, fold: boolean, st: AccState): string {
  const cards = d.live<Acc>("accounts").filter((a) => a.type === "card" && !a.hidden);
  if (!cards.length) return "";
  const all = cards.map((a) => { const c = cardInfo(d, a), out = Math.max(0, -(bal.get(a.id) || 0)); return { a, c, pay: c ? c.dueLeft : 0, out }; });
  const quiet = all.filter((r) => r.pay <= 50 && r.out <= 50 && r.c), showAll = !fold || st.allCards || quiet.length < 2;
  const rows = showAll ? all : all.filter((r) => !quiet.includes(r)), cnt = all.filter((r) => countsAcc(r.a));
  const tp = cnt.reduce((x, r) => x + r.pay, 0), tu = cnt.reduce((x, r) => x + (r.c ? r.c.unbilled : r.out), 0), to = cnt.reduce((x, r) => x + r.out, 0);
  return `<div class="cct">
    <div class="cchd"><div class="cn">Credit cards</div><div class="cv"><div class="cl">Bill due</div><div class="${tp > 50 ? "neg" : ""}">${money(tp)}</div></div><div class="cv"><div class="cl">Unbilled</div><div>${money(tu)}</div></div></div>
    ${rows.map(({ a, c, pay, out }) => `<div class="ccr tap" data-card="${esc(a.id)}" role="button" tabindex="0"><div class="cn"><div class="t">${esc(a.name)}</div>${!c ? '<div class="s">Add statement and due day</div>' : pay > 50 ? `<div class="s">${dueText(d, c)}</div>` : ""}</div><div class="cv amt ${pay > 50 ? "neg" : ""}">${money(pay)}</div><div class="cv amt mut">${money(c ? c.unbilled : out)}</div></div>`).join("")}
    <div class="ccfoot">Total owed on cards <b class="${to > 50 ? "neg" : ""}">${money(to)}</b> <span class="mut">· bill due + unbilled</span></div>
    ${fold && quiet.length >= 2 ? `<button class="ccmore" type="button" id="moreCards">${st.allCards ? "Hide cards with nothing due" : `${quiet.length} more cards with nothing due ›`}</button>` : ""}
  </div>`;
}
function cardCharts(d: MoneyData, bal: Map<string, Paise>): string {
  const cards = d.live<Acc>("accounts").filter((a) => a.type === "card" && !a.hidden);
  if (!cards.length) return "";
  const M = lastMonths(d, 6), idx = new Map(M.map((m, i) => [m, i])), per = new Map(cards.map((a) => [a.id, M.map(() => 0)]));
  for (const t of d.live<Rec & { type?: string; accountId?: string; date?: Day; amount?: Paise }>("txns")) if (t.type === "expense" && per.has(t.accountId!)) { const i = idx.get(ymOf(t.date ?? "")); if (i != null) per.get(t.accountId!)![i]! += num(t.amount) / 100; }
  const ranked = cards.map((a) => [a, per.get(a.id)!.reduce((x, y) => x + y, 0)] as [Acc, number]).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]);
  const ser = ranked.slice(0, 5).map(([a], i) => ({ name: String(a.name), color: VC[i]!, values: per.get(a.id)! as (number | null)[] }));
  if (ranked.length > 5) { const rest = ranked.slice(5); ser.push({ name: "Other cards", color: "var(--vO)", values: M.map((_, i) => rest.reduce((s, [a]) => s + per.get(a.id)![i]!, 0)) }); }
  const spend = ser.length ? chartCard("Card spending by month", "by spend date", barChart({
    labels: M.map(mShort), ticks: M.map(mTick), full: M.map(mLabel), series: ser, stack: true, h: 200, aria: "Spending on each card by month",
    tip: (i) => tipRows(ser.filter((s) => s.values[i]! > 0.5).map((s) => ({ n: s.name, c: s.color, v: fmtMoney(s.values[i]!) })), mLabel(M[i]!), `Total ${fmtMoney(ser.reduce((a, s) => a + s.values[i]!, 0))}`),
  }), legendHtml(ser) + tableHtml(M.map(mLabel), ser, fmtMoney, true)) : "";
  const lim = cards.filter((a) => num(a.limit) > 0).map((a) => { const o = Math.max(0, -(bal.get(a.id) || 0)); return { a, o, l: num(a.limit), p: o / num(a.limit) * 100 }; }).sort((x, y) => y.p - x.p);
  const tl = lim.reduce((s, x) => s + x.l, 0), to = lim.reduce((s, x) => s + x.o, 0);
  const util = lim.length ? `<div class="sh"><h3>Credit used</h3><span class="note" style="margin:0">${(to / tl * 100).toFixed(0)}% of ${short(tl)} across ${lim.length} card${lim.length === 1 ? "" : "s"}</span></div>
    <div class="list">${lim.map((x) => { const s2 = x.p >= 75 ? "bad" : x.p >= 30 ? "warn" : ""; return `<div class="row tap" data-card="${esc(x.a.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(x.a.name)}</div><div class="s">${money(x.o)} of ${money(x.l)} · ${money(Math.max(0, x.l - x.o))} available${s2 === "bad" ? " · high" : ""}</div><div class="pbar ${s2}"><i style="width:${Math.min(100, x.p).toFixed(1)}%"></i><span class="mk" style="left:30%" title="30%"></span></div></div><div class="amt">${x.p.toFixed(0)}%</div></div>`; }).join("")}</div>
    <p class="note">Keeping each card under 30% (the mark on each bar) is generally better for your credit score.</p>` : `<p class="note">Add each card's credit limit (Edit card) to see how much of it you're using.</p>`;
  return spend + util;
}

/* ---------- net worth over time ---------- */
interface NwPoint { ym: YM; total: Paise; banks: Paise; inv: Paise; prop: Paise; cards: Paise; loans: Paise; est: boolean; live?: boolean }
interface Snap extends Rec { ym: YM; total?: Paise; banks?: Paise; inv?: Paise; prop?: Paise; cards?: Paise; loans?: Paise }
type T0 = Rec & { type?: string; date?: Day; paidBy?: string; instrument?: string; amount?: Paise; act?: string; part?: string };
export function nwHistory(d: MoneyData): NwPoint[] {
  return d.memo("nwh", () => {
    const now = ymOf(d.today), snaps = new Map(d.live<Snap>("snaps").map((s) => [s.ym, s]));
    const tx = d.live<T0>("txns").filter((t) => !t.paidBy && t.type !== "carry").sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const first = tx.length ? ymOf(tx[tx.length - 1]!.date ?? "") : now, start = [first, addM(now, -60)].sort()[1]!;
    const accs = d.live<Acc>("accounts").filter(countsAcc), bal = balances(d), cur = new Map(accs.map((a) => [a.id, bal.get(a.id) || 0]));
    const H = d.live<Holding>("holdings").filter((h) => !h.excludeNW).map((h) => ({ h, x: holdingSum(d, h), k: String(h.instrument || h.name).trim().toLowerCase(), inv: 0 }));
    for (const z of H) z.inv = z.x.inv;
    const out: NwPoint[] = [];
    let j = 0;
    const nw = netWorth(d);
    out.push({ ym: now, total: nw.total, banks: nw.banks, inv: nw.inv, prop: nw.prop, cards: nw.cards, loans: nw.loans, est: false, live: true });
    for (let ym = addM(now, -1); ym >= start; ym = addM(ym, -1)) {
      const end = lastDay(ym);
      while (j < tx.length && (tx[j]!.date ?? "") > end) {
        const t = tx[j++]!;
        for (const a of accs) { const e = accEff(a.id, t as Parameters<typeof accEff>[1]); if (e) cur.set(a.id, cur.get(a.id)! - e); }
        if (t.type === "investment") { const k = String(t.instrument || "").trim().toLowerCase(); for (const z of H) if (z.k === k) z.inv -= invNet(t); }
      }
      const s = snaps.get(ym);
      if (s) { out.push({ ym, total: num(s.total), banks: num(s.banks), inv: num(s.inv), prop: num(s.prop), cards: num(s.cards), loans: num(s.loans), est: false }); continue; }
      let banks = 0, cards = 0;
      for (const a of accs) { const v = cur.get(a.id)!; if (a.type === "card") cards += Math.max(0, -v); else banks += v; }
      let inv = 0;
      for (const z of H) { const hp = (z.h.history ?? []).filter((p) => (p.date ?? "") <= end).pop(); inv += hp ? num(hp.value) : z.x.inv > 0 ? Math.max(0, z.inv) * (z.x.value / z.x.inv) : z.x.value; }
      let loans = 0;
      for (const l of d.live<Loan>("loans")) {
        if (l.closedOn && l.closedOn <= ym) continue;
        const b = bankOf(l), sc = schedule(d, l), nx = addM(ym, 1);
        if (b && sc) loans += bankOut(d, l, nx);
        if (!isEmiLike(kindOf(l))) {
          const lt = loanTx(d, l.id).filter((t) => t.part !== "bank"), f0 = lt.map((t) => t.date ?? "").sort()[0], upto = f0 && end < f0 ? f0 : end;
          let o2 = 0;
          for (const t of lt) if ((t.date ?? "") <= upto) { if (t.act === "borrow") o2 += num(t.amount); else if (t.act === "repay") o2 -= num(t.amount); }
          loans += Math.max(0, o2);
        }
      }
      const prop = propList(d).reduce((a, p) => a + propNwAt(d, p, end), 0);
      out.push({ ym, total: banks + inv + prop - cards - loans, banks, inv, prop, cards, loans, est: true });
    }
    return out.reverse();
  });
}
function nwChart(d: MoneyData, st: AccState): string {
  const all = nwHistory(d);
  if (all.length < 2) return "";
  const N = st.nwN || 24, P = N === "all" ? all : all.slice(-N), lbl = P.map((p) => mShort(p.ym)), last = P[P.length - 1]!, prev = P[P.length - 2];
  const firstReal = P.findIndex((p) => !p.est), dashTo = firstReal < 0 ? P.length - 1 : firstReal;
  const ch = prev ? last.total - prev.total : 0;
  const tip = (i: number): string => { const p = P[i]!; return tipRows([{ n: "Banks", v: money(p.banks) }, { n: "Investments", v: money(p.inv) }, ...(p.prop > 50 ? [{ n: "Property", v: money(p.prop) }] : []), { n: "Card bills", v: "−" + money(p.cards) }, { n: "Loans", v: "−" + money(p.loans) }, { n: "Net worth", v: `<span style="font-weight:800">${money(p.total)}</span>` }], mLabel(p.ym) + (p.live ? " (month-end)" : ""), p.est ? "Estimated from your entries" : p.live ? "Live: this month's projected month-end" : "Saved snapshot"); };
  const sel = `<div class="chsel"><div class="pills" role="group" aria-label="Range">${([[12, "1 year"], [24, "2 years"], ["all", "All"]] as [number | "all", string][]).map(([v, l]) => `<button type="button" data-nwn="${v}" aria-pressed="${N === v}">${l}</button>`).join("")}</div></div>`;
  const ser = [{ name: "Net worth", color: "var(--v1)", values: P.map((p) => R(p.total)), dashTo: dashTo > 0 ? dashTo : null, width: 2.5 }];
  return `<div class="sh"><h3>Net worth over time</h3><span class="note" style="margin:0">${prev ? `${ch >= 0 ? "+" : "−"}${money(Math.abs(ch))} vs ${MN[+prev.ym.slice(5) - 1]}` : ""}</span></div>` +
    chartCard("", "", sel + lineChart({ labels: lbl, ticks: mTicks(P.map((p) => p.ym)), series: ser, area: 0, h: 200, zero: false, tip, aria: `Net worth by month, now ${money(last.total)}` }),
      `${dashTo > 0 ? `<div class="legend"><span><i class="dash"></i>Estimated</span><span><i style="background:var(--v1)"></i>Saved each month from now on</span></div>` : ""}<p class="cnote">Saved automatically once a day; each month keeps its last figure. Earlier months are worked back from your entries: bank and card balances exactly, investments roughly (scaled from what you'd invested then), and loans from their schedules or as owed when you added them. Treat them as a guide.</p>` +
      tableHtml(P.map((p) => mLabel(p.ym) + (p.est ? " (est.)" : "")), [{ name: "Banks", values: P.map((p) => R(p.banks)) }, { name: "Investments", values: P.map((p) => R(p.inv)) }, ...(P.some((p) => p.prop > 50) ? [{ name: "Property", values: P.map((p) => R(p.prop || 0)) }] : []), { name: "Card bills", values: P.map((p) => R(p.cards)) }, { name: "Loans", values: P.map((p) => R(p.loans)) }, { name: "Net worth", values: P.map((p) => R(p.total)) }]));
}

/* ---------- sections ---------- */
function accOverview(d: MoneyData, bal: Map<string, Paise>, nw: ReturnType<typeof netWorth>, st: AccState): string {
  const banks = d.live<Acc>("accounts").filter((a) => a.type !== "card" && !a.hidden), bankNow = banks.filter(countsAcc).reduce((x, a) => x + (bal.get(a.id) || 0), 0);
  const cards = d.live<Acc>("accounts").filter((a) => a.type === "card" && countsAcc(a)).map((a) => { const c = cardInfo(d, a); return { a, c, pay: c ? c.dueLeft : 0, out: Math.max(0, -(bal.get(a.id) || 0)) }; });
  const cardOut = cards.reduce((x, r) => x + r.out, 0), withDue = cards.filter((r) => r.out > 50).length;
  const H = d.live<Holding>("holdings").map((h) => [h, holdingSum(d, h)] as [Holding, HoldingSum]), inv = H.filter(([h]) => !h.excludeNW).reduce((a, [, x]) => ({ v: a.v + x.value, i: a.i + x.inv }), { v: 0, i: 0 });
  const loans = d.live<LoanX[0]>("loans").map((l) => [l, loanSum(d, l)] as LoanX).filter(([l, x]) => !isClosed(d, l, x)), lo = loans.reduce((x, [, y]) => x + y.out, 0), emi = loans.reduce((x, [, y]) => x + (num(y.emiNow) || 0), 0);
  const gl = inv.v - inv.i, pct = inv.i > 0 ? gl / inv.i * 100 : 0;
  const tile = (k: string, label: string, v: string, sub: string, cls = ""): string => `<button class="acct" type="button" data-acct="${k}"><span class="acct-k">${label}</span><span class="acct-v ${cls}">${v}</span><span class="acct-s">${sub}</span></button>`;
  const tiles = `<div class="accts">
    ${tile("banks", "Bank balances today", money(bankNow), `Month-end ${money(nw.banks)}`)}
    ${tile("invest", "Investments", money(inv.v), H.length ? `<span class="${gl < -50 ? "neg" : "in"}">${gl >= 0 ? "+" : "−"}${money(Math.abs(gl))} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)</span>` : "Add your holdings")}
    ${tile("banks", "Credit cards", money(cardOut), withDue ? `${withDue} card${withDue === 1 ? "" : "s"} with a balance` : "Nothing due", cardOut > 50 ? "neg" : "")}
    ${tile("loans", `Loans${loans.length ? ` · ${loans.length} open` : ""}`, short(lo), loans.length ? (emi > 50 ? `EMIs ${money(emi)}/mo` : "No EMIs") : "No open loans")}
  </div>`;
  /* where the money sits: banks + each investment type */
  const parts: [string, Paise][] = [["Banks", Math.max(0, nw.banks)]];
  for (const ty of INV_TYPES) { const v = H.filter(([h]) => h.type === ty && !h.excludeNW).reduce((a, [, x]) => a + x.value, 0); if (v > 50) parts.push([ty, v]); }
  if (nw.prop > 50) parts.push(["Property", nw.prop]);
  const tot = parts.reduce((a, [, v]) => a + v, 0), COL = [...VC, "var(--vO)", "var(--vO)"];
  const alloc = tot > 0 ? `<div class="sh"><h3>Where your money is</h3></div><div class="card">
    <div class="stack" style="margin-top:0;height:10px">${parts.map(([n, v], i) => `<i style="flex:${(v / tot).toFixed(4)};background:${COL[i % COL.length]}" title="${esc(n)}"></i>`).join("")}</div>
    <div class="alloc">${parts.map(([n, v], i) => `<div><span class="ad" style="background:${COL[i % COL.length]}"></span><span class="an">${esc(n)}</span><span class="ap">${(v / tot * 100).toFixed(0)}%</span><span class="av">${money(v)}</span></div>`).join("")}</div></div>` : "";
  /* things to look at */
  const todo: string[] = [];
  const stale = H.filter(([, x]) => x.age === null || x.age > 31 || x.fxMissing);
  if (stale.length) todo.push(`<div class="row tap" data-acct="invest" role="button" tabindex="0"><div class="main"><div class="t">Update ${stale.length} investment value${stale.length === 1 ? "" : "s"}</div><div class="s">${esc(stale.slice(0, 3).map(([h]) => h.name).join(", "))}${stale.length > 3 ? "…" : ""} · older than a month or not set</div></div><span class="pill warn">Update</span></div>`);
  for (const r of cards) if (r.c && r.pay > 50) { const days = Math.round((+new Date(r.c.due + "T00:00") - +new Date(d.today + "T00:00")) / 864e5); if (days <= 7) todo.push(`<div class="row tap" data-card="${esc(r.a.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(r.a.name)} bill due ${days < 0 ? "overdue" : days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}</div><div class="s">Due ${fmtD(d, r.c.due!)}</div></div><div class="amt neg">${money(r.pay)}</div></div>`); }
  for (const [l, x] of loans) if (x.missed > 50) todo.push(`<div class="row tap" data-loan="${esc(l.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(l.name)}: missed EMIs to repay</div><div class="s">Paid by the relative for you</div></div><div class="amt">${money(x.missed)}</div></div>`);
  return tiles + nwChart(d, st) + alloc + (todo.length ? `<div class="sh"><h3>Needs a look</h3></div><div class="list">${todo.join("")}</div>` : "");
}
function resvSplit(d: MoneyData): string {
  const st = reserveState(d);
  if (!st.a) return "";
  const parts = [`Big bills ${money(st.held)}`, ...st.funds.filter((f) => f.have > 50).map((f) => `${esc(f.p.name)} fund ${money(f.have)}`), `Emergency ${money(st.emergency)}`];
  return `<div class="s">${parts.join(" · ")}</div>`;
}
const ACC_LBL: Record<string, string> = { bank: "Bank", card: "Credit card", cash: "Cash", wallet: "Wallet", invest: "Investment account", loan: "Loan / person" };
function accBanks(d: MoneyData, bal: Map<string, Paise>, st: AccState): string {
  const accs = d.live<Acc>("accounts"), banks = accs.filter((a) => a.type !== "card" && !a.hidden), tot = banks.filter(countsAcc).reduce((x, a) => x + (bal.get(a.id) || 0), 0);
  const arow = (a: Acc): string => `<div class="row tap" ${a.type === "card" && !a.hidden ? `data-card="${esc(a.id)}"` : `data-acc="${esc(a.id)}"`} role="button" tabindex="0"><div class="main"><div class="t">${esc(a.name)}${a.hidden ? ' <span class="chip mute">Hidden</span>' : a.noTotal ? ' <span class="chip mute">Not in totals</span>' : ""}</div><div class="s">${ACC_LBL[String(a.type)]} · started at ${money(num(a.opening))}${a.type === "card" ? (a.stmtDay ? ` · statement day ${a.stmtDay}${a.dueDay ? `, due day ${a.dueDay}` : ""}` : " · add statement and due day") : ""}</div></div><div class="amt ${(bal.get(a.id) || 0) < 0 ? "neg" : ""}">${money(bal.get(a.id) ?? 0)}</div></div>`;
  return `<div class="btns" style="margin-top:12px"><button class="btn pri" type="button" id="addAcc">+ Add account or card</button></div>
    <div class="sh"><h3>Bank accounts · ${money(tot)}</h3></div>
    <div class="list">${banks.map((a, i) => { const v = bal.get(a.id) || 0; return `<div class="row tap" data-acc="${esc(a.id)}" role="button" tabindex="0"><span class="cdot" style="background:${CC[i % 5]}"></span><div class="main"><div class="t">${esc(a.name)}${a.main ? ' <span class="chip mute">Main</span>' : ""}${a.noTotal ? ' <span class="chip mute">Not in totals</span>' : ""}${a.reserve ? ' <span class="chip mute">Reserve</span>' : ""}</div>${a.reserve ? resvSplit(d) : ""}</div><div class="amt ${v < -50 ? "neg" : ""}">${money(v)}</div></div>`; }).join("") || '<div class="empty">No bank accounts yet.</div>'}</div>
    <p class="note">Balances as of today. Net worth uses ${esc(mainAcc(d)?.name || "your main account")}'s month-end balance instead. Tap an account to edit it.</p>
    <div class="sh"><h3>Credit cards</h3></div>${cardTable(d, bal, true, st) || '<div class="list"><div class="empty">No credit cards.</div></div>'}
    <p class="note">Each card is its own account with its statement and due day. Log card purchases against the card, and record the bill payment as a transfer from your bank to the card, so spending isn't counted twice.</p>
    <div style="height:8px"></div>${cardCharts(d, bal)}
  ${accs.some((a) => a.hidden) ? `<details class="fm" style="margin-top:14px"><summary><span class="mn">Hidden accounts</span><span class="sub" style="text-align:right">${accs.filter((a) => a.hidden).length}</span></summary><div class="list" style="border-radius:0;box-shadow:none">${accs.filter((a) => a.hidden).map(arow).join("")}</div></details>` : ""}`;
}

/* ---------- loans ---------- */
export function loanLine(d: MoneyData, l: LoanX[0], x: LoanSum): string {
  const b = x.b!, base = isEmiLike(x.k) ? num(b.principal) : x.k === "family" ? x.own.borrowed : num(b.principal) + x.own.borrowed;
  const pct = base > 0 ? Math.min(100, Math.max(0, (1 - x.out / base) * 100)) : 0;
  const closed = isClosed(d, l, x);
  const sub = closed ? (l.closedOn ? `Closed in ${mLabel(l.closedOn)}` : "Fully repaid")
    : x.k === "cardemi" ? `${money(x.emiNow)}/month + GST on ${esc(accName(d, String(l.accountId ?? "")))} · ends ${x.end ? mShort(x.end) : "—"}`
    : x.k === "emi" ? (x.s ? `${money(x.emiNow)}/month · ${rateTxt(x.rateNow)}% · ends ${mShort(x.end!)}` : `No fixed schedule${b.rate ? ` · ${rateTxt(b.rate)}%` : ""}`)
    : x.k === "family" ? (x.own.borrowed ? `Interest-free · borrowed ${short(x.own.borrowed)} · repaid ${short(x.own.repaid)}` : "Interest-free · nothing borrowed yet")
    : `Bank ${short(x.bank)} + own ${short(x.own.out)}${x.missed > 50 ? ` + missed EMIs ${short(x.missed)}` : ""} · EMI ${money(x.emiNow)} · ${rateTxt(x.rateNow)}%`;
  return `<div class="row tap" data-loan="${esc(l.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(l.name)} <span class="chip mute">${KIND_LBL[x.k]}</span> ${closed ? '<span class="chip good">Closed</span>' : ""}</div>
    <div class="s">${sub}${l.lender ? ` · ${esc(l.lender)}` : ""}</div>
    ${base > 0 && pct >= 0.5 ? `<div class="bar" title="${pct.toFixed(0)}% repaid"><i style="width:${pct.toFixed(1)}%"></i></div>` : ""}</div><div class="amt">${short(x.out)}<div class="s">left</div></div></div>`;
}
export function loanList(d: MoneyData, loans: LoanX[], emptyMsg: string): string {
  const open = loans.filter(([l, x]) => !isClosed(d, l, x)), closed = loans.filter(([l, x]) => isClosed(d, l, x));
  return `<div class="list" style="margin-top:12px">${open.length ? open.map(([l, x]) => loanLine(d, l, x)).join("") : `<div class="empty">${emptyMsg}</div>`}</div>
    ${closed.length ? `<details class="fm" style="margin-top:14px"><summary><span class="mn">Closed loans</span><span class="sub" style="text-align:right">${closed.length}</span></summary><div class="list" style="border-radius:0">${closed.map(([l, x]) => loanLine(d, l, x)).join("")}</div></details>` : ""}`;
}
interface PayItem { id: string; loan: LoanX[0]; name: string; bal: Paise; rate: number; min: Paise }
export function payoffLoans(d: MoneyData): PayItem[] {
  const out: PayItem[] = [];
  for (const l of d.live<LoanX[0]>("loans")) {
    const x = loanSum(d, l);
    if (isClosed(d, l, x) || x.out <= 50) continue;
    const k = x.k;
    if (isEmiLike(k) || k === "hybrid") { if (x.bank > 50) out.push({ id: l.id + ":b", loan: l, name: k === "hybrid" ? `${l.name} (bank part)` : String(l.name), bal: x.bank, rate: x.rateNow || 0, min: x.emiNow || 0 }); }
    if (!isEmiLike(k)) {
      const own = x.own.out + (x.missed || 0);
      if (own > 50) {
        const mp = (l.plans ?? []).filter((p) => p.freq === "monthly" && (!p.end || p.end >= ymOf(d.today))).reduce((a, p) => a + num(p.amount), 0);
        out.push({ id: l.id + ":o", loan: l, name: k === "hybrid" ? `${l.name} (own money${x.missed > 50 ? " + missed EMIs" : ""})` : String(l.name), bal: own, rate: 0, min: mp });
      }
    }
  }
  return out;
}
export function runPayoff(d: MoneyData, L: PayItem[], extra: Paise, lump: Paise, order: string) {
  const now = ymOf(d.today), A = L.map((x) => ({ ...x, b: x.bal, int: 0, end: null as YM | null })), tl: { ym: YM; tot: number }[] = [];
  const pri = order === "snow" ? [...A].sort((p, q) => p.b - q.b || q.rate - p.rate) : [...A].sort((p, q) => q.rate - p.rate || p.b - q.b);
  let freed = 0, oneOff = lump || 0;
  for (let i = 0; i < 480; i++) {
    const ym = addM(now, i + 1);
    let pool = (order === "none" ? 0 : extra + freed) + oneOff;
    oneOff = 0;
    for (const a of A) { if (a.b <= 50) continue; const it = a.b * a.rate / 1200; a.int += it; a.b += it; const p = Math.min(a.min, a.b); a.b -= p; }
    for (const a of pri) { if (pool <= 50) break; if (a.b <= 50) continue; const p = Math.min(pool, a.b); a.b -= p; pool -= p; }
    for (const a of A) if (a.b <= 50 && !a.end) { a.end = ym; a.b = 0; if (order !== "none") freed += a.min; }
    tl.push({ ym, tot: A.reduce((s, a) => s + a.b, 0) });
    if (A.every((a) => a.b <= 50)) break;
  }
  return { A, tl, end: A.every((a) => a.end) ? A.reduce((m, a) => (a.end! > m ? a.end! : m), "") : null, int: A.reduce((s, a) => s + a.int, 0) };
}
function payoffPanel(d: MoneyData, host: AccHost): string {
  const L = payoffLoans(d);
  if (!L.length) return "";
  const extraR = +host.pref("poExtra", 0) || 0, lumpR = +host.pref("poLump", 0) || 0, order = host.pref("poOrder", "aval");
  const base = runPayoff(d, L, 0, 0, "none"), plan = runPayoff(d, L, Math.round(extraR * 100), Math.round(lumpR * 100), order);
  const endTxt = (a: { end: YM | null }): string => (a.end ? mShort(a.end) : "not planned");
  const lastBank = (r: typeof plan.A): YM | null => r.filter((a) => a.rate > 0).reduce((m: YM | null, a) => (!a.end || !m ? null : a.end > m ? a.end : m), r.find((a) => a.rate > 0)?.end || null);
  const seq = [...plan.A].sort((p, q) => (p.end || "9999").localeCompare(q.end || "9999"));
  const span = Math.min(plan.tl.length, 360), labels = plan.tl.slice(0, span).map((t) => t.ym);
  const ser = [{ name: "Your plan", color: "var(--v1)", values: plan.tl.slice(0, span).map((t) => t.tot / 100), width: 2.5 }, { name: "EMIs only", color: "var(--vLast)", values: labels.map((_, i) => (base.tl[i] ? base.tl[i]!.tot / 100 : null)), dash: true }];
  const zeroLoans = L.filter((a) => a.rate === 0 && !(a.min > 0));
  return `<div class="sh"><h3>Payoff plan</h3><span class="note" style="margin:0">${plan.end ? `debt-free ${mLabel(plan.end)}` : ""}</span></div>
  <div class="card">
    <div class="grid2">${field(["poExtra", "Extra each month (₹)", "number", { value: extraR || "", step: "1000", ph: "e.g. 20000" }])}${field(["poLump", "One-time amount now (₹)", "number", { value: lumpR || "", step: "10000", ph: "e.g. 100000" }])}</div>
    <div class="seg" role="group" aria-label="Which loan first">${[["aval", "Highest interest first"], ["snow", "Smallest first"]].map(([k, t]) => `<button type="button" data-po="${k}" aria-pressed="${order === k}">${t}</button>`).join("")}</div>
    <p class="cnote">${order === "aval" ? "Saves the most interest: extra goes to the dearest loan; interest-free loans come last." : "Clears loans one by one fastest, which some find motivating; usually costs more interest."} When a loan is cleared, its EMI moves to the next one.</p>
    <div class="simout"><div><div class="k">Interest saved</div><div class="v in">${money(Math.max(0, base.int - plan.int))}</div></div><div><div class="k">Bank loans cleared</div><div class="v">${lastBank(plan.A) ? mShort(lastBank(plan.A)!) : "—"}</div></div>
      <div><div class="k">Interest still to pay</div><div class="v">${money(plan.int)}</div></div><div><div class="k">With EMIs only</div><div class="v">${lastBank(base.A) ? mShort(lastBank(base.A)!) : "—"}</div></div></div>
  </div>
  <div class="list" style="margin-top:12px">${seq.map((a, i) => { const b = base.A.find((z) => z.id === a.id); return `<div class="row tap" data-loan="${esc(a.loan.id)}" role="button" tabindex="0"><div class="main"><div class="t">${i + 1}. ${esc(a.name)}</div><div class="s">${money(a.bal)} · ${a.rate ? rateTxt(a.rate) + "%" : "interest-free"}${a.min ? ` · ${money(a.min)}/month now` : ""}</div></div><div class="ccamt"><div class="amt">${endTxt(a)}</div><div class="cclbl">${b && b.end !== a.end ? `was ${endTxt(b)}` : "same"}</div></div></div>`; }).join("")}</div>
  ${span > 1 ? `<div style="height:12px"></div>` + chartCard("Total owed", "", lineChart({ labels: labels.map(mShort), ticks: mTicks(labels), full: labels.map(mLabel), series: ser, area: 0, h: 190, aria: "Total owed by month, with your plan and with EMIs only" }), legendHtml(ser)) : ""}
  <p class="note">Uses today's rates and the EMIs in your loans${zeroLoans.length ? `; ${esc(zeroLoans.map((a) => a.name).join(", "))} ${zeroLoans.length === 1 ? "has" : "have"} no monthly repayment planned, so ${zeroLoans.length === 1 ? "it" : "they"} only shrink${zeroLoans.length === 1 ? "s" : ""} from your extra` : ""}. Doesn't change your forecast: to commit, add the extra as a regular item or record part payments on the loan.</p>`;
}
function accLoans(d: MoneyData, host: AccHost): string {
  const loans = d.live<LoanX[0]>("loans").map((l) => [l, loanSum(d, l)] as LoanX).sort((a, b) => b[1].out - a[1].out);
  return `    <div class="btns" style="margin-top:12px"><button class="btn pri" type="button" id="addLoan">+ Add loan</button></div>
    ${loans.length ? `<div class="sumcard" style="margin-top:12px"><div class="sr"><span>Total outstanding</span><b>${money(loans.reduce((x, [, y]) => x + y.out, 0))}</b></div><div class="sr"><span>EMIs per month</span><b>${money(loans.reduce((x, [, y]) => x + (y.out > 50 ? y.emiNow : 0), 0))}</b></div></div>` : ""}
    ${loanList(d, loans, "No open loans. Add bank loans, money from family and friends, or a mix of both.")}
    ${payoffPanel(d, host)}`;
}

/* ---------- investments ---------- */
function investCharts(d: MoneyData, H: [Holding, HoldingSum][]): string {
  const by = new Map<string, number>();
  for (const [h, x] of H) if (!h.excludeNW && x.value > 50) by.set(String(h.type), (by.get(String(h.type)) || 0) + x.value / 100);
  const top = topN([...by.entries()], 6), tot = top.reduce((a, [, v]) => a + v, 0);
  if (!tot) return "";
  const items = top.map(([k, v], i) => ({ name: k === "__other" ? "Other types" : k, value: v, color: k === "__other" ? "var(--vO)" : VC[i]!, attrs: k === "__other" ? "" : `data-hgo="${esc(k)}"` }));
  const list = `<div class="dlist">${items.map((x) => `<${x.attrs ? "button" : "div"} class="di" ${x.attrs ? `type="button" ${x.attrs}` : ""}><i style="background:${x.color}"></i><span class="dn2">${esc(x.name)}</span><span class="dp">${(x.value / tot * 100).toFixed(0)}%</span><span class="dv">${fmtMoney(x.value)}</span></${x.attrs ? "button" : "div"}>`).join("")}</div>`;
  const M = lastMonths(d, 12), now = ymOf(d.today), v = M.map((ym) => monthFigures(d, ym).investment / 100), done = M.filter((m) => m < now).length, av = done ? v.slice(0, -1).reduce((a, b) => a + b, 0) / done : 0;
  return `<div class="cgrid two">${chartCard("Allocation", `${top.length} type${top.length === 1 ? "" : "s"}`, `<div class="dwrap">${donutChart({ items, center: [short(Math.round(tot * 100)).replace("₹", ""), "invested value"], aria: "Investment value by type" })}${list}</div>`)}
    ${chartCard("Put in each month", `avg ${fmtMoney(av)}`, barChart({ half: true, labels: M.map(mShort), ticks: M.map(mTick), full: M.map(mLabel), series: [{ name: "Invested", color: "var(--v2)", values: v }], h: 190, avg: { v: av, label: "avg " + AX(av) }, dim: (i) => M[i] === now, attrs: (i) => `data-ym="${M[i]}"`, aria: "Money invested each month", foot: (i) => (M[i] === now ? "So far + SIPs still due" : "") }),
      `<p class="cnote">SIPs and investment entries, Money Manager history included.</p>` + tableHtml(M.map(mLabel), [{ name: "Invested", values: v }]))}</div>`;
}
export function investSection(d: MoneyData, host: AccHost): string {
  const H = d.live<Holding>("holdings").map((h) => [h, holdingSum(d, h)] as [Holding, HoldingSum]);
  const head = `<div class="sh"><h3>Investments</h3><button class="lnk" type="button" id="addHold">+ Add ›</button></div>`;
  if (!H.length) return head + `<div class="list"><div class="empty">Add your mutual funds, stocks, PPF, NPS, EPF, gold, US stocks and property to see their value and your net worth.</div></div>`;
  const gl = (g: Paise, p: number | null): string => `<span class="${g < -50 ? "neg" : g > 50 ? "in" : "mut"}">${g >= 0 ? "+" : "−"}${money(Math.abs(g))}${p !== null ? ` (${p >= 0 ? "+" : ""}${p.toFixed(1)}%)` : ""}</span>`;
  const tot = H.filter(([h]) => !h.excludeNW).reduce((a, [, x]) => ({ v: a.v + x.value, i: a.i + x.inv }), { v: 0, i: 0 });
  const open = new Set(host.pref<string[]>("holdOpen", []));
  const row = ([h, x]: [Holding, HoldingSum]): string => {
    const stale = x.fxMissing ? "dollar rate not set" : x.age === null ? "value not set" : x.age > 7 ? `${x.byUnits ? "price" : "value"} ${x.age} days old` : "";
    const auto = (h.px || x.lines) && x.asOf && x.age! <= 7 ? h.priceManual ? `your price of ${dLabel(x.asOf)}` : `${x.lines ? "NAVs" : x.byUnits && h.type !== "Stock" && h.type !== "US Stocks" ? "NAV" : "price"} of ${dLabel(x.asOf)}` : "";
    const pj = h.priceJump as { from?: number; to?: number } | undefined;
    const jump = pj ? `<span class="pill warn" title="A split or bonus changes the units too">Price ${num(pj.to) > num(pj.from) ? "+" : "−"}${Math.abs(Math.round((num(pj.to) / num(pj.from) - 1) * 100))}%: check units</span>` : "";
    return `<div class="row tap" data-hold="${esc(h.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(h.name)}${h.excludeNW ? ' <span class="pill">Not in net worth</span>' : ""}</div>
      <div class="s">${money(x.inv)} invested</div><div class="s s2">${[x.byUnits ? `${x.units.toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${unitWord(h.type, x.units)}` : "", x.isUsd ? usd(x.usdValue!) : "", x.atCost > 50 ? `${money(x.atCost)} at cost` : "", auto, stale].filter(Boolean).join(" · ")}</div>${jump}</div>
      <div class="ccamt"><div class="amt">${money(x.value)}</div><div class="hgl">${gl(x.gain, x.inv > 0 ? x.pct : null)}</div>${x.age === null || x.age > 31 || x.fxMissing ? '<span class="pill warn">Update</span>' : ""}</div></div>`;
  };
  const groups = INV_TYPES.filter((t) => H.some(([h]) => h.type === t)).map((t) => {
    const rows = H.filter(([h]) => h.type === t).sort((a, b) => b[1].value - a[1].value), v = rows.reduce((a, [, x]) => a + x.value, 0), iv = rows.reduce((a, [, x]) => a + x.inv, 0), on = open.has(t);
    if (rows.length === 1 && ONE_OF.includes(t)) {
      const [h, x] = rows[0]!, nm = h.name && h.name !== t ? h.name : t;
      const sub = x.epf ? `${x.epf.expected.length ? "incl. expected · " : ""}${short(x.inv)} invested · ≈ ${short(x.epf.accrued)} interest this year` : h.nps ? `${short(x.inv)} invested · ${npsLines(h) ? npsLines(h)!.map((l) => npsKey(l)).join(" / ") + " schemes" : ""}` : x.ppf ? `${short(x.inv)} deposited · ≈ ${short(x.ppf.accrued)} interest this year · matures ${mShort(x.ppf.matures.slice(0, 7))}` : `${short(x.inv)} invested`;
      return `<div class="hg solo"><button class="hgh" type="button" data-hold="${esc(h.id)}"><span class="hgt"><b>${esc(nm)}</b><span>${sub}</span></span><span class="hgv"><b class="amt">${money(v)}</b>${gl(v - iv, iv > 0 ? (v - iv) / iv * 100 : null)}</span><span class="chev" aria-hidden="true"></span></button></div>`;
    }
    const noun = t === "Mutual Fund" ? (rows.length === 1 ? "fund" : "funds") : t === "Stock" || t === "US Stocks" ? (rows.length === 1 ? "stock" : "stocks") : rows.length === 1 ? "holding" : "holdings";
    return `<div class="hg ${on ? "on" : ""}"><button class="hgh" type="button" data-hg="${esc(t)}" aria-expanded="${on}"><span class="hgt"><b>${esc(t)}</b><span>${rows.length} ${noun}</span></span><span class="hgv"><b class="amt">${money(v)}</b>${gl(v - iv, iv > 0 ? (v - iv) / iv * 100 : null)}</span><span class="chev" aria-hidden="true"></span></button>
      ${on ? `<div class="hgb">${rows.map(row).join("")}</div>` : ""}</div>`;
  }).join("");
  const nTr = d.live("trades").length;
  const trLine = `<div class="btns trbtns"><label class="btn sm" for="trFile" tabindex="0" role="button">Import Kite tradebook</label><input type="file" id="trFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple hidden>${nTr ? `<span class="note" style="margin:0">${nTr} trades · listed in Transactions under Trades</span>` : ""}</div>`;
  return head + `<div class="invt"><b>${money(tot.v)}</b> <span class="mut">worth now ·</span> ${gl(tot.v - tot.i, tot.i > 0 ? (tot.v - tot.i) / tot.i * 100 : null)} <span class="mut">on ${money(tot.i)} invested</span></div>` + host.plannerHtml("pxLine") + investCharts(d, H) + `<div class="sh"><h3>Holdings</h3></div><div class="list hgs">${groups}</div>` + trLine;
}

/* ---------- property ---------- */
export function propsBody(d: MoneyData): string {
  const C = propList(d).map((p) => [p, propCalc(d, p)] as [Property, ReturnType<typeof propCalc>]), own = C.reduce((a, [, c]) => a + c.own, 0), oB = C.reduce((a, [, c]) => a + c.owedBank, 0), oF = C.reduce((a, [, c]) => a + c.owedFam, 0), pn = propNw(d);
  const cell = (k: string, v: string): string => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const rows = C.map(([p, c]) => {
    const reg = propRegd(p), val = num(p.value), pct = val > 0 ? Math.min(1, c.price / val) : 0;
    const owedTxt = c.owedBy.map((x) => `${esc(x.name)} ${shortR(x.amt)}`).join(" · "), toPay = !reg && val > 0 && val - c.price > 50 ? val - c.price : 0;
    return `<div class="pcard tap" data-prop="${esc(p.id)}" role="button" tabindex="0">
      <div class="t">${esc(p.name)} <span class="pill">${esc(PROP_ST[String(p.status)] || "")}</span>${p.nw ? ' <span class="pill good">In net worth</span>' : ""}</div>
      ${val > 0 ? `<div class="s"><b>Agreement ${rs0(val)}</b>${!reg ? ` · ${pct * 100 < 1 ? (pct * 100).toFixed(1) : Math.round(pct * 100)}% paid` : ""}</div>${!reg ? `<div class="pmini" aria-hidden="true"><i style="width:${(pct * 100).toFixed(2)}%"></i></div>` : ""}` : ""}
      <div class="p3c">${cell(reg || !(val > 0) ? (c.interest > 50 ? "Cost with interest" : "Cost") : "Paid so far", shortR(reg || !(val > 0) ? c.withInt : c.cost))}${cell("Your money in", shortR(c.own))}${cell("Still owed", c.owed > 50 ? shortR(c.owed) : "—")}</div>
      ${owedTxt ? `<div class="s">Owed: ${owedTxt}</div>` : ""}${toPay ? `<div class="s">Price still to pay to the builder: ${shortR(toPay)}</div>` : ""}</div>`;
  }).join("");
  return `<div class="sh"><h3>Properties</h3><button class="lnk" type="button" data-pact="cats">Categories ›</button></div>
    ${C.length ? `<div class="card"><div class="kv" style="margin-top:0"><span>Your money in</span><b>${rs0(own)}</b><span>Still owed: banks</span><b>${rs0(oB)}</b><span>Still owed: family</span><b>${rs0(oF)}</b><span>In net worth</span><b>${rs0(pn.on)}</b></div></div><div style="height:12px"></div>` : ""}
    ${rows || '<div class="list"><div class="empty">No properties yet. Add one to track what it has cost you, with loan interest.</div></div>'}
    <div class="btns" style="margin-top:12px"><button class="btn pri" type="button" data-pact="newprop">+ Add a property</button></div>
    <p class="note"><b>Your money in</b> is what has come out of your own pocket so far: payments you made, loan EMIs and interest, and repayments to family. Money that family or banks paid for you shows under <b>Still owed</b> until you repay it. To add a property to net worth, open it, tap Edit and tick "Count in net worth".</p>`;
}

/** The whole page. */
export function accountsHtml(d: MoneyData, st: AccState, host: AccHost): string {
  if (st.accTab === "cards") st.accTab = "banks";
  const saved = host.pref<string>("accTab", "overview");
  const t = st.accTab || (st.accTab = saved === "cards" ? "banks" : saved);
  const bal = balances(d), nw = netWorth(d), own = nw.banks + nw.inv + nw.prop, owe = nw.loans + nw.cards;
  const hero = `<div class="hero nwh">
    <div class="nwg">
      <div><div class="k">You own</div><div class="hv">${money(own)}</div><div class="k2">Banks at month-end ${money(nw.banks)}<br>Investments ${money(nw.inv)}${nw.prop > 50 ? `<br>Property ${money(nw.prop)}` : ""}</div></div>
      <div><div class="k">You owe</div><div class="hv">${money(owe)}</div><div class="k2">Loans at month-end ${money(nw.loans)}<br>Card bills ${money(nw.cards)}</div></div>
    </div>
    <div class="hrow"><div><div class="lbl">Net worth at the end of ${mLabel(ymOf(d.today))}</div><div class="nwv">${nw.total < 0 ? "−" : ""}${money(Math.abs(nw.total))}</div></div>${nw.excluded + nw.propOff > 50 ? `<div class="flow">Not counted<br>${money(nw.excluded + nw.propOff)} property</div>` : ""}</div>
  </div>`;
  const seg = `<div class="seg accseg" role="group" aria-label="Accounts sections">${ACC_TABS.map(([k, l]) => `<button type="button" data-acct="${k}" aria-pressed="${t === k}">${l}</button>`).join("")}</div>`;
  const body = t === "banks" || t === "cards" ? accBanks(d, bal, st) : t === "invest" ? investSection(d, host) : t === "loans" ? accLoans(d, host) : t === "props" ? propsBody(d) : accOverview(d, bal, nw, st);
  return hero + seg + `<div class="accb">${body}</div>`;
}

/** The page in the app: its own taps; forms and other pages still open in the planner. */
export const accountsPage: Page = {
  html(d, h) {
    const S = h.state() as unknown as AccState;
    return accountsHtml(d, S, { pref: h.pref, plannerHtml: h.plannerHtml });
  },
  act(el, h, redraw) {
    const S = h.state() as unknown as AccState & { month: string; f: Record<string, unknown> }, d = el.dataset;
    if (d.acct !== undefined) {
      S.accTab = d.acct; h.prefSet("accTab", d.acct); redraw();
      const sg = document.querySelector("#moneyView .accseg");
      if (sg && sg.getBoundingClientRect().top < (document.getElementById("moneyView")?.getBoundingClientRect().top ?? 0)) sg.scrollIntoView({ block: "start" });
      return;
    }
    if (d.nwn !== undefined) { S.nwN = d.nwn === "all" ? "all" : +d.nwn; return redraw(); }
    if (d.hg !== undefined) { const o = new Set(h.pref<string[]>("holdOpen", [])); if (o.has(d.hg)) o.delete(d.hg); else o.add(d.hg); h.prefSet("holdOpen", [...o]); return redraw(); }
    if (d.hgo !== undefined) {
      const o = new Set(h.pref<string[]>("holdOpen", [])); o.add(d.hgo); h.prefSet("holdOpen", [...o]); S.accTab = "invest"; h.prefSet("accTab", "invest"); redraw();
      document.querySelector(`#moneyView [data-hg="${CSS.escape(d.hgo)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (d.po !== undefined) { h.prefSet("poOrder", d.po); return redraw(); }
    if (d.ym !== undefined) { S.month = d.ym; Object.assign(S.f, { period: "month", cat: "", acc: "", q: "", type: "all" }); return h.go("activity"); }
    if (el.id === "moreCards") { S.allCards = !S.allCards; return redraw(); }
    return false;
  },
  change(t, h, redraw) {
    if (t.id === "f_poExtra" || t.id === "f_poLump") { h.prefSet(t.id === "f_poExtra" ? "poExtra" : "poLump", Math.max(0, parseFloat(t.value.replace(/,/g, "")) || 0)); return redraw(); }
    if (t.id === "trFile") { h.plannerFiles("importTradebooks", [...(t.files ?? [])]); t.value = ""; }
  },
};
