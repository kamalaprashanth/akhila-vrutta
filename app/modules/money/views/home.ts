/**
 * The Money Overview: what to pay by Tuesday, short balances, invest day, renewals, the main account's
 * month-end, what needs confirming, this month so far, insights, and recent entries. As in KP Money
 * Planner, built from the stored data (paise).
 */
import { aiOn } from "../../../core/ai.ts";
import { esc } from "../../../core/dom.ts";
import { addDays, addM, dayDiff, dayIn, dLabel, lastDay, mLabel, MN, mShort, ymOf, type Day, type YM } from "../calc/dates.ts";
import { num, type Loan, type MoneyData, type Paise, type Rec } from "../calc/data.ts";
import { balances, cardInfo, countsAcc, dueOf, expMonth, histCovered, openDateOf, stmtFor, type Account } from "../calc/accounts.ts";
import { accName, catName, catTop, cemiDue, paidMap, planFor } from "../calc/plan.ts";
import { forecast, mainAcc, type ForecastRow } from "../calc/forecast.ts";
import { bigBills, isAutoItem, itemDate, obligations, payTue, readiness, reserveState, resvPaid, resvPlanned } from "../calc/reserve.ts";
import { reserveAcc } from "../calc/properties.ts";
import { catLbl, feeCat, invChg, monthFigures, offBook, type MonthFigures } from "../calc/insights.ts";
import { kindOf, schedule } from "../calc/loans.ts";
import { money, txLine, type Tx } from "./txlist.ts";
import { CC, lastMonths, nwHistory, rs0, short } from "./accounts.ts";
import { dFull, findRepeats, goalSum } from "./plan.ts";
import type { Page, PageHost } from "./pages.ts";
import { advAuto } from "./advisor.ts";
import { startShown, wasSeen } from "../../../core/helptips.ts";

/** A new user's Get started list (approved design, 27 Nov 2026): five steps, each opening its page; gone when all are done. */
function startList(d: MoneyData): string {
  const tx = d.live<Tx>("txns").filter((t) => t.type !== "carry");
  const steps: [boolean, string, string, string, string][] = [
    [!!mainAcc(d), "Your main account", "Where your salary lands", "", ""],
    [tx.some((t) => t.type === "expense"), "Record one spend", "The + button, any time", "add", "Add"],
    [d.live("recurring").length > 0, "Add what repeats", "Salary, rent, EMIs, SIPs. This is what makes the planning work.", "regular", "Add"],
    [d.live<Rec & { type?: string }>("accounts").some((a) => a.type === "card") || d.live("loans").length > 0, "Add your cards and loans", "For bill reminders and what's left to pay", "accounts", "Add"],
    [wasSeen("cashflow"), "Look ahead", "Plan › Cash flow shows if you'll have enough", "cashflow", "See"],
  ];
  const done = steps.filter((x) => x[0]).length;
  if (done === steps.length) return "";
  const tick = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  return `<div class="gs" id="getStarted"><div class="gsh"><span>Get started · ${done} of ${steps.length} done</span><button type="button" class="gsx" data-hgo="hidestart">Hide</button></div>
    <div class="gsbar" aria-hidden="true"><i style="width:${done / steps.length * 100}%"></i></div>
    <div class="list">${steps.map(([ok, t, sub, k, lbl]) => `<div class="row gsrow${ok ? " ok" : ""}"><span class="gsck">${ok ? tick : ""}</span><div class="main"><div class="t">${t}</div><div class="s">${sub}</div></div>${!ok && k ? `<button type="button" class="lnk gsgo" data-hgo="${k}">${lbl} ›</button>` : ""}</div>`).join("")}</div></div>`;
}

export interface HomeState { ptNext?: boolean; insOpen?: boolean }
const wd = (d: Day): string => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(d + "T00:00").getDay()]!;
const dShort = (d: Day): string => `${wd(d)} ${dLabel(d)}`;
const dYr = (d: MoneyData, x: Day): string => (x.slice(0, 4) === d.today.slice(0, 4) ? dLabel(x) : dFull(x));
type Row = ForecastRow & { budget?: Paise; spent?: Paise; canMiss?: boolean; sub?: string; day?: number | null; moved?: number };

/* ---------- the advisor button ---------- */
export const ADV_IC = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.3l5-.7z"/></svg>`;
export const advCheck = (d: MoneyData): Rec & { ym?: YM; quick?: { verdict?: string } } => d.byId("settings", "advcheck") ?? { id: "advcheck" };
export function advButton(d: MoneyData): string {
  const c = advCheck(d), now = ymOf(d.today), ready = c.ym === now && c.quick;
  return `<button type="button" class="advbtn" data-go="advisor"><span class="advic">${ADV_IC}</span><span class="advt"><b>Ask your advisor</b><span>${ready ? `${MN[+now.slice(5) - 1]} check-up ready · ${esc((c.quick!.verdict || "").slice(0, 70))}` : "Checks your whole picture: cash, loans, insurance, investments, tax, goals"}</span></span><span class="raa">›</span></button>`;
}

/* ---------- pay by Tuesday, short balances, invest day, renewals ---------- */
function payTueCard(d: MoneyData, st: HomeState): string {
  const td = d.today, T = payTue(d), isTue = T === td, end = addDays(T, 6), O = obligations(d, 21), Rd = readiness(d, 45), rst = reserveState(d), dd = dayDiff(td, T);
  const bill = (o: typeof O[number]): boolean => o.type !== "income" && o.type !== "investment" && !o.budget;
  const pay = O.filter((o) => !o.auto && bill(o) && o.date <= end), auto = O.filter((o) => o.auto && bill(o) && o.date >= td && o.date <= end);
  const next = O.filter((o) => !o.auto && bill(o) && o.date > end && o.date <= addDays(end, 7)), nextT = addDays(T, 7), nextSum = next.reduce((x, o) => x + o.amount, 0);
  const moves = Rd.filter((s) => s.from && s.by! <= end);
  const asides: { k: string; name: string; amt: Paise; wrap?: boolean; sub: string }[] = [];
  if (rst.a && rst.B.length && !rst.doneThis && rst.setAside > 50) asides.push({ k: "reserve", name: "Big-bills reserve", amt: rst.setAside, wrap: rst.capped, sub: rst.capped ? `${money(rst.setAsideFull)} due · ${rst.spareFrom!.name} can spare ${money(rst.setAside)} · the rest is spread over the next months` : `${rst.B.length} big bill${rst.B.length === 1 ? "" : "s"} · into ${(rst.a as Account).name}` });
  for (const f of rst.funds) if (!f.done && f.monthly > 50) asides.push({ k: "prop:" + f.p.id, name: `${f.p.name} fund`, amt: f.monthly, sub: `${short(f.need)} by ${mShort(f.by)}` });
  if (!pay.length && !moves.length && !asides.length && !auto.length && !next.length) return "";
  const nextLine = next.length ? `<button type="button" class="ptnext" data-ptnext="1" aria-expanded="${!!st.ptNext}"><span>Next Tue ${dLabel(nextT)} · ${next.length} to pay · ${rs0(nextSum)}</span><span aria-hidden="true">${st.ptNext ? "▴" : "›"}</span></button>
    ${st.ptNext ? `<div class="ptnl">${next.map((o) => `<div><span>${esc(o.name)}</span><b>${rs0(o.amount)}</b></div>`).join("")}</div>` : ""}` : "";
  if (!pay.length && !moves.length && !asides.length)
    return `<div class="ptcard done slim"><div class="ptone">✓ Nothing to pay till Tue ${dLabel(isTue ? nextT : T)}</div>${nextLine}</div>`;
  const tot = pay.reduce((x, o) => x + o.amount, 0), n = pay.length;
  const split = (o: typeof O[number]): [string, string] => { const i = o.name.indexOf(" · "); return (o.src as string) === "pp" && i > 0 ? [o.name.slice(i + 3), o.name.slice(0, i)] : [o.name, ""]; };
  const when = (o: typeof O[number]): string => { if (o.date < td) return `<span class="ccbad">was due ${dShort(o.date)}</span>`; if (o.anyDay) return `any day in ${MN[+o.ym.slice(5) - 1]}`; if (!isTue && o.date < T) return `<span class="ccbad">due ${dShort(o.date)} · before Tue</span>`; return `due ${dLabel(o.date)}`; };
  const row = (main: string, sub: string, amt: string, btn: string): string => `<div class="ptrow"><div class="main"><div class="t">${main}</div><div class="s">${sub}</div></div><div class="amt">${amt}</div>${btn}</div>`;
  const payRows = pay.map((o) => { const [m, pre] = split(o); return row(`${o.date < td ? "⚠ " : ""}${esc(m)}`, `${pre ? esc(pre) + " · " : ""}${when(o)}`, rs0(o.amount), `<button class="btn sm pri" type="button" data-ptpay="${esc(o.key)}">Pay</button>`); }).join("");
  const moveRows = moves.map((s) => row(`${esc(s.from!.name)} → ${esc(s.acc.name)}`, `for ${esc(s.item.name)} · ${dShort(s.date)}`, rs0(s.need), `<button class="btn sm pri" type="button" data-ptmove="${esc(s.acc.id)}|${esc(s.from!.id)}|${s.need / 100}|${esc(s.item.name)}">Move</button>`)).join("");
  const asideRows = asides.map((x) => row(esc(x.name), x.wrap ? `<span class="swrap">${esc(x.sub)}</span>` : esc(x.sub), rs0(x.amt), `<button class="btn sm pri" type="button" data-ptaside="${esc(x.k)}|${Math.round(x.amt / 100)}">Done</button>`)).join("");
  const autoLine = auto.length ? `<div class="ptauto">Auto · ${auto.map((o) => { const sh = Rd.find((x) => x.item.key === o.key); return `${esc(o.name)} ${rs0(o.amount)} ${wd(o.date)} ${+o.date.slice(8)} ${sh ? '<span class="ccbad">short</span>' : "✓"}`; }).join(" · ")}</div>` : "";
  return `<div class="ptcard">
    <div class="pth"><div><button type="button" class="ptt" data-ptgo="cashflow">${isTue ? "Pay today" : "Pay by Tuesday"} <span aria-hidden="true">›</span></button><div class="pts">${dLabel(T)} · ${isTue ? "today" : dd === 1 ? "tomorrow" : `in ${dd} days`}</div></div>
      ${n ? `<div class="ptr"><b>${rs0(tot)}</b><span>${n} to pay</span></div>` : ""}</div>
    ${n ? `<div class="ptsec">Pay</div>${payRows}` : `<div class="ptnone">✓ No bills to pay till Tue ${dLabel(nextT)}</div>`}
    ${moves.length ? `<div class="ptsec">Move money</div>${moveRows}` : ""}
    ${asides.length ? `<div class="ptsec">Set aside</div>${asideRows}` : ""}
    ${autoLine || nextLine ? `<div class="ptbot">${autoLine}${nextLine}</div>` : ""}</div>`;
}
function shortAlert(d: MoneyData): string {
  const td = d.today, endNext = lastDay(ymOf(td)), Rd = readiness(d, Math.max(1, dayDiff(td, endNext))), wk = addDays(payTue(d), 6);
  const L = Rd.filter((s) => s.date <= endNext && !(s.from && s.by! <= wk));
  if (!L.length) return "";
  return `<button type="button" class="rdyal" data-ptgo="cashflow">${L.map((s) => `<span class="ra1">⚠ ${esc(s.acc.name)} runs short by ${money(s.need)} on ${dShort(s.date)} · ${esc(s.item.name)}</span>
    <span class="ra2">${s.from ? `Move ${money(s.need)} from ${esc(s.from.name)} by ${dShort(s.by!)}` : `Add money to ${esc(s.acc.name)} before then`}${num((s.acc as Account & { minBal?: Paise }).minBal) ? ` · keeps ${money(num((s.acc as Account & { minBal?: Paise }).minBal))}` : ""}</span>`).join("")}<span class="raa" aria-hidden="true">›</span></button>`;
}
function investCard(d: MoneyData): string {
  const now = ymOf(d.today), td = d.today, m = forecast(d, 1).months[0]!, inv = m.rows.filter((r) => r.type === "investment" && num(r.amount) > 50) as Row[];
  const todo = inv.filter((r) => !r.paid && !isAutoItem(d, r)), auto = inv.filter((r) => isAutoItem(d, r));
  if (!todo.length) return "";
  const dt = (r: Row): Day => itemDate(r, now) || td, day = todo.map(dt).sort()[0]!, tot = todo.reduce((s, r) => s + num(r.amount), 0), first = todo.find((r) => r.moved);
  const late = day < td, dd = dayDiff(td, day);
  return `<div class="ptcard inv"><div class="pth"><div><div class="ptt" style="cursor:default">Invest day</div><div class="pts">${dShort(day)} · ${late ? `<span class="ccbad">${-dd} day${dd === -1 ? "" : "s"} ago</span>` : dd === 0 ? "today" : dd === 1 ? "tomorrow" : `in ${dd} days`}${first ? (() => { const od = dayIn(+now.slice(0, 4), +now.slice(5), first.moved!), g = new Date(od + "T00:00").getDay(); return ` · ${dLabel(od)} is a ${g === 0 ? "Sunday" : g === 6 ? "Saturday" : "market holiday"}`; })() : ""}</div></div>
      <div class="ptr"><b>${rs0(tot)}</b><span>${todo.length} to buy</span></div></div>
    ${todo.map((r) => `<div class="ptrow"><div class="main"><div class="t">${esc(r.name)}</div><div class="s">${esc(accName(d, r.accountId) || "no account set")} · ${dLabel(dt(r))}</div></div><div class="amt">${rs0(num(r.amount))}</div><button class="btn sm pri" type="button" data-invpay="${esc(r.key)}">Invest</button></div>`).join("")}
    ${todo.length > 1 ? `<div class="btns" style="padding:4px 16px 4px;justify-content:flex-end"><button class="btn sm" type="button" data-invall="1">Invest all · ${rs0(tot)}</button></div>` : ""}
    ${auto.length ? `<div class="ptbot"><div class="ptauto" style="padding-bottom:10px">Auto · ${auto.map((r) => `${esc(r.name.replace(/ - Direct Plan - Growth$/i, ""))} ${rs0(num(r.amount))} ${r.paid ? "✓" : dLabel(dt(r))}`).join(" · ")}</div></div>` : ""}</div>`;
}
function renewalsSoon(d: MoneyData): string {
  const td = d.today, L = bigBills(d).map((x) => ({ x, dt: itemDate({ day: x.r.day || 1 }, x.next)! })).filter(({ x, dt }) => num((x.r as { remind?: number }).remind) > 0 && dayDiff(td, dt) >= 0 && dayDiff(td, dt) <= num((x.r as { remind?: number }).remind));
  if (!L.length) return "";
  return `<div class="note rnsoon">🔔 Coming renewals: ${L.map(({ x, dt }) => `<b>${esc(x.r.name)}</b> ${money(x.amt)} due ${dYr(d, dt)} · in ${dayDiff(td, dt)} days`).join(" · ")}</div>`;
}

/* ---------- what needs you ---------- */
interface Need { w: number; d?: number; t: string; s: string; a: Paise; act: string }
export function needsYou(d: MoneyData): Need[] {
  const td = d.today, now = ymOf(td), day = +td.slice(8), out: Need[] = [];
  const cur = forecast(d, 1).months[0]!;
  for (const r of cur.rows as Row[]) {
    if (r.paid || r.type === "income") continue;
    if (r.src === "b") {
      const spent = num(r.spent), budget = num(r.budget);
      if (spent > budget + 50) out.push({ w: 1, t: `${r.name} budget`, s: `Over by ${money(spent - budget)}`, a: spent, act: '<span class="pill bad">Over</span>' });
      else if (budget - spent > 50) out.push({ w: 2.5, d: r.day || 99, t: `${r.name} budget`, s: `Spent ${money(spent)} of ${money(budget)}${r.day ? ` · planned by ${r.day} ${MN[+now.slice(5) - 1]}` : ""}`, a: budget - spent, act: `<span class="pill">Left</span><button class="btn sm" type="button" data-rec="${esc(r.id)}">Edit</button>` });
      continue;
    }
    if (r.src === "c") continue;
    if (!isAutoItem(d, r) || !r.day || r.day > day) continue;
    const late = r.day && r.day < day, soon = r.day && r.day - day <= 5;
    out.push({ w: late ? 0 : soon ? 1 : 2, d: r.day || 99, t: r.name, s: `${r.day ? `${late ? "Was due" : "Due"} ${r.day} ${MN[+now.slice(5) - 1]} · ` : ""}${r.sub || catName(d, r.categoryId)}`, a: num(r.amount),
      act: `${late ? '<span class="pill bad">Overdue</span>' : ""}${r.canMiss ? `<button class="btn sm" type="button" data-miss="${esc(r.key)}">Missed</button>` : ""}<button class="btn sm pri" type="button" data-pay="${esc(r.key)}">${r.type === "income" ? "Received" : "Paid"}</button>` });
  }
  for (const l of d.live<Loan & { name?: string }>("loans")) if (kindOf(l) === "hybrid") {
    const sc = schedule(d, l), pm = paidMap(d);
    if (!sc) continue;
    for (const row of sc.rows) if (row.ym < now && !pm.has(`l:${l.id}|${row.ym}`))
      out.push({ w: 0, t: `${l.name} EMI · ${mLabel(row.ym)}`, s: "Not marked yet", a: row.emi, act: `<button class="btn sm" type="button" data-miss="l:${esc(l.id)}|${row.ym}">Missed</button><button class="btn sm pri" type="button" data-pay="l:${esc(l.id)}|${row.ym}">Paid</button>` });
  }
  return out.sort((a, b) => a.w - b.w || (a.d || 99) - (b.d || 99));
}

/* ---------- this month's spending, by account and category ---------- */
type Grp = { name: string; order: number; total: Paise; cats: Map<string, { total: Paise; subs: Map<string, Paise> }> };
export function expenseTree(d: MoneyData, ym: YM): [string, Grp][] {
  const now = ymOf(d.today), G = new Map<string, Grp>();
  const grp = (k: string, name: string, order: number): Grp => { if (!G.has(k)) G.set(k, { name, order, total: 0, cats: new Map() }); return G.get(k)!; };
  const add = (g: Grp, top: string, sub: string | null, v: Paise): void => { g.total += v; if (!g.cats.has(top)) g.cats.set(top, { total: 0, subs: new Map() }); const c = g.cats.get(top)!; c.total += v; if (sub != null) c.subs.set(sub, (c.subs.get(sub) || 0) + v); };
  const accGrp = (id?: string | null): Grp => { const a = id ? d.byId<Account>("accounts", id) : undefined; return a ? grp("a:" + a.id, String(a.name), a.type === "card" ? 1 : 0) : grp("a:none", "No account", 2); };
  type T = Tx & { link?: string };
  for (const t of d.live<T>("txns")) if (t.type === "expense" && !offBook(t) && !histCovered(d, t) && !resvPaid(d, t) && expMonth(d, t) === ym) {
    const v = num(t.amount);
    if (t.link && t.link.startsWith("l:")) { const l = d.byId<Rec & { name?: string }>("loans", t.link.slice(2).split("|")[0]!); add(grp("emi", "EMIs", 3), l ? `${l.name} EMI` : "EMI", null, v); continue; }
    if (t.link && t.link.startsWith("p:")) { const l = d.byId<Rec & { name?: string; lender?: string }>("loans", t.link.slice(2).split(":")[0]!); add(grp("repay", "Loan repayments", 4), l ? `Repay ${l.lender || l.name}` : "Repayment", null, v); continue; }
    const top = (t.categoryId ? catTop(d, t.categoryId) : "") || "none";
    add(accGrp(t.accountId), top, t.categoryId || "none", v);
  }
  for (const t of d.live<T>("txns")) if (t.type === "investment" && invChg(t) && ymOf(t.date ?? "") === ym) { const f = feeCat(d); add(accGrp(t.accountId), (f ? catTop(d, f) : "") || "none", f || "none", invChg(t)); }
  for (const a of d.live<Account & { stmtDay?: number }>("accounts")) { const od = openDateOf(a); if (a.type === "card" && countsAcc(a) && num(a.stmtDay) >= 1 && num(a.opening) < 0 && od && ymOf(dueOf(a, stmtFor(a, od))) === ym) add(accGrp(a.id), "cardopen", null, -num(a.opening)); }
  if (ym >= now) {
    const paid = paidMap(d);
    for (const it of planFor(d, ym)) {
      if (it.type === "investment" && it.chg && !(it._m === now && paid.has(it.key))) { const f = feeCat(d); add(accGrp(it.accountId), (f ? catTop(d, f) : "") || "none", f || "none", Math.min(num(it.amount), it.chg)); continue; }
      if (it.type !== "expense" || it.src === "c" || (it._m === now && paid.has(it.key)) || resvPlanned(d, it)) continue;
      const v = num(it.amount);
      if (!v) continue;
      if (it.src === "l") add(grp("emi", "EMIs", 3), it.name, null, v);
      else if (it.src === "p") add(grp("repay", "Loan repayments", 4), it.name, null, v);
      else if (it.src === "b") add(grp("budget", "Budgets left", 5), it.name, null, v);
      else { const top = (it.categoryId ? catTop(d, it.categoryId) : "") || "none"; add(accGrp(it.accountId), top, it.categoryId || "none", v); }
    }
    for (const e of cemiDue(d, ym)) add(accGrp(e.card), (e.cat ? catTop(d, e.cat) : "") || "none", e.cat || "none", e.v);
  }
  return [...G.entries()].sort((a, b) => b[1].total - a[1].total);
}

/* ---------- insights ---------- */
export const IC: Record<string, string> = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l5-5 4 4 7-7"/><path d="M15 8h5v5"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8l5 5 4-4 7 7"/><path d="M15 16h5v-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l3 3-3 3"/><path d="M4 12V9a3 3 0 013-3h13M7 21l-3-3 3-3"/><path d="M20 12v3a3 3 0 01-3 3H4"/></svg>',
  piggy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11a7 6 0 0113-2h2v4l-2 1v3h-3v-2H9v2H6v-3a6 6 0 01-1-3z"/><path d="M15 10v.01"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12v.01"/></svg>',
};
const propTxSet = (d: MoneyData): Set<string> => d.memo("ptx", () => new Set(d.live<Rec & { txnId?: string }>("propItems").filter((i) => i.txnId && !i.deleted).map((i) => i.txnId!)));
type MF = MonthFigures & { propEx?: Paise };
/** Month figures without property payments (one-off, often loan-funded, they'd swamp the comparisons). */
export const mfigI = (d: MoneyData, ym: YM): MF => d.memo("mfi:" + ym, () => {
  const f = monthFigures(d, ym), P = propTxSet(d);
  if (!P.size) return f;
  let ex = 0;
  const bc = new Map(f.byCat);
  for (const t of d.live<Tx>("txns")) if (t.type === "expense" && P.has(t.id) && expMonth(d, t) === ym && !offBook(t) && !histCovered(d, t)) { ex += num(t.amount); const k = (t.categoryId ? catTop(d, t.categoryId) : "") || "none"; bc.set(k, (bc.get(k) || 0) - num(t.amount)); }
  return ex ? { ...f, expense: f.expense - ex, byCat: bc, propEx: ex } : f;
});
const incOf = (f: MonthFigures): Paise => f.income - (f.byInc.get("carry") || 0);
interface Cat extends Rec { name: string; kind?: string; parentId?: string | null; limit?: Paise }
export function limitRows(d: MoneyData, ym: YM): { c: Cat; sp: Paise; lim: Paise; p: number }[] {
  const f = monthFigures(d, ym);
  return d.live<Cat>("categories").filter((c) => c.kind === "expense" && num(c.limit) > 0 && !c.parentId).map((c) => { const sp = f.byCat.get(c.id) || 0; return { c, sp, lim: num(c.limit), p: sp / num(c.limit) * 100 }; }).sort((a, b) => b.p - a.p);
}
interface Insight { cls: string; ic: string; tag: string; t: string; s: string; at: string }
export function smartInsights(d: MoneyData, h: { pref<T>(k: string, d: T): T }): Insight[] {
  const now = ymOf(d.today), out: Insight[] = [], f = mfigI(d, now), past = lastMonths(d, 6, addM(now, -1)).map((ym) => mfigI(d, ym)).filter((x) => x.expense > 50);
  const med = (v: number[]): number => { const a = [...v].sort((x, y) => x - y), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2]! : (a[n / 2 - 1]! + a[n / 2]!) / 2) : 0; };
  const avg = med(past.map((x) => x.expense));
  if (avg > 0 && f.expense > 0) {
    const dd = (f.expense - avg) / avg * 100;
    out.push(Math.abs(dd) < 8 ? { cls: "", ic: "piggy", tag: "On track", t: `${MN[+now.slice(5) - 1]} heads for ${money(f.expense)}`, s: `About the same as a typical month (${money(avg)}, the middle of the last ${past.length}).`, at: 'data-ins="trends"' }
      : { cls: dd > 0 ? "bad" : "good", ic: dd > 0 ? "up" : "down", tag: dd > 0 ? "Higher" : "Lower", t: `Spending ${Math.abs(dd).toFixed(0)}% ${dd > 0 ? "above" : "below"} usual`, s: `${MN[+now.slice(5) - 1]} heads for ${money(f.expense)} (so far + still due); a typical month is ${money(avg)}. Property payments are left out.`, at: 'data-ins="trends"' });
  }
  {
    const p3 = lastMonths(d, 3, addM(now, -1)).map((ym) => mfigI(d, ym));
    let best: { k: string; v: number; a: number; d: number } | null = null;
    for (const [k, v] of f.byCat) { if (k === "cardopen" || k === "repay" || k === "none") continue; const a = p3.reduce((s, x) => s + (x.byCat.get(k) || 0), 0) / 3, dd = v - a; if (dd > Math.max(200000, a * .3) && (!best || dd > best.d)) best = { k, v, a, d: dd }; }
    if (best) out.push({ cls: "warn", ic: "up", tag: "Category jump", t: `${catLbl(d, best.k)}: ${money(best.v)}`, s: best.a < 100 ? `New this month: nothing in this category in the last 3 months.` : `${money(best.d)} more than your 3-month average of ${money(best.a)}.`, at: 'data-ins="trends"' });
  }
  for (const x of limitRows(d, now).filter((x) => x.p >= 80).slice(0, 2)) out.push({ cls: x.p > 100 ? "bad" : "warn", ic: "alert", tag: x.p > 100 ? "Over limit" : "Near limit", t: `${x.c.name}: ${x.p.toFixed(0)}% of limit`, s: `${money(x.sp)} of ${money(x.lim)} this month${x.p > 100 ? `, over by ${money(x.sp - x.lim)}` : ""}.`, at: 'data-ins="month"' });
  { const hh = nwHistory(d); if (hh.length >= 2) { const a = hh[hh.length - 2]!, b = hh[hh.length - 1]!, dd = b.total - a.total; if (Math.abs(dd) > 100000) out.push({ cls: dd >= 0 ? "good" : "bad", ic: dd >= 0 ? "up" : "down", tag: "Net worth", t: `${dd >= 0 ? "Up" : "Down"} ${money(Math.abs(dd))} since ${MN[+a.ym.slice(5) - 1]}`, s: `Heading for ${money(b.total)} at month-end${a.est ? " (last month is estimated)" : ""}.`, at: 'data-acct="overview"' }); } }
  { const lm = mfigI(d, addM(now, -1)), li = incOf(lm); if (li > 50) { const r = (li - lm.expense) / li * 100; out.push({ cls: r >= 20 ? "good" : r < 0 ? "bad" : "", ic: "piggy", tag: "Savings rate", t: `You kept ${r.toFixed(0)}% of ${MN[+addM(now, -1).slice(5) - 1]}'s income`, s: `Income ${money(li)}, spent ${money(lm.expense)}. Investing counts as saving.`, at: 'data-ins="trends"' }); } }
  { const Rp = findRepeats(d, h.pref<string[]>("repIgnore", [])); if (Rp.length) out.push({ cls: "", ic: "repeat", tag: "Repeat payments", t: `${Rp.length} regular payment${Rp.length === 1 ? "" : "s"} not in your plan`, s: `${esc(Rp.slice(0, 2).map((r) => r.name).join(", "))}${Rp.length > 2 ? "…" : ""} · about ${money(Rp.reduce((a, r) => a + r.monthly, 0))} a month.`, at: 'data-ptgo="regular"' }); }
  for (const g of d.live<Rec & { name?: string; target?: Paise; by?: YM }>("goals")) { const x = goalSum(d, g); if (x.need > 50 && x.monthsLeft > 0) { out.push({ cls: "", ic: "target", tag: "Goal", t: `${g.name}: ${x.pct.toFixed(0)}% there`, s: `Put aside ${money(x.need)} a month to reach ${money(num(g.target))} by ${mShort(g.by!)}.`, at: 'data-ptgo="goals"' }); break; } }
  return out.slice(0, 5);
}
function insightCards(d: MoneyData, st: HomeState, h: PageHost): string {
  const I = smartInsights(d, h);
  if (!I.length) return "";
  if (!st.insOpen) return `<button type="button" class="insfold" data-insopen="1"><span><b>Insights</b> · ${I.length}</span><span class="mut">${esc(I.map((x) => x.tag).slice(0, 3).join(" · "))} ›</span></button>`;
  return `<div class="sh"><h3>Insights</h3><button class="lnk" type="button" data-insopen="1">Hide</button><button class="lnk" type="button" data-go="advisor">Ask your advisor ›</button></div><div class="icards">${I.map((x) => `<button class="icard ${x.cls}" type="button" ${x.at}><span class="ii">${IC[x.ic]}</span><span><span class="itag">${x.tag}</span><div class="it">${x.t}</div><div class="is">${x.s}</div></span></button>`).join("")}</div>`;
}

/** The whole page. */
export function homeParts(d: MoneyData, st: HomeState, h: PageHost): Record<"first" | "adv" | "pay" | "short" | "invest" | "renew" | "hero" | "needs" | "ins" | "recent", string> {
  const now = ymOf(d.today), cur = forecast(d, 1).months[0]!, m = mainAcc(d), bal = balances(d);
  const first = !d.live("txns").length && !d.live("recurring").length && !d.live("loans").length;
  let hero = "";
  if (m) {
    const on = (id?: string | null): boolean => !id || id === m.id, isIn = (r: Row): boolean => r.type === "income" || (r.type === "transfer" && r.toAccountId === m.id);
    const pend = (cur.rows as Row[]).filter((r) => !r.paid && (r.type === "transfer" ? (r.accountId === m.id) !== (r.toAccountId === m.id) && (r.accountId === m.id || r.toAccountId === m.id) : on(r.accountId))), cb = bal.get(m.id) || 0;
    const ra = reserveAcc(d), sa = ra ? reserveState(d).setAside : 0, saOut = ra && ra.id !== m.id ? sa : 0, saIn = ra && ra.id === m.id ? sa : 0;
    const inS = pend.filter(isIn).reduce((x, r) => x + num(r.amount), 0) + saIn, outS = pend.filter((r) => !isIn(r)).reduce((x, r) => x + num(r.amount), 0) + saOut, end = cb + inS - outS;
    hero = `<div class="hero"><div class="lbl">${esc(m.name)} balance today</div><div class="big">${money(cb)}</div>
      <div class="hrow"><div><div class="k">Month-end balance</div><div class="hv">${money(end)}</div>${end < -50 ? `<span class="tagx">Short by ${money(-end)}</span>` : `<span class="tagx">On track</span>`}</div>
      <div class="flow">+${money(inS)} coming in<br>−${money(outS)} still due<br><button class="chg" type="button" id="pickMain">Change account</button></div></div></div>`;
  }
  const need = needsYou(d), shown = need.slice(0, 4);
  const needs = `<div class="sh"><h3>To confirm &amp; budgets</h3>${need.length > 4 ? `<button class="lnk" type="button" data-go="plan">See all ${need.length} ›</button>` : ""}</div>
    <div class="list">${shown.length ? shown.map((x) => `<div class="need"><div class="main"><div class="t">${esc(x.t)}</div><div class="s">${esc(x.s)}</div></div><div class="side"><div class="amt">${money(x.a)}</div><div class="acts">${x.act}</div></div></div>`).join("") : '<div class="empty">Nothing needs you right now.</div>'}</div>`;

  const recent = d.live<Tx>("txns").filter((t) => t.type !== "carry").sort((a, b) => String(b.date).localeCompare(String(a.date)) || num(b.updatedAt) - num(a.updatedAt)).slice(0, 3);
  const recentH = `<div class="sh"><h3>Recent</h3><button class="lnk" type="button" data-go="activity">All ›</button></div>
    <div class="list">${recent.length ? recent.map((t) => txLine(d, t, { f: { type: "all", cat: "", acc: "", tag: "", period: "month", from: "", to: "", q: "" }, month: now })).join("") : '<div class="empty">No transactions yet. Tap Add to record one.</div>'}</div>`;
  void expenseTree; void CC; void short;
  return {
    first: startShown() ? startList(d) : first ? `<div class="banner" style="margin-top:6px"><b>Start here.</b> Add your bank accounts and cards in Accounts › Banks &amp; cards, your salary, SIPs and bills in Plan › Regular, loans in Accounts › Loans, then record spending with Add.</div>` : "",
    adv: aiOn() ? advButton(d) : "", pay: payTueCard(d, st), short: shortAlert(d), invest: investCard(d), renew: renewalsSoon(d), hero, needs, ins: insightCards(d, st, h), recent: recentH,
  };
}
/** The Overview (Calm): the balance first, then what to pay, move and put aside this week, what needs you, this
 *  month's investments and renewals, insights and recent; the advisor last. Same parts as the planner's. */
export function homeHtml(d: MoneyData, st: HomeState, h: PageHost): string {
  const p = homeParts(d, st, h);
  return `${p.first}<div class="cols"><div>${p.hero}${p.pay}${p.short}${p.needs}${p.invest}${p.renew}</div><div>${p.ins}${p.recent}${p.adv}</div></div>`;
}

export const homePage: Page = {
  html(d, h) { return homeHtml(d, h.state() as unknown as HomeState, h); },
  after(_root, h) { advAuto(h); },
  act(el, h, redraw) {
    const S = h.state() as unknown as HomeState & { planTab?: string }, x = el.dataset;
    if (x.ptnext !== undefined) { S.ptNext = !S.ptNext; return redraw(); }
    if (x.insopen !== undefined) { S.insOpen = !S.insOpen; return redraw(); }
    if (x.go !== undefined && ["activity", "accounts", "plan"].includes(x.go)) return h.go(x.go);
    if (x.ptgo !== undefined) { S.planTab = x.ptgo; return h.go("plan"); }
    return false;
  },
};
