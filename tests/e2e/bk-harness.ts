/* Test page: Settings with a fake in-memory store, a made-up data key and passphrase wrap, and in-memory
   stand-ins for Google Drive (vault files and backups). */
import { ctx } from "../../app/core/app.ts";
import { setFileBackend } from "../../app/core/files.ts";
import { setBackupDrive } from "../../app/core/backup.ts";
import { aesKey, rnd, wrapWithPass } from "../../app/core/crypto.ts";
import { settings } from "../../app/modules/settings.ts";
import { COLLECTIONS, stableJSON, type Changes, type Rec, type WriteOp } from "../../app/core/store.ts";

class FakeStore {
  data = new Map<string, Map<string, Rec>>(COLLECTIONS.map((c) => [c, new Map()]));
  subs = new Set<(c: Changes) => void>();
  pending = 0;
  get(c: string, id: string) { return this.data.get(c)?.get(id); }
  all(c: string) { return [...(this.data.get(c)?.values() ?? [])]; }
  count(c?: string) { return c ? this.data.get(c)?.size ?? 0 : 0; }
  subscribe(fn: (c: Changes) => void) { this.subs.add(fn); return () => this.subs.delete(fn); }
  writeMany(ops: WriteOp[]) {
    for (const op of ops) { if (op.r) this.data.get(op.c)!.set(op.id, structuredClone(op.r)); else this.data.get(op.c)!.delete(op.id); }
    for (const f of this.subs) f({ keys: ops.map((o) => ({ c: o.c, id: o.id })), local: true });
  }
  async replaceAll(incoming: Record<string, Rec[]>, onProgress?: (d: number, t: number) => void, scope: readonly string[] = []) {
    const ops: WriteOp[] = [];
    for (const c of scope) {
      const next = new Map((incoming[c] ?? []).map((r) => [r.id, r])), cur = this.data.get(c)!;
      for (const [id, r] of next) if (!cur.get(id) || stableJSON(cur.get(id)) !== stableJSON(r)) ops.push({ c, id, r });
      for (const id of cur.keys()) if (!next.has(id)) ops.push({ c, id, r: null });
    }
    this.writeMany(ops); onProgress?.(ops.length, ops.length || 1);
    return { written: ops.filter((o) => o.r).length, removed: ops.filter((o) => !o.r).length };
  }
}
const W = window as unknown as Record<string, unknown>;
const fake = new FakeStore();
fake.writeMany([
  { c: "txns", id: "t1", r: { id: "t1", type: "expense", amount: 123400, date: "2026-11-20", note: "Sample rent" } },
  { c: "hhItems", id: "i1", r: { id: "i1", list: "todo", text: "Fix the bathroom tap", added: "2026-11-20" } },
  { c: "habits", id: "h1", r: { id: "h1", name: "Walk 30 min", kind: "check", start: "2026-11-01" } },
]);
W.FAKE = fake;
const raw = rnd(32);
const dek = await aesKey(raw);
W.AV_TEST_WRAP = await wrapWithPass("five test words for backup", raw);
W.AV_TEST_DEK = dek;
(ctx as unknown as { store: FakeStore }).store = fake;
(ctx as unknown as { session: unknown }).session = { uid: "test-uid", home: "test-home", dek, mode: "pass" };
ctx.rerender = () => settings.render(document.getElementById("main")!);
setFileBackend({ async upload() { return "x"; }, async download() { return new Uint8Array(); }, async remove() {} });
const backups: { id: string; name: string; size: number; made: number; bytes: Uint8Array }[] = [];
W.BACKUPS = backups;
setBackupDrive({
  available: () => true,
  async upload(name, bytes) { const id = "b" + backups.length; backups.push({ id, name, size: bytes.length, made: Date.now() + backups.length, bytes: bytes.slice() }); return id; },
  async list() { return backups.map(({ id, name, size, made }) => ({ id, name, size, made })).sort((a, b) => b.made - a.made); },
  async download(id) { return backups.find((b) => b.id === id)!.bytes.slice() as Uint8Array<ArrayBuffer>; },
  async remove(id) { backups.splice(backups.findIndex((b) => b.id === id), 1); },
});
// as the app does: redraw after changes, but not under a backup or restore in progress
fake.subscribe(() => requestAnimationFrame(() => { if (!document.activeElement?.closest("form, #bkArea") && !document.querySelector("#bkArea > *")) ctx.rerender(); }));
document.body.dataset.mod = "settings";
ctx.rerender();
