/** Habits' sheets (Money's sheet kit, so they look and work the same). */
import { html, raw } from "../../core/dom.ts";
import { isNative } from "../../core/native.ts";
import { askConfirm, closeModal, field, openSheet, toast, val } from "../money/ui/kit.ts";
import { dayLabel, DN, habitsOf, HABITS, ICONS, LOG, logsOf, nudgeTime, PREFS, STARTERS, valueOn, type Day, type Habit, type Kind } from "./data.ts";
import { hbWrite, reader, setValue, timeLabel, today } from "./index.ts";

const uid = (): string => "hb" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T => s.querySelector<T>("#" + id)!;
const KINDS: [Kind, string][] = [["check", "Done / not"], ["amount", "Amount"], ["weekly", "Times a week"], ["avoid", "Avoid"]];
const whole = (s: string): number => { const n = Math.round(Number(s)); return Number.isFinite(n) ? n : 0; };

/* ---------- add or change a habit ---------- */
export function habitForm(id?: string): void {
  const r = reader(), h = id ? r.get<Habit>(HABITS, id) : undefined, t = today();
  const hasLog = !!h && r.all<{ h: string; deleted?: boolean } & { id: string }>(LOG).some((l) => l.h === h.id && !l.deleted);
  let kind: Kind = h?.kind ?? "check", icon = h?.icon ?? ICONS[0]!;
  const days = new Set<number>(h?.days?.length ? h.days : [0, 1, 2, 3, 4, 5, 6]);
  openSheet(h ? h.name : "New habit", html`${raw(field(["hbname", "Name", "text", { value: h?.name, ph: "e.g. Walk 30 min, Surya namaskara, No sugar" }]))}
    <div class="f"><label>Kind${hasLog ? " (can't change once ticked)" : ""}</label><div class="hbkinds" id="hbKinds">${raw(KINDS.map(([k, l]) => html`<button type="button" data-kind="${k}" ${hasLog && k !== kind ? "disabled" : ""}>${l}</button>`).join(""))}</div><div class="hint" id="hbKindHint"></div></div>
    <div class="grid2" id="hbAmt">${raw(field(["hbtarget", "Target a day", "number", { value: h?.kind === "amount" ? h.target : 8 }]))}${raw(field(["hbunit", "Unit", "text", { value: h?.unit ?? "glasses", ph: "glasses, steps, minutes" }]))}</div>
    <div id="hbWk">${raw(field(["hbtimes", "Times a week", "select", { value: String(h?.kind === "weekly" ? h.target : 3), options: [1, 2, 3, 4, 5, 6].map((n) => [String(n), `${n}× a week`]) }]))}</div>
    <div class="f" id="hbGoalBox"><label class="opt hbopt"><input type="checkbox" id="hbGoalOn" ${h?.goal ? "checked" : ""}><div><b>For a set number of days</b><span>Every day until it's done that many days. A missed day moves the finish on.</span></div></label>
      <div id="hbGoalN">${raw(field(["hbgoal", "Number of days", "number", { value: h?.goal ?? 40 }]))}</div></div>
    <div class="f" id="hbDays"><label>Which days</label><div class="hbdows">${raw(DN.map((n, i) => html`<button type="button" data-dow="${String(i)}" aria-label="${n}">${n.slice(0, 1)}</button>`).join(""))}</div></div>
    <div class="f"><label>Icon</label><div class="hbicons">${raw(ICONS.map((e) => html`<button type="button" data-icon="${e}">${e}</button>`).join(""))}</div></div>
    ${raw(h ? "" : field(["hbstart", "Starts", "date", { value: t }]))}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button>${raw(h ? '<button class="btn danger" id="dl" type="button">Delete</button>' : "")}</div>`, (s) => {
    const paint = (): void => {
      s.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach((b) => { b.classList.toggle("on", b.dataset.kind === kind); b.setAttribute("aria-pressed", String(b.dataset.kind === kind)); });
      s.querySelectorAll<HTMLButtonElement>("[data-dow]").forEach((b) => { const on = days.has(+b.dataset.dow!); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
      s.querySelectorAll<HTMLButtonElement>("[data-icon]").forEach((b) => b.classList.toggle("on", b.dataset.icon === icon));
      const goalOk = kind === "check" || kind === "amount", goal = goalOk && $<HTMLInputElement>(s, "hbGoalOn").checked;
      $(s, "hbAmt").hidden = kind !== "amount";
      $(s, "hbWk").hidden = kind !== "weekly";
      $(s, "hbGoalBox").hidden = !goalOk;
      $(s, "hbGoalN").hidden = !goal;
      $(s, "hbDays").hidden = !goalOk || goal;
      $(s, "hbKindHint").textContent = { check: "Tick it on the days you do it.", amount: "Count up to a target each day, like 8 glasses of water.", weekly: "A number of times each week, on any days.", avoid: "Every day counts as clean unless you mark a slip." }[kind];
    };
    s.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-kind],[data-dow],[data-icon],#hbGoalOn");
      if (!b || b.disabled) return;
      if (b.dataset.kind) kind = b.dataset.kind as Kind;
      if (b.dataset.dow) { const n = +b.dataset.dow; if (days.has(n)) { if (days.size > 1) days.delete(n); } else days.add(n); }
      if (b.dataset.icon) icon = b.dataset.icon;
      paint();
    });
    paint();
    $(s, "cx").onclick = closeModal;
    $(s, "sv").onclick = () => {
      const name = val("hbname"); if (!name) return toast("Give it a name.");
      const o: Habit = { ...(h ?? { id: uid(), start: val("hbstart") || t, order: habitsOf(reader()).length }), name, icon, kind };
      delete o.target; delete o.unit; delete o.days; delete o.goal;
      if (kind === "amount") { const n = whole(val("hbtarget")); if (n < 1) return toast("Set a target, like 8."); o.target = n; o.unit = val("hbunit") || undefined; if (!o.unit) delete o.unit; }
      if (kind === "weekly") o.target = whole(val("hbtimes")) || 3;
      const goalOn = (kind === "check" || kind === "amount") && $<HTMLInputElement>(s, "hbGoalOn").checked;
      if (goalOn) { const n = whole(val("hbgoal")); if (n < 2 || n > 1000) return toast("Number of days: 2 to 1000."); o.goal = n; if (h?.completed && n !== h.goal) delete o.completed; }
      else { delete o.completed; if ((kind === "check" || kind === "amount") && days.size < 7) o.days = [...days].sort(); }
      closeModal(); hbWrite([{ c: HABITS, r: o }]); toast(h ? "Saved" : "Habit added");
    };
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => askConfirm(`Delete "${h!.name}" and all its ticks? To keep its history, use Stop habit instead.`, "Delete", () => {
      const logs = reader().all<{ id: string; h: string }>(LOG).filter((l) => l.h === h!.id);
      hbWrite([{ c: HABITS, id: h!.id, r: null }, ...logs.map((l) => ({ c: LOG, id: l.id, r: null }))]);
      location.hash = "#/habits";
    }));
  });
}

/* ---------- the usual ones ---------- */
export function starterSheet(): void {
  const have = new Set(habitsOf(reader()).map((h) => h.name.toLowerCase()));
  const opts = STARTERS.filter((x) => !have.has(x.name.toLowerCase()));
  const sub = (x: (typeof STARTERS)[number]): string => (x.kind === "amount" ? `${x.target} ${x.unit} a day` : x.kind === "weekly" ? `${x.target}× a week` : x.kind === "avoid" ? "to avoid" : "every day");
  openSheet("The usual habits", html`<p class="note" style="margin-top:0">Tick the ones you want. You can change them later.</p>
    ${raw(opts.map((x, i) => html`<label class="opt"><input type="checkbox" id="hs${String(i)}"><div><b>${x.icon ?? ""} ${x.name}</b><span>${sub(x)}</span></div></label>`).join(""))}
    <div class="btns"><button class="btn pri" id="sv" type="button">Add these</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $(s, "cx").onclick = closeModal;
    $(s, "sv").onclick = () => {
      const t = today(), n0 = habitsOf(reader()).length;
      const ops = opts.flatMap((x, i) => ($<HTMLInputElement>(s, `hs${i}`).checked ? [{ c: HABITS, r: { ...x, id: uid() + i, start: t, order: n0 + i } as Habit }] : []));
      if (!ops.length) return toast("Tick at least one.");
      closeModal(); hbWrite(ops); toast(`${ops.length} habit${ops.length === 1 ? "" : "s"} added`);
    };
  });
}

/* ---------- the evening nudge ---------- */
export function nudgeSheet(): void {
  const cur = nudgeTime(reader());
  openSheet("Evening nudge", html`<p class="note" style="margin-top:0">One reminder on the phone in the evening, only when something is left for that day. It says how many, never which.</p>
    <label class="opt"><input type="checkbox" id="nuOn" ${cur ? "checked" : ""}><div><b>Remind me</b><span>if anything's left for the day</span></div></label>
    ${raw(field(["nutime", "At", "time", { value: cur || "21:00" }]))}
    ${raw(isNative() ? "" : html`<p class="note">Reminders come on the Android app.</p>`)}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $(s, "cx").onclick = closeModal;
    $(s, "sv").onclick = () => {
      const on = $<HTMLInputElement>(s, "nuOn").checked, at = val("nutime");
      if (on && !/^\d\d:\d\d$/.test(at)) return toast("Pick a time.");
      closeModal(); hbWrite([{ c: PREFS, r: { id: "prefs", nudge: on ? at : "" } }]);
      toast(on ? `Nudge at ${timeLabel(at)}` : "Nudge off");
    };
  });
}

/* ---------- an amount on a past day ---------- */
export function amountSheet(h: Habit, d: Day): void {
  const v = valueOn(logsOf(reader()), h, d);
  openSheet(`${h.name} · ${dayLabel(d, today())}`, html`${raw(field(["amt", `How many ${h.unit ?? ""} (target ${h.target})`, "number", { value: v || "" }]))}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $(s, "cx").onclick = closeModal;
    $(s, "sv").onclick = () => { closeModal(); setValue(h, d, Math.max(0, whole(val("amt")))); };
  });
}

/** One day from the heatmap, on a phone: two big buttons instead of a 10px square. */
export function daySheet(h: Habit, d: Day, on: boolean, set: (v: number) => void): void {
  const [yes, no] = h.kind === "avoid" ? ["Slipped", "Kept away"] : ["Done", "Not done"];
  openSheet(`${h.name} · ${dayLabel(d, today())}`, html`<p class="note" style="margin-top:0">Now: ${on ? yes : no}.</p>
    <div class="hbdaybtns"><button class="btn${on ? " pri" : ""}" id="dYes" type="button">${yes}</button><button class="btn${on ? "" : " pri"}" id="dNo" type="button">${no}</button></div>
    <div class="btns"><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $(s, "cx").onclick = closeModal;
    $(s, "dYes").onclick = () => { closeModal(); if (!on) set(1); };
    $(s, "dNo").onclick = () => { closeModal(); if (on) set(0); };
  });
}

/* ---------- a set number of days, done ---------- */
export function goalDoneSheet(h: Habit): void {
  openSheet(`🎉 ${h.goal} days`, html`<p>You've done <b>${h.name}</b> for ${String(h.goal)} days.</p><p class="note">Carry on as a daily habit (its days so far count towards the streak), or finish it here; it stays under Stopped or finished.</p>
    <div class="btns"><button class="btn pri" id="goOn" type="button">Carry on daily</button><button class="btn" id="goEnd" type="button">Finish</button></div>`, (s) => {
    $(s, "goOn").onclick = () => { const o: Habit = { ...h }; delete o.goal; delete o.completed; closeModal(); hbWrite([{ c: HABITS, r: o }]); toast(`${h.name} carries on every day`); };
    $(s, "goEnd").onclick = () => { closeModal(); hbWrite([{ c: HABITS, r: { ...h, completed: today() } }]); toast("Finished. Well done!"); };
  });
}
