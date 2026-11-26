/** Documents' sheets: add or change a document (with its files), and people, policies and other owners. */
import { html, raw } from "../../core/dom.ts";
import type { Rec } from "../../core/store.ts";
import { addFile, connectDrive, fileSize, filesOf, isPopupBlocked, needsDriveTap, removeFile, type FileRec } from "../../core/files.ts";
import { askConfirm, closeModal, field, openSheet, toast, val } from "../money/ui/kit.ts";
import { viewFile } from "../household/forms.ts";
import { fyLabel, fyOf, groups, last4, ownerInfo, ownerKind, recentFys, TYPES, typeOf, type Doc, type DocOwner, type Owner } from "./data.ts";
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
    ${raw(field(["dnum", "Number (last 4 only)", "text", { value: doc.num4 ?? "", ph: "only the last 4 are kept" }]))}
    <div class="f"><label>Files <span class="hhenc">encrypted, in your Google Drive</span></label><div class="hhfiles" id="dFiles"></div>
      <input type="file" id="dPick" accept="image/*,application/pdf" multiple hidden><input type="file" id="dCam" accept="image/*" capture="environment" hidden></div>
    ${raw(field(["dnote", "Note (optional)", "text", { value: doc.note ?? "", ph: "e.g. registered at Sub-Registrar, Jayanagar" }]))}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button>${raw(isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>')}</div>`, (s) => {
    const added: FileRec[] = again?.added ?? [];
    const typeSel = $<HTMLSelectElement>(s, "f_dtype"), ownSel = $<HTMLSelectElement>(s, "f_downer");
    const fillTypes = (keep: string): void => {
      const kind = ownerKind(reader(), parseKey(ownSel.value));
      typeSel.innerHTML = TYPES[kind].map((x) => html`<option value="${x.k}" ${x.k === keep ? "selected" : ""}>${x.label}</option>`).join("");
      showYear();
    };
    const showYear = (): void => { $(s, "w_dyear").hidden = !typeOf(ownerKind(reader(), parseKey(ownSel.value)), typeSel.value).yearly; };
    ownSel.onchange = () => fillTypes(typeSel.value);
    typeSel.onchange = showYear;
    fillTypes(doc.type);
    /** What the form says now (for coming back after looking at a file). */
    const draft = (): Doc => {
      const o: Doc = { ...doc, owner: parseKey(ownSel.value), type: typeSel.value };
      if (typeOf(ownerKind(reader(), o.owner), o.type).yearly) o.year = val("dyear"); else delete o.year;
      if (val("dvalid")) o.validTo = val("dvalid"); else delete o.validTo;
      const n = last4(val("dnum")); if (n) o.num4 = n; else delete o.num4;
      if (val("dnote")) o.note = val("dnote"); else delete o.note;
      delete o.na;
      return o;
    };
    let waiting: File[] = [];
    const tiles = (): void => {
      const fs = filesOf(fileOwner), busy = s.querySelector<HTMLElement>("#dFiles")?.dataset.busy;
      $(s, "dFiles").innerHTML = html`${raw(fs.map((f) => html`<button type="button" class="hhfile" data-file="${f.id}"><span class="ic">${f.mime.startsWith("image/") ? "🖼" : "📄"}</span><span class="nm">${f.name}</span><span class="sz">${fileSize(f.size)}</span></button>`).join(""))}
        ${raw(busy ? html`<span class="hhfile busy"><span class="nm">${busy}</span></span>` : "")}${raw(waiting.length ? html`<button type="button" class="hhfile add hhallow" id="dAllow"><span class="ic">🔑</span><span class="nm">Allow Drive</span><span class="sz">then ${String(waiting.length)} file${waiting.length === 1 ? "" : "s"} save</span></button>` : "")}<button type="button" class="hhfile add" id="dAddF"><span class="ic">＋</span><span class="nm">Add file</span></button><button type="button" class="hhfile add" id="dAddC"><span class="ic">📷</span><span class="nm">Camera</span></button>`;
      const pick = (inp: string) => async (): Promise<void> => {
        if (needsDriveTap()) {
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
      s.querySelectorAll<HTMLElement>("[data-file]").forEach((b) => { b.onclick = () => { const f = filesOf(fileOwner).find((x) => x.id === b.dataset.file); if (f) { const st: DocDraft = { doc: draft(), isNew, added }; viewFile(f, () => docForm(doc.id, undefined, st)); } }; });
    };
    const upload = async (list: FileList | File[] | null): Promise<void> => {
      const fl = [...(list ?? [])]; if (!fl.length) return;
      for (const [i, f] of fl.entries()) {
        $(s, "dFiles").dataset.busy = `Encrypting and saving ${fl.length > 1 ? `${i + 1} of ${fl.length}` : f.name}…`; tiles();
        try { added.push(await addFile(fileOwner, f)); } catch (e) {
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
      if (val("dnum").replace(/[\s-]/g, "").length > 4) toast("Only the last 4 characters of the number are kept.");
      const o = draft(), ops: { c: string; r: Rec | null; id?: string }[] = [{ c: "docs", r: o }];
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
