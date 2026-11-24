/**
 * Property forms, as in KP Money Planner: the property itself, its payments (typed, or picked from
 * Transactions), its categories, expected payments and builder demands, the fund, and reading the payment
 * plan and the loan statement from their PDFs. Read and saved in paise.
 */
import { esc } from "../../../core/dom.ts";
import { mLabel, ymOf, type Day } from "../calc/dates.ts";
import { num, type MoneyData, type Paise, type Rec, type Txn } from "../calc/data.ts";
import { bankOf } from "../calc/loans.ts";
import { accName, catName, fmtD } from "../calc/plan.ts";
import { mainAcc } from "../calc/forecast.ts";
import { PG, pcHow, pcOf, propCats, propList, type PlanRow, type Property } from "../calc/properties.ts";
import { obligations } from "../calc/reserve.ts";
import { money } from "../views/txlist.ts";
import { PROP_ST, rs0 } from "../views/accounts.ts";
import { fundsBox, fundsOf, fundsUI, legacyLoanOpt, txnForm } from "./txform.ts";
import { askConfirm, closeModal, field, openSheet, rs, toast, val } from "./kit.ts";
import { pdfLines } from "./pdf.ts";
import { E, uid } from "./env.ts";

type P = Property & { kind?: string; place?: string; note?: string; name?: string };
type Item = Rec & { prop?: string; cat?: string; amt?: Paise; date?: Day; txnId?: string; accountId?: string; loanId?: string; loanAmt?: Paise | null; funds?: { loan: string; amt: Paise; part?: string }[]; note?: string };
type T = Txn & { note?: string; categoryId?: string; fromLoan?: string; funds?: { loan: string; amt: Paise; part?: string }[]; fundLoan?: string; fundAmt?: Paise; hist?: boolean };
const PROP_KIND: Record<string, string> = { plot: "Plot", flat: "Flat", house: "House / villa", land: "Land", other: "Other" };
const PG_TAG: Record<string, string> = { cost: "in cost", sep: "separate", off: "separate · not for tax", int: "interest" };
const PLAN_WHO: Record<string, string> = { split: "Bank loan, or you until your share is paid", bank: "Bank loan", you: "You" };
const $s = <X extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): X => s.querySelector<X>("#" + id)!;
const opt = <X extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): X | null => s.querySelector<X>("#" + id);
const W = (c: string, r: Rec): { c: string; r: Rec } => ({ c, r: { ...r, updatedAt: Date.now() } });
const btnRow = (isNew: boolean, addLbl: string): string => `<div class="btns"><button class="btn pri" id="sv" type="button">${isNew ? addLbl : "Save"}</button><button class="btn" id="cx" type="button">Cancel</button>${isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>'}</div>`;
const addDays = (x: Day, n: number): Day => { const t = new Date(x + "T00:00"); t.setDate(t.getDate() + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const inr = (p: unknown): string => (num(p) ? (num(p) / 100).toLocaleString("en-IN") : "");
const S = (): Record<string, unknown> | null => E().state() as Record<string, unknown> | null;
const fresh = (id: string): P => E().data().byId<P>("props", id)!;
const fromLoanName = (d: MoneyData, t: T): string => { const l = t.fromLoan && d.byId<Rec & { name?: string }>("loans", t.fromLoan); return l ? `Paid from ${l.name} (loan)` : "Paid from a loan"; };

export function propForm(p0?: Partial<P>): void {
  const d = E().data(), isNew = !p0 || !p0.id, p: Partial<P> = p0 || { kind: "plot", status: "registered" };
  const loans = d.live<Rec & { name?: string; lender?: string }>("loans").filter((l) => bankOf(l as never));
  openSheet(isNew ? "Add a property" : "Edit property", `
    ${field(["pn", "Name", "text", { value: p.name || "", ph: "e.g. Upkar Galaxy" }])}
    <div class="grid2">${field(["pk", "Type", "select", { value: p.kind, options: Object.entries(PROP_KIND) }])}${field(["ps", "Status", "select", { value: p.status, options: Object.entries(PROP_ST) }])}</div>
    ${field(["pp", "Where", "text", { value: p.place || "", ph: "e.g. Plot 21, Chunchaguppe" }])}
    <div class="grid2">${field(["pd", "Booked / registered on", "date", { value: p.since || "" }])}${field(["pv", "Agreement value (₹)", "text", { value: inr(p.value), ph: "e.g. 2,14,02,419", hint: "Optional · shows how much of the price is paid" }])}</div>
    <label class="chk" style="display:flex;gap:10px;align-items:flex-start;margin:4px 0 12px"><input type="checkbox" id="f_pnw" ${p.nw ? "checked" : ""} style="margin-top:3px"><span><b>Count in net worth</b><br><span class="mut" style="font-size:12.5px">Once registered: the current value below, or else the agreement value. Before that: only the price paid so far.</span></span></label>
    <div class="grid2">${field(["pcur", "Current value (₹)", "text", { value: inr(p.cur), ph: "Optional", hint: "e.g. guidance value or an estimate" }])}${field(["pcd", "Value as of", "date", { value: p.curDate || "" }])}</div>
    ${field(["pl", "Loan for this property", "select", { value: p.loanId || "", options: [["", "No loan"], ...loans.map((l) => [l.id, `${l.name}${l.lender ? ` · ${l.lender}` : ""}`] as [string, string])], hint: "Its interest is added to the property by itself" }])}
    ${field(["pnote", "Notes", "textarea", { value: p.note || "" }])}
    ${btnRow(isNew, "Add property")}`, (s) => {
    $s(s, "cx").onclick = closeModal;
    const pc = $s<HTMLInputElement>(s, "f_pcur"); pc.setAttribute("inputmode", "numeric");
    pc.addEventListener("input", () => { const raw = pc.value.replace(/[^\d]/g, ""); pc.value = raw ? (+raw).toLocaleString("en-IN") : ""; if (raw && !$s<HTMLInputElement>(s, "f_pcd").value) $s<HTMLInputElement>(s, "f_pcd").value = d.today; });
    const pv = $s<HTMLInputElement>(s, "f_pv"); pv.setAttribute("inputmode", "numeric");
    const pvHint = (): void => { const n = parseFloat(pv.value.replace(/[^\d.]/g, "")) || 0; pv.parentNode!.querySelector(".hint")!.textContent = n > 0 ? `${rs0(n * 100)} · ${n >= 1e7 ? (n / 1e7).toFixed(2) + " crore" : n >= 1e5 ? (n / 1e5).toFixed(2) + " lakh" : "Optional"}` : "Optional · shows how much of the price is paid"; };
    pv.addEventListener("input", () => { const raw = pv.value.replace(/[^\d]/g, ""), at = pv.value.length - (pv.selectionStart ?? 0); pv.value = raw ? (+raw).toLocaleString("en-IN") : ""; const c = Math.max(0, pv.value.length - at); try { pv.setSelectionRange(c, c); } catch { /* not focused */ } pvHint(); }); pvHint();
    const dl = opt(s, "dl");
    if (dl) dl.onclick = () => askConfirm(`Delete "${p.name}"? Its payment list goes too; your transactions stay as they are.`, "Delete", () => {
      const now = Date.now(), ops = d.live<Item>("propItems").filter((i) => i.prop === p.id).map((i) => ({ c: "propItems", r: { ...i, deleted: true, updatedAt: now } as Rec }));
      ops.push({ c: "props", r: { ...d.byId("props", p.id!)!, deleted: true, updatedAt: now } as Rec });
      E().write(ops); const st = S(); if (st) st.accTab = "props"; E().planner("go", "accounts"); toast("Property deleted");
    });
    $s(s, "sv").onclick = () => {
      const name = val("pn"); if (!name) { toast("Give the property a name."); return; }
      const money1 = (id: string): Paise => Math.round((parseFloat(val(id).replace(/[^\d.]/g, "")) || 0) * 100);
      const o: Record<string, unknown> = { ...p, id: p.id || uid(), name, kind: val("pk"), status: val("ps"), place: val("pp"), since: val("pd"), value: money1("pv"), loanId: val("pl"), nw: $s<HTMLInputElement>(s, "f_pnw").checked, cur: money1("pcur"), curDate: val("pcd"), note: $s<HTMLTextAreaElement>(s, "f_pnote").value.trim() };
      if (o.loanId !== p.loanId) delete o.stmt;
      closeModal(); E().write([W("props", o as Rec)]);
      if (isNew) { const st = S(); if (st) Object.assign(st, { propId: o.id, propTab: "overview" }); E().planner("go", "prop"); }
      toast(isNew ? "Property added" : "Saved");
    };
  });
}

const pcOpts = (d: MoneyData, g: string, keep?: string): [string, string][] => propCats(d).filter((c) => c.g === g && (!c.hidden || c.k === keep)).map((c) => [c.k, c.name]);
function propCatField(d: MoneyData, cat?: string): string {
  const g = pcOf(d, cat || "token").g;
  return `<div class="f"><label>Group</label><div class="fychips" role="group" aria-label="Group" id="pgChips" style="margin:0;flex-wrap:wrap;overflow:visible;gap:6px">${PG.map(([k, l]) => `<button type="button" class="chip fchip ${k === g ? "" : "mute"}" data-g="${k}" aria-pressed="${k === g}">${esc(l)}</button>`).join("")}</div></div>
    ${field(["pc", "What for", "select", { value: cat || "", options: pcOpts(d, g, cat) }])}<p class="note" id="pc_how" style="margin-top:-4px"></p>`;
}
function propCatMount(d: MoneyData, s: HTMLElement): void {
  const how = (): void => { const c = pcOf(d, val("pc")), h = pcHow(c); $s(s, "pc_how").textContent = h === "prin" ? "Not added to the cost (the loan already paid the price). Pick the loan it came from in Paid from, to show who really paid." : c.f === "bank" ? "Counts in the cost, as paid by the bank, not from your money." : h === "int" ? "Counts as interest: in 'cost with interest', not in the cost." : h === "off" ? "Listed separately as off-record; not part of the cost for tax." : h === "sep" ? "Listed separately; not part of the property's cost." : "Counts in the property's cost."; };
  s.querySelectorAll<HTMLElement>("#pgChips button").forEach((b) => { b.onclick = () => {
    s.querySelectorAll<HTMLElement>("#pgChips button").forEach((x) => { const on = x === b; x.setAttribute("aria-pressed", String(on)); x.classList.toggle("mute", !on); });
    $s(s, "f_pc").innerHTML = pcOpts(d, b.dataset.g!).map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join(""); how();
  }; });
  $s(s, "f_pc").onchange = how; how();
}
/** The transaction category that best fits a property category (Property › Legal, Property › Stamp Duty, …). */
export function propTxnCat(d: MoneyData, k: string): string {
  type C = Rec & { kind?: string; parentId?: string; name?: string };
  const C = d.live<C>("categories").filter((c) => c.kind === "expense"), top = C.find((c) => !c.parentId && /^property$/i.test(String(c.name))), subs = top ? C.filter((c) => c.parentId === top.id) : [];
  const c = pcOf(d, k);
  if (k === "lprepay") { const e = C.find((x) => !x.parentId && /^loan emi$/i.test(String(x.name))), h = e && C.find((x) => x.parentId === e.id && /home loan/i.test(String(x.name))); if (h || e) return (h || e)!.id; }
  const want = k === "motd" ? /moe|motd|bank/i : k === "legoth" ? /porter|courier|legal/i : c.g === "legal" ? /legal/i : k === "stamp" || k === "regfee" || k === "cess" || k === "estamp" ? /stamp|regist/i : c.g === "loan" ? /bank|loan/i : c.g === "price" ? /plot|flat|price/i : k === "khata" ? /khata|plot/i : null;
  const s = want && subs.find((x) => want.test(String(x.name))); return (s || top || { id: "" }).id || "";
}
type Pre = Partial<Item> & { onSaved?: () => { c: string; r: Rec }[] };
export function propItemForm(p: P, it0?: Item | null, pre?: Pre): void {
  const d = E().data(), isNew = !it0, it: Item & Pre = it0 || { id: "", cat: "token", date: d.today, ...(pre || {}) };
  const linked = !!it.txnId, t = linked ? d.byId<T>("txns", it.txnId!) : undefined, live1 = !!t && !t.deleted;
  const banks = d.live<Rec & { hidden?: boolean; name?: string }>("accounts").filter((a) => !a.hidden);
  const f0 = linked ? (live1 && t!.type === "expense" && !t!.fromLoan ? fundsOf(t as never) : null) : ((it.funds || []).length ? it.funds! : it.loanId && it.accountId ? [{ loan: it.loanId, amt: num(it.loanAmt) }] : []);
  const legacy = linked ? (live1 && !!t!.fromLoan) : (!!it.loanId && !it.accountId && !isNew);
  openSheet(isNew ? "Add payment" : "Payment", `
    ${linked ? `<div class="card" style="margin:0 0 12px"><div class="kv" style="margin:0"><span>Linked transaction</span><b>${live1 ? `${rs0(num(t!.amount))} · ${fmtD(d, t!.date!)}` : "deleted"}</b>${live1 ? `<span>${esc(t!.fromLoan ? fromLoanName(d, t!) : accName(d, t!.accountId))}</span><b>${esc(catName(d, t!.categoryId))}</b>` : ""}</div><p class="cnote">Amount, date and account come from the transaction. Change them there.</p></div>` : ""}
    ${field(["pprop", "Property", "select", { value: p.id, options: propList(d).map((x) => [x.id, String(x.name)] as [string, string]) }])}
    ${propCatField(d, it.cat)}
    ${linked ? "" : `<div class="grid2">${field(["pa", "Amount (₹)", "number", { value: rs(it.amt), step: "0.01" }])}${field(["pdt", "Date", "date", { value: it.date || d.today }])}</div>
    ${field(["pacc", "Paid from", "select", { value: legacy ? "~" + it.loanId : (it.accountId ?? (mainAcc(d)?.id || "")), options: [["", "Not from an account (cash in hand, paid by someone else)"], ...banks.map((a) => [a.id, String(a.name)] as [string, string]), ...(legacy ? legacyLoanOpt(d, it.loanId) : [])] }])}`}
    ${f0 ? fundsBox() : ""}
    ${field(["pnt", "Note", "text", { value: it.note || "", ph: "Optional" }])}
    ${isNew ? `<label class="chk" style="display:flex;gap:10px;align-items:flex-start;margin:4px 0 8px"><input type="checkbox" id="f_ptx" checked style="margin-top:3px"><span>Also add it to Transactions, so it counts in your spending and comes off the account's balance</span></label>
      <div id="ptxCat">${field(["categoryId", "Transaction category", "select", { value: propTxnCat(d, String(it.cat)), options: d.live<Rec & { kind?: string }>("categories").filter((c) => c.kind === "expense").map((c) => [c.id, catName(d, c.id)] as [string, string]) }])}
      <label class="opt" style="margin-bottom:12px"><input type="checkbox" id="f_phist"><div><b>Already in my balances</b><span>For a past payment your account balance already includes, so it isn't taken off again.</span></div></label></div>` : ""}
    <div class="btns"><button class="btn pri" id="sv" type="button">${isNew ? "Add payment" : "Save"}</button>${isNew ? "" : `<button class="btn danger" id="dl" type="button">${linked ? "Unlink" : "Delete"}</button>`}${linked && live1 ? '<button class="btn" id="otx" type="button">Open transaction</button>' : ""}<button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    propCatMount(d, s);
    $s(s, "cx").onclick = closeModal;
    if (opt(s, "f_categoryId")) {
      const fit = (): void => { const v = propTxnCat(d, val("pc")), sel = $s<HTMLSelectElement>(s, "f_categoryId"); if (v && sel.value !== v) { sel.value = v; sel.dispatchEvent(new Event("change", { bubbles: true })); } };
      $s(s, "f_pc").addEventListener("change", fit); s.querySelectorAll<HTMLElement>("#pgChips button").forEach((b) => b.addEventListener("click", fit));
    }
    const FU = f0 ? fundsUI(d, $s(s, "w_funds"), f0 as never, () => (linked ? num(t!.amount) / 100 : (parseFloat(val("pa")) || 0))) : null;
    if (FU && opt(s, "f_pa")) $s(s, "f_pa").addEventListener("input", () => FU.refresh());
    const ptx = opt<HTMLInputElement>(s, "f_ptx");
    if (ptx) { const sync = (): void => { $s(s, "ptxCat").hidden = !ptx.checked || !val("pacc"); }; ptx.onchange = sync; $s(s, "f_pacc").addEventListener("change", sync); sync(); }
    const ot = opt(s, "otx"); if (ot) ot.onclick = () => { closeModal(); txnForm({ ...t } as never); };
    const dl = opt(s, "dl"); if (dl) dl.onclick = () => { closeModal(); E().write([{ c: "propItems", r: { ...d.byId("propItems", it.id)!, deleted: true, updatedAt: Date.now() } as Rec }]); toast(linked ? "Unlinked. The transaction is still in Transactions." : "Payment deleted"); };
    $s(s, "sv").onclick = () => {
      const cat = val("pc"), prop = val("pprop"), note = val("pnt"); if (!cat) { toast("Pick what the payment was for."); return; }
      let fs: { loan: string; amt: Paise; part?: string }[] = []; if (FU) { try { fs = FU.get(); } catch (e) { toast((e as Error).message); return; } }
      if (linked) {
        closeModal(); const ops: { c: string; r: Rec }[] = [];
        if (FU) { const tx: Record<string, unknown> = { ...t }; delete tx.fundLoan; delete tx.fundAmt; if (fs.length) tx.funds = fs; else delete tx.funds; if (JSON.stringify(tx.funds || []) !== JSON.stringify(t!.funds || []) || t!.fundLoan) ops.push(W("txns", tx as Rec)); }
        ops.push(W("propItems", { ...d.byId("propItems", it.id)!, prop, cat, note })); E().write(ops); toast("Saved"); return;
      }
      const amt = Math.round(parseFloat(val("pa")) * 100), date = val("pdt"), acc = val("pacc"); if (!amt || !date) { toast("Enter the amount and date."); return; }
      if (isNew && ptx && ptx.checked && acc) {
        const tx = { id: uid(), type: "expense", amount: Math.abs(amt), date, accountId: acc, categoryId: val("categoryId"), note: `${d.byId<P>("props", prop)!.name} · ${pcOf(d, cat).name}${note ? ` · ${note}` : ""}`, ...(fs.length ? { funds: fs } : {}), ...($s<HTMLInputElement>(s, "f_phist").checked ? { hist: true } : {}) };
        closeModal(); E().write([W("txns", tx as Rec), W("propItems", { id: uid(), prop, cat, txnId: tx.id, note, amt: tx.amount, date } as Rec), ...(pre?.onSaved?.() ?? [])]); toast("Payment added, and in Transactions"); return;
      }
      const leg = acc.startsWith("~");
      closeModal(); E().write([W("propItems", { ...(isNew ? {} : d.byId("propItems", it.id)), id: it.id || uid(), prop, cat, amt, date, accountId: leg ? "" : acc, loanId: leg ? acc.slice(1) : "", loanAmt: null, funds: leg ? [] : fs, note } as Rec), ...(isNew ? pre?.onSaved?.() ?? [] : [])]);
      toast(isNew ? "Payment added" : "Saved");
    };
  });
}

/** Link payments that are already in Transactions. */
export function propPickForm(p: P): void {
  const d = E().data(), used = new Set(d.live<Item>("propItems").map((i) => i.txnId).filter(Boolean));
  const pool = d.live<T>("txns").filter((t) => (t.type === "expense" || t.type === "income" || t.type === "transfer" || t.type === "loan") && !used.has(t.id)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const word = (t: T): string => [t.note, catName(d, t.categoryId), accName(d, t.accountId)].join(" ").toLowerCase();
  openSheet(`Pick from Transactions · ${p.name}`, `
    ${field(["pq", "Search", "text", { ph: "Word, amount or year, e.g. legal, 183659, 2024" }])}
    <div class="list" id="pkList" style="max-height:44vh;overflow:auto"></div>
    <p class="note" id="pkCount"></p>
    ${propCatField(d, "lawyer")}
    <div class="btns"><button class="btn pri" id="sv" type="button">Link ticked</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    propCatMount(d, s); const sel = new Set<string>();
    const cnt = (): void => { $s(s, "pkCount").textContent = sel.size ? `${sel.size} ticked. They all get the category below; you can change each one later. Cashback or refunds count as minus.` : "Tick the transactions that belong to this property."; };
    const draw = (): void => {
      const q = val("pq").toLowerCase().replace(/,/g, ""), n = parseFloat(q);
      const hit = pool.filter((t) => !q || word(t).includes(q) || (t.date ?? "").includes(q) || (n > 0 && Math.abs(num(t.amount) / 100 - n) < 1)).slice(0, 80);
      $s(s, "pkList").innerHTML = hit.map((t) => `<label class="row" style="cursor:pointer"><input type="checkbox" data-id="${esc(t.id)}" ${sel.has(t.id) ? "checked" : ""} style="flex:none"><div class="main"><div class="t">${esc(t.note || catName(d, t.categoryId))}</div><div class="s">${fmtD(d, t.date!)} · ${esc(t.fromLoan ? fromLoanName(d, t) : accName(d, t.accountId))} · ${esc(catName(d, t.categoryId))}</div></div><div class="amt ${t.type === "income" ? "in" : ""}">${t.type === "income" ? "−" : ""}${rs0(num(t.amount))}</div></label>`).join("") || '<div class="empty">Nothing matches.</div>';
      $s(s, "pkList").querySelectorAll<HTMLInputElement>("input").forEach((c) => { c.onchange = () => { if (c.checked) sel.add(c.dataset.id!); else sel.delete(c.dataset.id!); cnt(); }; }); cnt();
    };
    $s(s, "f_pq").addEventListener("input", draw); draw();
    $s(s, "cx").onclick = closeModal;
    $s(s, "sv").onclick = () => {
      if (!sel.size) { toast("Tick at least one transaction."); return; }
      const cat = val("pc"), ops = [...sel].map((id) => { const t = d.byId<T>("txns", id)!; return W("propItems", { id: uid(), prop: p.id, cat, txnId: id, amt: num(t.amount), date: t.date } as Rec); });
      closeModal(); const st = S(); if (st) st.propTab = "payments"; E().write(ops); toast(`${sel.size} payment${sel.size === 1 ? "" : "s"} linked`);
    };
  });
}

/** Rename, hide or add categories. */
export function propCatsSheet(): void {
  const d = E().data(), cfg = d.byId<Rec & { custom?: { k: string; g: string; name: string }[] }>("props", "propcats") ?? { id: "propcats", rec: "cats", custom: [], hide: [], names: {} }, C = propCats(d);
  openSheet("Property categories", `${PG.map(([g, l, how]) => `<div class="sh" style="margin-top:12px"><h3>${esc(l)} <span class="pill">${PG_TAG[how]}</span></h3></div>
    <div class="list">${C.filter((c) => c.g === g).map((c) => `<div class="row"><div class="main"><input type="text" data-nm="${esc(c.k)}" value="${esc(c.name)}" aria-label="Name" style="width:100%;border:0;background:transparent;font:inherit;color:inherit;padding:0">${c.f === "int" ? '<div class="s">Counts as interest</div>' : c.f === "bank" ? '<div class="s">Paid by the bank loan</div>' : ""}</div>
      <label class="s" style="display:flex;gap:6px;align-items:center;white-space:nowrap"><input type="checkbox" data-hd="${esc(c.k)}" ${c.hidden ? "" : "checked"}>Show</label></div>`).join("")}
      <div class="row"><input type="text" data-new="${g}" placeholder="+ Add a category here" aria-label="New category in ${esc(l)}" style="flex:1;border:0;background:transparent;font:inherit;color:inherit;padding:0"></div></div>`).join("")}
    <div class="btns" style="margin-top:12px"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    $s(s, "sv").onclick = () => {
      const names: Record<string, string> = {}, hide: string[] = [], custom = [...(cfg.custom || [])];
      s.querySelectorAll<HTMLInputElement>("[data-nm]").forEach((i) => { const c = C.find((x) => x.k === i.dataset.nm)!, v = i.value.trim(); if (v && v !== c.base) names[c.k] = v; });
      s.querySelectorAll<HTMLInputElement>("[data-hd]").forEach((i) => { if (!i.checked) hide.push(i.dataset.hd!); });
      s.querySelectorAll<HTMLInputElement>("[data-new]").forEach((i) => { const v = i.value.trim(); if (v) custom.push({ k: "c" + uid(), g: i.dataset.new!, name: v }); });
      closeModal(); E().write([W("props", { ...cfg, names, hide, custom } as Rec)]); toast("Categories saved");
    };
  });
}

/* ---------- expected payments ---------- */
export function propPlanForm(p: P, r0?: PlanRow): void {
  const isNew = !r0, r: PlanRow = r0 || { id: uid(), name: "", amt: "" as never, gst: "" as never, when: "", who: "you", status: "estimate", tds: false };
  const wk = r.when ? (r.when.length === 10 ? "date" : "month") : "none";
  openSheet(isNew ? "Expected payment" : r.name, `
    ${field(["xn", "What", "text", { value: r.name, ph: "e.g. 6th floor slab, MODT stamp duty" }])}
    <div class="grid2">${field(["xa", "Amount (₹)", "number", { value: rs(r.amt), step: "1" }])}${field(["xg", "GST (₹)", "number", { value: rs(r.gst), step: "1", hint: "If not in the amount" }])}</div>
    <div class="seg" role="group" aria-label="When" id="xw" style="margin-bottom:10px">${[["date", "On a date"], ["month", "Around a month"], ["none", "Not dated"]].map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${wk === k}">${l}</button>`).join("")}</div>
    <div id="w_xd">${field(["xd", "Date", "date", { value: r.when && r.when.length === 10 ? r.when : "" }])}</div><div id="w_xm">${field(["xm", "Month", "month", { value: r.when ? r.when.slice(0, 7) : "" }])}</div>
    ${field(["xwho", "Who pays", "select", { value: r.who, options: Object.entries(PLAN_WHO) }])}
    ${field(["xs", "Amount is", "select", { value: r.status, options: [["estimate", "An estimate"], ["confirmed", "Confirmed"]] }])}
    <label class="opt"><input type="checkbox" id="f_xt" ${r.tds ? "checked" : ""}><div><b>1% TDS applies</b><span>For payments to the builder. You deposit it yourself with Form 26QB, even when the bank pays the builder.</span></div></label>
    <div class="btns" style="margin-top:12px"><button class="btn pri" id="sv" type="button">Save</button>${isNew ? "" : '<button class="btn" id="dm" type="button">Demand received</button><button class="btn danger" id="dl" type="button">Delete</button>'}<button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    let w = wk; const sync = (): void => { s.querySelectorAll<HTMLElement>("#xw button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === w))); $s(s, "w_xd").hidden = w !== "date"; $s(s, "w_xm").hidden = w !== "month"; };
    s.querySelectorAll<HTMLElement>("#xw button").forEach((b) => { b.onclick = () => { w = b.dataset.k!; sync(); }; }); sync();
    $s(s, "cx").onclick = closeModal;
    const save = (o: PlanRow): void => { const P0 = fresh(p.id), plan = [...(P0.plan || [])], i = plan.findIndex((x) => x.id === o.id); if (i >= 0) plan[i] = o; else plan.push(o); E().write([W("props", { ...P0, plan })]); };
    const dl = opt(s, "dl"); if (dl) dl.onclick = () => { closeModal(); const P0 = fresh(p.id); E().write([W("props", { ...P0, plan: (P0.plan || []).filter((x) => x.id !== r.id) })]); toast("Removed"); };
    const dm = opt(s, "dm"); if (dm) dm.onclick = () => { closeModal(); propDemandForm(p, r); };
    $s(s, "sv").onclick = () => {
      const name = val("xn"), amt = parseFloat(val("xa")); if (!name || !(amt > 0)) { toast("Enter what it is and the amount."); return; }
      const when = w === "date" ? val("xd") : w === "month" ? val("xm") : ""; if (w !== "none" && !when) { toast("Pick the date or month."); return; }
      // read before the sheet closes (the planner read them after, so it couldn't save an expected payment)
      const o = { ...r, name, amt: Math.round(amt * 100), gst: Math.round((parseFloat(val("xg")) || 0) * 100), when, who: val("xwho"), status: val("xs"), tds: $s<HTMLInputElement>(s, "f_xt").checked };
      closeModal(); save(o); toast("Saved");
    };
  });
}
/** A builder demand: when it's due and how much the bank pays. */
export function propDemandForm(p: P, r: PlanRow): void {
  const d = E().data(), t = num(r.amt) + num(r.gst);
  openSheet(`Demand · ${r.name}`, `
    <div class="grid2">${field(["dA", "Amount demanded (₹)", "number", { value: rs(t), step: "1", hint: "Instalment plus GST" }])}${field(["dD", "Pay by", "date", { value: r.when && r.when.length === 10 ? r.when : addDays(d.today, 15) }])}</div>
    ${field(["dB", "Paid by the bank (₹)", "number", { value: r.who === "you" ? 0 : r.who === "bank" ? rs(t) : "", step: "1", hint: "Leave 0 if you pay all of it" }])}
    <p class="note">Your share goes on Pay by Tuesday for that date. When it's paid, the 1% TDS is added with its 26QB due date.</p>
    <div class="btns"><button class="btn pri" id="sv" type="button">Save demand</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    $s(s, "sv").onclick = () => {
      const A = Math.round(parseFloat(val("dA")) * 100), D = val("dD"), Bk = Math.min(A, Math.round((parseFloat(val("dB")) || 0) * 100)); if (!(A > 0) || !D) { toast("Enter the amount and date."); return; }
      const P0 = fresh(p.id), plan = (P0.plan || []).map((x) => (x.id === r.id ? { ...x, when: D, status: "confirmed", amt: A - num(x.gst) > 0 ? A - num(x.gst) : A, gst: A - num(x.gst) > 0 ? num(x.gst) : 0, who: Bk >= A - 50 ? "bank" : Bk < 50 ? "you" : "split", youAmt: A - Bk, bankAmt: Bk } : x));
      closeModal(); E().write([W("props", { ...P0, plan })]); toast("Demand saved");
    };
  });
}
/** Paying a dated expected row (or its TDS) from Pay by Tuesday. */
export function propPlanPay(p: P, r: PlanRow, o: { tds?: boolean; amount: Paise; acc: string; key: string }): void {
  const d = E().data(), done = (extra: Record<string, unknown>): { c: string; r: Rec } => { const P0 = fresh(p.id); return W("props", { ...P0, plan: (P0.plan || []).map((x) => (x.id === r.id ? { ...x, ...extra } : x)) }); };
  if (o.tds) { txnForm({}, { type: "expense", amount: o.amount, accountId: o.acc, categoryId: propTxnCat(d, "tds"), note: `${p.name} · TDS (Form 26QB) for ${r.name}`, link: o.key } as never); E().write([done({ tdsDone: true })]); return; }
  propItemForm(p, null, { cat: /slab|floor|basement|possession|flooring|agreement|booking/i.test(r.name) ? "inst" : "legoth", amt: o.amount, date: d.today, note: r.name, onSaved: () => [done({ done: true, paidOn: d.today })] });
}
/** The builder's payment plan from the agreement PDF: "On Completion of 6th Floor Slab | 6.0% | 1217655 | 60883". Rupees. */
export function propPlanParse(lines: string[]): { name: string; amt: number; gst: number }[] {
  const out: { name: string; amt: number; gst: number }[] = []; let pend: string | null = null; const n = (s: string): number => parseFloat(String(s).replace(/[,/\-‐]/g, "")) || 0;
  let k = lines.findIndex((l) => /^\s*PAYMENT PLAN\s*$/i.test(l)); if (k < 0) k = lines.findIndex((l) => /^\s*On Booking\b/i.test(l)); const L = k >= 0 ? lines.slice(k, k + 60) : lines;
  for (const l of L) {
    const p = l.split(" | ").map((x) => x.trim());
    if (/^Total\b/i.test(p[0]!) || /^Grand Total/i.test(p[0]!)) { if (/^Grand/i.test(p[0]!)) break; continue; }
    const nums = p.filter((x) => /^\d{3,}$/.test(x)).map(n);
    const text = p.filter((x) => !/^\d{3,}$/.test(x) && !/^[\d.]+%$/.test(x)).join(" ").trim();
    const nm = (t: string): string => { t = t.replace(/\s+/g, " ").trim(); return /^Advance Maintenance/i.test(t) ? "Advance maintenance (first year)" : t.replace(/^On Completion of /i, "").replace(/^On /i, "").replace(/\(\s*/g, "(").replace(/\s*\)/g, ")"); };
    if (nums.length && text) { out.push({ name: nm(text), amt: nums[0]!, gst: nums[1] || 0 }); pend = null; }
    else if (nums.length && pend) { out.push({ name: nm(pend), amt: nums[0]!, gst: nums[1] || 0 }); pend = null; }
    else if (text && /maintenance|corpus/i.test(text)) pend = text.replace(/\s+/g, " ");
  }
  if (!out.length) throw new Error("no payment plan found");
  return out;
}
export async function propPlanLoad(p: P, file: Blob): Promise<void> {
  let rows: ReturnType<typeof propPlanParse>;
  try { rows = propPlanParse(await pdfLines(file)); } catch (e) { console.warn("payment plan", e); toast("Couldn't find a payment plan table in that PDF."); return; }
  const paidNames = /^booking|^agreement/i, P = (x: number): Paise => Math.round(x * 100);
  openSheet("Payment plan found", `<p class="note" style="margin-top:0">${rows.length} payments. Booking and agreement are marked as done, since you've already paid them; untick any that aren't.</p>
    <div class="list">${rows.map((r, i) => `<label class="row" style="cursor:pointer"><input type="checkbox" data-i="${i}" ${paidNames.test(r.name) ? "checked" : ""} style="flex:none"><div class="main"><div class="t">${esc(r.name)}</div><div class="s">${money(P(r.amt))}${r.gst ? ` + GST ${money(P(r.gst))}` : ""}</div></div><div class="amt">${money(P(r.amt + r.gst))}</div></label>`).join("")}</div>
    <p class="note">Ticked = already paid. Construction stages get no date for now; the bank pays them, or you until your share (${p.fund?.ltv ?? 75}%) is met.</p>
    <div class="btns"><button class="btn pri" id="sv" type="button">Add to Expected</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    $s(s, "sv").onclick = () => {
      const done = new Set([...s.querySelectorAll<HTMLInputElement>("input:checked")].map((x) => +x.dataset.i!)), P0 = fresh(p.id), have = new Set((P0.plan || []).map((x) => x.name.toLowerCase()));
      const add = rows.filter((r) => !have.has(r.name.toLowerCase())).map((r) => ({ id: uid(), name: r.name, amt: P(r.amt), gst: P(r.gst), when: "", status: "confirmed", who: /maintenance|corpus/i.test(r.name) ? "you" : "split", tds: !/maintenance|corpus/i.test(r.name), done: done.has(rows.indexOf(r)) }));
      closeModal(); E().write([W("props", { ...P0, plan: [...(P0.plan || []), ...add] })]); toast(`${add.length} expected payments added`);
    };
  });
}
/** The usual extra costs, estimated from the agreement value. */
export function propPlanEstimates(p: P): void {
  const v = num(p.value) / 100, ltv = (p.fund?.ltv ?? 75) / 100, loan = Math.round(v * ltv), base = Math.round(v / 1.05);
  const Es: [string, number, string][] = [["Loan processing fee (about 0.5% + GST)", Math.round(loan * 0.005 * 1.18), "you"], ["Bank legal & valuation fees", 10000, "you"], ["MODT stamp duty (0.5% of the loan)", Math.round(loan * 0.005), "you"],
    ["Stamp duty at registration (about 5%)", Math.round(base * 0.05), "you"], ["Registration fee (about 1%)", Math.round(base * 0.01), "you"], ["Corpus fund", 79200, "you"]];
  const P0 = fresh(p.id), have = new Set((P0.plan || []).map((x) => x.name.toLowerCase()));
  const add = Es.filter(([n]) => !have.has(n.toLowerCase())).map(([name, amt, who]) => ({ id: uid(), name, amt: amt * 100, gst: 0, when: "", status: "estimate", who, tds: false }));
  E().write([W("props", { ...P0, plan: [...(P0.plan || []), ...add] })]);
  toast(add.length ? `${add.length} estimated costs added: edit each when you know the real figure` : "Already added");
}
export function propFundForm(p: P): void {
  const f = p.fund || {};
  openSheet(`${p.name} · fund`, `${field(["fb", "Have my share ready by", "month", { value: f.by || "", hint: "Roughly when you expect the loan and the bigger payments to start" }])}
    ${field(["fl", "Bank lends (% of the price)", "number", { value: f.ltv ?? 75, step: "1", hint: "Usually up to 75% for loans above ₹75 lakh" }])}
    ${field(["fs", "Already set aside for it (₹)", "number", { value: rs(f.start), step: "1" }])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    // "Already set aside" is read before the sheet closes (the planner read it after, so it was always saved as 0)
    $s(s, "sv").onclick = () => { const by = val("fb"), ltv = parseFloat(val("fl")), start = Math.round((parseFloat(val("fs")) || 0) * 100); closeModal(); E().write([W("props", { ...fresh(p.id), fund: { by: by || null, ltv: ltv >= 0 && ltv <= 100 ? ltv : 75, start } })]); toast("Saved"); };
  });
}

/* ---------- the loan statement (ICICI-style PDF): the bank's totals ---------- */
export function propStmtParse(lines: string[]): { bank: string; asOf?: string; acct?: string; prin?: number; int?: number; pemi?: number; chg?: number; through?: string; out?: number } {
  const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }, pad = (x: number): string => String(x).padStart(2, "0");
  const dt = (s: string): string => { const m = String(s).match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/); if (!m) return ""; const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!; return `${y}-${pad(MON[m[2]!.toLowerCase()]!)}-${pad(+m[1]!)}`; };
  const n = (s: string): number => parseFloat(String(s).replace(/[(),]/g, "")) || 0, parts = (l: string): string[] => l.split(" | ").map((x) => x.trim());
  const isNum = (x: string): boolean => /^\(?[\d,]+\.\d{2}\)?$/.test(x);
  const st: ReturnType<typeof propStmtParse> = { bank: /icici/i.test(lines.slice(0, 5).join(" ")) ? "ICICI" : "" };
  for (const l of lines) {
    let m: RegExpMatchArray | null;
    if (!st.asOf && (m = l.match(/Loan Account Details As on (\d{1,2}-\w{3}-\d{2,4})/i))) st.asOf = dt(m[1]!);
    if (!st.acct && (m = l.match(/Statement for ([A-Z0-9]+)/i))) st.acct = "…" + m[1]!.slice(-4);
    if (/^Debits \|/.test(l)) { const p = parts(l).slice(1).filter(isNum).map(n); if (p.length >= 7) { st.prin = p[0]; st.int = p[1]; st.pemi = p[2]; st.chg = p[5]; } }
    if ((m = l.match(/^(\d{1,2}-\w{3}-\d{2,4}) \| [^|]+ \| (EMI|Pre-EMI) \| Due for/))) { const x = dt(m[1]!); if (!st.through || ymOf(x) > st.through) st.through = ymOf(x); }
  }
  const k = lines.findIndex((l) => /^Current OS/.test(l));
  if (k >= 0) for (const l of lines.slice(k + 1, k + 8)) { const p = parts(l); if (p.length >= 8 && p.every(isNum)) { st.out = n(p[6]!); break; } }
  if (!st.asOf || st.int == null || !st.through) throw new Error("not a loan statement");
  return st;
}
export async function propStmtLoad(p: P, file: Blob): Promise<void> {
  const d = E().data();
  let st0: ReturnType<typeof propStmtParse>;
  try { st0 = propStmtParse(await pdfLines(file)); } catch (e) { console.warn("loan statement", e); toast("Couldn't read that PDF as a loan statement."); return; }
  const P = (x: number | undefined): Paise | undefined => (x == null ? x : Math.round(x * 100));
  const st = { ...st0, prin: P(st0.prin), int: P(st0.int), pemi: P(st0.pemi), chg: P(st0.chg), ...(st0.out != null ? { out: P(st0.out) } : {}) };
  const old = p.stmt;
  openSheet("Loan statement", `<div class="kv" style="margin-top:0"><span>Statement date</span><b>${fmtD(d, st.asOf!)}</b><span>Loan account</span><b>${esc(st.acct || "—")}</b><span>Last EMI in it</span><b>${mLabel(st.through!)}</b>
    <span>EMI interest</span><b>${rs0(num(st.int))}</b><span>Pre-EMI interest</span><b>${rs0(num(st.pemi))}</b><span>Principal repaid</span><b>${rs0(num(st.prin))}</b><span>Charges</span><b>${rs0(num(st.chg))}</b><span>Principal outstanding</span><b>${st.out != null ? rs0(st.out) : "—"}</b></div>
    <p class="note">${old ? `Replaces the statement of ${fmtD(d, old.asOf ?? "")}. ` : ""}Interest up to ${mLabel(st.through!)} will use these figures; later EMIs are worked out from the loan.</p>
    <div class="btns"><button class="btn pri" id="sv" type="button">Use these figures</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    $s(s, "sv").onclick = () => { if (old && (old.asOf ?? "") > (st.asOf ?? "")) { toast("That statement is older than the one already loaded."); return; } closeModal(); E().write([W("props", { ...fresh(p.id), stmt: st })]); toast("Statement figures saved"); };
  });
}

/** The property page's buttons and rows, and a property's row on Pay by Tuesday. */
export function propAct(d: MoneyData, x: DOMStringMap): boolean {
  const st = S(), pid = st?.propId as string | undefined;
  if (x.pact !== undefined) {
    if (x.pact === "newprop") { propForm(); return true; }
    if (x.pact === "cats") { propCatsSheet(); return true; }
    const p = pid ? d.byId<P>("props", pid) : undefined; if (!p) return true;
    switch (x.pact) {
      case "edit": propForm({ ...p }); return true;
      case "add": propItemForm(p); return true;
      case "pick": propPickForm(p); return true;
      case "planadd": propPlanForm(p); return true;
      case "planest": propPlanEstimates(p); return true;
      case "planfund": propFundForm(p); return true;
    }
    return false;   // planpdf / stmt: the page opens its file picker
  }
  if (x.pplan !== undefined) { const p = pid ? d.byId<P>("props", pid) : undefined, r = p && (p.plan || []).find((y) => y.id === x.pplan); if (p && r) propPlanForm(p, { ...r }); return true; }
  if (x.pitem !== undefined) { const it = d.byId<Item>("propItems", x.pitem), p = it?.prop ? d.byId<P>("props", it.prop) : undefined; if (p && it) propItemForm(p, { ...it }); return true; }
  if (x.ptpay !== undefined) {
    const o = obligations(d, 21).find((y) => y.key === x.ptpay) as (ReturnType<typeof obligations>[number] & { prop?: string; rowId?: string; tds?: boolean }) | undefined;
    if (!o || o.src !== ("pp" as never)) return false;
    const p = d.byId<P>("props", o.prop!), row = (p?.plan || []).find((r) => r.id === o.rowId); if (p && row) propPlanPay(p, row, o as never); return true;
  }
  return false;
}
