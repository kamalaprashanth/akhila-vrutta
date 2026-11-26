/* Test page: the Health tab with a fake in-memory store (the sample Money data plus two properties),
   a made-up data key, and an in-memory stand-in for Google Drive (holding only ciphertext). */
import { ctx } from "../../app/core/app.ts";
import { setFileBackend } from "../../app/core/files.ts";
import { health } from "../../app/modules/health/index.ts";
import { setLabReader } from "../../app/modules/health/forms.ts";
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
const main = document.getElementById("main")!;
const draw = (): void => { document.body.dataset.mod = "health"; health.render(main); };
W.REDRAW = draw;
window.addEventListener("hashchange", draw);
fake.subscribe(() => requestAnimationFrame(() => { if (!document.querySelector("#mvLayer .sheet")) draw(); }));
// Claude, standing in: checks it was given the report's text, answers as Claude would
W.SENT = [];
setLabReader(async (text) => { (W.SENT as string[]).push(text); return "```json\n" + JSON.stringify({ date: "2026-11-12", lab: "Sample Diagnostics", values: [{ group: "Lipid profile", name: "LDL Cholesterol", value: 142, unit: "mg/dL", low: null, high: 100 }, { group: "Lipid profile", name: "HDL Cholesterol", value: 46, unit: "mg/dL", low: 40, high: null }, { group: "Vitamins", name: "Vitamin D", value: 22, unit: "ng/mL", low: 30, high: 100 }] }) + "\n```"; });
draw();
