/**
 * Help inside the app (approved design, 27 Nov 2026): the short note on top of each page and the Get started
 * checklist, for new users only; the words you can tap, for everyone.
 *
 * What's remembered, per account: settings/help { tips, hide: [tip keys hidden], start: false when the
 * checklist was hidden, seen: ["cashflow"] }. A new account gets tips: true when it's made; an account that
 * set Money up with a fresh start counts as new too. Help › "Show page explanations" turns them on or off.
 */
import { ctx } from "./app.ts";
import { html, raw } from "./dom.ts";
import { META, type Rec } from "./store.ts";
import { WORDS, tipFor } from "./help.ts";
import { wordSheet } from "./helpview.ts";
import { closeModal, ensureLayer, openSheet } from "./ui.ts";

export interface HelpRec extends Rec { tips?: boolean; hide?: string[]; start?: boolean; seen?: string[] }
const C = "settings", ID = "help";
export const helpLink = (id: string): string => `#/help/${id}`;
export const helpRec = (): HelpRec => (ctx.store?.get(C, ID) as HelpRec | undefined) ?? { id: ID };
const save = (r: HelpRec): void => { ctx.store?.writeMany([{ c: C, id: ID, r: { ...r, id: ID, updatedAt: Date.now() } }]); };

/** Page notes and the checklist: on for a new account (or one that turned them on in Help). */
export function tipsOn(): boolean {
  const r = helpRec();
  if (r.tips !== undefined) return r.tips;
  return (ctx.store?.get(META, "money") as { source?: string } | undefined)?.source === "Fresh start";
}
/** Turns the notes on (all of them, and the checklist, again) or off. */
export const setTips = (on: boolean): void => save({ ...helpRec(), tips: on, ...(on ? { hide: [], start: true } : {}) });
/** A new account: notes on from the start. */
export const newAccountTips = (): void => { if (helpRec().tips === undefined) save({ ...helpRec(), tips: true }); };
export const hideStart = (): void => save({ ...helpRec(), start: false });
export const startShown = (): boolean => tipsOn() && helpRec().start !== false;
/** Remembers that a page was visited (the checklist's "Look ahead"). */
export function markSeen(k: string): void { const r = helpRec(); if (tipsOn() && !(r.seen ?? []).includes(k)) save({ ...r, seen: [...(r.seen ?? []), k] }); }
export const wasSeen = (k: string): boolean => (helpRec().seen ?? []).includes(k);

const INFO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01"/></svg>';
/** The note for a page ("money:plan:regular", "household:due"…), or "" when there's none or it's off. */
export function tipHtml(key: string): string {
  if (!tipsOn()) return "";
  const t = tipFor(key);
  if (!t || (helpRec().hide ?? []).includes(t.key)) return "";
  // tip text is written in help.ts (<b> only)
  return html`<div class="avtip" data-tipkey="${t.key}">${raw(INFO)}<div class="avtipt">${raw(t.tip.text)} <a href="${helpLink(t.tip.more)}">Learn more ›</a></div><button type="button" class="avtipx" data-tiphide="${t.key}">Hide</button></div>`;
}
/** Puts the page's note on top of a page: after its first row of tabs, else at the top of its content. */
export function addTip(root: HTMLElement, key: string): void {
  const h = tipHtml(key);
  if (!h || root.querySelector(".avtip")) return;
  const seg = root.querySelector(":scope .wrap > .seg, :scope > .seg");
  const at = seg ?? root.querySelector(":scope .wrap") ?? root;
  at.insertAdjacentHTML(seg ? "afterend" : "afterbegin", h);
}

/** What the checklist's and Regular's buttons do (Money sets it: open a page, a form). */
let go: (k: string) => void = () => {};
export const setHelpGo = (f: (k: string) => void): void => { go = f; };

/** The sheet for a word. */
export function showWord(id: string): void {
  const w = WORDS[id];
  if (!w) return;
  ensureLayer();
  openSheet(w.word, wordSheet(w, helpLink), (s) => {
    s.querySelector<HTMLElement>("#cx")!.onclick = closeModal;
    s.querySelector<HTMLAnchorElement>("#hlpMore")?.addEventListener("click", (e) => { e.preventDefault(); const to = (e.currentTarget as HTMLAnchorElement).getAttribute("href")!; closeModal(); location.hash = to; });
  });
}

let installed = false;
/** Taps on words, Hide on a note, and the checklist's buttons, anywhere in the app (before the page's own handlers). */
export function installHelp(): void {
  if (installed) return;
  installed = true;
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const w = t.closest<HTMLElement>("[data-term]"), hide = t.closest<HTMLElement>("[data-tiphide]"), g = t.closest<HTMLElement>("[data-hgo]");
    if (!w && !hide && !g) return;
    e.preventDefault(); e.stopPropagation();
    if (w) showWord(w.dataset.term!);
    else if (hide) {
      const r = helpRec(), k = hide.dataset.tiphide!;
      save({ ...r, hide: [...new Set([...(r.hide ?? []), k])] });
      hide.closest(".avtip")?.remove();
    } else if (g) go(g.dataset.hgo!);
  }, true);
}
