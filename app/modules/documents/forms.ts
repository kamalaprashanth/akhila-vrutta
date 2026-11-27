/** Documents' sheets: add or change a document (with its files), and people, policies and other owners. */
import { html, raw } from "../../core/dom.ts";
import type { Rec } from "../../core/store.ts";
import { addFile, connectDrive, fileSize, filesOf, isPopupBlocked, needsDriveTap, removeFile, type FileRec } from "../../core/files.ts";
import { askConfirm, closeModal, field, openSheet, toast, val } from "../../core/ui.ts";
import { viewFile } from "../household/forms.ts";
import { cleanNum, fyLabel, fyOf, groups, myTypes, ownerInfo, ownerKind, recentFys, TYPES, TYPES_PREF, typeOf, typesOf, type Doc, type DocOwner, type DocType, type Owner, type TypePref } from "./data.ts";
import { ctx } from "../../core/app.ts";
import { FILES } from "../../core/store.ts";
import { docWrite, reader, today } from "./index.ts";

const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const $ = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T => s.querySelector<T>("#" + id)!;
const oKey = (o: Owner): string => `${o.c}/${o.id}`;
const parseKey = (k: string): Owner => { const i = k.indexOf("/"); return { c: k.slice(0, i), id: k.slice(i + 1) }; };
const RENEW = ["insurance", "puc", "rc", "fastag", "permit"];

/** Every owner as grouped options for "Belongs to". */
function ownerOptions(sel: string): string {
  return groups(reader()).filter(([, l]) => l.length).map(([g, l]) => html`<optgroup label="${g}">${raw(l.map((o) => html`<option value="${oKey(o.owner)}" ${oKey(o.owner) === sel ? "selected" : ""}>${o.name}${o.sub ? ` · ${o.sub}` : ""}</option>`).join(""))}</optgroup>`).filter((x, i, a) => a.indexOf(x) === i).join("");
}

export interface DocDraft { doc: Doc; isNew: boolean; added: FileRec[] }

/** Add or change a document. `preset`: who it belongs to, and its type and year, when started from a checklist. */
export function docForm(id?: string, preset?: Partial<Doc>, again?: DocDraft): void {
  const r = reader(), t = today();
  const d0 = again?.doc ?? (id ? r.get<Doc>("docs", id) : undefined), isNew = again ? again.isNew : !d0;
  const first = groups(r).flatMap(([, l]) => l)[0];
  if (!d0 && !preset?.owner && !first) { toast("Add a property, a person or a vehicle first."); return; }
  const doc: Doc = d0 ?? ({ id: uid(), owner: preset?.owner ?? first!.owner, type: preset?.type ?? "other", ...(preset?.year ? { year: preset.year } : {}), added: t } as Doc);
  const fileOwner = { c: "docs", id: doc.id };
  const info = ownerInfo(r, doc.owner);
  openSheet(isNew ? "Add document" : `${typeOf(ownerKind(r, doc.owner), doc.type).label}${info ? ` · ${info.name}` : ""}`, html`
    <div class="f"><label for="f_downer">Belongs to</label><select id="f_downer">${raw(ownerOptions(oKey(doc.owner)))}</select></div>
    <div class="f"><label for="f_dtype">Type</label><select id="f_dtype"></select></div>
    <div class="grid2"><div class="f" id="w_dyear"><label for="f_dyear">Year</label><select id="f_dyear">${raw(recentFys(t, 8).map((fy) => html`<option value="${fy}" ${fy === (doc.year ?? fyOf(t)) ? "selected" : ""}>${fyLabel(fy)}</option>`).join(""))}</select></div>
      ${raw(field(["dvalid", "Valid till (optional)", "date", { value: doc.validTo ?? "" }]))}</div>
    <div class="f" id="w_dtnew" hidden><label for="f_dtnew">New type</label><input id="f_dtnew" type="text" autocomplete="off" placeholder="e.g. Builder–buyer agreement"><span class="note" id="dtNewNote"></span></div>
    <div class="f" id="w_dnum"><label for="f_dnum" id="l_dnum">Number</label><div class="dnumw"><input id="f_dnum" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${doc.num ?? ""}" placeholder="${doc.num4 && !doc.num ? `ends in ${doc.num4}: type the full number to keep it` : ""}"><button type="button" class="dnb" id="dCopy" aria-label="Copy the number"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9h10v12H9zM5 15V3h10"/></svg></button></div></div>
    <div class="f"><label>Files <span class="hhenc">encrypted, in your Google Drive</span></label><div class="hhfiles" id="dFiles"></div>
      <input type="file" id="dPick" accept="image/*,application/pdf" multiple hidden><input type="file" id="dCam" accept="image/*" capture="environment" hidden></div>
    ${raw(field(["dnote", "Note (optional)", "text", { value: doc.note ?? "", ph: "e.g. registered at Sub-Registrar, Jayanagar" }]))}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button>${raw(isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>')}</div>`, (s) => {
    const added: FileRec[] = again?.added ?? [];
    const typeSel = $<HTMLSelectElement>(s, "f_dtype"), ownSel = $<HTMLSelectElement>(s, "f_downer");
    const fillTypes = (keep: string): void => {
      const kind = ownerKind(reader(), parseKey(ownSel.value)), all = typesOf(kind);
      const usual = all.filter((x) => !x.custom && x.k !== "other"), mineT = all.filter((x) => x.custom);
      const opt = (x: DocType): string => html`<option value="${x.k}" ${x.k === keep ? "selected" : ""}>${x.label}</option>`;
      // the usual papers, then your own types, then Other, then making a new one
      typeSel.innerHTML = html`<optgroup label="Usual papers">${raw(usual.map(opt).join(""))}</optgroup>${raw(mineT.length ? html`<optgroup label="Your types">${raw(mineT.map(opt).join(""))}</optgroup>` : "")}${raw(opt(typeOf(kind, "other")))}<option value="__new">+ Add your own type…</option>`;
      if (![...typeSel.options].some((o) => o.value === keep)) typeSel.value = usual[0]?.k ?? "other";
      showYear();
    };
    // each type shows only what it needs (approved 27 Nov 2026): a number for papers that have one, Valid till for
    // papers that expire, a Year for yearly ones, a Note except on ID cards; your own types get them all, optional
    const showYear = (): void => {
      const kind = ownerKind(reader(), parseKey(ownSel.value)), nw = typeSel.value === "__new", t = nw ? { k: "", label: "", custom: true } as DocType : typeOf(kind, typeSel.value);
      $(s, "w_dtnew").hidden = !nw;
      if (nw) { $(s, "dtNewNote").textContent = `Kept for every ${kind === "other" ? "other item" : kind}; search finds it by this name.`; setTimeout(() => $<HTMLInputElement>(s, "f_dtnew").focus(), 30); }
      $(s, "w_dyear").hidden = !t.yearly;
      $(s, "w_dvalid").hidden = !(t.expires || t.custom || t.k === "other" || doc.validTo);
      $(s, "w_dnum").hidden = !(t.num || t.custom || t.k === "other" || doc.num || doc.num4);
      $(s, "l_dnum").textContent = t.num ?? "Number (optional)";
      $(s, "w_dnote").hidden = !!t.id && !doc.note;
      const lv = s.querySelector<HTMLElement>("#w_dvalid label"); if (lv) lv.textContent = t.expires ? "Valid till" : "Valid till (optional)";
    };
    ownSel.onchange = () => fillTypes(typeSel.value);
    typeSel.onchange = showYear;
    fillTypes(doc.type);
    $(s, "dCopy").onclick = () => { const n = val("dnum").replace(/\s/g, ""); if (!n) return; void navigator.clipboard.writeText(n).then(() => toast("Number copied"), () => toast("Couldn't copy here.")); };
    /** What the form says now (for coming back after looking at a file). */
    const draft = (): Doc => {
      const o: Doc = { ...doc, owner: parseKey(ownSel.value), type: typeSel.value };
      if (typeOf(ownerKind(reader(), o.owner), o.type).yearly) o.year = val("dyear"); else delete o.year;
      if (val("dvalid")) o.validTo = val("dvalid"); else delete o.validTo;
      const n = cleanNum(val("dnum"));
      if (n) { o.num = n; delete o.num4; } else delete o.num;   // an older document keeps its last 4 until the full number is typed

      if (val("dnote")) o.note = val("dnote"); else delete o.note;
      delete o.na;
      return o;
    };
    let waiting: File[] = [];
    const tiles = (): void => {
      const fs = filesOf(fileOwner), busy = s.querySelector<HTMLElement>("#dFiles")?.dataset.busy;
      $(s, "dFiles").innerHTML = html`${raw(fs.map((f) => html`<span class="dfw"><button type="button" class="hhfile" data-file="${f.id}"><span class="ic">${f.mime.startsWith("image/") ? "🖼" : "📄"}</span><span class="nm">${(f as FileRec & { label?: string }).label ?? f.name}</span><span class="sz">${(f as FileRec & { label?: string }).label ? f.name + " · " : ""}${fileSize(f.size)}</span></button><button type="button" class="dfname" data-fname="${f.id}">${(f as FileRec & { label?: string }).label ? "Rename" : "Name it"}</button></span>`).join(""))}
        ${raw(busy ? html`<span class="hhfile busy"><span class="nm">${busy}</span></span>` : "")}${raw(waiting.length ? html`<button type="button" class="hhfile add hhallow" id="dAllow"><span class="ic">🔑</span><span class="nm">Allow Drive</span><span class="sz">then ${String(waiting.length)} file${waiting.length === 1 ? "" : "s"} save</span></button>` : "")}<button type="button" class="hhfile add" id="dAddF"><span class="ic">＋</span><span class="nm">Add file</span></button><button type="button" class="hhfile add" id="dAddC"><span class="ic">📷</span><span class="nm">Camera</span></button>`;
      const pick = (inp: string) => async (): Promise<void> => {
        if (needsDriveTap(parseKey(ownSel.value))) {
          try { await connectDrive(); } catch (e) { toast(isPopupBlocked(e) ? "Your browser blocked Google's window. Allow pop-ups for this site, then tap again." : `Google Drive access wasn't given (${e instanceof Error ? e.message : "error"}).`); return; }
          toast("Google Drive is connected. If the file chooser didn't open, tap again.");
        }
        $(s, inp).click();
      };
      $(s, "dAddF").onclick = () => void pick("dPick")();
      $(s, "dAddC").onclick = () => void pick("dCam")();
      s.querySelector<HTMLElement>("#dAllow")?.addEventListener("click", () => void (async () => {
        try { await connectDrive(); } catch (e) { toast(isPopupBlocked(e) ? "Your browser blocked Google's window. Allow pop-ups for this site, then tap again." : `Google Drive access wasn't given (${e instanceof Error ? e.message : "error"}).`); return; }
        const list = waiting; waiting = []; await upload(list);
      })());
      // "Name it": a file's own name (Front, Back, Both sides…), kept with it
      s.querySelectorAll<HTMLElement>("[data-fname]").forEach((b) => { b.onclick = () => {
        const f = filesOf(fileOwner).find((x) => x.id === b.dataset.fname) as (FileRec & { label?: string }) | undefined;
        if (!f) return;
        const inp = document.createElement("input");
        inp.className = "dfin"; inp.value = f.label ?? ""; inp.placeholder = "e.g. Front, Back"; inp.setAttribute("aria-label", "File name");
        b.replaceWith(inp); inp.focus();
        let done = false;
        const keep = (): void => {
          if (done) return; done = true;
          const label = inp.value.trim(), r: FileRec & { label?: string } = { ...f, updatedAt: Date.now() };
          if (label) r.label = label; else delete r.label;
          ctx.store?.writeMany([{ c: FILES, id: f.id, r }]);
          tiles();
        };
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); keep(); } if (e.key === "Escape") { done = true; tiles(); } });
        inp.addEventListener("blur", keep);
      }; });
      s.querySelectorAll<HTMLElement>("[data-file]").forEach((b) => { b.onclick = () => { const f = filesOf(fileOwner).find((x) => x.id === b.dataset.file); if (f) { const st: DocDraft = { doc: draft(), isNew, added }; viewFile(f, () => docForm(doc.id, undefined, st)); } }; });
    };
    const upload = async (list: FileList | File[] | null): Promise<void> => {
      const fl = [...(list ?? [])]; if (!fl.length) return;
      for (const [i, f] of fl.entries()) {
        $(s, "dFiles").dataset.busy = `Encrypting and saving ${fl.length > 1 ? `${i + 1} of ${fl.length}` : f.name}…`; tiles();
        try { added.push(await addFile(fileOwner, f, parseKey(ownSel.value))); } catch (e) {
          if (isPopupBlocked(e)) { waiting.push(...fl.slice(i)); toast("Google needs your OK to use Drive: tap Allow Drive."); break; }
          toast(`Couldn't save ${f.name}: ${e instanceof Error ? e.message : "error"}`);
        }
      }
      delete $(s, "dFiles").dataset.busy; tiles();
    };
    for (const k of ["dPick", "dCam"]) $<HTMLInputElement>(s, k).onchange = (e) => { const i = e.target as HTMLInputElement; void upload(i.files).finally(() => { i.value = ""; }); };
    tiles();
    $(s, "cx").onclick = () => { closeModal(); if (isNew) for (const f of added) void removeFile(f); };
    $(s, "sv").onclick = () => {
      const o = draft();
      // a new type of your own: kept for every owner of that kind
      if (typeSel.value === "__new") {
        const name = val("dtnew").trim();
        if (!name) { toast("Give the new type a name."); return; }
        const kind = ownerKind(reader(), o.owner), same = typesOf(kind).find((x) => x.label.toLowerCase() === name.toLowerCase());
        if (same) o.type = same.k;
        else {
          const k = `c_${uid()}`, pref = reader().get<TypePref>("docPrefs", TYPES_PREF) ?? { id: TYPES_PREF };
          docWrite([{ c: "docPrefs", r: { ...pref, list: [...(pref.list ?? []), { k, label: name, kind }] } as TypePref }]);
          o.type = k;
        }
      }
      const ops: { c: string; r: Rec | null; id?: string }[] = [{ c: "docs", r: o }];
      // a vehicle's renewal: its valid-till date moves the vehicle's renewal on too
      if (o.owner.c === "hhVehicles" && o.validTo && RENEW.includes(o.type)) {
        const v = reader().get<Rec & { renew?: Record<string, string> }>("hhVehicles", o.owner.id);
        if (v && (v.renew?.[o.type] ?? "") < o.validTo) ops.push({ c: "hhVehicles", r: { ...v, renew: { ...(v.renew ?? {}), [o.type]: o.validTo } } });
      }
      closeModal(); docWrite(ops); toast(isNew ? "Document added" : "Saved");
    };
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => askConfirm(`Delete this document and its ${filesOf(fileOwner).length} file(s) from Google Drive?`, "Delete", () => {
      for (const f of filesOf(fileOwner)) void removeFile(f);
      docWrite([{ c: "docs", id: doc.id, r: null }]);
    }));
  });
}

/** "Not needed" for this owner (or needed again). */
export function setNotNeeded(owner: Owner, type: string, na: boolean): void {
  const r = reader(), mark = r.all<Doc>("docs").find((d) => !d.deleted && d.na && d.owner.c === owner.c && d.owner.id === owner.id && d.type === type);
  if (na && !mark) docWrite([{ c: "docs", r: { id: uid(), owner, type, na: true, added: today() } as Doc }]);
  if (!na && mark) docWrite([{ c: "docs", id: mark.id, r: null }]);
}

/* ---------- people, policies, other ---------- */
const GROUP_LABEL: Record<DocOwner["group"], [string, string]> = { people: ["Person", "e.g. KP, Amma"], insurance: ["Policy", "e.g. Family health cover"], other: ["Other", "e.g. Bank locker, Pet"] };
const POLICY_KINDS: [string, string][] = [["health", "Health"], ["term", "Term life"], ["life", "Life / endowment"], ["vehicle", "Vehicle"], ["home", "Home"], ["travel", "Travel"], ["other", "Other"]];
export function ownerForm(group: DocOwner["group"], id?: string, then?: (o: Owner) => void): void {
  const r = reader(), o0 = id ? r.get<DocOwner>("docOwners", id) : undefined, [what, ph] = GROUP_LABEL[group];
  openSheet(o0 ? o0.name : `Add ${what.toLowerCase()}`, html`${raw(field(["oname", "Name", "text", { value: o0?.name, ph }]))}
    ${raw(group === "people" ? field(["orel", "Who (optional)", "text", { value: o0?.rel, ph: "e.g. me, wife, mother, son" }]) : "")}
    ${raw(group === "insurance" ? html`<div class="grid2">${raw(field(["okind", "Kind", "select", { value: o0?.kind ?? "health", options: POLICY_KINDS }]))}${raw(field(["oins", "Insurer", "text", { value: o0?.insurer, ph: "e.g. Star Health" }]))}</div>` : "")}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button>${raw(o0 ? '<button class="btn danger" id="dl" type="button">Delete</button>' : "")}</div>`, (s) => {
    $(s, "cx").onclick = closeModal;
    $(s, "sv").onclick = () => {
      const name = val("oname"); if (!name) return toast("Give it a name.");
      const o: DocOwner = { ...(o0 ?? { id: uid(), group }), name } as DocOwner;
      for (const [k, f] of [["rel", "orel"], ["kind", "okind"], ["insurer", "oins"]] as const) { if (s.querySelector(`#f_${f}`) && val(f)) o[k] = val(f); else delete o[k]; }
      closeModal(); docWrite([{ c: "docOwners", r: o }]); toast(o0 ? "Saved" : `${what} added`);
      then?.({ c: "docOwners", id: o.id });
    };
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => askConfirm(`Delete "${o0!.name}"? Its documents stay, without an owner, until you delete them.`, "Delete", () => { docWrite([{ c: "docOwners", id: o0!.id, r: null }]); location.hash = "#/docs"; }));
  });
}

/* ---------- Documents › +: what it's for, which one, then the document ---------- */
type Cat = { k: string; label: string; icon: string; list: () => { owner: Owner; name: string; sub?: string }[]; type: string; group?: DocOwner["group"]; empty: string };
const live = (c: string): (Rec & Record<string, unknown>)[] => reader().all<Rec & Record<string, unknown>>(c).filter((x) => !x.deleted);
const named = (c: string, pred: (x: Record<string, unknown>) => boolean = () => true) => live(c).filter(pred).map((x) => { const o = { c, id: x.id }, i = ownerInfo(reader(), o); return { owner: o, name: i?.name ?? String(x.name ?? ""), sub: i?.sub }; }).sort((a, b) => a.name.localeCompare(b.name));
const people = () => named("docOwners", (x) => x.group === "people");
const ICONS: Record<string, string> = {
  property: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6", vehicle: "M5 16l1.5-5h11l1.5 5M4 16h16v3H4z", account: "M3 10l9-6 9 6M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18",
  loan: "M4 20h16M6 16V9M10 16V9M14 16V9M18 16V9M3 9l9-5 9 5", card: "M3 6h18v12H3zM3 10h18", appliance: "M6 3h12v18H6zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  id: "M4 5h16v14H4zM6 16c1-2 5-2 6 0M14 10h4M14 14h3", insurance: "M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z", tax: "M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21zM10 8h4M10 12h4",
  medical: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z", edu: "M3 9l9-5 9 5-9 5zM7 11v5c3 2 7 2 10 0v-5", other: "M5 12h.01M12 12h.01M19 12h.01",
};
const CATS: Cat[] = [
  { k: "property", label: "Property", icon: ICONS.property!, list: () => named("props"), type: "sale_deed", empty: "Add the property in Money › Accounts first." },
  { k: "vehicle", label: "Vehicle", icon: ICONS.vehicle!, list: () => named("hhVehicles"), type: "rc", empty: "Add the vehicle in Household › Vehicles first." },
  { k: "account", label: "Account", icon: ICONS.account!, list: () => named("accounts", (x) => !x.hidden && !["cash", "card", "loan"].includes(String(x.type ?? ""))), type: "sanction", empty: "Add the account in Money › Accounts first." },
  { k: "loan", label: "Loan", icon: ICONS.loan!, list: () => [...named("loans"), ...named("accounts", (x) => !x.hidden && x.type === "loan")], type: "sanction", empty: "Add the loan in Money › Accounts first." },
  { k: "card", label: "Credit card", icon: ICONS.card!, list: () => named("accounts", (x) => !x.hidden && x.type === "card"), type: "card", empty: "Add the card in Money › Accounts first." },
  { k: "appliance", label: "Appliance", icon: ICONS.appliance!, list: () => named("hhAppliances"), type: "invoice", empty: "Add the appliance in Household › Appliances first." },
  { k: "id", label: "Personal ID", icon: ICONS.id!, list: people, type: "aadhaar", group: "people", empty: "" },
  { k: "insurance", label: "Insurance", icon: ICONS.insurance!, list: () => named("docOwners", (x) => x.group === "insurance"), type: "policy", group: "insurance", empty: "" },
  { k: "tax", label: "Tax", icon: ICONS.tax!, list: people, type: "itr", group: "people", empty: "" },
  { k: "medical", label: "Medical", icon: ICONS.medical!, list: people, type: "rx", group: "people", empty: "" },
  { k: "edu", label: "Education & work", icon: ICONS.edu!, list: people, type: "degree", group: "people", empty: "" },
  { k: "other", label: "Other", icon: ICONS.other!, list: () => named("docOwners", (x) => x.group === "other"), type: "other", group: "other", empty: "" },
];
const ico = (d: string): string => html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const WHO: Record<string, string> = { people: "Whose?", insurance: "Which policy?", other: "Which one?" };

/** Step 1: what the document is for. */
export function addPicker(): void {
  openSheet("Add a document", html`<p class="note">What is it for?</p><div class="dcats">${raw(CATS.map((c) => html`<button type="button" data-cat="${c.k}">${raw(ico(c.icon))}<span>${c.label}</span></button>`).join(""))}</div>
    <div class="btns"><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $(s, "cx").onclick = closeModal;
    s.querySelectorAll<HTMLElement>("[data-cat]").forEach((b) => { b.onclick = () => pickOwner(CATS.find((c) => c.k === b.dataset.cat)!); });
  });
}

/** Step 2: which one it belongs to, then the document form. */
function pickOwner(c: Cat): void {
  const l = c.list();
  const open = (owner: Owner): void => { closeModal(); setTimeout(() => docForm(undefined, { owner, type: c.type, ...(TYPES.person.find((t) => t.k === c.type)?.yearly ? { year: fyOf(today()) } : {}) }), 50); };
  const addNew = c.group ? html`<button type="button" class="btn sm" id="dNewOwner">＋ ${GROUP_LABEL[c.group][0]}</button>` : "";
  openSheet(c.label, html`<p class="note">${c.group ? WHO[c.group]! : `Which ${c.label.toLowerCase()}?`}</p>
    ${raw(l.length ? html`<div class="list">${raw(l.map((o) => html`<button type="button" class="row tap dpick" data-key="${oKey(o.owner)}"><div class="main"><div class="t">${o.name}</div>${raw(o.sub ? html`<div class="s">${o.sub}</div>` : "")}</div></button>`).join(""))}</div>` : html`<p class="note">${c.empty || `Nothing here yet. Add the first one.`}</p>`)}
    <div class="btns">${raw(addNew)}<button class="btn" id="dPrev" type="button">Back</button></div>`, (s) => {
    $(s, "dPrev").onclick = () => addPicker();
    s.querySelector<HTMLElement>("#dNewOwner")?.addEventListener("click", () => { closeModal(); ownerForm(c.group!, undefined, (o) => setTimeout(() => docForm(undefined, { owner: o, type: c.type }), 50)); });
    s.querySelectorAll<HTMLElement>("[data-key]").forEach((b) => { b.onclick = () => open(parseKey(b.dataset.key!)); });
  });
}
