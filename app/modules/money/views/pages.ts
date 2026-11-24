/**
 * Money pages drawn by Akhila Vrutta. Each page builds its HTML from the stored data and the planner's shared
 * page state, and handles its own taps; any tap it doesn't handle yet (a form or page still in the planner)
 * is passed to the planner as if it had been tapped there.
 */
import type { MoneyData } from "../calc/data.ts";
import { dress } from "./txlist.ts";
import { resetCharts } from "./charts.ts";
import type { PlannerState } from "./transactions.ts";

export interface PageHost {
  data(): MoneyData;
  state(): PlannerState & Record<string, unknown>;
  pref<T>(k: string, d: T): T;
  prefSet(k: string, v: unknown): void;
  /** HTML only the planner can draw yet (prices status line). */
  plannerHtml(name: string): string;
  /** Passes a tap to the planner (its data-* attributes and id). */
  plannerClick(attrs: Record<string, string>): void;
  /** Goes to another money page. */
  go(view: string): void;
  /** Hands files to the planner (tradebook import). */
  plannerFiles(name: string, files: File[]): void;
  /** Runs one of the planner's functions that saves something (goals from the profile). */
  plannerCall(name: string): void;
  toast(t: string): void;
}
export interface Page {
  html(d: MoneyData, h: PageHost): string;
  /** Handles a tap; false: not handled here (passed to the planner). */
  act?(el: HTMLElement, h: PageHost, redraw: () => void): boolean | void;
  change?(el: HTMLInputElement, h: PageHost, redraw: () => void): boolean | void;
  input?(el: HTMLInputElement, h: PageHost, redraw: () => void): boolean | void;
  /** Runs after the page is drawn (e.g. keep focus in a search box). */
  after?(root: HTMLElement, h: PageHost): void;
}

const KEYS = "[data-tx],[data-hold],[data-rec],[data-loan],[data-acc],[data-card]";
const keyOf = (e: Element): string | null => e.getAttribute("data-tx") || e.getAttribute("data-hold") || e.getAttribute("data-rec") || e.getAttribute("data-loan") || e.getAttribute("data-acc") || e.getAttribute("data-card");
/** Everything tappable on a page: data-* targets, buttons with an id, role=button rows. */
const TAP = "[data-ins],[data-hm],[data-hmt],[data-hmo],[data-hmo2],[data-yr],[data-ytab],[data-taxfy],[data-trn],[data-trp],[data-trd],[data-ymc],[data-day],[data-mi],[data-cat],[data-insopen],[data-ptnext],[data-ptgo],[data-ptpay],[data-invpay],[data-invall],[data-hyr],[data-homem],[data-pt],[data-h],[data-bcm],[data-bcd],[data-repign],[data-repadd],[data-pay],[data-miss],[data-undo],[data-cpay],[data-rec],[data-goal],[data-emcat],[data-holi],[data-ptmove],[data-ptaside],[data-acct],[data-nwn],[data-hg],[data-hgo],[data-po],[data-card],[data-loan],[data-acc],[data-hold],[data-prop],[data-pact],[data-ym],[data-tx],[data-ftag],[data-ftype],[data-fcat],[data-fclear],[data-view],[data-bulk],[data-m],[data-go],[data-ins],button[id],[role=button]";

export function mountPages(box: HTMLElement, pages: Record<string, Page>, host: PageHost) {
  const view = (): HTMLElement => box.querySelector<HTMLElement>("#view")!;
  let shownView = "";
  function render(first = false): void {
    const S = host.state();
    const page = pages[S.view];
    if (!page) return;
    const v = view();
    const same = !first && shownView === S.view;
    const before = same ? new Set([...v.querySelectorAll(KEYS)].map(keyOf)) : null;
    resetCharts();
    v.innerHTML = dress(page.html(host.data(), host));
    if (before && before.size) v.querySelectorAll(KEYS).forEach((e) => { if (!before.has(keyOf(e))) e.classList.add("enter"); });
    if (!same) { v.classList.remove("swap"); void v.offsetWidth; v.classList.add("swap"); window.setTimeout(() => v.classList.remove("swap"), 600); box.scrollTop = 0; }
    shownView = S.view;
    page.after?.(v, host);
  }
  const redraw = (): void => render();
  const page = (): Page | undefined => pages[host.state().view];
  const attrsOf = (el: HTMLElement): Record<string, string> => {
    const a: Record<string, string> = {};
    for (const at of el.getAttributeNames()) if (at.startsWith("data-") || at === "id") a[at] = el.getAttribute(at)!;
    return a;
  };
  function act(el: HTMLElement): void {
    const p = page();
    if (!p) return;
    if (p.act && p.act(el, host, redraw) !== false) return;
    const a = attrsOf(el);
    if (Object.keys(a).length) host.plannerClick(a);
  }
  box.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("label[for], input, select, textarea, details > summary")) return;   // native controls behave natively
    // Any button counts too, so nothing tappable is missed (passed to the planner if the page doesn't handle it).
    const el = t.closest<HTMLElement>(TAP) ?? t.closest<HTMLElement>("button");
    if (el && box.contains(el)) act(el);
  });
  box.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if ((e.key === "Enter" || e.key === " ") && t.matches('[role="button"]')) {
      e.preventDefault();
      const lbl = t.matches("label[for]") ? box.querySelector<HTMLInputElement>("#" + t.getAttribute("for")) : null;
      if (lbl) lbl.click(); else act(t);
    }
  });
  box.addEventListener("input", (e) => { page()?.input?.(e.target as HTMLInputElement, host, redraw); });
  box.addEventListener("change", (e) => { page()?.change?.(e.target as HTMLInputElement, host, redraw); });
  return { render };
}
