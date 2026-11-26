/**
 * The vault: files (bills, warranty cards, photos) encrypted on this device with the data key, then kept in
 * an "Akhila Vrutta" folder in your Google Drive. Drive only ever holds ciphertext named <id>.avf; the real
 * name and type live in the encrypted `files` record. The app asks Drive only for "files this app made", so
 * it can't see anything else there.
 *   files/{id} = { drive, name, mime, size, iv, z?, owner: { c, id }, added }
 */
import { ctx } from "./app.ts";
import { fromB64, open, seal, toB64 } from "./crypto.ts";
import { config, googleAccess } from "./firebase.ts";
import { isNative, nativeCall } from "./native.ts";
import { FILES, type Rec } from "./store.ts";
import type { BackupDrive } from "./backup.ts";

export interface FileRec extends Rec { drive: string; name: string; mime: string; size: number; iv: string; z?: 0 | 1; owner: { c: string; id: string }; added: number; deleted?: boolean; fam?: number }

/**
 * Files of items shared with the family (core/famfiles.ts): sealed with the family key, one copy in each
 * member's Drive (folder Akhila Vrutta/Family), carried across through the family space while the other phone
 * catches up. `fam` = how many relay pieces are waiting (0 or absent: none).
 */
export interface FamFiles {
  owns(owner: { c: string; id: string } | undefined): boolean;
  add(owner: { c: string; id: string }, plain: Uint8Array<ArrayBuffer>, meta: { name: string; mime: string; size: number }): Promise<FileRec>;
  read(r: FileRec): Promise<Uint8Array<ArrayBuffer>>;
  remove(r: FileRec): Promise<void>;
}
let famFiles: FamFiles | null = null;
export const setFamFiles = (f: FamFiles | null): void => { famFiles = f; };
/** A family file: it has relay pieces, or a family copy (no private Drive id). */
export const isFamFile = (r: FileRec): boolean => !r.drive;

/** Where the ciphertext is kept. Google Drive normally; tests swap in a stand-in. */
export interface Backend {
  upload(name: string, bytes: Uint8Array<ArrayBuffer>, sub?: "Family"): Promise<string>;
  list?(sub: "Family"): Promise<string[]>;
  download(id: string): Promise<Uint8Array<ArrayBuffer>>;
  remove(id: string): Promise<void>;
}

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const API = "https://www.googleapis.com/drive/v3/files", UP = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "Akhila Vrutta";

let token: { v: string; until: number } | null = null;
async function auth(): Promise<string> {
  if (token && Date.now() < token.until) return token.v;
  token = { v: await googleAccess(DRIVE_SCOPE), until: Date.now() + 50 * 60 * 1000 };
  return token.v;
}
/** Drive's own reason, in words: the Drive API switched off for the project, or the permission not given. */
async function driveError(r: Response): Promise<string> {
  let reason = "", msg = "";
  try { const j = (await r.json()) as { error?: { message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } }; msg = j.error?.message ?? ""; reason = j.error?.errors?.[0]?.reason ?? j.error?.details?.[0]?.reason ?? ""; } catch { /* no body */ }
  if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason + msg)) return "Google Drive isn't switched on for this app yet (Drive API disabled in the Google Cloud project)";
  if (/insufficient|scope/i.test(reason + msg)) { token = null; return "Google Drive access wasn't given. Try again and allow access to the app's own files"; }
  return `Google Drive said ${r.status}${msg ? `: ${msg.slice(0, 160)}` : ""}`;
}
async function call(url: string, init: RequestInit = {}): Promise<Response> {
  for (let i = 0; i < 2; i++) {
    const r = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${await auth()}` } });
    if (r.status === 401 && i === 0) { token = null; continue; }   // expired: ask again once
    if (!r.ok) throw new Error(await driveError(r));
    return r;
  }
  throw new Error("Google Drive refused the sign-in");
}

let folder: Promise<string> | null = null;
const folderId = (): Promise<string> => (folder ??= (async () => {
  const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = (await (await call(`${API}?q=${q}&fields=files(id)&spaces=drive`)).json()) as { files: { id: string }[] };
  if (found.files[0]) return found.files[0].id;
  const made = (await (await call(`${API}?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: FOLDER, mimeType: "application/vnd.google-apps.folder" }) })).json()) as { id: string };
  return made.id;
})().catch((e) => { folder = null; throw e; }));

async function uploadTo(parent: string, name: string, bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const meta = JSON.stringify({ name, parents: [parent], mimeType: "application/octet-stream" });
  const b = "av" + Math.random().toString(36).slice(2);
  const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/octet-stream\r\n\r\n`, bytes, `\r\n--${b}--`]);
  const r = (await (await call(`${UP}?uploadType=multipart&fields=id`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${b}` }, body })).json()) as { id: string };
  return r.id;
}
let ffolder: Promise<string> | null = null;
const familyFolder = (): Promise<string> => (ffolder ??= (async () => {
  const parent = await folderId();
  const q = encodeURIComponent(`name='Family' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = (await (await call(`${API}?q=${q}&fields=files(id)&spaces=drive`)).json()) as { files: { id: string }[] };
  if (found.files[0]) return found.files[0].id;
  return ((await (await call(`${API}?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Family", parents: [parent], mimeType: "application/vnd.google-apps.folder" }) })).json()) as { id: string }).id;
})().catch((e) => { ffolder = null; throw e; }));
const drive: Backend = {
  async upload(name, bytes, sub) { return uploadTo(sub ? await familyFolder() : await folderId(), name, bytes); },
  async list() {
    const q = encodeURIComponent(`'${await familyFolder()}' in parents and trashed=false`);
    return ((await (await call(`${API}?q=${q}&fields=files(id)&pageSize=1000&spaces=drive`)).json()) as { files: { id: string }[] }).files.map((f) => f.id);
  },
  async download(id) { return new Uint8Array(await (await call(`${API}/${encodeURIComponent(id)}?alt=media`)).arrayBuffer()); },
  // to Drive's Trash, not deleted outright: Google keeps it 30 days (review #8)
  async remove(id) { await call(`${API}/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) }).catch((e) => { if (!/404/.test(String(e))) throw e; }); },
};
/** The local test servers (emulators): a stand-in Drive kept in this tab's memory (each tab = one person's Drive). */
const testDrive = (): Backend => {
  const m = new Map<string, Uint8Array<ArrayBuffer>>(), fam = new Set<string>();
  return {
    async upload(_n, b, sub) { const id = `t${m.size}-${Math.random().toString(36).slice(2, 8)}`; m.set(id, b.slice()); if (sub) fam.add(id); return id; },
    async download(id) { const b = m.get(id); if (!b) throw new Error("Google Drive said 404"); return b.slice(); },
    async remove(id) { m.delete(id); fam.delete(id); },
    async list() { return [...fam]; },
  };
};
let backend: Backend = drive;
let testBackend: Backend | null = null;
const famBackend = (): Backend => (config().emulators ? (testBackend ??= testDrive()) : backend);
/** Each member's own copies of family files, in Akhila Vrutta/Family in their Drive. */
export const famDrive = {
  /** Can this device use Drive now without asking (the Android app, or allowed this visit on the website)? */
  ready: (): boolean => famBackend() !== drive || isNative() || !!(token && Date.now() < token.until),
  upload: (name: string, bytes: Uint8Array<ArrayBuffer>): Promise<string> => famBackend().upload(name, bytes, "Family"),
  download: (id: string): Promise<Uint8Array<ArrayBuffer>> => famBackend().download(id),
  remove: (id: string): Promise<void> => famBackend().remove(id),
  list: (): Promise<string[]> => famBackend().list?.("Family") ?? Promise.resolve([]),
};

/* ---------- weekly backups: "Akhila Vrutta/Backups" ---------- */
let bfolder: Promise<string> | null = null;
const backupsFolder = (): Promise<string> => (bfolder ??= (async () => {
  const parent = await folderId();
  const q = encodeURIComponent(`name='Backups' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = (await (await call(`${API}?q=${q}&fields=files(id)&spaces=drive`)).json()) as { files: { id: string }[] };
  if (found.files[0]) return found.files[0].id;
  return ((await (await call(`${API}?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Backups", parents: [parent], mimeType: "application/vnd.google-apps.folder" }) })).json()) as { id: string }).id;
})().catch((e) => { bfolder = null; throw e; }));
/** Google Drive for backups. Without a tap, the website can use Drive only if it was allowed this session. */
export const driveBackups: BackupDrive = {
  available: () => isNative() || !!(token && Date.now() < token.until),
  upload: async (name, bytes) => uploadTo(await backupsFolder(), name, bytes),
  async list() {
    const q = encodeURIComponent(`'${await backupsFolder()}' in parents and trashed=false`);
    const j = (await (await call(`${API}?q=${q}&fields=files(id,name,size,createdTime)&orderBy=createdTime desc&pageSize=50&spaces=drive`)).json()) as { files: { id: string; name: string; size?: string; createdTime: string }[] };
    return j.files.map((f) => ({ id: f.id, name: f.name, size: Number(f.size ?? 0), made: Date.parse(f.createdTime) }));
  },
  download: (id) => drive.download(id),
  remove: (id) => drive.remove(id),
};
/** Tests only: keep the ciphertext somewhere else. */
export const setFileBackend = (b: Backend): void => { backend = b; };

/**
 * On the web, Google's permission popup may only open straight from a tap; after a file has been read and
 * encrypted it is too late and the browser blocks it. So the form asks for access from the tap itself
 * when it isn't there yet (needsDriveTap), and offers a button if it was blocked anyway.
 */
export const needsDriveTap = (item?: { c: string; id: string }): boolean => backend === drive && !isNative() && !(token && Date.now() < token.until) && !famFiles?.owns(item);
let onDrive: (() => void) | null = null;
/** Called when Drive becomes usable on this device (the family copier then catches up). */
export const whenDriveReady = (fn: () => void): void => { onDrive = fn; };
export const connectDrive = async (): Promise<void> => { if (backend === drive) await auth(); onDrive?.(); };
export const isPopupBlocked = (e: unknown): boolean => /popup-blocked|popup_blocked/i.test(String((e as { code?: string })?.code ?? "") + String((e as Error)?.message ?? ""));

const dek = (): CryptoKey => {
  const k = (ctx.session as { dek?: CryptoKey } | null)?.dek ?? (window as unknown as { AV_TEST_DEK?: CryptoKey }).AV_TEST_DEK;
  if (!k) throw new Error("The app is locked.");
  return k;
};
const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Biggest file kept (photos from the camera are a few MB). */
export const MAX_FILE = 25 * 1024 * 1024;

/** Encrypts a file here, keeps the ciphertext in Drive and the record in the store; returns the record. */
export async function addFile(owner: { c: string; id: string }, f: File, item?: { c: string; id: string }): Promise<FileRec> {
  if (f.size > MAX_FILE) throw new Error(`${f.name} is over 25 MB`);
  const id = uid(), plain = new Uint8Array(await f.arrayBuffer());
  // an item shared with the family: sealed with the family key, into your Drive's Family folder and the relay
  if (famFiles && (famFiles.owns(owner) || famFiles.owns(item))) return famFiles.add(owner, plain, { name: f.name || "file", mime: f.type || "application/octet-stream", size: f.size });
  const s = await seal(dek(), plain, `file/${id}`);
  const driveId = await backend.upload(`${id}.avf`, fromB64(s.ct));
  const r: FileRec = { id, drive: driveId, name: f.name || "file", mime: f.type || "application/octet-stream", size: f.size, iv: s.iv, ...(s.z ? { z: s.z } : {}), owner, added: Date.now(), updatedAt: Date.now() };
  ctx.store!.writeMany([{ c: FILES, id, r }]);
  return r;
}
/** Fetches a file from Drive and decrypts it here. */
export async function readFile(r: FileRec): Promise<Blob> {
  if (isFamFile(r)) {
    if (!famFiles) throw new Error("This file is in the family space, which isn't open.");
    return new Blob([await famFiles.read(r)], { type: r.mime });
  }
  const ct = await backend.download(r.drive);
  const plain = await open(dek(), { iv: r.iv, ct: toB64(ct), ...(r.z ? { z: r.z } : {}) }, `file/${r.id}`);
  return new Blob([plain], { type: r.mime });
}
/** Removes it from Drive and from the store. */
export async function removeFile(r: FileRec): Promise<void> {
  if (isFamFile(r)) { if (famFiles) await famFiles.remove(r); return; }
  await backend.remove(r.drive);
  ctx.store!.writeMany([{ c: FILES, id: r.id, r: null }]);
}
export const filesOf = (owner: { c: string; id: string }): FileRec[] =>
  (ctx.store?.all<FileRec>(FILES) ?? []).filter((f) => !f.deleted && f.owner?.c === owner.c && f.owner?.id === owner.id).sort((a, b) => a.added - b.added);
export const fileSize = (n: number): string => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Your own file as plain bytes (for moving it into the family), and saving plain bytes as your own again. */
export async function plainOf(r: FileRec): Promise<Uint8Array<ArrayBuffer>> { return new Uint8Array(await (await readFile(r)).arrayBuffer()); }
export async function ownFrom(r: FileRec, plain: Uint8Array<ArrayBuffer>): Promise<FileRec> {
  const s = await seal(dek(), plain, `file/${r.id}`), driveId = await backend.upload(`${r.id}.avf`, fromB64(s.ct));
  const next: FileRec = { ...r, drive: driveId, iv: s.iv, updatedAt: Date.now() }; delete next.fam; if (s.z) next.z = s.z; else delete next.z;
  return next;
}
export const dropOwn = (r: FileRec): Promise<void> => backend.remove(r.drive).catch(() => {});

/* ---------- a decrypted copy out of the app: saved, or shared to another app ---------- */

const asB64 = (b: Blob): Promise<string> => new Promise((ok, no) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ""));
  r.onerror = () => no(r.error ?? new Error("Couldn't read the file"));
  r.readAsDataURL(b);
});
/** Share works in the Android app, and in browsers that can share files (most phone browsers). */
export const canShareFile = (r: FileRec): boolean => {
  if (isNative()) return true;
  try { return !!navigator.canShare?.({ files: [new File([], r.name, { type: r.mime })] }); } catch { return false; }
};
/** Saves a decrypted copy: Downloads/Akhila Vrutta on the phone, the browser's downloads elsewhere. Says where. */
export const saveCopy = (r: FileRec, b: Blob): Promise<string> => saveBlob(r.name, r.mime, b);
/** Saves bytes as a file: Downloads/Akhila Vrutta on the phone, the browser's downloads elsewhere. Says where. */
export async function saveBlob(name: string, mime: string, b: Blob): Promise<string> {
  const r = { name, mime };
  if (isNative()) {
    const o = await nativeCall<{ folder?: string }>("AkhilaNative", "saveFile", { name: r.name, mime: r.mime, data: await asB64(b) });
    return `Saved to ${(o?.folder ?? "Download/Akhila Vrutta").replace(/^Download\b/, "Downloads")}`;
  }
  const url = URL.createObjectURL(b), a = document.createElement("a");
  a.href = url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "Saved to your downloads";
}
/** Opens the share sheet with a decrypted copy. Resolves false when the person closed it without sharing. */
export async function shareCopy(r: FileRec, b: Blob): Promise<boolean> {
  if (isNative()) { await nativeCall("AkhilaNative", "shareFile", { name: r.name, mime: r.mime, data: await asB64(b) }); return true; }
  try { await navigator.share({ files: [new File([b], r.name, { type: r.mime })], title: r.name }); return true; }
  catch (e) { if ((e as Error)?.name === "AbortError") return false; throw e; }
}
