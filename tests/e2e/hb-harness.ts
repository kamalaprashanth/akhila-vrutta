/* Test page: the Habits tab with a fake in-memory store (no cloud). */
import { ctx } from "../../app/core/app.ts";
import { habits } from "../../app/modules/habits/index.ts";
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
const fake = new FakeStore();
const W = window as unknown as Record<string, unknown>;
W.FAKE = fake;
(ctx as unknown as { store: FakeStore }).store = fake;
const main = document.getElementById("main")!;
const draw = (): void => { document.body.dataset.mod = "habits"; habits.render(main); };
W.REDRAW = draw;
window.addEventListener("hashchange", draw);
draw();
