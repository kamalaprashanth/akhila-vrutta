/**
 * Loan forms, as in KP Money Planner: adding or editing a loan, closing or deleting it, borrowing, repaying
 * and part payments, rate changes, matching the bank's statement, missed EMIs and planned repayments.
 * Read and saved in paise.
 */
import { esc } from "../../../core/dom.ts";
import { addM, dLabel, mLabel, mShort, todayOf, ymOf, type YM } from "../calc/dates.ts";
import { num, type Loan, type MoneyData, type Paise, type Rec, type Txn } from "../calc/data.ts";
import { bankOf, bankOut, emiOf, isEmiLike, kindOf, loanEnd, loanSum, loanTx, missedInfo, ownTotals, schedule } from "../calc/loans.ts";
import { catOpts as catOptsK, accOpts, askConfirm, closeModal, field, openSheet, rs, toast, val } from "./kit.ts";
import { fmtD, rateTxt } from "../calc/plan.ts";
import { money } from "../views/txlist.ts";
import { KIND_LBL } from "../views/accounts.ts";
import { E, uid } from "./env.ts";

type L = Loan & { name?: string; lender?: string; accountId?: string | null; day?: number | null; categoryId?: string; fee?: Paise; gstRate?: number; postFrom?: string;
  bank?: (Loan["bank"] & { lender?: string; day?: number | null; accountId?: string | null }) | null; plans?: Plan[] };
type Plan = { id: string; freq?: string; amount?: Paise; start: YM; end?: YM | null; accountId?: string | null };
type LTx = Txn & { act?: string; part?: string; mode?: string; note?: string; hist?: boolean; ym?: YM; covers?: string[]; link?: string };
const $s = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T => s.querySelector<T>("#" + id)!;
const opt = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T | null => s.querySelector<T>("#" + id);
const W = (c: string, r: Rec): { c: string; r: Rec } => ({ c, r: { ...r, updatedAt: Date.now() } });
const P = (s: string): Paise => Math.round(parseFloat(s) * 100);
const radios = (name: string, legend: string, opts: [string, string, string?][], cur?: string): string =>
  `<fieldset class="fs"><legend>${esc(legend)}</legend>${opts.map(([v, t, s]) => `<label class="opt"><input type="radio" name="${name}" value="${v}" ${v === cur ? "checked" : ""}><div><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ""}</div></label>`).join("")}</fieldset>`;
const radioVal = (n: string): string => document.querySelector<HTMLInputElement>(`#mvLayer input[name="${n}"]:checked`)?.value ?? "";
const btnRow = (isNew: boolean, addLbl: string): string => `<div class="btns"><button class="btn pri" id="sv" type="button">${isNew ? addLbl : "Save"}</button><button class="btn" id="cx" type="button">Cancel</button>${isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>'}</div>`;
const MODE_OPTS: [string, string, string][] = [["tenure", "Keep EMI, change tenure", "Same monthly EMI; the loan ends earlier or later"], ["emi", "Keep tenure, change EMI", "Same end date; the monthly EMI goes down or up"]];
const state = (): Record<string, unknown> | null => E().state() as Record<string, unknown> | null;
const goLoan = (id: string): void => { const S = state(); if (S) S.loanId = id; E().planner("go", "loan"); };
const fresh = (id: string): L | undefined => E().data().byId<L>("loans", id);

export function loanForm(l: Partial<L> = {}): void {
  const d = E().data(), isNew = !l.id; let kind = isNew ? (l.kind || "emi") : kindOf(l as Loan);
  const b: Partial<L> & Record<string, unknown> = { start: ymOf(d.today), ...(kind === "hybrid" ? (l.bank || {}) : l) };
  const body = `
    ${isNew ? `<div class="seg" role="group" aria-label="Loan type" id="kseg">${Object.entries(KIND_LBL).map(([k, t]) => `<button type="button" data-k="${k}" aria-pressed="${kind === k}">${t}</button>`).join("")}</div><p class="note" id="kdesc"></p>` : `<p class="note">${KIND_LBL[kind]}</p>`}
    ${field(["name", "Loan name", "text", { value: l.name, ph: "e.g. Home loan, Loan from Ravi" }])}
    ${field(["lender", "Lender", "text", { value: l.lender, ph: "Bank or person" }])}
    <div id="g_first" hidden>
      <p class="sect" id="firstHd">First borrowing</p>
      <div class="grid2">${field(["ownAmt", "Amount (₹)", "number", { ph: "0 to add later" }])}${field(["ownDate", "Date", "date", { value: d.today }])}</div>
      ${field(["ownAcc", "Received into", "select", { options: accOpts(d, "Not linked to an account") }])}
    </div>
    <div id="g_bank">
      <p class="sect" id="bankHd" hidden>Bank loan part (taken by them, you pay the EMI)</p>
      ${field(["bankName", "Their bank", "text", { value: b.lender, ph: "e.g. SBI" }])}
      <div class="grid2">${field(["principal", "Loan amount (₹)", "number", { value: rs(b.principal) }])}${field(["rate", "Interest % per year", "number", { value: b.rate ?? "", step: "0.01", hint: isNew ? "Starting rate. Add floating-rate changes later on the loan page." : "Starting rate. Rate changes are on the loan page." }])}</div>
      <div class="grid2">${field(["tenure", "Tenure (months)", "number", { value: b.tenure || "" }])}${field(["start", "First EMI month", "month", { value: b.start }])}</div>
      <div class="grid2">${field(["emi", "EMI (₹)", "number", { value: b.emi ? rs(b.emi) : "", hint: "Leave empty to calculate it" }])}${field(["day", "EMI day", "number", { value: b.day || "", ph: "1–31" }])}</div>
      ${field(["accountId", "EMI paid from", "select", { value: b.accountId || "", options: accOpts(d, "Not set") }])}
      <div id="g_cemi" hidden>
        ${field(["cardId", "Card", "select", { value: l.accountId || "", options: [["", "Choose the card"], ...d.live<Rec & { type?: string; hidden?: boolean; name?: string }>("accounts").filter((a) => a.type === "card" && (!a.hidden || a.id === l.accountId)).map((a) => [a.id, String(a.name)] as [string, string])] }])}
        ${field(["categoryId", "What you bought (category)", "select", { value: l.categoryId || "", options: [["", "Choose a category"], ...catOptsK(d, "expense")] }])}
        <div class="grid2">${field(["fee", "Processing fee (₹)", "number", { value: rs(l.fee), step: "0.01", ph: "0 if none", hint: "GST is added on top" }])}${field(["gst", "GST %", "number", { value: l.gstRate ?? 18, step: "0.01", hint: "On interest and fee" }])}</div>
        <p class="note" style="margin-top:-4px">EMIs on statements before today are treated as already in your card's balance, so only upcoming ones are added.</p>
      </div>
      <div class="note" id="emiCalc"></div>
    </div>
    ${btnRow(isNew, "Add loan")}`;
  openSheet(isNew ? "Add loan" : "Edit loan", body, (s) => {
    const DESC: Record<string, string> = {
      emi: "An EMI loan from a bank, e.g. a home loan. Record floating-rate changes and part payments on its page.",
      family: "Interest-free money from family or friends. Borrow and repay any number of times, on any date.",
      hybrid: "Money from a relative where part is their own (interest-free) and part comes from a bank loan they took, whose EMI you pay.",
      cardemi: "A purchase converted to EMI on a credit card. Each statement, the EMI (purchase) and interest + GST are added to the card automatically; the processing fee + GST comes with the first one.",
    };
    const sync = (): void => {
      s.querySelectorAll<HTMLElement>("#kseg button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.k === kind)));
      const kd = opt(s, "kdesc"); if (kd) kd.textContent = DESC[kind] ?? "";
      $s(s, "g_bank").hidden = kind === "family";
      $s(s, "g_first").hidden = !isNew || isEmiLike(kind);
      const ce = kind === "cardemi"; $s(s, "g_cemi").hidden = !ce; $s(s, "w_lender").hidden = ce; $s(s, "w_day").hidden = ce; $s(s, "w_accountId").hidden = ce;
      s.querySelector<HTMLElement>("#w_principal label")!.textContent = ce ? "Amount converted (₹)" : "Loan amount (₹)";
      s.querySelector<HTMLElement>("#w_start label")!.textContent = ce ? "First EMI statement" : "First EMI month";
      { const h = s.querySelector<HTMLElement>("#w_rate .hint"); if (h) h.hidden = ce; }
      s.querySelector<HTMLElement>("#w_emi .hint")!.textContent = ce ? "From the bank's SMS, excluding GST. Empty to calculate." : "Leave empty to calculate it";
      $s(s, "bankHd").hidden = kind !== "hybrid"; $s(s, "w_bankName").hidden = kind !== "hybrid";
      $s(s, "firstHd").textContent = kind === "hybrid" ? "Their own money (interest-free)" : "First borrowing";
      s.querySelector<HTMLElement>("#w_ownAcc label")!.textContent = kind === "hybrid" ? "Both parts received into" : "Received into";
      s.querySelector<HTMLElement>("#w_lender label")!.textContent = kind === "emi" ? "Bank" : "Person";
      s.querySelector("#w_tenure .hint")?.remove(); if (kind === "emi") $s(s, "w_tenure").insertAdjacentHTML("beforeend", '<div class="hint">Empty if there\'s no fixed schedule</div>');
    };
    s.querySelectorAll<HTMLElement>("#kseg button").forEach((x) => { x.onclick = () => { kind = x.dataset.k!; sync(); }; });
    const calc = (): void => {
      const t = { id: "", principal: P(val("principal")) || 0, rate: parseFloat(val("rate")) || 0, tenure: parseInt(val("tenure"), 10) || 0, emi: P(val("emi")) || 0, start: val("start") } as Loan;
      const e = emiOf(t);
      $s(s, "emiCalc").textContent = e ? `EMI ${money(e)} · total interest ${money(e * (num(t.tenure) || 0) - (num(t.principal) || 0))}${t.start && t.tenure ? ` · last EMI ${mLabel(loanEnd(t)!)}` : ""}` : "";
    };
    s.querySelectorAll("input").forEach((i) => i.addEventListener("input", calc)); calc(); sync();
    $s(s, "cx").onclick = closeModal;
    const dl = opt(s, "dl"); if (dl) dl.onclick = () => deleteLoan(l as L);
    $s(s, "sv").onclick = () => {
      const name = val("name"), lender = val("lender");
      if (!name) { toast("Give the loan a name."); return; }
      if (!isEmiLike(kind) && !lender) { toast("Who are you borrowing from?"); return; }
      if (kind === "cardemi") { if (!val("cardId")) { toast("Choose the card."); return; } if (!(parseInt(val("tenure"), 10) > 0)) { toast("Enter the tenure in months."); return; } if (!val("categoryId")) { toast("Choose what you bought (category)."); return; } }
      const o: Record<string, unknown> = { ...l, id: l.id || uid(), kind, name, lender };
      if (kind !== "family") {
        const principal = parseFloat(val("principal")), tenure = parseInt(val("tenure"), 10), day = parseInt(val("day"), 10), start = val("start");
        if (!(principal > 0)) { toast(kind === "hybrid" ? "Enter the bank loan amount." : "Enter the loan amount."); return; }
        if (kind === "hybrid" && !(tenure > 0)) { toast("Enter the bank loan's tenure in months."); return; }
        if (tenure > 0 && !/^\d{4}-\d{2}$/.test(start)) { toast("Pick the first EMI month."); return; }
        const bf = { principal: Math.round(principal * 100), rate: parseFloat(val("rate")) || 0, tenure: tenure > 0 ? tenure : null, start: start || ymOf(d.today), emi: P(val("emi")) || null, day: (day >= 1 && day <= 31) ? day : null, accountId: val("accountId") || null };
        if (kind === "cardemi") {
          const card = d.byId<Rec & { name?: string; stmtDay?: number }>("accounts", val("cardId"))!;
          Object.assign(o, bf, { postFrom: l.postFrom || d.today, accountId: card.id, day: num(card.stmtDay) || null, lender: card.name, categoryId: val("categoryId"), fee: P(val("fee")) || 0, gstRate: isNaN(parseFloat(val("gst"))) ? 18 : parseFloat(val("gst")) });
        } else if (kind === "emi") Object.assign(o, bf);
        else o.bank = { ...(l.bank || {}), ...bf, lender: val("bankName") };
      }
      if (!isEmiLike(kind)) o.plans = l.plans || [];
      const ops = [W("loans", o as Rec)];
      if (isNew && !isEmiLike(kind)) {
        const amt = P(val("ownAmt")) || 0, date = val("ownDate") || d.today, acc = val("ownAcc") || null;
        if (amt > 0) ops.push(W("txns", { id: uid(), type: "loan", loanId: o.id, act: "borrow", part: "own", amount: amt, date, accountId: acc, note: "" } as Rec));
        if (kind === "hybrid") ops.push(W("txns", { id: uid(), type: "loan", loanId: o.id, act: "borrow", part: "bank", amount: (o.bank as { principal: Paise }).principal, date, accountId: acc, note: "Bank-loan money" } as Rec));
      }
      closeModal(); const S = state(); if (S) S.loanId = o.id; E().write(ops); E().planner("go", "loan"); toast(isNew ? "Loan added" : "Saved");
    };
  });
}

export function closeLoanSheet(l: L): void {
  const d = E().data(), x = loanSum(d, l), now = ymOf(d.today);
  openSheet(`Close ${l.name}`, `<p>The loan stops showing in Plan, Home, Insights and the forecast. Its history stays, and you can reopen it any time. It moves to "Closed loans" under Loans.</p>
    ${x.out > 50 ? `<p class="note">The planner still shows ${money(x.out)} outstanding. If you paid it off, record that payment first (Part payment or Repaid) so your account balance is right.</p>` : ""}
    ${field(["ym", "Closed in (month)", "month", { value: now, hint: "EMIs after this month are removed." }])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Mark as closed</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    $s(s, "sv").onclick = () => { const ym = val("ym"); if (!/^\d{4}-\d{2}$/.test(ym)) { toast("Pick the month."); return; } closeModal(); E().write([W("loans", { ...l, closedOn: ym })]); toast(`${l.name} closed`); };
  });
}
export function reopenLoan(l: L): void {
  askConfirm(`Reopen "${l.name}"? Its EMIs and balance come back from ${mLabel(addM(l.closedOn!, 1))}.`, "Reopen", () => { const o: Record<string, unknown> = { ...l }; delete o.closedOn; E().write([W("loans", o as Rec)]); toast("Loan reopened"); });
}
export function deleteLoan(l: L): void {
  askConfirm(`Delete "${l.name}" and all its entries?`, "Delete", () => {
    const d = E().data(), now = Date.now();
    const ops = loanTx(d, l.id).map((t) => ({ c: "txns", r: { ...t, deleted: true, updatedAt: now } as Rec }));
    ops.push({ c: "loans", r: { ...d.byId("loans", l.id)!, deleted: true, updatedAt: now } as Rec });
    E().write(ops); E().planner("go", "plan");
  });
}

/** Borrowing, repayment (own-money part) or part payment (EMI part). Amounts in paise. */
export function entryForm(l: L, act0: string, t0: Partial<LTx> = {}, preset: Partial<LTx> = {}): void {
  const d = E().data(), isNew = !t0.id, kind = kindOf(l);
  const t: Partial<LTx> = { date: d.today, part: "own", ...preset, ...t0 }, act = t.act || act0;
  const hasSched = !!schedule(d, l);
  const TTL: Record<string, string> = { borrow: isNew ? "Add borrowing" : "Edit borrowing", repay: isNew ? "Add repayment" : "Edit repayment", prepay: isNew ? "Add part payment" : "Edit part payment" };
  const body = `
    ${act === "borrow" && kind === "hybrid" ? `<div class="seg" role="group" aria-label="Which part" id="pseg">${[["own", "Their own money"], ["bank", "Bank-loan money"]].map(([k, x]) => `<button type="button" data-k="${k}" aria-pressed="${t.part === k}">${x}</button>`).join("")}</div><p class="note" id="pdesc"></p>` : ""}
    ${act === "repay" ? `<p class="note">You owe ${esc(l.lender || l.name)} ${money(ownTotals(d, l).out)}${kind === "hybrid" ? " on the interest-free part" : ""}.</p>` : ""}
    ${act === "prepay" ? `<p class="note">Outstanding on the ${kind === "hybrid" ? "bank part" : "loan"}: ${money(loanSum(d, l).bank)}.</p>` : ""}
    <div class="grid2">${field(["amount", "Amount (₹)", "number", { value: rs(t.amount), step: "0.01", ph: "0.00" }])}${field(["date", "Date", "date", { value: t.date }])}</div>
    ${field(["accountId", act === "borrow" ? "Received into" : "Paid from", "select", { value: t.accountId || "", options: accOpts(d, "Not linked to an account"), hint: "A linked account's balance goes up or down with this entry." }])}
    <label class="opt" style="margin-bottom:12px"><input type="checkbox" id="f_hist" ${t.hist ? "checked" : ""}><div><b>Already in my balances</b><span>The linked account's balance already includes this money, so it isn't added or taken off again. The loan still counts it.</span></div></label>
    ${act === "prepay" && hasSched ? radios("mode", "After this payment", [["tenure", "Reduce tenure", "Keep the EMI; the loan ends sooner"], ["emi", "Reduce EMI", "Keep the end date; the EMI goes down"]], t.mode) : ""}
    ${field(["note", "Note", "text", { value: t.note, ph: "Optional" }])}
    ${btnRow(isNew, "Add")}`;
  openSheet(TTL[act] ?? "", body, (s) => {
    let part = t.part;
    const sync = (): void => {
      s.querySelectorAll<HTMLElement>("#pseg button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.k === part)));
      const pd = opt(s, "pdesc"); if (pd) pd.textContent = part === "bank" ? "Records money from their bank loan reaching you. The bank part's balance follows its EMI schedule." : "Interest-free money from their own savings. Adds to what you owe them.";
    };
    s.querySelectorAll<HTMLElement>("#pseg button").forEach((x) => { x.onclick = () => { part = x.dataset.k; sync(); }; }); sync();
    $s(s, "cx").onclick = closeModal;
    const dl = opt(s, "dl"); if (dl) dl.onclick = () => askConfirm("Delete this entry?", "Delete", () => { E().write([{ c: "txns", r: { ...d.byId("txns", t.id!)!, deleted: true, updatedAt: Date.now() } as Rec }]); });
    $s(s, "sv").onclick = () => {
      const amount = P(val("amount")), date = val("date") || d.today, mode = radioVal("mode");
      if (!(amount > 0)) { toast("Enter an amount above zero."); return; }
      if (act === "repay") { const owe = ownTotals(d, l).out + (isNew ? 0 : num(t.amount)); if (amount > owe + 100) { toast(`That's more than you owe (${money(owe)}).`); return; } }
      let before: ReturnType<typeof schedule> = null;
      if (act === "prepay") {
        if (hasSched && !mode) { toast("Choose reduce tenure or reduce EMI."); return; }
        before = hasSched ? schedule(d, l, t.id || "_new") : null;
        const ym = ymOf(date), row = before && before.rows.find((r) => r.ym >= ym), owe = before ? (ym < before.start ? before.principal : (row ? row.open : 0)) : loanSum(d, l).bank + (isNew ? 0 : num(t.amount));
        if (amount > owe + 100) { toast(`That's more than the outstanding ${money(owe)}.`); return; }
      }
      const o: Record<string, unknown> = { ...t, id: t.id || uid(), type: "loan", loanId: l.id, act, amount, date, accountId: val("accountId") || null, note: val("note"),
        part: act === "prepay" ? "bank" : (act === "borrow" && kind === "hybrid" ? part : "own") };
      if ($s<HTMLInputElement>(s, "f_hist").checked) o.hist = true; else delete o.hist;
      if (act === "prepay" && hasSched) o.mode = mode; else delete o.mode;
      closeModal(); E().write([W("txns", o as Rec)]);
      if (before) {
        const d2 = E().data(), l2 = d2.byId<L>("loans", l.id), after = l2 ? schedule(d2, l2) : null, ym = ymOf(date), b1 = before.rows.find((r) => r.ym >= ym), a1 = after ? after.rows.find((r) => r.ym >= ym) : null;
        const saved = before.totalInt - (after ? after.totalInt : 0);
        toast(!after || !after.rows.length || !a1 ? `Loan closed. Interest saved ${money(saved)}.`
          : mode === "emi" ? `EMI from ${mShort(a1.ym)}: ${money(a1.emi)} (was ${money(b1 ? b1.emi : 0)}) · interest saved ${money(saved)}`
          : `Now ends ${mShort(after.end ?? "")} instead of ${mShort(before.end ?? "")} · interest saved ${money(saved)}`);
      } else toast(isNew ? "Added" : "Saved");
    };
  });
}

type RC = { id: string; ym: YM; rate: number; mode?: string };
export function rateForm(l: L, rc: Partial<RC> = {}): void {
  const d = E().data(), isNew = !rc.id, b = bankOf(l) as unknown as { rates?: RC[]; start?: YM }, x = loanSum(d, l);
  const body = `
    <p class="note">Rate now ${rateTxt(x.rateNow)}% · EMI ${money(x.emiNow)} · ends ${x.end ? mShort(x.end) : "—"}</p>
    <div class="grid2">${field(["ym", "From EMI month", "month", { value: rc.ym || ymOf(d.today) }])}${field(["rate", "New rate % per year", "number", { value: rc.rate ?? "", step: "0.01" }])}</div>
    ${radios("mode", "What did the bank change?", MODE_OPTS, rc.mode)}
    ${btnRow(isNew, "Add rate change")}`;
  openSheet(isNew ? "Rate change" : "Edit rate change", body, (s) => {
    const save = (list: RC[]): Rec => { const o: Record<string, unknown> = { ...l }; if (kindOf(l) !== "hybrid") o.rates = list; else o.bank = { ...l.bank, rates: list }; return o as Rec; };
    $s(s, "cx").onclick = closeModal;
    const dl = opt(s, "dl"); if (dl) dl.onclick = () => askConfirm("Delete this rate change?", "Delete", () => E().write([W("loans", save((b.rates || []).filter((r) => r.id !== rc.id)))]));
    $s(s, "sv").onclick = () => {
      const ym = val("ym"), rate = parseFloat(val("rate")), mode = radioVal("mode");
      if (!/^\d{4}-\d{2}$/.test(ym)) { toast("Pick the month the new rate applies from."); return; }
      if (b.start && ym < b.start) { toast(`The first EMI is in ${mLabel(b.start)}. Pick that month or later.`); return; }
      if (!(rate >= 0) || val("rate") === "") { toast("Enter the new rate."); return; }
      if (!mode) { toast("Choose whether the EMI or the tenure changed."); return; }
      const before = schedule(d, l);
      const list = (b.rates || []).filter((r) => r.id !== rc.id).concat({ id: rc.id || uid(), ym, rate, mode }).sort((p, q) => p.ym.localeCompare(q.ym));
      closeModal(); E().write([W("loans", save(list))]);
      const d2 = E().data(), l2 = d2.byId<L>("loans", l.id), after = l2 ? schedule(d2, l2) : null, b1 = before && before.rows.find((r) => r.ym >= ym), a1 = after && after.rows.find((r) => r.ym >= ym);
      if (a1) toast(mode === "emi" ? `EMI from ${mShort(a1.ym)}: ${money(a1.emi)} (was ${money(b1 ? b1.emi : 0)})` : `Now ends ${mShort(after!.end ?? "")} (was ${before && before.end ? mShort(before.end) : "—"})`);
      else toast("Saved");
    };
  });
}

type Sync = { id: string; date: string; ym: YM; bal: Paise; mode?: string; was?: Paise | null };
const syncMonth = (l: L, date: string): YM => { const b = bankOf(l) as { day?: number } | null, ym = ymOf(date), day = num(b?.day) || 1; return +date.slice(8) >= day ? addM(ym, 1) : ym; };
export function syncForm(l: L): void {
  const d = E().data(), b = bankOf(l) as unknown as { syncs?: Sync[]; day?: number; start?: YM }, x = loanSum(d, l), list = (b.syncs || []).slice().sort((p, q) => p.date.localeCompare(q.date));
  const ours = (dt: string): number => bankOut(d, l, syncMonth(l, dt));
  const body = `
    <p class="note">Enter the principal outstanding from the bank's statement or app on a date. The planner follows the bank's figure from the next EMI after that date${b.day ? ` (EMIs on day ${b.day})` : ""}.</p>
    <div class="grid2">${field(["sdate", "Outstanding as on", "date", { value: d.today }])}${field(["sbal", "Outstanding (₹)", "number", { step: "0.01", ph: String(Math.round(x.bank / 100)) }])}</div>
    <p class="note" id="sdiff" style="font-weight:700"></p>
    ${radios("smode", "Keep in step with the bank by", [["tenure", "Keeping the EMI", "The EMI stays the same; the end date moves if needed"], ["emi", "Keeping the end date", "The end date stays; the EMI changes a little"]], "tenure")}
    <div class="btns"><button class="btn pri" id="sv" type="button">Match</button><button class="btn" id="cx" type="button">Cancel</button></div>
    ${list.length ? `<p class="sect">Earlier matches</p><div class="list">${list.map((m) => `<div class="row"><div class="main"><div class="t">${money(m.bal)} on ${fmtD(d, m.date)} ${m.date.slice(0, 4)}</div><div class="s">from the ${mShort(m.ym)} EMI · ${m.mode === "emi" ? "kept the end date" : "kept the EMI"}${m.was != null ? ` · planner had ${money(m.was)}` : ""}</div></div><button class="btn sm danger" type="button" data-sdel="${esc(m.id)}">Remove</button></div>`).join("")}</div>` : ""}`;
  openSheet(`Match ${l.name} to the bank`, body, (s) => {
    const save = (arr: Sync[]): Rec => { const o: Record<string, unknown> = { ...l }; if (kindOf(l) !== "hybrid") o.syncs = arr; else o.bank = { ...l.bank, syncs: arr }; return o as Rec; };
    const diff = (): void => {
      const dt = val("sdate"), v = P(val("sbal")); if (!dt) return; const w = ours(dt);
      $s(s, "sdiff").textContent = isNaN(v) ? `The planner has ${money(w)} outstanding then.` : Math.abs(v - w) < 50 ? `✓ Already matches (${money(w)}).` : `The planner has ${money(w)}: the bank's figure is ${money(Math.abs(v - w))} ${v > w ? "higher" : "lower"}.`;
    };
    $s(s, "f_sdate").oninput = diff; $s(s, "f_sbal").oninput = diff; diff();
    $s(s, "cx").onclick = closeModal;
    s.querySelectorAll<HTMLElement>("[data-sdel]").forEach((bt) => { bt.onclick = () => askConfirm("Remove this match? The schedule goes back to the planner's own figures from that point.", "Remove", () => { E().write([W("loans", save((b.syncs || []).filter((m) => m.id !== bt.dataset.sdel)))]); toast("Removed"); }); });
    $s(s, "sv").onclick = () => {
      const dt = val("sdate"), v = parseFloat(val("sbal")), mode = radioVal("smode") || "tenure";
      if (!dt) { toast("Pick the statement date."); return; } if (!(v >= 0) || val("sbal") === "") { toast("Enter the outstanding amount."); return; }
      const ym = syncMonth(l, dt); if (b.start && ym < b.start) { toast(`That's before the first EMI (${mLabel(b.start)}). Edit the loan instead.`); return; }
      const was = ours(dt), before = schedule(d, l);
      const arr = (b.syncs || []).filter((m) => m.ym !== ym).concat({ id: uid(), date: dt, ym, bal: Math.round(v * 100), mode, was: Math.round(was) }).sort((p, q) => p.ym.localeCompare(q.ym));
      closeModal(); E().write([W("loans", save(arr))]);
      const d2 = E().data(), l2 = d2.byId<L>("loans", l.id), after = l2 ? schedule(d2, l2) : null, a1 = after && after.rows.find((r) => r.ym >= ym);
      toast(!after || !a1 ? "Matched. The loan is cleared." : mode === "emi" ? `Matched. EMI from ${mShort(ym)}: ${money(a1.emi)}` : `Matched. Ends ${mShort(after.end ?? "")}${before && before.end !== after.end ? ` (was ${mShort(before.end ?? "")})` : ""}`);
    };
  });
}

/** Hybrid: you missed this month's bank EMI and the relative paid it. */
export function markMissed(key: string): void {
  const d = E().data(), [head, ym] = key.split("|") as [string, YM], l = d.byId<L>("loans", head.slice(2)); if (!l) return;
  const row = schedule(d, l)?.rows.find((r) => r.ym === ym); if (!row) return;
  const who = l.lender || "Your relative", b = bankOf(l) as { day?: number };
  openSheet("Mark EMI as missed", `<p>${esc(who)} pays ${money(row.emi)} to the bank for the ${mLabel(ym)} EMI. You'll owe it to them, interest-free, until you pay it back.</p>
    <p class="note">The bank loan's schedule doesn't change. This doesn't touch your account balances.</p>
    <div class="btns"><button class="btn pri" id="sv" type="button">Mark missed</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    $s(s, "sv").onclick = () => {
      closeModal();
      E().write([W("txns", { id: uid(), type: "loan", loanId: l.id, act: "missed", part: "bank", ym, amount: Math.round(row.emi), date: `${ym}-${String(Math.min(num(b.day) || 1, 28)).padStart(2, "0")}`, accountId: null, link: key, note: "" } as Rec)]);
      const d2 = E().data(), l2 = d2.byId<L>("loans", l.id);
      toast(`${mShort(ym)} EMI marked missed. You owe ${who} ${money(l2 ? missedInfo(d2, l2).owed : 0)}.`);
    };
  });
}
export function missedSheet(l: L, t: LTx): void {
  const d = E().data(), m = missedInfo(d, l).list.find((x) => x.t.id === t.id);
  openSheet(`${mLabel(t.ym ?? "")} EMI · missed`, `<p>${esc(l.lender || "Your relative")} paid ${money(num(t.amount))} to the bank for this EMI.</p>
    <p class="note">${m && m.by ? `Paid back on ${dLabel(m.by.date!)} ${m.by.date!.slice(0, 4)}. To undo the miss, delete that payment first.` : "Still owed. Undo if you actually paid this EMI yourself."}</p>
    <div class="btns">${m && m.by ? "" : '<button class="btn danger" id="dl" type="button">Undo missed</button>'}<button class="btn" id="cx" type="button">Close</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    const dl = opt(s, "dl"); if (dl) dl.onclick = () => { closeModal(); E().write([{ c: "txns", r: { ...d.byId("txns", t.id)!, deleted: true, updatedAt: Date.now() } as Rec }]); toast("Undone. The EMI shows as unpaid again."); };
  });
}
export function catchupForm(l: L, t: Partial<LTx> = {}): void {
  const d = E().data(), isNew = !t.id, mi = missedInfo(d, l), mine = new Set(t.covers || []);
  const opts = mi.list.filter((m) => !m.by || mine.has(m.t.id));
  if (!opts.length) { toast("No missed EMIs are owed."); return; }
  const pre = isNew ? new Set([opts[0]!.t.id]) : mine;
  const body = `
    <fieldset class="fs"><legend>Which missed EMIs are you paying back?</legend>${opts.map((m) => `<label class="opt"><input type="checkbox" name="cv" value="${esc(m.t.id)}" data-amt="${m.amount / 100}" ${pre.has(m.t.id) ? "checked" : ""}><div><b>${mLabel(m.ym)} EMI · ${money(m.amount)}</b></div></label>`).join("")}</fieldset>
    <p class="note" id="cvSum"></p>
    <div class="grid2">${field(["date", "Date", "date", { value: t.date || d.today }])}${field(["accountId", "Paid from", "select", { value: t.accountId || (bankOf(l) as { accountId?: string } | null)?.accountId || "", options: accOpts(d, "Not linked to an account") }])}</div>
    ${field(["note", "Note", "text", { value: t.note, ph: "Optional" }])}
    ${btnRow(isNew, "Record payment")}`;
  openSheet(isNew ? `Pay back ${l.lender || "relative"}` : "Edit payment", body, (s) => {
    const picked = (): HTMLInputElement[] => [...s.querySelectorAll<HTMLInputElement>("input[name=cv]:checked")];
    const sum = (): Paise => picked().reduce((a, e) => a + (mi.list.find((m) => m.t.id === e.value)?.amount ?? 0), 0);
    const upd = (): void => { $s(s, "cvSum").textContent = picked().length ? `Total ${money(sum())} for ${picked().length} EMI${picked().length > 1 ? "s" : ""}` : "Tick at least one EMI."; };
    s.querySelectorAll<HTMLInputElement>("input[name=cv]").forEach((e) => { e.onchange = upd; }); upd();
    $s(s, "cx").onclick = closeModal;
    const dl = opt(s, "dl"); if (dl) dl.onclick = () => askConfirm("Delete this payment? Those EMIs will show as owed again.", "Delete", () => E().write([{ c: "txns", r: { ...d.byId("txns", t.id!)!, deleted: true, updatedAt: Date.now() } as Rec }]));
    $s(s, "sv").onclick = () => {
      if (!picked().length) { toast("Tick the missed EMIs you're paying back."); return; }
      const o = { ...t, id: t.id || uid(), type: "loan", loanId: l.id, act: "catchup", part: "missed", covers: picked().map((e) => e.value), amount: Math.round(sum()), date: val("date") || d.today, accountId: val("accountId") || null, note: val("note") };
      closeModal(); E().write([W("txns", o as Rec)]);
      const d2 = E().data(), l2 = d2.byId<L>("loans", l.id), left = l2 ? missedInfo(d2, l2).owed : 0;
      toast(left > 50 ? `Recorded. ${money(left)} in missed EMIs still owed.` : "Recorded. All missed EMIs are paid back.");
    };
  });
}

/** A planned interest-free repayment, one-time or monthly. */
export function planForm(l: L, p0: Partial<Plan> = {}): void {
  const d = E().data(), isNew = !p0.id, p: Partial<Plan> = { freq: "once", start: ymOf(d.today), ...p0 };
  const body = `
    <div class="seg" role="group" aria-label="How often" id="fseg">${[["once", "One time"], ["monthly", "Monthly"]].map(([k, x]) => `<button type="button" data-k="${k}" aria-pressed="${p.freq === k}">${x}</button>`).join("")}</div><div style="height:12px"></div>
    ${field(["amount", "Amount (₹)", "number", { value: rs(p.amount) }])}
    <div class="grid2">${field(["start", "Month", "month", { value: p.start }])}${field(["end", "Until (month)", "month", { value: p.end || "", hint: "Empty = until it's repaid" }])}</div>
    ${field(["accountId", "Paid from", "select", { value: p.accountId || "", options: accOpts(d, "Not set") }])}
    <p class="note">Planned repayments show in the forecast and stop once the interest-free amount is cleared.</p>
    ${btnRow(isNew, "Add to plan")}`;
  openSheet(isNew ? "Plan a repayment" : "Edit planned repayment", body, (s) => {
    let freq = p.freq;
    const sync = (): void => { s.querySelectorAll<HTMLElement>("#fseg button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.k === freq))); $s(s, "w_end").hidden = freq !== "monthly"; s.querySelector<HTMLElement>("#w_start label")!.textContent = freq === "monthly" ? "From (month)" : "Month"; };
    s.querySelectorAll<HTMLElement>("#fseg button").forEach((x) => { x.onclick = () => { freq = x.dataset.k; sync(); }; }); sync();
    const save = (list: Plan[]): void => E().write([W("loans", { ...l, plans: list } as Rec)]);
    $s(s, "cx").onclick = closeModal;
    const dl = opt(s, "dl"); if (dl) dl.onclick = () => askConfirm("Remove this planned repayment?", "Remove", () => save((l.plans || []).filter((x) => x.id !== p.id)));
    $s(s, "sv").onclick = () => {
      const amount = P(val("amount")), start = val("start"), end = freq === "monthly" ? val("end") : "";
      if (!(amount > 0)) { toast("Enter an amount above zero."); return; }
      if (!/^\d{4}-\d{2}$/.test(start)) { toast("Pick the month."); return; }
      if (end && end < start) { toast("The end month is before the start month."); return; }
      closeModal(); save(([...(l.plans || [])] as Plan[]).filter((x) => x.id !== p.id).concat({ id: p.id || uid(), freq, amount, start, end: end || null, accountId: val("accountId") || null }));
      toast(isNew ? "Added to plan" : "Saved");
    };
  });
}

/** The loan page's buttons and rows (data-la, data-rc, data-pl). */
export function loanAct(d: MoneyData, x: DOMStringMap, loanId: string | undefined): boolean {
  const l = loanId ? d.byId<L>("loans", loanId) : undefined; if (!l) return true;
  if (x.rc) { rateForm(l, { ...((bankOf(l) as { rates?: RC[] } | null)?.rates || []).find((r) => r.id === x.rc) }); return true; }
  if (x.pl) { planForm(l, { ...(l.plans || []).find((p) => p.id === x.pl) }); return true; }
  switch (x.la) {
    case "edit": loanForm({ ...l }); return true;
    case "close": closeLoanSheet(l); return true;
    case "reopen": reopenLoan(l); return true;
    case "rate": rateForm(l); return true;
    case "sync": syncForm(l); return true;
    case "plan": planForm(l); return true;
    case "catchup": catchupForm(l); return true;
  }
  entryForm(l, String(x.la), {}, { accountId: x.la === "prepay" ? ((bankOf(l) as { accountId?: string } | null)?.accountId || "") : "" });
  return true;
}
void fresh; void goLoan; void todayOf;
