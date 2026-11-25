/**
 * Household: for each home (Money's properties and homes added here), the maintenance that repeats, the
 * appliances with their warranties and files, and the To do and Groceries lists. Same look as Money.
 */
import type { Module } from "../types.ts";
import { html, raw } from "../../core/dom.ts";
import { ctx } from "../../core/app.ts";
import type { Rec } from "../../core/store.ts";
import { setReminderSource, scheduleReminders } from "../../core/reminders.ts";
import { ensureLayer } from "../money/ui/kit.ts";
import { startMoney } from "../money/index.ts";
import { dueChip, dueGroups, dueRows, dayLabel, dayOf, homeName, homes, householdNotes, live, type Appliance, type Item, type Reader } from "./data.ts";
import { applianceForm, doneForm, homeForm, itemForm, jobForm, starterSheet } from "./forms.ts";

export const ICON = "M4 20V9l8-5 8 5v11M9 20v-6h6v6";

/** Which home, which part, which list: remembered on this device. */
interface View { home: string; tab: "due" | "appl" | "lists"; list: "todo" | "grocery" }
const KEY = "av.household";
const view: View = (() => {
  try { return { home: "", tab: "due", list: "todo", ...JSON.parse(localStorage.getItem(KEY) ?? "{}") } as View; } catch { return { home: "", tab: "due", list: "todo" }; }
})();
const keep = (): void => { try { localStorage.setItem(KEY, JSON.stringify(view)); } catch { /* not kept */ } };

export const reader = (): Reader => ({ all: (c) => ctx.store?.all(c) ?? [], get: (c, id) => ctx.store?.get(c, id) });
export const today = (): string => dayOf(new Date());

/** Saves household records and redraws. null moves a record to the trash. */
export function hhWrite(ops: { c: string; r: Rec | null; id?: string }[]): void {
  if (!ctx.store || !ops.length) return;
  ctx.store.writeMany(ops.map((o) => ({ c: o.c, id: o.id ?? o.r!.id, r: o.r ? { ...o.r, updatedAt: Date.now() } : null })));
  redraw();
  scheduleReminders();
}

let rootEl: HTMLElement | null = null;
const redraw = (): void => { if (rootEl && document.body.dataset.mod === "household") draw(rootEl); };

const seg = (items: [string, string, number?][], on: string, attr: string): string =>
  html`<div class="seg" role="group">${items.map(([k, l, n]) => raw(html`<button type="button" data-${raw(attr)}="${k}" aria-pressed="${String(k === on)}">${l}${n != null ? ` · ${n}` : ""}</button>`))}</div>`;
const row = (attrs: string, t: string, s: string, side: string, cls = "tap"): string =>
  html`<div class="row ${cls}" ${raw(attrs)} role="button" tabindex="0"><div class="main"><div class="t">${t}</div>${raw(s ? html`<div class="s">${s}</div>` : "")}</div>${raw(side)}</div>`;
const chip = ([t, c]: [string, string]): string => html`<span class="due ${c}">${t}</span>`;

function dueTab(r: Reader, t: string): string {
  const rows = dueRows(r, t, view.home || undefined), groups = dueGroups(rows, t);
  const hs = view.home ? homes(r).filter((h) => h.id === view.home) : homes(r);
  const noJobs = hs.filter((h) => !live<{ home: string } & Rec>(r, "hhJobs").some((j) => j.home === h.id));
  const attr = (x: (typeof rows)[number]): string => (x.kind === "job" ? `data-job="${x.id}"` : x.kind === "todo" ? `data-item="${x.id}"` : `data-appl="${x.id}"`);
  return html`${raw(groups.map(([g, l]) => html`<div class="sh"><h3>${g}</h3></div><div class="list">${l.map((x) => raw(row(attr(x), x.title, x.sub, chip(dueChip(x, t)))))}</div>`).join(""))}
    ${raw(!rows.length ? html`<div class="empty">Nothing due${view.home ? " for this home" : ""}. Add the jobs that repeat, like AC service or pest control.</div>` : "")}
    ${raw(noJobs.length ? html`<div class="card hhsuggest"><b>Usual jobs</b><p class="note" style="margin:4px 0 8px">${noJobs.length === 1 ? `${noJobs[0]!.name} has no jobs yet.` : `${noJobs.length} homes have no jobs yet.`} Pick the ones that apply.</p><div class="btns">${noJobs.slice(0, 4).map((h) => raw(html`<button class="btn sm" type="button" data-starter="${h.id}">${h.name}</button>`))}</div></div>` : "")}
    <div class="btns" style="margin-top:12px"><button class="btn pri" type="button" id="addJob">+ Add a job</button></div>`;
}

function applTab(r: Reader, t: string): string {
  const list = live<Appliance>(r, "hhAppliances").filter((a) => !view.home || a.home === view.home);
  const cover = (a: Appliance): string | undefined => [a.warrantyTo, a.amcTo].filter((d): d is string => !!d && d >= t).sort().pop();
  const under = list.filter((a) => cover(a)).sort((a, b) => cover(a)!.localeCompare(cover(b)!)), out = list.filter((a) => !cover(a)).sort((a, b) => a.name.localeCompare(b.name));
  const nFiles = (a: Appliance): number => (ctx.store?.all<{ owner?: { id: string }; deleted?: boolean } & Rec>("files") ?? []).filter((f) => f.owner?.id === a.id && !f.deleted).length;
  const sub = (a: Appliance): string => [view.home ? "" : homeName(r, a.home), a.model, a.bought ? `bought ${dayLabel(a.bought, t)}` : "", a.amcTo && a.amcTo >= t ? "AMC" : "", nFiles(a) ? `${nFiles(a)} file${nFiles(a) === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
  const side = (a: Appliance): string => {
    const c = cover(a), w = a.warrantyTo ?? a.amcTo;
    if (c) { const n = Math.round((+new Date(c) - +new Date(t)) / 864e5); return chip([n <= 60 ? `ends ${dayLabel(c, t)}` : `to ${dayLabel(c, t)}`, n <= 60 ? "warn" : ""]); }
    return w ? chip([`ended ${dayLabel(w, t)}`, ""]) : "";
  };
  const block = (h: string, l: Appliance[]): string => (l.length ? html`<div class="sh"><h3>${h}</h3></div><div class="list">${l.map((a) => raw(row(`data-appl="${a.id}"`, a.name, sub(a), side(a))))}</div>` : "");
  return html`${raw(block("Under warranty or AMC", under))}${raw(block("Out of warranty", out))}
    ${raw(!list.length ? html`<div class="empty">No appliances yet. Add the washing machine, ACs, fridge… with their warranty, bill and warranty card.</div>` : "")}
    <div class="btns" style="margin-top:12px"><button class="btn pri" type="button" id="addAppl">+ Add appliance</button></div>`;
}

function listsTab(r: Reader, t: string): string {
  const all = live<Item>(r, "hhItems").filter((i) => !view.home || !i.home || i.home === view.home);
  const n = (k: string): number => all.filter((i) => i.list === k && !i.doneOn).length;
  const mine = all.filter((i) => i.list === view.list), open = mine.filter((i) => !i.doneOn).sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9") || b.added.localeCompare(a.added));
  const done = mine.filter((i) => i.doneOn).sort((a, b) => b.doneOn!.localeCompare(a.doneOn!)).slice(0, 15);
  const line = (i: Item): string => html`<div class="row hhitem"><button type="button" class="hhbox ${i.doneOn ? "on" : ""}" data-tick="${i.id}" aria-label="${i.doneOn ? "Not done" : "Done"}: ${i.text}"></button><div class="main tap" data-item="${i.id}" role="button" tabindex="0"><div class="t ${i.doneOn ? "hhdone" : ""}">${i.text}</div><div class="s">${[view.home ? "" : homeName(r, i.home), i.doneOn ? `done ${dayLabel(i.doneOn, t)}` : i.due ? `by ${dayLabel(i.due, t)}` : ""].filter(Boolean).join(" · ")}</div></div></div>`;
  return html`${raw(seg([["todo", "To do", n("todo")], ["grocery", "Groceries", n("grocery")]], view.list, "list"))}
    <form class="hhadd" id="hhAdd"><input id="hhNew" placeholder="${view.list === "todo" ? "Add a to-do… (e.g. fix the bathroom tap)" : "Add groceries… (e.g. rice 5 kg)"}" aria-label="Add to the list" autocomplete="off"><button class="btn" type="submit">Add</button></form>
    ${raw(open.length ? html`<div class="list">${open.map((i) => raw(line(i)))}</div>` : html`<div class="empty">${view.list === "todo" ? "Nothing to do." : "The grocery list is empty."}</div>`)}
    ${raw(done.length ? html`<div class="sh"><h3>Done</h3><span class="sp"></span>${raw(view.list === "grocery" ? '<button class="btn sm" type="button" id="clearDone">Clear</button>' : "")}</div><div class="list">${done.map((i) => raw(line(i)))}</div>` : "")}`;
}

function draw(root: HTMLElement): void {
  if (!ctx.store) { root.innerHTML = html`<section class="card"><h2>Household</h2><p>Maintenance, appliances with their warranties and bills, and the house lists. Sign in to open it.</p></section>`; return; }
  const r = reader(), t = today(), hs = homes(r);
  if (view.home && !hs.some((h) => h.id === view.home)) view.home = "";
  const chips = html`<div class="hhtop" role="group" aria-label="Which home">${[["", "All homes"], ...hs.map((h) => [h.id, h.name])].map(([k, l]) => raw(html`<button type="button" class="hchip ${k === view.home ? "on" : ""}" data-home="${k}" aria-pressed="${String(k === view.home)}">${l}</button>`))}<button type="button" class="hchip add" id="addHome" aria-label="Add a home">＋ Home</button></div>`;
  const body = view.tab === "due" ? dueTab(r, t) : view.tab === "appl" ? applTab(r, t) : listsTab(r, t);
  const scroll = window.scrollY;
  root.innerHTML = html`<div class="mv hhv"><div class="wrap" id="hhView">${raw(chips)}${raw(seg([["due", "Due"], ["appl", "Appliances"], ["lists", "Lists"]], view.tab, "tab"))}<div class="hhbody">${raw(body)}</div></div></div>`;
  window.scrollTo(0, scroll);
}

function onTap(e: Event): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-home],[data-tab],[data-list],[data-job],[data-appl],[data-item],[data-tick],[data-starter],#addJob,#addAppl,#addHome,#clearDone");
  if (!el || !rootEl?.contains(el)) return;
  const d = el.dataset, r = reader();
  if (d.home !== undefined) { view.home = d.home; keep(); return redraw(); }
  if (d.tab) { view.tab = d.tab as View["tab"]; keep(); return redraw(); }
  if (d.list) { view.list = d.list as View["list"]; keep(); return redraw(); }
  if (d.job) return doneForm(d.job);
  if (d.appl) return applianceForm(d.appl);
  if (d.item) return itemForm(d.item);
  if (d.starter) return starterSheet(d.starter);
  if (d.tick) {
    const i = r.get<Item>("hhItems", d.tick);
    if (i) hhWrite([{ c: "hhItems", r: { ...i, doneOn: i.doneOn ? undefined : today() } }]);
    return;
  }
  if (el.id === "addJob") return jobForm(undefined, view.home);
  if (el.id === "addAppl") return applianceForm(undefined, view.home);
  if (el.id === "addHome") return homeForm();
  if (el.id === "clearDone") hhWrite(live<Item>(r, "hhItems").filter((i) => i.list === view.list && i.doneOn).map((i) => ({ c: "hhItems", id: i.id, r: null })));
}
function onKey(e: KeyboardEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[role="button"]');
  if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); el.click(); }
}
function onSubmit(e: Event): void {
  if ((e.target as HTMLElement).id !== "hhAdd") return;
  e.preventDefault();
  const inp = rootEl!.querySelector<HTMLInputElement>("#hhNew")!, text = inp.value.trim();
  if (!text) return;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  hhWrite([{ c: "hhItems", r: { id, list: view.list, text, ...(view.home ? { home: view.home } : {}), added: today() } as Rec }]);
  rootEl!.querySelector<HTMLInputElement>("#hhNew")?.focus();
}

let started = false;
/** Household's reminders join the phone's (also before the tab is opened). */
export function startHousehold(): void {
  if (started || !ctx.store) return;
  started = true;
  setReminderSource("household", () => householdNotes(reader(), new Date()).map((n) => ({ title: n.title, at: n.at })));
  scheduleReminders();
}

export const household: Module = {
  id: "household",
  label: "Household",
  icon: ICON,
  render(root) {
    ensureLayer();
    startMoney();   // Money's accounts and categories, for "add the cost to Money"
    startHousehold();
    if (rootEl !== root) {
      rootEl = root;
      root.addEventListener("click", onTap);
      root.addEventListener("keydown", onKey);
      root.addEventListener("submit", onSubmit);
    }
    draw(root);
  },
};
export { view as householdView };
