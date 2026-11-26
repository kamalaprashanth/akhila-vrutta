/**
 * Records: every item is its own encrypted Firestore document.
 *   homes/{home}/{collection}/{id} = { iv, ct, z?, at, by, del? }
 * The plaintext lives only in memory while the app is unlocked.
 * Sync is incremental: on open, decrypt what this device has cached, then listen for
 * anything newer than the latest change it has seen ("at" is the server time of each write).
 */
import { open, openJSON, seal, sealJSON, type Sealed } from "./crypto.ts";
import { initFirebase, type Fb } from "./firebase.ts";

/** Collections the money planner uses (names match the old app's data). */
export const MONEY_COLLECTIONS = [
  "accounts", "categories", "txns", "recurring", "loans", "holdings", "payers",
  "snaps", "goals", "views", "trades", "props", "propItems", "settings",
] as const;
/** Household: homes not in Money, maintenance jobs, what was done, appliances, to-do and grocery lists. */
export const HOUSEHOLD_COLLECTIONS = ["hhHomes", "hhJobs", "hhDone", "hhAppliances", "hhItems", "hhVehicles", "hhFuel"] as const;
/** Files kept encrypted in Google Drive: what they are and where (the vault). */
export const HABIT_COLLECTIONS = ["habits", "habitLog", "habitPrefs"] as const;
/** Documents: each document (type, year, valid till, last 4 of its number) and the people/policies they belong to. */
export const DOC_COLLECTIONS = ["docs", "docOwners", "docPrefs"] as const;
/** Calendar: family days (birthdays, anniversaries, shraddha), each by its English date and its tithi. */
export const CAL_COLLECTIONS = ["famDays"] as const;
/** This account's family space (its id and key, kept encrypted here). */
export const FAMILY = "family";
/** Health: profiles (height), readings, lab reports, medicines and doses taken, doctor visits, check-ups. */
export const HEALTH_COLLECTIONS = ["hlProfiles", "hlReadings", "hlLabs", "hlMeds", "hlMedLog", "hlVisits", "hlCheckups"] as const;
export const FILES = "files";
/** When backups were made, and the weekly setting (not itself backed up). */
export const BACKUP_LOG = "backupLog";
/** Housekeeping: schema versions and where the data came from. */
export const META = "meta";
export const COLLECTIONS: readonly string[] = [...MONEY_COLLECTIONS, ...HOUSEHOLD_COLLECTIONS, ...HABIT_COLLECTIONS, ...DOC_COLLECTIONS, ...CAL_COLLECTIONS, ...HEALTH_COLLECTIONS, FILES, BACKUP_LOG, META, FAMILY];
/** What a family space holds: shared transactions, its members' names and what is shared. */
export const FAMILY_COLLECTIONS: readonly string[] = ["txns", "famMembers", "famRules", "famDays", "hhItems", "docs", "docOwners", "hhVehicles", "hhAppliances", "files", "famOwners"];
/** What a KP Money Planner import replaces (never Household or files). */
export const IMPORT_SCOPE: readonly string[] = [...MONEY_COLLECTIONS, META];

export interface Rec {
  id: string;
  [k: string]: unknown;
}

interface Doc extends Sealed {
  at: { toMillis(): number } | null;
  by: string;
  del?: true;
}

/** What changed: the records, and whether this device made the change. */
export interface Changes {
  keys: { c: string; id: string }[];
  local: boolean;
}
type Listener = (ch: Changes) => void;
/**
 * Another store shown together with this one (the family space): its records join this one's in `colls`, and
 * writes to those collections go through `route`, which saves what belongs there and returns what stays here.
 */
export interface Overlay {
  colls: ReadonlySet<string>;
  all(c: string): Rec[];
  get(c: string, id: string): Rec | undefined;
  route(op: WriteOp, here: (c: string, id: string) => boolean): WriteOp[];
}
export interface WriteOp {
  c: string;
  id: string;
  /** null moves the record to the trash */
  r: Rec | null;
}

export class Store {
  private data = new Map<string, Map<string, Rec>>();
  private listeners = new Set<Listener>();
  private unsubs: (() => void)[] = [];
  /** How many writes are waiting for the server. */
  pending = 0;

  private fb: Fb;
  private dek: CryptoKey;
  private colls: readonly string[];
  private overlay: Overlay | null = null;
  readonly home: string;
  readonly uid: string;

  private constructor(fb: Fb, home: string, uid: string, dek: CryptoKey, colls: readonly string[]) {
    this.fb = fb;
    this.home = home;
    this.uid = uid;
    this.dek = dek;
    this.colls = colls;
    for (const c of colls) this.data.set(c, new Map());
  }

  static async open(home: string, uid: string, dek: CryptoKey, onProgress?: (msg: string) => void, colls: readonly string[] = COLLECTIONS): Promise<Store> {
    const fb = await initFirebase();
    if (!fb) throw new Error("Firebase isn't configured for this build.");
    const s = new Store(fb, home, uid, dek, colls);
    await s.start(onProgress);
    return s;
  }

  private col(c: string) {
    return this.fb.fs.collection!(this.fb.db, "homes", this.home, c);
  }

  /** Applies one document; returns true when it changed what the app sees. */
  private async apply(c: string, id: string, d: Doc | null): Promise<boolean> {
    const m = this.data.get(c)!;
    if (!d || d.del) return m.delete(id);
    try {
      m.set(id, await openJSON<Rec>(this.dek, d, `${c}/${id}`));
      return true;
    } catch {
      console.warn(`Couldn't decrypt ${c}/${id}`);
      return false;
    }
  }

  private async start(onProgress?: (msg: string) => void): Promise<void> {
    const { fs } = this.fb;
    // 1. What this device already has (ciphertext in Firestore's cache).
    const cursors = new Map<string, number>();
    for (const c of this.colls) {
      const snap = await fs.getDocsFromCache!(this.col(c)).catch(() => null);
      let max = 0;
      if (snap) {
        const docs: { id: string; data(): Doc }[] = snap.docs;
        await Promise.all(docs.map((d) => { const x = d.data(); max = Math.max(max, x.at?.toMillis() ?? 0); return this.apply(c, d.id, x); }));
      }
      cursors.set(c, max);
      onProgress?.(`Opening… ${this.count()} items`);
    }
    // 2. Anything newer from the cloud, now and as it happens.
    const first: Promise<void>[] = [];
    for (const c of this.colls) {
      const since = (fs.Timestamp as unknown as { fromMillis(ms: number): unknown }).fromMillis(cursors.get(c) ?? 0);
      const q = fs.query!(this.col(c), fs.where!("at", ">", since));
      first.push(new Promise((res) => {
        let done = false;
        this.unsubs.push(fs.onSnapshot!(q, async (snap: { docChanges(): { type: string; doc: { id: string; data(): Doc; metadata?: { hasPendingWrites: boolean } } }[] }) => {
          const keys: { c: string; id: string }[] = [];
          for (const ch of snap.docChanges()) {
            if (ch.doc.metadata?.hasPendingWrites) continue; // our own write, already applied in memory
            if (await this.apply(c, ch.doc.id, ch.type === "removed" ? null : ch.doc.data())) keys.push({ c, id: ch.doc.id });
          }
          if (keys.length && done) this.emit({ keys, local: false });
          if (!done) { done = true; res(); }
        }, () => { if (!done) { done = true; res(); } }));
      }));
    }
    // Wait for the first answer, but don't hang forever when offline.
    await Promise.race([Promise.all(first), new Promise((r) => setTimeout(r, navigator.onLine ? 15000 : 1500))]);
  }

  close(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    for (const m of this.data.values()) m.clear();
  }

  /** Shows another store's records with this one's (null takes it away). */
  attach(o: Overlay | null): void { this.overlay = o; this.emit({ keys: [], local: false }); }
  /** Tells this store's listeners that the attached one changed. */
  overlayChanged(keys: { c: string; id: string }[]): void { this.emit({ keys, local: false }); }
  /** Only this store's own records (not the attached one's). */
  own<T extends Rec = Rec>(c: string): T[] { return [...(this.data.get(c)?.values() ?? [])] as T[]; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(ch: Changes = { keys: [], local: true }): void {
    this.listeners.forEach((fn) => fn(ch));
  }

  all<T extends Rec = Rec>(c: string): T[] {
    const mine = [...(this.data.get(c)?.values() ?? [])] as T[];
    return this.overlay?.colls.has(c) ? [...mine, ...(this.overlay.all(c) as T[])] : mine;
  }
  get<T extends Rec = Rec>(c: string, id: string): T | undefined {
    return (this.data.get(c)?.get(id) ?? (this.overlay?.colls.has(c) ? this.overlay.get(c, id) : undefined)) as T | undefined;
  }
  /** Writes for the attached store go there; the rest stay here. */
  private routed(ops: WriteOp[]): WriteOp[] {
    const o = this.overlay;
    if (!o) return ops;
    const here = (c: string, id: string): boolean => !!this.data.get(c)?.has(id);
    return ops.flatMap((op) => (o.colls.has(op.c) ? o.route(op, here) : [op]));
  }
  count(c?: string): number {
    if (c) return this.data.get(c)?.size ?? 0;
    let n = 0;
    for (const m of this.data.values()) n += m.size;
    return n;
  }

  private async docFor(c: string, r: Rec): Promise<Record<string, unknown>> {
    const s = await sealJSON(this.dek, r, `${c}/${r.id}`);
    return { ...s, at: this.fb.fs.serverTimestamp!(), by: this.uid };
  }

  private track(p: Promise<unknown>): void {
    this.pending++;
    p.finally(() => { this.pending--; this.emit(); }).catch((e) => console.warn("write failed", e));
  }

  async put(c: string, r: Rec): Promise<void> {
    if (!this.data.has(c)) throw new Error(`Unknown collection ${c}`);
    if (this.overlay?.colls.has(c)) { this.writeMany([{ c, id: r.id, r }]); return; }
    const { fs, db } = this.fb;
    const d = await this.docFor(c, r);
    this.data.get(c)!.set(r.id, structuredClone(r));
    this.emit({ keys: [{ c, id: r.id }], local: true });
    this.track(fs.setDoc!(fs.doc!(db, "homes", this.home, c, r.id), d));
  }

  /** Moves a record to the trash (kept 30 days, then removed). */
  async remove(c: string, id: string): Promise<void> {
    if (this.overlay?.colls.has(c)) { this.writeMany([{ c, id, r: null }]); return; }
    const { fs, db } = this.fb;
    this.data.get(c)!.delete(id);
    this.emit({ keys: [{ c, id }], local: true });
    this.track(fs.updateDoc!(fs.doc!(db, "homes", this.home, c, id), { del: true, at: fs.serverTimestamp!(), by: this.uid }));
  }

  /** Writes many records in batches; memory is updated batch by batch as each is sealed. */
  private async commit(ops: WriteOp[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const { fs, db } = this.fb;
    onProgress?.(0, ops.length);
    const inFlight: Promise<unknown>[] = [];
    for (let i = 0; i < ops.length; i += 400) {
      const slice = ops.slice(i, i + 400);
      // in memory first (what the app shows at once), then sealed and sent
      for (const op of slice) {
        if (op.r) this.data.get(op.c)!.set(op.id, structuredClone(op.r));
        else this.data.get(op.c)!.delete(op.id);
      }
      this.emit({ keys: slice.map(({ c, id }) => ({ c, id })), local: true });
      const b = fs.writeBatch!(db);
      for (const op of slice) {
        const ref = fs.doc!(db, "homes", this.home, op.c, op.id);
        if (op.r) b.set(ref, await this.docFor(op.c, op.r));
        else b.update(ref, { del: true, at: fs.serverTimestamp!(), by: this.uid });
      }
      // With progress (imports) wait for each batch; otherwise queue them all (works offline too).
      if (onProgress) { await b.commit(); onProgress(Math.min(ops.length, i + 400), ops.length); }
      else inFlight.push(b.commit());
    }
    await Promise.all(inFlight);
  }

  /** Saves a set of changes in the background (batched); returns once they are on this device. */
  /** Writes here only, never through the attached store (moving records between the two). */
  writeOwn(ops: WriteOp[]): void {
    for (const op of ops) if (!this.data.has(op.c)) throw new Error(`Unknown collection ${op.c}`);
    const keep = ops.filter((op) => op.r || this.data.get(op.c)!.has(op.id));
    if (keep.length) this.track(this.commit(keep));
  }
  /** Seals with this store's key (for big files kept in pieces beside the records). */
  sealWith = (plain: Uint8Array<ArrayBuffer>, aad: string) => seal(this.dek, plain, aad);
  openWith = (s: Sealed, aad: string) => open(this.dek, s, aad);
  /** Raw pieces in a collection the store doesn't keep in memory (famBlobs: files in the family space). */
  async putPiece(c: string, id: string, s: Sealed): Promise<void> { const { fs, db } = this.fb; await fs.setDoc!(fs.doc!(db, "homes", this.home, c, id), { ...s, at: fs.serverTimestamp!(), by: this.uid }); }
  async getPiece(c: string, id: string): Promise<Sealed | null> { const { fs, db } = this.fb; const d = await fs.getDoc!(fs.doc!(db, "homes", this.home, c, id)); return d.exists() ? (d.data() as Sealed) : null; }
  async dropPiece(c: string, id: string): Promise<void> { const { fs, db } = this.fb; await fs.updateDoc!(fs.doc!(db, "homes", this.home, c, id), { del: true, at: fs.serverTimestamp!(), by: this.uid }).catch(() => {}); }

  writeMany(ops0: WriteOp[]): void {
    for (const op of ops0) if (!this.data.has(op.c)) throw new Error(`Unknown collection ${op.c}`);
    // a trashed record that is only in the attached store has nothing to trash here
    const ops = this.routed(ops0).filter((op) => op.r || this.data.get(op.c)!.has(op.id));
    if (ops.length) this.track(this.commit(ops));
  }

  /**
   * Makes the cloud match `incoming` exactly in `scope` (the money collections and meta): writes new and
   * changed records, trashes the rest. Household records and files are never touched by an import.
   * Unchanged records cost nothing, so re-importing is cheap.
   */
  async replaceAll(incoming: Record<string, Rec[]>, onProgress?: (done: number, total: number) => void, scope: readonly string[] = IMPORT_SCOPE): Promise<{ written: number; removed: number }> {
    const { fs, db } = this.fb;
    const ops: { c: string; id: string; r: Rec | null }[] = [];
    for (const c of scope) {
      const next = new Map((incoming[c] ?? []).map((r) => [r.id, r]));
      const cur = this.data.get(c)!;
      for (const [id, r] of next) {
        const old = cur.get(id);
        if (!old || stableJSON(old) !== stableJSON(r)) ops.push({ c, id, r });
      }
      for (const id of cur.keys()) if (!next.has(id)) ops.push({ c, id, r: null });
    }
    await this.commit(ops, onProgress);
    return { written: ops.filter((o) => o.r).length, removed: ops.filter((o) => !o.r).length };
  }
}

/** JSON with sorted keys, so two equal records always compare equal. */
export function stableJSON(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJSON).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJSON((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}
