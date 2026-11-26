/** Search everything (approved design, 26 Nov 2026): the 🔍 on every page opens it. */
import type { Module } from "../types.ts";
import { html, raw } from "../../core/dom.ts";
import { ctx } from "../../core/app.ts";
import { formatINR } from "../../core/money.ts";
import type { FileRec } from "../../core/files.ts";
import { FILES } from "../../core/store.ts";
import { search as docSearch, fyLabel } from "../documents/data.ts";
import { ownerHash } from "../documents/index.ts";
import { docForm } from "../documents/forms.ts";
import { moneyNow, startMoney } from "../money/index.ts";
import { catName } from "../money/calc/plan.ts";
import { txnForm } from "../money/ui/txform.ts";
import { ensureLayer } from "../money/ui/kit.ts";
import { AREAS, grouped, parse, searchAll, type Area, type Hit, type Reader } from "./data.ts";

const reader = (): Reader => ({ all: (c) => ctx.store?.all(c) ?? [], get: (c, id) => ctx.store?.get(c, id) });
let q = "", area: Area | "All" = "All";
/** This session only: recent searches are never saved anywhere. */
const recent: string[] = [];
const TRY = ["rent", "insurance", "passport", "warranty", "₹5,000", "LDL"];
const ICON: Record<Area, string> = {
  Money: "M3 6h18v14H3zM3 10h18", Household: "M4 11l8-7 8 7v9H4z", Health: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  Papers: "M7 3h7l4 4v14H7zM14 3v4h4", Habits: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM8.5 12.5l2.5 2.5 4.5-5",
};

/** Text with the query's words marked (escaped piece by piece). */
function marked(text: string, words: string[]): string {
  if (!text) return "";
  const lower = text.toLowerCase(), on = new Array<boolean>(text.length).fill(false);
  for (const w of words) for (let i = lower.indexOf(w); i >= 0 && w; i = lower.indexOf(w, i + w.length)) for (let k = i; k < i + w.length; k++) on[k] = true;
  let out = "", i = 0;
  while (i < text.length) { const j0 = i, m = on[i]; while (i < text.length && on[i] === m) i++; const part = html`${text.slice(j0, i)}`; out += m ? `<mark>${part}</mark>` : part; }
  return out;
}

function allHits(): Hit[] {
  const r = reader();
  let d: ReturnType<typeof moneyNow> | null = null;
  try { d = moneyNow(); } catch { d = null; }
  const fileNames = (c: string, id: string): string[] => r.all<FileRec>(FILES).filter((f) => !f.deleted && f.owner?.c === c && f.owner?.id === id).map((f) => f.name);
  const hits = searchAll(r, q, { catName: d ? (id) => catName(d!, id) : undefined, fileNames });
  for (const h of docSearch(r as never, q, (docId) => fileNames("docs", docId))) {
    hits.push({ area: "Papers", key: `d:${h.doc.id}`, title: h.label, sub: [h.info.name, h.doc.validTo ? `valid till ${h.doc.validTo}` : "", h.doc.year ? fyLabel(h.doc.year) : "", h.doc.num4 ? `…${h.doc.num4}` : ""].filter(Boolean).join(" · "), href: ownerHash(h.info.owner), open: { c: "docs", id: h.doc.id } });
  }
  return hits;
}

function results(): string {
  const { words } = parse(q);
  if (q.trim().length < 2) {
    return html`${raw(recent.length ? html`<p class="srh">Recent</p><div class="srcard">${raw(recent.map((x) => html`<button type="button" class="srrec" data-q="${x}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2"/></svg>${x}</button>`).join(""))}</div>` : "")}
      <p class="srh">Try</p><div class="srtry">${raw(TRY.map((x) => html`<button type="button" data-q="${x}">${x}</button>`).join(""))}</div>
      <p class="srnote"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3"/></svg>Searched on this device. Your words never leave it.</p>`;
  }
  const hits = allHits().filter((h) => area === "All" || h.area === area), groups = grouped(hits);
  if (!hits.length) return html`<p class="srnone">Nothing found for “${q}”${area === "All" ? "" : ` in ${area}`}.</p>`;
  const areas = groups.map(([a]) => a);
  return html`<p class="srcount">${String(hits.length)} result${hits.length === 1 ? "" : "s"} in ${areas.length > 1 ? `${areas.slice(0, -1).join(", ")} and ${areas[areas.length - 1]}` : areas[0]!}</p>
    ${raw(groups.map(([a, list]) => html`<section class="srgrp" aria-label="${a}"><p class="srh">${a}</p><div class="srcard">${raw(list.slice(0, 30).map((h) => html`<a class="srrow" href="${h.href}" data-key="${h.key}"><span class="sric"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[h.area]}"/></svg></span><span class="srt"><b>${raw(marked(h.title, words))}</b><span>${raw(marked(h.sub, words))}</span></span>${raw(h.amount != null ? html`<span class="sramt">${formatINR(Math.abs(h.amount))}</span>` : "")}</a>`).join(""))}${raw(list.length > 30 ? html`<p class="srmore">and ${String(list.length - 30)} more: add a word to narrow it down</p>` : "")}</div></section>`).join(""))}`;
}

let rootEl: HTMLElement | null = null;
const drawResults = (): void => { const b = rootEl?.querySelector("#srRes"); if (b) b.innerHTML = results(); };
function remember(): void { const t = q.trim(); if (t.length < 2) return; const i = recent.indexOf(t); if (i >= 0) recent.splice(i, 1); recent.unshift(t); recent.length = Math.min(recent.length, 5); }

function draw(root: HTMLElement): void {
  if (!ctx.store) { root.innerHTML = html`<section class="card"><h2>Search</h2><p>Search opens once the app is unlocked.</p></section>`; return; }
  root.innerHTML = html`<div class="srch">
    <label class="srbox"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input type="search" id="srIn" placeholder="Search everything" aria-label="Search everything" value="${q}" autocomplete="off" enterkeyhint="search"></label>
    <div class="srchips" role="group" aria-label="Look in">${raw((["All", ...AREAS] as const).map((a) => html`<button type="button" data-area="${a}" class="${a === area ? "on" : ""}" aria-pressed="${String(a === area)}">${a}</button>`).join(""))}</div>
    <div id="srRes" aria-live="polite">${raw(results())}</div></div>`;
  const inp = root.querySelector<HTMLInputElement>("#srIn")!;
  let tm = 0;
  inp.addEventListener("input", () => { q = inp.value; clearTimeout(tm); tm = window.setTimeout(drawResults, 150); });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { remember(); inp.blur(); } });
  setTimeout(() => { inp.focus(); inp.setSelectionRange(q.length, q.length); }, 50);
}

function onTap(e: Event): void {
  if (document.body.dataset.mod !== "search") return;
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-q],[data-area],[data-key]");
  if (!el || !rootEl?.contains(el)) return;
  if (el.dataset.q) { q = el.dataset.q; draw(rootEl); return; }
  if (el.dataset.area) { area = el.dataset.area as Area | "All"; draw(rootEl); return; }
  if (el.dataset.key) {
    remember();
    // a transaction or a document opens its own form over its page
    const h = allHits().find((x) => x.key === el.dataset.key);
    if (h?.open?.c === "txns") { e.preventDefault(); const t = ctx.store?.get("txns", h.open.id); location.hash = h.href; if (t) setTimeout(() => txnForm(t as never), 300); }
    else if (h?.open?.c === "docs") { e.preventDefault(); location.hash = h.href; setTimeout(() => docForm(h.open!.id), 300); }
  }
}

export const search: Module = {
  id: "search",
  label: "Search",
  icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  hidden: true,
  render(root) {
    ensureLayer();
    startMoney();
    if (rootEl !== root) { rootEl = root; root.addEventListener("click", onTap); }
    draw(root);
  },
};
