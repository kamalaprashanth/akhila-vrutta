/**
 * EPF, PPF and NPS entry forms, as in KP Money Planner: a month's EPF contribution, interest or withdrawal;
 * a PPF deposit, interest or withdrawal; an NPS contribution; NPS units from a statement. Saved in paise.
 */
import { esc } from "../../../core/dom.ts";
import { addM, ymOf } from "../calc/dates.ts";
import { num, type MoneyData, type Paise, type Rec } from "../calc/data.ts";
import { epfCalc, npsLines, type Holding } from "../calc/invest.ts";
import { mainAcc } from "../calc/forecast.ts";
import { closeModal, field, openSheet, rs, toast, val } from "./kit.ts";
import { epfHold } from "../views/epf.ts";
import { ppfHold } from "../views/ppf.ts";
import { npsHold } from "../views/nps.ts";
import { E, uid } from "./env.ts";

const $s = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T => s.querySelector<T>("#" + id)!;
const opt = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T | null => s.querySelector<T>("#" + id);
const W = (c: string, r: Rec): { c: string; r: Rec } => ({ c, r: { ...r, updatedAt: Date.now() } });
const btnRow = (isNew: boolean, addLbl: string): string => `<div class="btns"><button class="btn pri" id="sv" type="button">${isNew ? addLbl : "Save"}</button><button class="btn" id="cx" type="button">Cancel</button>${isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>'}</div>`;
const fyOf = (d: string): number => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 4 ? y : y - 1; };
const fyLbl = (y: number): string => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
const P = (s: string): Paise => Math.round((parseFloat(s) || 0) * 100);
const lc = (s: unknown): string => String(s || "").trim().toLowerCase();
type M = { id?: string; k?: string; wm?: string; d?: string; emp?: Paise; er?: Paise; eps?: Paise; epsw?: Paise; fy?: number; note?: string; amt?: Paise };
type H = Holding & { epf?: Holding["epf"] & { manual?: M[] }; ppf?: Holding["ppf"] & { manual?: M[] } };

export function epfEntryForm(h: H, m0?: M): void {
  const d = E().data(), e = epfCalc(d, h) || { mon: { emp: 0, er: 0, eps: 0, epsw: 0 }, lastWm: "", fyNow: fyOf(d.today) }, isNew = !m0;
  const nextWm = e.lastWm ? addM(e.lastWm, 1) : addM(ymOf(d.today), -1);
  const m: M = m0 || { k: "cont", wm: nextWm, d: `${addM(nextWm, 1)}-08`, emp: e.mon.emp, er: e.mon.er, eps: e.mon.eps, epsw: e.mon.epsw, fy: e.fyNow - 1 };
  openSheet(isNew ? "Add EPF entry" : "EPF entry", `
    <div class="seg" role="group" aria-label="Kind of entry" id="ekSeg">${[["cont", "Monthly contribution"], ["int", "Interest"], ["wd", "Withdrawal"]].map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${m.k === k}">${l}</button>`).join("")}</div>
    <div id="ek_cont" class="grid2" style="margin-top:12px">${field(["wm", "Wage month", "month", { value: m.wm || nextWm }])}${field(["d", "Credited on", "date", { value: m.k !== "int" ? m.d || "" : "" }])}</div>
    <div id="ek_int" style="margin-top:12px">${field(["fy", "Financial year", "select", { value: String(m.fy ?? e.fyNow - 1), options: Array.from({ length: 6 }, (_, i) => { const y = e.fyNow - i; return [String(y), "FY " + fyLbl(y)] as [string, string]; }) }])}</div>
    <div class="grid2">${field(["emp", "Your share (₹)", "number", { value: rs(m.emp), step: "1" }])}${field(["er", "Employer's share (₹)", "number", { value: rs(m.er), step: "1" }])}</div>
    <div id="ek_eps">${field(["eps", "Pension (EPS) (₹)", "number", { value: rs(m.eps), step: "1", hint: "From your passbook or payslip. Not part of the EPF balance." }])}</div>
    <div id="ek_note">${field(["note", "Note (optional)", "text", { value: m.note || "", ph: "e.g. Claim for housing" }])}</div>
    <p class="note">When you later load a passbook that covers this month or year, the passbook's figures replace this entry.</p>
    ${btnRow(isNew, "Add entry")}`, (s) => {
    let k = String(m.k);
    const lbl = (id: string, t: string): void => { s.querySelector<HTMLElement>(`#${id} label`)!.textContent = t; };
    const sync = (): void => {
      $s(s, "ek_cont").hidden = k === "int"; $s(s, "ek_int").hidden = k !== "int"; $s(s, "ek_eps").hidden = k !== "cont"; $s(s, "ek_note").hidden = k !== "wd"; $s(s, "w_wm").hidden = k !== "cont";
      lbl("w_d", k === "wd" ? "Paid out on" : "Credited on"); lbl("w_emp", k === "wd" ? "From your share (₹)" : k === "int" ? "Interest on your share (₹)" : "Your share (₹)"); lbl("w_er", k === "wd" ? "From employer's share (₹)" : k === "int" ? "Interest on employer's share (₹)" : "Employer's share (₹)");
    };
    s.querySelectorAll<HTMLElement>("#ekSeg button").forEach((b) => { b.onclick = () => { k = b.dataset.k!; s.querySelectorAll("#ekSeg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); if (k !== "cont" && isNew) { $s<HTMLInputElement>(s, "f_emp").value = ""; $s<HTMLInputElement>(s, "f_er").value = ""; } sync(); }; });
    $s(s, "f_wm").addEventListener("change", () => { if (isNew && val("wm")) $s<HTMLInputElement>(s, "f_d").value = `${addM(val("wm"), 1)}-08`; });
    sync();
    $s(s, "cx").onclick = closeModal;
    const dl = opt(s, "dl"); if (dl) dl.onclick = () => { const o = { ...h, epf: { ...h.epf, manual: (h.epf?.manual || []).filter((x) => x.id !== m.id) } }; closeModal(); E().write([W("holdings", o)]); toast("Entry removed"); };
    $s(s, "sv").onclick = () => {
      const emp = P(val("emp")), er = P(val("er"));
      if (emp + er <= 0) { toast("Enter the amount."); return; }
      const o: M = { id: m.id || uid(), k, emp, er };
      if (k === "cont") { if (!val("wm") || !val("d")) { toast("Pick the wage month and the date it was credited."); return; } o.wm = val("wm"); o.d = val("d"); o.eps = P(val("eps")); o.epsw = num(m.epsw) || num(e.mon.epsw) || 0; }
      if (k === "int") o.fy = +val("fy");
      if (k === "wd") { if (!val("d")) { toast("Pick the date it was paid out."); return; } o.d = val("d"); o.note = val("note"); }
      const list = ([...(h.epf?.manual || [])] as M[]).filter((x) => x.id !== o.id).concat(o);
      const nh = { ...h, epf: { ...(h.epf || { rate: 8.25, raise: 0, retireAge: 58, books: {} }), manual: list } };
      closeModal(); E().write([W("holdings", nh)]); toast(isNew ? "Entry added" : "Entry updated");
    };
  });
}

/** A deposit (an investment entry from your bank), or interest / a withdrawal (kept on the PPF). */
export function ppfEntryForm(h: H, m0?: M): void {
  const d = E().data(), isNew = !m0, m: M = m0 || { k: "dep", d: d.today };
  const banks = d.live<Rec & { type?: string; hidden?: boolean; name?: string }>("accounts").filter((a) => a.type !== "card" && !a.hidden);
  const lastAcc = d.live<Rec & { type?: string; instrument?: string; date?: string; accountId?: string }>("txns").filter((t) => t.type === "investment" && lc(t.instrument) === lc(h.instrument || "PPF")).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.accountId;
  openSheet(isNew ? "Add PPF entry" : "PPF entry", `
    ${isNew ? `<div class="seg" role="group" aria-label="Kind of entry" id="pkSeg">${[["dep", "Deposit"], ["int", "Interest"], ["wd", "Withdrawal"]].map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${m.k === k}">${l}</button>`).join("")}</div>` : ""}
    <div class="grid2" style="margin-top:12px">${field(["amt", "Amount (₹)", "number", { value: rs(m.amt), step: "1" }])}${field(["d", "Date", "date", { value: m.d || d.today }])}</div>
    <div id="pk_acc">${field(["acc", "Paid from", "select", { value: lastAcc || mainAcc(d)?.id || "", options: banks.map((a) => [a.id, String(a.name)] as [string, string]) }])}</div>
    <p class="note" id="pk_note"></p>
    ${btnRow(isNew, "Add entry")}`, (s) => {
    let k = String(m.k);
    const sync = (): void => {
      $s(s, "pk_acc").hidden = k !== "dep";
      $s(s, "pk_note").textContent = k === "dep" ? "Saved as a PPF investment entry from this account, like your monthly deposit, so it shows in Transactions and comes off that account's balance." : k === "int" ? "Interest is credited on 31 March. It's kept on the PPF and listed in Transactions, but doesn't touch any bank balance." : "Kept on the PPF and listed in Transactions. If the money reached a bank account, add it there as income too.";
      const fd = $s<HTMLInputElement>(s, "f_d"); if (k === "int" && isNew && !fd.dataset.t) fd.value = `${fyOf(d.today) + (d.today.slice(5) >= "03-31" ? 1 : 0)}-03-31`;
    };
    s.querySelectorAll<HTMLElement>("#pkSeg button").forEach((b) => { b.onclick = () => { k = b.dataset.k!; s.querySelectorAll("#pkSeg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); sync(); }; });
    $s(s, "f_d").addEventListener("input", () => { $s(s, "f_d").dataset.t = "1"; });
    sync(); $s(s, "cx").onclick = closeModal;
    const dl = opt(s, "dl"); if (dl) dl.onclick = () => { const o = { ...h, ppf: { ...h.ppf, manual: (h.ppf?.manual || []).filter((x) => x.id !== m.id) } }; closeModal(); E().write([W("holdings", o)]); toast("Entry removed"); };
    $s(s, "sv").onclick = () => {
      const amt = P(val("amt")), dt = val("d"), acc = val("acc"); if (!(amt > 0) || !dt) { toast("Enter the amount and date."); return; }
      // the account is read before the sheet closes (the planner read it after, so a deposit lost its account)
      if (k === "dep") { closeModal(); E().write([W("txns", { id: uid(), type: "investment", amount: amt, date: dt, accountId: acc, instrument: h.instrument || "PPF", invType: "PPF" } as Rec)]); toast("Deposit added"); return; }
      const o: M = { id: m.id || uid(), k, d: dt, amt }, list = ([...(h.ppf?.manual || [])] as M[]).filter((x) => x.id !== o.id).concat(o);
      closeModal(); E().write([W("holdings", { ...h, ppf: { ...h.ppf, manual: list } })]); toast(isNew ? "Entry added" : "Entry updated");
    };
  });
}

const NPS_LBL: Record<string, string> = { E: "Equity (E)", C: "Corporate bonds (C)", G: "Government bonds (G)", A: "Alternative (A)" };
const npsKey = (l: { k?: string; nm?: string; n?: string }): string => l.k || ((String(l.nm || l.n || "").match(/scheme\s+([ECGA])\b/i) || [])[1] || "").toUpperCase();
/** Units, NAV and contribution from an NPS statement. */
export function npsUnitsForm(h: H): void {
  const d = E().data(), N = (h.nps || {}) as NonNullable<Holding["nps"]> & { stmtDate?: string; contrib?: Paise; xirr?: number }, L = npsLines(h) || [];
  type Ln = (typeof L)[number] & { nm?: string; priceDate?: string; priceManual?: boolean; priceSrc?: string };
  openSheet("Update from statement", `<p class="note" style="margin-top:0">From the "Scheme Wise Summary" of your NPS statement (Protean, KFintech or CAMS).</p>
    ${(L as Ln[]).map((l, i) => `<p class="sect">${esc(NPS_LBL[npsKey(l)] || l.nm)}</p><div class="grid2">${field([`u${i}`, "Units", "number", { value: l.units ?? "", step: "any" }])}${field([`p${i}`, "NAV (₹)", "number", { value: l.price ?? "", step: "any" }])}</div>`).join("")}
    <p class="sect">Statement</p><div class="grid2">${field(["sd", "Statement date", "date", { value: N.stmtDate || d.today }])}${field(["ct", "Total contribution (₹)", "number", { value: rs(N.contrib), step: "0.01" }])}</div>
    ${field(["xr", "Return (XIRR, %)", "number", { value: N.xirr ?? "", step: "0.01" }])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    $s(s, "sv").onclick = () => {
      const sd = val("sd"); if (!sd) { toast("Pick the statement date."); return; }
      const lines = (L as Ln[]).map((l, i) => { const u = parseFloat(val(`u${i}`)), p = parseFloat(val(`p${i}`)); const o: Ln = { ...l }; if (u >= 0) o.units = u; if (p > 0 && (p !== +(l.price ?? 0) || sd > (l.priceDate || ""))) { o.price = p; o.priceDate = sd; o.priceManual = true; delete o.priceSrc; } return o; });
      const ct = parseFloat(val("ct")), xr = parseFloat(val("xr"));
      const o: Record<string, unknown> = { ...h, npsLines: lines, unitsAsOf: sd, nps: { ...N, stmtDate: sd, ...(ct > 0 ? { contrib: Math.round(ct * 100) } : {}), ...(xr ? { xirr: xr } : {}) } };
      if (ct > 0) { o.openInvested = Math.round(ct * 100); o.inclTo = sd; }
      closeModal(); E().write([W("holdings", o as Rec)]); toast("NPS updated");
    };
  });
}
export function npsContribForm(h: H): void {
  const d = E().data(), banks = d.live<Rec & { type?: string; hidden?: boolean; name?: string }>("accounts").filter((a) => a.type !== "card" && !a.hidden), inst = h.instrument || "NPS";
  const last = d.live<Rec & { type?: string; instrument?: string; date?: string; amount?: Paise; accountId?: string }>("txns").filter((t) => t.type === "investment" && lc(t.instrument) === lc(inst)).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || {};
  openSheet("Add NPS contribution", `<div class="grid2">${field(["amt", "Amount (₹)", "number", { value: rs((last as { amount?: Paise }).amount) || "", step: "1" }])}${field(["d", "Date", "date", { value: d.today }])}</div>
    ${field(["acc", "Paid from", "select", { value: (last as { accountId?: string }).accountId || mainAcc(d)?.id || "", options: banks.map((a) => [a.id, String(a.name)] as [string, string]) }])}
    <p class="note">Saved as an NPS investment entry from this account, so it shows in Transactions and comes off that account. It counts at the amount paid until you update the units from your next statement.</p>
    <div class="btns"><button class="btn pri" id="sv" type="button">Add contribution</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    $s(s, "sv").onclick = () => {
      const a = P(val("amt")), dt = val("d"), acc = val("acc"); if (!(a > 0) || !dt) { toast("Enter the amount and date."); return; }
      closeModal(); E().write([W("txns", { id: uid(), type: "investment", amount: a, date: dt, accountId: acc, instrument: inst, invType: "NPS" } as Rec)]); toast("Contribution added");
    };
  });
}

/** The EPF, PPF and NPS pages' buttons and rows. false: the holding form (still the planner's). */
export function invAct(d: MoneyData, x: DOMStringMap): boolean {
  const S = (E().state() ?? {}) as Record<string, string>;
  if (x.epfm !== undefined || x.ea === "add") { const h = epfHold(d, S) as H | undefined; if (!h) return true; if (x.ea === "add") { epfEntryForm(h); return true; } const m = (h.epf?.manual || []).find((y) => y.id === x.epfm); if (m) epfEntryForm(h, { ...m }); return true; }
  if (x.ppfm !== undefined || x.pa === "add") { const h = ppfHold(d, S) as H | undefined; if (!h) return true; if (x.pa === "add") { ppfEntryForm(h); return true; } const m = (h.ppf?.manual || []).find((y) => y.id === x.ppfm); if (m) ppfEntryForm(h, { ...m }); return true; }
  if (x.na === "add" || x.na === "units") { const h = npsHold(d, S) as H | undefined; if (!h) return true; if (x.na === "add") npsContribForm(h); else npsUnitsForm(h); return true; }
  return false;
}
