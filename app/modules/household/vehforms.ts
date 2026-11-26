/** Vehicles' sheets: a vehicle's page, adding or changing one, a fill, a service, a renewal. */
import { html, raw } from "../../core/dom.ts";
import type { Rec } from "../../core/store.ts";
import { askConfirm, closeModal, field, openSheet, toast, val } from "../money/ui/kit.ts";
import { addMonths, dayLabel, daysBetween, live, type Done } from "./data.ts";
import { costFields, costOps } from "./forms.ts";
import { hhWrite, hhWriteThen, reader, today } from "./index.ts";
import { FUELS, fuelOf, icon, KINDS, mileage, nextService, odometer, RENEWALS, vehicleTitle, type Fuel, type Renewal, type Vehicle } from "./vehicles.ts";

const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const $ = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T => s.querySelector<T>("#" + id)!;
const paise = (s: string): number | undefined => { const n = parseFloat(s); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined; };
const num = (s: string): number | undefined => { const n = parseFloat(s); return Number.isFinite(n) && n >= 0 ? n : undefined; };
const inr = (p: number): string => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const km = (n: number): string => `${Math.round(n).toLocaleString("en-IN")} km`;
const FUEL_CATS = [/fuel|petrol|diesel/i, /transport|travel|commute/i, /car|vehicle/i];
const SVC_CATS = [/vehicle|car|bike/i, /maint|repair/i, /transport|travel/i];
const INS_CATS = [/insur/i, /vehicle|car/i, /transport/i];
/** Hook for Documents: a vehicle's documents (set by the Documents module). */
let docsFor: ((id: string) => string) | null = null, openDocs: ((id: string) => void) | null = null;
export const setVehicleDocs = (summary: (id: string) => string, open: (id: string) => void): void => { docsFor = summary; openDocs = open; };

/* ---------- a vehicle's page ---------- */
export function vehicleSheet(id: string): void {
  const r = reader(), v = r.get<Vehicle>("hhVehicles", id); if (!v) return;
  const t = today(), odo = odometer(r, v), fills = fuelOf(r, v.id), kmpl = mileage(fills), n = nextService(v, odo);
  const year = t.slice(0, 4);
  const done = live<Done & { vehicleId?: string; odo?: number; kind?: string }>(r, "hhDone").filter((d) => d.vehicleId === v.id);
  const spent = (pred: (d: string) => boolean): number => fills.filter((f) => pred(f.date)).reduce((s, f) => s + (f.amount ?? 0), 0) + done.filter((d) => pred(d.date)).reduce((s, d) => s + (d.cost ?? 0), 0);
  const fuelYear = fills.filter((f) => f.date.startsWith(year)).reduce((s, f) => s + (f.amount ?? 0), 0);
  const upcoming = RENEWALS.filter(([k]) => v.renew?.[k]).map(([k, label]) => {
    const d = v.renew![k]!, left = daysBetween(t, d), cls = left < 0 ? "bad" : left <= 30 ? "warn" : "";
    return html`<div class="row tap" data-renew="${k}" role="button" tabindex="0"><div class="main"><div class="t">${label}</div><div class="s">${left < 0 ? `ended ${dayLabel(d, t)}` : `valid till ${dayLabel(d, t)}`}</div></div><span class="due ${cls}">${left < 0 ? "renew" : left <= 60 ? `in ${left} days` : "ok"}</span></div>`;
  });
  const svc = n ? html`<div class="row tap" id="vSvc" role="button" tabindex="0"><div class="main"><div class="t">Service</div><div class="s">${[v.service?.km ? `every ${km(v.service.km)}` : "", v.service?.months ? `${v.service.months} months` : ""].filter(Boolean).join(" or ")}${n.km != null || n.date ? ` · due ${[n.km != null ? `at ${km(n.km)}` : "", n.date ? dayLabel(n.date, t) : ""].filter(Boolean).join(" or ")}` : ""}</div></div>${raw((n.kmLeft != null && n.kmLeft <= 500) || (n.date && daysBetween(t, n.date) <= 30) ? '<span class="due warn">due</span>' : "")}</div>` : "";
  const hist = [
    ...fills.map((f) => ({ date: f.date, t: `⛽ Fuel · ${f.litres} ${v.fuel === "ev" ? "kWh" : "l"}${f.full ? "" : " (part)"}`, s: [km(f.odo), f.amount ? inr(f.amount) : ""].filter(Boolean).join(" · "), id: f.id })),
    ...done.map((d) => ({ date: d.date, t: `${d.kind === "renewal" ? "📄" : "🔧"} ${d.what}`, s: [d.odo ? km(d.odo) : "", d.cost ? inr(d.cost) : "", d.note && d.note !== d.what ? d.note : ""].filter(Boolean).join(" · "), id: "" })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  openSheet(`${icon(v)} ${vehicleTitle(v)}`, html`<p class="note" style="margin-top:0">${[v.model, FUELS.find((f) => f[0] === v.fuel)?.[1], odo ? km(odo) : ""].filter(Boolean).join(" · ")}</p>
    <div class="sh"><h3>Coming up</h3></div><div class="list">${raw(upcoming.join("") + svc)}${raw(!upcoming.length && !svc ? '<div class="row"><div class="main"><div class="s">Add insurance, PUC and the service schedule with Edit.</div></div></div>' : "")}</div>
    <div class="sh"><h3>Fuel and costs</h3></div><div class="list"><div class="row"><div class="main"><div class="t">Mileage</div><div class="s">${kmpl ? "last few full tanks" : "after two full-tank fills"}</div></div><b>${kmpl ? `${kmpl} km/${v.fuel === "ev" ? "kWh" : "l"}` : "–"}</b></div>
      <div class="row"><div class="main"><div class="t">Spent in ${year}</div><div class="s">fuel ${inr(fuelYear)} · service and renewals ${inr(spent((d) => d.startsWith(year)) - fuelYear)}</div></div><b>${inr(spent((d) => d.startsWith(year)))}</b></div></div>
    ${raw(docsFor ? html`<div class="sh"><h3>Documents</h3></div><div class="list"><div class="row tap" id="vDocs" role="button" tabindex="0"><div class="main"><div class="t">${docsFor(v.id) || "RC, insurance, PUC…"}</div><div class="s">open in Documents</div></div></div></div>` : "")}
    ${raw(hist.length ? html`<div class="sh"><h3>History</h3></div><div class="list">${raw(hist.map((h) => html`<div class="row ${h.id ? "tap" : ""}" ${raw(h.id ? `data-fill="${h.id}" role="button" tabindex="0"` : "")}><div class="main"><div class="t">${h.t}</div><div class="s">${dayLabel(h.date, t)}${h.s ? ` · ${h.s}` : ""}</div></div></div>`).join(""))}</div>` : "")}
    <div class="btns"><button class="btn pri" type="button" id="vFuel">⛽ Add fuel</button><button class="btn" type="button" id="vService">🔧 Add service</button></div>
    <div class="btns"><button class="btn" type="button" id="vEdit">Edit</button><button class="btn" type="button" id="cx">Close</button></div>`, (s) => {
    $(s, "cx").onclick = closeModal;
    $(s, "vFuel").onclick = () => { closeModal(); fuelForm(v.id); };
    $(s, "vService").onclick = () => { closeModal(); vServiceForm(v.id); };
    s.querySelector<HTMLElement>("#vSvc")?.addEventListener("click", () => { closeModal(); vServiceForm(v.id); });
    $(s, "vEdit").onclick = () => { closeModal(); vehicleForm(v.id); };
    s.querySelector<HTMLElement>("#vDocs")?.addEventListener("click", () => { closeModal(); openDocs?.(v.id); });
    s.querySelectorAll<HTMLElement>("[data-renew]").forEach((b) => b.addEventListener("click", () => { closeModal(); renewForm(v.id, b.dataset.renew as Renewal); }));
    s.querySelectorAll<HTMLElement>("[data-fill]").forEach((b) => b.addEventListener("click", () => { closeModal(); fuelForm(v.id, b.dataset.fill); }));
  });
}

/* ---------- add or change a vehicle ---------- */
export function vehicleForm(id?: string): void {
  const r = reader(), v0 = id ? r.get<Vehicle>("hhVehicles", id) : undefined, isNew = !v0;
  const v: Vehicle = v0 ?? ({ id: uid(), name: "", kind: "car", fuel: "petrol" } as Vehicle);
  openSheet(isNew ? "Add vehicle" : v.name, html`<div class="grid2">${raw(field(["vname", "Name", "text", { value: v.name, ph: "e.g. Car, Activa" }]))}${raw(field(["vkind", "Kind", "select", { value: v.kind ?? "car", options: KINDS.map(([k, l]) => [k, l] as [string, string]) }]))}</div>
    <div class="grid2">${raw(field(["vreg", "Registration number", "text", { value: v.reg, ph: "e.g. KA 01 AB 1234" }]))}${raw(field(["vmodel", "Make & model", "text", { value: v.model, ph: "e.g. Maruti Swift VXi" }]))}</div>
    <div class="grid2">${raw(field(["vfuel", "Fuel", "select", { value: v.fuel ?? "petrol", options: FUELS }]))}${raw(field(["vodo", "Odometer now (km)", "number", { value: v.odo ?? "" }]))}</div>
    <div class="grid2">${raw(field(["vbought", "Bought on (optional)", "date", { value: v.bought ?? "" }]))}${raw(field(["vprice", "Price (₹, optional)", "number", { value: v.price ? v.price / 100 : "" }]))}</div>
    <div class="sh"><h3>Valid till</h3></div>
    <div class="grid2">${raw(RENEWALS.map(([k, l]) => field([`vr_${k}`, l, "date", { value: v.renew?.[k] ?? "" }])).join(""))}</div>
    <div class="sh"><h3>Service</h3></div>
    <div class="grid2">${raw(field(["vskm", "Every (km)", "number", { value: v.service?.km ?? (isNew ? 10000 : "") }]))}${raw(field(["vsmon", "or every (months)", "number", { value: v.service?.months ?? (isNew ? 12 : "") }]))}</div>
    <div class="grid2">${raw(field(["vsdate", "Last service on", "date", { value: v.service?.lastDate ?? "" }]))}${raw(field(["vskm0", "at (km)", "number", { value: v.service?.lastKm ?? "" }]))}</div>
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button>${raw(isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>')}</div>`, (s) => {
    $(s, "cx").onclick = () => { closeModal(); if (!isNew) vehicleSheet(v.id); };
    $(s, "sv").onclick = () => {
      const name = val("vname"); if (!name) return toast("Give it a name, e.g. Car.");
      const o: Vehicle = { ...v, name, kind: val("vkind") || "car", fuel: val("vfuel") || "petrol" };
      for (const [k, f] of [["reg", "vreg"], ["model", "vmodel"], ["bought", "vbought"]] as const) { if (val(f)) o[k] = val(f); else delete o[k]; }
      const price = paise(val("vprice")); if (price) o.price = price; else delete o.price;
      const odo = num(val("vodo")); if (odo != null) o.odo = odo; else delete o.odo;
      const renew: Partial<Record<Renewal, string>> = {};
      for (const [k] of RENEWALS) if (val(`vr_${k}`)) renew[k] = val(`vr_${k}`);
      if (Object.keys(renew).length) o.renew = renew; else delete o.renew;
      const sv = { km: num(val("vskm")), months: num(val("vsmon")), lastDate: val("vsdate") || undefined, lastKm: num(val("vskm0")) };
      const svc = Object.fromEntries(Object.entries(sv).filter(([, x]) => x != null && x !== "" && x !== 0)) as Vehicle["service"];
      if (svc && Object.keys(svc).length) o.service = svc; else delete o.service;
      closeModal(); toast(isNew ? "Vehicle added" : "Saved");
      hhWriteThen([{ c: "hhVehicles", r: o }], () => vehicleSheet(o.id));
    };
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => askConfirm(`Remove "${v.name}" with its fuel log? Costs already in Money stay there.`, "Remove", () => {
      hhWrite([{ c: "hhVehicles", id: v.id, r: null }, ...fuelOf(reader(), v.id).map((f) => ({ c: "hhFuel", id: f.id, r: null }))]);
    }));
  });
}

/* ---------- a fill ---------- */
export function fuelForm(vehicleId: string, fillId?: string): void {
  const r = reader(), v = r.get<Vehicle>("hhVehicles", vehicleId); if (!v) return;
  const f0 = fillId ? r.get<Fuel>("hhFuel", fillId) : undefined, t = today(), unit = v.fuel === "ev" ? "kWh" : "litres";
  openSheet(f0 ? `Fuel · ${dayLabel(f0.date, t)}` : `Fuel · ${v.name}`, html`<div class="grid2">${raw(field(["fdate", "Date", "date", { value: f0?.date ?? t }]))}${raw(field(["fodo", "Odometer (km)", "number", { value: f0?.odo ?? "", ph: String(odometer(r, v) || "") }]))}</div>
    <div class="grid2">${raw(field(["flit", `How much (${unit})`, "number", { value: f0?.litres ?? "", step: "0.01" }]))}${raw(f0 ? field(["famt", "Amount (₹)", "number", { value: f0.amount ? f0.amount / 100 : "", step: "0.01" }]) : "")}</div>
    <label class="opt"><input type="checkbox" id="ffull" ${f0 && !f0.full ? "" : "checked"}><div><b>Filled the tank</b><span>Mileage is worked out between full tanks.</span></div></label>
    ${raw(f0 ? "" : costFields(FUEL_CATS, "Amount (₹)"))}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button>${raw(f0 ? '<button class="btn danger" id="dl" type="button">Delete</button>' : "")}</div>`, (s) => {
    $(s, "cx").onclick = () => { closeModal(); vehicleSheet(v.id); };
    $(s, "sv").onclick = () => {
      const odo = num(val("fodo")), litres = num(val("flit")), date = val("fdate") || t;
      if (odo == null || !litres) return toast("Fill in the odometer and how much.");
      const prev = fuelOf(reader(), v.id).filter((x) => x.id !== f0?.id && x.date <= date).pop();
      if (prev && odo < prev.odo) return toast(`The odometer was ${km(prev.odo)} on ${dayLabel(prev.date, t)}: check the reading.`);
      const o: Fuel = { ...(f0 ?? { id: uid(), vehicleId: v.id }), date, odo, litres, full: $<HTMLInputElement>(s, "ffull").checked } as Fuel;
      if (f0) { const a = paise(val("famt")); if (a) o.amount = a; else delete o.amount; }
      else { const c = costOps(s, `Fuel: ${v.name}`, date); if (c.cost) o.amount = c.cost; if (c.txnId) o.txnId = c.txnId; }
      closeModal();
      hhWriteThen([{ c: "hhFuel", r: o }], () => {
        const m = mileage(fuelOf(reader(), v.id));
        toast(`Saved${m ? ` · ${m} km/${v.fuel === "ev" ? "kWh" : "l"}` : ""}${o.txnId ? " · added to Money" : ""}`);
        vehicleSheet(v.id);
      });
    };
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => { closeModal(); hhWriteThen([{ c: "hhFuel", id: f0!.id, r: null }], () => vehicleSheet(v.id)); });
  });
}

/* ---------- a service ---------- */
export function vServiceForm(vehicleId: string): void {
  const r = reader(), v = r.get<Vehicle>("hhVehicles", vehicleId); if (!v) return;
  const t = today();
  openSheet(`Service · ${v.name}`, html`<div class="grid2">${raw(field(["sdate", "Done on", "date", { value: t }]))}${raw(field(["sodo", "Odometer (km)", "number", { value: odometer(r, v) || "" }]))}</div>
    ${raw(field(["swhat", "What was done", "text", { ph: "e.g. 3rd free service, oil change, brake pads" }]))}${raw(costFields(SVC_CATS))}${raw(field(["snote", "Note (optional)", "text", { ph: "e.g. service centre, next: tyres" }]))}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $(s, "cx").onclick = () => { closeModal(); vehicleSheet(v.id); };
    $(s, "sv").onclick = () => {
      const date = val("sdate") || t, odo = num(val("sodo")), what = val("swhat") || "Service";
      const c = costOps(s, `${v.name}: ${what}`, date);
      const done = { id: uid(), home: "", date, vehicleId: v.id, kind: "service", what, ...(odo != null ? { odo } : {}), ...c, ...(val("snote") ? { note: val("snote") } : {}) };
      const nv: Vehicle = { ...v, service: { ...(v.service ?? {}), lastDate: date, ...(odo != null ? { lastKm: odo } : {}) } };
      closeModal();
      const n = nextService(nv, odo ?? 0);
      toast(`Saved${n ? `. Next ${[n.km != null ? `at ${km(n.km)}` : "", n.date ? dayLabel(n.date, t) : ""].filter(Boolean).join(" or ")}` : ""}${c.txnId ? " · added to Money" : ""}`);
      hhWriteThen([{ c: "hhDone", r: done as Rec }, { c: "hhVehicles", r: nv }], () => vehicleSheet(v.id));
    };
  });
}

/* ---------- a renewal ---------- */
export function renewForm(vehicleId: string, key: Renewal): void {
  const r = reader(), v = r.get<Vehicle>("hhVehicles", vehicleId); if (!v) return;
  const t = today(), label = RENEWALS.find(([k]) => k === key)![1], cur = v.renew?.[key];
  const next = cur ? addMonths(cur, 12) : "";
  openSheet(`${label} · ${v.name}`, html`<p class="note" style="margin-top:0">${cur ? `Valid till ${dayLabel(cur, t)}.` : ""} Renewed? Set the new date${key === "insurance" ? ", and add the premium to Money" : ""}.</p>
    ${raw(field(["rto", "Now valid till", "date", { value: next }]))}${raw(costFields(key === "insurance" ? INS_CATS : SVC_CATS))}
    <div class="btns"><button class="btn pri" id="sv" type="button">Renewed</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $(s, "cx").onclick = () => { closeModal(); vehicleSheet(v.id); };
    $(s, "sv").onclick = () => {
      const to = val("rto"); if (!to) return toast("Set the new valid-till date.");
      const c = costOps(s, `${v.name}: ${label}`, t);
      closeModal();
      toast(`${label} valid till ${dayLabel(to, t)}${c.txnId ? " · added to Money" : ""}`);
      hhWriteThen([{ c: "hhVehicles", r: { ...v, renew: { ...(v.renew ?? {}), [key]: to } } }, { c: "hhDone", r: { id: uid(), home: "", date: t, vehicleId: v.id, kind: "renewal", what: `${label} renewed, valid till ${dayLabel(to, t)}`, ...c } as Rec }], () => vehicleSheet(v.id));
    };
  });
}
