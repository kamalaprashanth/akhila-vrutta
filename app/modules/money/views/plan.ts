/**
 * The Plan page, as in KP Money Planner: Month (a checklist of what's due), Regular (the repeating items,
 * and repeat payments found in your entries), Cash flow (readiness, the big-bills reserve, the emergency
 * fund, renewals, big months, the forecast), Calendar, and Goals. Built from the stored data (paise).
 */
import { esc } from "../../../core/dom.ts";
import { addM, dayDiff, diffM, dLabel, mLabel, MN, mShort, pad, ymOf, type Day, type YM } from "../calc/dates.ts";
import { num, type Loan, type MoneyData, type Paise, type Rec } from "../calc/data.ts";
import { accName, catName, fmtD, FREQ, paidMap, planned, type PlanItem, type Recurring } from "../calc/plan.ts";
import { forecast, mainAcc, type ForecastRow } from "../calc/forecast.ts";
import { bigBills, isBigItem, itemDate, readiness, reserveState } from "../calc/reserve.ts";
import { catLbl, emExcluded, emMonths, retireBase, spendByCat } from "../calc/insights.ts";
import { propList, type Property } from "../calc/properties.ts";
import { holdingSum, type Holding } from "../calc/invest.ts";
import { kindOf, loanSum } from "../calc/loans.ts";
import { money } from "./txlist.ts";
import { AX, barChart, chartCard, legendHtml, lineChart, mTick, tableHtml, tipRows } from "./charts.ts";
import { short } from "./accounts.ts";
import type { Page, PageHost } from "./pages.ts";

export const FREQ_LBL: Record<string, string> = { monthly: "Monthly", quarterly: "Every 3 months", halfyearly: "Every 6 months", yearly: "Yearly", biennial: "Every 2 years", triennial: "Every 3 years", once: "One time" };
const R = (p: Paise): number => p / 100;
const wd = (d: Day): string => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(d + "T00:00").getDay()]!;
const dShort = (d: Day): string => `${wd(d)} ${dLabel(d)}`;
export const dFull = (d: Day): string => `${+d.slice(8, 10)} ${MN[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;

export interface PlanState { planTab?: string; fcH?: number; bcM?: YM; bcD?: string; view?: string; accTab?: string }
type Row = ForecastRow & { budget?: Paise; spent?: Paise; paidC?: boolean; canMiss?: boolean; ends?: boolean; sub?: string; day?: number | null };

/** One planned item: Paid / Received / Missed buttons for this month's items. */
export function plannedRow(d: MoneyData, it: Row | (PlanItem & Partial<Row>), showPaid: boolean): string {
  if (it.src === "c") return `<div class="row"><div class="main"><div class="t">${esc(it.name)} <span class="chip mute">Card</span></div><div class="s">${it.day ? `Due ${it.day} · ` : ""}${esc(it.sub)}</div></div>
    <div class="amt">${money(num(it.amount))}</div>${showPaid ? (it.paidC ? '<span class="chip good">Paid</span>' : `<button class="btn sm" type="button" data-cpay="${esc(it.id)}">Pay</button>`) : ""}</div>`;
  if (it.src === "b") {
    const spent = num(it.spent), budget = num(it.budget), over = spent - budget, pct = budget ? Math.min(100, spent / budget * 100) : 0, left = Math.max(0, budget - spent);
    return `<div class="row tap" data-rec="${esc(it.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(it.name)} <span class="chip mute">Budget</span></div>
      <div class="s">Spent ${money(spent)} of ${money(budget)}${over > 50 ? ` · <span class="ccbad">over by ${money(over)}</span>` : ""}</div>
      <div class="bar"><i style="width:${pct.toFixed(1)}%;${over > 50 ? "background:var(--bad)" : ""}"></i></div></div>
      <div class="ccamt"><div class="cclbl">${over > 50 ? "Over" : "Left"}</div><div class="amt ${over > 50 ? "neg" : ""}">${money(over > 50 ? over : left)}</div></div></div>`;
  }
  const sign = it.type === "income" ? "in" : it.type === "transfer" ? "" : "out";
  const tag = it.type === "transfer" ? '<span class="chip mute">Transfer</span>' : it.type === "investment" ? '<span class="chip">Invest</span>' : it.src === "l" ? '<span class="chip mute">EMI</span>' : it.src === "p" ? '<span class="chip mute">Repay</span>' : it.type === "income" ? '<span class="chip good">Income</span>' : "";
  return `<div class="row"><div class="main"><div class="t">${esc(it.name)} ${tag} ${it.ends ? '<span class="chip good">Last one</span>' : ""}</div>
    <div class="s">${it.day ? `Due ${it.day} · ` : ""}${esc(it.sub || (it.type === "investment" ? "Investment" : catName(d, it.categoryId)))}</div></div>
    <div class="amt ${sign}">${it.type === "income" ? "+" : ""}${money(num(it.amount))}</div>
    ${showPaid ? (it.missed ? `<button type="button" class="chip bad chipbtn" data-undo="${esc(it.key)}" aria-label="Missed. Tap to undo or change">Missed ▾</button>` : it.paid ? `<button type="button" class="chip good chipbtn" data-undo="${esc(it.key)}" aria-label="${it.type === "income" ? "Received" : "Paid"}. Tap to undo or change">${it.type === "income" ? "Received" : "Paid"} ▾</button>` : `<span class="btns" style="flex-wrap:nowrap;gap:6px">${it.canMiss ? `<button class="btn sm" type="button" data-miss="${esc(it.key)}">Missed</button>` : ""}<button class="btn sm" type="button" data-pay="${esc(it.key)}">${it.type === "income" ? "Received" : "Paid"}</button></span>`) : ""}</div>`;
}

/* ---------- regular items ---------- */
function recNextLbl(d: MoneyData, r: Recurring): string {
  const now = ymOf(d.today), step = FREQ[String(r.freq)] || 1;
  if (!r.start) return "";
  let n = r.start >= now ? r.start : addM(r.start, Math.ceil(diffM(r.start, now) / step) * step);
  if (n === now && paidMap(d).has(`r:${r.id}|${now}`)) n = addM(n, step);
  return r.day ? dFull(itemDate({ day: r.day }, n)!) : mLabel(n);
}
const normNote = (s: unknown): string => String(s || "").toLowerCase().replace(/\d+/g, " ").replace(/[^a-zऀ-ॿ ]+/g, " ").replace(/\b(the|and|for|of|to|payment|bill|paid|monthly|month|renewal|recharge)\b/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" ");
type ETx = Rec & { type?: string; date?: Day; note?: string; amount?: Paise; accountId?: string; paidBy?: string; categoryId?: string; link?: string; cemi?: string; splitOf?: string };
export interface Repeat { key: string; name: string; amount: Paise; freq: string; day: number; categoryId?: string; accountId: string; n: number; last: Day; monthly: number }
export function findRepeats(d: MoneyData, ignored: string[]): Repeat[] {
  return d.memo("rep:" + ignored.join("\u0001"), () => {
    const now = ymOf(d.today), since = addM(now, -12) + "-01", G = new Map<string, ETx[]>(), ign = new Set(ignored);
    for (const t of d.live<ETx>("txns")) if (t.type === "expense" && !t.link && !t.cemi && !t.splitOf && (t.date ?? "") >= since) {
      const k = normNote(t.note);
      if (k.length < 3) continue;
      const key = k + "|" + (t.accountId || "@" + t.paidBy);
      if (!G.has(key)) G.set(key, []);
      G.get(key)!.push(t);
    }
    const rec = d.live<Recurring>("recurring"), out: Repeat[] = [];
    for (const [key, ts] of G) {
      if (ign.has(key)) continue;
      const months = [...new Set(ts.map((t) => ymOf(t.date ?? "")))].sort();
      if (months.length < 3) continue;
      const amts = ts.map((t) => num(t.amount)).sort((a, b) => a - b), med = amts[Math.floor(amts.length / 2)]!;
      if (amts.filter((a) => Math.abs(a - med) <= Math.max(1000, med * .15)).length < amts.length * .75) continue;
      if (ts.length > months.length * 1.5) continue;
      const gaps = months.slice(1).map((m, i) => diffM(months[i]!, m)).sort((a, b) => a - b), g = gaps[Math.floor(gaps.length / 2)]!;
      const freq = g <= 1 ? "monthly" : g === 3 ? "quarterly" : null;
      if (!freq || med < 10000) continue;
      if (gaps.filter((x) => (freq === "monthly" ? x <= 2 : Math.abs(x - 3) <= 1)).length < gaps.length * .75) continue;
      if (freq === "monthly" && months.length < 4) continue;
      if (diffM(months[months.length - 1]!, now) > (FREQ[freq] || 1) + 1) continue;
      const last = ts.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]!, words = new Set(normNote(last.note).split(" "));
      const inPlan = rec.some((r) => r.type === "expense" && (!r.end || r.end >= now) && (normNote(r.name).split(" ").some((w) => w.length > 2 && words.has(w)) || (r.categoryId === last.categoryId && Math.abs(num(r.amount) - med) <= med * .1)));
      if (inPlan || d.live<Loan & { name?: string }>("loans").some((l) => !l.closedOn && normNote(l.name).split(" ").some((w) => w.length > 2 && words.has(w)))) continue;
      const days = ts.map((t) => +String(t.date).slice(8)).sort((a, b) => a - b);
      out.push({ key, name: String(last.note).trim(), amount: med, freq, day: days[Math.floor(days.length / 2)]!, categoryId: last.categoryId, accountId: last.accountId || "", n: ts.length, last: last.date!, monthly: med / (FREQ[freq] || 1) });
    }
    return out.sort((a, b) => b.monthly - a.monthly);
  });
}
function repeatsSection(d: MoneyData, h: PageHost): string {
  const Rp = findRepeats(d, h.pref<string[]>("repIgnore", []));
  if (!Rp.length) return "";
  return `<div class="sh"><h3>Repeat payments found</h3><span class="note" style="margin:0">${Rp.length} not in your plan</span></div>
  <div class="list">${Rp.slice(0, 12).map((r) => `<div class="row"><div class="main"><div class="t">${esc(r.name)}</div><div class="s">${FREQ_LBL[r.freq]} · about ${money(r.amount)} · seen ${r.n} times, last ${fmtD(d, r.last)}${r.accountId ? ` · ${esc(accName(d, r.accountId))}` : ""}</div></div>
    <span class="btns" style="flex-wrap:nowrap;gap:6px"><button class="btn sm" type="button" data-repign="${esc(r.key)}">Not regular</button><button class="btn sm pri" type="button" data-repadd="${esc(r.key)}">Add</button></span></div>`).join("")}</div>
  <p class="note">Found in the last 12 months: the same note on the same account, a similar amount, on a schedule. Adding one puts it in your forecast.</p>`;
}

/* ---------- cash flow ---------- */
function renewalsList(d: MoneyData): string {
  const B = bigBills(d);
  if (!B.length) return "";
  const yr = B.reduce((s, x) => s + x.amt * 12 / x.step, 0);
  return `<div class="sh"><h3>Renewals</h3><span class="note" style="margin:0">${money(yr)} a year · ${money(yr / 12)} a month</span></div><div class="list">${B.map((x) => {
    const r = x.r as Recurring & { remind?: number; auto?: boolean; provider?: string }, days = dayDiff(d.today, itemDate({ day: r.day || 1 }, x.next)!), rem = num(r.remind);
    return `<div class="row tap" data-rec="${esc(r.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(r.name)}${r.auto ? ' <span class="chip mute">Auto</span>' : ""}${rem && days <= rem && days >= 0 ? ' <span class="chip warn">Soon</span>' : ""}</div><div class="s">${r.day ? `${r.day} ` : ""}${mLabel(x.next)} · ${FREQ_LBL[String(r.freq)]}${r.provider ? ` · ${esc(r.provider)}` : ""}${rem ? ` · remind ${rem} days before` : ""}</div></div><div class="amt">${money(x.amt)}</div></div>`;
  }).join("")}</div>`;
}
interface PlanRow { amt?: Paise; gst?: Paise; who?: string; tds?: boolean; done?: boolean; when?: string; name?: string }
const propRowYou = (p: Property & { fund?: { ltv?: number } }, r: PlanRow): number => {
  const t = num(r.amt) + num(r.gst);
  if (r.who === "you") return t + (r.tds ? t * 0.01 : 0);
  if (r.who === "bank") return r.tds ? t * 0.01 : 0;
  const ltv = (p.fund?.ltv ?? 75) / 100;
  return t * (1 - ltv) + (r.tds ? t * 0.01 : 0);
};
function bigMonths(d: MoneyData): string {
  const fc = forecast(d, 12), M = fc.months.map((m) => m.ym);
  const big = fc.months.map((m) => m.rows.filter((r) => r.type !== "income" && r.type !== "transfer" && isBigItem(d, r)).reduce((s, r) => s + num(r.amount), 0));
  const props = propList(d) as (Property & { plan?: PlanRow[]; fund?: { ltv?: number } })[];
  const pp = M.map((ym) => props.reduce((s, p) => s + (p.plan ?? []).filter((r) => !r.done && r.when && r.when.slice(0, 7) === ym).reduce((a, r) => a + propRowYou(p, r), 0), 0));
  const reg = fc.months.map((m, i) => m.out + m.inv - big[i]!);
  const ser = [{ name: "Regular", color: "var(--v2)", values: reg.map(R) }, { name: "Big bills", color: "var(--v3)", values: big.map(R) }, { name: "Property", color: "var(--v5)", values: pp.map(R) }].filter((s) => s.values.some((v) => v > 0.5));
  const top = M.map((ym, i) => ({ ym, i, t: reg[i]! + big[i]! + pp[i]! })).sort((a, b) => b.t - a.t).slice(0, 3).filter((x) => big[x.i]! + pp[x.i]! > 50);
  const names = (ym: YM): string => [...fc.months.find((m) => m.ym === ym)!.rows.filter((r) => isBigItem(d, r)).map((r) => `${r.name} ${short(num(r.amount))}`), ...props.flatMap((p) => (p.plan ?? []).filter((r) => !r.done && r.when && r.when.slice(0, 7) === ym).map((r) => `${p.name}: ${r.name}`))].join(", ");
  return `<div class="sh"><h3>Big months · next 12</h3></div>` + chartCard("Going out each month", "",
    barChart({ labels: M.map(mShort), ticks: M.map(mTick), full: M.map(mLabel), series: ser, stack: true, h: 200, aria: "Money going out each month for the next 12 months", foot: (i) => `Total ${money(reg[i]! + big[i]! + pp[i]!)}` }),
    legendHtml(ser) + (top.length ? `<p class="cnote">${top.map((x) => `<b>${mLabel(x.ym)}</b> ${money(x.t)}: ${esc(names(x.ym))}`).join("<br>")}</p>` : "") + `<p class="cnote">Regular is everything monthly (bills, EMIs, SIPs, card bills). Property counts only payments with a month set, your share.</p>`);
}
function forecastChart(d: MoneyData, fc: ReturnType<typeof forecast>, h: PageHost): string {
  const F = fc.months, min = +h.pref("fcMin", 0) || 0, vals = F.map((m) => R(m.bal)), below = F.filter((m) => R(m.bal) < min - 0.5);
  const tip = (i: number): string => { const m = F[i]!; return tipRows([{ n: "Coming in", v: money(m.inc) }, { n: "Going out", v: money(m.out) }, { n: "Investing", v: money(m.inv) }, { n: "Closing balance", v: `<span style="font-weight:800">${money(m.bal)}</span>` }], mLabel(m.ym), R(m.bal) < min - 0.5 ? `Below your ₹${AX(min)} line` : ""); };
  return chartCard("Closing balance", `from ${money(fc.start)} today`,
    lineChart({ labels: F.map((m) => mShort(m.ym)), ticks: F.map((m) => mTick(m.ym)), series: [{ name: "Closing balance", color: vals[vals.length - 1]! < 0 ? "var(--bad)" : "var(--v1)", values: vals, width: 2.5 }], area: 0, dots: F.length <= 12, band: min > 0 || vals.some((v) => v < 0) ? { v: min, label: min > 0 ? `keep ≥ ${AX(min)}` : "below zero" } : undefined, h: 220, tip, aria: `Projected closing balance for the next ${F.length} months` }),
    `<div class="chsel" style="margin-top:10px"><label class="note" for="fcMin" style="margin:0">Keep at least ₹</label><input id="fcMin" type="number" inputmode="decimal" step="1000" value="${min || ""}" placeholder="0" style="width:120px;font:600 13px var(--body);padding:6px 10px;border-radius:10px;border:1px solid var(--line2);background:var(--raised);color:var(--ink)"></div>
     ${below.length ? `<p class="cnote"><b style="color:var(--bad)">⚠ ${below.length} month${below.length === 1 ? "" : "s"} below ${money(Math.round(min * 100))}:</b> ${below.map((m) => mShort(m.ym)).join(", ")}.</p>` : min > 0 ? `<p class="cnote">✓ Stays above ${money(Math.round(min * 100))} every month.</p>` : ""}` +
    tableHtml(F.map((m) => mLabel(m.ym)), [{ name: "In", values: F.map((m) => R(m.inc)) }, { name: "Out", values: F.map((m) => R(m.out)) }, { name: "Invest", values: F.map((m) => R(m.inv)) }, { name: "Closing", values: vals }]));
}
function forecastPanel(d: MoneyData, st: PlanState, h: PageHost): string {
  const fc = forecast(d, st.fcH || 12), F = fc.months;
  const short2 = F.filter((m) => m.net < 0).length;
  return `<div class="seg" role="group" aria-label="Forecast length" style="margin-top:12px">${[6, 12, 24].map((x) => `<button type="button" data-h="${x}" aria-pressed="${st.fcH === x}">${x} months</button>`).join("")}</div>
  <div style="height:12px"></div>${forecastChart(d, fc, h)}
  ${short2 ? `<p class="note">${short2} of ${F.length} months spend more than they bring in.${F.every((m) => !m.inc) ? " No income is planned yet: add your salary in Plan." : ""}</p>` : ""}
  <div class="sh"><h3>Month by month</h3><span class="note" style="margin:0">tap a month for its items</span></div>
  ${F.map((m, i) => `<details class="fm" ><summary><span class="mn">${mLabel(m.ym)}${i === 0 ? ' <span class="chip">unpaid only</span>' : ""}</span><span class="net ${m.bal < -50 ? "neg" : ""}">${money(m.bal)}</span>
    <span class="sub">In ${money(m.inc)} · Out ${money(m.out + m.inv)}</span><span class="bal">closing</span></summary>
    <div class="items">${m.rows.length ? m.rows.map((r) => plannedRow(d, r as Row, i === 0)).join("") : '<div class="empty">Nothing planned.</div>'}</div></details>`).join("")}`;
}
function readyTab(d: MoneyData, st: PlanState, h: PageHost): string {
  const Rd = readiness(d, 45), rst = reserveState(d), m0 = mainAcc(d);
  const acc = (a: unknown): Rec & { name: string; minBal?: Paise; emTarget?: Paise } => a as Rec & { name: string; minBal?: Paise; emTarget?: Paise };
  const rd = `<div class="sh"><h3>Readiness · next 45 days</h3></div>
    <div class="list">${Rd.length ? Rd.map((s) => `<div class="row"><div class="main"><div class="t">⚠ ${esc(s.acc.name)} runs short on ${dShort(s.date)}</div><div class="s">${esc(s.item.name)} ${money(num(s.item.amount))} · it would have ${money(s.bal)}${num(acc(s.acc).minBal) ? ` (minimum ${money(num(acc(s.acc).minBal))})` : ""}${s.from ? ` · move ${money(s.need)} from ${esc(s.from.name)} by ${dShort(s.by!)}` : " · no account has enough spare"}</div></div>${s.from ? `<button class="btn sm pri" type="button" data-ptmove="${esc(s.acc.id)}|${esc(s.from.id)}|${R(s.need)}|${esc(s.item.name)}">Move</button>` : ""}</div>`).join("")
      : `<div class="row"><div class="main"><div class="t">✓ Every account has enough for the next 45 days</div><div class="s">Lowest points: ${Rd.lows.filter((x) => Math.abs(x.low) > 50 || x.acc.id === (m0 || { id: undefined }).id).slice(0, 4).map((x) => `${esc(x.acc.name)} ${money(x.low)} on ${dLabel(x.lowD)}`).join(" · ")}</div></div></div>`}</div>
    <p class="note">Looks at each account's balance today, then adds what's coming in (salary on the 1st) and takes off bills, EMIs, SIPs and card bills on their dates. Set an optional minimum to keep in an account by editing it.</p>`;
  let rs: string;
  if (!rst.a) rs = `<div class="sh"><h3>Big-bills reserve</h3></div><div class="list"><div class="empty">Choose the account that holds your reserve and emergency fund: edit the account (for example Slice) and tick "Holds my big-bills reserve and emergency fund".</div></div>`;
  else {
    const a = acc(rst.a), pct = rst.target > 0 ? Math.min(100, rst.held / rst.target * 100) : 100;
    rs = `<div class="sh"><h3>Big-bills reserve · in ${esc(a.name)}</h3></div>
    <div class="card"><div class="kv" style="margin-top:0"><span>Put aside this month</span><b>${money(rst.monthly)}</b>
      ${rst.thisIn > 50 ? `<span>Added this month</span><b>${money(rst.thisIn)}</b>` : ""}
      <span class="tot">${rst.doneThis ? "This month" : "Still to put aside"}</span><b class="tot">${rst.doneThis ? "✓ Done" : money(rst.setAside)}</b>
      <span>Reserve holds</span><b>${money(rst.held)} of ${money(rst.target)}</b></div>
      ${rst.capped ? `<p class="cnote">${money(rst.setAsideFull)} is due this month, but ${esc(rst.spareFrom!.name)} can only spare ${money(rst.setAside)} before month-end without going short. The other ${money(rst.setAsideFull - rst.setAside)} is spread over the next months automatically.</p>` : ""}
      <div class="pmini" aria-hidden="true"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="btns" style="margin-top:12px">${rst.doneThis || rst.setAside <= 50 ? "" : `<button class="btn pri" type="button" data-ptaside="reserve|${Math.round(rst.setAside / 100)}">Put aside ${money(rst.setAside)}</button>`}<button class="btn" type="button" data-ptaside="reserve|extra">Add extra money</button></div></div>
    <div class="list" style="margin-top:12px">${rst.B.map((x) => { const r = x.r as Recurring & { provider?: string }; return `<div class="row tap" data-rec="${esc(r.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(r.name)}${r.provider ? ` <span class="chip mute">${esc(r.provider)}</span>` : ""}</div><div class="s">${money(x.amt)} due ${dFull(itemDate({ day: r.day || 1 }, x.next)!)} · ${num(x.have) >= x.amt - 50 ? "fully set aside ✓" : `${money(num(x.have))} set aside`}${num(x.ask) > 50 ? ` · ${x.months} month${x.months === 1 ? "" : "s"} to go` : ""}</div></div><div class="amt">${num(x.ask) > 50 ? `${money(num(x.ask))}<div class="s mut" style="font-size:12px;font-weight:400">a month</div>` : "✓"}</div></div>`; }).join("") || '<div class="empty">No bills every 3 months or longer yet. Add them in Regular, with how often they come.</div>'}</div>
    <p class="note">Each bill's amount is spread over the months left before it's due, counting from when you start. If you skip a month, the gap is spread over the months that remain. Extra money goes to the bills due soonest and lowers what's asked in later months. Pay big bills from ${esc(a.name)} with "Paid from the big-bills reserve" ticked.</p>
    ${rst.funds.map((f) => `<div class="sh"><h3>${esc(f.p.name)} fund</h3></div><div class="card"><div class="kv" style="margin-top:0"><span>Needed by ${mLabel(f.by)}</span><b>${money(f.need)}</b><span>Set aside so far</span><b>${money(f.have)}</b><span class="tot">Each month</span><b class="tot">${money(f.monthly)}</b></div><p class="cnote">Your share of the price still to pay, the TDS, loan charges and registration costs from the property's Expected tab. Change the date in the property's Expected tab.</p></div>`).join("")}
    <div class="sh"><h3>Emergency fund · in ${esc(a.name)}</h3></div>
    <div class="card"><div class="kv" style="margin-top:0"><span>${esc(a.name)} balance</span><b>${money(rst.bal)}</b><span>Less the reserve${rst.funds.length ? " and funds" : ""}</span><b>−${money(rst.bal - rst.emergency)}</b><span class="tot">Emergency fund</span><b class="tot ${rst.emergency < 0 ? "neg" : ""}">${money(rst.emergency)}</b>
      <span>Target${num(a.emTarget) > 0 ? " (yours)" : ` (${emMonths(d)} months)`}</span><b>${money(rst.emTarget)}</b></div>
      <div class="pmini" aria-hidden="true"><i style="width:${rst.emTarget > 0 ? Math.max(0, Math.min(100, rst.emergency / rst.emTarget * 100)).toFixed(1) : 0}%"></i></div>
      <p class="cnote">${num(a.emTarget) > 0 ? `You set your own target. The suggestion is ${money(rst.emSuggest)}: ` : ""}${emMonths(d)} months of your average monthly spending over the last 12 months (${money(rst.avg)}), across every category except the ones crossed out. Tap a category to include it or leave it out.${rst.bal > 50000000 ? " Deposits are insured up to ₹5 lakh per bank: consider keeping part of it in another bank." : ""}</p>
      <table class="emtab">${(() => { const ex = emExcluded(d); return [...spendByCat(d)].filter(([, v]) => v >= 100).sort((x, y) => y[1] - x[1]).map(([k, v]) => `<tr class="tap ${ex.has(k) ? "off" : ""}" data-emcat="${esc(k)}"><td>${esc(catLbl(d, k))}</td><td>${money(v)}</td></tr>`).join(""); })()}<tr><td><b>Monthly spending counted</b></td><td><b>${money(rst.avg)}</b></td></tr></table>
      <div class="btns" style="margin-top:10px"><button class="btn sm" type="button" id="emSet">Months to cover or own target ›</button></div></div>`;
  }
  return rd + rs + renewalsList(d) + bigMonths(d) + `<div style="height:6px"></div>` + forecastPanel(d, st, h) + `<p class="note" style="margin-top:16px">Items set to "move to the next trading day" skip weekends and NSE holidays. <button class="lnk" type="button" data-holi="1">Market holidays ›</button></p>`;
}

/* ---------- calendar ---------- */
function itemDay(d: MoneyData, it: PlanItem & { day?: number | null }): number | null {
  if (it.src === "c") { const a = d.byId<Rec & { dueDay?: number }>("accounts", it.id); return a && num(a.dueDay) ? num(a.dueDay) : null; }
  return it.day || null;
}
function billsCalendar(d: MoneyData, st: PlanState): string {
  const now = ymOf(d.today), ym = st.bcM || now, [y, m] = ym.split("-").map(Number) as [number, number], nd = new Date(y, m, 0).getDate(), lead = (new Date(y, m - 1, 1).getDay() + 6) % 7, td = d.today, paid = paidMap(d);
  const items = planned(d, ym).map((it) => ({ ...it, paid: !!paid.get(it.key) || !!(it as Row).paidC, dd: Math.min(nd, itemDay(d, it) || 0) })) as (Row & { dd: number })[];
  const by = new Map<number, typeof items>();
  for (const it of items) { if (!it.dd) continue; if (!by.has(it.dd)) by.set(it.dd, []); by.get(it.dd)!.push(it); }
  const col = (it: Row): string => (it.type === "income" ? "var(--v1)" : it.type === "investment" ? "var(--v2)" : it.type === "transfer" ? "var(--vO)" : "var(--v3)");
  const selD = st.bcD && st.bcD.startsWith(ym) ? +st.bcD.slice(8) : null;
  let cells = ["M", "T", "W", "T", "F", "S", "S"].map((x) => `<div class="hw">${x}</div>`).join("") + Array.from({ length: lead }, () => '<div class="bd x"></div>').join("");
  for (let dd = 1; dd <= nd; dd++) {
    const L = by.get(dd) || [], ds = `${ym}-${pad(dd)}`, out = L.filter((i) => i.type !== "income" && i.type !== "transfer").reduce((a, i) => a + (i.src === "b" ? num(i.budget) : num(i.amount)), 0);
    cells += `<button type="button" class="bd ${ds === td ? "td" : ""} ${ds < td ? "past" : ""}" data-bcd="${ds}" aria-pressed="${selD === dd}" aria-label="${dLabel(ds)}: ${L.length} item${L.length === 1 ? "" : "s"}"><span class="n">${dd}</span>${L.length ? `<span class="dots">${L.slice(0, 4).map((i) => `<i style="background:${col(i)};${i.paid ? "opacity:.35" : ""}"></i>`).join("")}</span>${out > 50 ? `<span class="a">${AX(R(out))}</span>` : ""}` : ""}</button>`;
  }
  const dayList = selD ? by.get(selD) || [] : items.filter((i) => !i.paid && i.dd && `${ym}-${pad(i.dd)}` >= td).sort((a, b) => a.dd - b.dd).slice(0, 8);
  const noDay = items.filter((i) => !i.dd);
  return `<div class="monthbar"><button class="btn sm" type="button" data-bcm="-1" aria-label="Previous month">‹</button><div class="m">${mLabel(ym)}</div><button class="btn sm" type="button" data-bcm="1" aria-label="Next month">›</button></div>
  <div class="bcal">${cells}</div>
  <div class="legend" style="margin:8px 4px 0"><span><i style="background:var(--v3)"></i>Bills &amp; EMIs</span><span><i style="background:var(--v2)"></i>SIPs</span><span><i style="background:var(--v1)"></i>Income</span><span><i style="background:var(--v3);opacity:.35"></i>Paid</span></div>
  <div class="sh"><h3>${selD ? dLabel(`${ym}-${pad(selD)}`) : "Coming up"}</h3>${selD ? `<button class="lnk" type="button" data-bcd="">Show coming up ›</button>` : ""}</div>
  <div class="list">${dayList.length ? dayList.map((it) => plannedRow(d, it, ym === now)).join("") : `<div class="empty">${selD ? "Nothing due on this day." : "Nothing else due this month."}</div>`}</div>
  ${noDay.length ? `<div class="sh"><h3>Any day this month</h3></div><div class="list">${noDay.map((it) => plannedRow(d, it, ym === now)).join("")}</div>` : ""}
  <p class="note">Add a due day to regular items (Plan › Regular) to place them on the calendar. For phone reminders, add your bills to Google Calendar from Settings › Reminders.</p>`;
}

/* ---------- goals ---------- */
interface Goal extends Rec { kind?: string; name?: string; pri?: number; by?: YM; loans?: string[]; holdings?: string[]; kid?: number; kidId?: string; target?: Paise; saved?: Paise;
  school?: Paise; ug?: Paise; pg?: Paise; spend?: Paise; inf?: number; ret?: number; life?: number; pre?: number; post?: number }
interface Profile extends Rec { dob?: string; age?: string | number; retire?: string | number; kids?: { id?: string; name?: string; dob?: string }[] }
export const GOAL_KINDS: Record<string, string> = { loans: "Close loans", edu: "Child education", retire: "Retirement", custom: "Savings goal" };
const EDU_DEF = { school: 16000000, ug: 200000000, pg: 250000000, inf: 10, ret: 11 };
const RET_DEF = { inf: 6, pre: 11, post: 7, life: 85 };
const prof = (d: MoneyData): Profile => d.byId<Profile>("settings", "profile") ?? { id: "profile" };
const ageOf = (d: MoneyData, dob?: string): number | null => { if (!dob) return null; const t = d.today, y = +t.slice(0, 4) - +dob.slice(0, 4); return t.slice(5) >= dob.slice(5) ? y : y - 1; };
const myAge = (d: MoneyData): number | null => { const P = prof(d); return ageOf(d, P.dob) ?? (P.age ? +P.age : null); };
/** ₹1.39 crore / ₹4.5 lakh (word joiner after ₹ keeps the paise styling off). */
export const shortAmt = (p: Paise): string => { const v = p / 100; return v >= 1e7 ? `₹⁠${(v / 1e7).toFixed(2).replace(/\.?0+$/, "")} crore` : v >= 1e5 ? `₹⁠${(v / 1e5).toFixed(1).replace(/\.0$/, "")} lakh` : money(p); };
const fv = (pv: number, r: number, n: number): number => pv * Math.pow(1 + r, n);
const sipFor = (target: number, annual: number, months: number): number => { if (months <= 0) return target; const i = annual / 12; return target * i / (Math.pow(1 + i, months) - 1); };
const sipFv = (sip: number, annual: number, months: number): number => { const i = annual / 12; return months > 0 ? sip * (Math.pow(1 + i, months) - 1) / i : 0; };
export function goalSum(d: MoneyData, g: Goal) {
  const linked = (g.holdings ?? []).map((id) => d.byId<Holding>("holdings", id)).filter((h): h is Holding => !!h && !h.deleted), fromH = linked.reduce((a, h) => a + holdingSum(d, h).value, 0);
  const have = num(g.saved) + fromH, target = num(g.target), now = ymOf(d.today), monthsLeft = g.by ? Math.max(0, diffM(now, g.by)) : 0;
  const gap = Math.max(0, target - have);
  return { have, fromH, linked, target, pct: target > 0 ? Math.min(100, have / target * 100) : 0, gap, monthsLeft, need: monthsLeft > 0 ? gap / monthsLeft : gap };
}
export function smartGoal(d: MoneyData, g: Goal): { pct: number; sub: string; rows: [string, string][]; ok: boolean; msg: string; done?: boolean } {
  const now = ymOf(d.today), P = prof(d), yr = +d.today.slice(0, 4);
  if (g.kind === "loans") {
    const L = (g.loans ?? []).map((id) => d.byId<Loan & { name?: string }>("loans", id)).filter((l): l is Loan & { name?: string } => !!l && !l.deleted);
    let left = 0, repaid = 0;
    for (const l of L) { const x = loanSum(d, l); left += x.out; repaid += x.own?.repaid || 0; }
    const by = g.by || `${yr + 1}-12`, m = Math.max(1, diffM(now, by)), need = left / m, pct = left + repaid > 0 ? repaid / (left + repaid) * 100 : 100;
    return { pct, done: left < 50, sub: `${L.map((l) => l.name).join(", ") || "No loans picked"} · by ${mLabel(by)}`, rows: [["Left to repay", money(left)], ["Months left", String(m)], ["Repaid so far", repaid > 50 ? money(repaid) : "—"], ["Needed each month", money(need)]], ok: left < 50, msg: left < 50 ? "All repaid ✓" : `Repay about ${money(need)} a month to close them by ${mLabel(by)}.` };
  }
  if (g.kind === "edu") {
    const c = (g.kidId ? (P.kids ?? []).find((k) => k.id === g.kidId) : (P.kids ?? [])[g.kid || 0]) || {}, a = ageOf(d, c.dob), name = c.name || "Child";
    if (a == null) return { pct: 0, sub: `${name} · add the date of birth in Settings › My profile › About me`, rows: [], ok: false, msg: "Needs the child's date of birth." };
    const inf = (num(g.inf) || EDU_DEF.inf) / 100, r = (num(g.ret) || EDU_DEF.ret) / 100, school = num(g.school) || EDU_DEF.school, ug = num(g.ug) || EDU_DEF.ug, pg = num(g.pg) || EDU_DEF.pg;
    const yUG = Math.max(0, 18 - a), yPG = Math.max(0, 22 - a), fUG = a < 18 ? fv(ug, inf, yUG) : 0, fPG = a < 22 ? fv(pg, inf, yPG) : 0;
    const linked = (g.holdings ?? []).map((id) => d.byId<Holding>("holdings", id)).filter((h): h is Holding => !!h && !h.deleted), have = linked.reduce((s, h) => s + holdingSum(d, h).value, 0);
    const hUG = Math.min(fUG, fv(have, r, yUG)), rest = Math.max(0, fv(have, r, yUG) - fUG);
    const needUG = Math.max(0, fUG - hUG), needPG = Math.max(0, fPG - fv(rest, r, yPG - yUG));
    const sip = (yUG > 0 ? sipFor(needUG, r, yUG * 12) : needUG) + (yPG > 0 ? sipFor(needPG, r, yPG * 12) : needPG);
    const schoolNow = a >= 3 && a < 18 ? school : 0, schoolLast = a < 18 ? fv(school, inf, Math.max(0, 17 - a)) : 0;
    let schoolTot = 0;
    for (let y = 0; y < Math.max(0, 18 - Math.max(a, 3)); y++) schoolTot += fv(school, inf, y);
    const tot = fUG + fPG, pct = tot > 0 ? Math.min(100, fv(have, r, yUG) / tot * 100) : 100;
    return { pct, sub: `${name} (${a}) · school ${shortAmt(school)} a year · graduation at 18: ${shortAmt(ug)} · post-grad at 22: ${shortAmt(pg)} (today's money, rising ${(inf * 100).toFixed(0)}% a year)`,
      rows: [[a < 3 ? `School from ${yr + 3 - a}` : "School this year", schoolNow ? money(schoolNow) : a < 3 ? shortAmt(fv(school, inf, 3 - a)) + " a year" : "—"], ["School fee in class 12", schoolLast ? shortAmt(schoolLast) : "—"], [`Graduation in ${yr + yUG}`, fUG ? shortAmt(fUG) : "—"], [`Post-grad in ${yr + yPG}`, fPG ? shortAmt(fPG) : "—"], ["Linked so far", money(have)], ["SIP needed", `${money(sip)} a month`]],
      ok: sip < 50, msg: `${linked.length ? "" : "No investments linked yet. "}Put about ${money(sip)} a month into growth funds for graduation and post-grad. School fees (about ${shortAmt(schoolTot)} over the remaining years) are paid from income each year: add them in Regular as a yearly bill so the reserve saves for them.` };
  }
  if (g.kind === "retire") {
    const a = myAge(d), ra = +(P.retire ?? 0) || 60, life = num(g.life) || RET_DEF.life, inf = (num(g.inf) || RET_DEF.inf) / 100, pre = (num(g.pre) || RET_DEF.pre) / 100, post = (num(g.post) || RET_DEF.post) / 100;
    if (a == null) return { pct: 0, sub: "Add your date of birth and retirement age in Settings › My profile › About me", rows: [], ok: false, msg: "Needs your date of birth." };
    const yrs = Math.max(0, ra - a), base = num(g.spend) || retireBase(d), atR = fv(base, inf, yrs), rr = (1 + post) / (1 + inf) - 1, n = Math.max(1, life - ra);
    const corpus = atR * 12 * (rr ? (1 - Math.pow(1 + rr, -n)) / rr * (1 + rr) : n);
    const H = d.live<Holding>("holdings").filter((h) => !h.closed && (["EPF", "PPF", "NPS"].includes(String(h.type)) || (g.holdings ?? []).includes(h.id))), have = H.reduce((s, h) => s + holdingSum(d, h).value, 0), fvHave = fv(have, pre, yrs);
    const sipNow = d.live<Recurring>("recurring").filter((r) => r.type === "investment" && (!r.end || r.end >= now) && (FREQ[String(r.freq)] || 1) === 1).reduce((s, r) => s + num(r.amount), 0);
    const gap = Math.max(0, corpus - fvHave), sip = sipFor(gap, pre, yrs * 12), extra = Math.max(0, sip - sipNow);
    let alt: number | null = null;
    if (extra > 50) for (let k = 1; k <= 10; k++) { const y2 = yrs + k, c2 = fv(base, inf, y2) * 12 * (rr ? (1 - Math.pow(1 + rr, -Math.max(1, life - ra - k))) / rr * (1 + rr) : 1); if (fv(have, pre, y2) + sipFv(sipNow, pre, y2 * 12) >= c2) { alt = ra + k; break; } }
    const pct = corpus > 0 ? Math.min(100, (fvHave + sipFv(sipNow, pre, yrs * 12)) / corpus * 100) : 100;
    return { pct, sub: `${money(base)} a month in today's money (your usual spending without EMIs) · from ${ra} to ${life} · ${(inf * 100).toFixed(0)}% inflation, ${(pre * 100).toFixed(0)}% before / ${(post * 100).toFixed(0)}% after`,
      rows: [[`Needed at ${ra}`, shortAmt(corpus)], ["EPF + PPF + NPS" + ((g.holdings ?? []).length ? " + linked" : "") + " now", shortAmt(have)], [`Grows to (${(pre * 100).toFixed(0)}%)`, shortAmt(fvHave)], ["SIP needed", `${money(sip)} a month`]],
      ok: extra < 50, msg: extra < 50 ? `On track: your ${money(sipNow)} a month of SIPs covers it.` : `You invest ${money(sipNow)} a month now. ${money(extra)} more a month${alt ? `, or retiring at ${alt},` : ""} closes the gap.` };
  }
  const x = goalSum(d, g), done = x.gap < 50;
  return { pct: x.pct, sub: `${g.by ? `by ${mLabel(g.by)}` : ""}`, rows: [["Target", money(x.target)], ["Have", money(x.have)], ["Gap", money(x.gap)], ["Each month", x.monthsLeft > 0 ? money(x.need) : "—"]], ok: done, msg: done ? "Reached ✓" : x.monthsLeft > 0 ? `Put aside ${money(x.need)} a month.` : "Target month reached." };
}
function goalsTab(d: MoneyData): string {
  const G = d.live<Goal>("goals").slice().sort((a, b) => (num(a.pri) || 99) - (num(b.pri) || 99));
  const card = (g: Goal): string => {
    const x = smartGoal(d, g);
    return `<div class="card gcard tap" data-goal="${esc(g.id)}" role="button" tabindex="0"><div class="gtop"><b>${esc(g.name)}</b><span class="gk">${g.pri ? g.pri + " · " : ""}${GOAL_KINDS[g.kind || "custom"]}</span></div>
    <div class="note" style="margin:2px 0 0">${esc(x.sub)}</div>${x.rows.length ? `<div class="gnum">${x.rows.map(([l, v]) => `<div><i class="gl">${esc(l)}</i><b>${v}</b></div>`).join("")}</div>` : ""}
    <div class="pbar" style="margin-top:10px"><i style="width:${Math.max(0, Math.min(100, x.pct)).toFixed(1)}%"></i></div><div class="gst ${x.ok ? "ok" : "no"}">${esc(x.msg)}</div></div>`;
  };
  return `<div class="btns" style="margin-top:12px"><button class="btn pri" type="button" id="addGoal">+ Add goal</button></div>
  <p class="note">Worked out from your profile (Settings › My profile) and your spending. Tap a goal to change its assumptions. Goals don't move money; add the monthly amount as a SIP or regular item.</p>
  ${G.map(card).join("") || '<div class="list" style="margin-top:12px"><div class="empty">No goals yet.</div></div>'}`;
}
/** Whether the planner would create goals now (from the profile, once): it does the writing. */
export function goalsToSeed(d: MoneyData): boolean {
  const A = d.byId<Rec & { goalsSeeded?: boolean; goalKids?: string[] }>("settings", "app") ?? { id: "app" }, G = d.live<Goal>("goals"), seen = new Set(A.goalKids ?? []);
  if (!A.goalsSeeded) return true;
  return (prof(d).kids ?? []).some((c, i) => { const key = (c.name || "") + "|" + (c.dob || ""); return !!c && !!c.dob && !seen.has(key) && !G.some((g) => g.kind === "edu" && (c.id ? g.kidId === c.id : g.kid === i)); });
}
void kindOf;

/** The whole page. */
export function planHtml(d: MoneyData, st: PlanState, h: PageHost): string {
  if (st.planTab === "ready") st.planTab = "cashflow";
  const now = ymOf(d.today), tab = st.planTab || "month", rec = d.live<Recurring>("recurring");
  const active = rec.filter((r) => !r.end || r.end >= now), past = rec.filter((r) => r.end && r.end < now);
  const monthly = (r: Recurring): number => (r.freq === "once" ? 0 : num(r.amount) / (FREQ[String(r.freq)] || 1));
  const seg = `<div class="seg accseg planseg" role="group" aria-label="Plan" style="margin-top:4px">${[["month", "Month"], ["regular", "Regular"], ["cashflow", "Cash flow"], ["calendar", "Calendar"], ["goals", "Goals"]].map(([k, l]) => `<button type="button" data-pt="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div>`;
  if (tab === "month") {
    const cur = forecast(d, 1).months[0]!, out = cur.rows.filter((r) => r.type !== "income") as Row[], inc = cur.rows.filter((r) => r.type === "income") as Row[];
    const amt = (r: Row): number => (r.src === "b" ? num(r.budget) : num(r.amount));
    const todo = out.filter((r) => !r.paid && !(r.src === "b" && num(r.spent) >= num(r.budget) - 50)), done = out.filter((r) => r.paid || (r.src === "b" && num(r.spent) >= num(r.budget) - 50));
    const total = out.reduce((x, r) => x + amt(r), 0), left = todo.reduce((x, r) => x + num(r.amount), 0), pct = total ? Math.round((total - left) / total * 100) : 0;
    const incTodo = inc.filter((r) => !r.paid), incDone = inc.filter((r) => r.paid);
    return `${seg}
    <div class="sumcard" style="margin-top:12px">
      <div class="sr"><span>Planned going out in ${MN[+now.slice(5) - 1]}</span><b>${money(total)}</b></div>
      <div class="sr"><span>Done</span><b class="in">${money(total - left)}</b></div>
      <div class="sr tot"><span>Still to go</span><b>${money(left)}</b></div>
      <div style="padding:2px 0 12px"><div class="bar" style="margin:0"><i style="width:${pct}%"></i></div><div class="note" style="margin:6px 0 0">${pct}% done · ${done.length} of ${out.length} items</div></div>
    </div>
    <div class="sh"><h3>To do</h3><span class="note" style="margin:0">tap Paid when it goes out</span></div>
    <div class="list">${todo.length ? todo.map((r) => plannedRow(d, r, true)).join("") : '<div class="empty">All done for this month.</div>'}</div>
    ${incTodo.length ? `<div class="sh"><h3>Coming in</h3></div><div class="list">${incTodo.map((r) => plannedRow(d, r, true)).join("")}</div>` : ""}
    ${done.length + incDone.length ? `<details class="fm" style="margin-top:20px"><summary><span class="mn">Done this month</span><span class="sub" style="text-align:right">${done.length + incDone.length} items</span></summary><div class="list" style="border-radius:0">${[...done, ...incDone].map((r) => plannedRow(d, r, true)).join("")}</div></details>` : ""}
    <p class="note" style="margin-top:14px">This list comes from your regular items, loans and card bills. To change what appears here, edit them in Regular, or the loan in Accounts › Loans.</p>`;
  }
  if (tab === "calendar") return seg + `<div style="height:12px"></div>` + billsCalendar(d, st);
  if (tab === "cashflow") return seg + `<div style="height:4px"></div>` + readyTab(d, st, h);
  if (tab === "goals") return seg + goalsTab(d);
  const th = (n: number): string => ([11, 12, 13].includes(n) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th");
  const rline = (r: Recurring & { invType?: string }): string => `<div class="row tap" data-rec="${esc(r.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(r.name)}</div><div class="s">${r.freq === "once" ? `Once · ${mLabel(r.start)}` : `${FREQ_LBL[String(r.freq)]}${(FREQ[String(r.freq)] || 1) >= 2 ? ` · next ${recNextLbl(d, r)}` : r.day ? ` on the ${r.day}${th(r.day)}` : ""}${r.end ? ` · until ${mShort(r.end)}` : ""}`}${r.type === "investment" && r.invType ? ` · ${esc(r.invType)}` : ""}${r.accountId ? ` · ${esc(accName(d, r.accountId))}` : ""}</div></div><div class="amt ${r.type === "income" ? "in" : ""}">${money(num(r.amount))}</div></div>`;
  const groups: [string, string, Recurring[]][] = [
    ["Income", "Salary and other money coming in", active.filter((r) => r.type === "income")],
    ["Bills & payments", "Fixed amounts you pay", active.filter((r) => r.type === "expense" && !r.budget)],
    ["Budgets", "Amounts set aside; spends you tag reduce them", active.filter((r) => r.type === "expense" && r.budget)],
    ["SIPs & investments", "Money you invest on a schedule", active.filter((r) => r.type === "investment")],
  ];
  return `${seg}
  <div class="btns" style="margin-top:12px"><button class="btn pri" type="button" id="addRec">+ Add regular item</button></div><input class="lsearch" type="search" data-lsearch placeholder="Search by name" aria-label="Search this list" autocomplete="off">
  <p class="note">Set these up once. Each one appears in Plan › Month on its schedule, in Cash flow, and in Insights.</p>
  ${repeatsSection(d, h)}
  ${groups.map(([ttl, hint, list]) => `<div class="sh"><h3>${ttl}</h3>${list.reduce((x, r) => x + monthly(r), 0) > 50 ? `<span class="note" style="margin:0">${money(list.reduce((x, r) => x + monthly(r), 0))} a month</span>` : ""}</div>
    <div class="list">${list.length ? list.sort((a, b) => num(b.amount) - num(a.amount)).map(rline).join("") : `<div class="empty" style="padding:12px 14px">${hint}. None yet.</div>`}</div>`).join("")}
  ${past.length ? `<details class="fm" style="margin-top:20px"><summary><span class="mn">Ended</span><span class="sub" style="text-align:right">${past.length}</span></summary><div class="list" style="border-radius:0">${past.map(rline).join("")}</div></details>` : ""}`;
}

/** The page in the app. */
export const planPage: Page = {
  html(d, h) {
    const S = h.state() as unknown as PlanState;
    if (S.planTab === "loans") { S.planTab = "month"; S.accTab = "loans"; queueMicrotask(() => h.go("accounts")); }
    if ((S.planTab || "month") === "goals" && goalsToSeed(d)) queueMicrotask(() => h.plannerCall("ensureSmartGoals"));
    return planHtml(d, S, h);
  },
  act(el, h, redraw) {
    const S = h.state() as unknown as PlanState, x = el.dataset;
    if (x.pt !== undefined) { S.planTab = x.pt; return redraw(); }
    if (x.h !== undefined) { S.fcH = +x.h; return redraw(); }
    if (x.bcm !== undefined) { S.bcM = addM(S.bcM || ymOf(h.data().today), +x.bcm); S.bcD = ""; return redraw(); }
    if (x.bcd !== undefined) { S.bcD = S.bcD === x.bcd ? "" : x.bcd; return redraw(); }
    if (x.repign !== undefined) { const a = h.pref<string[]>("repIgnore", []); a.push(x.repign); h.prefSet("repIgnore", a.slice(-300)); h.toast("Won't suggest that one again"); return redraw(); }
    return false;
  },
  input(t) {
    if (!t.matches("[data-lsearch]")) return false;
    const q = t.value.trim().toLowerCase(), root = t.closest("#view") ?? document;
    root.querySelectorAll<HTMLElement>(".list").forEach((L) => {
      if (!(t.compareDocumentPosition(L) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
      let any = false;
      L.querySelectorAll<HTMLElement>(":scope > .row").forEach((r) => { const ok = !q || r.textContent!.toLowerCase().includes(q); r.hidden = !ok; if (ok) any = true; });
      L.hidden = !any && !!q;
      const hd = L.previousElementSibling as HTMLElement | null;
      if (hd && hd.classList.contains("sh")) hd.hidden = L.hidden;
    });
  },
  change(t, h, redraw) {
    if (t.id === "fcMin") { h.prefSet("fcMin", Math.max(0, parseFloat(t.value) || 0)); return redraw(); }
  },
};
