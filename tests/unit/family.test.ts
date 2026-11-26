// Family sharing's routing: what goes to the family space, what stays in your home, and how the other member's
// shared transactions look on your phone (review #15). Two stand-in stores route writes the way Store does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { __test, setShared, setSharedTags, sharedByMe } from "../../app/core/family.ts";
import type { Overlay, Rec, WriteOp } from "../../app/core/store.ts";

class Fake {
  data = new Map<string, Map<string, Rec>>();
  overlay: Overlay | null = null;
  uid: string;
  constructor(uid: string) { this.uid = uid; }
  private m(c: string) { if (!this.data.has(c)) this.data.set(c, new Map()); return this.data.get(c)!; }
  own<T extends Rec = Rec>(c: string): T[] { return [...this.m(c).values()] as T[]; }
  all<T extends Rec = Rec>(c: string): T[] { const mine = this.own<T>(c); if (!this.overlay?.colls.has(c)) return mine; const f = this.overlay.all(c) as T[], ids = new Set(f.map((x) => x.id)); return [...mine.filter((x) => !ids.has(x.id)), ...f]; }
  get<T extends Rec = Rec>(c: string, id: string): T | undefined { return (this.m(c).get(id) ?? (this.overlay?.colls.has(c) ? this.overlay.get(c, id) : undefined)) as T | undefined; }
  attach(o: Overlay | null): void { this.overlay = o; }
  overlayChanged(): void {}
  writeOwn(ops: WriteOp[]): void { for (const op of ops) { if (op.r) this.m(op.c).set(op.id, structuredClone(op.r)); else this.m(op.c).delete(op.id); } }
  writeMany(ops: WriteOp[]): void {
    const o = this.overlay, here = (c: string, id: string) => this.m(c).has(id);
    this.writeOwn(o ? ops.flatMap((op) => (o.colls.has(op.c) ? o.route(op, here) : [op])) : ops);
  }
}
const setup = () => {
  const mine = new Fake("kp"), fam = new Fake("kp");
  __test.setup(mine as never, fam as never, "kp", "Prashanth");
  mine.attach(__test.overlay);
  mine.writeOwn([{ c: "categories", id: "c1", r: { id: "c1", name: "Groceries" } }]);
  return { mine, fam };
};
const tx = (id: string, extra: Record<string, unknown> = {}): Rec => ({ id, type: "expense", amount: 64000, date: "2026-11-26", accountId: "hdfc", categoryId: "c1", ...extra });

test("a transaction tagged Home goes to the family space; untagged it comes back", () => {
  const { mine, fam } = setup();
  mine.writeMany([{ c: "txns", id: "t1", r: tx("t1", { tags: ["Home"] }) }]);
  assert.equal(mine.own("txns").length, 0);
  const f = fam.own<Rec & { owner?: string; cat?: string }>("txns")[0]!;
  assert.equal(f.owner, "kp"); assert.equal(f.cat, "Groceries");
  assert.equal(mine.all("txns").length, 1, "…and it still shows in your Money");
  mine.writeMany([{ c: "txns", id: "t1", r: { ...mine.all("txns")[0]!, tags: [] } }]);
  assert.equal(fam.own("txns").length, 0);
  assert.equal(mine.own<Rec & { owner?: string }>("txns")[0]!.owner, undefined, "back home without the family fields");
});

test("the other member's transaction: their account shows as theirs, the category matches by name, your edit keeps their account", () => {
  const { mine, fam } = setup();
  fam.writeOwn([{ c: "famMembers", id: "wf", r: { id: "wf", name: "Wife" } }, { c: "txns", id: "t2", r: tx("t2", { tags: ["Home"], owner: "wf", ownerName: "Wife", accountId: "her-sbi", categoryId: "her-c9", cat: "groceries", catBy: "wf" }) }]);
  const seen = mine.get<Rec & { accountId?: string; categoryId?: string }>("txns", "t2")!;
  assert.equal(seen.accountId, "fam:wf"); assert.equal(seen.categoryId, "c1");
  assert.ok(mine.all("accounts").some((a) => a.id === "fam:wf" && (a as { hidden?: boolean }).hidden), "her account is a hidden one here");
  mine.writeMany([{ c: "txns", id: "t2", r: { ...seen, amount: 70000 } }]);
  const after = fam.own<Rec & { accountId?: string; amount?: number; editedBy?: string; categoryId?: string }>("txns")[0]!;
  assert.equal(after.accountId, "her-sbi"); assert.equal(after.amount, 70000); assert.equal(after.editedBy, "kp");
  assert.equal(after.categoryId, "her-c9", "an unchanged category stays hers");
});

test("shared tags: switching a tag on moves your matching transactions in", async () => {
  const { mine, fam } = setup();
  mine.writeOwn([{ c: "txns", id: "t3", r: tx("t3", { tags: ["Kids"] }) }]);
  await setSharedTags(["Home", "Kids"]);
  assert.equal(fam.own("txns").length, 1); assert.equal(mine.own("txns").length, 0);
  await setSharedTags(["Home"]);
  assert.equal(fam.own("txns").length, 0); assert.equal(mine.own("txns").length, 1);
});

test("family days follow their switch; a paper for a shared person goes to the family space", async () => {
  const { mine, fam } = setup();
  mine.writeOwn([{ c: "famDays", id: "d1", r: { id: "d1", kind: "birthday", name: "Amma", date: "1958-08-14", byDate: true, byTithi: false } }]);
  await setShared("days", true);
  assert.equal(fam.own("famDays").length, 1); assert.equal(mine.own("famDays").length, 0);
  fam.writeOwn([{ c: "docOwners", id: "p1", r: { id: "p1", group: "people", name: "Amma", sharer: "kp" } }]);
  mine.writeMany([{ c: "docs", id: "doc1", r: { id: "doc1", owner: { c: "docOwners", id: "p1" }, type: "aadhaar", added: "2026-11-26" } }]);
  assert.equal(fam.own("docs").length, 1, "the new paper joined the shared person");
  assert.deepEqual(sharedByMe("docs").map((x) => x.id), ["doc1"], "and your backup takes it");
});
