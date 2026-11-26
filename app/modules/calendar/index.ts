/**
 * Calendar › Family days (approved design, 26 Nov 2026): birthdays, anniversaries, shraddha and other dates,
 * each on its English date and/or its tithi, with reminders on the phone. The tithi is the one at sunrise in
 * Bengaluru, worked out on this device (panchang.ts). The month view and festivals come later.
 */
import type { Module } from "../types.ts";
import { html, raw } from "../../core/dom.ts";
import { ctx } from "../../core/app.ts";
import type { Rec } from "../../core/store.ts";
import { scheduleReminders, setReminderSource } from "../../core/reminders.ts";
import { askConfirm, closeModal, ensureLayer, field, openSheet, toast, val } from "../money/ui/kit.ts";
import { MONTHS, PLACE, TITHIS, addDays, panchang } from "./panchang.ts";
import { famDays, famTitle, KINDS, occurrences, tithiLabel, upcoming, type FamDay, type Kind, type Occ } from "./data.ts";

export const ICON = "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M12 13.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z";
const reader = () => ({ all: <T extends Rec = Rec>(c: string): T[] => ctx.store?.all<T>(c) ?? [], get: <T extends Rec = Rec>(c: string, id: string): T | undefined => ctx.store?.get<T>(c, id) });
const pad = (n: number): string => String(n).padStart(2, "0");
const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dLbl = (d: string, year = false): string => `${+d.slice(8, 10)} ${MN[+d.slice(5, 7) - 1]}${year ? ` ${d.slice(0, 4)}` : ""}`;
const when = (d: string, t: string): string => (d === t ? "today" : d === addDays(t, 1) ? "tomorrow" : `${WD[new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).getDay()]} ${dLbl(d, d.slice(0, 4) !== t.slice(0, 4))}`);
const how = (o: Occ, f?: FamDay): string => (o.by === "tithi" ? `By tithi · ${f?.tithi ? tithiLabel(f.tithi) : ""}` : `By date${o.years ? ` · ${o.years} year${o.years === 1 ? "" : "s"}` : ""}`);

/** What's coming (for Today): the family days in the window. */
export function famItems(from: string, days: number): (Occ & { sub: string })[] {
  if (!ctx.store) return [];
  const r = reader(), byId = new Map(famDays(r).map((f) => [f.id, f]));
  return upcoming(r, from, days).map((o) => ({ ...o, sub: how(o, byId.get(o.id)) }));
}

/* ---------- the page ---------- */
let rootEl: HTMLElement | null = null;
function draw(root: HTMLElement): void {
  if (!ctx.store) { root.innerHTML = html`<section class="card"><h2>Calendar</h2><p>Family days open once the app is unlocked.</p></section>`; return; }
  const r = reader(), t = today(), all = famDays(r), byId = new Map(all.map((f) => [f.id, f]));
  const soon = upcoming(r, t, 60), p = panchang(t);
  const row = (o: Occ): string => html`<div class="row tap" data-fam="${o.id}" role="button" tabindex="0"><div class="main"><div class="t">${o.title}</div><div class="s">${how(o, byId.get(o.id))}</div></div><span class="calwhen ${o.date === t ? "on" : ""}">${when(o.date, t)}</span></div>`;
  const line = (f: FamDay): string => {
    const nx = occurrences(f, t, 400);
    const bits = [f.date ? `${f.kind === "birthday" ? "Born " : ""}${dLbl(f.date, true)}` : "", f.tithi ? tithiLabel(f.tithi) : ""].filter(Boolean).join(" · ");
    const nd = nx.find((x) => x.by === "date"), nt = nx.find((x) => x.by === "tithi");
    return html`<div class="row tap" data-fam="${f.id}" role="button" tabindex="0"><div class="main"><div class="t">${famTitle(f)}</div><div class="s">${bits}</div><div class="calnext">${raw([nd ? html`<span>Date · ${when(nd.date, t)}</span>` : "", nt ? html`<span>Tithi · ${when(nt.date, t)}</span>` : ""].join(""))}</div></div></div>`;
  };
  root.innerHTML = html`<div class="mv calv"><div class="wrap">
    <p class="calday">${dLbl(t)} · <b>${p.adhika ? "Adhika " : ""}${MONTHS[p.month]!} ${p.tithi === 14 || p.tithi === 29 ? "" : `${p.paksha} `}${p.name}</b></p>
    <h2>Family days</h2>
    <p class="note">Each one comes round on its English date, on its tithi, or both, and you're reminded of each. The tithi is the one at sunrise in ${PLACE.name}.</p>
    ${raw(all.length ? html`<h2>Next 60 days</h2>${raw(soon.length ? html`<div class="list">${raw(soon.map(row).join(""))}</div>` : html`<p class="note">Nothing in the next 60 days.</p>`)}
    <h2>All family days</h2><div class="list">${raw(all.slice().sort((a, b) => famTitle(a).localeCompare(famTitle(b))).map(line).join(""))}</div>` : html`<div class="empty">Add birthdays, anniversaries and shraddha with + below.</div>`)}
  </div></div>
  <button class="fab" type="button" id="calAdd" aria-label="Add a family day"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`;
}

/* ---------- add or change one ---------- */
const TITHI_OPTS = (paksha: "s" | "k"): [string, string][] => [...TITHIS.map((n, i) => [String(i), n] as [string, string]), ["14", paksha === "s" ? "Purnima" : "Amavasya"]];
export function famForm(id?: string): void {
  const f0 = id ? reader().get<FamDay>("famDays", id) : undefined;
  let kind: Kind = f0?.kind ?? "birthday";
  const t0 = f0?.tithi, pk0: "s" | "k" = t0 && t0.t >= 15 ? "k" : "s";
  openSheet(f0 ? famTitle(f0) : "Add a family day", html`
    <div class="calkinds" role="radiogroup" aria-label="What">${raw(KINDS.map(([k, l]) => html`<button type="button" role="radio" data-kind="${k}" aria-checked="${String(k === kind)}" class="${k === kind ? "on" : ""}">${l}</button>`).join(""))}</div>
    ${raw(field(["fname", "Name", "text", { value: f0?.name ?? "", ph: KINDS.find((k) => k[0] === kind)![2] }]))}
    ${raw(field(["fdate", "Date it happened (optional for a shraddha)", "date", { value: f0?.date ?? "" }]))}
    <p class="note" id="calFrom">${f0?.date ? "" : "Its tithi is worked out from the date."}</p>
    <div class="grid3"><div class="f"><label for="f_fm">Month</label><select id="f_fm">${raw(MONTHS.map((m, i) => html`<option value="${String(i)}" ${t0 && t0.m === i ? "selected" : ""}>${m}</option>`).join(""))}</select></div>
      <div class="f"><label for="f_fp">Paksha</label><select id="f_fp"><option value="s" ${pk0 === "s" ? "selected" : ""}>Shukla</option><option value="k" ${pk0 === "k" ? "selected" : ""}>Krishna</option></select></div>
      <div class="f"><label for="f_ft">Tithi</label><select id="f_ft"></select></div></div>
    <p class="note">Change it if the family keeps it on a different tithi. A shraddha whose date you don't know can be set by tithi alone.</p>
    <label class="calchk"><input type="checkbox" id="f_fbd" ${f0 ? (f0.byDate ? "checked" : "") : "checked"}> Remind me on the English date</label>
    <label class="calchk"><input type="checkbox" id="f_fbt" ${f0 ? (f0.byTithi ? "checked" : "") : "checked"}> Remind me on the tithi</label>
    <label class="calchk"><input type="checkbox" id="f_fbf" ${f0?.before ? "checked" : ""}> And 2 days before each</label>
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button>${raw(f0 ? '<button class="btn danger" id="dl" type="button">Delete</button>' : "")}</div>`, (s) => {
    const q = <T extends HTMLElement>(sel: string): T => s.querySelector<T>(sel)!;
    const fm = q<HTMLSelectElement>("#f_fm"), fp = q<HTMLSelectElement>("#f_fp"), ft = q<HTMLSelectElement>("#f_ft"), fd = q<HTMLInputElement>("#f_fdate");
    const fillT = (keep: number): void => { ft.innerHTML = TITHI_OPTS(fp.value as "s" | "k").map(([v, l]) => html`<option value="${v}" ${+v === keep ? "selected" : ""}>${l}</option>`).join(""); };
    fillT(t0 ? t0.t % 15 : 0);
    fp.onchange = () => fillT(+ft.value);
    const fromDate = (): void => {
      if (!/^\d{4}-\d\d-\d\d$/.test(fd.value)) return;
      const p = panchang(fd.value);
      fm.value = String(p.month); fp.value = p.tithi < 15 ? "s" : "k"; fillT(p.tithi % 15);
      q("#calFrom").textContent = `${fd.value.slice(8, 10)}/${fd.value.slice(5, 7)}/${fd.value.slice(0, 4)} was ${tithiLabel({ m: p.month, t: p.tithi })}${p.adhika ? " (an Adhika month; reminded in the regular one)" : ""}.`;
    };
    fd.addEventListener("change", fromDate);
    s.querySelectorAll<HTMLElement>("[data-kind]").forEach((b) => { b.onclick = () => {
      kind = b.dataset.kind as Kind;
      s.querySelectorAll<HTMLElement>("[data-kind]").forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-checked", String(on)); });
      q<HTMLInputElement>("#f_fname").placeholder = KINDS.find((k) => k[0] === kind)![2];
    }; });
    q("#cx").onclick = closeModal;
    q("#sv").onclick = () => {
      const name = val("fname"), date = fd.value, byDate = q<HTMLInputElement>("#f_fbd").checked, byTithi = q<HTMLInputElement>("#f_fbt").checked;
      if (!name) return toast("Give it a name.");
      if (!date && !byTithi) return toast("Add the date, or keep it by tithi.");
      if (!byDate && !byTithi) return toast("Pick the English date, the tithi, or both.");
      const f: FamDay = { ...(f0 ?? { id: uid() }), kind, name, byDate: byDate && !!date, byTithi, tithi: { m: +fm.value, t: +ft.value + (fp.value === "k" ? 15 : 0) } } as FamDay;
      if (date) f.date = date; else delete f.date;
      if (q<HTMLInputElement>("#f_fbf").checked) f.before = 2; else delete f.before;
      closeModal();
      ctx.store?.writeMany([{ c: "famDays", id: f.id, r: { ...f, updatedAt: Date.now() } }]);
      scheduleReminders();
      toast(f0 ? "Saved" : `${famTitle(f)} added`);
    };
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => askConfirm(`Delete ${famTitle(f0!)}?`, "Delete", () => { ctx.store?.writeMany([{ c: "famDays", id: f0!.id, r: null }]); scheduleReminders(); }));
  });
}

function onTap(e: Event): void {
  if (document.body.dataset.mod !== "calendar") return;
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-fam],#calAdd");
  if (!el || !rootEl?.contains(el)) return;
  if (el.id === "calAdd") return famForm();
  famForm(el.dataset.fam);
}
function onKey(e: KeyboardEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[role="button"]');
  if (el && rootEl?.contains(el) && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); el.click(); }
}

/** On the day (7 AM) and, if asked, 2 days before (9 AM). Names only. */
export function famNotes(now: Date, horizon = 45): { title: string; at: Date }[] {
  if (!ctx.store) return [];
  const t = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, byId = new Map(famDays(reader()).map((f) => [f.id, f])), out: { title: string; at: Date }[] = [];
  const at = (d: string, h: number, back = 0): Date => { const x = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), h); x.setDate(x.getDate() - back); return x; };
  for (const o of upcoming(reader(), t, horizon + 2)) {
    const by = o.by === "tithi" ? "by tithi" : "by date";
    out.push({ title: `${o.title} today (${by})`, at: at(o.date, 7) });
    if (byId.get(o.id)?.before) out.push({ title: `${o.title} in 2 days (${by})`, at: at(o.date, 9, 2) });
  }
  return out.filter((n) => n.at > now);
}
let started = false;
export function startCalendar(): void {
  if (started || !ctx.store) return;
  started = true;
  setReminderSource("calendar", () => famNotes(new Date()));
  scheduleReminders();
}

export const calendar: Module = {
  id: "calendar",
  label: "Calendar",
  icon: ICON,
  render(root) {
    if (ctx.store) ensureLayer();
    if (rootEl !== root) { rootEl = root; root.addEventListener("click", onTap); root.addEventListener("keydown", onKey); }
    draw(root);
  },
};
