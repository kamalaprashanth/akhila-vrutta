/**
 * Documents: every paper linked to what it belongs to (properties, vehicles, people, appliances, policies,
 * loans and accounts), with each property's checklist, what needs attention, search, and expiry reminders.
 * Files are kept encrypted in the vault (Google Drive). Designed with the owner on 26 Nov 2026.
 */
import type { Module } from "../types.ts";
import { html, raw } from "../../core/dom.ts";
import { ctx } from "../../core/app.ts";
import type { Rec } from "../../core/store.ts";
import { connectDrive, filesOf, needsDriveTap } from "../../core/files.ts";
import { familyOpen, memberName, myUid, sharerOf } from "../../core/family.ts";
import { shareItem, unshareItem } from "../../core/famshare.ts";
import { setReminderSource, scheduleReminders } from "../../core/reminders.ts";
import { askConfirm, closeModal, ensureLayer, field, openSheet, toast, val } from "../../core/ui.ts";
import { startMoney } from "../money/index.ts";
import { setVehicleDocs } from "../household/vehforms.ts";
import { attention, checklist, loadMyTypes, maskNum, myTypes, TYPES_PREF, typesOf, type MyType, type TypePref, docNotes, docsOf, fyLabel, groups, keyScore, ownerInfo, prefId, recentFys, search, taxRemind, typeOf, TYPES, type Doc, type DocOwner, type DocPref, type Owner, type OwnerInfo, type Reader } from "./data.ts";
import { addPicker, docForm, ownerForm, setNotNeeded } from "./forms.ts";

export const ICON = "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6";
/** (Also reads your own document types.) */
export const reader = (): Reader => { const r: Reader = { all: (c) => ctx.store?.all(c) ?? [], get: (c, id) => ctx.store?.get(c, id) }; loadMyTypes(r); return r; };
const pad = (n: number): string => String(n).padStart(2, "0");
export const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** Saves document records and redraws. null moves a record to the trash. */
export function docWrite(ops: { c: string; r: Rec | null; id?: string }[]): void {
  if (!ctx.store || !ops.length) return;
  ctx.store.writeMany(ops.map((o) => ({ c: o.c, id: o.id ?? o.r!.id, r: o.r ? { ...o.r, updatedAt: Date.now() } : null })));
  redraw();
  scheduleReminders();
}

let rootEl: HTMLElement | null = null, query = "";
const redraw = (): void => { if (rootEl && document.body.dataset.mod === "docs") draw(rootEl); };
/** #/docs/o/<collection>/<id>: an owner's page. */
const pageOwner = (): Owner | null => { const m = location.hash.match(/^#\/docs\/o\/([^/]+)\/(.+)$/); return m ? { c: decodeURIComponent(m[1]!), id: decodeURIComponent(m[2]!) } : null; };
export const ownerHash = (o: Owner): string => `#/docs/o/${encodeURIComponent(o.c)}/${encodeURIComponent(o.id)}`;
const nFiles = (docId: string): number => filesOf({ c: "docs", id: docId }).length;
const dayLbl = (d: string): string => new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
// a number shows hidden (last 4) until 👁 shows it for 30 seconds
const shown = new Map<string, number>();
const numText = (d: Doc): string => (d.num ? ((shown.get(d.id) ?? 0) > Date.now() ? d.num : maskNum(d.num)) : d.num4 ? `…${d.num4}` : "");
const fileWord = (id: string): string => { const fs = filesOf({ c: "docs", id }); if (!fs.length) return "no file"; const named = fs.map((f) => (f as { label?: string }).label).filter(Boolean); return `${fs.length} file${fs.length === 1 ? "" : "s"}${named.length ? `: ${named.join(", ")}` : ""}`; };
const docLine = (d: Doc, kind: OwnerInfo["kind"]): string => [numText(d), d.year ? fyLabel(d.year) : "", d.validTo ? `valid till ${dayLbl(d.validTo)}` : "", fileWord(d.id), d.note ?? ""].filter(Boolean).join(" · ") || typeOf(kind, d.type).label;
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>';
const COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9h10v12H9zM5 15V3h10"/></svg>';
/** 👁 and copy for a document's number (copy works without showing it). */
const numBtns = (d: Doc): string => d.num ? html`<span class="dnumb">${raw(maskNum(d.num) !== d.num ? html`<button type="button" class="dnb" data-shownum="${d.id}" aria-label="Show the number">${raw(EYE)}</button>` : "")}<button type="button" class="dnb" data-cpnum="${d.id}" aria-label="Copy the number">${raw(COPY)}</button></span>` : "";

/* ---------- the Documents page ---------- */
function mainPage(r: Reader, t: string): string {
  const att = attention(r, t);
  const hits = query ? search(r, query, (id) => filesOf({ c: "docs", id }).map((f) => [f.name, (f as { label?: string }).label ?? ""].join(" "))) : [];
  const summary = (o: OwnerInfo): [string, string] => {
    const ds = docsOf(r, o.owner).filter((d) => !d.na);
    if (o.kind === "property") { const k = keyScore(checklist(r, o.owner, t)); return [ds.length ? [...new Set(ds.map((d) => typeOf(o.kind, d.type).label.split(" (")[0]!.split(" /")[0]!))].slice(0, 4).join(", ") : "No documents yet", html`<span class="dpill ${k.have < k.of ? "w" : ""}">${String(k.have)} of ${String(k.of)}</span>`]; }
    const appl = o.kind === "appliance" ? filesOf(o.owner).length : 0;
    const labels = [...new Set(ds.map((d) => typeOf(o.kind, d.type).label))];
    const n = ds.length + appl;
    return [labels.length ? labels.slice(0, 4).join(", ") + (appl ? ` + ${appl} file${appl === 1 ? "" : "s"}` : "") : appl ? `${appl} file${appl === 1 ? "" : "s"} from Household` : "No documents yet", n ? html`<span class="dpill">${String(n)}</span>` : ""];
  };
  const ownerRow = (o: OwnerInfo, eduOnly = false): string => {
    let [s, side] = summary(o);
    if (eduOnly) { const e = docsOf(r, o.owner).filter((d) => typeOf("person", d.type).edu && !d.na); s = [...new Set(e.map((d) => typeOf("person", d.type).label))].join(", "); side = html`<span class="dpill">${String(e.length)}</span>`; }
    return html`<div class="row tap" data-owner="${o.owner.c}/${o.owner.id}" role="button" tabindex="0"><span class="dico" aria-hidden="true">${o.icon}</span><div class="main"><div class="t">${o.name}${raw(o.sub ? html` <span class="dsub">· ${o.sub}</span>` : "")}</div><div class="s">${s}</div>${raw(o.kind === "property" ? (() => { const k = keyScore(checklist(r, o.owner, t)); return html`<div class="dbar"><i style="width:${String(k.of ? Math.round((k.have / k.of) * 100) : 0)}%"></i></div>`; })() : "")}</div>${raw(side)}</div>`;
  };
  const adds: Record<string, string> = { People: "people", Insurance: "insurance", Other: "other" };
  const groupHtml = groups(r).map(([g, l]) => {
    const add = adds[g] ? html`<button class="btn sm" type="button" data-addowner="${adds[g]!}">＋ ${g === "People" ? "Person" : g === "Insurance" ? "Policy" : "Other"}</button>` : "";
    if (!l.length && !add) return "";
    return html`<div class="sh"><h3>${g}</h3><span class="sp"></span>${raw(add)}</div>${raw(l.length ? html`<div class="list">${raw(l.map((o) => ownerRow(o, g === "Education & work")).join(""))}</div>` : html`<div class="empty dempty">${g === "People" ? "Add yourself and family to keep Aadhaar, PAN, passport, licence and certificates." : g === "Insurance" ? "Add health, term or other policies to keep the policy and premium receipts, with renewal reminders." : "Anything else: bank lockers, pets, memberships…"}</div>`)}`;
  }).join("");
  return html`<div class="dsearch"><input id="dq" type="search" placeholder="Search: khata, passport, RC, 2025…" value="${query}" aria-label="Search documents" autocomplete="off"></div>
    ${raw(query ? html`<div class="sh"><h3>${hits.length ? `${hits.length} found` : "Nothing found"}</h3></div>${raw(hits.length ? html`<div class="list">${raw(hits.map((h) => html`<div class="row tap" data-doc="${h.doc.id}" role="button" tabindex="0"><span class="dico">${h.info.icon}</span><div class="main"><div class="t">${h.label}</div><div class="s">${h.info.name} · ${docLine(h.doc, h.info.kind)}</div></div></div>`).join(""))}</div>` : "")}` : html`
    ${raw(att.length ? html`<div class="sh"><h3>Needs attention</h3></div><div class="datt">${raw(att.map((a) => html`<button type="button" class="card" ${raw(a.docId ? `data-doc="${a.docId}"` : `data-owner="${a.owner.c}/${a.owner.id}"`)}><b>${a.title}</b><span class="${a.level}">${a.sub}</span></button>`).join(""))}</div>` : "")}
    ${raw(groupHtml)}
    ${raw(myTypesHtml(r))}`)}`;
}
/** Your own document types: rename, or remove one no document uses. */
function myTypesHtml(r: Reader): string {
  const L = myTypes();
  if (!L.length) return "";
  const KIND: Record<string, string> = { property: "Property", vehicle: "Vehicle", person: "People", appliance: "Appliance", insurance: "Insurance", account: "Loans and accounts", other: "Other" };
  const used = (k: string): number => r.all<Doc>("docs").filter((d) => !d.deleted && d.type === k).length;
  return html`<div class="sh"><h3>Your document types</h3></div><div class="list">${raw(L.map((x) => html`<div class="row"><div class="main"><div class="t">${x.label}</div><div class="s">${KIND[x.kind] ?? x.kind} · ${String(used(x.k))} document${used(x.k) === 1 ? "" : "s"}</div></div><button class="btn sm" type="button" data-mtren="${x.k}">Rename</button>${raw(used(x.k) ? "" : html`<button class="btn sm ghost" type="button" data-mtdel="${x.k}">Remove</button>`)}</div>`).join(""))}</div>`;
}
function setMyType(k: string, change: (x: MyType) => MyType): void {
  const pref = reader().get<TypePref>("docPrefs", TYPES_PREF);
  if (!pref) return;
  docWrite([{ c: "docPrefs", r: { ...pref, list: (pref.list ?? []).map((x) => (x.k === k ? change(x) : x)) } as TypePref }]);
}

/* ---------- an owner's page ---------- */
function ownerPage(r: Reader, o: Owner, t: string): string {
  const info = ownerInfo(r, o);
  if (!info) return html`<div class="empty">This was removed.</div><div class="btns"><button class="btn" type="button" id="dBack">Back</button></div>`;
  const ds = docsOf(r, o).filter((d) => !d.na), rows = checklist(r, o, t), k = keyScore(rows);
  const check = rows.length ? html`<div class="list">${raw(rows.map((x) => {
    const ok = x.years ? x.years[0]!.have : x.docs.length > 0;
    const dot = x.na ? '<span class="ddot na">–</span>' : ok ? '<span class="ddot ok">✓</span>' : '<span class="ddot no"></span>';
    const sub = x.na ? "Not needed" : x.years ? "" : x.docs.length ? docLine(x.docs[0]!, info.kind) + (x.docs.length > 1 ? ` · +${x.docs.length - 1} more` : "") : "Not added yet";
    const years = x.years && !x.na ? html`<div class="dyears">${raw(x.years.map((y) => { const d = x.docs.find((z) => z.year === y.fy); return html`<button type="button" class="${y.have ? "" : "no"}" ${raw(d ? `data-doc="${d.id}"` : `data-add="${x.type.k}" data-year="${y.fy}"`)}>${fyLabel(y.fy)}${y.have ? "" : " ＋"}</button>`; }).join(""))}</div>` : "";
    const act = x.na ? html`<button type="button" class="btn sm" data-need="${x.type.k}">Needed</button>` : ok || x.years ? "" : html`<button type="button" class="btn sm ghost" data-na="${x.type.k}">Not needed</button>`;
    return html`<div class="row dchk ${ok || x.years ? "tap" : ""}" ${raw(!x.years && x.docs[0] ? `data-doc="${x.docs[0].id}" role="button" tabindex="0"` : !x.years && !x.na ? `data-add="${x.type.k}" role="button" tabindex="0"` : "")}>${raw(dot)}<div class="main"><div class="t">${x.type.label}</div>${raw(sub ? html`<div class="s">${sub}</div>` : "")}${raw(years)}</div>${raw(!x.years && !x.na && x.docs[0] ? numBtns(x.docs[0]) : "")}${raw(act)}</div>`;
  }).join(""))}</div>` : "";
  const keyTypes = new Set(rows.map((x) => x.type.k));
  const rest = ds.filter((d) => !keyTypes.has(d.type)).sort((a, b) => (b.year ?? b.validTo ?? b.added).localeCompare(a.year ?? a.validTo ?? a.added));
  const list = (l: Doc[]): string => html`<div class="list">${raw(l.map((d) => html`<div class="row tap" data-doc="${d.id}" role="button" tabindex="0"><div class="main"><div class="t">${typeOf(info.kind, d.type).label}</div><div class="s">${docLine(d, info.kind)}</div></div>${raw(numBtns(d))}</div>`).join(""))}</div>`;
  const pt = (d: Doc) => (info.kind === "person" ? typeOf("person", d.type) : null);
  const edu = rest.filter((d) => pt(d)?.edu), tax = rest.filter((d) => pt(d)?.tax), med = rest.filter((d) => pt(d)?.med);
  const id = rest.filter((d) => !pt(d)?.edu && !pt(d)?.tax && !pt(d)?.med && !(info.kind === "property" && d.type === "tax"));
  // a property's tax receipt: by year, optional, with its April reminder only if switched on
  const taxT = info.kind === "property" ? typeOf("property", "tax") : null;
  const taxDocs = taxT ? ds.filter((d) => d.type === "tax") : [], remind = taxT ? taxRemind(r, o) : false;
  const yearly = taxT ? html`<div class="sh"><h3>Yearly, optional</h3></div><div class="list"><div class="row dchk"><div class="main"><div class="t">${taxT.label}</div><div class="dyears">${raw(recentFys(t).map((fy) => { const d = taxDocs.find((z) => z.year === fy); return html`<button type="button" class="${d ? "" : "no"}" ${raw(d ? `data-doc="${d.id}"` : `data-add="tax" data-year="${fy}"`)}>${fyLabel(fy)}${d ? "" : " ＋"}</button>`; }).join(""))}</div></div></div>
    <label class="row dchk"><div class="main"><div class="t">Remind me each April</div><div class="s">${remind ? "On: reminded on 10 and 25 April until this year's receipt is added" : "Off: no warnings, no reminders"}</div></div><input type="checkbox" id="dTaxRemind" ${remind ? "checked" : ""} aria-label="Remind me each April"></label></div>` : "";
  const applFiles = info.kind === "appliance" ? filesOf(o) : [];
  const suggest = typesOf(info.kind).filter((x) => !x.key && x.k !== "other" && !(info.kind === "property" && x.k === "tax") && !ds.some((d) => d.type === x.k)).slice(0, 6);
  // the family space: share this item (and its papers and files), or who shared it
  const by = familyOpen() ? sharerOf(o) : undefined;
  const share = !familyOpen() ? "" : by && by !== myUid() ? html`<div class="list"><div class="row"><div class="main"><div class="t">Shared by ${memberName(by)}</div><div class="s">You can see it and add papers; only they can stop sharing it.</div></div></div></div>`
    : html`<div class="list"><label class="row dchk"><div class="main"><div class="t">Share with family</div><div class="s" id="dShareSt">${by ? "Shared: your family sees it and its papers and files, and can add to them. Turn off to take it back." : "Your family will see it, its papers and their files, and can add to them."}</div></div><input type="checkbox" id="dShare" ${by ? "checked" : ""} aria-label="Share with family"></label></div>`;
  return html`<div class="dhead"><span class="dico big">${info.icon}</span><div><h2>${info.name}</h2><div class="s">${[info.sub, info.kind === "property" ? `${k.have} of ${k.of} key documents` : `${ds.length} document${ds.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</div></div></div>
    ${raw(share)}
    ${raw(check ? html`<div class="sh"><h3>${info.kind === "property" ? "Key documents" : "Main documents"}</h3></div>${raw(check)}` : "")}
    ${raw(id.length ? html`<div class="sh"><h3>${info.kind === "person" ? "ID and certificates" : rows.length ? "Other documents" : "Documents"}</h3></div>${raw(list(id))}` : "")}
    ${raw(yearly)}
    ${raw(tax.length ? html`<div class="sh"><h3>Tax</h3></div>${raw(list(tax))}` : "")}
    ${raw(med.length ? html`<div class="sh"><h3>Medical</h3></div>${raw(list(med))}` : "")}
    ${raw(edu.length ? html`<div class="sh"><h3>Education & work</h3></div>${raw(list(edu))}` : "")}
    ${raw(applFiles.length ? html`<div class="sh"><h3>Files from Household</h3></div><div class="list"><div class="row tap" data-appl="${o.id}" role="button" tabindex="0"><div class="main"><div class="t">${applFiles.map((f) => f.name).join(", ")}</div><div class="s">open the appliance in Household</div></div></div></div>` : "")}
    ${raw(suggest.length ? html`<div class="sh"><h3>Add</h3></div><div class="dsugg">${raw(suggest.map((x) => html`<button type="button" class="btn sm" data-add="${x.k}">＋ ${x.label}</button>`).join(""))}</div>` : "")}
    <div class="btns" style="margin-top:16px"><button class="btn" type="button" id="dBack">Back</button><button class="btn pri" type="button" id="dAddHere">＋ Add document</button>${raw(o.c === "docOwners" ? '<button class="btn" type="button" id="dEditOwner">Edit</button>' : "")}</div>`;
}

function draw(root: HTMLElement): void {
  if (!ctx.store) { root.innerHTML = html`<section class="card"><h2>Documents</h2><p>Property papers, ID documents, vehicle, insurance and loan papers, encrypted in your Drive, with expiry reminders. Sign in to open it.</p></section>`; return; }
  const r = reader(), t = today(), o = pageOwner();
  const focused = document.activeElement?.id === "dq", caret = (document.activeElement as HTMLInputElement | null)?.selectionStart ?? null;
  // the + sits outside .mv (Money's styles hide a .fab inside it)
  root.innerHTML = html`<div class="mv dv"><div class="wrap" id="dView">${raw(o ? ownerPage(r, o, t) : mainPage(r, t))}</div></div>${raw(o ? "" : html`<button class="fab" type="button" id="addDoc" aria-label="Add a document"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`)}`;
  if (focused) { const q = root.querySelector<HTMLInputElement>("#dq"); q?.focus(); if (q && caret != null) q.setSelectionRange(caret, caret); }
}

function onTap(e: Event): void {
  const nb = (e.target as HTMLElement).closest<HTMLElement>("[data-cpnum],[data-shownum]");
  if (nb && rootEl?.contains(nb)) {
    e.stopPropagation();
    const d = reader().get<Doc>("docs", nb.dataset.cpnum ?? nb.dataset.shownum ?? "");
    if (!d?.num) return;
    if (nb.dataset.cpnum) { void navigator.clipboard.writeText(d.num.replace(/\s/g, "")).then(() => toast("Number copied"), () => toast(`Couldn't copy. The number is ${d.num}`)); return; }
    shown.set(d.id, Date.now() + 30e3); redraw(); setTimeout(redraw, 30e3 + 50); return;
  }
  const mt = (e.target as HTMLElement).closest<HTMLElement>("[data-mtren],[data-mtdel]");
  if (mt && rootEl?.contains(mt)) {
    const k = mt.dataset.mtren ?? mt.dataset.mtdel!, x = myTypes().find((y) => y.k === k);
    if (!x) return;
    if (mt.dataset.mtdel) return askConfirm(`Remove the type "${x.label}"?`, "Remove", () => setMyType(k, (y) => ({ ...y, deleted: true })));
    return openSheet("Rename type", html`${raw(field(["mtname", "Name", "text", { value: x.label }]))}<div class="btns"><button class="btn pri" type="button" id="sv">Save</button><button class="btn" type="button" id="cx">Cancel</button></div>`, (sh) => {
      sh.querySelector<HTMLElement>("#cx")!.onclick = closeModal;
      sh.querySelector<HTMLElement>("#sv")!.onclick = () => { const n = val("mtname"); if (!n) return toast("Give it a name."); closeModal(); setMyType(k, (y) => ({ ...y, label: n })); };
    });
  }
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-owner],[data-doc],[data-add],[data-na],[data-need],[data-addowner],[data-appl],#addDoc,#dBack,#dAddHere,#dEditOwner");
  if (!el || !rootEl?.contains(el) || document.body.dataset.mod !== "docs") return;
  const d = el.dataset, o = pageOwner();
  if (d.na && o) { e.stopPropagation(); return setNotNeeded(o, d.na, true); }
  if (d.need && o) { e.stopPropagation(); return setNotNeeded(o, d.need, false); }
  if (d.owner) { const i = d.owner.indexOf("/"); location.hash = ownerHash({ c: d.owner.slice(0, i), id: d.owner.slice(i + 1) }); return; }
  if (d.doc) return docForm(d.doc);
  if (d.add && o) return docForm(undefined, { owner: o, type: d.add, ...(d.year ? { year: d.year } : {}) });
  if (d.addowner) return ownerForm(d.addowner as DocOwner["group"], undefined, (ow) => { location.hash = ownerHash(ow); });
  if (d.appl) { location.hash = "#/household"; return; }
  if (el.id === "addDoc") return addPicker();
  if (el.id === "dAddHere" && o) return docForm(undefined, { owner: o, type: "other" });
  if (el.id === "dBack") { location.hash = "#/docs"; return; }
  if (el.id === "dEditOwner" && o) { const x = reader().get<DocOwner>("docOwners", o.id); if (x) ownerForm(x.group, x.id); }
}
let sharing = false;
function onChange(e: Event): void {
  const i = e.target as HTMLInputElement, o = pageOwner();
  if (i.id === "dShare" && o && document.body.dataset.mod === "docs") {
    if (sharing) { i.checked = !i.checked; return; }
    const info = ownerInfo(reader(), o), st = rootEl?.querySelector<HTMLElement>("#dShareSt"), on = i.checked;
    if (!info) return;
    sharing = true; i.disabled = true;
    const say = (m: string): void => { if (st) st.textContent = m; };
    void (async () => {
      // files move through your Drive: on the website Google asks for it from this tap
      const docIds = new Set(docsOf(reader(), o).map((d) => d.id));
      const hasFiles = (ctx.store?.all<{ id: string; deleted?: boolean; owner?: { c: string; id: string } }>("files") ?? []).some((f) => !f.deleted && ((f.owner?.c === o.c && f.owner.id === o.id) || (f.owner?.c === "docs" && docIds.has(f.owner.id))));
      if (hasFiles && needsDriveTap()) await connectDrive();
      if (on) await shareItem(o, { name: info.name, kind: info.kind, ...(info.sub ? { sub: info.sub } : {}) }, say);
      else await unshareItem(o, say);
    })().then(() => toast(on ? `${info.name} is shared with the family` : `${info.name} is only yours again`), (x) => { toast(`Couldn't finish: ${x instanceof Error ? x.message : String(x)}`); }).finally(() => { sharing = false; redraw(); });
    return;
  }
  if (i.id !== "dTaxRemind" || !o || document.body.dataset.mod !== "docs") return;
  const p: DocPref = { ...(reader().get<DocPref>("docPrefs", prefId(o)) ?? { id: prefId(o) }), taxRemind: i.checked };
  delete p.deleted;
  docWrite([{ c: "docPrefs", r: p }]);
}
function onInput(e: Event): void {
  if ((e.target as HTMLElement).id !== "dq") return;
  query = (e.target as HTMLInputElement).value.trim();
  redraw();
}
function onKey(e: KeyboardEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[role="button"]');
  if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); el.click(); }
}

let started = false;
/** Documents' reminders join the phone's; vehicles in Household link to their documents. */
export function startDocs(): void {
  if (started || !ctx.store) return;
  started = true;
  setReminderSource("documents", () => docNotes(reader(), new Date()));
  setVehicleDocs(
    (id) => [...new Set(docsOf(reader(), { c: "hhVehicles", id }).filter((d) => !d.na).map((d) => typeOf("vehicle", d.type).label.split(" (")[0]!))].join(", "),
    (id) => { location.hash = ownerHash({ c: "hhVehicles", id }); },
  );
  scheduleReminders();
}

export const documents: Module = {
  id: "docs",
  label: "Documents",
  tab: "Docs",
  icon: ICON,
  render(root) {
    ensureLayer();
    startMoney();   // Money's properties, accounts and loans are owners
    startDocs();
    if (rootEl !== root) {
      rootEl = root;
      root.addEventListener("click", onTap);
      root.addEventListener("input", onInput);
      root.addEventListener("change", onChange);
      root.addEventListener("keydown", onKey);
    }
    draw(root);
  },
};
