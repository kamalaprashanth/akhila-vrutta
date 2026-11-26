/**
 * Family files, a copy in each member's Drive (decided with the owner, 26 Nov 2026).
 *
 * A file of a shared item is sealed once with the family key. The same ciphertext goes into each member's own
 * Drive (folder Akhila Vrutta/Family); the app's narrow Drive permission lets each phone see only its own
 * copies, so the bytes reach the other phone through the family space (the relay, famBlobs/<id>-<n>), which is
 * emptied once every member has a copy.
 *   files/{id}             the record; `fam` = relay pieces waiting (0: none)
 *   famCopies/{id}_{uid}   "my copy is Drive file X": one per member, written only by that member
 *   famNeeds/{id}_{uid}    "I have no copy and the relay is gone: send it again"
 * Opening reads your own copy, else the relay, else asks for it. The copier runs when the app opens, when
 * Drive becomes usable and after changes: it copies what you lack (up to 100 MB a run), sends again what
 * someone needs, empties the relay when everyone has a copy, and deletes your copies of files that are gone.
 */
import { ctx } from "./app.ts";
import { fromB64, toB64, type Sealed } from "./crypto.ts";
import { famDrive, plainOf, ownFrom, dropOwn, setFamFiles, whenDriveReady, type FileRec } from "./files.ts";
import { familyOpen, famOwn, famStore, famWrite, memberName, members, myUid, onFamily, ownerShared, setFamilyHooks, space } from "./family.ts";
import { FILES, type Rec } from "./store.ts";

type Copy = Rec & { file: string; uid: string; drive: string; made: number };
type Need = Rec & { file: string; uid: string };
const PIECE = 600_000;          // characters of base64 per relay piece (a record holds under 900,000)
const BUDGET = 100 * 1048576;   // copied per run, so a new member's phone catches up over a few opens
const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const copyOf = (file: string, who = myUid()): Copy | undefined => famOwn<Copy>("famCopies").find((c) => c.file === file && c.uid === who);
const aad = (id: string): string => `file/${id}`;

/* ---------- the relay ---------- */
async function relayPut(id: string, s: { iv: string; ct: string }): Promise<number> {
  const f = famStore(); if (!f) throw new Error("The family space isn't open.");
  const n = Math.max(1, Math.ceil(s.ct.length / PIECE));
  for (let i = 0; i < n; i++) await f.putPiece("famBlobs", `${id}-${i}`, { iv: s.iv, ct: s.ct.slice(i * PIECE, (i + 1) * PIECE) });
  return n;
}
async function relayGet(r: FileRec): Promise<string> {
  const f = famStore(); if (!f) throw new Error("The family space isn't open.");
  let ct = "";
  for (let i = 0; i < (r.fam ?? 0); i++) { const p = await f.getPiece("famBlobs", `${r.id}-${i}`); if (!p) throw new Error("A piece of this file is missing."); ct += p.ct; }
  return ct;
}
async function relayDrop(r: FileRec): Promise<void> { const f = famStore(); for (let i = 0; i < (r.fam ?? 0); i++) await f?.dropPiece("famBlobs", `${r.id}-${i}`); }
/** The record as the family space has it now (or the one given: a paper's file still in your own store). */
const famFile = (r: FileRec): FileRec => famOwn<FileRec>(FILES).find((x) => x.id === r.id) ?? r;
const save = (r: FileRec): void => { ctx.store?.writeMany([{ c: FILES, id: r.id, r: { ...r, updatedAt: Date.now() } }]); };

/** Your Drive copy of the sealed bytes, noted for the family (best effort: the relay covers a failure). */
async function keepCopy(id: string, ct: string): Promise<void> {
  if (!famDrive.ready()) return;
  const drive = await famDrive.upload(`${id}.avf`, fromB64(ct));
  famWrite([{ c: "famCopies", id: `${id}_${myUid()}`, r: { id: `${id}_${myUid()}`, file: id, uid: myUid(), drive, made: Date.now() } }]);
}

/* ---------- add, open, remove ---------- */
const handler = {
  owns: (o: { c: string; id: string } | undefined): boolean => familyOpen() && ownerShared(o),
  async add(owner: { c: string; id: string }, plain: Uint8Array<ArrayBuffer>, meta: { name: string; mime: string; size: number }): Promise<FileRec> {
    const f = famStore(); if (!f) throw new Error("The family space isn't open.");
    const id = uid(), s = await f.sealWith(plain, aad(id));
    const n = await relayPut(id, s);
    const r: FileRec = { id, drive: "", fam: n, name: meta.name, mime: meta.mime, size: meta.size, iv: s.iv, ...(s.z ? { z: s.z } : {}), owner, added: Date.now(), updatedAt: Date.now() };
    ctx.store!.writeMany([{ c: FILES, id, r }]);
    await keepCopy(id, s.ct).catch((e) => console.warn("family copy", e));
    return r;
  },
  async read(r0: FileRec): Promise<Uint8Array<ArrayBuffer>> {
    const f = famStore(); if (!f) throw new Error("This file is in the family space, which isn't open.");
    const r = famFile(r0), seal = (ct: string): Sealed => ({ iv: r.iv, ct, ...(r.z ? { z: r.z } : {}) });
    const mine = copyOf(r.id);
    if (mine && famDrive.ready()) {
      try { return await f.openWith(seal(toB64(await famDrive.download(mine.drive))), aad(r.id)); }
      catch { famWrite([{ c: "famCopies", id: mine.id, r: null }]); }   // gone or damaged: ask again below
    }
    if (r.fam) return f.openWith(seal(await relayGet(r)), aad(r.id));
    // it's in your Drive, but this visit hasn't been allowed to use Drive yet (the website): ask, don't re-send
    if (mine && !famDrive.ready()) throw Object.assign(new Error("It's in your Google Drive: allow Drive access (Profile › Family › Save to Drive), then open it again."), { code: "drive-needed" });
    famWrite([{ c: "famNeeds", id: `${r.id}_${myUid()}`, r: { id: `${r.id}_${myUid()}`, file: r.id, uid: myUid() } }]);
    const by = famOwn<Copy>("famCopies").find((c) => c.file === r.id && c.uid !== myUid())?.uid;
    throw new Error(`This file isn't on this phone yet. ${by ? `${memberName(by)}'s` : "The other"} app will send it the next time it opens.`);
  },
  async remove(r0: FileRec): Promise<void> {
    const r = famFile(r0);
    await relayDrop(r);
    const mine = copyOf(r.id);
    if (mine) { await famDrive.remove(mine.drive).catch(() => {}); famWrite([{ c: "famCopies", id: mine.id, r: null }]); }
    ctx.store?.writeMany([{ c: FILES, id: r.id, r: null }]);   // the others' apps delete their copies when they see it gone
  },
};

/* ---------- moving a file in (sharing an item) and out (stopping) ---------- */
/** One of your own files, resealed with the family key: your Family folder and the relay. Returns the new record. */
export async function intoFamily(r: FileRec): Promise<FileRec> {
  const f = famStore(); if (!f) throw new Error("The family space isn't open.");
  const plain = await plainOf(r), s = await f.sealWith(plain, aad(r.id));
  plain.fill(0);
  const next: FileRec = { ...r, drive: "", fam: await relayPut(r.id, s), iv: s.iv, updatedAt: Date.now() };
  if (s.z) next.z = s.z; else delete next.z;
  await keepCopy(r.id, s.ct).catch((e) => console.warn("family copy", e));
  return next;
}
/** A family file made your own again (sealed with your key, into your Drive); the family copies and relay go. */
export async function outOfFamily(r: FileRec): Promise<FileRec> {
  const plain = await handler.read(r), next = await ownFrom(r, plain);
  plain.fill(0);
  await relayDrop(famFile(r));
  const mine = copyOf(r.id);
  if (mine) { await famDrive.remove(mine.drive).catch(() => {}); famWrite([{ c: "famCopies", id: mine.id, r: null }]); }
  return next;
}
export { dropOwn };

/* ---------- the copier ---------- */
let running = false, again = false, timer = 0;
/** Catches up: copies, sends again, empties the relay, deletes your copies of files that are gone. */
export async function syncFamilyFiles(): Promise<void> {
  if (!familyOpen()) return;
  if (running) { again = true; return; }
  running = true;
  try {
    const me = myUid(), ready = famDrive.ready(), who = members().map((m) => m.id);
    let budget = BUDGET;
    for (const r of famOwn<FileRec>(FILES)) {
      const mine = copyOf(r.id), needs = famOwn<Need>("famNeeds").filter((n) => n.file === r.id);
      // 1. a copy for you, from the relay
      if (!mine && r.fam && ready && budget > 0) {
        try { await keepCopy(r.id, await relayGet(r)); budget -= r.size; } catch (e) { console.warn("family copy", e); }
      }
      // 2. someone has no copy and the relay is gone: send yours again
      if (needs.some((n) => n.uid !== me) && !r.fam && mine && ready) {
        try {
          const ct = toB64(await famDrive.download(mine.drive));
          save({ ...r, fam: await relayPut(r.id, { iv: r.iv, ct }) });
          famWrite(needs.map((n) => ({ c: "famNeeds", id: n.id, r: null })));
        } catch (e) { console.warn("family resend", e); }
        continue;
      }
      // 3. everyone has a copy: the relay can go
      const has = (u: string): boolean => !!copyOf(r.id, u);
      if (r.fam && who.length && who.every(has) && !needs.length) { await relayDrop(r); save({ ...r, fam: 0 }); }
    }
    // 4. your copies of files that were deleted or stopped being shared (after a while: a record may be on its way)
    if (ready) {
      const live = new Set(famOwn<FileRec>(FILES).map((r) => r.id));
      for (const c of famOwn<Copy>("famCopies")) if (c.uid === me && !live.has(c.file) && Date.now() - c.made > 10 * 60e3) {
        await famDrive.remove(c.drive).catch(() => {});
        famWrite([{ c: "famCopies", id: c.id, r: null }]);
      }
    }
  } finally {
    running = false;
    if (again) { again = false; later(); }
  }
}
const later = (ms = 3000): void => { clearTimeout(timer); timer = window.setTimeout(() => void syncFamilyFiles(), ms); };

/** Your Family folder in Drive, emptied (leaving the family, or taken out of it). */
async function forgetCopies(): Promise<void> {
  if (!famDrive.ready()) return;
  for (const c of famOwn<Copy>("famCopies")) if (c.uid === myUid()) famWrite([{ c: "famCopies", id: c.id, r: null }]);
  for (const id of await famDrive.list()) await famDrive.remove(id).catch(() => {});
}

/** How many family files have no copy in your Drive yet (shown on the Family page). */
export const notInMyDrive = (): number => (familyOpen() ? famOwn<FileRec>(FILES).filter((r) => !copyOf(r.id)).length : 0);

/** Plugs family files into the app (called once at start). */
export function startFamilyFiles(): void {
  setFamFiles(handler);
  setFamilyHooks({ leaving: forgetCopies, removed: forgetCopies });
  whenDriveReady(() => later(500));
  onFamily(() => { if (space()) later(); });
}
