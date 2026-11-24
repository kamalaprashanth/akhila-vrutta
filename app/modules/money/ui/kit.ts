/**
 * The money screens' sheets and form fields, as in KP Money Planner (same markup, so its styles apply):
 * a bottom sheet with a scrim, fields with ₹ inputs that group digits Indian-style as you type (with
 * lakh / crore underneath), Money Manager-style category and account pickers, a confirm step, toasts.
 * Sheets live in their own layer (#mvLayer) above the app's tabs and + button.
 */
import { esc } from "../../../core/dom.ts";
import type { MoneyData, Paise, Rec } from "../calc/data.ts";
import { balances, type Account } from "../calc/accounts.ts";
import { catName } from "../calc/plan.ts";
import { money } from "../views/txlist.ts";

export const $ = <T extends HTMLElement = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T[] => [...root.querySelectorAll<T>(sel)];

/* ---------- the layer, sheets, toasts ---------- */
let layer: HTMLElement | null = null;
const listeners = new Set<(open: boolean) => void>();
/** Called when a sheet opens or closes (the app hides its + button and blurs behind). */
export const onSheet = (fn: (open: boolean) => void): void => { listeners.add(fn); };

export function ensureLayer(): HTMLElement {
  if (layer) return layer;
  layer = document.createElement("div");
  layer.id = "mvLayer";
  layer.className = "mv";
  layer.innerHTML = '<div id="modal"></div>';
  document.body.appendChild(layer);
  layer.addEventListener("input", inrInput, true);
  new MutationObserver(() => { const open = !!$("#mvLayer #modal")?.firstElementChild; for (const f of listeners) f(open); })
    .observe(layer.querySelector("#modal")!, { childList: true });
  return layer;
}
const modal = (): HTMLElement => ensureLayer().querySelector<HTMLElement>("#modal")!;
export const sheetOpen = (): boolean => !!modal().firstElementChild;

export function toast(t: string): void {
  const d = document.createElement("div");
  d.className = "toast";
  d.setAttribute("role", "status");
  d.textContent = t;
  ensureLayer().appendChild(d);
  window.setTimeout(() => d.remove(), 3800);
}
export function closeModal(): void { modal().innerHTML = ""; }

/** Hooks run after a sheet is drawn (pickers attach themselves to the fields they know). */
let afterOpen: ((sheet: HTMLElement) => void) | null = null;
export const setAfterOpen = (f: (sheet: HTMLElement) => void): void => { afterOpen = f; };

export function openSheet(title: string, bodyHtml: string, onMount?: (s: HTMLElement) => void): void {
  modal().innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${bodyHtml}</div></div>`;
  $("#scrim")!.addEventListener("click", (e) => { if ((e.target as HTMLElement).id === "scrim") closeModal(); });
  const s = modal().querySelector<HTMLElement>(".sheet")!;
  onMount?.(s);
  afterOpen?.(s);
  const f = modal().querySelector<HTMLElement>("input, select");
  f?.focus({ preventScroll: true });
}
export function askConfirm(msg: string, yesLbl: string, fn: () => void): void {
  openSheet("Are you sure?", `<p>${esc(msg)}</p><div class="btns"><button class="btn danger" id="cy" type="button">${esc(yesLbl)}</button><button class="btn" id="cn" type="button">Cancel</button></div>`, (s) => {
    s.querySelector<HTMLElement>("#cy")!.onclick = () => { closeModal(); fn(); };
    s.querySelector<HTMLElement>("#cn")!.onclick = closeModal;
  });
}

/* ---------- ₹ inputs ---------- */
export const isInrField = (id: string, label: string, kind: string): boolean =>
  kind === "number" && ((/₹/.test(label) && !/per \$1|per unit/i.test(label)) || /^(sa\d+)$/.test(id));
export function inrFmt(raw: unknown): string {
  let s = String(raw ?? "").replace(/[^\d.\-]/g, "");
  if (!s) return "";
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  const [i = "", ...r] = s.split("."), d = r.join("");
  const n = i.replace(/^0+(?=\d)/, "");
  return (neg ? "-" : "") + (n ? (+n).toLocaleString("en-IN") : r.length ? "0" : "") + (s.includes(".") ? "." + d.slice(0, 2) : "");
}
export const inrWords = (n: number): string => {
  n = Math.abs(n);
  return n >= 1e7 ? `${(n / 1e7).toFixed(2).replace(/\.?0+$/, "")} crore` : n >= 1e5 ? `${(n / 1e5).toFixed(2).replace(/\.?0+$/, "")} lakh` : "";
};
function inrInput(e: Event): void {
  const i = e.target as HTMLInputElement;
  if (!i.matches || !i.matches("input[data-inr]")) return;
  const pos = i.selectionStart ?? i.value.length, keep = i.value.slice(0, pos).replace(/[^\d.\-]/g, "").length, f = inrFmt(i.value);
  if (f !== i.value) {
    i.value = f;
    let c = 0, k = 0;
    while (c < f.length && k < keep) { if (/[\d.\-]/.test(f[c]!)) k++; c++; }
    try { i.setSelectionRange(c, c); } catch { /* not a text input */ }
  }
  inrHint(i);
}
export function inrHint(i: HTMLInputElement): void {
  const w = i.closest(".f");
  if (!w) return;
  let h = w.querySelector<HTMLElement>(".inrh");
  const n = parseFloat(i.value.replace(/,/g, "")) || 0, t = inrWords(n);
  if (!t) { if (h) h.textContent = ""; return; }
  if (!h) { h = document.createElement("div"); h.className = "inrh"; (i.closest(".negwrap") ?? i).after(h); }
  h.textContent = "₹ " + t;
}
/** Paise as a rupee value for a form field (12345 → "123.45", 500000 → "5000"). */
export const rs = (p: unknown): string | number => (p === undefined || p === null || p === "" ? "" : Number(p) / 100);

/* ---------- fields ---------- */
export interface FieldOpts { value?: unknown; options?: [string, string][]; step?: string; ph?: string; hint?: string; neg?: boolean | number; hide?: boolean; list?: string }
export type FieldDef = [id: string, label: string, kind: string, opts?: FieldOpts];
export function field([id, label, kind0, o = {}]: FieldDef): string {
  const inr = isInrField(id, label, kind0), kind = inr ? "text" : kind0;
  const v = inr ? inrFmt(o.value ?? "") : (o.value ?? "");
  let inp: string;
  if (kind === "select") inp = `<select id="f_${id}">${(o.options ?? []).map(([val, l]) => `<option value="${esc(val)}" ${String(val) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  else if (kind === "textarea") inp = `<textarea id="f_${id}">${esc(v)}</textarea>`;
  else inp = `<input id="f_${id}" type="${kind}" value="${esc(v)}" ${o.step ? `step="${o.step}"` : ""} ${o.ph ? `placeholder="${esc(o.ph)}"` : ""} ${kind === "number" || inr ? 'inputmode="decimal"' : ""} ${inr ? "data-inr" : ""} ${o.list ? `list="${o.list}"` : ""}>`;
  if (o.neg) inp = `<div class="negwrap">${inp}<button type="button" class="btn negbtn" data-neg="f_${id}" aria-label="Switch between minus and plus">− / +</button></div>`;
  return `<div class="f" id="w_${id}" ${o.hide ? "hidden" : ""}><label for="f_${id}">${esc(label)}</label>${inp}${o.hint ? `<div class="hint">${esc(o.hint)}</div>` : ""}</div>`;
}
/** A field's value (₹ fields without their commas), trimmed. */
export const val = (id: string): string => {
  const e = document.querySelector<HTMLInputElement>(`#mvLayer #f_${id}`);
  return e ? (e.hasAttribute("data-inr") ? e.value.replace(/,/g, "") : e.value).trim() : "";
};
/** Rupees typed → paise (NaN if not a number), the way the planner read them (parseFloat, then rounded). */
export const paiseOf = (s: string): Paise => Math.round(parseFloat(s) * 100);

/* the − / + button: phone keypads often have no minus key */
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("#mvLayer [data-neg]");
  if (!b) return;
  const i = document.getElementById(b.dataset.neg!) as HTMLInputElement | null;
  if (!i) return;
  const v = parseFloat(i.value.replace(/,/g, ""));
  if (isNaN(v) || v === 0) { toast("Type the amount first, then tap − / +."); i.focus(); return; }
  i.value = String(Math.round(-v * 100) / 100);
  i.dispatchEvent(new Event("input", { bubbles: true }));
});

/* ---------- categories ---------- */
interface Category extends Rec { name: string; kind?: string; parentId?: string | null }
export function catTree(d: MoneyData, kind?: string): { c: Category; subs: Category[] }[] {
  const all = d.live<Category>("categories").filter((c) => !kind || c.kind === kind), ids = new Set(all.map((c) => c.id));
  const tops = all.filter((c) => !c.parentId || !ids.has(c.parentId)).sort((a, b) => a.name.localeCompare(b.name));
  return tops.map((t) => ({ c: t, subs: all.filter((s) => s.parentId === t.id).sort((a, b) => a.name.localeCompare(b.name)) }));
}
export const catOpts = (d: MoneyData, kind?: string): [string, string][] =>
  catTree(d, kind).flatMap(({ c, subs }) => [[c.id, c.name] as [string, string], ...subs.map((s) => [s.id, `${c.name} › ${s.name}`] as [string, string])]);
export const ACC_LBL: Record<string, string> = { bank: "Bank", card: "Credit card", cash: "Cash", wallet: "Wallet", invest: "Investment account", loan: "Loan / person" };
export const accOpts = (d: MoneyData, blankLbl?: string, keep?: string): [string, string][] =>
  [...(blankLbl ? [["", blankLbl] as [string, string]] : []),
    ...d.live<Account & { hidden?: boolean }>("accounts").filter((a) => !a.hidden || a.id === keep).map((a) => [a.id, `${a.name} · ${ACC_LBL[String(a.type)] || a.type}`] as [string, string])];

interface Txn extends Rec { date?: string; categoryId?: string; accountId?: string; toAccountId?: string }
const newestFirst = (d: MoneyData): Txn[] => [...d.live<Txn>("txns")].sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.updatedAt) - Number(a.updatedAt));

/** Money Manager-style category picker over the hidden #f_categoryId select. */
export function attachCatPicker(d: MoneyData, sheet: HTMLElement): void {
  const sel = sheet.querySelector<HTMLSelectElement>("#f_categoryId")!;
  sel.hidden = true;
  sel.insertAdjacentHTML("afterend", `<button type="button" class="cpbtn" id="cp_btn" aria-expanded="false"><span id="cp_lbl"></span><span aria-hidden="true">▾</span></button>
    <div class="cppanel" id="cp_panel" hidden><input type="search" id="cp_q" placeholder="Search categories" autocomplete="off"><div id="cp_body"></div></div>`);
  const btn = sheet.querySelector<HTMLElement>("#cp_btn")!, panel = sheet.querySelector<HTMLElement>("#cp_panel")!, q = sheet.querySelector<HTMLInputElement>("#cp_q")!, body = sheet.querySelector<HTMLElement>("#cp_body")!;
  let parent: string | null = null;
  const ids = (): Set<string> => new Set([...sel.options].map((o) => o.value));
  const label = (): void => { sheet.querySelector("#cp_lbl")!.textContent = sel.value ? catName(d, sel.value) : (sel.selectedOptions[0]?.textContent || "Choose a category"); };
  const allOpt = [...sel.options].find((o) => o.value === "" && o.textContent !== "Choose a category");
  const tree = (): { c: Category; subs: Category[] }[] => { const ok = ids(); return catTree(d).filter(({ c }) => ok.has(c.id)).map(({ c, subs }) => ({ c, subs: subs.filter((x) => ok.has(x.id)) })); };
  const recent = (): string[] => {
    const ok = ids(), out: string[] = [];
    for (const t of newestFirst(d)) { if (t.categoryId && ok.has(t.categoryId) && !out.includes(t.categoryId)) out.push(t.categoryId); if (out.length >= 6) break; }
    return out;
  };
  const item = (id: string, txt: string, more?: boolean): string => `<button type="button" class="cpi ${id === sel.value ? "on" : ""}" data-cpick="${esc(id)}" ${more ? `data-cpar="${esc(id)}"` : ""}>${esc(txt)}${more ? ' <span class="cpm">›</span>' : ""}</button>`;
  const draw = (): void => {
    const term = q.value.trim().toLowerCase();
    if (term) {
      const hits: [string, string][] = [];
      for (const { c, subs } of tree()) {
        if (c.name.toLowerCase().includes(term)) hits.push([c.id, c.name]);
        for (const x of subs) if (x.name.toLowerCase().includes(term) || c.name.toLowerCase().includes(term)) hits.push([x.id, `${c.name} › ${x.name}`]);
      }
      body.innerHTML = hits.length ? `<div class="cplist">${hits.slice(0, 40).map(([id, t]) => `<button type="button" class="cprow" data-cpick="${esc(id)}">${esc(t)}</button>`).join("")}</div>` : '<p class="note">No category matches. Add one under Setup.</p>';
      return;
    }
    if (parent) {
      const p = tree().find((x) => x.c.id === parent);
      if (!p) { parent = null; return draw(); }
      body.innerHTML = `<button type="button" class="btn sm" data-cpback="1" style="margin-bottom:8px">‹ All categories</button>
        <div class="cpgrid">${item(p.c.id, `${p.c.name} (general)`)}${p.subs.map((x) => item(x.id, x.name)).join("")}</div>`;
      return;
    }
    const rec = recent();
    body.innerHTML = `${rec.length ? `<p class="cphd">Recent</p><div class="cpchips">${rec.map((id) => `<button type="button" class="chip mute" data-cpick="${esc(id)}" style="border:0;cursor:pointer">${esc(catName(d, id))}</button>`).join("")}</div>` : ""}
      ${allOpt ? `<div class="cpchips"><button type="button" class="chip ${sel.value ? "mute" : ""}" data-cpick="" style="border:0;cursor:pointer">${esc(allOpt.textContent)}</button></div>` : ""}
      <p class="cphd">All categories</p><div class="cpgrid">${tree().map(({ c, subs }) => item(c.id, c.name, subs.length > 0)).join("")}</div>`;
  };
  const open = (v: boolean): void => {
    panel.hidden = !v; btn.setAttribute("aria-expanded", String(v));
    if (v) { parent = null; q.value = ""; draw(); q.focus({ preventScroll: true }); panel.scrollIntoView({ block: "nearest" }); }
  };
  btn.onclick = () => open(!!panel.hidden);
  q.oninput = draw;
  q.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); body.querySelector<HTMLElement>("[data-cpick]")?.click(); }
    if (e.key === "Escape") { e.stopPropagation(); open(false); btn.focus(); }
  };
  body.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.cpback) { parent = null; return draw(); }
    if (b.dataset.cpar) { parent = b.dataset.cpar; return draw(); }
    if ("cpick" in b.dataset) { sel.value = b.dataset.cpick!; label(); open(false); }
  };
  new MutationObserver(() => { label(); if (!panel.hidden) draw(); }).observe(sel, { childList: true });
  label();
}

/** Account picker over a hidden account <select>: bank accounts and cards in groups, balances, search, recent. */
export function attachAccPicker(d: MoneyData, sheet: HTMLElement, sel: HTMLSelectElement): void {
  const k = sel.id;
  sel.hidden = true;
  sel.insertAdjacentHTML("afterend", `<button type="button" class="cpbtn" id="ap_btn_${k}" aria-expanded="false"><span class="aplbl"></span><span aria-hidden="true">▾</span></button>
    <div class="cppanel" hidden><input type="search" placeholder="Search accounts" autocomplete="off"><div class="apbody"></div></div>`);
  const btn = sheet.querySelector<HTMLElement>("#ap_btn_" + k)!, panel = btn.nextElementSibling as HTMLElement, q = panel.querySelector("input")!, body = panel.querySelector<HTMLElement>(".apbody")!;
  panel.dataset.for = btn.id;
  panel.style.marginBottom = "12px";
  const host = sel.closest(".grid2");
  if (host) host.insertAdjacentElement("afterend", panel);
  const bal = balances(d);
  type O = { v: string; a: Account | null; t: string };
  const opts = (): O[] => [...sel.options].map((o) => ({ v: o.value, a: o.value ? d.byId<Account>("accounts", o.value) ?? null : null, t: o.textContent ?? "" }));
  const nameOf = (o: O): string => (o.a ? String(o.a.name) : o.t);
  const label = (): void => {
    const o = opts().find((x) => x.v === sel.value);
    btn.querySelector(".aplbl")!.innerHTML = o ? (o.a ? `${esc(o.a.name)} <span class="apsub">${o.a.type === "card" ? "Card" : ACC_LBL[String(o.a.type)]} · ${money(bal.get(o.a.id) || 0)}</span>` : esc(o.t)) : "Choose an account";
  };
  const recent = (): string[] => {
    const ok = new Set(opts().filter((o) => o.a).map((o) => o.v)), out: string[] = [];
    for (const t of newestFirst(d)) { for (const id of [t.accountId, t.toAccountId]) if (id && ok.has(id) && !out.includes(id)) out.push(id); if (out.length >= 4) break; }
    return out.slice(0, 4);
  };
  const row = (o: O): string => {
    const v = o.a ? bal.get(o.a.id) || 0 : null;
    return `<button type="button" class="aprow ${o.v === sel.value ? "on" : ""}" data-apick="${esc(o.v)}"><span>${esc(nameOf(o))}</span>${o.a ? `<span class="amt ${v! < 0 ? "neg" : ""}">${money(v!)}</span>` : ""}</button>`;
  };
  const draw = (): void => {
    const term = q.value.trim().toLowerCase(), all = opts();
    if (term) { const hits = all.filter((o) => nameOf(o).toLowerCase().includes(term)); body.innerHTML = hits.length ? `<div class="aplist">${hits.map(row).join("")}</div>` : '<p class="note">No account matches.</p>'; return; }
    const none = all.filter((o) => !o.a && !o.v.startsWith("@")), sp = all.filter((o) => o.v.startsWith("@")), banks = all.filter((o) => o.a && o.a.type !== "card"), cards = all.filter((o) => o.a && o.a.type === "card"), rec = recent();
    const sec = (h: string, list: O[]): string => (list.length ? `<p class="cphd">${h}</p><div class="aplist">${list.map(row).join("")}</div>` : "");
    body.innerHTML = `${rec.length && all.length > 6 ? `<p class="cphd">Recent</p><div class="cpchips">${rec.map((id) => `<button type="button" class="chip mute" data-apick="${esc(id)}" style="border:0;cursor:pointer">${esc(d.byId<Account>("accounts", id)!.name)}</button>`).join("")}</div>` : ""}
      ${sec("", none)}${sec("Bank accounts", banks)}${sec("Credit cards", cards)}${sec("No balance kept", sp)}`;
  };
  const open = (v: boolean): void => {
    for (const pn of sheet.querySelectorAll<HTMLElement>(".cppanel")) if (pn !== panel && !pn.hidden) { pn.hidden = true; sheet.querySelector("#" + (pn.dataset.for || "cp_btn"))?.setAttribute("aria-expanded", "false"); }
    panel.hidden = !v; btn.setAttribute("aria-expanded", String(v));
    if (v) { q.value = ""; draw(); if (opts().length > 8) q.focus({ preventScroll: true }); panel.scrollIntoView({ block: "nearest" }); }
  };
  btn.onclick = () => open(!!panel.hidden);
  q.oninput = draw;
  q.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); body.querySelector<HTMLElement>("[data-apick]")?.click(); }
    if (e.key === "Escape") { e.stopPropagation(); open(false); btn.focus(); }
  };
  body.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-apick]");
    if (!b) return;
    e.stopPropagation();
    sel.value = b.dataset.apick!;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    label();
    open(false);
  };
  new MutationObserver(label).observe(sel, { childList: true });
  label();
}

/** Pickers for the fields the planner gave them to (as its openSheet did). */
export function attachPickers(d: MoneyData, sheet: HTMLElement): void {
  if (sheet.querySelector("#f_categoryId")) attachCatPicker(d, sheet);
  for (const id of ["f_accountId", "f_toAccountId", "f_payFrom", "f_ownAcc"]) {
    const el = sheet.querySelector<HTMLSelectElement>("#" + id);
    if (el && el.tagName === "SELECT") attachAccPicker(d, sheet, el);
  }
}
