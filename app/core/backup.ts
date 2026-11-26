/**
 * Full backup: one file with every record (Money, Household, Habits, the list of vault files), encrypted with
 * the data key. The file also carries the data key wrapped by the passphrase (as the cloud keeps it), so it
 * opens with the passphrase it was made with, and needs no passphrase to be made (weekly backups run by
 * themselves). The vault files stay in Drive, encrypted with the same data key. If the Secret Key was on when
 * it was made, opening it needs the Secret Key too.
 *   { kind: "akhila-vrutta-backup", v: 1, made, build, wrap: PassWrap, data: Sealed }
 *   data opens (aad "backup") to { made, counts, collections: { name: Rec[] } }
 * Weekly: the first time the app opens on or after Sunday, into "Akhila Vrutta/Backups" in Drive; the last
 * 8 are kept. backupLog keeps when each was made, and the weekly setting.
 */
import { ctx } from "./app.ts";
import { aesKey, open, openJSON, sealJSON, TD, TE, unwrapWithPass, type PassWrap, type Sealed } from "./crypto.ts";
import { BACKUP_LOG, COLLECTIONS, type Rec } from "./store.ts";

export const KIND = "akhila-vrutta-backup";
export interface BackupFile { kind: typeof KIND; v: 1; made: string; build?: string; wrap: PassWrap; data: Sealed }
export interface Contents { made: string; counts: Record<string, number>; collections: Record<string, Rec[]> }
export interface LogRec extends Rec { made: number; size: number; where: "drive" | "file" | "before-restore"; name?: string }
export interface Settings extends Rec { weekly: boolean }

/** Where weekly backups go (Google Drive normally; tests swap in a stand-in). */
export interface BackupDrive {
  available(): boolean;
  upload(name: string, bytes: Uint8Array<ArrayBuffer>): Promise<string>;
  list(): Promise<{ id: string; name: string; size: number; made: number }[]>;
  download(id: string): Promise<Uint8Array<ArrayBuffer>>;
  remove(id: string): Promise<void>;
}
let drive: BackupDrive | null = null;
export const setBackupDrive = (d: BackupDrive): void => { drive = d; };
export const backupDrive = (): BackupDrive | null => drive;

export const KEEP = 8;
const pad = (n: number): string => String(n).padStart(2, "0");
export const fileName = (d = new Date()): string => `akhila-vrutta-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.avb`;

/** Collections in a backup: everything the app keeps, except the backup log itself. */
export const BACKED_UP = (): string[] => COLLECTIONS.filter((c) => c !== BACKUP_LOG);

/** Makes the backup file from what's in the store now. */
export async function makeBackup(wrap: PassWrap, dek: CryptoKey, all: (c: string) => Rec[], build = ""): Promise<Uint8Array<ArrayBuffer>> {
  const collections: Record<string, Rec[]> = {}, counts: Record<string, number> = {};
  for (const c of BACKED_UP()) { const l = all(c).filter((r) => !(r as { deleted?: boolean }).deleted); if (l.length) { collections[c] = l; counts[c] = l.length; } }
  const made = new Date().toISOString();
  const file: BackupFile = { kind: KIND, v: 1, made, ...(build ? { build } : {}), wrap, data: await sealJSON(dek, { made, counts, collections } satisfies Contents, "backup") };
  return TE.encode(JSON.stringify(file));
}

/** Reads a backup file's outside (no passphrase needed): when it was made. Throws if it isn't one. */
export function readOutside(bytes: Uint8Array): BackupFile {
  let f: BackupFile;
  try { f = JSON.parse(TD.decode(bytes)) as BackupFile; } catch { throw new Error("That isn't an Akhila Vrutta backup."); }
  if (f?.kind !== KIND || !f.wrap || !f.data) throw new Error("That isn't an Akhila Vrutta backup.");
  if (f.v !== 1) throw new Error("This backup was made by a newer version of the app. Update the app first.");
  return f;
}

/** Opens a backup with the passphrase it was made with; null when the passphrase doesn't match. */
export async function openBackup(f: BackupFile, pass: string, current?: CryptoKey, sk?: Uint8Array<ArrayBuffer>): Promise<{ contents: Contents; sameKey: boolean } | null> {
  const raw = await unwrapWithPass(pass, f.wrap, sk);
  if (!raw) return null;
  const key = await aesKey(raw);
  raw.fill(0);
  const contents = await openJSON<Contents>(key, f.data, "backup");
  // the vault files in Drive open only with the key they were made with: is it this account's key?
  let sameKey = false;
  if (current) { try { await open(current, f.data, "backup"); sameKey = true; } catch { sameKey = false; } }
  return { contents, sameKey };
}

/** What a restore puts back: everything in the backup (vault-file records only when the key is the same). */
export function restoreSet(c: Contents, sameKey: boolean): Record<string, Rec[]> {
  const out: Record<string, Rec[]> = {};
  for (const name of BACKED_UP()) if (name !== "files" || sameKey) out[name] = c.collections[name] ?? [];
  return out;
}

/** Groups for showing what's in a backup. */
export function summary(counts: Record<string, number>): [string, number][] {
  const n = (l: string[]): number => l.reduce((s, c) => s + (counts[c] ?? 0), 0);
  return ([
    ["Transactions", n(["txns"])],
    ["Accounts, cards, loans, holdings", n(["accounts", "loans", "holdings", "props"])],
    ["Plan items, goals, categories", n(["recurring", "goals", "categories", "propItems", "payers", "snaps", "trades", "views", "settings"])],
    ["Household: homes, jobs, appliances, vehicles, lists", n(["hhHomes", "hhJobs", "hhDone", "hhAppliances", "hhItems", "hhVehicles", "hhFuel"])],
    ["Documents", n(["docs", "docOwners"])],
    ["Habits and their days", n(["habits", "habitLog", "habitPrefs"])],
    ["Vault files (kept in your Drive)", n(["files"])],
  ] as [string, number][]).filter(([, v]) => v > 0);
}

/* ---------- weekly ---------- */
/** The most recent Sunday 00:00 (today if it's Sunday). */
export function lastSunday(now = new Date()): Date { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; }
export const lastBackup = (log: LogRec[]): LogRec | undefined => log.filter((l) => l.where !== "before-restore" && typeof l.made === "number").sort((a, b) => b.made - a.made)[0];
export const weeklyOn = (all: (c: string) => Rec[]): boolean => (all(BACKUP_LOG).find((r) => r.id === "settings") as Settings | undefined)?.weekly !== false;
export const weeklyDue = (log: LogRec[], now = new Date()): boolean => { const l = log.filter((x) => x.where === "drive").sort((a, b) => b.made - a.made)[0]; return !l || l.made < +lastSunday(now); };

/** Saves a backup to Drive and keeps only the last 8 there. */
export async function backupToDrive(bytes: Uint8Array<ArrayBuffer>, now = new Date()): Promise<string> {
  if (!drive) throw new Error("Google Drive isn't available here.");
  const name = fileName(now), id = await drive.upload(name, bytes);
  const list = (await drive.list()).filter((f) => f.name.endsWith(".avb")).sort((a, b) => b.made - a.made);
  for (const old of list.slice(KEEP)) await drive.remove(old.id).catch(() => {});
  return id;
}

/** Notes a backup in the log (synced, so every device knows when the last one was made). */
export function logBackup(size: number, where: LogRec["where"], name: string): void {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  ctx.store?.writeMany([{ c: BACKUP_LOG, id, r: { id, made: Date.now(), size, where, name, updatedAt: Date.now() } }]);
  // keep the log short
  const old = (ctx.store?.all<LogRec>(BACKUP_LOG) ?? []).filter((r) => r.id !== "settings" && typeof r.made === "number").sort((a, b) => b.made - a.made).slice(30);
  if (old.length) ctx.store?.writeMany(old.map((r) => ({ c: BACKUP_LOG, id: r.id, r: null })));
}
