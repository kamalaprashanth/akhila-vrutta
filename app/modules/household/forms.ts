/** Household's forms and sheets (Money's sheet kit, so they look and work the same). */
import { html, raw } from "../../core/dom.ts";
import type { Rec } from "../../core/store.ts";
import { addFile, canShareFile, connectDrive, fileSize, filesOf, isPopupBlocked, needsDriveTap, readFile, removeFile, saveCopy, shareCopy, type FileRec } from "../../core/files.ts";
import { accOpts, askConfirm, catOpts, closeModal, field, openSheet, toast, val } from "../money/ui/kit.ts";
import { pdfCanvases } from "../money/ui/pdf.ts";
import { isNative } from "../../core/native.ts";
import { moneyNow, moneyWrite } from "../money/index.ts";
import { mainAcc } from "../money/calc/forecast.ts";
import { addMonths, dayLabel, everyLabel, homeName, homes, live, nextDue, STARTERS, type Appliance, type Done, type Item, type Job } from "./data.ts";
import { hhWrite, reader, today } from "./index.ts";

const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const $ = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T => s.querySelector<T>("#" + id)!;
const paise = (s: string): number | undefined => { const n = parseFloat(s); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined; };
const rupees = (p?: number): string => (p ? String(p / 100) : "");
const btns = (isNew: boolean, save = "Save"): string => html`<div class="btns"><button class="btn pri" id="sv" type="button">${save}</button><button class="btn" id="cx" type="button">Cancel</button>${raw(isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>')}</div>`;
const homeOpts = (): [string, string][] => homes(reader()).map((h) => [h.id, h.name]);
const EVERY: [string, string][] = [1, 2, 3, 4, 6, 12, 24].map((n) => [String(n), everyLabel(n)]);
const inr = (p: number): string => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function needHome(): boolean {
  if (homes(reader()).length) return false;
  toast("Add a home first (＋ Home), or a property in Money › Accounts › Properties.");
  return true;
}

/* ---------- homes ---------- */
export function homeForm(id?: string): void {
  const h = id ? reader().get<Rec & { name: string }>("hhHomes", id) : undefined;
  openSheet(h ? h.name : "Add a home", html`${raw(field(["hname", "Name", "text", { value: h?.name, ph: "e.g. Our flat (where we live)" }]))}
    <p class="note">Your properties in Money appear here by themselves. Add the homes that aren't there, like the one you live in.</p>${raw(btns(!h))}`, (s) => {
    $(s, "cx").onclick = closeModal;
    $(s, "sv").onclick = () => { const name = val("hname"); if (!name) return toast("Give it a name."); closeModal(); hhWrite([{ c: "hhHomes", r: { ...(h ?? { id: uid() }), name } }]); toast(h ? "Saved" : "Home added"); };
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => askConfirm(`Remove "${h!.name}"? Its jobs, appliances and list items stay, without a home.`, "Remove", () => hhWrite([{ c: "hhHomes", id: h!.id, r: null }])));
  });
}

/* ---------- starter jobs ---------- */
export function starterSheet(home: string): void {
  const t = today(), have = new Set(live<Job>(reader(), "hhJobs").filter((j) => j.home === home).map((j) => j.name.toLowerCase()));
  const opts = STARTERS.filter((x) => !have.has(x.name.toLowerCase()));
  openSheet(`Usual jobs · ${homeName(reader(), home)}`, html`<p class="note" style="margin-top:0">Tick the ones that apply, and when each is next due. You can change them later.</p>
    ${opts.map((x, i) => raw(html`<div class="hhstart"><label class="opt"><input type="checkbox" id="st${i}"><div><b>${x.name}</b><span>${everyLabel(x.every)}</span></div></label><div class="f"><label for="sd${i}">Next due</label><input type="date" id="sd${i}" value="${addMonths(t, 1)}"></div></div>`))}
    ${raw(btns(true, "Add these"))}`, (s) => {
    $(s, "cx").onclick = closeModal;
    $(s, "sv").onclick = () => {
      const ops = opts.flatMap((x, i) => ($<HTMLInputElement>(s, `st${i}`).checked ? [{ c: "hhJobs", r: { id: uid(), home, name: x.name, every: x.every, due: $<HTMLInputElement>(s, `sd${i}`).value || addMonths(t, 1) } as Rec }] : []));
      if (!ops.length) return toast("Tick at least one.");
      closeModal(); hhWrite(ops); toast(`${ops.length} job${ops.length === 1 ? "" : "s"} added`);
    };
  });
}

/* ---------- jobs ---------- */
export function jobForm(id?: string, home0?: string): void {
  if (!id && needHome()) return;
  const r = reader(), j = id ? r.get<Job>("hhJobs", id) : undefined, t = today();
  const home = j?.home ?? home0 ?? homes(r)[0]!.id;
  const appl = (h: string): [string, string][] => [["", "None"], ...live<Appliance>(r, "hhAppliances").filter((a) => a.home === h).map((a) => [a.id, a.name] as [string, string])];
  openSheet(j ? j.name : "Add a job", html`${raw(field(["jname", "What", "text", { value: j?.name, ph: "e.g. AC service, pest control" }]))}
    <div class="grid2">${raw(field(["jhome", "Home", "select", { value: home, options: homeOpts() }]))}${raw(field(["jevery", "Repeats", "select", { value: String(j?.every ?? 6), options: EVERY }]))}</div>
    <div class="grid2">${raw(field(["jdue", "Next due", "date", { value: j?.due ?? addMonths(t, 1) }]))}${raw(field(["jappl", "For an appliance (optional)", "select", { value: j?.applianceId ?? "", options: appl(home) }]))}</div>
    ${raw(field(["jnote", "Note (optional)", "text", { value: j?.note, ph: "e.g. 2 units; tenant arranges" }]))}${raw(btns(!j))}`, (s) => {
    $(s, "f_jhome").onchange = () => { $(s, "f_jappl").innerHTML = appl(val("jhome")).map(([k, l]) => html`<option value="${k}">${l}</option>`).join(""); };
    $(s, "cx").onclick = closeModal;
    $(s, "sv").onclick = () => {
      const name = val("jname"); if (!name) return toast("Say what the job is.");
      const o: Rec = { ...(j ?? { id: uid() }), name, home: val("jhome"), every: +val("jevery") || 6, due: val("jdue") || addMonths(t, 1) };
      if (val("jnote")) o.note = val("jnote"); else delete o.note;
      if (val("jappl")) o.applianceId = val("jappl"); else delete o.applianceId;
      closeModal(); hhWrite([{ c: "hhJobs", r: o }]); toast(j ? "Saved" : "Job added");
    };
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => askConfirm(`Remove "${j!.name}"? What was done stays in the history.`, "Remove", () => hhWrite([{ c: "hhJobs", id: j!.id, r: null }])));
  });
}

/** The Money category to suggest: the first whose name matches (home costs: Maintenance, else Household / Housing / Home). */
export const HOME_CATS = [/maint/i, /repair/i, /household/i, /housing|home/i];
function pickCategory(res: RegExp[]): string {
  const opts = catOpts(moneyNow(), "expense");
  for (const re of res) { const o = opts.find(([, l]) => re.test(l)); if (o) return o[0]; }
  return opts[0]?.[0] ?? "";
}
/** Cost fields with "add it to Money", shared by a job done, an appliance serviced and a vehicle's costs. */
export const costFields = (cats: RegExp[] = HOME_CATS, label = "Cost (₹, optional)"): string => {
  const d = moneyNow();
  return html`${raw(field(["dcost", label, "number", { step: "0.01" }]))}
    <label class="opt"><input type="checkbox" id="f_tomoney" checked><div><b>Add to Money as an expense</b><span>Only when there's a cost.</span></div></label>
    <div id="w_money" class="grid2">${raw(field(["accountId", "Paid from", "select", { value: mainAcc(d)?.id ?? "", options: accOpts(d) }]))}${raw(field(["categoryId", "Category", "select", { value: pickCategory(cats), options: catOpts(d, "expense") }]))}</div>`;
};
export function costOps(s: HTMLElement, what: string, date: string): { cost?: number; txnId?: string } {
  const cost = paise(val("dcost"));
  if (!cost || !$<HTMLInputElement>(s, "f_tomoney").checked) return cost ? { cost } : {};
  const txnId = uid();
  moneyWrite([{ c: "txns", r: { id: txnId, type: "expense", amount: cost, date, accountId: val("accountId"), categoryId: val("categoryId"), note: what, updatedAt: Date.now() } as Rec }]);
  return { cost, txnId };
}
const historyList = (l: Done[]): string => {
  const t = today();
  return l.length ? html`<div class="sh"><h3>Done before</h3></div><div class="list">${l.slice(0, 8).map((x) => raw(html`<div class="row"><div class="main"><div class="t">${dayLabel(x.date, t)}${x.cost ? ` · ${inr(x.cost)}` : ""}</div>${raw(x.note ? html`<div class="s">${x.note}</div>` : "")}</div></div>`))}</div>` : "";
};

/** Tapping a job: mark it done (the next due date moves on), or edit it. */
export function doneForm(jobId: string): void {
  const r = reader(), j = r.get<Job>("hhJobs", jobId); if (!j) return;
  const t = today(), hist = live<Done>(r, "hhDone").filter((x) => x.jobId === j.id).sort((a, b) => b.date.localeCompare(a.date));
  openSheet(j.name, html`<p class="note" style="margin-top:0">${[homeName(r, j.home), everyLabel(j.every), `due ${dayLabel(j.due, t)}`, j.last ? `last ${dayLabel(j.last, t)}` : ""].filter(Boolean).join(" · ")}${j.note ? ` · ${j.note}` : ""}</p>
    ${raw(field(["ddate", "Done on", "date", { value: t }]))}${raw(costFields())}${raw(field(["dnote", "Note (optional)", "text", { ph: "e.g. gas top-up in one unit" }]))}
    <div class="btns"><button class="btn pri" id="sv" type="button">Mark done</button><button class="btn" id="ed" type="button">Edit job</button><button class="btn" id="cx" type="button">Cancel</button></div>${raw(historyList(hist))}`, (s) => {
    $(s, "cx").onclick = closeModal;
    $(s, "ed").onclick = () => { closeModal(); jobForm(j.id); };
    $(s, "sv").onclick = () => {
      const date = val("ddate") || t, home = homeName(r, j.home);
      const c = costOps(s, `${j.name}${home ? ` (${home})` : ""}`, date);
      const done: Done = { id: uid(), home: j.home, date, jobId: j.id, what: j.name, ...(j.applianceId ? { applianceId: j.applianceId } : {}), ...c, ...(val("dnote") ? { note: val("dnote") } : {}) };
      closeModal();
      hhWrite([{ c: "hhDone", r: done }, { c: "hhJobs", r: { ...j, last: date, due: nextDue(date, j.every) } }]);
      toast(`Done. Next ${dayLabel(nextDue(date, j.every), t)}${c.txnId ? " · added to Money" : ""}`);
    };
  });
}

/* ---------- appliances ---------- */
/** `again`: coming back from a file, with what was typed so far (the appliance may not be saved yet). */
export function applianceForm(id?: string, home0?: string, again?: { draft: Appliance; isNew: boolean; added: FileRec[] }): void {
  if (!id && !again && needHome()) return;
  const r = reader(), a0 = again?.draft ?? (id ? r.get<Appliance>("hhAppliances", id) : undefined), isNew = again ? again.isNew : !a0, t = today();
  const a: Appliance = a0 ?? ({ id: uid(), home: home0 || homes(r)[0]!.id, name: "" } as Appliance);
  const owner = { c: "hhAppliances", id: a.id }, hist = live<Done>(r, "hhDone").filter((x) => x.applianceId === a.id).sort((p, q) => q.date.localeCompare(p.date));
  openSheet(isNew ? "Add appliance" : a.name, html`<div class="grid2">${raw(field(["aname", "What", "text", { value: a.name, ph: "e.g. Washing machine" }]))}${raw(field(["ahome", "Home", "select", { value: a.home, options: homeOpts() }]))}</div>
    <div class="grid2">${raw(field(["amodel", "Brand & model", "text", { value: a.model, ph: "e.g. LG FHM1408" }]))}${raw(field(["abought", "Bought on", "date", { value: a.bought ?? "" }]))}</div>
    <div class="grid2">${raw(field(["aprice", "Price (₹)", "number", { value: rupees(a.price), step: "0.01" }]))}${raw(field(["awarr", "Warranty until", "date", { value: a.warrantyTo ?? "" }]))}</div>
    <div class="grid2">${raw(field(["aamc", "AMC until (optional)", "date", { value: a.amcTo ?? "" }]))}${raw(field(["asvc", "Service centre", "text", { value: a.service, ph: "e.g. LG 1800-315-9999" }]))}</div>
    ${raw(field(["anote", "Note (optional)", "text", { value: a.note }]))}
    <div class="f"><label>Bill, warranty card, photos <span class="hhenc">encrypted, in your Google Drive</span></label><div class="hhfiles" id="hhFiles"></div>
      <input type="file" id="hhPick" accept="image/*,application/pdf" multiple hidden><input type="file" id="hhCam" accept="image/*" capture="environment" hidden></div>
    ${raw(btns(isNew))}
    ${raw(isNew ? "" : html`<div class="btns" style="margin-top:4px"><button class="btn sm" type="button" id="svcLog">Log a service</button></div>`)}${raw(historyList(hist))}`, (s) => {
    const added: FileRec[] = again?.added ?? [];
    /** What the form says now, for coming back to it after looking at a file. */
    const draft = (): Appliance => {
      const o: Appliance = { ...a, name: val("aname"), home: val("ahome") || a.home };
      for (const [k, f] of [["model", "amodel"], ["bought", "abought"], ["warrantyTo", "awarr"], ["amcTo", "aamc"], ["service", "asvc"], ["note", "anote"]] as const) { if (val(f)) o[k] = val(f); else delete o[k]; }
      const p = paise(val("aprice")); if (p) o.price = p; else delete o.price;
      return o;
    };
    let waiting: File[] = [];   // files read but not saved: Google's permission popup was blocked
    const tiles = (): void => {
      const fs = filesOf(owner), busy = s.querySelector<HTMLElement>("#hhFiles")?.dataset.busy;
      $(s, "hhFiles").innerHTML = html`${fs.map((f) => raw(html`<button type="button" class="hhfile" data-file="${f.id}"><span class="ic">${f.mime.startsWith("image/") ? "🖼" : "📄"}</span><span class="nm">${f.name}</span><span class="sz">${fileSize(f.size)}</span></button>`))}
        ${raw(busy ? html`<span class="hhfile busy"><span class="nm">${busy}</span></span>` : "")}${raw(waiting.length ? html`<button type="button" class="hhfile add hhallow" id="hhAllow"><span class="ic">🔑</span><span class="nm">Allow Drive</span><span class="sz">then ${waiting.length} file${waiting.length === 1 ? "" : "s"} save</span></button>` : "")}<button type="button" class="hhfile add" id="hhAddF"><span class="ic">＋</span><span class="nm">Add file</span></button><button type="button" class="hhfile add" id="hhAddC"><span class="ic">📷</span><span class="nm">Camera</span></button>`;
      // the first file of a visit asks Google for Drive access straight from the tap, then opens the picker
      const pick = (id: string) => async (): Promise<void> => {
        if (needsDriveTap(owner)) {
          try { await connectDrive(); } catch (e) { toast(isPopupBlocked(e) ? "Your browser blocked Google's window. Allow pop-ups for this site, then tap again." : `Google Drive access wasn't given (${e instanceof Error ? e.message : "error"}).`); return; }
          toast("Google Drive is connected. If the file chooser didn't open, tap again.");
        }
        $(s, id).click();
      };
      $(s, "hhAddF").onclick = () => void pick("hhPick")();
      $(s, "hhAddC").onclick = () => void pick("hhCam")();
      s.querySelector<HTMLElement>("#hhAllow")?.addEventListener("click", () => void (async () => {
        try { await connectDrive(); } catch (e) { toast(isPopupBlocked(e) ? "Your browser blocked Google's window. Allow pop-ups for this site, then tap again." : `Google Drive access wasn't given (${e instanceof Error ? e.message : "error"}).`); return; }
        const again = waiting; waiting = []; await upload(again);
      })());
      s.querySelectorAll<HTMLElement>("[data-file]").forEach((b) => { b.onclick = () => { const f = filesOf(owner).find((x) => x.id === b.dataset.file); if (f) { const st = { draft: draft(), isNew, added }; viewFile(f, () => applianceForm(a.id, undefined, st)); } }; });
    };
    const upload = async (list: FileList | File[] | null): Promise<void> => {
      const fl = [...(list ?? [])]; if (!fl.length) return;
      for (const [i, f] of fl.entries()) {
        $(s, "hhFiles").dataset.busy = `Encrypting and saving ${fl.length > 1 ? `${i + 1} of ${fl.length}` : f.name}…`; tiles();
        try { added.push(await addFile(owner, f)); } catch (e) {
          if (isPopupBlocked(e)) { waiting.push(...fl.slice(i)); toast("Google needs your OK to use Drive: tap Allow Drive."); break; }
          toast(`Couldn't save ${f.name}: ${e instanceof Error ? e.message : "error"}`);
        }
      }
      delete $(s, "hhFiles").dataset.busy; tiles();
    };
    for (const k of ["hhPick", "hhCam"]) $<HTMLInputElement>(s, k).onchange = (e) => { const i = e.target as HTMLInputElement; void upload(i.files).finally(() => { i.value = ""; }); };
    tiles();
    $(s, "cx").onclick = () => { closeModal(); if (isNew) for (const f of added) void removeFile(f); };
    $(s, "sv").onclick = () => {
      const name = val("aname"); if (!name) return toast("Say what it is, e.g. Washing machine.");
      const o = draft() as Rec;
      closeModal(); hhWrite([{ c: "hhAppliances", r: o }]); toast(isNew ? "Appliance added" : "Saved");
    };
    s.querySelector<HTMLElement>("#dl")?.addEventListener("click", () => askConfirm(`Remove "${a.name}" and its ${filesOf(owner).length} file(s) from Google Drive?`, "Remove", () => { for (const f of filesOf(owner)) void removeFile(f); hhWrite([{ c: "hhAppliances", id: a.id, r: null }]); }));
    s.querySelector<HTMLElement>("#svcLog")?.addEventListener("click", () => { closeModal(); serviceForm(a.id); });
  });
}

/** An appliance serviced or repaired (not a repeating job). */
export function serviceForm(applianceId: string): void {
  const r = reader(), a = r.get<Appliance>("hhAppliances", applianceId); if (!a) return;
  const t = today();
  openSheet(`Service · ${a.name}`, html`${raw(field(["ddate", "Done on", "date", { value: t }]))}${raw(field(["dwhat", "What was done", "text", { ph: "e.g. drum clean, gas top-up" }]))}${raw(costFields())}${raw(field(["dnote", "Note (optional)", "text", { ph: "e.g. under warranty; LG technician" }]))}${raw(btns(true))}`, (s) => {
    $(s, "cx").onclick = () => { closeModal(); applianceForm(a.id); };
    $(s, "sv").onclick = () => {
      const date = val("ddate") || t, what = val("dwhat") || "Service";
      const c = costOps(s, `${a.name}: ${what}`, date);
      closeModal();
      hhWrite([{ c: "hhDone", r: { id: uid(), home: a.home, date, applianceId: a.id, what, ...c, ...(val("dnote") ? { note: `${what} · ${val("dnote")}` } : { note: what }) } as Rec }]);
      toast(`Saved${c.txnId ? " · added to Money" : ""}`);
      applianceForm(a.id);
    };
  });
}

/**
 * A file from the vault, decrypted here: a picture or a PDF's pages. It can be saved to the phone or shared
 * to another app; each time the app first says the copy won't be encrypted (asked for by the owner).
 */
export function viewFile(f: FileRec, back: () => void): void {
  openSheet(f.name, html`<div class="hhview" id="hhViewF"><p class="note">Fetching from Google Drive and decrypting…</p></div>
    <div id="hhOut"></div>
    <div class="btns"><button class="btn" id="cx" type="button">Back</button><button class="btn danger" id="dl" type="button">Delete</button></div>`, (s) => {
    let url = "", blob: Blob | null = null;
    const done = (): void => { if (url) URL.revokeObjectURL(url); };
    $(s, "cx").onclick = () => { done(); closeModal(); back(); };
    $(s, "dl").onclick = () => askConfirm(`Delete ${f.name} from Google Drive?`, "Delete", () => { void removeFile(f).then(() => { done(); back(); }, (e) => toast(`Couldn't delete: ${e instanceof Error ? e.message : "error"}`)); });
    const share = canShareFile(f);
    const actions = (): void => {
      $(s, "hhOut").innerHTML = html`<div class="btns hhout"><button class="btn pri" id="fsave" type="button">⬇&nbsp; ${isNative() ? "Save to phone" : "Download"}</button>${raw(share ? html`<button class="btn pri" id="fshare" type="button">↗&nbsp; Share</button>` : "")}</div>`;
      $(s, "fsave").onclick = () => ask("save");
      if (share) $(s, "fshare").onclick = () => ask("share");
    };
    // every time: the copy leaves the vault unencrypted
    const ask = (what: "save" | "share"): void => {
      $(s, "hhOut").innerHTML = html`<div class="hhwarn" id="hhWarn"><p><b>This copy won't be encrypted.</b> ${what === "save" ? (isNative() ? "Anyone who can open your phone's Downloads can read it." : "Anyone who can open your downloads can read it.") : "The app you share it to, and anyone it reaches, can read it."}</p>
        <div class="btns"><button class="btn pri" id="fgo" type="button">${what === "save" ? "Save copy" : "Share"}</button><button class="btn" id="fno" type="button">Cancel</button></div></div>`;
      $(s, "fno").onclick = actions;
      $(s, "fgo").onclick = () => {
        const b = blob; if (!b) return;
        actions();
        if (what === "save") void saveCopy(f, b).then(toast, (e) => toast(`Couldn't save: ${e instanceof Error ? e.message : "error"}`));
        else void shareCopy(f, b).catch((e) => toast(`Couldn't share: ${e instanceof Error ? e.message : "error"}`));
      };
    };
    void (async () => {
      try {
        const b = await readFile(f), box = $(s, "hhViewF");
        blob = b; url = URL.createObjectURL(b); actions();
        if (f.mime.startsWith("image/")) box.innerHTML = html`<img src="${url}" alt="${f.name}">`;
        else if (f.mime === "application/pdf") { box.innerHTML = ""; for (const c of await pdfCanvases(new Uint8Array(await b.arrayBuffer()), box.clientWidth || 340)) box.appendChild(c); }
        else box.innerHTML = html`<p class="note">${f.name} · ${fileSize(f.size)}. This kind of file can't be shown here; save or share it to open it in another app.</p>`;
      } catch (e) { $(s, "hhViewF").innerHTML = html`<p class="note">Couldn't open it: ${e instanceof Error ? e.message : "error"}</p>`; }
    })();
  });
}

/* ---------- list items ---------- */
export function itemForm(id: string): void {
  const r = reader(), i = r.get<Item>("hhItems", id); if (!i) return;
  openSheet(i.list === "todo" ? "To do" : "Groceries", html`${raw(field(["itext", i.list === "todo" ? "What" : "Item", "text", { value: i.text }]))}
    <div class="grid2">${raw(field(["ihome", "Home (optional)", "select", { value: i.home ?? "", options: [["", "Any"], ...homeOpts()] }]))}${raw(i.list === "todo" ? field(["idue", "By (optional)", "date", { value: i.due ?? "" }]) : "")}</div>${raw(btns(false))}`, (s) => {
    $(s, "cx").onclick = closeModal;
    $(s, "sv").onclick = () => {
      const text = val("itext"); if (!text) return toast("Write what it is.");
      const o: Rec = { ...i, text };
      if (val("ihome")) o.home = val("ihome"); else delete o.home;
      if (i.list === "todo") { if (val("idue")) o.due = val("idue"); else delete o.due; }
      closeModal(); hhWrite([{ c: "hhItems", r: o }]);
    };
    $(s, "dl").onclick = () => { closeModal(); hhWrite([{ c: "hhItems", id: i.id, r: null }]); };
  });
}

