/**
 * The Insights page, as in KP Money Planner: Month (figures, breakdowns, limits, daily spending, everything
 * planned), Trends (money in and out, savings rate, where it went, a category over time, this year vs last),
 * Year (summary, categories, the reserve, tax), and the Home tag. Built from the stored data (paise).
 */
import { esc } from "../../../core/dom.ts";
import { addM, dLabel, diffM, mLabel, MN, mShort, pad, ymOf, type Day, type YM } from "../calc/dates.ts";
import { num, type Loan, type MoneyData, type Paise, type Rec } from "../calc/data.ts";
import { accName, catName, catTop, fmtD, paidMap, planned, recurs, rateTxt, type Recurring } from "../calc/plan.ts";
import { catLbl, invNet, monthFigures, offBook, type MonthFigures } from "../calc/insights.ts";
import { potMoves, reserveHeld, reserveState, resvOn } from "../calc/reserve.ts";
import { reserveAcc } from "../calc/properties.ts";
import { epfCalc, fyOf, invTypeOf, type Holding } from "../calc/invest.ts";
import { isEmiLike, kindOf, schedule } from "../calc/loans.ts";
import { allTags, money, payers, type Tx } from "./txlist.ts";
import { AX, barChart, chartCard, donutChart, fmtMoney, legendHtml, lineChart, mTick, tableHtml, tipRows, topN, VC } from "./charts.ts";
import { KIND_LBL, lastMonths, short } from "./accounts.ts";
import { expenseTree, limitRows } from "./home.ts";
import type { Page } from "./pages.ts";
import { E } from "../ui/env.ts";
import { txnForm } from "../ui/txform.ts";

export interface InsState { insTab?: string; homeYr?: string; hm?: YM; hmTab?: string; hmOpen?: string; hmOpen2?: string; year?: number; yearTab?: string; taxFy?: number; trN?: number; trP?: string; trD?: string; trC?: string; planTab?: string; view?: string }
const R = (p: Paise): number => p / 100;
const fyLbl = (y: number): string => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
const pctS = (v: number): string => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(0) + "%";
const incOf = (f: MonthFigures): Paise => f.income - (f.byInc.get("carry") || 0);
interface Payer extends Rec { name?: string; own?: boolean }
const homeTag = (d: MoneyData): string => allTags(d).find((g) => /^home$/i.test(g)) || "Home";
const isHomeTag = (g: string): boolean => !!g && /^home$/i.test(g);
const othersName = (d: MoneyData): string => { const o = payers(d).filter((p) => !p.own); return o.length === 1 ? String(o[0]!.name) : "others"; };
const bySpouse = (d: MoneyData, t: Tx): boolean => { if (!t.paidBy) return false; const p = d.all<Payer>("payers").find((x) => x.id === t.paidBy) ?? { own: true }; return !p.own; };

/* ---------- Home tag ---------- */
function homeChart(d: MoneyData, M: { ym: YM; you: Paise; her: Paise }[], y: string): string {
  const ser = [{ name: "You", color: "var(--v1)", values: M.map((m) => R(m.you)) }, { name: othersName(d), color: "var(--v2)", values: M.map((m) => R(m.her)) }];
  return chartCard("", "", barChart({ labels: M.map((m) => MN[+m.ym.slice(5) - 1]!), series: ser, stack: true, h: 190, aria: `${homeTag(d)} spending by month in ${y}, you and ${othersName(d)}`, attrs: (i) => (M[i]!.you + M[i]!.her > 50 ? `data-homem="${M[i]!.ym}"` : ""),
    tip: (i) => tipRows(ser.map((s) => ({ n: s.name, c: s.color, v: fmtMoney(s.values[i]!) })), mLabel(M[i]!.ym), `Total ${money(M[i]!.you + M[i]!.her)}`) }), legendHtml(ser) + tableHtml(M.map((m) => mLabel(m.ym)), ser, fmtMoney, true));
}
function homePanel(d: MoneyData, st: InsState): string {
  const yNow = d.today.slice(0, 4), y = st.homeYr || yNow, tag = homeTag(d);
  const tx = d.live<Tx>("txns").filter((t) => t.type === "expense" && (t.tags ?? []).some(isHomeTag));
  const years = [...new Set([...tx.map((t) => String(t.date).slice(0, 4)), yNow])].sort();
  const M = Array.from({ length: 12 }, (_, i) => ({ ym: `${y}-${pad(i + 1)}`, you: 0, her: 0 }));
  const cats = new Map<string, { you: Paise; her: Paise }>();
  for (const t of tx) {
    if (String(t.date).slice(0, 4) !== y) continue;
    const m = M[+String(t.date).slice(5, 7) - 1]!, sp = bySpouse(d, t), v = num(t.amount);
    if (sp) m.her += v; else m.you += v;
    const k = (t.categoryId ? catTop(d, t.categoryId) : "") || "none", c = cats.get(k) || { you: 0, her: 0 };
    if (sp) c.her += v; else c.you += v;
    cats.set(k, c);
  }
  const T = M.reduce((a, m) => ({ you: a.you + m.you, her: a.her + m.her }), { you: 0, her: 0 });
  const yearNav = `<div class="monthbar"><button class="btn sm" type="button" data-hyr="${+y - 1}" aria-label="Previous year" ${years[0]! >= y ? "disabled" : ""}>‹</button><div class="m">${y}</div><button class="btn sm" type="button" data-hyr="${+y + 1}" aria-label="Next year" ${y >= yNow ? "disabled" : ""}>›</button></div>`;
  if (!tx.length) return yearNav + `<div class="list"><div class="empty">Nothing is tagged ${esc(tag)} yet. Tag home expenses ${esc(tag)}, and add the ones your spouse pays with the account set to the person who paid.</div></div>`;
  const rows = M.filter((m) => m.you + m.her > 50).reverse();
  return `${yearNav}
    <div class="sumcard"><div class="sr"><span>Paid by you</span><b>${money(T.you)}</b></div><div class="sr"><span>Paid by ${esc(othersName(d))}</span><b>${money(T.her)}</b></div><div class="sr tot"><span>${esc(tag)} in ${y}</span><b>${money(T.you + T.her)}</b></div></div>
    <div style="height:16px"></div>${homeChart(d, M, y)}
    <div class="sh"><h3>Month by month</h3></div><div class="list">${rows.length ? "" : `<div class="empty">Nothing tagged ${esc(tag)} in ${y}.</div>`}${rows.map((m) => { const tot = m.you + m.her; return `<div class="row ${tot > 50 ? "tap" : ""}" ${tot > 50 ? `data-homem="${m.ym}" role="button" tabindex="0"` : ""}><div class="main"><div class="t">${mLabel(m.ym)}</div>
      ${tot > 50 ? `<div class="s">You ${money(m.you)} · ${esc(othersName(d))} ${money(m.her)}</div>` : '<div class="s">Nothing</div>'}</div><div class="amt">${money(tot)}</div></div>`; }).join("")}</div>
    ${cats.size ? `<div class="sh"><h3>By category in ${y}</h3></div><div class="list">${[...cats.entries()].sort((a, b) => (b[1].you + b[1].her) - (a[1].you + a[1].her)).map(([k, c]) => `<div class="row"><div class="main"><div class="t">${esc(k === "none" ? "Uncategorised" : catName(d, k))}</div><div class="s">You ${money(c.you)} · ${esc(othersName(d))} ${money(c.her)}</div></div><div class="amt">${money(c.you + c.her)}</div></div>`).join("")}</div>` : ""}`;
}

/* ---------- month ---------- */
function investTree(d: MoneyData, ym: YM): [string, { total: Paise; items: Map<string, Paise> }][] {
  const now = ymOf(d.today), G = new Map<string, { total: Paise; items: Map<string, Paise> }>();
  const add = (type: string | null | undefined, name: string, v: Paise): void => { const k = type || "Unassigned"; if (!G.has(k)) G.set(k, { total: 0, items: new Map() }); const g = G.get(k)!; g.total += v; g.items.set(name, (g.items.get(name) || 0) + v); };
  for (const t of d.live<Tx>("txns")) if (t.type === "investment" && ymOf(t.date ?? "") === ym) add(invTypeOf(d, t), t.instrument || "Investment", invNet(t));
  if (ym >= now) {
    const paid = paidMap(d);
    for (const it of planned(d, ym)) if (it.type === "investment" && !(ym === now && paid.has(it.key))) { const r = d.byId<Recurring & { invType?: string; instrument?: string }>("recurring", it.id) ?? ({} as Recurring & { invType?: string; instrument?: string }); add(r.invType, r.instrument || it.name, num(it.amount) - Math.min(num(it.amount), it.chg || 0)); }
  }
  return [...G.entries()].sort((a, b) => b[1].total - a[1].total);
}
function limitsSection(d: MoneyData, ym: YM): string {
  const L = limitRows(d, ym);
  if (!L.length) return `<p class="note" style="margin-top:12px">Tip: give a category a monthly limit (Settings › Categories) to track it here.</p>`;
  const now = ymOf(d.today), dayFrac = ym === now ? (+d.today.slice(8)) / new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate() : 1;
  return `<div class="sh"><h3>Category limits</h3><span class="note" style="margin:0">${L.filter((x) => x.p > 100).length ? `${L.filter((x) => x.p > 100).length} over` : "all within"}</span></div>
  <div class="list">${L.map((x) => { const s2 = x.p > 100 ? "bad" : x.p >= 80 ? "warn" : ""; return `<div class="row tap" data-cat="${esc(x.c.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(x.c.name)} ${s2 === "bad" ? '<span class="pill bad">Over</span>' : s2 === "warn" ? '<span class="pill warn">Close</span>' : ""}</div>
    <div class="s">${money(x.sp)} of ${money(x.lim)}${x.p > 100 ? ` · over by ${money(x.sp - x.lim)}` : ` · ${money(x.lim - x.sp)} left`}</div>
    <div class="pbar ${s2}"><i style="width:${Math.min(100, x.p).toFixed(1)}%"></i>${ym === now && dayFrac < 1 ? `<span class="mk" style="left:${(dayFrac * 100).toFixed(1)}%" title="Today"></span>` : ""}</div></div><div class="amt">${x.p.toFixed(0)}%</div></div>`; }).join("")}</div>
  ${ym === now ? '<p class="note">The mark on each bar is how far through the month we are. Includes what\'s still due this month.</p>' : ""}`;
}
function dailyHeat(d: MoneyData, ym: YM): string {
  const days = new Map<number, Paise>();
  for (const t of d.live<Tx>("txns")) if (t.type === "expense" && !offBook(t) && ymOf(t.date ?? "") === ym) days.set(+String(t.date).slice(8), (days.get(+String(t.date).slice(8)) || 0) + num(t.amount));
  const [y, m] = ym.split("-").map(Number) as [number, number], nd = new Date(y, m, 0).getDate(), lead = (new Date(y, m - 1, 1).getDay() + 6) % 7, td = d.today;
  const vals = [...days.values()].sort((a, b) => a - b);
  if (!vals.length) return "";
  const q = (p: number): number => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))]!, cut = [q(.2), q(.4), q(.6), q(.8)];
  const lvl = (v: number): number => (!v ? 0 : v <= cut[0]! ? 1 : v <= cut[1]! ? 2 : v <= cut[2]! ? 3 : v <= cut[3]! ? 4 : 5);
  let cells = ["M", "T", "W", "T", "F", "S", "S"].map((x) => `<div class="hw">${x}</div>`).join("") + Array.from({ length: lead }, () => '<div class="hc x"></div>').join("");
  for (let dd = 1; dd <= nd; dd++) {
    const v = days.get(dd) || 0, ds = `${ym}-${pad(dd)}`, l = lvl(v);
    cells += v ? `<button class="hc l${l} ${ds === td ? "td" : ""}" type="button" data-day="${ds}" title="${dLabel(ds)}: ${money(v)}" aria-label="${dLabel(ds)}: ${money(v)} spent"><b>${dd}</b>${AX(R(v))}</button>` : `<div class="hc ${ds === td ? "td" : ""}" aria-label="${dLabel(ds)}: nothing spent">${dd}</div>`;
  }
  const big = [...days.entries()].sort((a, b) => b[1] - a[1])[0]!, tot = vals.reduce((a, b) => a + b, 0), active = vals.length;
  return `<div class="sh"><h3>Daily spending</h3><span class="note" style="margin:0">${active} day${active === 1 ? "" : "s"} with spends</span></div>
    ${chartCard("", "", `<div class="heat">${cells}</div><div class="hkey">Less <i style="background:var(--h1)"></i><i style="background:var(--h2)"></i><i style="background:var(--h3)"></i><i style="background:var(--h4)"></i><i style="background:var(--h5)"></i> More</div>`,
      `<p class="cnote">Biggest day ${dLabel(`${ym}-${pad(big[0])}`)} (${money(big[1])}) · ${money(tot / nd)} a day on average. Uses the date you spent, so card spends show here even if their bill is due later. Tap a day to see its entries.</p>`)}`;
}
function resvHist(d: MoneyData) {
  const a = reserveAcc(d);
  if (!a) return null;
  type P = Tx & { pot?: string };
  const tx = d.live<P>("txns").filter((t) => t.pot === "reserve");
  const mv = potMoves(d).filter((m) => m.pot === "reserve");   // set-asides, including the reserve's part of a combined one
  const inM = (ym: YM): Paise => mv.filter((m) => m.to === a.id && ymOf(m.date) === ym).reduce((s, m) => s + m.amt, 0);
  const outL = (ym: YM): P[] => tx.filter((t) => ymOf(t.date ?? "") === ym && (t.type === "expense" || (t.type === "transfer" && t.accountId === a.id)));
  const before = (ym: YM): Paise => {
    let h = num(a.reserveStart);
    for (const t of tx) if (t.type === "expense" && ymOf(t.date ?? "") < ym) h -= num(t.amount);
    for (const m of mv) if (ymOf(m.date) < ym) { if (m.to === a.id) h += m.amt; if (m.from === a.id) h -= m.amt; }
    return h;
  };
  return { a, inM, outL, before };
}
function resvMonthCard(d: MoneyData, ym: YM): string {
  const H = resvHist(d);
  if (!H) return "";
  const now = ymOf(d.today), put = H.inM(ym), outs = H.outL(ym), paid = outs.reduce((s, t) => s + num(t.amount), 0), end = H.before(addM(ym, 1)), st = reserveState(d);
  if (!put && !paid && ym !== now) return "";
  return `<div class="sh"><h3>Big-bills reserve</h3><span class="note" style="margin:0">in ${esc(H.a.name)}</span></div>
  <div class="card"><div class="kv" style="margin-top:0">
    <span>Put aside</span><b>${money(put)}${ym === now ? ` <span class="mut" style="font-weight:400">of ${money(st.monthly)} asked</span> ${put >= st.monthly - 50 ? '<span class="okc">✓</span>' : ""}` : ""}</b>
    <span>Paid from it</span><b>${money(paid)}</b>
    <span class="tot">${ym === now ? "Reserve holds today" : "Reserve held at month-end"}</span><b class="tot">${money(ym === now ? reserveHeld(d) : end)}${ym === now ? ` <span class="mut" style="font-weight:400">of ${money(st.target)} needed</span>` : ""}</b></div>
  ${outs.length ? `<div class="list" style="margin-top:10px;box-shadow:none;background:var(--bg)">${outs.map((t) => `<div class="row tap" data-tx="${esc(t.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(t.note || catName(d, t.categoryId))}</div><div class="s">${fmtD(d, t.date!)} · ${esc(accName(d, t.accountId))}</div></div><div class="amt">${money(num(t.amount))}</div></div>`).join("")}</div>` : ""}
  </div>`;
}
const FREQ_LBL0: Record<string, string> = { monthly: "Monthly", quarterly: "Every 3 months", halfyearly: "Every 6 months", yearly: "Yearly", biennial: "Every 2 years", triennial: "Every 3 years", once: "One time" };
void FREQ_LBL0;
function monthItems(d: MoneyData, ym: YM): string {
  const now = ymOf(d.today), items = planned(d, ym), paid = paidMap(d);
  type It = (typeof items)[number] & { budget?: Paise; spent?: Paise; paidC?: boolean; changed?: boolean; sub?: string; day?: number | null };
  const skipped = d.live<Recurring & { ov?: Record<string, number> }>("recurring").filter((r) => recurs(r, ym) && r.ov && +r.ov[ym]! === 0 && r.ov[ym] !== undefined);
  const amtOf = (it: It): Paise => (it.src === "b" ? num(it.budget) : num(it.amount));
  const row = (it: It): string => {
    const p = paid.get(it.key) as (Rec & { act?: string }) | undefined, tapRec = it.src === "r" || it.src === "b";
    const stt = p ? (p.act === "missed" ? '<span class="pill bad">Missed</span>' : '<span class="pill" style="background:var(--good-soft);color:var(--good)">Paid</span>') : it.paidC ? '<span class="pill" style="background:var(--good-soft);color:var(--good)">Paid</span>' : "";
    const kind = it.src === "l" ? "EMI" : it.src === "c" ? "Card bill" : it.src === "p" ? "Repayment" : it.src === "b" ? "Budget" : "";
    const attrs = tapRec ? `data-mi="${esc(it.id)}|${ym}" role="button" tabindex="0"` : it.src === "c" ? `data-card="${esc(it.id)}" role="button" tabindex="0"` : it.src === "l" || it.src === "p" ? `data-loan="${esc(it.id)}" role="button" tabindex="0"` : "";
    return `<div class="row tap" ${attrs}><div class="main"><div class="t">${esc(it.name)} ${kind ? `<span class="chip mute">${kind}</span>` : ""} ${it.changed ? '<span class="pill warn">Changed</span>' : ""}</div><div class="s">${it.day && it.src !== "c" ? `Day ${it.day} · ` : ""}${esc(it.src === "c" ? it.sub : it.src === "b" ? `Spent ${money(num(it.spent))}` : it.sub || (it.type === "investment" ? (d.byId<Rec & { invType?: string }>("recurring", it.id)?.invType || "Investment") : catName(d, it.categoryId)))}</div></div><div class="amt ${it.type === "income" ? "in" : ""}">${money(amtOf(it))}${stt ? `<div>${stt}</div>` : ""}</div></div>`;
  };
  const grp = (ttl: string, list: It[]): string => (list.length ? `<div class="sh"><h3>${ttl}</h3><span class="note" style="margin:0">${money(list.reduce((x, it) => x + amtOf(it), 0))}</span></div><div class="list">${list.map(row).join("")}</div>` : "");
  const its = items as It[], inc = its.filter((i) => i.type === "income"), exp = its.filter((i) => i.type === "expense"), inv = its.filter((i) => i.type === "investment");
  return `<div class="sh" style="margin-top:28px"><h3>Everything planned for ${mLabel(ym)}</h3></div>
    <p class="note" style="margin-top:0">Tap a regular item to change its amount or skip it for ${MN[+ym.slice(5) - 1]} only. EMIs and card bills open their loan or card.${ym < now ? " For what actually happened, see the month's transactions." : ""}</p>
    ${grp("Income", inc)}${grp("Expenses", exp)}${grp("Investments", inv)}
    ${!items.length ? '<div class="list"><div class="empty">Nothing planned for this month.</div></div>' : ""}
    ${skipped.length ? `<div class="sh"><h3>Skipped this month</h3></div><div class="list">${skipped.map((r) => `<div class="row tap" data-mi="${esc(r.id)}|${ym}" role="button" tabindex="0"><div class="main"><div class="t" style="color:var(--muted);text-decoration:line-through">${esc(r.name)}</div><div class="s">Usually ${money(num(r.amount))} · tap to restore</div></div><div class="amt mut">${money(0)}</div></div>`).join("")}</div>` : ""}`;
}
function monthView(d: MoneyData, st: InsState): string {
  const now = ymOf(d.today), ym = st.hm || now, f = monthFigures(d, ym), tab = st.hmTab || "expense";
  const kind = f.kind === "actual" ? "Actual" : f.kind === "projected" ? "So far + still due" : "Planned";
  const nm = (k: string): string => (k === "none" ? "Uncategorised" : k === "cardopen" ? "Card balances from Money Manager" : k === "repay" ? "Loan repayments" : k === "carry" ? "Last month balance" : catName(d, k));
  const subNm = (top: string, id: string): string => (id === top ? `${nm(top)} (general)` : id === "none" ? "Uncategorised" : id === "repay" ? "Loan repayments" : d.byId<Rec & { name?: string }>("categories", id)?.name || nm(id));
  const list = [...f.byInc.entries()];
  list.sort((a, b) => b[1] - a[1]);
  const max = list[0]?.[1] || 1, total = tab === "income" ? f.income : tab === "invest" ? f.investment : f.expense;
  const open = st.hmOpen || "", open2 = st.hmOpen2 || "";
  const pct = (v: number): string => `<div class="cclbl">${total ? Math.round(v / total * 100) : 0}%</div>`;
  const lvl = (dd: number): string => `padding-left:${14 + dd * 16}px;${dd ? "background:var(--bg);min-height:42px" : ""}`;
  const arrow = (on: boolean): string => ` <span class="cpm">${on ? "▾" : "›"}</span>`;
  let rows: string;
  if (tab === "expense") {
    const T = expenseTree(d, ym), gmax = T[0]?.[1].total || 1;
    rows = T.map(([gk, g]) => {
      const gOpen = open === gk, cats = [...g.cats.entries()].sort((a, b) => b[1].total - a[1].total);
      return `<div class="row tap" data-hmo="${esc(gk)}" role="button" tabindex="0" aria-expanded="${gOpen}"><div class="main"><div class="t">${esc(g.name)}${arrow(gOpen)}</div><div class="bar"><i style="width:${(g.total / gmax * 100).toFixed(1)}%"></i></div></div><div class="ccamt"><div class="amt">${money(g.total)}</div>${pct(g.total)}</div></div>
      ${gOpen ? cats.map(([ck, c]) => {
        const subs = [...c.subs.entries()].sort((a, b) => b[1] - a[1]), many = subs.length > 1 || (subs.length === 1 && subs[0]![0] !== ck), cOpen = open2 === ck, label = gk === "emi" || gk === "repay" || gk === "budget" ? ck : nm(ck);
        return `<div class="row ${many ? "tap" : ""}" ${many ? `data-hmo2="${esc(ck)}" role="button" tabindex="0" aria-expanded="${cOpen}"` : ""} style="${lvl(1)}"><div class="main"><div class="t" style="font-size:14px">${esc(label)}${many ? arrow(cOpen) : ""}</div></div><div class="amt" style="font-size:13.5px">${money(c.total)}</div></div>
        ${many && cOpen ? subs.map(([sid, sv]) => `<div class="row" style="${lvl(2)}"><div class="main"><div class="s" style="font-size:13px;color:var(--ink)">${esc(subNm(ck, sid))}</div></div><div class="amt" style="font-size:13px">${money(sv)}</div></div>`).join("") : ""}`;
      }).join("") : ""}`;
    }).join("");
  } else if (tab === "invest") {
    const T = investTree(d, ym), gmax = T[0]?.[1].total || 1;
    rows = T.map(([type, g]) => {
      const gOpen = open === type;
      return `<div class="row tap" data-hmo="${esc(type)}" role="button" tabindex="0" aria-expanded="${gOpen}"><div class="main"><div class="t">${esc(type)}${arrow(gOpen)}</div><div class="bar"><i style="width:${(g.total / gmax * 100).toFixed(1)}%"></i></div></div><div class="ccamt"><div class="amt">${money(g.total)}</div>${pct(g.total)}</div></div>
      ${gOpen ? [...g.items.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => `<div class="row" style="${lvl(1)}"><div class="main"><div class="t" style="font-size:14px">${esc(n)}</div></div><div class="amt" style="font-size:13.5px">${money(v)}</div></div>`).join("") : ""}
      ${gOpen && type === "Unassigned" ? `<div class="row" style="${lvl(1)}"><div class="main"><div class="s">Set the type on these SIPs (Plan) or investment entries (Transactions).</div></div></div>` : ""}`;
    }).join("");
  } else rows = list.map(([k, v]) => {
    const subs = f.sub.get(k), many = !!subs && (subs.size > 1 || (subs.size === 1 && !subs.has(k)));
    return `<div class="row ${many ? "tap" : ""}" ${many ? `data-hmo="${esc(k)}" role="button" tabindex="0" aria-expanded="${open === k}"` : ""}><div class="main"><div class="t">${esc(nm(k))}${many ? ` <span class="cpm">${open === k ? "▾" : "›"}</span>` : ""}</div><div class="bar"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div></div><div class="ccamt"><div class="amt">${money(v)}</div><div class="cclbl">${total ? Math.round(v / total * 100) : 0}%</div></div></div>
      ${many && open === k ? [...subs!.entries()].sort((a, b) => b[1] - a[1]).map(([id, sv]) => `<div class="row" style="padding-left:30px;min-height:40px;background:var(--bg)"><div class="main"><div class="s" style="font-size:13.5px;color:var(--ink)">${esc(subNm(k, id))}</div></div><div class="amt" style="font-size:13px">${money(sv)}</div></div>`).join("") : ""}`;
  }).join("");
  const sa = f.setAside > 50 || resvOn(d);
  return `
  <div class="monthbar"><button class="btn sm" type="button" data-hm="-1" aria-label="Previous month">‹</button><div class="m">${mLabel(ym)}<div class="note" style="margin:0;font-weight:400;font-size:12px">${kind}</div></div><button class="btn sm" type="button" data-hm="1" aria-label="Next month">›</button></div>
  <div class="cols wide-left"><div>
  <div class="kp4">
    <div><div class="k">Income</div><div class="v in">${money(f.income)}</div></div>
    <div><div class="k">Expenses</div><div class="v">${money(f.expense)}</div></div>
    <div><div class="k">Invested</div><div class="v">${money(f.investment)}</div></div>
    ${sa ? `<div><div class="k">Set aside</div><div class="v">${money(f.setAside)}</div></div>` : ""}
    <div class="${sa ? "kpw" : ""}"><div class="k">Balance</div><div class="v ${f.balance < -50 ? "neg" : ""}">${money(f.balance)}</div></div>
  </div>
  <div class="btns" style="margin-top:10px"><button class="btn sm" type="button" data-ym="${ym}">See ${MN[+ym.slice(5) - 1]} transactions ›</button></div>
  ${resvMonthCard(d, ym)}
  </div><div>
  <div class="seg" role="group" aria-label="Breakdown" style="margin-top:10px">${[["expense", "Expenses"], ["income", "Income"], ["invest", "Investments"]].map(([k, l]) => `<button type="button" data-hmt="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div>
  <div class="list" style="margin-top:8px">${rows || `<div class="empty">No ${tab === "invest" ? "investments" : tab === "income" ? "income" : "expenses"} ${f.kind === "plan" ? "planned" : "recorded"} for ${mLabel(ym)}.</div>`}</div>
  </div></div>
  ${limitsSection(d, ym)}
  ${dailyHeat(d, ym)}
  ${monthItems(d, ym)}`;
}

/* ---------- year ---------- */
function resvYear(d: MoneyData, y: number): string {
  const H = resvHist(d);
  if (!H) return `<div class="list" style="margin-top:12px"><div class="empty">Mark an account as the reserve to see this.</div></div>`;
  const now = ymOf(d.today), months = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`).filter((m) => m <= now);
  const first = months.findIndex((m) => H.inM(m) || H.outL(m).length);
  if (first > 0) months.splice(0, first);
  // (The planner crashed here for a year with no months yet, such as next year.)
  if (!months.length) return `<div class="list" style="margin-top:12px"><div class="empty">Nothing put aside or paid from the reserve in ${y} yet.</div></div>`;
  const Rw = months.map((m) => ({ m, put: H.inM(m), out: H.outL(m).reduce((s, t) => s + num(t.amount), 0), end: m === now ? reserveHeld(d) : H.before(addM(m, 1)) }));
  const tp = Rw.reduce((s, r) => s + r.put, 0), to = Rw.reduce((s, r) => s + r.out, 0), nb = (v: Paise): string => (Math.abs(v) < 50 ? '<span class="mut">—</span>' : money(v).replace("₹", ""));
  const W = 340, Hh = 120, P = 8, mx = Math.max(1, ...Rw.map((r) => R(r.end))), X = (i: number): number => P + i * (W - 2 * P) / Math.max(1, Rw.length - 1), Y = (v: number): number => Hh - P - (Math.max(0, v) / mx) * (Hh - 2 * P - 14);
  const pts = Rw.map((r, i) => `${X(i).toFixed(1)},${Y(R(r.end)).toFixed(1)}`).join(" ");
  const chart = `<div class="card" style="padding:12px 14px"><div class="kv" style="margin:0 0 6px"><span>Reserve held at month-end</span><b>${money(Rw[Rw.length - 1]!.end)} now</b></div>
    <svg viewBox="0 0 ${W} ${Hh + 16}" width="100%" role="img" aria-label="Reserve held at each month-end"><line x1="${P}" x2="${W - P}" y1="${Hh - P}" y2="${Hh - P}" stroke="var(--line)"/>
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    ${Rw.map((r, i) => `<circle cx="${X(i)}" cy="${Y(R(r.end))}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/><text x="${X(i)}" y="${Hh + 12}" font-size="10" text-anchor="${i === 0 ? "start" : i === Rw.length - 1 ? "end" : "middle"}" fill="var(--muted)">${MN[+r.m.slice(5) - 1]}</text>`).join("")}
</svg></div>`;
  return `<div style="height:12px"></div>${chart}
  <div class="ywrap" style="margin-top:12px"><table class="ytab ysum"><thead><tr><th>Month</th><th>Put aside ₹</th><th>Paid out ₹</th><th>Holds ₹</th></tr></thead><tbody>
  ${Rw.map((r) => `<tr class="${r.m === now ? "cur" : ""}"><td>${MN[+r.m.slice(5) - 1]}</td><td class="in">${nb(r.put)}</td><td>${nb(r.out)}</td><td>${nb(r.end)}</td></tr>`).join("")}
  <tr class="tot"><td>Total</td><td class="in">${nb(tp)}</td><td>${nb(to)}</td><td>${nb(Rw.length ? Rw[Rw.length - 1]!.end : 0)}</td></tr></tbody></table></div>
  <p class="note">Put aside = transfers into ${esc(H.a.name)} marked for big bills. Paid out = big bills paid with "Paid from the big-bills reserve" ticked. What's still to put aside is in Plan › Cash flow.</p>`;
}
function taxPanel(d: MoneyData, st: InsState): string {
  const fy = st.taxFy || fyOf(d.today), from = `${fy}-04-01`, to = `${fy + 1}-03-31`, inFy = (x: string): boolean => x >= from && x <= to, nowYm = ymOf(d.today);
  const inv = d.live<Tx>("txns").filter((t) => t.type === "investment" && inFy(t.date ?? ""));
  const by = (k: (t: Tx) => boolean): Paise => inv.filter(k).reduce((s, t) => s + invNet(t), 0);
  const ppf = by((t) => invTypeOf(d, t) === "PPF"), elss = by((t) => /elss|tax ?saver/i.test(t.instrument || "")), nps = by((t) => invTypeOf(d, t) === "NPS");
  const pm = paidMap(d);
  const plannedSip = (k: (r: Recurring & { invType?: string; instrument?: string }) => boolean): Paise => {
    let v = 0;
    for (let ym = nowYm > `${fy}-03` ? nowYm : `${fy}-04`; ym <= `${fy + 1}-03`; ym = addM(ym, 1)) for (const it of planned(d, ym)) if (it.type === "investment" && !pm.has(it.key)) { const r = d.byId<Recurring & { invType?: string; instrument?: string }>("recurring", it.id) ?? ({} as Recurring); if (k(r)) v += num(it.amount); }
    return v;
  };
  const ppfP = plannedSip((r) => r.invType === "PPF"), elssP = plannedSip((r) => /elss|tax ?saver/i.test(r.instrument || "")), npsP = plannedSip((r) => r.invType === "NPS");
  let epf = 0;
  for (const h of d.live<Holding>("holdings")) {
    if (h.type === "EPF" && h.epf && h.epf.books) { const e = epfCalc(d, h, { noProj: true }); if (e) epf += [...e.rows, ...e.expected].filter((r) => (r.k === "cont" || r.k === "exp") && r.d && fyOf(r.d) === fy).reduce((a, r) => a + r.emp, 0); }
    else if (h.type === "EPF" && num(h.epfEmp) > 0) { const end = nowYm < `${fy + 1}-03` ? nowYm : `${fy + 1}-03`, n = Math.max(0, diffM(`${fy}-04`, end) + 1); epf += num(h.epfEmp) * Math.min(12, n); }
  }
  const exp = d.live<Tx>("txns").filter((t) => t.type === "expense" && inFy(t.date ?? "")), txt = (t: Tx): string => `${catName(d, t.categoryId)} ${t.note || ""}`;
  const life = exp.filter((t) => /life insurance|\blic\b|term (plan|insurance)|term life/i.test(txt(t))).reduce((s, t) => s + num(t.amount), 0);
  const tuition = exp.filter((t) => /tuition|school fee/i.test(txt(t))).reduce((s, t) => s + num(t.amount), 0);
  const health = exp.filter((t) => /health insurance|mediclaim|medical insurance|star health|niva bupa|care health/i.test(txt(t))).reduce((s, t) => s + num(t.amount), 0);
  let hlP = 0, hlI = 0;
  const hl = d.live<Loan & { taxHome?: boolean; name?: string }>("loans").filter((l) => l.taxHome);
  for (const l of hl) { const s = schedule(d, l); if (!s) continue; for (const r of s.rows) if (r.ym >= `${fy}-04` && r.ym <= `${fy + 1}-03`) { hlP += r.prin; hlI += r.int; } }
  const npsB = Math.min(5000000, nps + npsP), npsTo80c = Math.max(0, nps + npsP - 5000000);
  const c80 = ([["EPF (your share)", epf], ["PPF", ppf + ppfP], ["ELSS funds", elss + elssP], ["Home loan principal", hlP], ["Life insurance", life], ["Tuition fees", tuition], ["NPS beyond ₹50,000", npsTo80c]] as [string, number][]).filter(([, v]) => v > 50);
  const sec = (name: string, old: string, lim: Paise, parts: [string, number][], note: string): string => {
    const v = parts.reduce((s, [, x]) => s + x, 0), p = Math.min(100, v / lim * 100);
    return `<div class="card taxs" style="margin-top:12px"><div class="tl"><b>${name} <span class="note" style="margin:0;font-weight:600">(was ${old})</span></b><b>${money(Math.min(v, lim))}</b></div>
      <div class="pbar ${v >= lim ? "" : ""}"><i style="width:${p.toFixed(1)}%"></i></div><div class="ts">${v >= lim ? `✓ Full ${money(lim)} used` : `${money(lim - v)} more can be claimed`} · limit ${money(lim)}</div>
      ${parts.length ? `<div class="tparts">${parts.map(([n, x]) => `<div><span>${esc(n)}</span><b>${money(x)}</b></div>`).join("")}</div>` : ""}${note ? `<p class="cnote">${note}</p>` : ""}</div>`;
  };
  const fyNav = `<div class="monthbar"><button class="btn sm" type="button" data-taxfy="-1" aria-label="Previous year">‹</button><div class="m">FY ${fyLbl(fy)}<div class="note" style="margin:0;font-weight:400;font-size:12px">1 Apr ${fy} – 31 Mar ${fy + 1}</div></div><button class="btn sm" type="button" data-taxfy="1" aria-label="Next year">›</button></div>`;
  return `${fyNav}
  <div class="banner" style="margin-top:12px"><b>Old tax regime only.</b> The new regime (the default) doesn't allow these, except your employer's NPS contribution. From 1 April 2026 the Income-tax Act 2025 renumbers them; the limits are the same. Amounts are found from your entries${fy >= fyOf(d.today) ? " plus SIPs still planned this year" : ""}, so check them before you file.</div>
  ${sec("Section 123", "80C", 15000000, c80, c80.length ? "" : "Nothing found yet. PPF, ELSS (fund name with ELSS or Tax Saver), EPF (add your monthly share on the EPF holding), life insurance premiums, tuition fees and home loan principal count here.")}
  ${sec("Section 124", "80CCD(1B)", 5000000, nps + npsP > 50 ? [["NPS (your own contributions)", npsB]] : [], "Extra ₹50,000 for your own NPS contributions, over the Section 123 limit.")}
  ${sec("Section 126", "80D", 2500000, health > 50 ? [["Health insurance", health]] : [], "₹25,000 for yourself, spouse and children (₹50,000 if a senior citizen), plus up to ₹25,000 more for parents. Entries with health insurance or mediclaim in the category or note are counted.")}
  ${sec("Home loan interest", "Sec 24(b)", 20000000, hlI > 50 ? [["Interest", hlI]] : [], hl.length ? `From ${esc(hl.map((l) => l.name).join(", "))}.` : "")}
  <div class="sh"><h3>Which loans are home loans?</h3></div>
  <div class="list">${d.live<Loan & { taxHome?: boolean; name?: string; lender?: string }>("loans").filter((l) => isEmiLike(kindOf(l)) || kindOf(l) === "hybrid").map((l) => `<label class="row" style="cursor:pointer"><div class="main"><div class="t">${esc(l.name)}</div><div class="s">${esc(l.lender || KIND_LBL[kindOf(l)])}</div></div><input type="checkbox" data-taxhome="${esc(l.id)}" ${l.taxHome ? "checked" : ""} aria-label="${esc(l.name)} is a home loan"></label>`).join("") || '<div class="empty">No bank loans.</div>'}</div>
  <p class="note">Tick a loan to count its principal under Section 123 and its interest under home loan interest, for a self-occupied home.</p>`;
}
function vYear(d: MoneyData, st: InsState): string {
  const y = st.year || +d.today.slice(0, 4), tab = st.yearTab || "summary", now = ymOf(d.today);
  const months = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`), F = months.map((m) => monthFigures(d, m));
  const T = F.reduce((a, f) => ({ income: a.income + f.income, expense: a.expense + f.expense, investment: a.investment + f.investment, setAside: a.setAside + (f.setAside || 0), balance: a.balance + f.balance }), { income: 0, expense: 0, investment: 0, setAside: 0, balance: 0 }), SA = T.setAside > 50;
  const nb = (v: Paise): string => (Math.abs(v) < 0.5 ? '<span class="mut">—</span>' : money(v).replace("₹", ""));
  const kindTag = (f: MonthFigures): string => (f.kind === "actual" ? "" : f.kind === "projected" ? '<span class="ykind">so far + due</span>' : '<span class="ykind">plan</span>');
  const nm = (k: string): string => (k === "none" ? "Uncategorised" : k === "cardopen" ? "Card balances from Money Manager" : k === "repay" ? "Loan repayments" : k === "carry" ? "Last month balance" : catName(d, k));
  const catTable = (key: "byInc" | "byCat", inc: boolean): string => {
    const keys = new Map<string, number>();
    F.forEach((f) => f[key].forEach((v, k) => keys.set(k, (keys.get(k) || 0) + v)));
    const rows = [...keys.entries()].sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '<div class="list"><div class="empty">Nothing recorded or planned this year.</div></div>';
    return `<div class="ywrap"><table class="ytab"><thead><tr><th>${inc ? "Income" : "Expense"}</th>${months.map((m, i) => `<th class="${m === now ? "cur" : ""} ${F[i]!.kind === "plan" ? "pl" : ""}">${mShort(m)}</th>`).join("")}<th>Total</th></tr></thead><tbody>
      ${rows.map(([k, tot]) => `<tr><td>${esc(nm(k))}</td>${F.map((f, i) => { const v = f[key].get(k) || 0; return `<td class="${months[i] === now ? "cur" : ""} ${f.kind === "plan" ? "pl" : ""}">${v ? money(v).replace("₹", "") : ""}</td>`; }).join("")}<td><b>${money(tot).replace("₹", "")}</b></td></tr>`).join("")}
      <tr class="tot"><td>Total</td>${F.map((f, i) => `<td class="${months[i] === now ? "cur" : ""}">${money(inc ? f.income : f.expense).replace("₹", "")}</td>`).join("")}<td>${money(inc ? T.income : T.expense).replace("₹", "")}</td></tr>
    </tbody></table></div>`;
  };
  return `
  <div class="monthbar"><button class="btn sm" type="button" data-yr="-1" aria-label="Previous year">‹</button><div class="m">${y}</div><button class="btn sm" type="button" data-yr="1" aria-label="Next year">›</button></div>
  <div class="seg" role="group" aria-label="Year view" style="margin-top:10px">${[["summary", "Summary"], ["expense", "Expenses"], ["income", "Income"], ["reserve", "Reserve"], ["tax", "Tax"]].map(([k, l]) => `<button type="button" data-ytab="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div>
  ${tab === "tax" ? taxPanel(d, st) : tab === "reserve" ? resvYear(d, y) : tab === "summary" ? `
  <div class="btns" style="margin-top:12px"><button class="btn sm" type="button" id="yrReview">Year in review ›</button></div>
  <div class="ywrap" style="margin-top:12px"><table class="ytab ysum ${SA ? "y5" : ""}"><thead><tr><th>Month</th><th>Income ₹</th><th>Expenses ₹</th><th>Invest ₹</th>${SA ? "<th>Aside ₹</th>" : ""}<th>Balance ₹</th></tr></thead><tbody>
    ${F.map((f, i) => `<tr class="tap ${months[i] === now ? "cur" : ""} ${f.kind === "plan" ? "pl" : ""}" data-ym="${months[i]}" role="button" tabindex="0"><td>${MN[i]} ${kindTag(f)}</td><td class="in">${nb(f.income)}</td><td>${nb(f.expense)}</td><td>${nb(f.investment)}</td>${SA ? `<td>${nb(f.setAside || 0)}</td>` : ""}<td class="${f.balance < -50 ? "neg" : ""}">${nb(f.balance)}</td></tr>`).join("")}
    <tr class="tot"><td>Total</td><td class="in">${nb(T.income)}</td><td>${nb(T.expense)}</td><td>${nb(T.investment)}</td>${SA ? `<td>${nb(T.setAside)}</td>` : ""}<td class="${T.balance < -50 ? "neg" : ""}">${nb(T.balance)}</td></tr>
  </tbody></table></div>
  <p class="note">Balance = income − expenses − investments${SA ? " − set aside for big bills" : ""} for that month. Past months use your entries; ${mLabel(now)} adds what's still due; later months show the plan (EMIs, SIPs, budgets, salary). Tap a month to see its transactions. Card spends count in the month their bill is due, under their own categories.</p>`
    : `<div style="height:12px"></div>${catTable(tab === "income" ? "byInc" : "byCat", tab === "income")}
  <p class="note">Main categories; subcategories are added into their main category. Shaded columns are planned, not yet spent.</p>`}`;
}

/* ---------- trends ---------- */
const TRP: [string, string][] = [["month", "This month"], ["last", "Last month"], ["3m", "3 months"], ["ytd", "This year"], ["12m", "12 months"]];
function wherePanel(d: MoneyData, st: InsState): string {
  const p = st.trP || "month", now = ymOf(d.today), drill = st.trD || "";
  const ms = p === "month" ? [now] : p === "last" ? [addM(now, -1)] : p === "3m" ? lastMonths(d, 3, addM(now, -1)) : p === "ytd" ? Array.from({ length: +now.slice(5) }, (_, i) => `${now.slice(0, 4)}-${pad(i + 1)}`) : lastMonths(d, 12, addM(now, -1));
  const agg = new Map<string, number>();
  for (const ym of ms) { const f = monthFigures(d, ym); if (drill) { const sub = f.sub.get(drill); if (sub) for (const [k, v] of sub) agg.set(k, (agg.get(k) || 0) + v / 100); } else for (const [k, v] of f.byCat) agg.set(k, (agg.get(k) || 0) + v / 100); }
  const top = topN([...agg.entries()], 6), tot = top.reduce((a, [, v]) => a + v, 0);
  const color = (k: string, i: number): string => (k === "__other" ? "var(--vO)" : VC[i]!);
  const name = (k: string): string => (drill ? (k === drill ? `${catLbl(d, drill)} (general)` : catLbl(d, k).replace(/^.*› /, "")) : catLbl(d, k));
  const canDrill = (k: string): boolean => !drill && k !== "__other" && (() => { let n = 0; for (const ym of ms) { const s = monthFigures(d, ym).sub.get(k); if (s && (s.size > 1 || !s.has(k))) n++; } return n > 0; })();
  const items = top.map(([k, v], i) => ({ name: name(k), value: v, color: color(k, i), attrs: canDrill(k) ? `data-trd="${esc(k)}"` : "" }));
  const range = ms.length === 1 ? mLabel(ms[0]!) : `${mShort(ms[0]!)} – ${mShort(ms[ms.length - 1]!)}`;
  const pills = `<div class="chsel"><div class="pills" role="group" aria-label="Period">${TRP.map(([k, l]) => `<button type="button" data-trp="${k}" aria-pressed="${p === k}">${l}</button>`).join("")}</div></div>`;
  const back = drill ? `<div class="chsel"><button class="btn sm" type="button" data-trd="">‹ All categories</button><span class="note" style="margin:0">${esc(catLbl(d, drill))}</span></div>` : "";
  if (!tot) return chartCard("Where the money went", range, pills + back + `<div class="empty" style="padding:20px 8px">No spending in this period.</div>`);
  const list = `<div class="dlist">${items.map((x) => { const tag = x.attrs ? "button" : "div"; return `<${tag} class="di" ${x.attrs ? `type="button" ${x.attrs}` : ""}><i style="background:${x.color}"></i><span class="dn2">${esc(x.name)}${x.attrs ? " ›" : ""}</span><span class="dp">${(x.value / tot * 100).toFixed(0)}%</span><span class="dv">${fmtMoney(x.value)}</span></${tag}>`; }).join("")}</div>`;
  return chartCard("Where the money went", range, pills + back + `<div class="dwrap">${donutChart({ items, center: [short(Math.round(tot * 100)).replace("₹", ""), drill ? "in this category" : "spent"], aria: `Spending by ${drill ? "subcategory" : "category"}, ${range}` })}${list}</div>`,
    `<p class="cnote">${drill ? "Subcategories of " + esc(catLbl(d, drill)) + "." : "Tap a category to see its subcategories."} ${p === "month" ? "This month includes what's still due." : ""}</p>`);
}
function catTrendPanel(d: MoneyData, st: InsState, M: YM[], F: MonthFigures[]): string {
  const now = ymOf(d.today), totals = new Map<string, number>();
  for (const f of F) for (const [k, v] of f.byCat) totals.set(k, (totals.get(k) || 0) + v);
  const opts = [...totals.entries()].filter(([k]) => k !== "cardopen").sort((a, b) => b[1] - a[1]);
  if (!opts.length) return chartCard("Category over time", "", `<div class="empty" style="padding:20px 8px">No spending yet.</div>`);
  const c = opts.some(([k]) => k === st.trC) ? st.trC! : opts[0]![0], vals = F.map((f) => (f.byCat.get(c) || 0) / 100);
  const di = M.map((_m, i) => i).filter((i) => M[i]! < now), av = di.length ? di.reduce((s, i) => s + vals[i]!, 0) / di.length : 0;
  const sel = `<div class="chsel"><select id="trCat" aria-label="Category">${opts.map(([k]) => `<option value="${esc(k)}" ${k === c ? "selected" : ""}>${esc(catLbl(d, k))}</option>`).join("")}</select></div>`;
  return chartCard("Category over time", `avg ${fmtMoney(av)}/month`, sel + barChart({ half: true, labels: M.map(mShort), ticks: M.map(mTick), full: M.map(mLabel), series: [{ name: catLbl(d, c), color: "var(--v2)", values: vals }], h: 190, avg: { v: av, label: "avg " + AX(av) }, dim: (i) => M[i] === now,
    attrs: (i) => `data-ymc="${M[i]}|${esc(c)}"`, foot: (i) => `${av > 0.5 ? `${pctS((vals[i]! - av) / av * 100)} vs average · ` : ""}tap to see entries`, aria: `${catLbl(d, c)} spending by month` }),
    `<p class="cnote">Dashed line: average of the full months shown.</p>` + tableHtml(M.map(mLabel), [{ name: catLbl(d, c), values: vals }]));
}
function yoyPanel(d: MoneyData): string {
  const now = ymOf(d.today), y = +now.slice(0, 4), m = +now.slice(5);
  const cum = (yr: number, upto: number): (number | null)[] => { let s = 0; return Array.from({ length: 12 }, (_, i) => { if (i >= upto) return null; s += monthFigures(d, `${yr}-${pad(i + 1)}`).expense / 100; return s; }); };
  const a = cum(y, m), b = cum(y - 1, 12);
  if (!b.some((v) => v! > 0.5)) return "";
  const ser = [{ name: String(y), color: "var(--v1)", values: a, width: 2.5 }, { name: String(y - 1), color: "var(--vLast)", values: b }];
  const diff = a[m - 1]! - b[m - 1]!;
  return chartCard("This year vs last year", `${MN[m - 1]}: ${diff >= 0 ? "+" : "−"}${fmtMoney(Math.abs(diff))} vs ${y - 1}`,
    lineChart({ labels: [...MN], ticks: [...MN], full: MN.map((x) => x), series: ser, h: 200, aria: `Running total of spending, ${y} against ${y - 1}`,
      tip: (i) => tipRows([{ n: String(y), c: "var(--v1)", v: a[i] == null ? "—" : fmtMoney(a[i]!) }, { n: String(y - 1), c: "var(--vLast)", v: fmtMoney(b[i] || 0) }], `Spent by end of ${MN[i]}`, a[i] != null && b[i] ? `${pctS((a[i]! - b[i]!) / b[i]! * 100)} vs ${y - 1}` : "") }),
    legendHtml(ser) + `<p class="cnote">Running total of spending from January. ${MN[m - 1]} ${y} includes what's still due.</p>` + tableHtml(MN.map((x) => x), ser));
}
function trendsPanel(d: MoneyData, st: InsState): string {
  const N = st.trN || 12, now = ymOf(d.today), M = lastMonths(d, N), F = M.map((ym) => monthFigures(d, ym));
  const lbl = M.map(mShort), tick = M.map(mTick);
  const inc = F.map((f) => R(incOf(f))), exp = F.map((f) => R(f.expense)), inv = F.map((f) => R(f.investment));
  const dimCur = (i: number): boolean => M[i] === now;
  const nSel = `<div class="seg" role="group" aria-label="Range" style="margin-top:12px">${[[6, "6 months"], [12, "12 months"], [24, "24 months"]].map(([v, l]) => `<button type="button" data-trn="${v}" aria-pressed="${N === v}">${l}</button>`).join("")}</div>`;
  const ser = [{ name: "Income", color: "var(--v1)", values: inc }, { name: "Spent", color: "var(--v3)", values: exp }, { name: "Invested", color: "var(--v2)", values: inv }];
  const done = F.map((_f, i) => i).filter((i) => M[i]! < now), avg = (a: number[]): number => (done.length ? done.reduce((s, i) => s + a[i]!, 0) / done.length : 0);
  const c1 = chartCard("Money in and out", `avg spend ${fmtMoney(avg(exp))}/month`,
    barChart({ half: true, labels: lbl, ticks: tick, full: M.map(mLabel), series: ser, h: 220, dim: dimCur, aria: `Income, spending and investing for the last ${N} months`, attrs: (i) => `data-ym="${M[i]}"`,
      foot: (i) => `${M[i] === now ? "So far + still due · " : ""}Left over ${fmtMoney(inc[i]! - exp[i]! - inv[i]!)} · tap to see entries` }),
    legendHtml(ser) + `<p class="cnote">${mLabel(now)} includes what's still due this month. Card spends count in the month their bill is due. "Last month balance" isn't counted as income.</p>` + tableHtml(M.map(mLabel), ser));
  const rate = inc.map((v, i) => (v > 0.5 ? (v - exp[i]!) / v * 100 : null)), rd = done.filter((i) => rate[i] != null), ravg = rd.length ? rd.reduce((s, i) => s + rate[i]!, 0) / rd.length : null;
  const pf = (v: number | null): string => (v == null ? "—" : v.toFixed(1) + "%");
  const c2 = chartCard("Savings rate", ravg != null ? `average ${ravg.toFixed(0)}%` : "",
    lineChart({ half: true, labels: lbl, ticks: tick, full: M.map(mLabel), series: [{ name: "Savings rate", color: "var(--v1)", values: rate }], h: 170, dots: true, fmt: pf, axFmt: (v) => Math.round(v) + "%", aria: "Share of income not spent, by month",
      foot: (i) => (inc[i]! > 0.5 ? `Income ${fmtMoney(inc[i]!)} − spent ${fmtMoney(exp[i]!)}. Investing counts as saving.` : "No income recorded") }),
    `<p class="cnote">Share of income you didn't spend (investments count as saved).</p>` + tableHtml(M.map(mLabel), [{ name: "Savings rate", values: rate }], pf as (v: number) => string));
  return nSel + `<div class="cgrid two">${c1}${c2}</div>` + `<div class="cgrid two">${wherePanel(d, st)}${catTrendPanel(d, st, M, F)}</div>` + `<div class="cgrid">${yoyPanel(d)}</div>`;
}

/** The whole page. */
export function insightsHtml(d: MoneyData, st: InsState): string {
  const t = st.insTab || "month";
  const seg = `<div class="seg" role="group" aria-label="Insights" style="margin-top:4px">${[["month", "Month"], ["trends", "Trends"], ["year", "Year"], ["home", esc(homeTag(d))]].map(([k, l]) => `<button type="button" data-ins="${k}" aria-pressed="${t === k}">${l}</button>`).join("")}</div>`;
  return seg + (t === "year" ? vYear(d, st) : t === "home" ? homePanel(d, st) : t === "trends" ? trendsPanel(d, st) : monthView(d, st));
}

export const insightsPage: Page = {
  html(d, h) {
    const S = h.state() as unknown as InsState;
    if (S.insTab === "forecast") { S.insTab = "month"; S.planTab = "cashflow"; queueMicrotask(() => h.go("plan")); }
    return insightsHtml(d, S);
  },
  act(el, h, redraw) {
    const S = h.state() as unknown as InsState, x = el.dataset, now = ymOf(h.data().today);
    if (x.ins !== undefined) { if (x.ins === "forecast") { S.planTab = "cashflow"; return h.go("plan"); } S.insTab = x.ins; return redraw(); }
    if (x.hyr !== undefined) { S.homeYr = String(x.hyr); return redraw(); }
    if (x.hm !== undefined) { S.hm = addM(S.hm || now, +x.hm); S.hmOpen = ""; return redraw(); }
    if (x.hmt !== undefined) { S.hmTab = x.hmt; S.hmOpen = ""; S.hmOpen2 = ""; return redraw(); }
    if (x.hmo !== undefined) { S.hmOpen = S.hmOpen === x.hmo ? "" : x.hmo; S.hmOpen2 = ""; return redraw(); }
    if (x.hmo2 !== undefined) { S.hmOpen2 = S.hmOpen2 === x.hmo2 ? "" : x.hmo2; return redraw(); }
    if (x.yr !== undefined) { S.year = (S.year || +h.data().today.slice(0, 4)) + +x.yr; return redraw(); }
    if (x.ytab !== undefined) { S.yearTab = x.ytab; return redraw(); }
    if (x.taxfy !== undefined) { S.taxFy = (S.taxFy || fyOf(h.data().today)) + +x.taxfy; return redraw(); }
    if (x.trn !== undefined) { S.trN = +x.trn; return redraw(); }
    if (x.trp !== undefined) { S.trP = x.trp; S.trD = ""; return redraw(); }
    if (x.trd !== undefined) { S.trD = x.trd; return redraw(); }
    if (x.tx !== undefined) { const t = h.data().byId<Tx>("txns", x.tx); if (t && ["expense", "income", "transfer", "investment"].includes(String(t.type))) return txnForm({ ...t }); }
    return false;
  },
  change(t, h, redraw) {
    const S = h.state() as unknown as InsState;
    if (t.id === "trCat") { S.trC = t.value; return redraw(); }
    if (t.dataset?.taxhome) {
      const l = h.data().byId("loans", t.dataset.taxhome);
      if (l) { const o: Rec & { taxHome?: boolean } = { ...l, updatedAt: Date.now() }; if (t.checked) o.taxHome = true; else delete o.taxHome; E().write([{ c: "loans", r: o }]); }
    }
  },
};
void rateTxt;
