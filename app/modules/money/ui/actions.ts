/**
 * Taps on the money pages that open one of Akhila Vrutta's own forms (the planner's activate(), moving
 * over form by form). Anything not handled here still goes to the planner.
 */
import type { MoneyData } from "../calc/data.ts";
import { accForm, catForm, payerForm, pickMainSheet, tagSheet } from "./forms.ts";
import { txnForm } from "./txform.ts";
import { balances, cardInfo, type Account } from "../calc/accounts.ts";
import { E } from "./env.ts";
import { loanAct, loanForm, markMissed } from "./loanforms.ts";
import { planAct } from "./planforms.ts";
import { propAct } from "./propforms.ts";

/** Handles a tap; false: not one of ours yet. */
export function appAct(el: HTMLElement, d: MoneyData): boolean {
  const x = el.dataset, id = el.id;
  const rec = (c: string, k: string | undefined): object | undefined => (k ? d.byId(c, k) : undefined);
  if (x.acc !== undefined) { const a = rec("accounts", x.acc); accForm(a ? { ...a } : {}); return true; }
  if (x.payer !== undefined) { const p = rec("payers", x.payer); if (p) payerForm({ ...p }); return true; }
  if (x.cat !== undefined) { const c = rec("categories", x.cat); catForm(c ? { ...c } : {}); return true; }
  if (x.tagedit !== undefined) { tagSheet(x.tagedit); return true; }
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
  switch (id) {
    case "addLoan": loanForm(); return true;
    case "addAcc": accForm(); return true;
    case "addCat": catForm(); return true;
    case "addPayer": payerForm(); return true;
    case "pickMain": pickMainSheet(); return true;
  }
  return false;
}
