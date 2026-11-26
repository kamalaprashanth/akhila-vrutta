/**
 * Money for a new user (approved design, 26 Nov 2026): what it does, then the main bank account and its balance
 * today; a starting set of categories (each user's own, changed any time in Money settings). The KP Money
 * Planner import is offered only to the app's owner.
 */
import { html, raw } from "../../core/dom.ts";
import { ctx } from "../../core/app.ts";
import { isOwner } from "../../core/ai.ts";
import { META, type Rec } from "../../core/store.ts";
import { AMOUNTS_VERSION } from "./paise.ts";

export const START_EXPENSE = ["Groceries", "Eating out", "Rent", "Electricity", "Water", "Gas", "Internet & mobile", "Fuel", "Cabs & travel", "Shopping", "Health", "Education", "Entertainment", "Personal care", "Gifts & donations", "Insurance", "EMI", "Taxes", "Household help", "Other"];
export const START_INCOME = ["Salary", "Business", "Interest", "Dividends", "Rent received", "Refunds", "Gifts received", "Other income"];
const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const ic = (d: string): string => html`<span class="dico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${d}"/></svg></span>`;

/** The records a fresh start writes (amounts in paise, as stored). */
export function freshRecords(name: string, balancePaise: number): { c: string; id: string; r: Rec }[] {
  const now = Date.now(), cats = [...START_EXPENSE.map((n) => [n, "expense"]), ...START_INCOME.map((n) => [n, "income"])] as [string, string][];
  const acc = { id: `acc-${uid()}`, name, type: "bank", opening: balancePaise, main: true, updatedAt: now };
  return [
    ...cats.map(([n, kind]) => { const id = `cat-${uid()}`; return { c: "categories", id, r: { id, name: n, kind, updatedAt: now } }; }),
    { c: "accounts", id: acc.id, r: acc },
    { c: META, id: "money", r: { id: "money", schema: 1, amounts: AMOUNTS_VERSION, source: "Fresh start", imported: new Date().toISOString(), updatedAt: now } },
  ];
}

let step = 1;
export function freshPage(root: HTMLElement, done: () => void): void {
  const own = isOwner() ? html`<p class="note" style="text-align:center"><a href="#/settings">Import from KP Money Planner</a> (only you see this)</p>` : "";
  if (step === 1) {
    root.innerHTML = html`<div class="mv frv"><div class="wrap">
      <p class="frstep">Set up Money · 1 of 2</p>
      <h2 class="frh">Know what's coming, before it's due</h2>
      <div class="list">
        <div class="row">${raw(ic("M3 6h18v14H3zM3 10h18M16 15h2"))}<div class="main"><div class="t">Bills and EMIs</div><div class="s">A week ahead: what to pay, what to put aside</div></div></div>
        <div class="row">${raw(ic("M3 5h18v16H3zM3 10h18M8 3v4M16 3v4"))}<div class="main"><div class="t">A plan for every month</div><div class="s">Salary in, regular payments out, what's left</div></div></div>
        <div class="row">${raw(ic("M3 10l9-6 9 6M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18"))}<div class="main"><div class="t">Accounts, cards, loans, investments</div><div class="s">One place, encrypted on your phone first</div></div></div>
      </div>
      <p class="note">Takes a minute: your main bank account and its balance today. Everything else can come later.</p>
      <button type="button" class="btn pri frgo" id="frStart">Start</button>
      ${raw(own)}
    </div></div>`;
    root.querySelector("#frStart")!.addEventListener("click", () => { step = 2; freshPage(root, done); });
    return;
  }
  root.innerHTML = html`<div class="mv frv"><div class="wrap">
    <p class="frstep">Set up Money · 2 of 2</p>
    <h2 class="frh">Your main bank account</h2>
    <div class="f"><label for="frName">Name</label><input id="frName" type="text" autocomplete="off" placeholder="e.g. HDFC Savings"></div>
    <div class="f"><label for="frBal">Balance today (₹)</label><input id="frBal" type="text" inputmode="decimal" autocomplete="off" placeholder="e.g. 45,000"></div>
    <p class="note frerr" id="frErr" role="alert"></p>
    <p class="note" style="margin-top:6px"><b>Categories to start with</b> (yours to change any time, in Money settings)</p>
    <div class="frcats">${raw(START_EXPENSE.map((n) => html`<span>${n}</span>`).join(""))}</div>
    <div class="frcats">${raw(START_INCOME.map((n) => html`<span>${n}</span>`).join(""))}</div>
    <div class="btns"><button type="button" class="btn pri" id="frDone">Finish</button><button type="button" class="btn" id="frBack">Back</button></div>
  </div></div>`;
  root.querySelector("#frBack")!.addEventListener("click", () => { step = 1; freshPage(root, done); });
  root.querySelector("#frDone")!.addEventListener("click", () => {
    const name = root.querySelector<HTMLInputElement>("#frName")!.value.trim(), raw0 = root.querySelector<HTMLInputElement>("#frBal")!.value.replace(/[₹,\s]/g, "");
    const err = root.querySelector<HTMLElement>("#frErr")!;
    if (!name) { err.textContent = "Give the account a name."; return; }
    if (!/^-?\d+(\.\d{1,2})?$/.test(raw0)) { err.textContent = "Type the balance as a number, like 45000 or 45,000.50."; return; }
    ctx.store?.writeMany(freshRecords(name, Math.round(Number(raw0) * 100)));
    step = 1;
    done();
  });
}
