/**
 * A credit card's page, as in KP Money Planner: what's payable and when, credit used and the year's charges,
 * then the billed statement (any earlier one) or the unbilled spends, grouped by day.
 */
import { esc } from "../../../core/dom.ts";
import { MN } from "../calc/dates.ts";
import { num, type MoneyData, type Paise, type Txn } from "../calc/data.ts";
import { balances, cardEff, cardInfo, cardTx, isHist, openDateOf, type Account, type BalTxn } from "../calc/accounts.ts";
import { accName, catName, fmtD, rateTxt } from "../calc/plan.ts";
import { money } from "./txlist.ts";
import { dueText, short } from "./accounts.ts";
import type { Page } from "./pages.ts";
import { morePage } from "./more.ts";

const ACT_LBL: Record<string, string> = { borrow: "Borrowed", repay: "Repaid", prepay: "Part payment", missed: "Missed EMI", catchup: "Paid missed EMIs" };
const CHARGE_RX = /interest|finance charge|service charge|late|fee|gst|charges|penal/i;
type Cat = { id: string; name: string; parentId?: string | null };
interface CardTxn extends BalTxn { categoryId?: string; note?: string; instrument?: string; act?: string; cemi?: unknown }
interface Card extends Account { limit?: Paise; reward?: number; apr?: number; fee?: Paise; feeWaive?: Paise; rewardNote?: string }
const addDay = (x: string): string => { const t = new Date(x + "T00:00"); t.setDate(t.getDate() + 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

function isCharge(d: MoneyData, t: CardTxn): boolean {
  const c = t.categoryId ? d.byId<Cat>("categories", t.categoryId) : undefined;
  const p = c?.parentId ? d.byId<Cat>("categories", c.parentId) : undefined;
  return CHARGE_RX.test(c ? c.name : "") || CHARGE_RX.test(p?.name || "") || /\b(interest|late fee|annual fee|finance charge)\b/i.test(t.note || "");
}
function cardDetails(d: MoneyData, a: Card, bal: Paise): string {
  const y = d.today.slice(0, 4), tx = d.live<CardTxn>("txns").filter((t) => t.type === "expense" && t.accountId === a.id && (t.date ?? "").slice(0, 4) === y);
  const charges = tx.filter((t) => isCharge(d, t)), spend = tx.filter((t) => !isCharge(d, t) && !t.cemi).reduce((s, t) => s + num(t.amount), 0), ch = charges.reduce((s, t) => s + num(t.amount), 0);
  const owed = Math.max(0, -(bal || 0)), lim = num(a.limit), p = lim ? owed / lim * 100 : 0, rw = num(a.reward);
  const st = p >= 75 ? "bad" : p >= 30 ? "warn" : "";
  const fee = num(a.fee), waive = num(a.feeWaive);
  return `<div class="card" style="margin-top:12px">
    ${lim ? `<div class="gt" style="display:flex;justify-content:space-between"><b>Credit used</b><b>${p.toFixed(0)}%</b></div><div class="pbar ${st}"><i style="width:${Math.min(100, p).toFixed(1)}%"></i><span class="mk" style="left:30%"></span></div><div class="note" style="margin:6px 0 0">${money(owed)} of ${money(lim)} · ${money(Math.max(0, lim - owed))} available</div>` : `<div class="note" style="margin:0">Add the credit limit (Edit card) to see how much you're using.</div>`}
    <div class="kv"><span>Spent in ${y}</span><b>${money(spend)}</b>
      ${rw ? `<span>Rewards earned (≈ ${rw}%)</span><b class="in">≈ ${money(spend * rw / 100)}</b>` : ""}
      <span>Interest, fees and GST in ${y}</span><b class="${ch > 50 ? "neg" : ""}">${money(ch)}</b>
      ${num(a.apr) ? `<span>Interest if a bill isn't paid in full</span><b>${rateTxt(a.apr)}% a month (${rateTxt(num(a.apr) * 12)}% a year)</b>` : ""}
      ${fee ? `<span>Annual fee</span><b>${money(fee)}${waive ? ` · waived at ${short(waive)}` : ""}</b>` : ""}</div>
    ${waive ? `<div class="pbar" style="margin-top:10px"><i style="width:${Math.min(100, spend / waive * 100).toFixed(1)}%"></i></div><div class="note" style="margin:6px 0 0">${spend >= waive ? "✓ Spend target for the fee waiver reached" : `${money(waive - spend)} more this year to get the fee waived`}</div>` : ""}
    ${charges.length ? `<details class="ctab"><summary>${charges.length} charge${charges.length === 1 ? "" : "s"} this year</summary><div class="tw"><table><tbody>${charges.sort((p, q) => (q.date ?? "").localeCompare(p.date ?? "")).map((t) => `<tr><td>${fmtD(d, t.date!)} · ${esc(t.note || catName(d, t.categoryId))}</td><td>${money(num(t.amount))}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
    ${a.rewardNote ? `<p class="cnote">${esc(a.rewardNote)}</p>` : ""}</div>`;
}

export function cardHtml(d: MoneyData, S: { cardId?: string; cyc?: number; cardTab?: string }): string | null {
  const a = S.cardId ? d.byId<Card>("accounts", S.cardId) : undefined;
  if (!a || a.deleted || a.type !== "card") return null;
  const bal = balances(d).get(a.id) ?? 0, c = cardInfo(d, a), k = S.cyc || 0, tab = S.cardTab || "billed";
  const txRow = (t: CardTxn): string => {
    const e = cardEff(a, t), pay = e > 0;
    const title = t.type === "transfer" ? (pay ? `Payment from ${accName(d, t.accountId)}` : `Transfer to ${accName(d, t.toAccountId)}`) : t.type === "investment" ? (t.instrument || "Investment") : (t.note || catName(d, t.categoryId));
    const sub = t.type === "expense" || t.type === "income" ? catName(d, t.categoryId) : t.type === "transfer" ? "Transfer" : ACT_LBL[t.act ?? ""] || "";
    return `<div class="row tap" data-tx="${esc(t.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div></div><div class="amt ${pay ? "in" : ""}">${pay ? "+" : ""}${money(Math.abs(e))}</div></div>`;
  };
  const byDay = (list: CardTxn[], lead = ""): string => {
    if (!list.length && !lead) return '<div class="list"><div class="empty">No transactions in this period.</div></div>';
    const g = new Map<string, CardTxn[]>(); for (const t of list) { if (!g.has(t.date!)) g.set(t.date!, []); g.get(t.date!)!.push(t); }
    return [...g.entries()].map(([day, ts]) => {
      const dt = new Date(day + "T00:00"), sp = ts.reduce((x, t) => x + Math.max(0, -cardEff(a, t)), 0), pd = ts.reduce((x, t) => x + Math.max(0, cardEff(a, t)), 0);
      return `<div class="dayhd"><span class="dd">${dt.getDate()}</span><span class="dw">${dt.toLocaleDateString("en-IN", { weekday: "short" })}</span><span class="dm">${MN[dt.getMonth()]} ${dt.getFullYear()}</span><span class="sp"></span>${pd ? `<span class="amt in">+${money(pd)}</span>` : ""}${sp ? `<span class="amt">${money(sp)}</span>` : ""}</div><div class="list">${ts.map(txRow).join("")}</div>`;
    }).join("") + lead;
  };
  const head = `
  <div class="monthbar"><button class="btn sm" type="button" data-go="accounts" aria-label="Back to Accounts">‹</button><div class="m" style="text-align:left">${esc(a.name)}</div><span class="chip">Credit card</span></div>`;
  const acts = `<div class="btns" style="margin-top:12px"><button class="btn sm pri" type="button" data-ca="pay">Pay bill</button><button class="btn sm" type="button" data-ca="spend">Add spend</button><button class="btn sm" type="button" data-ca="edit">Edit card</button></div>`;
  const tx = (from: string, to?: string | null): CardTxn[] => cardTx(d, a, from, to ?? undefined) as CardTxn[];
  if (!c) return `${head}<div class="sumbar"><div><div class="k">Outstanding</div><div class="v neg">${money(Math.max(0, -bal))}</div></div></div>
    <div class="banner">Add the card's statement day and due day to see the payable amount and due date.</div>${acts}${cardDetails(d, a, bal)}
    <h2>Transactions</h2>${byDay(tx("0000"))}`;
  const cc = cardInfo(d, a, k)!, first = !d.live<Txn>("txns").some((t) => !isHist(t) && (t.date ?? "") <= cc.prev && cardEff(a, t as BalTxn) !== 0);
  const billedTx = tx(cc.prev, cc.stmt), unb = tx(c.stmt, null);
  const payTx = tx(cc.stmt, k === 0 ? null : cc.next).filter((t) => cardEff(a, t) > 0);
  const od = openDateOf(a), opening0 = num(a.opening);
  const opRow = (lbl: string): string => `<div class="dayhd"><span class="dm">${lbl}</span></div><div class="list"><div class="row"><div class="main"><div class="t">Opening balance</div><div class="s">Carried in from Money Manager</div></div><div class="amt">${money(Math.abs(opening0))}</div></div></div>`;
  const opening = !opening0 ? "" : od ? (od > cc.prev && od <= cc.stmt ? opRow(`From ${fmtD(d, od)}`) : "") : (first ? opRow(`Before ${fmtD(d, addDay(cc.prev))}`) : "");
  const openingUnb = opening0 && od && od > c.stmt ? opRow(`From ${fmtD(d, od)}`) : "";
  return `${head}
  <div class="sumbar">
    <div><div class="k">Payable</div><div class="v ${c.dueLeft > 50 ? "neg" : ""}">${money(c.dueLeft)}</div></div>
    <div><div class="k">Outstanding</div><div class="v">${money(c.owed)}</div></div>
    <div><div class="k">Due</div><div class="v sm">${c.due ? fmtD(d, c.due) : "—"}</div></div>
  </div>
  <p class="note" style="text-align:center">${dueText(d, c)}</p>
  <p class="note" style="text-align:center;margin-top:-4px">Bill ${money(c.billed)} on ${fmtD(d, c.stmt)} · paid ${money(c.paid)} · unbilled ${money(c.unbilled)}</p>
  ${acts}${cardDetails(d, a, bal)}
  <div class="seg" role="group" aria-label="Card view" style="margin-top:16px">${[["billed", `Billed · ${money(c.dueLeft)}`], ["unbilled", `Unbilled · ${money(c.unbilled)}`]].map(([v, l]) => `<button type="button" data-ct="${v}" aria-pressed="${tab === v}">${l}</button>`).join("")}</div>
  ${tab === "billed" ? `
  <div class="monthbar"><button class="btn sm" type="button" data-cyc="1" aria-label="Earlier statement">‹</button><div class="m" style="font-size:14px">${fmtD(d, addDay(cc.prev))} – ${fmtD(d, cc.stmt)}<div class="note" style="margin:0;font-weight:400">Bill ${money(cc.billed)} · paid ${money(cc.paid)} · ${cc.dueLeft > 50 ? `left ${money(cc.dueLeft)}` : "settled"}${cc.due ? ` · due ${fmtD(d, cc.due)}` : ""}</div></div><button class="btn sm" type="button" data-cyc="-1" aria-label="Later statement" ${k === 0 ? "disabled" : ""}>›</button></div>
  ${byDay(billedTx, opening)}
  ${payTx.length ? `<h2>Payments toward this bill</h2>${byDay(payTx)}` : ""}`
  : `
  <p class="note" style="text-align:center;margin-top:12px">${money(c.unbilled)} unbilled since ${fmtD(d, c.stmt)}${openingUnb ? " (includes the opening balance)" : ""} · goes into the ${fmtD(d, c.next)} statement</p>
  ${byDay(unb, openingUnb)}`}`;
}

type CardState = { cardId?: string; cyc?: number; cardTab?: string };
export const cardPage: Page = {
  html(d, h) {
    const x = cardHtml(d, h.state() as CardState);
    if (x != null) return x;
    (h.state() as { view: string }).view = "more";   // the card is gone: Money settings, as the planner does
    return morePage.html(d, h);
  },
  act(el, h, redraw) {
    const S = h.state() as unknown as CardState;
    if (el.dataset.ct) { S.cardTab = el.dataset.ct; redraw(); return; }
    if (el.dataset.cyc) { S.cyc = Math.max(0, (S.cyc || 0) + +el.dataset.cyc); redraw(); return; }
    if (el.dataset.go) { h.go(el.dataset.go); return; }
    return false;   // pay, add spend, edit card, an entry: the planner's forms for now
  },
};
