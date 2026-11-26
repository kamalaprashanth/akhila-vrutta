/* Test page: the Household tab with a fake in-memory store (the sample Money data plus two properties),
   a made-up data key, and an in-memory stand-in for Google Drive (holding only ciphertext). */
import { ctx } from "../../app/core/app.ts";
import { setFileBackend } from "../../app/core/files.ts";
import { household } from "../../app/modules/household/index.ts";
import { parseOldExport } from "../../app/modules/money/import.ts";
import type { Changes, Rec, WriteOp } from "../../app/core/store.ts";

class FakeStore {
  data = new Map<string, Map<string, Rec>>();
  subs = new Set<(c: Changes) => void>();
  writes: WriteOp[] = [];
  pending = 0;
  get(c: string, id: string) { return this.data.get(c)?.get(id); }
  all(c: string) { return [...(this.data.get(c)?.values() ?? [])]; }
  count(c?: string) { return c ? this.data.get(c)?.size ?? 0 : 0; }
  subscribe(fn: (c: Changes) => void) { this.subs.add(fn); return () => this.subs.delete(fn); }
  writeMany(ops: WriteOp[]) {
    for (const op of ops) {
      if (!this.data.has(op.c)) this.data.set(op.c, new Map());
      if (op.r) this.data.get(op.c)!.set(op.id, structuredClone(op.r)); else this.data.get(op.c)!.delete(op.id);
    }
    this.writes.push(...ops);
    for (const f of this.subs) f({ keys: ops.map((o) => ({ c: o.c, id: o.id })), local: true });
  }
}

const j = await (await fetch("/export.json")).json();
const p = parseOldExport(j);
const fake = new FakeStore();
for (const [c, list] of Object.entries(p.records)) fake.data.set(c, new Map(list.map((r) => [r.id, r])));
fake.data.set("props", new Map([["prA", { id: "prA", name: "Test Plot", kind: "plot" }], ["prB", { id: "prB", name: "Test Flat", kind: "flat" }]]));
const W = window as unknown as Record<string, unknown>;
W.FAKE = fake;
(ctx as unknown as { store: FakeStore }).store = fake;
W.AV_TEST_DEK = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
const drive = new Map<string, Uint8Array>();
W.DRIVE = drive;
setFileBackend({
  async upload(_n, b) {
    if (W.BLOCK_ONCE) { W.BLOCK_ONCE = false; throw Object.assign(new Error("Firebase: Error (auth/popup-blocked)."), { code: "auth/popup-blocked" }); }
    const id = "d" + drive.size; drive.set(id, b.slice()); return id; },
  async download(id) { const b = drive.get(id); if (!b) throw new Error("404"); return b.slice(); },
  async remove(id) { drive.delete(id); },
});
document.body.dataset.mod = "household";
household.render(document.getElementById("main")!);
// the shell's tabs link to #/household/<tab>; the shell draws the page again on each
window.addEventListener("hashchange", () => household.render(document.getElementById("main")!));
