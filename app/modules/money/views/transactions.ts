/**
 * The Transactions page, drawn by Akhila Vrutta from the encrypted store (paise). The planner still owns
 * the page's state (filter, month, selection: shared with its other pages, which link here) and still
 * opens the forms and sheets (entry form, filters, clean-up, bulk changes) until those move too.
 */
import { addM, todayOf } from "../calc/dates.ts";
import { MoneyData, type Rec } from "../calc/data.ts";
import { activityHtml, blankFilter, dress, txMatches, type TxFilter, type TxState } from "./txlist.ts";

/** The planner's state object (shared, live). */
export interface PlannerState extends TxState { view: string; f: TxFilter; sel?: Set<string> }
export interface TxHost {
  /** The planner's live state, or null before it has started. */
  state(): PlannerState | null;
  /** The stored money data. */
  data(): MoneyData;
  openTx(id: string): void;
  filters(): void;
  cleanup(): void;
  bulk(k: string): void;
}

const KEYS = "[data-tx]";
let shown = false;

export function mountTransactions(box: HTMLElement, host: TxHost): { render(first?: boolean): void } {
  let qTimer = 0;
  const view = (): HTMLElement => box.querySelector<HTMLElement>("#view")!;

  function render(first = false): void {
    const S = host.state();
    if (!S) return;
    S.f = S.f || blankFilter();
    const d = host.data();
    const v = view();
    const before = !first && shown ? new Set([...v.querySelectorAll(KEYS)].map((e) => e.getAttribute("data-tx"))) : null;
    const st: TxState = { f: S.f, month: S.month, txLimit: S.txLimit, selOn: S.selOn, sel: S.sel };
    v.innerHTML = dress(activityHtml(d, st));
    if (before && before.size) v.querySelectorAll(KEYS).forEach((e) => { if (!before.has(e.getAttribute("data-tx"))) e.classList.add("enter"); });
    if (first) { v.classList.remove("swap"); void v.offsetWidth; v.classList.add("swap"); window.setTimeout(() => v.classList.remove("swap"), 600); box.scrollTop = 0; }
    shown = true;
  }

  const S = (): PlannerState => host.state()!;
  const reset = (): void => { S().txLimit = 0; render(); };

  function act(el: HTMLElement): void {
    const s = S(), d = el.dataset, f = s.f;
    if (d.tx !== undefined) {
      if (s.selOn) {
        const t = host.data().byId<Rec & { type?: string }>("txns", d.tx);
        if (!t || t.type === "carry") return;
        s.sel = s.sel || new Set();
        if (s.sel.has(d.tx)) s.sel.delete(d.tx); else s.sel.add(d.tx);
        return render();
      }
      return host.openTx(d.tx);
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
      const v = host.data().byId<Rec & { f?: Partial<TxFilter> }>("views", d.view);
      if (v) { s.f = { ...blankFilter(), ...v.f }; reset(); }
      return;
    }
    if (d.bulk !== undefined) {
      if (d.bulk === "done") { s.selOn = false; s.sel?.clear(); return render(); }
      if (d.bulk === "all") {
        const data = host.data();
        s.sel = s.sel || new Set();
        for (const t of data.live<Rec & { type?: string }>("txns")) if (txMatches(data, t, f, s.month) && t.type !== "carry") s.sel.add(t.id);
        return render();
      }
      return host.bulk(d.bulk);
    }
    if (d.m !== undefined) { s.month = addM(s.month, Number(d.m)); return render(); }
    switch (el.id) {
      case "txFilters": return host.filters();
      case "txClean": return host.cleanup();
      case "txSel": s.selOn = true; s.sel = s.sel || new Set(); s.sel.clear(); return render();
      case "txMore": s.txLimit = (s.txLimit || 300) + 300; return render();
    }
  }
  const TARGETS = "[data-tx],[data-ftag],[data-ftype],[data-fcat],[data-fclear],[data-view],[data-bulk],[data-m],#txFilters,#txClean,#txSel,#txMore";
  box.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(TARGETS);
    if (el && box.contains(el) && host.state()) act(el);
  });
  box.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if ((e.key === "Enter" || e.key === " ") && t.matches('[role="button"]')) { e.preventDefault(); act(t); }
  });
  box.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id !== "txq") return;
    window.clearTimeout(qTimer);
    qTimer = window.setTimeout(() => {
      S().f.q = t.value.trim();
      reset();
      const el = box.querySelector<HTMLInputElement>("#txq");
      if (el) { el.focus({ preventScroll: true }); el.setSelectionRange(el.value.length, el.value.length); }
    }, 250);
  });
  box.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === "mpick" && /^\d{4}-\d{2}$/.test(t.value)) { S().month = t.value; render(); }
  });
  return { render };
}

/** The stored money data as the calculations read it. */
export function moneyData(all: (c: string) => Rec[], collections: readonly string[]): MoneyData {
  const cols: Record<string, Rec[]> = {};
  for (const c of collections) cols[c] = all(c);
  return new MoneyData(cols, todayOf());
}
