/**
 * The Transactions page: drawn by Akhila Vrutta from the encrypted store (paise). Its state (filter, month,
 * selection) is the planner's shared page state, which the planner's other pages also set when they link here.
 */
import { addM, todayOf } from "../calc/dates.ts";
import { MoneyData, type Rec } from "../calc/data.ts";
import { activityHtml, blankFilter, txMatches, type TxFilter, type TxState } from "./txlist.ts";
import type { Page } from "./pages.ts";
import { carrySheet, txnForm } from "../ui/txform.ts";
import { bulkAct, cleanupSheet, txFilterSheet } from "../ui/txsheets.ts";
import type { Tx } from "./txlist.ts";

/** The planner's state object (shared, live). */
export interface PlannerState extends TxState { view: string; f: TxFilter; sel?: Set<string> }

let qTimer = 0, keepFocus = false;
export const txPage: Page = {
  html(d, h) {
    const S = h.state();
    S.f = S.f || blankFilter();
    return activityHtml(d, { f: S.f, month: S.month, txLimit: S.txLimit, selOn: S.selOn, sel: S.sel });
  },
  after(root) {
    if (!keepFocus) return;
    keepFocus = false;
    const el = root.querySelector<HTMLInputElement>("#txq");
    if (el) { el.focus({ preventScroll: true }); el.setSelectionRange(el.value.length, el.value.length); }
  },
  act(el, h, redraw) {
    const s = h.state(), d = el.dataset, f = s.f;
    const reset = (): void => { s.txLimit = 0; redraw(); };
    if (d.tx !== undefined) {
      const t = h.data().byId<Tx>("txns", d.tx);
      if (s.selOn) {
        if (!t || t.type === "carry") return;
        s.sel = s.sel || new Set();
        if (s.sel.has(d.tx)) s.sel.delete(d.tx); else s.sel.add(d.tx);
        return redraw();
      }
      if (t && t.type === "carry") return carrySheet(t);
      if (t && ["expense", "income", "transfer", "investment"].includes(String(t.type))) return txnForm({ ...t });
      return false;   // loan entries, EPF / PPF lines and trades: the planner opens them
    }
    if (d.ftag !== undefined) { f.tag = f.tag === d.ftag ? "" : d.ftag; return reset(); }
    if (d.ftype !== undefined) { f.type = d.ftype; return reset(); }
    if (d.fcat !== undefined) { f.cat = d.fcat; return reset(); }
    if (d.fclear !== undefined) {
      const k = d.fclear;
      if (k === "all") s.f = blankFilter(f.type);
      else if (k === "period") { f.period = "month"; f.from = f.to = ""; }
      else if (k === "amt") { f.min = f.max = ""; }
      else if (k === "uncat") f.uncat = false;
      else (f as unknown as Record<string, string>)[k] = "";
      return reset();
    }
    if (d.view !== undefined) {
      const v = h.data().byId<Rec & { f?: Partial<TxFilter> }>("views", d.view);
      if (v) { s.f = { ...blankFilter(), ...v.f }; reset(); }
      return;
    }
    if (d.bulk !== undefined) {
      if (d.bulk === "all") {
        const data = h.data();
        s.sel = s.sel || new Set();
        for (const t of data.live<Rec & { type?: string }>("txns")) if (txMatches(data, t, f, s.month) && t.type !== "carry") s.sel.add(t.id);
        return redraw();
      }
      return bulkAct(d.bulk);
    }
    if (d.m !== undefined) { s.month = addM(s.month, Number(d.m)); return redraw(); }
    switch (el.id) {
      case "txFilters": return txFilterSheet();
      case "txClean": return cleanupSheet();
      case "txSel": s.selOn = true; s.sel = s.sel || new Set(); s.sel.clear(); return redraw();
      case "txMore": s.txLimit = (s.txLimit || 300) + 300; return redraw();
    }
    return false;
  },
  input(t, h, redraw) {
    if (t.id !== "txq") return false;
    window.clearTimeout(qTimer);
    qTimer = window.setTimeout(() => { h.state().f.q = t.value.trim(); h.state().txLimit = 0; keepFocus = true; redraw(); }, 250);
  },
  change(t, h, redraw) {
    if (t.id === "mpick" && /^\d{4}-\d{2}$/.test(t.value)) { h.state().month = t.value; redraw(); }
  },
};

/** The stored money data as the calculations read it. */
export function moneyData(all: (c: string) => Rec[], collections: readonly string[]): MoneyData {
  const cols: Record<string, Rec[]> = {};
  for (const c of collections) cols[c] = all(c);
  return new MoneyData(cols, todayOf());
}
