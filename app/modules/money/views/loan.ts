/**
 * A loan's page, as in KP Money Planner: where it stands, its actions, then Overview (balance chart and the
 * part-payment calculator, missed EMIs, rate changes, planned repayments), Schedule and History.
 */
import { esc } from "../../../core/dom.ts";
import { addM, dLabel, mLabel, mShort, ymOf, type YM } from "../calc/dates.ts";
import { num, type Loan, type MoneyData, type Paise, type Rec, type Txn } from "../calc/data.ts";
import { bankOf, isEmiLike, kindOf, loanSum, loanTx, pmt, schedule, type LoanSum, type ScheduleRow } from "../calc/loans.ts";
import { accName, catName, famPlan, fmtD, paidMap, rateTxt } from "../calc/plan.ts";
import { pcOf } from "../calc/properties.ts";
import { blankFilter, money, txLine } from "./txlist.ts";
import { KIND_LBL, short } from "./accounts.ts";
import { plannedRow, planPage } from "./plan.ts";
import { chartCard, legendHtml, lineChart, mTicks, tipRows, type Series } from "./charts.ts";
import { field } from "../ui/kit.ts";
import { fundsOf } from "../ui/txform.ts";
import type { Page } from "./pages.ts";
import type { Tx } from "./txlist.ts";

/** The calculator's inputs, kept in rupees as typed (shared with the planner's page state). */
export interface LoanSim { id?: string; amt: number | ""; ym: YM; extra: number | ""; mode: string }
export interface LoanState { loanId?: string; loanTab?: string; lsim?: LoanSim | null; selOn?: boolean; sel?: Set<string> }
type L = Loan & { name?: string; lender?: string; categoryId?: string; fee?: Paise; gstRate?: number; principal?: Paise; plans?: { id: string; freq?: string; start: YM; end?: YM; amount?: Paise; accountId?: string }[] };
type LTx = Txn & { act?: string; part?: string; ym?: YM; covers?: string[]; mode?: string; note?: string; hist?: boolean; updatedAt?: number; cemi?: string; fromLoan?: string; categoryId?: string };

interface SimOut { from: YM; rows: { ym: YM; bal: number; emi: number }[]; int: number; saved: number; months: number; end: YM; newEmi: number | null; oldEmi: number }
function simLoan(d: MoneyData, l: Loan, sim: LoanSim | null): SimOut | null {
  const s = schedule(d, l); if (!s || !sim || !(+sim.amt > 0 || +sim.extra > 0)) return null;
  const now = ymOf(d.today), from = sim.ym && sim.ym > now ? sim.ym : addM(now, 1), base = s.rows.filter((r) => r.ym >= from); if (!base.length) return null;
  const r0 = base[0]!, r = r0.rate / 1200;
  let bal = Math.max(0, r0.open - (+sim.amt || 0) * 100), ym = from, int = 0;
  const left = base.length, emi = sim.mode === "emi" ? pmt(bal, r, left) : r0.emi, extra = (+sim.extra || 0) * 100, rows: SimOut["rows"] = [];
  for (let i = 0; i < 720 && bal > 50; i++) { const it = bal * r, pay = Math.min(emi + extra, bal + it); bal = Math.max(0, bal - (pay - it)); int += it; rows.push({ ym, bal, emi: pay }); ym = addM(ym, 1); }
  const baseInt = base.reduce((a, x) => a + x.int, 0);
  return { from, rows, int, saved: baseInt - int, months: base.length - rows.length, end: rows.length ? rows[rows.length - 1]!.ym : from, newEmi: sim.mode === "emi" ? emi : null, oldEmi: r0.emi };
}

function loanCharts(d: MoneyData, l: L, x: LoanSum, S: LoanState): string {
  const s = x.s; if (!s || !s.rows.length) return "";
  const now = ymOf(d.today), sim = S.lsim && S.lsim.id === l.id ? S.lsim : null, R = simLoan(d, l, sim);
  const rows = s.rows, M = rows.map((r) => r.ym), base = rows.map((r) => r.bal);
  const ser: (Series & { width?: number; paise: (number | null)[] })[] = [{ name: "As planned", color: "var(--v2)", values: base.map((v) => v / 100), paise: base }];
  if (R) { const m = new Map(R.rows.map((q) => [q.ym, q.bal])); const p = M.map((ym) => (ym < R.from ? null : m.has(ym) ? m.get(ym)! : 0)); ser.push({ name: "With part payment", color: "var(--v1)", values: p.map((v) => (v == null ? null : v / 100)), paise: p, dash: false, width: 2.5 }); ser[0]!.dash = true; }
  const mi = M.indexOf(now);
  const chart = chartCard("Outstanding over time", x.end ? `clears ${mShort(R ? R.end : x.end)}` : "", lineChart({
    labels: M.map(mShort), ticks: mTicks(M), full: M.map(mLabel), series: ser, area: R ? 1 : 0, h: 200, mark: mi >= 0 ? mi : null, aria: `${l.name} outstanding balance by month`,
    tip: (i) => tipRows(ser.filter((z) => z.paise[i] != null).map((z) => ({ n: z.name, c: ser.length > 1 ? z.color : "", v: money(z.paise[i]!) })), mLabel(M[i]!), `EMI ${money(rows[i]!.emi)} · interest ${money(rows[i]!.int)}`),
  }), legendHtml(ser));
  if (kindOf(l) === "cardemi" || l.closedOn) return chart;
  const v: LoanSim = sim || { amt: "", ym: addM(now, 1), mode: "tenure", extra: "" };
  const form = `<div class="card" style="margin-top:12px"><div style="font-weight:700">What if I pay extra?</div>
    <div class="grid2" style="margin-top:10px">${field(["spAmt", "One-time part payment (₹)", "number", { value: v.amt, step: "1000", ph: "e.g. 200000" }])}${field(["spYm", "In", "month", { value: v.ym }])}</div>
    ${field(["spEx", "Extra every month (₹, optional)", "number", { value: v.extra, step: "500", ph: "e.g. 5000" }])}
    <div class="seg" role="group" aria-label="After the part payment" id="spMode">${[["tenure", "Keep EMI, end sooner"], ["emi", "Keep end date, lower EMI"]].map(([k, t]) => `<button type="button" data-spm="${k}" aria-pressed="${v.mode === k}">${t}</button>`).join("")}</div>
    <div class="btns" style="margin-top:12px"><button class="btn pri sm" type="button" id="spGo">Work it out</button>${sim ? '<button class="btn sm" type="button" id="spClr">Clear</button>' : ""}</div>
    ${R ? `<div class="simout"><div><div class="k">Interest saved</div><div class="v in">${money(R.saved)}</div></div><div><div class="k">${R.newEmi ? "New EMI" : "Ends"}</div><div class="v">${R.newEmi ? money(R.newEmi) : `${mShort(R.end)}`}</div></div>
      <div><div class="k">${R.newEmi ? "EMI was" : "Months saved"}</div><div class="v">${R.newEmi ? money(R.oldEmi) : R.months}</div></div><div><div class="k">Interest still to pay</div><div class="v">${money(R.int)}</div></div></div>
      <p class="cnote">Assumes today's rate of ${rateTxt(rows.find((r) => r.ym >= R.from)?.rate || 0)}% stays the same. Your bank may charge a fee or ask you to choose how the payment is applied. To record a real one, use Part payment.</p>` : ""}</div>`;
  return chart + form;
}

function loanSpends(d: MoneyData, l: L): string {
  const sp = d.live<Tx>("txns").map((t) => [t, fundsOf(t).filter((f) => f.loan === l.id).reduce<{ loan: string; amt: number } | null>((a, f) => (a ? { ...a, amt: a.amt + f.amt } : f), null)] as const)
    .filter((e): e is readonly [Tx, { loan: string; amt: number }] => !!e[1]).sort((a, b) => (b[0].date ?? "").localeCompare(a[0].date ?? ""));
  if (!sp.length) return "";
  const x = loanSum(d, l), b = bankOf(l), borrowed = (x.own.borrowed || 0) + (b && kindOf(l) === "hybrid" ? num(b.principal) : isEmiLike(kindOf(l)) ? num(l.principal) : 0), used = sp.reduce((a, [, f]) => a + f.amt, 0);
  const pi = new Map(d.live<Rec & { txnId?: string; prop?: string; cat?: string }>("propItems").filter((i) => i.txnId).map((i) => [i.txnId!, i]));
  return `<h2>Where the money went<span class="sp"></span><span class="chip mute">${sp.length}</span></h2>
  <div class="list">${sp.map(([t, f]) => { const it = pi.get(t.id), pr = it && it.prop ? d.byId<Rec & { name?: string }>("props", it.prop) : undefined;
    const lt = t as LTx;
    return `<div class="row tap" data-tx="${esc(t.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(pr ? `${pr.name} · ${pcOf(d, it!.cat).name}` : (lt.note || catName(d, lt.categoryId)))}</div><div class="s">${fmtD(d, t.date!)} · ${esc(lt.fromLoan ? "paid straight from the loan" : accName(d, t.accountId))}${f.amt < num(t.amount) - 50 ? ` · ${money(f.amt)} of ${money(num(t.amount))}` : ""}</div></div><div class="amt">${money(f.amt)}</div></div>`; }).join("")}</div>
  <p class="note">${borrowed > 0 ? `${money(used)} of the ${money(borrowed)} borrowed is accounted for${used >= borrowed - 50 ? " (all of it)" : `; ${money(borrowed - used)} isn't linked to a spend yet`}.` : `${money(used)} spent with this loan's money.`}</p>`;
}

export function loanHtml(d: MoneyData, S: LoanState): string | null {
  const l = S.loanId ? d.byId<L>("loans", S.loanId) : undefined;
  if (!l || l.deleted) return null;
  const x = loanSum(d, l), now = ymOf(d.today), k = x.k, s = x.s, b = x.b;
  const tile = (t: string, v: string, c = ""): string => `<div class="tile"><div class="k">${t}</div><div class="v ${c}">${v}</div></div>`;
  const tiles = isEmiLike(k) ? [tile("Outstanding", short(x.bank)), tile(k === "cardemi" ? "EMI (before GST)" : "EMI", s ? short(x.emiNow) : "—"), tile("Ends", x.end ? mShort(x.end) : "—")]
    : k === "family" ? [tile("You owe", short(x.own.out)), tile("Borrowed", short(x.own.borrowed)), tile("Repaid", short(x.own.repaid), "in")]
    : [tile("Total owed", short(x.out)), tile("Bank part", short(x.bank)), tile("Own money part", short(x.own.out)), ...(x.missed > 50 ? [tile("Missed EMIs owed", short(x.missed), "neg")] : [])];
  const act = (a: string, t: string, pri?: 1): string => `<button class="btn sm ${pri ? "pri" : ""}" type="button" data-la="${a}">${t}</button>`;
  const acts = (l.closedOn ? [act("reopen", "Reopen loan", 1)] : k === "cardemi" ? [act("close", "Foreclosed / closed")] : k === "emi" ? [act("prepay", "Part payment", 1), s ? act("rate", "Rate change") : "", s ? act("sync", "Match bank statement") : "", act("close", "Mark as closed")]
    : k === "family" ? [act("borrow", "Borrowed", 1), act("repay", "Repaid", 1), act("plan", "Plan repayment"), act("close", "Mark as closed")]
    : [act("borrow", "Borrowed", 1), act("repay", "Repaid", 1), act("prepay", "Part payment"), act("rate", "Rate change"), s ? act("sync", "Match bank statement") : "", act("plan", "Plan repayment"), act("close", "Mark as closed")]).concat(act("edit", "Edit"));
  const tbl = (rows: ScheduleRow[]): string => `<div class="list" style="overflow-x:auto"><table class="sched"><thead><tr><th>Month</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Balance</th></tr></thead><tbody>${rows.map((r) => `<tr class="${r.ym === now ? "cur" : ""}"><td>${mShort(r.ym)}</td><td>${money(r.emi)}</td><td>${money(r.prin)}</td><td>${money(r.int)}</td><td>${money(r.bal)}</td></tr>`).join("")}</tbody></table></div>`;
  const hist = ((k === "cardemi" ? d.live<LTx>("txns").filter((t) => t.cemi === l.id) : loanTx(d, l.id)) as LTx[]).sort((p, q) => (q.date ?? "").localeCompare(p.date ?? "") || (num(q.updatedAt) - num(p.updatedAt)));
  const hline = (t: LTx): string => {
    const lbl = t.act === "borrow" ? (t.part === "bank" ? "Borrowed · bank-loan money" : (k === "hybrid" ? "Borrowed · their own money" : "Borrowed")) : t.act === "repay" ? "Repaid" : t.act === "missed" ? `Missed EMI · ${mShort(t.ym ?? "")}` : t.act === "catchup" ? `Paid missed EMI${(t.covers || []).length > 1 ? "s" : ""}` : `Part payment · ${t.mode === "emi" ? "reduced EMI" : t.mode === "tenure" ? "reduced tenure" : "principal"}`;
    const sub = t.act === "missed" ? `${esc(l.lender || "Relative")} paid the bank · you owe it to them` : `${new Date(t.date + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · ${t.accountId ? esc(accName(d, t.accountId)) : "No account"}${t.hist ? " · already in balances" : ""}`;
    const inn = t.act === "borrow" || t.act === "missed";
    return `<div class="row tap" data-tx="${esc(t.id)}" role="button" tabindex="0"><div class="main"><div class="t">${lbl}</div><div class="s">${sub}${t.note ? ` · ${esc(t.note)}` : ""}</div></div><div class="amt ${inn ? "in" : ""}">${inn ? "+" : "−"}${money(num(t.amount))}</div></div>`;
  };
  const mi = x.mi, paidM = paidMap(d);
  const unmarked = (k === "hybrid" && s) ? s.rows.filter((r) => r.ym <= now && !paidM.has(`l:${l.id}|${r.ym}`)) : [];
  const urow = (r: ScheduleRow): string => plannedRow(d, { key: `l:${l.id}|${r.ym}`, src: "u", type: "expense", name: `${mLabel(r.ym)} EMI`, amount: r.emi, canMiss: true, sub: r.ym === now ? "This month" : "Not marked yet" } as never, true);
  const lender = l.lender || "Relative", missedN = mi.list.filter((m) => !m.by).length;
  const missedSec = k === "hybrid" ? `
  <h2>EMIs to mark<span class="sp"></span>${unmarked.length ? `<span class="chip ${unmarked.some((r) => r.ym < now) ? "bad" : "mute"}">${unmarked.length}</span>` : ""}</h2>
  <div class="list">${unmarked.length ? unmarked.slice(-6).reverse().map(urow).join("") : '<div class="empty">All EMIs up to this month are marked paid or missed.</div>'}</div>
  ${unmarked.length > 6 ? `<p class="note">Showing the latest 6 of ${unmarked.length} unmarked EMIs. Older ones are from ${mShort(unmarked[0]!.ym)} on.</p>` : ""}
  <h2>Missed EMIs<span class="sp"></span>${mi.owed > 50 ? `<button class="btn sm pri" type="button" data-la="catchup">Pay missed EMIs</button>` : ""}</h2>
  <div class="list">${mi.list.length ? mi.list.slice().reverse().map((m) => `<div class="row tap" data-tx="${esc(m.t.id)}" role="button" tabindex="0"><div class="main"><div class="t">${mLabel(m.ym)} EMI ${m.by ? '<span class="chip good">Paid back</span>' : '<span class="chip bad">Owed</span>'}</div><div class="s">${m.by ? `Paid back on ${dLabel(m.by.date!)} ${m.by.date!.slice(0, 4)}` : `${esc(lender)} paid the bank`}</div></div><div class="amt">${money(m.amount)}</div></div>`).join("") : `<div class="empty">None. If you miss an EMI, tap Missed on it and ${esc(l.lender || "your relative")}'s payment to the bank is recorded as owed to them.</div>`}</div>
  ${mi.owed > 50 ? `<p class="note">You owe ${esc(l.lender || "them")} ${money(mi.owed)} for ${missedN} missed EMI${missedN > 1 ? "s" : ""}, interest-free.</p>` : ""}` : "";
  const rates = (b && (b as { rates?: { id: string; rate: number; ym: YM; mode?: string }[] }).rates) || [];
  const fp = famPlan(d, l).filter((p) => p.ym >= now), unpaidPlan = fp.filter((p) => !paidM.has(p.key)), planSum = unpaidPlan.reduce((a, p) => a + p.amount, 0);
  const upcoming = s ? s.rows.filter((r) => r.ym >= now).slice(0, 6) : [];
  const LT: [string, string][] = [["overview", "Overview"], ...(s ? [["schedule", "Schedule"] as [string, string]] : []), ["history", "History"]];
  const lt = LT.some(([v]) => v === S.loanTab) ? S.loanTab : "overview";
  const bb = b as (typeof b & { lender?: string; principal?: Paise; rate?: number; start?: YM }) | null;
  const stx = { f: blankFilter(), month: now, selOn: S.selOn, sel: S.sel };
  return `
  <div class="monthbar"><button class="btn sm" type="button" data-go="plan" aria-label="Back to Plan">‹</button><div class="m" style="text-align:left">${esc(l.name)}</div><span class="chip">${KIND_LBL[k]}</span></div>
  <p class="note">${esc(l.lender || "")}${k === "hybrid" && bb!.lender ? ` · bank loan with ${esc(bb!.lender)}` : ""}${k === "cardemi" ? ` · purchase category ${esc(catName(d, l.categoryId))}${num(l.fee) ? ` · processing fee ${money(num(l.fee))} + GST` : ""} · GST ${rateTxt(l.gstRate ?? 18)}% on interest` : ""}${!isEmiLike(k) ? `${l.lender ? " · " : ""}Their own money is interest-free` : ""}</p>
  <div class="tiles">${tiles.join("")}</div>
  ${bb && s ? `<div class="card" style="margin-top:8px"><div class="s" style="font-size:13.5px">${k === "hybrid" ? `Bank part: EMI ${money(x.emiNow)} · ends ${mShort(x.end ?? "")} · ` : ""}Rate ${rateTxt(x.rateNow)}%${rates.length ? " (floating)" : ""}</div>
    <div class="note" style="margin:4px 0 0">Interest paid so far ${money(x.paidInt)} · still to pay ${money(x.totalInt - x.paidInt)} · total ${money(x.totalInt)}</div>
    <div class="bar"><i style="width:${(num(bb.principal) ? Math.min(100, (1 - x.bank / num(bb.principal)) * 100) : 0).toFixed(1)}%"></i></div></div>` : ""}
  <div class="btns" style="margin-top:12px">${acts.join("")}</div>
  <div class="seg" role="group" aria-label="Loan sections" style="margin-top:16px">${LT.map(([v, lb]) => `<button type="button" data-lt="${v}" aria-pressed="${lt === v}">${lb}</button>`).join("")}</div>
  ${lt === "overview" && s ? loanCharts(d, l, x, S) : ""}
  ${lt === "overview" ? `${missedSec}` : ""}
  ${lt === "schedule" && upcoming.length ? `<h2>Upcoming EMIs</h2>${tbl(upcoming)}
    <details class="fm" style="margin-top:8px"><summary><span class="mn">Full schedule</span><span class="sub" style="text-align:right">${s!.rows.length} EMIs</span></summary>${tbl(s!.rows)}</details>` : ""}
  ${lt === "overview" && bb && s && k !== "cardemi" ? `<h2>Rate changes</h2><div class="list"><div class="row"><div class="main"><div class="t">${rateTxt(bb.rate)}%</div><div class="s">Starting rate from ${mShort(bb.start ?? "")}</div></div></div>${rates.map((r) => `<div class="row tap" data-rc="${esc(r.id)}" role="button" tabindex="0"><div class="main"><div class="t">${rateTxt(r.rate)}%</div><div class="s">From ${mShort(r.ym)} · ${r.mode === "emi" ? "kept tenure, EMI changed" : "kept EMI, tenure changed"}</div></div></div>`).join("")}</div>` : ""}
  ${lt === "overview" && !isEmiLike(k) ? `<h2>Planned repayments</h2><div class="list">${(l.plans || []).length ? (l.plans || []).map((p) => `<div class="row tap" data-pl="${esc(p.id)}" role="button" tabindex="0"><div class="main"><div class="t">${p.freq === "monthly" ? "Monthly" : "One time"}</div><div class="s">${p.freq === "monthly" ? `From ${mShort(p.start)}${p.end ? ` to ${mShort(p.end)}` : " until repaid"}` : mLabel(p.start)}${(p as { accountId?: string }).accountId ? ` · ${esc(accName(d, (p as { accountId?: string }).accountId))}` : ""}</div></div><div class="amt">${money(num(p.amount))}</div></div>`).join("") : '<div class="empty">No repayments planned. Plan one to see it in the forecast.</div>'}</div>
    ${unpaidPlan.length ? `<p class="note">${money(planSum)} planned from ${mShort(unpaidPlan[0]!.ym)}${planSum + 50 >= x.own.out ? ` · cleared by ${mShort(unpaidPlan[unpaidPlan.length - 1]!.ym)}` : ` · ${money(x.own.out - planSum)} still unplanned`}.</p>` : ""}` : ""}
  ${lt === "history" ? `<h2>History<span class="sp"></span>${hist.length ? `<span class="chip mute">${hist.length}</span>` : ""}</h2>
  <div class="list">${hist.length ? hist.map((t) => (k === "cardemi" ? txLine(d, t as never, stx) : hline(t))).join("") : `<div class="empty">${k === "cardemi" ? "EMIs are added to the card on each statement date and appear here once posted." : k === "emi" ? "No part payments yet. EMIs you mark as paid appear under Transactions." : "No entries yet. Add each borrowing and repayment with its date."}</div>`}</div>${loanSpends(d, l)}` : ""}
  ${lt === "overview" && isEmiLike(k) && !(bb && s) ? '<p class="note">Add a tenure and first EMI month (Edit) to see the schedule.</p>' : ""}`;
}

const simRead = (box: HTMLElement, d: MoneyData): Omit<LoanSim, "mode"> => {
  const v = (id: string): string => box.querySelector<HTMLInputElement>("#f_" + id)?.value ?? "";
  return { amt: parseFloat(v("spAmt").replace(/,/g, "")) || 0, ym: v("spYm") || addM(ymOf(d.today), 1), extra: parseFloat(v("spEx").replace(/,/g, "")) || 0 };
};
export const loanPage: Page = {
  html(d, h) {
    const x = loanHtml(d, h.state() as LoanState);
    if (x != null) return x;
    (h.state() as { view: string }).view = "plan";   // the loan is gone: Plan, as the planner does
    return planPage.html(d, h);
  },
  act(el, h, redraw) {
    const S = h.state() as unknown as LoanState, box = el.closest<HTMLElement>("#view")!, d = h.data();
    if (el.dataset.lt) { S.loanTab = el.dataset.lt; redraw(); return; }
    if (el.dataset.spm) { S.lsim = { ...(S.lsim || { amt: "", extra: "" }), ...simRead(box, d), mode: el.dataset.spm, id: S.loanId } as LoanSim; redraw(); return; }
    if (el.id === "spGo") {
      const v = simRead(box, d);
      if (!(+v.amt > 0) && !(+v.extra > 0)) { h.toast("Enter a part payment or an extra monthly amount."); return; }
      S.lsim = { ...v, mode: (S.lsim && S.lsim.id === S.loanId && S.lsim.mode) || "tenure", id: S.loanId }; redraw(); return;
    }
    if (el.id === "spClr") { S.lsim = null; redraw(); return; }
    if (el.dataset.go) { h.go(el.dataset.go); return; }
    return false;   // the loan's forms (part payment, rate, plan, close, edit) and entries: the planner's for now
  },
};
