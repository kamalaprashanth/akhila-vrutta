/**
 * Health, for each person in People: readings with their trend, lab reports (values read by Claude or typed,
 * flagged against their normal ranges, compared with the last report), medicines and supplements with doses
 * ticked and reminders, repeating check-ups and doctor visits. Amount habits show as tiles. Designed with the
 * owner on 26 Nov 2026. Not medical advice.
 */
import type { Module } from "../types.ts";
import { html, raw } from "../../core/dom.ts";
import { ctx } from "../../core/app.ts";
import type { Rec } from "../../core/store.ts";
import { filesOf } from "../../core/files.ts";
import { setReminderSource, scheduleReminders } from "../../core/reminders.ts";
import { ensureLayer } from "../money/ui/kit.ts";
import { startMoney } from "../money/index.ts";
import { ownerForm } from "../documents/forms.ts";
import {
  ago, change30, checkupsOf, dayLabel, dayOf, daysBetween, dueOn, flag, fmt, habitsPerson, healthNotes, heightOf, KINDS, labsOf, logId, medsOf, monthLabel,
  people, previous, rangeText, readingsOf, runningLow, schedule, sortValues, sparkPoints, taken, timeLabel, visitsOf, type Lab, type Med, type Reader,
} from "./data.ts";
import { checkupForm, labForm, medForm, readingForm, readingSheet, visitForm } from "./forms.ts";

export const ICON = "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z";
export const reader = (): Reader => ({ all: (c) => ctx.store?.all(c) ?? [], get: (c, id) => ctx.store?.get(c, id) });
export const today = (): string => dayOf(new Date());

/** Saves health records and redraws. null moves a record to the trash. */
export function hlWrite(ops: { c: string; r: Rec | null; id?: string }[]): void {
  if (!ctx.store || !ops.length) return;
  ctx.store.writeMany(ops.map((o) => ({ c: o.c, id: o.id ?? o.r!.id, r: o.r ? { ...o.r, updatedAt: Date.now() } : null })));
  redraw();
  scheduleReminders();
}

let rootEl: HTMLElement | null = null;
const KEY = "av.health";
let person = (() => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } })();
const keep = (): void => { try { localStorage.setItem(KEY, person); } catch { /* not kept */ } };
const redraw = (): void => { if (rootEl && document.body.dataset.mod === "health") draw(rootEl); };
const labPage = (): string => decodeURIComponent(location.hash.match(/^#\/health\/lab\/(.+)$/)?.[1] ?? "");
const cls = (st: string): string => (st === "high" || st === "low" ? "bad" : st === "warn" ? "warn" : st === "ok" ? "ok" : "");
const FLAG: Record<string, string> = { high: "High", low: "Low", ok: "Normal", warn: "Borderline" };
const spark = (pts: string, c = ""): string => (pts ? html`<svg class="hlspark ${c}" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/></svg>` : "");

function mainPage(r: Reader, t: string): string {
  const ps = people(r);
  if (!ps.length) return html`<div class="card hlstart"><b>Whose health?</b><p class="note">Health keeps readings, lab reports, medicines and check-ups for each person in your family. People are shared with Documents.</p><div class="btns"><button class="btn pri" type="button" id="hlAddP">＋ Add yourself</button></div></div>`;
  if (!ps.some((p) => p.id === person)) person = ps[0]!.id;
  const chips = html`<div class="hhtop" role="group" aria-label="Whose">${raw(ps.map((p) => html`<button type="button" class="hchip ${p.id === person ? "on" : ""}" data-person="${p.id}" aria-pressed="${String(p.id === person)}">${p.name}</button>`).join(""))}<button type="button" class="hchip add" id="hlAddP" aria-label="Add a person">＋ Person</button></div>`;
  const h = heightOf(r, person);
  const tiles = KINDS.map((k) => {
    const l = readingsOf(r, person, k.k), last = l[l.length - 1];
    if (!last) return "";
    const [st, txt] = k.status(last.v, last.v2, h), ch = k.k === "weight" ? change30(l) : null;
    const sub = [ch != null && ch !== 0 ? `${ch > 0 ? "+" : "−"}${Math.abs(ch)} kg in 30 days` : "", txt, ago(last.date, t)].filter(Boolean).join(" · ");
    return html`<button type="button" class="card hltile" data-kind="${k.k}"><span class="l">${k.label}</span><span class="v ${cls(st)}">${fmt(last)} <small>${k.unit}</small></span><span class="s">${sub}</span>${raw(spark(sparkPoints(l.slice(-12).map((x) => x.v)), cls(st)))}</button>`;
  }).join("");
  // amount habits (steps, water…) belong to whoever is "me"
  const habitTiles = habitsPerson(r)?.id === person ? r.all<Rec & { name: string; kind: string; target?: number; unit?: string; deleted?: boolean; stopped?: string }>("habits").filter((x) => !x.deleted && !x.stopped && x.kind === "amount").map((x) => {
    const vals = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return (r.get<Rec & { v: number }>("habitLog", `${x.id}_${dayOf(d)}`)?.v ?? 0); });
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / 7);
    return html`<a class="card hltile" href="#/habits/${x.id}"><span class="l">${x.name} · from Habits</span><span class="v">${avg.toLocaleString("en-IN")} <small>${x.unit ?? ""}</small></span><span class="s">a day, last 7 days · target ${String(x.target ?? "")}</span>${raw(spark(sparkPoints(vals)))}</a>`;
  }).join("") : "";
  const labs = labsOf(r, person), lab = labs[0];
  const labHtml = lab ? (() => {
    const top = sortValues(lab.values).slice(0, 3);
    return html`<div class="sh"><h3>Latest lab report · ${dayLabel(lab.date, t)}</h3></div><div class="list">${raw(top.map((v) => { const f = flag(v), prev = previous(r, lab, v.name); return html`<div class="row tap" data-lab="${lab.id}" role="button" tabindex="0"><div class="main"><div class="t">${v.name}</div><div class="s">${[`${v.value} ${v.unit ?? ""}`.trim(), rangeText(v), prev ? `was ${prev.v.value} in ${monthLabel(prev.lab.date)}` : ""].filter(Boolean).join(" · ")}</div></div>${raw(f ? html`<span class="hlflag ${f}">${FLAG[f]!}</span>` : "")}</div>`; }).join(""))}
      <div class="row tap" data-lab="${lab.id}" role="button" tabindex="0"><div class="main"><div class="t">All ${String(lab.values.length)} values</div><div class="s">${[...new Set(lab.values.map((v) => v.group).filter(Boolean))].slice(0, 5).join(", ") || lab.lab || ""}</div></div><span class="s">›</span></div></div>
      ${raw(labs.length > 1 ? html`<div class="hlolder">${raw(labs.slice(1, 6).map((l) => html`<button type="button" class="btn sm" data-lab="${l.id}">${dayLabel(l.date, t)}</button>`).join(""))}</div>` : "")}`;
  })() : "";
  const meds = medsOf(r, person, t).filter((m) => dueOn(m, t) || runningLow(m));
  const medHtml = meds.length ? html`<div class="sh"><h3>Medicines and supplements · today</h3></div><div class="list">${raw(meds.flatMap((m) => (dueOn(m, t) ? m.times : [""]).map((tm) => {
    const on = tm ? taken(r, m, t, tm) : false;
    return html`<div class="row"><div class="main tap" data-med="${m.id}" role="button" tabindex="0"><div class="t">${m.name}${tm && m.times.length > 1 ? ` · ${timeLabel(tm)}` : ""}</div><div class="s">${[m.dose, schedule(m), m.stock != null ? `${m.stock} left` : ""].filter(Boolean).join(" · ")}${raw(runningLow(m) ? ' <span class="due warn">running low</span>' : "")}</div></div>${raw(tm ? html`<button type="button" class="hbtick ${on ? "on" : ""}" data-take="${m.id}" data-time="${tm}" aria-pressed="${String(on)}" aria-label="${on ? "Taken" : "Not taken"}: ${m.name}">${on ? "✓" : ""}</button>` : "")}</div>`;
  })).join(""))}</div>` : "";
  const cks = checkupsOf(r, person);
  const ckHtml = html`<div class="sh"><h3>Check-ups</h3></div>${raw(cks.length ? html`<div class="list">${raw(cks.map((c) => { const n = daysBetween(t, c.due); return html`<div class="row tap" data-ck="${c.id}" role="button" tabindex="0"><div class="main"><div class="t">${c.name}</div><div class="s">${c.every === 12 ? "every year" : `every ${c.every} months`}${c.last ? ` · last ${dayLabel(c.last, t)}` : ""}</div></div><span class="due ${n < 0 ? "bad" : n <= 30 ? "warn" : ""}">${n < 0 ? "overdue" : n <= 30 ? `due ${dayLabel(c.due, t)}` : dayLabel(c.due, t)}</span></div>`; }).join(""))}</div>` : html`<div class="empty dempty">Add the check-ups that repeat: a full body check-up, the dentist, an eye test.</div>`)}`;
  const vs = visitsOf(r, person).slice(0, 4);
  const vHtml = vs.length ? html`<div class="sh"><h3>Doctor visits</h3></div><div class="list">${raw(vs.map((v) => { const n = filesOf({ c: "hlVisits", id: v.id }).length; return html`<div class="row tap" data-visit="${v.id}" role="button" tabindex="0"><div class="main"><div class="t">${v.doctor}</div><div class="s">${[dayLabel(v.date, t), v.reason, n ? `${n} file${n === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</div></div></div>`; }).join(""))}</div>` : "";
  const empty = !tiles && !habitTiles && !lab && !meds.length;
  return html`${raw(chips)}
    ${raw(tiles || habitTiles ? html`<div class="hltiles">${raw(tiles + habitTiles)}</div>` : "")}
    ${raw(empty ? html`<div class="empty dempty">Nothing yet. Add a reading (weight, BP, sugar…), a lab report, or the medicines you take.</div>` : "")}
    ${raw(labHtml)}${raw(medHtml)}${raw(ckHtml)}${raw(vHtml)}
    <div class="hlbtns"><button class="btn pri" type="button" id="hlRead">＋ Reading</button><button class="btn pri" type="button" id="hlLab">＋ Lab report</button><button class="btn" type="button" id="hlMed">＋ Medicine</button><button class="btn" type="button" id="hlCk">＋ Check-up</button><button class="btn" type="button" id="hlVisit">＋ Doctor visit</button></div>
    <p class="note hlnote">The ranges are the usual adult ones, as a guide. This isn't medical advice: talk to your doctor about results.</p>`;
}

function labView(r: Reader, lab: Lab, t: string): string {
  const who = people(r).find((p) => p.id === lab.person)?.name ?? "";
  const nf = filesOf({ c: "hlLabs", id: lab.id }).length;
  const groups = new Map<string, typeof lab.values>();
  for (const v of lab.values) { const g = v.group || "Results"; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(v); }
  const bar = (v: (typeof lab.values)[number]): string => {
    const n = typeof v.value === "number" ? v.value : parseFloat(String(v.value));
    if (!Number.isFinite(n) || (v.low == null && v.high == null)) return "";
    // the normal band in green; "below X" starts at 0, "above X" runs to the end
    let min: number, max: number, a: number, b: number;
    if (v.low != null && v.high != null) { const span = v.high - v.low || 1; min = v.low - span * 0.5; max = v.high + span * 0.5; a = ((v.low - min) / (max - min)) * 100; b = ((v.high - min) / (max - min)) * 100; }
    else if (v.high != null) { min = 0; max = Math.max(v.high * 1.5, n * 1.1); a = 0; b = (v.high / max) * 100; }
    else { min = 0; max = Math.max(v.low! * 2, n * 1.2); a = (v.low! / max) * 100; b = 100; }
    const pos = Math.max(0, Math.min(100, ((n - min) / (max - min)) * 100));
    return html`<div class="hlrange" style="--a:${a.toFixed(1)}%;--b:${b.toFixed(1)}%"><i style="left:${pos.toFixed(1)}%"></i></div>`;
  };
  return html`<div class="dhead"><span class="dico big">🧪</span><div><h2>Lab report · ${dayLabel(lab.date, t)}</h2><div class="s">${[who, lab.lab, nf ? `${nf} file${nf === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</div></div></div>
    ${raw([...groups].map(([g, vs]) => html`<div class="sh"><h3>${g}</h3></div><div class="list">${raw(vs.map((v) => { const f = flag(v), prev = previous(r, lab, v.name); const pv = prev ? (typeof prev.v.value === "number" && typeof v.value === "number" ? `${monthLabel(prev.lab.date)} ${prev.v.value} → ${v.value} ${v.value > prev.v.value ? "↑" : v.value < prev.v.value ? "↓" : "="}` : `was ${prev.v.value} in ${monthLabel(prev.lab.date)}`) : ""; return html`<div class="row"><div class="main"><div class="t">${v.name}${raw(f && f !== "ok" ? html` <span class="hlflag ${f}">${FLAG[f]!}</span>` : "")}</div><div class="s">${[`${v.value} ${v.unit ?? ""}`.trim(), rangeText(v), pv].filter(Boolean).join(" · ")}</div>${raw(bar(v))}</div></div>`; }).join(""))}</div>`).join(""))}
    ${raw(!lab.values.length ? '<div class="empty dempty">No values yet: Edit to read them with Claude or type them.</div>' : "")}
    <p class="note hlnote">Values ${lab.values.length ? "as saved" : ""} from the report. This isn't medical advice: talk to your doctor about results.</p>
    <div class="btns"><button class="btn" type="button" id="hlBack">Back</button><button class="btn pri" type="button" id="hlEditLab">Edit or see the report</button></div>`;
}

function draw(root: HTMLElement): void {
  if (!ctx.store) { root.innerHTML = html`<section class="card"><h2>Health</h2><p>Readings, lab reports, medicines and check-ups for each person. Sign in to open it.</p></section>`; return; }
  const r = reader(), t = today(), lid = labPage(), lab = lid ? r.get<Lab>("hlLabs", lid) : undefined;
  const scroll = window.scrollY;
  root.innerHTML = html`<div class="mv hlv"><div class="wrap" id="hlView">${raw(lab && !lab.deleted ? labView(r, lab, t) : mainPage(r, t))}</div></div>`;
  if (!lid) window.scrollTo(0, scroll);
}

function onTap(e: Event): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-person],[data-kind],[data-lab],[data-med],[data-take],[data-ck],[data-visit],#hlAddP,#hlRead,#hlLab,#hlMed,#hlCk,#hlVisit,#hlBack,#hlEditLab");
  if (!el || !rootEl?.contains(el) || document.body.dataset.mod !== "health") return;
  const d = el.dataset, r = reader();
  if (d.person) { person = d.person; keep(); return redraw(); }
  if (el.id === "hlAddP") return ownerForm("people", undefined, (o) => { person = o.id; keep(); redraw(); });
  if (d.kind) return readingSheet(person, d.kind);
  if (d.lab) { location.hash = `#/health/lab/${encodeURIComponent(d.lab)}`; return; }
  if (d.take) {
    const m = r.get<Med>("hlMeds", d.take); if (!m) return;
    const id = logId(m.id, today(), d.time!), was = taken(r, m, today(), d.time!);
    const ops: { c: string; r: Rec | null; id?: string }[] = [{ c: "hlMedLog", id, r: was ? null : { id, med: m.id, day: today(), time: d.time! } }];
    if (m.stock != null) ops.push({ c: "hlMeds", r: { ...m, stock: Math.max(0, m.stock + (was ? 1 : -1)) } });
    return hlWrite(ops);
  }
  if (d.med) return medForm(person, d.med);
  if (d.ck) return checkupForm(person, d.ck);
  if (d.visit) return visitForm(person, d.visit);
  if (el.id === "hlRead") return readingForm(person);
  if (el.id === "hlLab") return labForm(person);
  if (el.id === "hlMed") return medForm(person);
  if (el.id === "hlCk") return checkupForm(person);
  if (el.id === "hlVisit") return visitForm(person);
  if (el.id === "hlBack") { location.hash = "#/health"; return; }
  if (el.id === "hlEditLab") { const l = r.get<Lab>("hlLabs", labPage()); if (l) labForm(l.person, l.id); }
}
function onKey(e: KeyboardEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[role="button"]');
  if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); el.click(); }
}

let started = false;
/** Medicine and check-up reminders join the phone's (no medicine or test names on the lock screen). */
export function startHealth(): void {
  if (started || !ctx.store) return;
  started = true;
  setReminderSource("health", () => healthNotes(reader(), new Date()));
  scheduleReminders();
}

export const health: Module = {
  id: "health",
  label: "Health",
  icon: ICON,
  render(root) {
    ensureLayer();
    startMoney();   // Money's accounts and categories, for a doctor's fee
    startHealth();
    if (rootEl !== root) {
      rootEl = root;
      root.addEventListener("click", onTap);
      root.addEventListener("keydown", onKey);
    }
    draw(root);
  },
};
