/**
 * Habits: what you do every day (or some days, or a few times a week), amounts towards a daily target,
 * things to avoid, and practices for a set number of days. Today's list with a week strip and the week's
 * score; each habit's page with streaks and a 6-month calendar. One evening nudge on the phone.
 */
import type { Module } from "../types.ts";
import { html, raw } from "../../core/dom.ts";
import { ctx } from "../../core/app.ts";
import type { Rec } from "../../core/store.ts";
import { isNative } from "../../core/native.ts";
import { setReminderSource, scheduleReminders } from "../../core/reminders.ts";
import { ensureLayer, toast } from "../money/ui/kit.ts";
import {
  active, addDays, best, dayLabel, dayOf, dayShare, daysLabel, DN, doneOn, dueOn, goalState, habitNotes, habitsOf, heat, last30, logId, logsOf, monthName,
  nudgeTime, streak, todayCount, valueOn, weekCount, weekScore, weekStart, LOG, HABITS, type Day, type Habit, type Logs, type Reader,
} from "./data.ts";
import { amountSheet, daySheet, goalDoneSheet, habitForm, nudgeSheet, starterSheet } from "./forms.ts";

export const ICON = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.8 2.8L16.5 9";

export const reader = (): Reader => ({ all: (c) => ctx.store?.all(c) ?? [], get: (c, id) => ctx.store?.get(c, id) });
export const today = (): Day => dayOf(new Date());

/** The day being ticked (this week or last week), kept while the app is open. */
let viewDay: Day = today();

/** Saves habit records and redraws. null moves a record to the trash. */
export function hbWrite(ops: { c: string; r: Rec | null; id?: string }[]): void {
  if (!ctx.store || !ops.length) return;
  ctx.store.writeMany(ops.map((o) => ({ c: o.c, id: o.id ?? o.r!.id, r: o.r ? { ...o.r, updatedAt: Date.now() } : null })));
  redraw();
  scheduleReminders();
}
/** A day's value for a habit: 0 removes it. */
export function setValue(h: Habit, d: Day, v: number): void {
  if (!active(h, d)) { toast(d < h.start ? `${h.name} starts on ${dayLabel(h.start, today())}.` : `${h.name} isn't going on then.`); return; }
  if (d > today()) return;
  hbWrite([{ c: LOG, id: logId(h.id, d), r: v > 0 ? { id: logId(h.id, d), h: h.id, d, v } : null }]);
}

let rootEl: HTMLElement | null = null;
const redraw = (): void => { if (rootEl && document.body.dataset.mod === "habits") draw(rootEl); };
const pageId = (): string => decodeURIComponent(location.hash.replace(/^#\/?habits\/?/, "").split("/")[0] ?? "");

const pct = (n: number | null): string => (n == null ? "–" : `${n}%`);
const fire = (n: number, unit = "days"): string => html`<span class="hbfire">🔥 ${String(n)}</span>${unit ? ` ${n === 1 ? unit.replace(/s$/, "") : unit}` : ""}`;

/* ---------- today ---------- */
function rowFor(h: Habit, L: Logs, d: Day, t: Day): string {
  const icon = html`<span class="hbico" aria-hidden="true">${h.icon || "•"}</span>`;
  const main = (title: string, sub: string, extra = ""): string => html`<div class="main" data-habit="${h.id}" role="button" tabindex="0"><div class="t">${title}</div><div class="s">${raw(sub)}</div>${raw(extra)}</div>`;
  const tick = (on: boolean): string => html`<button type="button" class="hbtick ${on ? "on" : ""}" data-tick="${h.id}" aria-pressed="${String(on)}" aria-label="${on ? "Done" : "Not done"}: ${h.name}">${on ? "✓" : ""}</button>`;
  const v = valueOn(L, h, d), st = streak(L, h, t);
  if (h.goal) {
    const g = goalState(L, h, t), on = doneOn(L, h, d);
    const sub = g.complete ? html`<b>${String(h.goal)} days done</b> 🎉` : html`Day ${String(g.day)} of ${String(h.goal)} · ends ${dayLabel(g.ends, t)}`;
    return html`<div class="hbrow">${raw(icon)}${raw(main(`${h.name} · ${h.goal} days`, sub, html`<div class="hbbar"><i style="width:${String(Math.min(100, Math.round((g.done / h.goal) * 100)))}%"></i></div>`))}${raw(tick(on))}</div>`;
  }
  if (h.kind === "amount") {
    const tg = h.target ?? 1;
    return html`<div class="hbrow">${raw(icon)}${raw(main(h.name, html`${String(v)} of ${String(tg)} ${h.unit ?? ""} · ${raw(fire(st, ""))}`, html`<div class="hbbar"><i style="width:${String(Math.min(100, Math.round((v / tg) * 100)))}%"></i></div>`))}
      <div class="hbstep"><button type="button" data-minus="${h.id}" aria-label="One less: ${h.name}" ${v ? "" : "disabled"}>−</button><button type="button" data-plus="${h.id}" aria-label="One more: ${h.name}">+</button></div></div>`;
  }
  if (h.kind === "weekly") {
    const tg = h.target ?? 1, n = weekCount(L, h, d, d < t ? addDays(weekStart(d), 6) : t);
    const dots = Array.from({ length: tg }, (_, i) => `<i class="${i < n ? "f" : ""}"></i>`).join("");
    return html`<div class="hbrow">${raw(icon)}${raw(main(h.name, html`${String(Math.min(n, tg))} of ${String(tg)} this week${n > tg ? ` (+${n - tg})` : ""}`, `<div class="hbwk">${dots}</div>`))}${raw(tick(v >= 1))}</div>`;
  }
  if (h.kind === "avoid") {
    const slipped = v >= 1;
    return html`<div class="hbrow">${raw(icon)}${raw(main(h.name, slipped ? "Slipped on this day" : html`${raw(fire(st))} without`))}<button type="button" class="hbslip ${slipped ? "on" : ""}" data-slip="${h.id}" aria-pressed="${String(slipped)}">${slipped ? "Undo" : "Slipped"}</button></div>`;
  }
  return html`<div class="hbrow">${raw(icon)}${raw(main(h.name, html`${raw(fire(st))} · ${daysLabel(h)}${st ? "" : (() => { const b = best(L, h, t); return b ? ` · best ${b}` : ""; })()}`))}${raw(tick(v >= 1))}</div>`;
}

function todayPage(r: Reader): string {
  const t = today(), all = habitsOf(r), L = logsOf(r);
  if (viewDay > t || viewDay < addDays(weekStart(t), -7)) viewDay = t;
  const d = viewDay, ws = weekStart(d);
  const going = all.filter((h) => h.start <= t && !(h.stopped && h.stopped <= t) && !h.completed);
  const shown = all.filter((h) => dueOn(h, d) && (going.includes(h) || d < t));
  const notNow = all.filter((h) => !going.includes(h));
  const strip = Array.from({ length: 7 }, (_, i) => {
    const x = addDays(ws, i), share = dayShare(all, L, x, t), fut = x > t;
    const bar = share == null ? "" : `background:linear-gradient(90deg,var(--accent) ${Math.round(share * 100)}%,var(--line2) ${Math.round(share * 100)}%)`;
    return html`<button type="button" class="hbday ${x === d ? "on" : ""}" data-day="${x}" ${fut ? "disabled" : ""} aria-pressed="${String(x === d)}" aria-label="${DN[i]} ${dayLabel(x, t)}">${DN[i]}<b>${String(+x.slice(8, 10))}</b><i style="${bar}"></i></button>`;
  }).join("");
  const sc = weekScore(all, L, d, t), last = weekScore(all, L, addDays(ws, -7), t), tc = todayCount(all, L, d);
  const ring = sc ?? 0;
  const dayName = d === t ? "Today" : d === addDays(t, -1) ? "Yesterday" : `${DN[(new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).getDay() + 6) % 7]} ${dayLabel(d, t)}`;
  const isThisWeek = ws === weekStart(t);
  const finished = going.filter((h) => h.goal && !h.completed && goalState(L, h, t).complete);
  return html`<div class="hbhead"><button type="button" class="hbnav" id="hbPrev" ${isThisWeek ? "" : "disabled"} aria-label="Last week">‹</button><span>${isThisWeek ? "This week" : "Last week"}</span><button type="button" class="hbnav" id="hbNext" ${isThisWeek ? "disabled" : ""} aria-label="This week">›</button></div>
    <div class="hbdays">${raw(strip)}</div>
    ${raw(all.length ? html`<div class="card hbscore"><div class="hbring" style="--p:${String(ring)}"><b>${pct(sc)}</b></div><div><div class="t">${isThisWeek ? "This week" : "Last week"} ${pct(sc)}</div><div class="s">${dayName} ${String(tc.done)} of ${String(tc.due)} done${isThisWeek ? ` · last week ${pct(last)}` : ""}</div></div></div>` : "")}
    ${raw(finished.map((h) => html`<div class="card hbgoal"><b>🎉 ${h.name}: ${String(h.goal)} days done.</b><div class="btns"><button class="btn pri sm" type="button" data-goaldone="${h.id}">What next?</button></div></div>`).join(""))}
    ${raw(shown.length ? html`<div class="card hblist">${raw(shown.map((h) => rowFor(h, L, d, t)).join(""))}</div>` : all.length ? html`<div class="empty">Nothing asked for ${d === t ? "today" : "on this day"}.</div>` : html`<div class="card hbstart"><b>Start with a few habits</b><p class="note">Walking, water, yoga, reading, sleep, or something to give up. Pick from the usual ones or add your own.</p><div class="btns"><button class="btn pri" type="button" id="hbStarters">Pick from the usual ones</button></div></div>`)}
    <button class="btn pri hbadd" type="button" id="addHabit">＋ Add habit</button>
    ${raw(notNow.length ? html`<div class="sh"><h3>Stopped or finished</h3></div><div class="list">${raw(notNow.map((h) => html`<div class="row tap" data-habit="${h.id}" role="button" tabindex="0"><div class="main"><div class="t">${h.icon ?? ""} ${h.name}</div><div class="s">${h.completed ? `${h.goal} days, finished ${dayLabel(h.completed, t)}` : h.stopped ? `stopped ${dayLabel(h.stopped, t)}` : `starts ${dayLabel(h.start, t)}`}</div></div></div>`).join(""))}</div>` : "")}
    <p class="hbnudge" id="hbNudge" role="button" tabindex="0">🔔 ${nudgeTime(r) ? html`${timeLabel(nudgeTime(r))} nudge if anything's left for today` : "Evening nudge is off"}${isNative() ? "" : " (on the phone)"} · <b>change</b></p>`;
}
export const timeLabel = (hm: string): string => { const h = +hm.slice(0, 2), m = hm.slice(3, 5); return `${h % 12 || 12}${m === "00" ? "" : `:${m}`} ${h < 12 ? "AM" : "PM"}`; };

/* ---------- a habit's page ---------- */
function habitPage(r: Reader, h: Habit): string {
  const t = today(), L = logsOf(r), st = streak(L, h, t), b = best(L, h, t), l30 = last30(L, h, t);
  const wk = h.kind === "weekly";
  const stats = h.goal
    ? (() => { const g = goalState(L, h, t); return [[String(g.done), "Days done"], [String(g.left), "Days to go"], [g.complete ? "Done 🎉" : dayLabel(g.ends, t), g.complete ? "" : "Finishes"]]; })()
    : h.kind === "avoid" ? [[`🔥 ${st}`, "Days without"], [String(b), "Longest"], [pct(l30), "Last 30 days"]]
    : [[`🔥 ${st}`, wk ? "Weeks in a row" : "Days in a row"], [String(b), wk ? "Best weeks" : "Best streak"], [pct(l30), "Last 30 days"]];
  let grid = "";
  if (h.goal) {
    // a box for each of the days: done ones filled, today's ringed
    const done: Day[] = []; for (let d = h.start; d <= (h.completed ?? t); d = addDays(d, 1)) if (doneOn(L, h, d)) done.push(d);
    const g = goalState(L, h, t);
    grid = html`<div class="card hbcard"><div class="hbct">Started ${dayLabel(h.start, t)}</div><div class="hbgrid">${raw(Array.from({ length: h.goal }, (_, i) => `<i class="${i < done.length ? "b" : i === done.length && !g.complete ? "t" : ""}" title="${done[i] ? dayLabel(done[i]!, t) : ""}">${i + 1}</i>`).join(""))}</div>
      ${raw(goalMissed(L, h, t) ? html`<p class="note">${String(goalMissed(L, h, t))} missed day${goalMissed(L, h, t) === 1 ? "" : "s"} so far: each moves the finish on by a day.</p>` : "")}</div>`;
  }
  const cells = heat(L, h, t, 26), months: string[] = [];
  for (let w = 0; w < 26; w++) { const d = cells[w * 7]!.d; const m = monthName(d); months.push(w === 0 || monthName(cells[(w - 1) * 7]!.d) !== m ? m : ""); }
  const heatHtml = html`<div class="card hbcard"><div class="hbct">Last 6 months <span class="note">tap a day to change it</span></div><div class="hbmonths">${raw(months.map((m) => `<span>${m}</span>`).join(""))}</div>
    <div class="hbheat">${raw(cells.map((c) => `<button type="button" class="${c.c}" ${c.c === "future" ? "disabled" : ""} data-cell="${c.d}" aria-label="${dayLabel(c.d, t)}: ${c.c}"></button>`).join(""))}</div>
    <div class="hblegend">${h.kind === "avoid" ? "Slipped" : "Missed"} <i class="missed"></i><i class="done"></i> ${h.kind === "avoid" ? "Clean" : "Done"}</div></div>`;
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(weekStart(t), -7 * i)).filter((w) => addDays(w, 6) >= h.start).map((w) => [w === weekStart(t) ? "This week" : dayLabel(w, t), weekScore([h], L, w, t)] as const).filter(([, v]) => v != null);
  const goingOn = !h.stopped && !h.completed;
  return html`<div class="hbtitle"><span class="hbico big" aria-hidden="true">${h.icon || "•"}</span><div><h2>${h.name}</h2><div class="s">${h.kind === "amount" ? `${h.target} ${h.unit ?? ""} a day · ` : h.kind === "avoid" ? "to avoid · " : ""}${daysLabel(h)} · since ${dayLabel(h.start, t)}</div></div></div>
    <div class="hbstats">${raw(stats.map(([v, l]) => html`<div class="card"><b>${v!}</b><span>${l!}</span></div>`).join(""))}</div>
    ${raw(grid)}${raw(heatHtml)}
    ${raw(weeks.length ? html`<div class="sh"><h3>Weekly score</h3></div><div class="card hbcard">${raw(weeks.map(([l, v]) => html`<div class="hbws"><span>${l}</span><div class="hbbar"><i style="width:${String(v)}%"></i></div><b>${String(v)}%</b></div>`).join(""))}</div>` : "")}
    <div class="btns" style="margin-top:16px"><button class="btn" type="button" id="hbBack">Back</button><button class="btn" type="button" id="hbEdit">Edit</button>${raw(goingOn ? html`<button class="btn danger" type="button" id="hbStop">${h.goal ? "Give up" : "Stop habit"}</button>` : html`<button class="btn pri" type="button" id="hbRestart">Start again</button>`)}</div>`;
}
const goalMissed = (L: Logs, h: Habit, t: Day): number => { let n = 0; for (let d = h.start; d < (h.completed ?? t); d = addDays(d, 1)) if (!doneOn(L, h, d)) n++; return n; };

function draw(root: HTMLElement): void {
  if (!ctx.store) { root.innerHTML = html`<section class="card"><h2>Habits</h2><p>Daily habits, amounts, a few times a week, things to avoid, and practices for a set number of days. Sign in to open it.</p></section>`; return; }
  const r = reader(), id = pageId(), h = id ? r.get<Habit>(HABITS, id) : undefined;
  const body = h && !h.deleted ? habitPage(r, h) : todayPage(r);
  const scroll = window.scrollY;
  root.innerHTML = html`<div class="mv hbv"><div class="wrap" id="hbView">${raw(body)}</div></div>`;
  if (!id) window.scrollTo(0, scroll);
}

function onTap(e: Event): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-day],[data-tick],[data-plus],[data-minus],[data-slip],[data-habit],[data-cell],[data-goaldone],#addHabit,#hbStarters,#hbNudge,#hbPrev,#hbNext,#hbBack,#hbEdit,#hbStop,#hbRestart");
  if (!el || !rootEl?.contains(el) || document.body.dataset.mod !== "habits" || (el as HTMLButtonElement).disabled) return;
  const d = el.dataset, r = reader(), t = today();
  const hOf = (x?: string): Habit | undefined => (x ? r.get<Habit>(HABITS, x) : undefined);
  if (d.day) { viewDay = d.day; return redraw(); }
  if (el.id === "hbPrev") { viewDay = addDays(weekStart(t), -1); return redraw(); }
  if (el.id === "hbNext") { viewDay = t; return redraw(); }
  if (d.habit) { location.hash = `#/habits/${encodeURIComponent(d.habit)}`; return; }
  if (d.goaldone) { const h = hOf(d.goaldone); if (h) goalDoneSheet(h); return; }
  const L = logsOf(r);
  if (d.tick) { const h = hOf(d.tick); if (h) setValue(h, viewDay, valueOn(L, h, viewDay) >= 1 ? 0 : 1); return; }
  if (d.slip) { const h = hOf(d.slip); if (h) setValue(h, viewDay, valueOn(L, h, viewDay) >= 1 ? 0 : 1); return; }
  if (d.plus) { const h = hOf(d.plus); if (h) setValue(h, viewDay, valueOn(L, h, viewDay) + 1); return; }
  if (d.minus) { const h = hOf(d.minus); if (h) setValue(h, viewDay, Math.max(0, valueOn(L, h, viewDay) - 1)); return; }
  if (el.id === "addHabit") return habitForm();
  if (el.id === "hbStarters") return starterSheet();
  if (el.id === "hbNudge") return nudgeSheet();
  const h = hOf(pageId());
  if (el.id === "hbBack") { location.hash = "#/habits"; return; }
  if (!h) return;
  if (d.cell) {
    if (h.kind === "amount") return amountSheet(h, d.cell);
    // the squares are small on a phone: ask which, with big buttons, instead of flipping the one under the finger
    if (matchMedia("(pointer: coarse)").matches) return daySheet(h, d.cell, valueOn(L, h, d.cell) >= 1, (v) => setValue(h, d.cell!, v));
    setValue(h, d.cell, valueOn(L, h, d.cell) >= 1 ? 0 : 1); return;
  }
  if (el.id === "hbEdit") return habitForm(h.id);
  if (el.id === "hbStop") { hbWrite([{ c: HABITS, r: { ...h, stopped: t } }]); toast(h.goal ? "Given up. It's kept under Stopped or finished." : "Stopped. Its history is kept."); location.hash = "#/habits"; return; }
  if (el.id === "hbRestart") {
    const again: Habit = { ...h, start: t }; delete again.stopped; delete again.completed;
    hbWrite([{ c: HABITS, r: again }]); toast(h.goal ? `${h.goal} days, from today` : "Started again from today"); return;
  }
}
function onKey(e: KeyboardEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[role="button"]');
  if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); el.click(); }
}

let started = false;
/** The evening nudge joins the phone's reminders (also before the tab is opened). */
export function startHabits(): void {
  if (started || !ctx.store) return;
  started = true;
  setReminderSource("habits", () => habitNotes(reader(), new Date()));
  scheduleReminders();
}

export const habits: Module = {
  id: "habits",
  label: "Habits",
  icon: ICON,
  render(root) {
    ensureLayer();
    startHabits();
    if (rootEl !== root) {
      rootEl = root;
      root.addEventListener("click", onTap);
      root.addEventListener("keydown", onKey);
    }
    draw(root);
  },
};
