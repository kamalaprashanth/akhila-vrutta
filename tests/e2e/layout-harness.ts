/* Test page for the layout check: the real shell (header, tab bar, every module) over a fake in-memory store
   holding the sample Money data plus what the Household, Habits, Documents and Health flows made. */
import { ctx } from "../../app/core/app.ts";
import { parseOldExport } from "../../app/modules/money/import.ts";
import type { Changes, Rec, WriteOp } from "../../app/core/store.ts";

class FakeStore {
  data = new Map<string, Map<string, Rec>>();
  subs = new Set<(c: Changes) => void>();
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
    for (const f of this.subs) f({ keys: ops.map((o) => ({ c: o.c, id: o.id })), local: true });
  }
}
const fake = new FakeStore();
const p = parseOldExport(await (await fetch("/export.json")).json());
for (const [c, list] of Object.entries(p.records)) fake.data.set(c, new Map(list.map((r) => [r.id, r])));
const seed = (await (await fetch("/seed.json")).json()) as Record<string, Rec[]>;
for (const [c, list] of Object.entries(seed)) { const m = fake.data.get(c) ?? new Map(); for (const r of list) m.set(r.id, r); fake.data.set(c, m); }
const W = window as unknown as Record<string, unknown>;
W.FAKE = fake; W.AV_TEST = true;
(ctx as unknown as { store: FakeStore }).store = fake;
await import("../../app/main.ts");
// as the real shell does after a change: draw the page again (Money draws itself)
fake.subscribe(() => requestAnimationFrame(() => { if (document.body.dataset.mod !== "money") (ctx as unknown as { rerender?: () => void }).rerender?.(); }));
