/* Test page: the Money tab with a fake in-memory store filled from an export (no cloud, no encryption). */
import { ctx } from "../../app/core/app.ts";
import { money } from "../../app/modules/money/index.ts";
import { parseOldExport } from "../../app/modules/money/import.ts";
import type { Changes, Rec, WriteOp } from "../../app/core/store.ts";
import { installNative } from "../../app/core/native.ts";
import { toast } from "../../app/core/dom.ts";

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
  }
}

const j = await (await fetch("/export.json")).json();
const p = parseOldExport(j);
const fake = new FakeStore();
for (const [c, list] of Object.entries(p.records)) fake.data.set(c, new Map(list.map((r) => [r.id, r])));
(window as unknown as { FAKE: FakeStore }).FAKE = fake;
(ctx as unknown as { store: FakeStore }).store = fake;
(window as unknown as { AV_TEST: boolean }).AV_TEST = true;   // the planner's names (S, go, upsert…) as test hooks
document.body.dataset.mod = "money";
const render = () => money.render(document.getElementById("main")!);
window.addEventListener("hashchange", render);
render();
// in the Android test app: Back, and "locking" (a reload) after a minute away, as the real app does
installNative({ home: "#/money/home", hint: (t) => toast(t), lockAfterMs: 60 * 1000, lock: () => location.reload(), locks: () => true });
