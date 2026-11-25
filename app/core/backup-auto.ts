/** The weekly backup to Google Drive, made by itself a little after the app opens (when one is due). */
import { ctx } from "./app.ts";
import { backupDrive, backupToDrive, fileName, logBackup, makeBackup, setBackupDrive, weeklyDue, weeklyOn, type LogRec } from "./backup.ts";
import { driveBackups } from "./files.ts";
import { config } from "./firebase.ts";
import { BACKUP_LOG } from "./store.ts";
import type { PassWrap } from "./crypto.ts";
import { passWrapOf } from "./vault.ts";

/** Makes a backup file of everything now (for Download, Drive, or before a restore). */
export async function backupNow(): Promise<Uint8Array<ArrayBuffer>> {
  const s = ctx.session, st = ctx.store;
  if (!s || !st) throw new Error("The app is locked.");
  const wrap = (window as unknown as { AV_TEST_WRAP?: PassWrap }).AV_TEST_WRAP ?? await passWrapOf(s.home, s.uid);
  if (!wrap) throw new Error("Couldn't read your key from the cloud. Check the connection and try again.");
  return makeBackup(wrap, s.dek, (c) => st.all(c), config().build);
}

let running = false;
export async function weeklyBackup(force = false): Promise<boolean> {
  const st = ctx.store, d = backupDrive();
  if (running || !st || !d || !d.available()) return false;
  if (!force && (!weeklyOn((c) => st.all(c)) || !weeklyDue(st.all<LogRec>(BACKUP_LOG)))) return false;
  running = true;
  try {
    const bytes = await backupNow();
    await backupToDrive(bytes);
    logBackup(bytes.length, "drive", fileName());
    return true;
  } finally { running = false; }
}

export function startBackups(): void {
  if (!backupDrive()) setBackupDrive(driveBackups);
  setTimeout(() => { weeklyBackup().catch((e) => console.warn("weekly backup", e)); }, 20_000);
}
