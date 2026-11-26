/** Health's sheets: readings, lab reports (values read by Claude or typed), medicines, check-ups, visits. */
import { aiOn } from "../../core/ai.ts";
import { html, raw } from "../../core/dom.ts";
import type { Rec } from "../../core/store.ts";
import { filesOf, readFile, removeFile, type FileRec } from "../../core/files.ts";
import { callable } from "../../core/firebase.ts";
import { askConfirm, closeModal, field, openSheet, toast, val } from "../../core/ui.ts";
import { pdfLines } from "../money/ui/pdf.ts";
import { viewFile } from "../household/forms.ts";
import { costFields, costOps } from "../household/forms.ts";
import { fileTiles } from "../shared/filetiles.ts";
import {
  addMonths, CHECKUP_STARTERS, DAYS, dayLabel, flag, fmt, habitsPerson, heightOf, KINDS, kindOf, LAB_PROMPT, parseLabJson, people, rangeText, readingsOf,
  sparkPoints, type Checkup, type Lab, type LabValue, type Med, type Reading, type Visit,
} from "./data.ts";
import { hlWrite, reader, today } from "./index.ts";

const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const $ = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T => s.querySelector<T>("#" + id)!;
const num = (s: string): number | undefined => { const n = parseFloat(s); return Number.isFinite(n) ? n : undefined; };
const personOpts = (): [string, string][] => people(reader()).map((p) => [p.id, p.name]);
const btns = (isNew: boolean, save = "Save"): string => html`<div class="btns"><button class="btn pri" id="sv" type="button">${save}</button><button class="btn" id="cx" type="button">Cancel</button>${raw(isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>')}</div>`;
const MED_CATS = [/medic|health|pharma|doctor/i, /personal/i];

/* ---------- readings ---------- */
export function readingForm(person: string, kind = "weight", id?: string): void {
  const r = reader(), x = id ? r.get<Reading>("hlReadings", id) : undefined, t = today();
  const k0 = x?.kind ?? kind;
  openSheet(x ? kindOf(k0).label : "Add a reading", html`<div class="grid2">${raw(field(["rkind", "What", "select", { value: k0, options: KINDS.map((k) => [k.k, k.label] as [string, string]) }]))}${raw(field(["rdate", "Date", "date", { value: x?.date ?? t }]))}</div>
    <div class="grid2" id="rvals"></div>
    ${raw(field(["rnote", "Note (optional)", "text", { value: x?.note, ph: "e.g. after a walk, at the clinic" }]))}${raw(btns(!x))}`, (s) => {
    const fill = (): void => {
      const k = kindOf(val("rkind"));
      $(s, "rvals").innerHTML = k.two ? field(["rv", "Upper (systolic)", "number", { value: x?.kind === k.k ? x.v : "" }]) + field(["rv2", "Lower (diastolic)", "number", { value: x?.kind === k.k ? x.v2 ?? "" : "" }]) : field(["rv", `${k.label} (${k.unit})`, "number", { value: x?.kind === k.k ? x.v : "", step: k.dp ? "0.1" : "1" }]);
    };
    $(s, "f_rkind").onchange = fill; fill();
    $(s, "cx").onclick = closeModal;
    $(s, "sv").onclick = () => {
      const k = kindOf(val("rkind")), v = num(val("rv")), v2 = k.two ? num(val("rv2")) : undefined, date = val("rdate") || t;
      if (v == null || v <= 0 || (k.two && (v2 == null || v2 <= 0))) return toast("Enter the reading.");
      const o: Reading = { ...(x ?? { id: uid(), person }), kind: k.k, v, date, ...(k.two ? { v2 } : {}) } as Reading;
      if (val("rnote")) o.note = val("rnote"); else delete o.note;
      const ops: { c: string; r: Rec | null; id?: string }[] = [{ c: "hlReadings", r: o }];
      // a "Weigh in" habit is ticked by a weight reading (for whoever's habits they are)
      if (k.k === "weight" && habitsPerson(r)?.id === person) for (const h of r.all<Rec & { name?: string; kind?: string; deleted?: boolean }>("habits")) if (!h.deleted && h.kind === "check" && /weigh/i.test(h.name ?? "")) ops.push({ c: "habitLog", r: { id: `${h.id}_${date}`, h: h.id, d: date, v: 1 } });
      closeModal(); hlWrite(ops);
      const [st, txt] = k.status(v, v2, heightOf(r, person));
      toast(`Saved${txt ? ` · ${txt}` : ""}${st === "high" ? ". Talk to your doctor if it stays like this." : ""}`);
    };
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => { closeModal(); hlWrite([{ c: "hlReadings", id: x!.id, r: null }]); });
  });
}

/** A kind's readings: a bigger chart and the list. */
export function readingSheet(person: string, kind: string): void {
  const r = reader(), k = kindOf(kind), list = readingsOf(r, person, kind), t = today(), h = heightOf(r, person);
  const pts = sparkPoints(list.slice(-30).map((x) => x.v)), pts2 = k.two ? sparkPoints(list.slice(-30).map((x) => x.v2 ?? 0)) : "";
  openSheet(k.label, html`${raw(pts ? html`<svg class="hlchart" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/>${raw(pts2 ? html`<polyline class="two" points="${pts2}"/>` : "")}</svg>` : "")}
    <div class="list">${raw([...list].reverse().slice(0, 40).map((x) => { const [st, txt] = k.status(x.v, x.v2, h); return html`<div class="row tap" data-rd="${x.id}" role="button" tabindex="0"><div class="main"><div class="t">${fmt(x)} ${k.unit}</div><div class="s">${dayLabel(x.date, t)}${x.note ? ` · ${x.note}` : ""}</div></div>${raw(txt ? html`<span class="due ${st === "high" || st === "low" ? "bad" : st === "warn" ? "warn" : ""}">${txt}</span>` : "")}</div>`; }).join(""))}</div>
    ${raw(kind === "weight" ? html`<p class="note">${h ? `Height ${h} cm, for BMI.` : "Add your height for BMI."} <button type="button" class="btn sm" id="hgt">${h ? "Change height" : "Add height"}</button></p>` : "")}
    <div class="btns"><button class="btn pri" type="button" id="radd">＋ Add a reading</button><button class="btn" type="button" id="cx">Close</button></div>`, (s) => {
    $(s, "cx").onclick = closeModal;
    $(s, "radd").onclick = () => { closeModal(); readingForm(person, kind); };
    s.querySelector<HTMLElement>("#hgt")?.addEventListener("click", () => { closeModal(); heightForm(person); });
    s.querySelectorAll<HTMLElement>("[data-rd]").forEach((b) => b.addEventListener("click", () => { closeModal(); readingForm(person, kind, b.dataset.rd); }));
  });
}
export function heightForm(person: string): void {
  openSheet("Height", html`${raw(field(["hh", "Height (cm)", "number", { value: heightOf(reader(), person) ?? "" }]))}${raw(btns(true))}`, (s) => {
    $(s, "cx").onclick = closeModal;
    $(s, "sv").onclick = () => { const h = num(val("hh")); if (!h || h < 50 || h > 250) return toast("Height in cm, e.g. 175."); closeModal(); hlWrite([{ c: "hlProfiles", r: { id: person, height: h } }]); };
  });
}

/* ---------- lab reports ---------- */
/** Tests swap in a stand-in for Claude. */
let readValues = async (text: string): Promise<string> => {
  const fn = await callable("askClaude", 300000);
  const r = (await fn({ messages: [{ role: "user", content: LAB_PROMPT + text.slice(0, 120000) }] })) as { data?: { text?: string } };
  return r.data?.text ?? "";
};
export const setLabReader = (f: (text: string) => Promise<string>): void => { readValues = f; };

interface LabDraft { lab: Lab; isNew: boolean; added: FileRec[] }
export function labForm(person: string, id?: string, again?: LabDraft): void {
  const r = reader(), l0 = again?.lab ?? (id ? r.get<Lab>("hlLabs", id) : undefined), isNew = again ? again.isNew : !l0, t = today();
  const lab: Lab = l0 ?? ({ id: uid(), person, date: t, values: [] } as Lab);
  let values: LabValue[] = lab.values.map((v) => ({ ...v }));
  openSheet(isNew ? "Add lab report" : `Lab report · ${dayLabel(lab.date, t)}`, html`<div class="grid2">${raw(field(["lperson", "Whose", "select", { value: lab.person, options: personOpts() }]))}${raw(field(["ldate", "Date", "date", { value: lab.date }]))}</div>
    ${raw(field(["llab", "Lab (optional)", "text", { value: lab.lab, ph: "e.g. the diagnostics centre" }]))}
    <div class="f"><label>Report (PDF or photos) <span class="hhenc">encrypted, in your Google Drive</span></label><div class="hhfiles" id="lFiles"></div></div>
    ${raw(aiOn() ? html`<div class="btns"><button class="btn" type="button" id="lread">✨ Read values with Claude</button><button class="btn" type="button" id="ltype">✎ Type values</button></div>
    <p class="note">Read with Claude: the report's text is sent to Claude (through the app's own server) to pick out the values. It isn't kept or used for training. Check every value before saving.</p>` : html`<div class="btns"><button class="btn" type="button" id="ltype">✎ Type values</button></div>`)}
    <div id="lvals"></div>
    ${raw(btns(isNew))}`, (s) => {
    const added: FileRec[] = again?.added ?? [];
    const owner = { c: "hlLabs", id: lab.id };
    const draft = (): Lab => ({ ...lab, person: val("lperson") || lab.person, date: val("ldate") || t, ...(val("llab") ? { lab: val("llab") } : {}), values: collect() });
    const tiles = fileTiles(s, "lFiles", owner, (f) => viewFile(f, () => labForm(person, lab.id, { lab: draft(), isNew, added })), added);
    const editor = (): void => {
      $(s, "lvals").innerHTML = html`${raw(values.length ? "" : '<p class="note">No values yet.</p>')}${raw(values.map((v, i) => html`<div class="lvrow" data-i="${String(i)}">
        <input class="lvn" value="${v.name}" placeholder="Test, e.g. LDL" aria-label="Test name">
        <input class="lvv" value="${String(v.value ?? "")}" placeholder="Value" aria-label="Value" inputmode="decimal">
        <input class="lvu" value="${v.unit ?? ""}" placeholder="Unit" aria-label="Unit">
        <input class="lvl" value="${v.low ?? ""}" placeholder="Low" aria-label="Normal from" inputmode="decimal">
        <input class="lvh" value="${v.high ?? ""}" placeholder="High" aria-label="Normal to" inputmode="decimal">
        <button type="button" class="lvx" aria-label="Remove">×</button></div>`).join(""))}
        <div class="btns"><button class="btn sm" type="button" id="lvadd">＋ Add a value</button></div>`;
      $(s, "lvals").querySelectorAll<HTMLElement>(".lvx").forEach((b) => b.addEventListener("click", () => { values = collect(); values.splice(+b.closest<HTMLElement>(".lvrow")!.dataset.i!, 1); editor(); }));
      $(s, "lvadd").onclick = () => { values = collect(); values.push({ name: "", value: "" }); editor(); [...s.querySelectorAll<HTMLInputElement>(".lvrow .lvn")].pop()?.focus(); };
    };
    function collect(): LabValue[] {
      const rows = [...s.querySelectorAll<HTMLElement>(".lvrow")];
      if (!rows.length) return values;
      return rows.map((row) => {
        const g = (c: string): string => row.querySelector<HTMLInputElement>(c)!.value.trim(), i = +row.dataset.i!;
        const n = num(g(".lvv"));
        return { ...(values[i]?.group ? { group: values[i]!.group } : {}), name: g(".lvn"), value: n ?? g(".lvv"), ...(g(".lvu") ? { unit: g(".lvu") } : {}), low: num(g(".lvl")) ?? null, high: num(g(".lvh")) ?? null };
      });
    }
    if (values.length) editor();
    $(s, "ltype").onclick = () => { if (!values.length) values.push({ name: "", value: "" }); editor(); };
    const lr = s.querySelector<HTMLButtonElement>("#lread");
    if (lr) lr.onclick = async () => {
      const b = $<HTMLButtonElement>(s, "lread");
      const pdfs = [...tiles.picked.filter((f) => f.type === "application/pdf")];
      try {
        b.disabled = true; b.textContent = "Reading the report…";
        let text = "";
        for (const f of pdfs) text += (await pdfLines(f)).join("\n") + "\n";
        if (!pdfs.length) for (const f of filesOf(owner).filter((x) => x.mime === "application/pdf")) text += (await pdfLines(await readFile(f))).join("\n") + "\n";
        if (!text.trim()) { toast(filesOf(owner).length ? "This report has no text to read (a scan or a photo). Type the values instead." : "Add the report's PDF first."); return; }
        b.textContent = "Claude is reading the values…";
        const got = parseLabJson(await readValues(text));
        if (!got.values.length) { toast("No values found. Type them instead."); return; }
        values = got.values;
        if (got.date && (isNew || !l0?.values.length)) $<HTMLInputElement>(s, "f_ldate").value = got.date;
        if (got.lab && !val("llab")) $<HTMLInputElement>(s, "f_llab").value = got.lab;
        editor();
        toast(`${got.values.length} values read. Check them, then Save.`);
      } catch (e) { toast(`Couldn't read the values: ${e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)}`); }
      finally { b.disabled = false; b.textContent = "✨ Read values with Claude"; }
    };
    $(s, "cx").onclick = () => { closeModal(); if (isNew) for (const f of added) void removeFile(f); };
    $(s, "sv").onclick = () => {
      const o = draft(); o.values = o.values.filter((v) => v.name && v.value !== "");
      if (!o.values.length && !filesOf(owner).length) return toast("Add the report or some values.");
      closeModal(); hlWrite([{ c: "hlLabs", r: o }]); toast(isNew ? "Lab report added" : "Saved");
      location.hash = `#/health/lab/${encodeURIComponent(o.id)}`;
    };
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => askConfirm(`Delete this lab report and its ${filesOf(owner).length} file(s)?`, "Delete", () => {
      for (const f of filesOf(owner)) void removeFile(f);
      hlWrite([{ c: "hlLabs", id: lab.id, r: null }]); location.hash = "#/health";
    }));
  });
}
export { flag, rangeText };

/* ---------- medicines ---------- */
export function medForm(person: string, id?: string): void {
  const r = reader(), m = id ? r.get<Med>("hlMeds", id) : undefined, t = today();
  const days = new Set<number>(m?.days?.length ? m.days : [0, 1, 2, 3, 4, 5, 6]);
  openSheet(m ? m.name : "Add medicine or supplement", html`<div class="grid2">${raw(field(["mname", "Name", "text", { value: m?.name, ph: "e.g. Vitamin D3 60K" }]))}${raw(field(["mdose", "Dose (optional)", "text", { value: m?.dose, ph: "e.g. 1 tablet after breakfast" }]))}</div>
    <div class="grid2">${raw(field(["mt1", "Time", "time", { value: m?.times[0] ?? "08:00" }]))}${raw(field(["mt2", "Second time (optional)", "time", { value: m?.times[1] ?? "" }]))}</div>
    <div class="f"><label>Which days</label><div class="hbdows">${raw(DAYS.map((d, i) => html`<button type="button" data-dow="${String(i)}">${d.slice(0, 1)}</button>`).join(""))}</div></div>
    <div class="grid2">${raw(field(["mstock", "Tablets left (optional)", "number", { value: m?.stock ?? "" }]))}${raw(field(["mstart", "From", "date", { value: m?.start ?? t }]))}</div>
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button>${raw(m ? '<button class="btn" id="stop" type="button">Stop taking</button><button class="btn danger" id="dl" type="button">Delete</button>' : "")}</div>`, (s) => {
    const paint = (): void => s.querySelectorAll<HTMLElement>("[data-dow]").forEach((b) => { const on = days.has(+b.dataset.dow!); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    s.querySelectorAll<HTMLElement>("[data-dow]").forEach((b) => b.addEventListener("click", () => { const n = +b.dataset.dow!; if (days.has(n)) { if (days.size > 1) days.delete(n); } else days.add(n); paint(); }));
    paint();
    $(s, "cx").onclick = closeModal;
    $(s, "sv").onclick = () => {
      const name = val("mname"); if (!name) return toast("Name it, e.g. Multivitamin.");
      const times = [val("mt1"), val("mt2")].filter((x) => /^\d\d:\d\d$/.test(x)).sort();
      if (!times.length) return toast("Set a time.");
      const o: Med = { ...(m ?? { id: uid(), person }), name, times, start: val("mstart") || t } as Med;
      if (val("mdose")) o.dose = val("mdose"); else delete o.dose;
      if (days.size < 7) o.days = [...days].sort(); else delete o.days;
      const st = num(val("mstock")); if (st != null && st >= 0) o.stock = Math.round(st); else delete o.stock;
      closeModal(); hlWrite([{ c: "hlMeds", r: o }]); toast(m ? "Saved" : "Added. You'll get a reminder at its time.");
    };
    s.querySelector<HTMLElement>("#stop")?.addEventListener("click", () => { closeModal(); hlWrite([{ c: "hlMeds", r: { ...m!, stopped: t } }]); toast("Stopped. It stays in the history."); });
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => askConfirm(`Delete ${m!.name}?`, "Delete", () => hlWrite([{ c: "hlMeds", id: m!.id, r: null }])));
  });
}

/* ---------- check-ups ---------- */
export function checkupForm(person: string, id?: string): void {
  const r = reader(), c = id ? r.get<Checkup>("hlCheckups", id) : undefined, t = today();
  const EVERY: [string, string][] = [1, 3, 6, 12, 24, 36].map((n) => [String(n), n === 12 ? "every year" : n % 12 === 0 ? `every ${n / 12} years` : `every ${n} months`]);
  openSheet(c ? c.name : "Add a check-up", html`${raw(c ? "" : html`<div class="dsugg">${raw(CHECKUP_STARTERS.map((x) => html`<button type="button" class="btn sm" data-st="${x.name}" data-ev="${String(x.every)}">${x.name}</button>`).join(""))}</div>`)}
    ${raw(field(["cname", "What", "text", { value: c?.name, ph: "e.g. Full body check-up, Dentist" }]))}
    <div class="grid2">${raw(field(["cevery", "Repeats", "select", { value: String(c?.every ?? 12), options: EVERY }]))}${raw(field(["cdue", "Next due", "date", { value: c?.due ?? addMonths(t, 1) }]))}</div>
    ${raw(c ? html`<div class="sh"><h3>Done?</h3></div>${raw(field(["cdone", "Done on", "date", { value: t }]))}` : "")}
    <div class="btns"><button class="btn pri" id="sv" type="button">${c ? "Save" : "Add"}</button>${raw(c ? '<button class="btn pri" id="done" type="button">Mark done</button>' : "")}<button class="btn" id="cx" type="button">Cancel</button>${raw(c ? '<button class="btn danger" id="dl" type="button">Delete</button>' : "")}</div>`, (s) => {
    s.querySelectorAll<HTMLElement>("[data-st]").forEach((b) => b.addEventListener("click", () => { $<HTMLInputElement>(s, "f_cname").value = b.dataset.st!; $<HTMLSelectElement>(s, "f_cevery").value = b.dataset.ev!; }));
    $(s, "cx").onclick = closeModal;
    $(s, "sv").onclick = () => {
      const name = val("cname"); if (!name) return toast("Say what it is.");
      const o = { ...(c ?? { id: uid(), person }), name, every: +val("cevery") || 12, due: val("cdue") || addMonths(t, 1) };
      closeModal(); hlWrite([{ c: "hlCheckups", r: o }]);
    };
    s.querySelector<HTMLElement>("#done")?.addEventListener("click", () => {
      const d = val("cdone") || t, next = addMonths(d, c!.every);
      closeModal(); hlWrite([{ c: "hlCheckups", r: { ...c!, last: d, due: next } }]); toast(`Done. Next ${dayLabel(next, t)}`);
    });
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => { closeModal(); hlWrite([{ c: "hlCheckups", id: c!.id, r: null }]); });
  });
}

/* ---------- doctor visits ---------- */
export function visitForm(person: string, id?: string, again?: { v: Visit; isNew: boolean; added: FileRec[] }): void {
  const r = reader(), v0 = again?.v ?? (id ? r.get<Visit>("hlVisits", id) : undefined), isNew = again ? again.isNew : !v0, t = today();
  const v: Visit = v0 ?? ({ id: uid(), person, date: t, doctor: "" } as Visit);
  openSheet(isNew ? "Doctor visit" : `${v.doctor} · ${dayLabel(v.date, t)}`, html`<div class="grid2">${raw(field(["vdoc", "Doctor", "text", { value: v.doctor, ph: "e.g. Dr Rao, cardiologist" }]))}${raw(field(["vdate", "Date", "date", { value: v.date }]))}</div>
    ${raw(field(["vwhy", "Why (optional)", "text", { value: v.reason, ph: "e.g. annual review" }]))}
    ${raw(field(["vnotes", "What the doctor said (optional)", "textarea", { value: v.notes }]))}
    <div class="f"><label>Prescription, reports <span class="hhenc">encrypted, in your Google Drive</span></label><div class="hhfiles" id="vFiles"></div></div>
    ${raw(isNew ? costFields(MED_CATS, "Fee (₹, optional)") : "")}${raw(btns(isNew))}`, (s) => {
    const added: FileRec[] = again?.added ?? [];
    const draft = (): Visit => { const o: Visit = { ...v, doctor: val("vdoc"), date: val("vdate") || t }; if (val("vwhy")) o.reason = val("vwhy"); else delete o.reason; if (val("vnotes")) o.notes = val("vnotes"); else delete o.notes; return o; };
    fileTiles(s, "vFiles", { c: "hlVisits", id: v.id }, (f) => viewFile(f, () => visitForm(person, v.id, { v: draft(), isNew, added })), added);
    $(s, "cx").onclick = () => { closeModal(); if (isNew) for (const f of added) void removeFile(f); };
    $(s, "sv").onclick = () => {
      const o = draft(); if (!o.doctor) return toast("Who did you see?");
      if (isNew) { const c = costOps(s, `Doctor: ${o.doctor}`, o.date); if (c.cost) o.cost = c.cost; if (c.txnId) o.txnId = c.txnId; }
      closeModal(); hlWrite([{ c: "hlVisits", r: o }]); toast(isNew ? "Visit saved" : "Saved");
    };
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => askConfirm("Delete this visit and its files?", "Delete", () => { for (const f of filesOf({ c: "hlVisits", id: v.id })) void removeFile(f); hlWrite([{ c: "hlVisits", id: v.id, r: null }]); }));
  });
}
