/**
 * Today: what needs you today and in the next 7 days, from every section, on one page. Bills and EMIs
 * (Money), medicines and check-ups (Health), habits to tick (Habits), home jobs, warranties and vehicle
 * renewals (Home), papers expiring (Documents). Medicines and daily habits are ticked right here.
 */
import type { Module } from "../types.ts";
import { html, raw } from "../../core/dom.ts";
import { ctx } from "../../core/app.ts";
import type { Rec } from "../../core/store.ts";
import { formatINR } from "../../core/money.ts";
import { addTxn, moneyNow, startMoney } from "../money/index.ts";
import { ensureLayer } from "../money/ui/kit.ts";
import { obligations } from "../money/calc/reserve.ts";
import { dueRows } from "../household/data.ts";
import { vehicleDue } from "../household/vehicles.ts";
import { attention } from "../documents/data.ts";
import { ownerHash } from "../documents/index.ts";
import { checkupsOf, dueOn as medDue, medsOf, people, taken, timeLabel, type Med } from "../health/data.ts";
import { takeMed } from "../health/index.ts";
import { doneOn, dueOn as habitDue, HABITS, habitsOf, logsOf, streak, valueOn, type Habit } from "../habits/data.ts";
import { setValue } from "../habits/index.ts";
import { famItems } from "../calendar/index.ts";

type Day = string;
interface Reader { all<T extends Rec = Rec>(c: string): T[]; get<T extends Rec = Rec>(c: string, id: string): T | undefined }
const reader = (): Reader => ({ all: (c) => ctx.store?.all(c) ?? [], get: (c, id) => ctx.store?.get(c, id) });
const pad = (n: number): string => String(n).padStart(2, "0");
const dayOf = (d: Date): Day => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (d: Day): Date => new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const addDays = (d: Day, n: number): Day => { const x = parse(d); x.setDate(x.getDate() + n); return dayOf(x); };
const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const short = (d: Day): string => `${+d.slice(8, 10)} ${MN[+d.slice(5, 7) - 1]}`;

export type Area = "Money" | "Health" | "Habit" | "Home" | "Papers" | "Family";
export interface Item {
  key: string; area: Area; date: Day; time?: string; title: string; sub: string; amount?: number; href: string;
  /** ticked right here */
  tick?: { kind: "habit" | "med"; id: string; time?: string; on: boolean };
  late?: boolean;
}

const ICON: Record<Area, string> = {
  Money: "M3 6h18v14H3zM3 10h18M16 15h2",
  Health: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  Habit: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM8.5 12.5l2.5 2.5 4.5-5",
  Home: "M4 11l8-7 8 7v9H4zM10 20v-5h4v5",
  Papers: "M7 3h7l4 4v14H7zM14 3v4h4",
  Family: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M12 13.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z",
};

/** Everything due from today to 7 days ahead (and anything overdue), from every section. */
export function items(r: Reader, t: Day): Item[] {
  const end = addDays(t, 7), out: Item[] = [];
  const when = (d: Day): string => (d < t ? `was due ${short(d)}` : d === t ? "today" : d === addDays(t, 1) ? "tomorrow" : `${WD[parse(d).getDay()]} ${short(d)}`);
  // Money: bills, EMIs, card bills and transfers still to pay
  try {
    for (const o of obligations(moneyNow(), 8)) {
      if (o.type === "income" || o.type === "investment" || o.budget || o.anyDay || o.date > end) continue;
      out.push({ key: `m:${o.key}`, area: "Money", date: o.date < t ? t : o.date, late: o.date < t, title: o.name, sub: `Money · ${o.auto ? "auto-debit · " : ""}${when(o.date)}`, amount: o.amount, href: "#/money/home" });
    }
  } catch { /* money not set up yet */ }
  // Health: today's medicines (ticked here), check-ups
  const ps = people(r), nameOf = (id: string): string => ps.find((p) => p.id === id)?.name ?? "";
  for (const p of ps) {
    for (const m of medsOf(r, p.id, t)) if (medDue(m, t)) for (const tm of m.times) {
      out.push({ key: `h:${m.id}:${tm}`, area: "Health", date: t, time: tm, title: m.name, sub: `${timeLabel(tm)}${ps.length > 1 ? ` · ${p.name}` : ""}${m.dose ? ` · ${m.dose}` : ""}`, href: "#/health", tick: { kind: "med", id: m.id, time: tm, on: taken(r, m as Med, t, tm) } });
    }
    for (const c of checkupsOf(r, p.id)) if (c.due <= end) out.push({ key: `c:${c.id}`, area: "Health", date: c.due < t ? t : c.due, late: c.due < t, title: c.name, sub: `Check-up${ps.length > 1 ? ` · ${nameOf(c.person)}` : ""} · ${when(c.due)}`, href: "#/health" });
  }
  // Habits: today's, ticked here (amounts open the habit)
  const L = logsOf(r);
  for (const h of habitsOf(r) as Habit[]) {
    if (!habitDue(h, t) || h.kind === "weekly" || h.kind === "avoid") continue;
    const s = streak(L, h, t), on = doneOn(L, h, t);
    if (h.kind === "amount") out.push({ key: `b:${h.id}`, area: "Habit", date: t, title: h.name, sub: `${valueOn(L, h, t)} of ${h.target ?? 0} ${h.unit ?? ""}${s > 1 ? ` · ${s} days in a row` : ""}`, href: `#/habits/${encodeURIComponent(h.id)}` });
    else out.push({ key: `b:${h.id}`, area: "Habit", date: t, title: h.name, sub: s > 1 ? `${s} days in a row` : h.goal ? `${h.goal}-day practice` : "Habit", href: `#/habits/${encodeURIComponent(h.id)}`, tick: { kind: "habit", id: h.id, on } });
  }
  // Home: jobs, warranties, to-dos, vehicle renewals and service
  for (const x of dueRows(r, t)) if (x.date <= end) out.push({ key: `j:${x.kind}:${x.id}`, area: "Home", date: x.date < t ? t : x.date, late: x.date < t, title: x.title, sub: `Household · ${when(x.date)}`, href: "#/household/due" });
  for (const x of vehicleDue(r, t)) if (x.date <= end) out.push({ key: `v:${x.id}:${x.key}`, area: "Home", date: x.date < t ? t : x.date, late: x.date < t, title: x.title, sub: `${x.sub} · ${when(x.date)}`, href: "#/household/veh" });
  // Family days: birthdays, anniversaries, shraddha, on their date and their tithi
  for (const o of famItems(t, 7)) out.push({ key: `f:${o.id}:${o.by}:${o.date}`, area: "Family", date: o.date, title: o.title, sub: `${o.sub}${o.date === t ? "" : ` · ${when(o.date)}`}`, href: "#/calendar" });
  // Papers: expiring or expired
  for (const a of attention(r, t)) if (a.date <= end) out.push({ key: `d:${a.docId ?? a.title}`, area: "Papers", date: a.date < t ? t : a.date, late: a.date < t, title: a.title, sub: `${a.sub}`, href: ownerHash(a.owner) });
  return out.sort((a, b) => a.date.localeCompare(b.date) || Number(!!b.late) - Number(!!a.late) || (a.time ?? "99").localeCompare(b.time ?? "99") || a.title.localeCompare(b.title));
}

/** How many things today still need you (for the side menu). */
export function todayCount(): number {
  if (!ctx.store) return 0;
  const t = dayOf(new Date());
  return items(reader(), t).filter((x) => x.date === t && !x.tick?.on).length;
}

let showAll = false;
/** Money is set up (its + only makes sense then). */
const moneyReady = (): boolean => { try { return !!moneyNow().live("accounts").length; } catch { return false; } };
const row = (x: Item): string => {
  const right = x.tick
    ? html`<button type="button" class="tdtick ${x.tick.on ? "on" : ""}" data-tk="${x.tick.kind}" data-id="${x.tick.id}" data-time="${x.tick.time ?? ""}" aria-pressed="${String(x.tick.on)}" aria-label="${x.tick.on ? "Done" : "Mark done"}: ${x.title}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg></button>`
    : x.amount != null ? html`<span class="tdamt">${formatINR(x.amount)}</span>` : "";
  return html`<div class="tdrow"><a class="tdmain" href="${x.href}"><span class="tdic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[x.area]}"/></svg></span><span class="tdt"><b>${x.title}</b><span class="${x.late ? "late" : ""}">${x.sub}</span></span></a>${raw(right)}</div>`;
};

function draw(root: HTMLElement): void {
  const now = new Date(), t = dayOf(now), hr = now.getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const date = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  if (!ctx.store) { root.innerHTML = html`<div class="tdy"><p class="tddate">${date}</p><h1 class="tdh">${greet}</h1></div>`; return; }
  const all = items(reader(), t), today = all.filter((x) => x.date === t), week = all.filter((x) => x.date > t);
  const left = today.filter((x) => !x.tick?.on).length;
  const wk = showAll ? week : week.slice(0, 5);
  root.innerHTML = html`<div class="tdy">
    <p class="tddate">${date}</p>
    <h1 class="tdh">${greet}</h1>
    <a class="tdsearch" href="#/search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>Search everything</a>
    <section class="tdcard" aria-labelledby="tdT"><h2 id="tdT">Today${left ? ` · ${left} to do` : ""}</h2>
      ${raw(today.length ? today.map(row).join("") : html`<p class="tdnone">Nothing due today.</p>`)}</section>
    <section class="tdcard" aria-labelledby="tdW"><h2 id="tdW">Next 7 days</h2>
      ${raw(week.length ? wk.map(row).join("") : html`<p class="tdnone">Nothing in the next 7 days.</p>`)}</section>
    ${raw(week.length > 5 ? html`<button type="button" class="tdmore" id="tdAll">${showAll ? "Show fewer" : `See all ${week.length} coming up`}</button>` : "")}
  </div>${raw(moneyReady() ? html`<button class="fab" id="tdAdd" type="button" aria-label="Add transaction"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>` : "")}`;
}

let rootEl: HTMLElement | null = null;
function onTap(e: Event): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tk],#tdAll,#tdAdd");
  if (!el || !rootEl?.contains(el) || document.body.dataset.mod !== "today") return;
  if (el.id === "tdAll") { showAll = !showAll; draw(rootEl); return; }
  if (el.id === "tdAdd") { addTxn(); return; }
  const t = dayOf(new Date());
  if (el.dataset.tk === "med") takeMed(el.dataset.id!, el.dataset.time!);
  if (el.dataset.tk === "habit") { const h = reader().get<Habit>(HABITS, el.dataset.id!); if (h) setValue(h, t, el.getAttribute("aria-pressed") === "true" ? 0 : 1); }
}

export const today: Module = {
  id: "today",
  label: "Today",
  icon: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  // Today's bottom bar: the main sections, and the side menu for the rest
  subs: () => [
    { id: "today", label: "Today", icon: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4", href: "#/today" },
    { id: "money", label: "Money", icon: "M3 6h18v14H3zM3 10h18M16 15h2", href: "#/money" },
    { id: "household", label: "Household", icon: "M4 11l8-7 8 7v9H4zM10 20v-5h4v5", href: "#/household" },
    { id: "health", label: "Health", icon: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z", href: "#/health" },
    { id: "menu", label: "Menu", icon: "M4 7h16M4 12h16M4 17h10", href: "#menu" },
  ],
  sub: () => "today",
  render(root) {
    if (ctx.store) { ensureLayer(); startMoney(); }
    if (rootEl !== root) { rootEl = root; root.addEventListener("click", onTap); }
    draw(root);
  },
};
