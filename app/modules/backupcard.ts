/** Settings › Backup: download a full backup, the weekly backup to Drive, and restoring one. */
import { html, raw, toast } from "../core/dom.ts";
import { ctx } from "../core/app.ts";
import { BACKED_UP, backupDrive, fileName, lastBackup, logBackup, openBackup, readOutside, restoreSet, summary, weeklyOn, type BackupFile, type Contents, type LogRec } from "../core/backup.ts";
import { backupNow, weeklyBackup } from "../core/backup-auto.ts";
import { connectDrive, fileSize, isPopupBlocked, needsDriveTap, saveBlob } from "../core/files.ts";
import { isNative } from "../core/native.ts";
import { parseSecretKey } from "../core/crypto.ts";
import { localSecretKey } from "../core/vault.ts";
import { BACKUP_LOG } from "../core/store.ts";

const when = (t: number | string): string => new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const WHERE: Record<LogRec["where"], string> = { drive: "to your Google Drive", file: "downloaded", "before-restore": "before a restore" };

export function backupCard(): string {
  const st = ctx.store;
  if (!st || !ctx.session) return "";
  const last = lastBackup(st.all<LogRec>(BACKUP_LOG)), on = weeklyOn((c) => st.all(c));
  return html`<section class="card" id="bkCard">
    <h2>Backup</h2>
    <p>One file with everything: Money, Household, Habits, and the list of your vault files. Encrypted with your passphrase.</p>
    <p class="note" id="bkLast">${last ? `Last backup: ${when(last.made)} (${WHERE[last.where]}) · ${fileSize(last.size)}` : "No backup yet."}</p>
    <label class="bksw"><span><b>Weekly backup to Google Drive</b><span class="note">Every Sunday (the first time the app opens), into “Akhila Vrutta/Backups”. The last 8 are kept.${isNative() ? "" : " On the website it needs a tap on Back up to Drive."}</span></span><input type="checkbox" id="bkWeekly" role="switch" ${on ? "checked" : ""}></label>
    <div class="btns"><button class="btn pri" type="button" id="bkDown">Download a backup now</button><button class="btn" type="button" id="bkDrive">Back up to Drive now</button><button class="btn" type="button" id="bkRestore">Restore from a backup</button></div>
    <div id="bkArea"></div>
  </section>`;
}

export function wireBackup(root: HTMLElement): void {
  const card = root.querySelector<HTMLElement>("#bkCard");
  if (!card) return;
  const area = card.querySelector<HTMLElement>("#bkArea")!;
  const busy = (b: HTMLButtonElement, on: boolean, txt: string): void => { b.disabled = on; if (on) { b.dataset.lbl = b.textContent ?? ""; b.textContent = txt; } else b.textContent = b.dataset.lbl ?? b.textContent; };
  const err = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  card.querySelector<HTMLInputElement>("#bkWeekly")!.addEventListener("change", (e) => {
    const weekly = (e.target as HTMLInputElement).checked;
    ctx.store!.writeMany([{ c: BACKUP_LOG, id: "settings", r: { id: "settings", weekly, updatedAt: Date.now() } }]);
    toast(weekly ? "Weekly backup on" : "Weekly backup off");
  });

  card.querySelector<HTMLButtonElement>("#bkDown")!.addEventListener("click", async (ev) => {
    const b = ev.currentTarget as HTMLButtonElement;
    busy(b, true, "Making the backup…");
    try {
      const bytes = await backupNow(), name = fileName();
      const where = await saveBlob(name, "application/octet-stream", new Blob([bytes]));
      logBackup(bytes.length, "file", name);
      toast(`${where} · ${fileSize(bytes.length)}`);
    } catch (e) { toast(`Couldn't make the backup: ${err(e)}`); }
    busy(b, false, "");
  });

  card.querySelector<HTMLButtonElement>("#bkDrive")!.addEventListener("click", async (ev) => {
    const b = ev.currentTarget as HTMLButtonElement;
    // on the website, Google's permission window must open straight from the tap
    const asked = needsDriveTap() ? connectDrive() : Promise.resolve();
    busy(b, true, "Backing up to Drive…");
    try { await asked; await weeklyBackup(true); toast("Backed up to your Google Drive"); }
    catch (e) { toast(isPopupBlocked(e) ? "The browser blocked Google's window. Allow pop-ups for this site and tap again." : `Couldn't back up to Drive: ${err(e)}`); }
    busy(b, false, "");
  });

  card.querySelector<HTMLButtonElement>("#bkRestore")!.addEventListener("click", () => {
    area.innerHTML = html`<div class="bkstep"><p><b>Restore from a backup</b></p><p class="note">Choose a backup file, or one of the weekly backups in your Drive.</p>
      <div class="btns"><label class="btn" for="bkFile">Choose a file</label><input id="bkFile" type="file" hidden><button class="btn" type="button" id="bkFromDrive">From Google Drive</button><button class="btn ghost" type="button" id="bkX">Cancel</button></div><div id="bkList"></div></div>`;
    area.querySelector("#bkX")!.addEventListener("click", () => { area.innerHTML = ""; });
    area.querySelector<HTMLInputElement>("#bkFile")!.addEventListener("change", async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      try { askPass(readOutside(new Uint8Array(await f.arrayBuffer())), f.name); } catch (x) { toast(err(x)); }
    });
    area.querySelector<HTMLButtonElement>("#bkFromDrive")!.addEventListener("click", async (ev) => {
      const b = ev.currentTarget as HTMLButtonElement, d = backupDrive();
      if (!d) return toast("Google Drive isn't available here.");
      const asked = needsDriveTap() ? connectDrive() : Promise.resolve();
      busy(b, true, "Looking in Drive…");
      try {
        await asked;
        const list = (await d.list()).filter((x) => x.name.endsWith(".avb"));
        const box = area.querySelector<HTMLElement>("#bkList")!;
        box.innerHTML = list.length ? html`<div class="bklist">${raw(list.map((x) => html`<button type="button" class="bkpick" data-id="${x.id}" data-name="${x.name}"><b>${when(x.made)}</b><span>${fileSize(x.size)}</span></button>`).join(""))}</div>` : html`<p class="note">No backups in your Drive yet.</p>`;
        box.querySelectorAll<HTMLButtonElement>(".bkpick").forEach((p) => p.addEventListener("click", async () => {
          p.disabled = true;
          try { askPass(readOutside(await d.download(p.dataset.id!)), p.dataset.name!); } catch (x) { toast(err(x)); p.disabled = false; }
        }));
      } catch (e) { toast(isPopupBlocked(e) ? "The browser blocked Google's window. Allow pop-ups for this site and tap again." : `Couldn't look in Drive: ${err(e)}`); }
      busy(b, false, "");
    });
  });

  function askPass(f: BackupFile, name: string): void {
    area.innerHTML = html`<form class="inl bkstep" id="bkPassF" autocomplete="off"><p><b>${name}</b><br><span class="note">Made ${when(f.made)}</span></p>
      <input type="text" name="username" value="akhila-vrutta" autocomplete="username" hidden>
      <label for="bkPass">Passphrase this backup was made with</label><input id="bkPass" type="password" autocomplete="current-password" required>
      <div id="bkSkW" hidden><label for="bkSk">Secret Key (from your Emergency Kit)</label><input id="bkSk" type="text" autocomplete="off" spellcheck="false" class="skin"></div>
      <div class="btns"><button class="btn pri" type="submit">Open</button><button class="btn ghost" type="button" id="bkX">Cancel</button></div></form>`;
    area.querySelector("#bkX")!.addEventListener("click", () => { area.innerHTML = ""; });
    area.querySelector("form")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const b = area.querySelector<HTMLButtonElement>(".btn.pri")!;
      busy(b, true, "Opening…");
      try {
        // the Secret Key: this device's copy, or typed in (shown when the backup needs it and the device has none)
        const skW = area.querySelector<HTMLElement>("#bkSkW")!, typed = area.querySelector<HTMLInputElement>("#bkSk")!.value.trim();
        let sk: Uint8Array<ArrayBuffer> | undefined;
        if (f.wrap.sk) {
          const kept = await localSecretKey();
          sk = (!skW.hidden && typed ? parseSecretKey(typed) : kept ? parseSecretKey(kept) : null) ?? undefined;
          if (!sk) { skW.hidden = false; busy(b, false, ""); return toast(typed ? "That Secret Key isn't right: check it against your Emergency Kit." : "This backup also needs your Secret Key."); }
        }
        const r = await openBackup(f, area.querySelector<HTMLInputElement>("#bkPass")!.value, ctx.session?.dek, sk);
        if (!r) { busy(b, false, ""); return toast(f.wrap.sk ? "That passphrase or Secret Key doesn't open this backup." : "That passphrase doesn't open this backup."); }
        confirmRestore(f, name, r.contents, r.sameKey);
      } catch (e) { busy(b, false, ""); toast(`Couldn't open it: ${err(e)}`); }
    });
  }

  function confirmRestore(f: BackupFile, name: string, c: Contents, sameKey: boolean): void {
    const rows = summary(c.counts);
    area.innerHTML = html`<div class="bkstep"><p><b>${name}</b><br><span class="note">Made ${when(f.made)}</span></p>
      <div class="bkinc">${raw(rows.map(([l, v]) => html`<span>${l} <b>${v.toLocaleString("en-IN")}</b></span>`).join(""))}</div>
      ${raw(sameKey ? "" : html`<p class="note">This backup was made with a different data key, so the vault files in it can't be opened here; they are left out.</p>`)}
      <div class="bkwarn"><b>This replaces what's in the app now.</b> Changes made after ${when(f.made)} will be lost. A backup of the current data is saved first, just in case.</div>
      <div class="btns"><button class="btn pri" type="button" id="bkGo">Restore</button><button class="btn ghost" type="button" id="bkX">Cancel</button></div></div>`;
    area.querySelector("#bkX")!.addEventListener("click", () => { area.innerHTML = ""; });
    area.querySelector<HTMLButtonElement>("#bkGo")!.addEventListener("click", async (ev) => {
      const b = ev.currentTarget as HTMLButtonElement;
      area.querySelectorAll<HTMLButtonElement>("button").forEach((x) => (x.disabled = true));
      try {
        b.textContent = "Saving a copy of what's here now…";
        const before = await backupNow(), bname = fileName().replace(".avb", "-before-restore.avb");
        await saveBlob(bname, "application/octet-stream", new Blob([before]));
        logBackup(before.length, "before-restore", bname);
        const res = await ctx.store!.replaceAll(restoreSet(c, sameKey), (d, t) => { b.textContent = `Restoring… ${Math.round((d / t) * 100)}%`; }, BACKED_UP());
        area.innerHTML = "";
        toast(`Restored from ${when(f.made)} (${res.written} written, ${res.removed} removed). The copy from before is in your downloads.`);
        ctx.rerender();
      } catch (e) {
        toast(`Couldn't restore: ${err(e)}`);
        area.querySelectorAll<HTMLButtonElement>("button").forEach((x) => (x.disabled = false));
        b.textContent = "Restore";
      }
    });
  }
}
