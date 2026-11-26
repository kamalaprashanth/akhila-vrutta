/**
 * Adding and editing a transaction (expense, income, transfer, investment), splitting a spend across
 * categories, and the month's carried balance. The same sheets as KP Money Planner, reading and saving
 * the stored records in paise.
 */
import { esc } from "../../../core/dom.ts";
import { addM, mLabel, todayOf, ymOf } from "../calc/dates.ts";
import { num, type MoneyData, type Paise, type Rec } from "../calc/data.ts";
import { monthNet } from "../calc/accounts.ts";
import { activeBudgets, budgetSpent, stampDuty, accName, catName, fmtD, type Recurring } from "../calc/plan.ts";
import { mainAcc } from "../calc/forecast.ts";
import { reserveAcc } from "../calc/properties.ts";
import { holdingFor, UNIT_TYPES as _U } from "../calc/invest.ts";
import { bankOf, kindOf } from "../calc/loans.ts";
import type { Loan } from "../calc/data.ts";
import { allTags, money, payers, type Tx } from "../views/txlist.ts";
import { $, $$, accOpts, askConfirm, attachPickers, catOpts, closeModal, field, openSheet, paiseOf, rs, toast, val, inrFmt } from "./kit.ts";
import { E, del, uid, upsert } from "./env.ts";
void _U;

const TYPE_LBL: Record<string, string> = { expense: "Expense", income: "Income", investment: "Investment", transfer: "Transfer" };
export const INV_TYPES = ["Mutual Fund", "Stock", "US Stocks", "PPF", "NPS", "EPF", "Gold", "FD / RD", "Bonds", "Real estate", "Other"];
interface Payer extends Rec { name: string; own?: boolean; tag?: string }
const payersAll = (d: MoneyData): Payer[] => d.all<Payer>("payers");
const payerNote = (p: Payer): string => p.own
  ? `No ${p.name} balance is kept and it isn't added to your totals (for cash, record the ATM withdrawal as the spending). It shows in the list and under its tags.`
  : `Paid by ${p.name} with their own money. It isn't in your balances or totals; it shows in the list and under its tags${p.tag ? `, tagged ${p.tag} automatically` : ""}.`;
const payerLbl = (d: MoneyData, t: Tx): string => (t.paidBy ? (payersAll(d).find((p) => p.id === t.paidBy)?.name ?? t.paidBy) : "");
const loanLbl = (l: Loan & { name?: string; lender?: string }): string => `${l.name}${l.lender ? ` · ${l.lender}` : ""}`;
export const legacyLoanOpt = (d: MoneyData, id?: string): [string, string][] => { const l = id ? d.byId<Loan & { name?: string; lender?: string }>("loans", id) : undefined; return l ? [["~" + l.id, `${loanLbl(l)} · loan`]] : []; };
export const instruments = (d: MoneyData): string[] => [...new Set([
  ...d.live<Rec & { instrument?: string; name?: string }>("holdings").map((h) => String(h.instrument || h.name)),
  ...[...d.live<Rec & { type?: string; instrument?: string }>("txns"), ...d.live<Rec & { type?: string; instrument?: string }>("recurring")].filter((x) => x.type === "investment" && x.instrument).map((x) => x.instrument!),
])];

/* ---------- money from loans ---------- */
type Fund = { loan: string; amt: Paise; part?: string };
export function fundsOf(t: Tx): Fund[] {
  if (t.type !== "expense") return [];
  const tot = Math.abs(num(t.amount));
  if ((t.funds ?? []).length) { let left = tot; return t.funds!.map((f) => { const a = Math.max(0, Math.min(num(f.amt), left)); left -= a; return { loan: f.loan ?? "", amt: a, part: f.part || "" }; }).filter((f) => f.loan && f.amt > 0); }
  if (t.fundLoan) return [{ loan: t.fundLoan, amt: Math.min(num(t.fundAmt) || num(t.amount), num(t.amount)), part: "" }];
  if (t.fromLoan) return [{ loan: t.fromLoan, amt: num(t.amount), part: "" }];
  return [];
}
const fundLoanOpts = (d: MoneyData): [string, string][] => [["", "No, my own money"], ...d.live<Loan & { name?: string; lender?: string }>("loans").filter((l) => kindOf(l) !== "cardemi").map((l) => [l.id, loanLbl(l)] as [string, string])];
export const fundsBox = (): string => `<div class="f" id="w_funds"><label>Money from loans</label><div class="fundList"></div><button type="button" class="btn sm fundAdd">+ Add a loan</button><div class="note fundOwn" style="margin:6px 0 0"></div><div class="hint">For borrowed money (from family, a friend or a lender) that came into your account and paid for this.</div></div>`;
/** The "Money from loans" rows. Amounts typed in rupees; `get` returns paise. */
export function fundsUI(d: MoneyData, host: HTMLElement, init: Fund[], totalFn: () => number) {
  const L = fundLoanOpts(d).slice(1);
  let rows = init.map((f) => ({ loan: f.loan, amt: f.amt ? String(f.amt / 100) : "", part: f.part || "own" }));
  const tot = (): number => Math.abs(totalFn() || 0), sum = (): number => rows.reduce((a, r) => a + (parseFloat(String(r.amt).replace(/,/g, "")) || 0), 0);
  const own = (): void => {
    const el = host.querySelector<HTMLElement>(".fundOwn")!;
    if (!rows.some((r) => r.loan)) { el.textContent = "All your own money"; el.classList.remove("warn"); return; }
    const t = tot(), lone = rows.filter((r) => r.loan).length === 1 && !String(rows.find((r) => r.loan)!.amt).trim();
    const rest = lone ? 0 : t - sum();
    el.textContent = rest < -0.5 ? `The loans add up to ${money(Math.round(sum() * 100))}, more than the ${money(Math.round(t * 100))} paid` : `Your own money: ${money(Math.round(Math.max(0, rest) * 100))}`;
    el.classList.toggle("warn", rest < -0.5);
  };
  const draw = (): void => {
    host.querySelector(".fundList")!.innerHTML = rows.map((r, i) => {
      const l = r.loan ? d.byId<Loan & { lender?: string }>("loans", r.loan) : undefined, hy = !!l && kindOf(l) === "hybrid";
      return `<div class="fundrow" data-i="${i}"><select data-k="loan" aria-label="Loan">${[["", "Choose a loan"], ...L].map(([v, x]) => `<option value="${esc(v)}" ${v === r.loan ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>
        <input data-k="amt" data-inr type="text" inputmode="decimal" aria-label="Amount from this loan" placeholder="${rows.length === 1 ? "All of it" : "Amount"}" value="${esc(inrFmt(r.amt))}">
        <button type="button" class="btn sm" data-x aria-label="Remove this loan">✕</button>
        ${hy ? `<select data-k="part" class="fpart" aria-label="Which part"><option value="own" ${r.part !== "bank" ? "selected" : ""}>${esc(l!.lender || "Their")}'s own money (interest-free)</option><option value="bank" ${r.part === "bank" ? "selected" : ""}>Bank-loan money (${esc((bankOf(l!) as { lender?: string } | null)?.lender || "bank")}, with interest)</option></select>` : ""}</div>`;
    }).join("");
    own();
  };
  host.addEventListener("change", (e) => { const t = e.target as HTMLInputElement, row = t.closest<HTMLElement>(".fundrow"); if (!row) return; const r = rows[+row.dataset.i!], k = t.dataset.k as "loan" | "amt" | "part" | undefined; if (!r || !k) return; r[k] = t.value; if (k === "loan") draw(); else own(); });
  host.addEventListener("input", (e) => { const t = e.target as HTMLInputElement, row = t.closest<HTMLElement>(".fundrow"); if (!row || t.dataset.k !== "amt") return; rows[+row.dataset.i!]!.amt = t.value; own(); });
  host.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-x]")) { rows.splice(+t.closest<HTMLElement>(".fundrow")!.dataset.i!, 1); draw(); }
    else if (t.closest(".fundAdd")) { rows.push({ loan: "", amt: "", part: "own" }); draw(); }
  });
  draw();
  return {
    refresh: own,
    get(): Fund[] {
      const t = tot(), rs0 = rows.filter((r) => r.loan);
      if (!rs0.length) return [];
      const out = rs0.map((r) => { const l = d.byId<Loan>("loans", r.loan), a = parseFloat(String(r.amt).replace(/,/g, "")); return { loan: r.loan, amt: a > 0 ? a : rs0.length === 1 ? t : 0, ...(l && kindOf(l) === "hybrid" ? { part: r.part === "bank" ? "bank" : "own" } : {}) }; });
      if (out.some((f) => !(f.amt > 0))) throw new Error("Enter how much came from each loan.");
      if (out.reduce((a, f) => a + f.amt, 0) > t + 0.5) throw new Error("The loans add up to more than the amount paid.");
      return out.map((f) => ({ ...f, amt: Math.round(f.amt * 100) }));
    },
  };
}

/* ---------- tags and note suggestions ---------- */
function tagPicker(d: MoneyData, sheet: HTMLElement, initial?: string[]): () => string[] {
  const sel = new Set(initial ?? []), host = sheet.querySelector<HTMLElement>("#w_tags .tagbox")!;
  const draw = (): void => {
    const tags = [...new Set([...allTags(d), ...sel])];
    host.innerHTML = tags.map((g) => `<button type="button" class="tagchip ${sel.has(g) ? "on" : ""}" data-tg="${esc(g)}" aria-pressed="${sel.has(g)}">${esc(g)}</button>`).join("")
      + `<span class="tagnew"><input type="text" id="tagNew" placeholder="New tag" maxlength="30" aria-label="New tag"><button type="button" class="btn sm" id="tagAdd">Add</button></span>`;
    host.querySelectorAll<HTMLElement>("[data-tg]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); const g = b.dataset.tg!; if (sel.has(g)) sel.delete(g); else sel.add(g); draw(); });
    const inp = host.querySelector<HTMLInputElement>("#tagNew")!;
    const add = (): void => { const g = inp.value.trim().replace(/\s+/g, " "); if (!g) return; const ex = [...sel, ...allTags(d)].find((x) => x.toLowerCase() === g.toLowerCase()); sel.add(ex || g); draw(); host.querySelector<HTMLElement>("#tagNew")!.focus(); };
    host.querySelector<HTMLElement>("#tagAdd")!.onclick = (e) => { e.stopPropagation(); add(); };
    inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } };
  };
  draw();
  return () => { const pending = sheet.querySelector<HTMLInputElement>("#tagNew")?.value.trim(); if (pending) { const ex = allTags(d).find((x) => x.toLowerCase() === pending.toLowerCase()); sel.add(ex || pending); } return [...sel]; };
}
function noteSuggest(d: MoneyData, sheet: HTMLElement): void {
  const inp = sheet.querySelector<HTMLInputElement>("#f_note");
  if (!inp) return;
  const stats = new Map<string, { text: string; count: number; last: string }>();
  for (const t of d.live<Tx>("txns")) {
    if (!["expense", "income", "transfer", "investment"].includes(String(t.type))) continue;
    const n = (t.note || "").trim();
    if (!n) continue;
    const k = n.toLowerCase(), e = stats.get(k) ?? { text: n, count: 0, last: "" };
    e.count++;
    if ((t.date ?? "") > e.last) { e.last = t.date ?? ""; e.text = n; }
    stats.set(k, e);
  }
  const all = [...stats.values()];
  inp.setAttribute("autocomplete", "off"); inp.setAttribute("role", "combobox"); inp.setAttribute("aria-autocomplete", "list"); inp.setAttribute("aria-expanded", "false");
  const box = document.createElement("div");
  box.className = "sugg"; box.id = "noteSugg"; box.setAttribute("role", "listbox"); box.hidden = true;
  (inp.parentNode as HTMLElement).style.position = "relative";
  inp.insertAdjacentElement("afterend", box);
  let items: typeof all = [], hi = -1;
  const close = (): void => { box.hidden = true; inp.setAttribute("aria-expanded", "false"); hi = -1; };
  const pick = (v: string): void => { inp.value = v; close(); inp.dispatchEvent(new Event("input", { bubbles: true })); };
  const draw = (): void => {
    const q = inp.value.trim().toLowerCase();
    if (!q) { close(); return; }
    const score = (e: { text: string }): number => { const k = e.text.toLowerCase(); return k === q ? -1 : k.startsWith(q) ? 0 : k.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : k.includes(q) ? 2 : 9; };
    items = all.map((e) => [e, score(e)] as const).filter(([, sc]) => sc >= 0 && sc < 9).sort((a, b) => a[1] - b[1] || b[0].count - a[0].count || b[0].last.localeCompare(a[0].last)).slice(0, 6).map(([e]) => e);
    if (!items.length) { close(); return; }
    box.innerHTML = items.map((e, i) => `<button type="button" role="option" class="sopt ${i === hi ? "on" : ""}" data-i="${i}" aria-selected="${i === hi}"><span>${esc(e.text)}</span><span class="sc">${e.count}×</span></button>`).join("");
    box.hidden = false; inp.setAttribute("aria-expanded", "true");
  };
  inp.addEventListener("input", (e) => { if (e.isTrusted !== false) { hi = -1; draw(); } });
  inp.addEventListener("focus", draw);
  inp.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.min(items.length - 1, hi + 1); draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(0, hi - 1); draw(); }
    else if (e.key === "Enter" && hi >= 0) { e.preventDefault(); pick(items[hi]!.text); }
    else if (e.key === "Escape") { e.stopPropagation(); close(); }
  });
  box.addEventListener("pointerdown", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-i]"); if (!b) return; e.preventDefault(); pick(items[+b.dataset.i!]!.text); });
  inp.addEventListener("blur", () => window.setTimeout(close, 120));
}

/* ---------- the transaction form ---------- */
interface TxIn extends Partial<Tx> { pot?: string; invType?: string; units?: number }
export function txnForm(t0: TxIn = {}, preset: TxIn = {}): void {
  const d = E().data(), S = E().state() as (Record<string, unknown> & { _potNext?: string | null }) | null;
  const isNew = !t0.id;
  const t: TxIn = { type: "expense", date: todayOf(), ...preset, ...t0 };
  if (S && S._potNext) { if (isNew) t.pot = S._potNext; S._potNext = null; }
  const PA = payersAll(d), P = payers(d) as Payer[];
  const body = `
    <div class="seg" role="group" aria-label="Type" id="tseg">${["expense", "income", "transfer", "investment"].map((k) => `<button type="button" data-k="${k}" aria-pressed="${t.type === k}">${TYPE_LBL[k]}</button>`).join("")}</div><div style="height:12px"></div>
    ${field(["amount", "Amount (₹)", "number", { value: rs(t.amount), step: "0.01", ph: "0.00", neg: 1, hint: "A negative expense, e.g. -500, is a refund or cashback: it reduces that category's spending and adds back to the account." }])}
    <div class="grid2">${field(["date", "Date", "date", { value: t.date }])}${field(["accountId", "From account", "select", { value: t.paidBy ? "@" + t.paidBy : t.fromLoan ? "~" + t.fromLoan : t.accountId, options: [...accOpts(d, "", t.accountId), ...P.map((p) => ["@" + p.id, p.name] as [string, string]), ...legacyLoanOpt(d, t.fromLoan), ...(t.paidBy && !P.some((p) => p.id === t.paidBy) ? [["@" + t.paidBy, payerLbl(d, t as Tx)] as [string, string]] : [])] }])}</div>
    <p class="note spnote" id="spNote" hidden></p>
    ${fundsBox()}
    <label class="opt" id="w_pot" hidden><input type="checkbox" id="f_pot" ${t.pot === "reserve" ? "checked" : ""}><div><b>Paid from the big-bills reserve</b><span>Takes it out of the reserve pot, not your emergency fund.</span></div></label>
    ${field(["toAccountId", "To account", "select", { value: t.toAccountId, options: accOpts(d, "", t.toAccountId), hint: "Use transfers for card bill payments, moving money to savings, or withdrawing cash. They don't count as spending." }])}
    ${field(["categoryId", "Category", "select", { value: t.categoryId, options: catOpts(d, "expense") }])}
    ${field(["budgetId", "Counts toward budget", "select", { value: t.budgetId || "", options: [] }])}
    ${field(["instrument", "Investment", "text", { value: t.instrument, ph: "e.g. Nifty 50 index fund SIP", list: "instl", hint: "Only for new money leaving your account. For what you'd already invested, use Accounts → Investments → + Add." }])}<datalist id="instl">${instruments(d).map((i) => `<option value="${esc(i)}">`).join("")}</datalist>
    ${field(["invType", "Investment type", "select", { value: t.invType || "", options: [["", "Choose a type"], ...INV_TYPES.map((x) => [x, x] as [string, string])] }])}
    ${field(["units", "Units bought (optional)", "number", { value: t.units ?? "", step: "any", ph: "e.g. 12.345", hint: "Adds to the holding's units for units × price." }])}
    ${field(["charges", "Charges (₹)", "number", { value: rs(t.charges), step: "0.01", ph: "0.00", hint: "Part of the amount that didn't go into the investment: stamp duty, platform or broker charges. Counted as Fees & Charges; the rest is invested." }])}
    ${field(["note", "Note", "text", { value: t.note, ph: "Optional" }])}
    <div class="f" id="w_tags"><label>Tags</label><div class="tagbox"></div><div class="hint">Tap to tag, e.g. Home, Office, Trip. Use as many as you like.</div></div>
    <label class="opt" style="margin-bottom:12px"><input type="checkbox" id="f_hist" ${t.hist ? "checked" : ""}><div><b>Already in my balances</b><span>For a past entry you're adding late, when your account balances already include it. It shows in Insights and reports but doesn't change any balance, card bill or loan.</span></div></label>
    <div class="btns"><button class="btn pri" id="sv" type="button">${isNew ? "Add" : "Save"}</button><button class="btn" id="spl" type="button">Split</button>${isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>'}<button class="btn" id="cx" type="button">Cancel</button></div>`;
  openSheet(isNew ? "Add transaction" : "Edit transaction", body, (s) => {
    const getTags = tagPicker(d, s, t.tags);
    noteSuggest(d, s);
    let type = String(t.type), first = true;
    const CUR = t.categoryId;
    const FU = fundsUI(d, $("#mvLayer #w_funds")!, t.fromLoan ? [] : fundsOf(t as Tx), () => parseFloat(val("amount")) || 0);
    const el = <T extends HTMLElement = HTMLElement>(id: string): T => s.querySelector<T>("#" + id)!;
    /* mutual funds: fill the 0.005% stamp duty until you type your own charges */
    let chgTouched = t.charges != null && (t.charges as unknown) !== "";
    const chgAuto = (): void => {
      if (chgTouched || type !== "investment") return;
      const ty = val("invType") || holdingFor(d, val("instrument"))?.type, a = parseFloat(val("amount"));
      el<HTMLInputElement>("f_charges").value = ty === "Mutual Fund" && a > 0 ? (stampDuty(Math.round(a * 100)) / 100).toFixed(2) : "";
    };
    el("f_charges").addEventListener("input", () => { chgTouched = true; });
    el("f_amount").addEventListener("input", chgAuto); el("f_invType").addEventListener("change", chgAuto); el("f_instrument").addEventListener("input", chgAuto);
    const sync = (): void => {
      $$("#tseg button", s).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === type)));
      el("w_toAccountId").hidden = type !== "transfer";
      el("w_categoryId").hidden = type === "transfer" || type === "investment";
      el("w_instrument").hidden = type !== "investment"; el("w_invType").hidden = type !== "investment"; el("w_units").hidden = type !== "investment"; el("w_charges").hidden = type !== "investment";
      {
        const gl = (): void => {
          const ty = val("invType") || holdingFor(d, val("instrument"))?.type, g = ty === "Gold", us = ty === "US Stocks";
          s.querySelector("#w_units label")!.textContent = g ? "Grams bought (optional)" : us ? "Shares bought (optional)" : "Units bought (optional)";
          s.querySelector("#w_units .hint")!.textContent = g ? "Adds to the grams in your gold holding." : us ? "Adds to the shares in this US stock holding. Enter the amount above in ₹, as it left your bank." : "Adds to the holding's units for units × price.";
        };
        gl(); el("f_invType").onchange = gl; el("f_instrument").oninput = gl;
      }
      chgAuto();
      {
        const ym = ymOf(val("date") || todayOf()), bs = activeBudgets(d, ym), bsel = el<HTMLSelectElement>("f_budgetId"), keep = bsel.value || t.budgetId || "";
        bsel.innerHTML = [["", "None"], ...bs.map((r: Recurring) => {
          const left = num(r.amount) - budgetSpent(d, r.id, ym) + (t.budgetId === r.id && ymOf(t.date || "") === ym ? num(t.amount) : 0);
          return [r.id, `${r.name} · ${left >= 0 ? money(left) + " left" : "over by " + money(-left)}`];
        })].map(([v, l]) => `<option value="${esc(v)}" ${v === keep ? "selected" : ""}>${esc(l)}</option>`).join("");
        el("w_budgetId").hidden = !(type === "expense" || type === "transfer") || !bs.length;
      }
      s.querySelector("#w_accountId label")!.textContent = type === "income" ? "Into account" : "From account";
      el("spl").hidden = type !== "expense";
      el("w_pot").hidden = !(type === "expense" && reserveAcc(d));
      const asel = el<HTMLSelectElement>("f_accountId");
      el("w_funds").hidden = type !== "expense" || asel.value.startsWith("~") || asel.value.startsWith("@");
      FU.refresh();
      {
        const has = asel.querySelector('option[value^="@"]');
        if (type !== "expense") { if (asel.value.startsWith("~")) asel.value = mainAcc(d)?.id || ""; asel.querySelectorAll('option[value^="~"]').forEach((o) => o.remove()); }
        else if (!asel.querySelector('option[value^="~"]')) for (const [v, l] of legacyLoanOpt(d, t.fromLoan)) { const o = document.createElement("option"); o.value = v; o.textContent = l; asel.appendChild(o); }
        if (type !== "expense") { if (asel.value.startsWith("@")) { asel.value = mainAcc(d)?.id || ""; asel.dispatchEvent(new Event("change", { bubbles: true })); } asel.querySelectorAll('option[value^="@"]').forEach((o) => o.remove()); }
        else if (!has) for (const p of P) { const o = document.createElement("option"); o.value = "@" + p.id; o.textContent = p.name; asel.appendChild(o); }
        const py = type === "expense" && asel.value.startsWith("@") ? PA.find((p) => "@" + p.id === asel.value) : null;
        const fl = type === "expense" && asel.value.startsWith("~");
        el("spNote").hidden = !py && !fl;
        if (py) { el("spNote").textContent = payerNote(py); el("w_budgetId").hidden = true; }
        if (fl) el("spNote").textContent = "Paid straight from the loan: it counts as spending, but no bank balance changes. Record the borrowing on the loan as usual, so it shows what you owe.";
      }
      const sel = el<HTMLSelectElement>("f_categoryId"), kind = type === "income" ? "income" : "expense", opts = catOpts(d, kind);
      const cur = first ? CUR : opts.some(([v]) => v === sel.value) ? sel.value : undefined;
      first = false;
      sel.innerHTML = [["", "Choose a category"], ...opts].map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join("");
    };
    $$("#tseg button", s).forEach((b) => b.onclick = () => { type = b.dataset.k!; sync(); });
    el("f_date").addEventListener("change", sync);
    el("f_accountId").addEventListener("change", sync);
    el("f_amount").addEventListener("input", () => FU.refresh());
    sync();
    el("cx").onclick = closeModal;
    const dl = s.querySelector<HTMLElement>("#dl");
    if (dl) dl.onclick = () => askConfirm("Delete this transaction?", "Delete", () => del("txns", t.id!));
    el("spl").onclick = () => {
      const amount = parseFloat(val("amount"));
      if (!(amount > 0)) { toast("Enter the full amount first."); return; }
      const acc = val("accountId"), o: TxIn = { ...t, type: "expense", amount: Math.round(amount * 100), date: val("date") || todayOf(), note: val("note"), categoryId: val("categoryId") || t.categoryId };
      if (acc.startsWith("@")) { o.paidBy = acc.slice(1); delete o.accountId; delete o.fromLoan; }
      else if (acc.startsWith("~")) { o.fromLoan = acc.slice(1); delete o.accountId; delete o.paidBy; }
      else { o.accountId = acc; delete o.paidBy; delete o.fromLoan; }
      const tg = getTags();
      if (tg.length) o.tags = tg; else delete o.tags;
      closeModal();
      splitSheet(o);
    };
    el("sv").onclick = () => {
      const amount = parseFloat(val("amount"));
      /* expenses and income may be negative (a refund, reversal or cashback booked against its category); transfers and investments may not */
      if (isNaN(amount) || amount === 0) { toast("Enter an amount."); return; }
      if (amount < 0 && !["expense", "income"].includes(type)) { toast("Only expenses and income can be negative. For money coming back, use a transfer the other way."); return; }
      if (!d.live("accounts").length) { toast("Add an account first under Setup."); return; }
      if (type === "transfer" && val("accountId") === val("toAccountId")) { toast("Pick two different accounts for a transfer."); return; }
      if ((type === "expense" || type === "income") && !val("categoryId")) { toast("Pick a category."); return; }
      const o: TxIn & Record<string, unknown> = { ...t, id: t.id || uid(), type, amount: Math.round(amount * 100), date: val("date") || todayOf(), accountId: val("accountId"), note: val("note") };
      const payer = type === "expense" && String(o.accountId || "").startsWith("@") ? o.accountId!.slice(1) : null, pobj = payer ? PA.find((p) => p.id === payer) : undefined;
      if ((type === "expense" || type === "transfer") && val("budgetId")) o.budgetId = val("budgetId"); else delete o.budgetId;
      const tg = getTags();
      if (pobj && pobj.tag && !tg.some((g) => g.toLowerCase() === pobj.tag!.toLowerCase())) tg.push(allTags(d).find((g) => g.toLowerCase() === pobj.tag!.toLowerCase()) || pobj.tag);
      if (tg.length) o.tags = tg; else delete o.tags;
      if (payer) { o.paidBy = payer; delete o.accountId; delete o.budgetId; } else delete o.paidBy;
      if (type === "expense" && String(o.accountId || "").startsWith("~")) { o.fromLoan = o.accountId!.slice(1); delete o.accountId; } else delete o.fromLoan;
      if (type === "expense" && !o.fromLoan && !o.paidBy) { let fs: Fund[]; try { fs = FU.get(); } catch (e) { toast((e as Error).message); return; } if (fs.length) o.funds = fs; else delete o.funds; } else delete o.funds;
      delete o.fundLoan; delete o.fundAmt;
      if (type === "expense") { if (el<HTMLInputElement>("f_pot").checked) o.pot = "reserve"; else if (o.pot === "reserve") delete o.pot; }
      if (type !== "investment") delete o.charges;
      if (type === "transfer") { o.toAccountId = val("toAccountId"); delete o.categoryId; delete o.instrument; }
      else if (type === "investment") {
        if (!val("invType")) { toast("Pick the investment type."); return; }
        o.instrument = val("instrument") || "Investment"; o.invType = val("invType");
        { const u = parseFloat(val("units")); if (u > 0) o.units = u; else delete o.units; }
        { const c = parseFloat(val("charges")); if (c >= amount) { toast("Charges must be less than the amount."); return; } if (c > 0) o.charges = Math.round(c * 100); else delete o.charges; }
        delete o.categoryId; delete o.toAccountId;
      } else { o.categoryId = val("categoryId"); delete o.toAccountId; delete o.instrument; }
      if (el<HTMLInputElement>("f_hist").checked) o.hist = true; else delete o.hist;
      closeModal();
      upsert("txns", o as Rec);
      toast(isNew ? "Added" : "Saved");
    };
    attachPickers(d, s);
  });
}

/* ---------- split one spend across categories ---------- */
export function splitSheet(base: TxIn): void {
  const d = E().data();
  const total: Paise = num(base.amount);
  const rows: { c: string; a: string }[] = [{ c: base.categoryId || "", a: String(total / 100) }, { c: "", a: "" }];
  const leftTxt = (l: number): string => (Math.abs(l) < 1 ? "✓ Adds up" : l > 0 ? `${money(l)} still to assign` : `${money(-l)} too much`);
  const leftOf = (): number => total - rows.reduce((s, r) => s + (paiseOf(r.a) || 0), 0);
  const draw = (): void => {
    $("#splitRows")!.innerHTML = rows.map((r, i) => `<div class="grid2" style="align-items:end">${field(["sc" + i, i === 0 ? "Category" : "", "select", { value: r.c, options: [["", "Choose"], ...catOpts(d, "expense")] }])}${field(["sa" + i, i === 0 ? "Amount (₹)" : "", "number", { value: r.a, step: "0.01" }])}</div>`).join("");
    $("#splitLeft")!.textContent = leftTxt(leftOf());
    rows.forEach((r, i) => {
      $<HTMLSelectElement>("#f_sc" + i)!.onchange = (e) => { r.c = (e.target as HTMLSelectElement).value; };
      $<HTMLInputElement>("#f_sa" + i)!.oninput = (e) => { r.a = (e.target as HTMLInputElement).value.replace(/,/g, ""); $("#splitLeft")!.textContent = leftTxt(leftOf()); };
    });
  };
  openSheet(`Split ${money(total)}`, `<p class="note">${esc(base.note || "This spend")} · ${fmtD(d, base.date ?? todayOf())} · ${esc(base.paidBy ? payerLbl(d, base as Tx) : accName(d, base.accountId))}. Each part becomes its own entry with the same date, account, note and tags.</p>
    <div id="splitRows"></div><p class="note" id="splitLeft" style="font-weight:700"></p>
    <div class="btns"><button class="btn sm" id="addRow" type="button">+ Add a part</button></div>
    <div class="btns"><button class="btn pri" id="sv" type="button">Save split</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    draw();
    s.querySelector<HTMLElement>("#addRow")!.onclick = () => { rows.push({ c: "", a: "" }); draw(); };
    s.querySelector<HTMLElement>("#cx")!.onclick = closeModal;
    s.querySelector<HTMLElement>("#sv")!.onclick = () => {
      const parts = rows.filter((r) => paiseOf(r.a) > 0);
      if (parts.length < 2) { toast("Add at least two parts."); return; }
      if (parts.some((r) => !r.c)) { toast("Pick a category for each part."); return; }
      if (parts.reduce((x, r) => x + paiseOf(r.a), 0) !== total) { toast("The parts must add up to " + money(total) + "."); return; }
      const gid = base.id || uid(), now = Date.now();
      const ops = parts.map((r, i) => {
        const o: Record<string, unknown> = { ...base, id: i === 0 ? gid : uid(), type: "expense", amount: paiseOf(r.a), categoryId: r.c, splitOf: gid, updatedAt: now };
        delete o.budgetId;
        if (i === 0 && base.budgetId) o.budgetId = base.budgetId;
        return { c: "txns", r: o as Rec };
      });
      closeModal();
      E().write(ops);
      toast(`Split into ${parts.length}`);
    };
  });
}

/* ---------- a month's carried balance ---------- */
export function carrySheet(t: Tx): void {
  const d = E().data();
  const pair = [`carry-out-${t.accountId}-${t.ym}`, `carry-in-${t.accountId}-${t.ym}`].map((id) => d.byId<Tx>("txns", id)).filter((x): x is Tx => !!x && !x.deleted);
  const calc = monthNet(d, t.accountId!, t.ym!, true);
  openSheet(`${mLabel(t.ym!)} balance carried`, `
    <p class="note">${esc(accName(d, t.accountId))}'s balance for ${mLabel(t.ym!)} is carried to ${mLabel(addM(t.ym!, 1))} as "Last month balance" income, and ${mLabel(t.ym!)} closes at ₹0.00. Your bank balance isn't changed by this.</p>
    ${field(["carry", "Amount carried (₹)", "number", { value: rs(t.carry), step: "0.01", neg: 1, hint: `Calculated from your entries: ${money(calc)}. A negative amount carries a shortfall: type the amount, then tap − / +.` }])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="rc" type="button">Use calculated</button><button class="btn danger" id="dl" type="button">Remove</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    s.querySelector<HTMLElement>("#cx")!.onclick = closeModal;
    s.querySelector<HTMLElement>("#rc")!.onclick = () => { $<HTMLInputElement>("#mvLayer #f_carry")!.value = inrFmt(calc / 100); };
    s.querySelector<HTMLElement>("#dl")!.onclick = () => askConfirm(`Remove the ${mLabel(t.ym!)} carry-over? It won't be added again automatically.`, "Remove", () => {
      const now = Date.now();
      E().write(pair.map((x) => ({ c: "txns", r: { ...x, deleted: true, updatedAt: now } })));
    });
    s.querySelector<HTMLElement>("#sv")!.onclick = () => {
      const v = parseFloat(val("carry"));
      if (isNaN(v)) { toast("Enter an amount."); return; }
      const p = Math.round(v * 100), now = Date.now();
      closeModal();
      E().write(pair.map((x) => ({ c: "txns", r: { ...x, carry: p, amount: Math.abs(p), updatedAt: now } })));
      toast("Carry-over updated");
    };
  });
}
export { catName };
