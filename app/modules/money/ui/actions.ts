/**
 * Taps on the money pages that open one of Akhila Vrutta's own forms (the planner's activate(), moving
 * over form by form). Anything not handled here still goes to the planner.
 */
import { copyJson, dlJson, exportExcel, icsAll, notifyToggle, restoreSheet } from "./dataio.ts";
import { profForm } from "./profform.ts";
import { holdingForm } from "./holdform.ts";
import type { MoneyData } from "../calc/data.ts";
import { accForm, catForm, payerForm, pickMainSheet, tagSheet } from "./forms.ts";
import { txnForm } from "./txform.ts";
import { balances, cardInfo, type Account } from "../calc/accounts.ts";
import { E, prefSet } from "./env.ts";
import { loanAct, loanForm, markMissed } from "./loanforms.ts";
import { planAct } from "./planforms.ts";
import { propAct } from "./propforms.ts";
import { epfEntryForm, invAct, ppfEntryForm } from "./invforms.ts";
import { carrySheet } from "./txform.ts";
import { catchupForm, entryForm, missedSheet } from "./loanforms.ts";
import { epfTxItems, ppfTxItems } from "../views/txlist.ts";
import { fyOf } from "../calc/invest.ts";
import { toast } from "./kit.ts";
import type { Loan, Rec, Txn } from "../calc/data.ts";

type St = Record<string, unknown> & { f?: Record<string, unknown> };
const st = (): St => (E().state() ?? {}) as unknown as St;
const go = (v: string): void => E().planner("go", v);

/** Opening an entry from a list: a transaction, a loan entry, an EPF / PPF line or a trade (the planner's openTxItem). */
export function openTxItem(d: MoneyData, id: string): void {
  const S = st();
  if (id.startsWith("trd:")) {
    type Tr = Rec & { isin?: string; sym: string };
    const tr = d.byId<Tr>("trades", id.slice(4));
    const hh = tr && d.live<Rec & { px?: string; type?: string; name?: string }>("holdings").find((h) => h.px === "stk:" + tr.isin || (h.type === "Stock" && String(h.name || "").split(" ")[0]!.toUpperCase() === tr.sym.replace(/-\w+$/, "")));
    if (hh) { holdingForm({ ...hh } as never); return; }
    toast(tr ? `You no longer hold ${tr.sym}.` : "Trade not found."); return;
  }
  if (id.startsWith("ppf:")) {
    const it = ppfTxItems(d).find((x) => x.id === id); if (!it) return; S.ppfId = it.hid;
    const hh = d.byId<Rec & { ppf?: { manual?: (Rec & { id: string })[] } }>("holdings", it.hid!);
    if (it.mid && hh) { const m = (hh.ppf?.manual || []).find((x) => x.id === it.mid); if (m) { ppfEntryForm(hh as never, { ...m } as never); return; } }
    S.ppfTab = "statement"; S.ppfFy = fyOf(it.date); go("ppf"); return;
  }
  if (id.startsWith("epf:")) {
    const hid = id.split(":")[1]!, it = epfTxItems(d).find((x) => x.id === id); S.epfId = hid;
    const hh = d.byId<Rec & { epf?: { manual?: (Rec & { id: string })[] } }>("holdings", hid);
    if (it && it.mid && hh) { const m = (hh.epf?.manual || []).find((x) => x.id === it.mid); if (m) { epfEntryForm(hh as never, { ...m } as never); return; } }
    S.epfTab = "passbook"; if (it) S.epfFy = it.fy; go("epf"); return;
  }
  const t = d.byId<Txn & { act?: string; loanId?: string }>("txns", id);
  if (t && t.type === "carry") { carrySheet(t as never); return; }
  if (t && t.type === "loan") { const l = t.loanId ? d.byId<Loan>("loans", t.loanId) : undefined; if (l) { if (t.act === "missed") { missedSheet(l as never, t as never); return; } if (t.act === "catchup") { catchupForm(l as never, { ...t } as never); return; } entryForm(l as never, String(t.act), { ...t } as never); return; } }
  txnForm({ ...(t ?? {}) } as never);
}
import { pxStatusSheet } from "./prices.ts";

/** Handles a tap; false: not one of ours yet. */
export function appAct(el: HTMLElement, d: MoneyData): boolean {
  const x = el.dataset, id = el.id;
  const rec = (c: string, k: string | undefined): object | undefined => (k ? d.byId(c, k) : undefined);
  if (x.acc !== undefined) { const a = rec("accounts", x.acc); accForm(a ? { ...a } : {}); return true; }
  if (x.payer !== undefined) { const p = rec("payers", x.payer); if (p) payerForm({ ...p }); return true; }
  if (x.cat !== undefined) { const c = rec("categories", x.cat); catForm(c ? { ...c } : {}); return true; }
  if (x.tagedit !== undefined) { tagSheet(x.tagedit); return true; }
  if (x.prof !== undefined) { profForm(x.prof); return true; }
  // Going to another page from a link on this one (the planner's go()).
  if (x.tx !== undefined) { openTxItem(d, x.tx); return true; }
  if (x.go !== undefined) { go(x.go); return true; }
  if (x.ins !== undefined) { const S = st(); if (x.ins === "forecast") { S.planTab = "cashflow"; go("plan"); } else { S.insTab = x.ins; go("insights"); } return true; }
  if (x.acct !== undefined) { st().accTab = x.acct; prefSet("accTab", x.acct); go("accounts"); return true; }
  if (x.prop !== undefined) { Object.assign(st(), { propId: x.prop, propTab: "overview" }); go("prop"); return true; }
  if (x.card !== undefined) { Object.assign(st(), { cardId: x.card, cyc: 0, cardTab: "billed" }); go("card"); return true; }
  if (x.loan !== undefined) { Object.assign(st(), { loanId: x.loan, loanTab: "overview" }); go("loan"); return true; }
  if (x.ym !== undefined) { const S = st(); S.month = x.ym; S.f = { ...(S.f || {}), period: "month", cat: "", acc: "", q: "", type: "all" }; go("activity"); return true; }
  if (x.day !== undefined) { const S = st(); S.f = { type: "expense", cat: "", acc: "", tag: "", period: "custom", from: x.day, to: x.day, q: "" }; S.txLimit = 0; go("activity"); return true; }
  // A card's Pay bill / Add spend / Edit card, and Pay on a card bill in Plan.
  if (x.cpay !== undefined || x.ca !== undefined) {
    const S = E().state() as unknown as { cardId?: string } | null;
    if (x.cpay !== undefined && S) S.cardId = x.cpay;
    const ca = x.cpay !== undefined ? "pay" : x.ca!, a = S?.cardId ? d.byId<Account & { payFrom?: string }>("accounts", S.cardId) : undefined;
    if (!a) return true;
    if (ca === "edit") { accForm({ ...a }); return true; }
    if (ca === "spend") { txnForm({}, { type: "expense", accountId: a.id }); return true; }
    const c = cardInfo(d, a), amt = c ? (c.dueLeft > 50 ? c.dueLeft : c.owed) : Math.max(0, -(balances(d).get(a.id) || 0));
    const from = a.payFrom || d.live<Account>("accounts").find((y) => y.type === "bank")?.id;
    txnForm({}, { type: "transfer", amount: Math.round(amt) || undefined, accountId: from, toAccountId: a.id, note: `${a.name} bill` });
    return true;
  }
  // The loan page's buttons and rows, Missed on an EMI in Plan, + Add loan.
  if (x.la !== undefined || x.rc !== undefined || x.pl !== undefined) return loanAct(d, x, (E().state() as unknown as { loanId?: string } | null)?.loanId);
  if (x.miss !== undefined) { markMissed(x.miss); return true; }
  if (planAct(d, x, id)) return true;
  if (propAct(d, x)) return true;
  if (invAct(d, x)) return true;
  switch (id) {
    case "addLoan": loanForm(); return true;
    case "addHold": holdingForm(); return true;
    case "xlsx": exportExcel(); return true;
    case "dlJson": dlJson(); return true;
    case "copyJson": copyJson(); return true;
    case "restore": restoreSheet(); return true;
    case "icsAll": icsAll(); return true;
    case "notifOn": void notifyToggle(); return true;
    case "pxStatus": pxStatusSheet(); return true;
    case "addAcc": accForm(); return true;
    case "addCat": catForm(); return true;
    case "addPayer": payerForm(); return true;
    case "pickMain": pickMainSheet(); return true;
  }
  return false;
}
