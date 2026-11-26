/**
 * The vault's file tiles inside a sheet: the files a record owns (tap to view), "Add file" and "Camera".
 * Files are encrypted here and kept in Google Drive. On the website, Google's permission window opens
 * straight from the tap the first time; if the browser blocks it, an "Allow Drive" tile finishes the job.
 */
import { html, raw } from "../../core/dom.ts";
import { addFile, connectDrive, fileSize, filesOf, isPopupBlocked, needsDriveTap, type FileRec } from "../../core/files.ts";
import { toast } from "../../core/ui.ts";

export interface Tiles { added: FileRec[]; picked: File[]; refresh(): void }

/** `box`: an element id in the sheet; `pick`/`cam`: ids of hidden file inputs there. */
export function fileTiles(s: HTMLElement, box: string, owner: { c: string; id: string }, onView: (f: FileRec) => void, added: FileRec[] = [], onPicked?: (f: File[]) => void): Tiles {
  const $ = <T extends HTMLElement = HTMLElement>(id: string): T => s.querySelector<T>("#" + id)!;
  const pickId = `${box}Pick`, camId = `${box}Cam`;
  $(box).insertAdjacentHTML("afterend", html`<input type="file" id="${pickId}" accept="image/*,application/pdf" multiple hidden><input type="file" id="${camId}" accept="image/*" capture="environment" hidden>`);
  let waiting: File[] = [];
  const t: Tiles = { added, picked: [], refresh: () => draw() };
  const drive = async (): Promise<boolean> => {
    try { await connectDrive(); return true; } catch (e) { toast(isPopupBlocked(e) ? "Your browser blocked Google's window. Allow pop-ups for this site, then tap again." : `Google Drive access wasn't given (${e instanceof Error ? e.message : "error"}).`); return false; }
  };
  const draw = (): void => {
    const fs = filesOf(owner), busy = $(box).dataset.busy;
    $(box).innerHTML = html`${raw(fs.map((f) => html`<button type="button" class="hhfile" data-file="${f.id}"><span class="ic">${f.mime.startsWith("image/") ? "🖼" : "📄"}</span><span class="nm">${f.name}</span><span class="sz">${fileSize(f.size)}</span></button>`).join(""))}
      ${raw(busy ? html`<span class="hhfile busy"><span class="nm">${busy}</span></span>` : "")}${raw(waiting.length ? html`<button type="button" class="hhfile add hhallow" data-allow="1"><span class="ic">🔑</span><span class="nm">Allow Drive</span><span class="sz">then ${String(waiting.length)} file${waiting.length === 1 ? "" : "s"} save</span></button>` : "")}<button type="button" class="hhfile add" data-pick="${pickId}"><span class="ic">＋</span><span class="nm">Add file</span></button><button type="button" class="hhfile add" data-pick="${camId}"><span class="ic">📷</span><span class="nm">Camera</span></button>`;
    $(box).querySelectorAll<HTMLElement>("[data-pick]").forEach((b) => { b.onclick = async () => { if (needsDriveTap()) { if (!(await drive())) return; toast("Google Drive is connected. If the file chooser didn't open, tap again."); } $(b.dataset.pick!).click(); }; });
    $(box).querySelector<HTMLElement>("[data-allow]")?.addEventListener("click", () => void (async () => { if (!(await drive())) return; const l = waiting; waiting = []; await upload(l); })());
    $(box).querySelectorAll<HTMLElement>("[data-file]").forEach((b) => { b.onclick = () => { const f = filesOf(owner).find((x) => x.id === b.dataset.file); if (f) onView(f); }; });
  };
  const upload = async (list: File[]): Promise<void> => {
    if (!list.length) return;
    t.picked.push(...list); onPicked?.(list);
    for (const [i, f] of list.entries()) {
      $(box).dataset.busy = `Encrypting and saving ${list.length > 1 ? `${i + 1} of ${list.length}` : f.name}…`; draw();
      try { added.push(await addFile(owner, f)); } catch (e) {
        if (isPopupBlocked(e)) { waiting.push(...list.slice(i)); toast("Google needs your OK to use Drive: tap Allow Drive."); break; }
        toast(`Couldn't save ${f.name}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    delete $(box).dataset.busy; draw();
  };
  for (const k of [pickId, camId]) $<HTMLInputElement>(k).onchange = (e) => { const i = e.target as HTMLInputElement; void upload([...(i.files ?? [])]).finally(() => { i.value = ""; }); };
  draw();
  return t;
}
