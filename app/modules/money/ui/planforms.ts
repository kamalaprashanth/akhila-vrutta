/**
 * Plan forms and actions, as in KP Money Planner: regular items, one month's amount, marking an item paid
 * (or undoing it), Invest day, Pay by Tuesday, market holidays, goals and the emergency fund target.
 * Read and saved in paise.
 */
import { esc } from "../../../core/dom.ts";
import { addM, mLabel, MN, ymOf, type Day, type YM } from "../calc/dates.ts";
import { num, type MoneyData, type Paise, type Rec, type Txn } from "../calc/data.ts";
import { balances, cardInfo, type Account } from "../calc/accounts.ts";
import { accName, catName, fmtD, FREQ, NSE_HOL, paidMap, planned, type PlanItem, type Recurring } from "../calc/plan.ts";
import { forecast, mainAcc } from "../calc/forecast.ts";
import { isAutoItem, isBigItem, obligations } from "../calc/reserve.ts";
import { reserveAcc } from "../calc/properties.ts";
import { holdingSum, type Holding } from "../calc/invest.ts";
import { loanSum } from "../calc/loans.ts";
import { emExcluded, emMonths, retireBase } from "../calc/insights.ts";
import { reserveState } from "../calc/reserve.ts";
import { money } from "../views/txlist.ts";
import { rs0 } from "../views/accounts.ts";
import { findRepeats, FREQ_LBL, GOAL_KINDS } from "../views/plan.ts";
import { INV_TYPES, instruments, txnForm } from "./txform.ts";
import { entryForm, missedSheet } from "./loanforms.ts";
import { accOpts, askConfirm, catOpts, closeModal, field, openSheet, rs, toast, val } from "./kit.ts";
import { E, prefGet, uid } from "./env.ts";

const TYPE_LBL: Record<string, string> = { expense: "Expense", income: "Income", investment: "Investment", transfer: "Transfer" };
const $s = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T => s.querySelector<T>("#" + id)!;
const opt = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T | null => s.querySelector<T>("#" + id);
const W = (c: string, r: Rec): { c: string; r: Rec } => ({ c, r: { ...r, updatedAt: Date.now() } });
const write1 = (c: string, r: Rec): void => E().write([W(c, r)]);
const delRec = (c: string, id: string): void => { const x = E().data().byId(c, id); if (!x) return; const r: Record<string, unknown> = { ...x, deleted: true, updatedAt: Date.now() }; delete r.seed; E().write([{ c, r: r as Rec }]); };
const btnRow = (isNew: boolean, addLbl: string): string => `<div class="btns"><button class="btn pri" id="sv" type="button">${isNew ? addLbl : "Save"}</button><button class="btn" id="cx" type="button">Cancel</button>${isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>'}</div>`;
const addDays = (x: Day, n: number): Day => { const t = new Date(x + "T00:00"); t.setDate(t.getDate() + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const dShort = (x: Day): string => { const t = new Date(x + "T00:00"); return `${t.toLocaleDateString("en-IN", { weekday: "short" })} ${t.getDate()} ${MN[t.getMonth()]}`; };
type R = Recurring & { name?: string; budget?: boolean; auto?: boolean; shift?: string; remind?: number; provider?: string; instrument?: string; invType?: string; charges?: Paise; toAccountId?: string; ov?: Record<string, Paise> };
const appSet = (d: MoneyData): Rec & { holidays?: string[]; emMonths?: number; emEx?: string[] } => d.byId("settings", "app") ?? { id: "app" };

export function recForm(r0: Partial<R> = {}): void {
  const d = E().data(), isNew = !r0.id, r: Partial<R> = { type: "expense", freq: "monthly", start: ymOf(d.today), ...r0 };
  const body = `
    <div class="seg" role="group" aria-label="Type" id="rseg">${["expense", "income", "investment", "transfer"].map((k) => `<button type="button" data-k="${k}" aria-pressed="${r.type === k}">${TYPE_LBL[k]}</button>`).join("")}</div><div style="height:12px"></div>
    ${field(["name", "Name", "text", { value: r.name, ph: "e.g. Netflix, Car insurance, Salary" }])}
    ${field(["amount", "Amount (₹)", "number", { value: rs(r.amount), step: "0.01", ph: "0.00" }])}
    ${field(["freq", "How often", "select", { value: r.freq, options: Object.entries(FREQ_LBL) }])}
    <div class="grid2">${field(["start", "Starts (month)", "month", { value: r.start }])}${field(["end", "Ends (month)", "month", { value: r.end || "", hint: "Leave empty if it doesn't end" }])}</div>
    <div class="grid2">${field(["day", "Due day", "number", { value: r.day || "", ph: "1–31" }])}${field(["accountId", "Paid from / into", "select", { value: r.accountId || "", options: accOpts(d, "Not set") }])}</div>
    ${field(["toAccountId", "To account", "select", { value: r.toAccountId || "", options: accOpts(d, "Choose", r.toAccountId) }])}
    ${field(["categoryId", "Category", "select", { value: r.categoryId, options: catOpts(d, "expense") }])}
    ${field(["instrument", "Investment", "text", { value: r.instrument, ph: "e.g. ICICI small cap SIP", list: "instl" }])}${field(["invType", "Investment type", "select", { value: r.invType || "", options: [["", "Choose a type"], ...INV_TYPES.map((x) => [x, x] as [string, string])] }])}${field(["charges", "Charges each time (₹, optional)", "number", { value: rs(r.charges), step: "0.01", ph: "0.00", hint: "Stamp duty, platform or broker charges taken from each payment. Leave empty for mutual funds and the 0.005% stamp duty is used." }])}<datalist id="instl">${instruments(d).map((i) => `<option value="${esc(i)}">`).join("")}</datalist>
    <label class="opt" id="w_auto"><input type="checkbox" id="f_auto" ${r.auto ? "checked" : ""}><div><b>Auto-debit / auto-renews</b><span>Paid for you (bank auto-debit, standing instruction or auto-renewal), so it isn't on Pay by Tuesday. It's still in the readiness check, so the money is there. Items charged to a card count as auto too: you pay the card bill instead.</span></div></label>
    <label class="opt" id="w_shift"><input type="checkbox" id="f_shift" ${r.shift === "trading" ? "checked" : ""}><div><b>Move to the next trading day</b><span>If the due day falls on a Saturday, Sunday or stock-market holiday, plan it for the next trading day (e.g. investments on the 3rd).</span></div></label>
    <div class="grid2" id="w_rmd">${field(["remind", "Remind me (days before)", "number", { value: r.remind ?? "", ph: "e.g. 30" }])}${field(["provider", "Provider (optional)", "text", { value: r.provider || "", ph: "e.g. HDFC Life, ACT" }])}</div>
    <label class="opt" id="w_budget"><input type="checkbox" id="f_budget" ${r.budget ? "checked" : ""}><div><b>This is a budget (placeholder)</b><span>Spends you tag to it each month reduce what's left; the forecast counts only the remainder. Unused amount is dropped at month end. For cash, tag your ATM withdrawals.</span></div></label>
    <div class="btns"><button class="btn pri" id="sv" type="button">${isNew ? "Add" : "Save"}</button>${isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>'}<button class="btn" id="cx" type="button">Cancel</button></div>`;
  openSheet(isNew ? "Add planned item" : "Edit planned item", body, (s) => {
    let type = String(r.type), first = true; const CUR = r.categoryId;
    const sync = (): void => {
      s.querySelectorAll<HTMLElement>("#rseg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === type)));
      $s(s, "w_categoryId").hidden = type === "investment" || type === "transfer"; $s(s, "w_toAccountId").hidden = type !== "transfer";
      s.querySelector<HTMLElement>("#w_accountId label")!.textContent = type === "transfer" ? "From account" : "Paid from / into";
      $s(s, "w_instrument").hidden = type !== "investment"; $s(s, "w_invType").hidden = type !== "investment"; $s(s, "w_charges").hidden = type !== "investment"; $s(s, "w_budget").hidden = type !== "expense";
      $s(s, "w_end").hidden = val("freq") === "once";
      s.querySelector<HTMLElement>("#w_start label")!.textContent = val("freq") === "once" ? "Month" : "Starts (month)";
      const sel = $s<HTMLSelectElement>(s, "f_categoryId"), kind = type === "income" ? "income" : "expense";
      const dflt = d.live<Rec & { kind?: string; parentId?: string; name?: string }>("categories").find((c) => c.kind === kind && !c.parentId && /^Other/.test(String(c.name)))?.id;
      const cur = first ? (CUR || dflt) : (catOpts(d, kind).some(([v]) => v === sel.value) ? sel.value : dflt); first = false;
      sel.innerHTML = [["", "Choose a category"], ...catOpts(d, kind)].map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join("");
    };
    s.querySelectorAll<HTMLElement>("#rseg button").forEach((b) => { b.onclick = () => { type = b.dataset.k!; sync(); }; });
    $s(s, "f_freq").onchange = sync; sync();
    $s(s, "cx").onclick = closeModal;
    const dl = opt(s, "dl"); if (dl) dl.onclick = () => askConfirm(`Delete "${r.name}"? Past transactions stay.`, "Delete", () => delRec("recurring", r.id!));
    $s(s, "sv").onclick = () => {
      const amount = parseFloat(val("amount")), name = val("name"), start = val("start"), end = val("freq") === "once" ? "" : val("end");
      if (!name) { toast("Give it a name."); return; }
      if (!(amount > 0)) { toast("Enter an amount above zero."); return; }
      if (!/^\d{4}-\d{2}$/.test(start)) { toast("Pick the start month."); return; }
      if (end && end < start) { toast("The end month is before the start month."); return; }
      if (type === "transfer" && (!val("accountId") || !val("toAccountId") || val("accountId") === val("toAccountId"))) { toast("Pick two different accounts for the transfer."); return; }
      if (type !== "investment" && type !== "transfer" && !val("categoryId")) { toast("Pick a category."); return; }
      const day = parseInt(val("day"), 10);
      const o: Record<string, unknown> = { ...r, id: r.id || uid(), type, name, amount: Math.round(amount * 100), freq: val("freq"), start, end: end || null, day: (day >= 1 && day <= 31) ? day : null, accountId: val("accountId") || null };
      if (type === "expense" && $s<HTMLInputElement>(s, "f_budget").checked) o.budget = true; else delete o.budget;
      if ($s<HTMLInputElement>(s, "f_auto").checked) o.auto = true; else delete o.auto;
      if ($s<HTMLInputElement>(s, "f_shift").checked) o.shift = "trading"; else delete o.shift;
      { const rm = parseInt(val("remind"), 10); if (rm > 0) o.remind = rm; else delete o.remind; } if (val("provider")) o.provider = val("provider"); else delete o.provider;
      if (type === "investment") {
        if (!val("invType")) { toast("Pick the investment type."); return; }
        o.instrument = val("instrument") || name; o.invType = val("invType"); delete o.categoryId;
        if (val("charges") === "") delete o.charges; else { const c = parseFloat(val("charges")); if (!(c >= 0) || c >= amount) { toast("Charges must be less than the amount."); return; } o.charges = Math.round(c * 100); }
      } else if (type === "transfer") { o.toAccountId = val("toAccountId"); delete o.categoryId; delete o.instrument; delete o.budget; }
      else { o.categoryId = val("categoryId"); delete o.instrument; }
      if (type !== "transfer") delete o.toAccountId;
      if (type !== "investment") delete o.charges;
      closeModal(); write1("recurring", o as Rec); toast(isNew ? "Added to plan" : "Saved");
    };
  });
}

/** One month's amount for a regular item (or skip it that month). */
export function monthItemSheet(id: string, ym: YM): void {
  const d = E().data(), r = d.byId<R>("recurring", id); if (!r) return;
  const ov = r.ov && r.ov[ym] !== undefined ? num(r.ov[ym]) : null, mon = mLabel(ym), M = MN[+ym.slice(5) - 1];
  openSheet(`${r.name} · ${mon}`, `
    <p class="note" style="margin-top:0">Usually ${money(num(r.amount))} ${FREQ_LBL[String(r.freq)]!.toLowerCase()}. ${ov === 0 ? `Skipped for ${M}.` : ov !== null ? `Changed to ${money(ov)} for ${M}.` : ""}</p>
    ${field(["amt", `Amount for ${mon} only (₹)`, "number", { value: rs(ov !== null && ov !== 0 ? ov : r.amount), step: "0.01", hint: `Other months keep ${money(num(r.amount))}.` }])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save for ${M} only</button>
      ${ov === 0 ? "" : `<button class="btn" id="sk" type="button">Skip ${M}</button>`}
      ${ov !== null ? `<button class="btn" id="rs" type="button">Back to usual</button>` : ""}</div>
    <div class="btns" style="margin-top:14px"><button class="btn" id="all" type="button">Edit for all months</button><button class="btn" id="cx" type="button">Close</button></div>`, (s) => {
    const setOv = (v: Paise | undefined): void => { const o = { ...r, ov: { ...(r.ov || {}) } } as R & { ov?: Record<string, Paise> }; if (v === undefined) delete o.ov![ym]; else o.ov![ym] = v; if (!Object.keys(o.ov!).length) delete o.ov; closeModal(); write1("recurring", o); };
    $s(s, "cx").onclick = closeModal;
    $s(s, "all").onclick = () => { closeModal(); recForm({ ...r }); };
    $s(s, "sv").onclick = () => {
      const v = parseFloat(val("amt")); if (!(v > 0)) { toast(`Enter an amount above zero, or use Skip ${M}.`); return; }
      const p = Math.round(v * 100);
      if (Math.abs(p - num(r.amount)) < 0.5) { setOv(undefined); toast(`${M} uses the usual amount.`); } else { setOv(p); toast(`${r.name}: ${money(p)} for ${M} only.`); }
    };
    const sk = opt(s, "sk"); if (sk) sk.onclick = () => { setOv(0); toast(`${r.name} skipped for ${M}.`); };
    const rb = opt(s, "rs"); if (rb) rb.onclick = () => { setOv(undefined); toast(`${M} back to ${money(num(r.amount))}.`); };
  });
}

/** Marks a planned item paid / received: the entry, filled in, to check and save. */
export function markPaid(it0: PlanItem): void {
  const d = E().data(); let it = it0;
  const ym = it.key.split("|")[1]!, date = ym === ymOf(d.today) ? d.today : ym + "-01";
  if (isBigItem(d, it) && reserveAcc(d) && it.type === "expense") {
    const ra = reserveAcc(d)!, a0 = it.accountId ? d.byId<Account>("accounts", it.accountId) : undefined;
    if (!a0 || a0.type !== "card") { it = { ...it, accountId: ra.id }; const S = E().state() as Record<string, unknown> | null; if (S) S._potNext = "reserve"; }
  }
  const first = d.live<Account>("accounts")[0]?.id;
  if (it.src === "p") { const l = d.byId<Rec & { kind?: string }>("loans", it.id); if (l) entryForm(l as never, "repay", {}, { amount: Math.round(it.amount), accountId: it.accountId || first, link: it.key, date, note: "Planned repayment" }); return; }
  const rc = d.byId<R>("recurring", it.id);
  txnForm({}, { type: it.type, amount: Math.round(it.amount), accountId: it.accountId || first, ...(it.type === "transfer" ? { toAccountId: it.toAccountId } : {}), ...(it.type === "investment" && it.chg ? { charges: it.chg } : {}),
    categoryId: it.categoryId ?? undefined, instrument: it.type === "investment" ? rc?.instrument : undefined, invType: it.type === "investment" ? rc?.invType : undefined, note: it.name, link: it.key, date } as never);
}

/** What was recorded when an item was marked paid, received or missed: undo it, or change it. */
export function undoMark(key: string): void {
  const d = E().data(), t = paidMap(d).get(key) as (Txn & { loanId?: string; act?: string; note?: string }) | undefined; if (!t) return;
  const l = t.loanId ? d.byId<Rec & { name?: string }>("loans", t.loanId) : undefined;
  if (t.act === "missed" && l) { missedSheet(l as never, t as never); return; }
  const ym = key.split("|")[1]!, what = t.type === "income" ? "received" : "paid";
  openSheet(`Marked ${what}`, `<p>${esc(t.note || "This item")} was marked ${what}: ${money(num(t.amount))} on ${fmtD(d, t.date!)}${t.accountId ? ` from ${esc(accName(d, t.accountId))}` : ""}.</p>
    <p class="note">Undo deletes the transaction that was recorded, puts the amount back in the account balance, and shows the item as due again for ${mLabel(ym)}.</p>
    <div class="btns"><button class="btn danger" id="un" type="button">Undo, mark as not ${what}</button><button class="btn" id="ed" type="button">Edit amount or date</button><button class="btn" id="cx" type="button">Close</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    $s(s, "un").onclick = () => { closeModal(); delRec("txns", t.id); toast(`Undone. It shows as due again.`); };
    $s(s, "ed").onclick = () => { closeModal(); if (t.type === "loan" && l) entryForm(l as never, String(t.act), { ...t } as never); else txnForm({ ...t } as never); };
  });
}

/** Records every manual investment due this month, today. */
export function investAll(): void {
  const d = E().data(), todo = forecast(d, 1).months[0]!.rows.filter((r) => r.type === "investment" && r.amount > 50 && !r.paid && !isAutoItem(d, r));
  askConfirm(`Record ${todo.length} investments today for ${rs0(todo.reduce((s, r) => s + r.amount, 0))}? You can add units and price to each later.`, "Record all", () => {
    const ops = todo.map((r) => { const rc = d.byId<R>("recurring", r.id); return W("txns", { id: uid(), type: "investment", amount: Math.round(r.amount), date: d.today, accountId: r.accountId || mainAcc(d)?.id, instrument: rc?.instrument || r.name, invType: rc?.invType, ...(r.chg ? { charges: r.chg } : {}), note: r.name, link: r.key } as Rec); });
    E().write(ops); toast(`${todo.length} investments recorded`);
  });
}

export function holidaySheet(): void {
  const d = E().data(), mine = [...(appSet(d).holidays || [])].sort(), built = [...NSE_HOL].filter((x) => x >= d.today).sort();
  openSheet("Market holidays", `<p class="note" style="margin-top:0">Built in: NSE's ${[...new Set([...NSE_HOL].map((x) => x.slice(0, 4)))].join(", ")} list. Add next year's holidays when NSE publishes them (usually in December).</p>
    ${built.length ? `<div class="note">Coming up: ${built.map((x) => `${dShort(x)}`).join(" · ")}</div>` : ""}
    <div class="list">${mine.map((x) => `<div class="row"><div class="main"><div class="t">${dShort(x)} ${x.slice(0, 4)}</div></div><button class="btn sm" type="button" data-hdel="${x}">Remove</button></div>`).join("") || '<div class="empty">No holidays added by you.</div>'}</div>
    <div class="grid2" style="margin-top:12px">${field(["hd", "Add a holiday", "date", { value: "" }])}<div class="f" style="align-self:end"><button class="btn" id="hadd" type="button">Add</button></div></div>
    <div class="btns"><button class="btn" id="cx" type="button">Done</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    $s(s, "hadd").onclick = () => { const x = val("hd"); if (!x) return; const a = appSet(E().data()); write1("settings", { ...a, holidays: [...new Set([...(a.holidays || []), x])].sort() }); closeModal(); holidaySheet(); };
    s.querySelectorAll<HTMLElement>("[data-hdel]").forEach((b) => { b.onclick = () => { const a = appSet(E().data()); write1("settings", { ...a, holidays: (a.holidays || []).filter((x) => x !== b.dataset.hdel) }); closeModal(); holidaySheet(); }; });
  });
}

/** A card's bill: the transfer to pay it, filled in. */
export function payCard(id: string): void {
  const d = E().data(), a = d.byId<Account & { payFrom?: string }>("accounts", id); if (!a) return;
  const c = cardInfo(d, a), amt = c ? (c.dueLeft > 50 ? c.dueLeft : c.owed) : Math.max(0, -(balances(d).get(a.id) || 0));
  txnForm({}, { type: "transfer", amount: Math.round(amt) || undefined, accountId: a.payFrom || mainAcc(d)?.id, toAccountId: a.id, note: `${a.name} bill` } as never);
}

/** What tapping a Pay row offers. false: a property payment (the planner's, for now). */
export function ptPaySheet(key: string): boolean {
  const d = E().data(), o = obligations(d, 21).find((x) => x.key === key); if (!o) return true;
  if (o.src === ("pp" as never)) return false;
  openSheet(o.name, `<div class="kv" style="margin-top:0"><span>Amount</span><b>${money(o.amount)}</b><span>Due</span><b>${o.anyDay ? `any day in ${mLabel(o.ym)}` : fmtD(d, o.date)}</b><span>From</span><b>${esc(accName(d, o.acc) || "—")}</b></div>
    <div class="btns" style="flex-direction:column;align-items:stretch"><button class="btn pri" id="pp_rec" type="button">Record the payment</button>
    <button class="btn" id="pp_link" type="button">It's already in Transactions</button>${o.src === "r" ? '<button class="btn" id="pp_skip" type="button">No bill this month (skip)</button>' : ""}<button class="btn" id="cx" type="button">Cancel</button></div>
    <p class="note">Record the payment opens the entry filled in for you: check the amount and account, then save.</p>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    $s(s, "pp_rec").onclick = () => { closeModal(); if (o.src === "c") { payCard(o.id!); return; } markPaid(o as unknown as PlanItem); };
    $s(s, "pp_link").onclick = () => { closeModal(); ptLinkSheet(o); };
    const sk = opt(s, "pp_skip"); if (sk) sk.onclick = () => { closeModal(); const r = d.byId<R>("recurring", o.id!)!; write1("recurring", { ...r, ov: { ...(r.ov || {}), [o.ym]: 0 } }); toast(`${o.name} skipped for ${mLabel(o.ym)}`); };
  });
  return true;
}
function ptLinkSheet(o: { key: string; name: string; date: Day; amount: Paise }): void {
  const d = E().data(), lo = addDays(o.date, -20), hi = addDays(d.today, 1);
  type T = Txn & { link?: string; note?: string; categoryId?: string };
  const C = d.live<T>("txns").filter((t) => (t.date ?? "") >= lo && (t.date ?? "") <= hi && !t.link && t.type !== "income" && Math.abs(num(t.amount) - o.amount) <= Math.max(100, o.amount * 0.25))
    .sort((a, b) => Math.abs(num(a.amount) - o.amount) - Math.abs(num(b.amount) - o.amount)).slice(0, 12);
  openSheet(`Which entry was ${o.name}?`, `<div class="list">${C.map((t) => `<button type="button" class="row tap" data-lk="${esc(t.id)}" style="width:100%;text-align:left;border:0;background:none"><div class="main"><div class="t">${esc(t.note || catName(d, t.categoryId) || TYPE_LBL[String(t.type)])}</div><div class="s">${fmtD(d, t.date!)} · ${esc(accName(d, t.accountId))}</div></div><div class="amt">${money(num(t.amount))}</div></button>`).join("") || '<div class="empty">No entries with a similar amount in the last few weeks.</div>'}</div>
    <div class="btns"><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    s.querySelectorAll<HTMLElement>("[data-lk]").forEach((b) => { b.onclick = () => { const t = d.byId("txns", b.dataset.lk!)!; closeModal(); write1("txns", { ...t, link: o.key }); toast(`Marked ${o.name} as paid`); }; });
  });
}
/** Move money in for something due (from Pay by Tuesday's readiness check). */
export function ptMove(acc: string, from: string, amt: string, why: string): void { txnForm({}, { type: "transfer", amount: Math.round(+amt * 100), accountId: from, toAccountId: acc, note: `For ${why}` } as never); }
/** Put money aside into the reserve or a property's fund. */
export function ptAside(k: string, amt: string): void {
  const d = E().data(), a = reserveAcc(d), m = mainAcc(d); if (!a) { toast("Mark an account as the reserve first (edit the account)."); return; }
  const extra = amt === "extra";
  txnForm({}, { type: "transfer", amount: extra ? undefined : Math.round(+amt * 100), accountId: (m && m.id !== a.id) ? m.id : "", toAccountId: a.id, pot: k,
    note: k === "reserve" ? (extra ? "Big-bills reserve · extra" : "Big-bills reserve") : `${d.byId<Rec & { name?: string }>("props", k.slice(5))?.name || "Property"} fund` } as never);
}

/* ---------- goals ---------- */
type G = Rec & { kind?: string; name?: string; pri?: number; holdings?: string[]; loans?: string[]; by?: YM | null; kidId?: string; kid?: number; school?: Paise; ug?: Paise; pg?: Paise; inf?: number; ret?: number; spend?: Paise; life?: number; pre?: number; post?: number; target?: Paise; saved?: Paise };
const EDU_DEF = { school: 16000000, ug: 200000000, pg: 250000000, inf: 10, ret: 11 };
const RET_DEF = { inf: 6, pre: 11, post: 7, life: 85 };
type Prof = Rec & { kids?: { id?: string; name?: string; dob?: string }[]; retire?: string };
const ageOf = (d: MoneyData, dob: string): number => { const y = +d.today.slice(0, 4) - +dob.slice(0, 4); return d.today.slice(5) >= dob.slice(5) ? y : y - 1; };
export function goalForm(g: Partial<G> = {}): void {
  const d = E().data(), isNew = !g.id, kind = g.kind || "custom", H = d.live<Holding>("holdings").filter((h) => !h.closed), sel = new Set(g.holdings || []);
  const prof = d.byId<Prof>("settings", "profile") ?? { id: "profile" };
  const hpick = (lbl: string): string => (H.length ? `<div class="f"><label>${lbl}</label>${H.map((h) => `<label class="opt" style="margin-top:6px"><input type="checkbox" class="gh" value="${esc(h.id)}" ${sel.has(h.id) ? "checked" : ""}><div><b>${esc(h.name)}</b><span>${money(holdingSum(d, h).value)}</span></div></label>`).join("")}</div>` : "");
  const pri = field(["gp", "Priority", "number", { value: g.pri || "", hint: "1 = most important" }]);
  let body = "";
  if (isNew) body += field(["gk", "Kind", "select", { value: kind, options: Object.entries(GOAL_KINDS) }]);
  if (kind === "loans") body += `${field(["name", "Goal", "text", { value: g.name }])}<div class="f"><label>Loans to close</label>${d.live<Rec & { name?: string }>("loans").filter((l) => loanSum(d, l as never).out > 50).map((l) => `<label class="opt" style="margin-top:6px"><input type="checkbox" class="gl" value="${esc(l.id)}" ${(g.loans || []).includes(l.id) ? "checked" : ""}><div><b>${esc(l.name)}</b><span>${money(loanSum(d, l as never).out)} left</span></div></label>`).join("")}</div>${field(["by", "Close by", "month", { value: g.by || `${+d.today.slice(0, 4) + 1}-12` }])}${pri}`;
  else if (kind === "edu") body += `${field(["name", "Goal", "text", { value: g.name }])}${field(["ekid", "Child", "select", { value: g.kidId || g.kid || 0, options: (prof.kids || []).map((c, i) => [String(c.id || i), `${c.name || "Child " + (i + 1)}${c.dob ? ` (${ageOf(d, c.dob)})` : ""}`] as [string, string]) }])}
    ${field(["es", "School, a year in today's money (₹)", "number", { value: rs(g.school || EDU_DEF.school), hint: "Bangalore CBSE/ICSE: ₹60k budget · ₹1.2–1.6 lakh mid to premium · ₹5 lakh+ international, plus books and transport" }])}
    ${field(["eu", "Graduation, total in today's money (₹)", "number", { value: rs(g.ug || EDU_DEF.ug), hint: "Private engineering in Bangalore about ₹16 lakh tuition plus living; government seat ₹5–6 lakh; abroad ₹60 lakh+" }])}
    ${field(["ep", "Post-graduation, total in today's money (₹)", "number", { value: rs(g.pg || EDU_DEF.pg), hint: "MBA at IIM/ISB level about ₹25 lakh; MTech/MS in India ₹5–10 lakh" }])}
    <div class="grid2">${field(["ei", "Education costs rise (% a year)", "number", { value: g.inf || EDU_DEF.inf, step: "0.5" }])}${field(["er", "Return on savings (% a year)", "number", { value: g.ret || EDU_DEF.ret, step: "0.5" }])}</div>${hpick("Investments set aside for it")}${pri}`;
  else if (kind === "retire") body += `${field(["name", "Goal", "text", { value: g.name || "Retirement" }])}
    ${field(["rs", "Monthly spending in today's money (₹)", "number", { value: rs(g.spend || ""), hint: `Leave empty to use your usual spending without EMIs: ${money(retireBase(d))} a month (last 12 months)` }])}
    <div class="grid2">${field(["ri", "Inflation (%)", "number", { value: g.inf || RET_DEF.inf, step: "0.5" }])}${field(["rl", "Money should last to age", "number", { value: g.life || RET_DEF.life }])}</div>
    <div class="grid2">${field(["rp", "Return before retiring (%)", "number", { value: g.pre || RET_DEF.pre, step: "0.5" }])}${field(["ro", "Return after retiring (%)", "number", { value: g.post || RET_DEF.post, step: "0.5" }])}</div>
    <p class="note">Retirement age comes from your Profile (now ${prof.retire || "not set"}). EPF, PPF and NPS count automatically.</p>${hpick("Other investments for retirement")}${pri}`;
  else body += `${field(["name", "Goal", "text", { value: g.name, ph: "e.g. New car" }])}<div class="grid2">${field(["target", "Target (₹)", "number", { value: rs(g.target), step: "1000" }])}${field(["by", "By", "month", { value: g.by || addM(ymOf(d.today), 12) }])}</div>
    ${field(["saved", "Already saved outside investments (₹)", "number", { value: rs(g.saved), step: "0.01" }])}${hpick("Count these investments towards it")}${pri}`;
  openSheet(isNew ? "Add goal" : String(g.name), body + btnRow(isNew, "Add goal"), (s) => {
    $s(s, "cx").onclick = closeModal;
    const k = opt<HTMLSelectElement>(s, "f_gk"); if (k) k.onchange = () => { closeModal(); goalForm({ kind: k.value }); };
    const dl = opt(s, "dl"); if (dl) dl.onclick = () => askConfirm(`Remove the goal "${g.name}"?`, "Remove", () => delRec("goals", g.id!));
    $s(s, "sv").onclick = () => {
      const name = val("name") || GOAL_KINDS[kind], n = (x: string): number | undefined => { const v = parseFloat(val(x)); return v > 0 ? v : undefined; }, m = (x: string): Paise | undefined => { const v = n(x); return v === undefined ? undefined : Math.round(v * 100); };
      const o: Record<string, unknown> = { ...g, id: g.id || uid(), kind, name, pri: n("gp"), holdings: [...s.querySelectorAll<HTMLInputElement>(".gh:checked")].map((x) => x.value) };
      if (kind === "loans") { o.loans = [...s.querySelectorAll<HTMLInputElement>(".gl:checked")].map((x) => x.value); o.by = val("by") || null; }
      else if (kind === "edu") { const kv = val("ekid"), ki = (prof.kids || []).findIndex((c) => c.id === kv); if (ki >= 0) { o.kidId = kv; o.kid = ki; } else o.kid = +kv || 0; Object.assign(o, { school: m("es"), ug: m("eu"), pg: m("ep"), inf: n("ei"), ret: n("er") }); }
      else if (kind === "retire") Object.assign(o, { spend: m("rs"), inf: n("ri"), life: n("rl"), pre: n("rp"), post: n("ro") });
      else { const t = parseFloat(val("target")); if (!(t > 0)) { toast("Give the goal a target."); return; } Object.assign(o, { target: Math.round(t * 100), by: val("by") || null, saved: Math.round((parseFloat(val("saved")) || 0) * 100) }); }
      closeModal(); write1("goals", o as Rec); toast(isNew ? "Goal added" : "Saved");
    };
  });
}

/* ---------- the emergency fund ---------- */
export function emToggle(k: string): void { const d = E().data(), s = appSet(d), ex = emExcluded(d); if (ex.has(k)) ex.delete(k); else ex.add(k); write1("settings", { ...s, emEx: [...ex] }); }
export function emSheet(): void {
  const d = E().data(), st = reserveState(d), a = st.a as (Account & { emTarget?: Paise }) | null;
  openSheet("Emergency fund target", `${field(["em", "Months of spending to cover", "select", { value: String(emMonths(d)), options: [["3", "3 months"], ["6", "6 months"], ["9", "9 months"], ["12", "12 months"]] }])}
    ${field(["emt", "Or your own target (₹)", "number", { value: a && a.emTarget ? rs(a.emTarget) : "", hint: "Leave empty to use the months above" }])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    $s(s, "sv").onclick = () => {
      const m = +val("em") || 6, t = parseFloat(val("emt")); closeModal();
      const ops = [W("settings", { ...appSet(E().data()), emMonths: m })];
      if (a) { const o: Record<string, unknown> = { ...a }; if (t > 0) o.emTarget = Math.round(t * 100); else delete o.emTarget; ops.push(W("accounts", o as Rec)); }
      E().write(ops); toast("Saved");
    };
  });
}

/** Plan's taps (and the same rows on Overview and Money settings). */
export function planAct(d: MoneyData, x: DOMStringMap, id: string): boolean {
  if (x.rec !== undefined) { const r = d.byId<R>("recurring", x.rec); recForm(r ? { ...r } : {}); return true; }
  if (x.mi !== undefined) { const [rid, ym] = x.mi.split("|") as [string, YM]; monthItemSheet(rid, ym); return true; }
  if (x.pay !== undefined) { const ym = x.pay.split("|")[1]!; const it = planned(d, ym).find((y) => y.key === x.pay); if (it) markPaid(it); return true; }
  if (x.undo !== undefined) { undoMark(x.undo); return true; }
  if (x.invpay !== undefined) { const r = forecast(d, 1).months[0]!.rows.find((y) => y.key === x.invpay); if (r) markPaid(r); return true; }
  if (x.invall !== undefined) { investAll(); return true; }
  if (x.holi !== undefined) { holidaySheet(); return true; }
  if (x.ptpay !== undefined) return ptPaySheet(x.ptpay);
  if (x.ptmove !== undefined) { const [a, f, n, w] = x.ptmove.split("|") as [string, string, string, string]; ptMove(a, f, n, w); return true; }
  if (x.ptaside !== undefined) { const [k, n] = x.ptaside.split("|") as [string, string]; ptAside(k, n); return true; }
  if (x.goal !== undefined) { const g = d.byId<G>("goals", x.goal); goalForm(g ? { ...g } : {}); return true; }
  if (x.emcat !== undefined) { emToggle(x.emcat); return true; }
  if (x.repadd !== undefined) {
    const r = findRepeats(d, prefGet<string[]>("repIgnore", [])).find((y) => y.key === x.repadd);
    if (r) recForm({ type: "expense", name: r.name, amount: Math.round(r.amount), freq: r.freq, day: r.day, categoryId: r.categoryId, accountId: r.accountId, start: addM(ymOf(r.last), FREQ[r.freq] || 1) });
    return true;
  }
  switch (id) {
    case "addRec": recForm(); return true;
    case "addGoal": goalForm(); return true;
    case "emSet": emSheet(); return true;
  }
  return false;
}
