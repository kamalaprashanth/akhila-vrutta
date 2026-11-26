/**
 * Sharing one item with the family (Documents › an owner's page › Share with family): the item, its papers and
 * their files move into the family space (files resealed with the family key: a copy in each member's Drive), and back again when it's turned
 * off. Properties, accounts and loans stay in your Money: only a name card (famOwners) and their papers move.
 * Only the person who shared an item can stop sharing it.
 */
import { FILES, type Rec, type WriteOp } from "./store.ts";
import type { FileRec } from "./files.ts";
import { dropOwn, intoFamily, outOfFamily } from "./famfiles.ts";
import { famOwn, famWrite, myStore, myUid, sharerOf } from "./family.ts";

type Owner = { c: string; id: string };
const MOVES = new Set(["docOwners", "hhVehicles", "hhAppliances"]);   // records that move whole
const same = (a: Owner | undefined, b: Owner): boolean => !!a && a.c === b.c && a.id === b.id;

/** Shares an item. `card`: its name and kind, for items that stay in Money (properties, accounts, loans). */
export async function shareItem(o: Owner, card: { name: string; kind: string; sub?: string }, progress?: (m: string) => void): Promise<void> {
  const mine = myStore(), me = myUid();
  if (!mine) throw new Error("Unlock first.");
  // 1. the item itself (or its name card), so its papers and files are "shared" from here on
  if (MOVES.has(o.c)) {
    const rec = mine.own(o.c).find((x) => x.id === o.id && !x.deleted);
    if (!rec) throw new Error("It wasn't found.");
    famWrite([{ c: o.c, id: o.id, r: { ...rec, sharer: me } }]);
    mine.writeOwn([{ c: o.c, id: o.id, r: null }]);
  } else famWrite([{ c: "famOwners", id: `${o.c}:${o.id}`, r: { id: `${o.c}:${o.id}`, c: o.c, oid: o.id, ...card, sharer: me } }]);
  // 2. its papers
  const docs = mine.own<Rec & { owner?: Owner }>("docs").filter((d) => !d.deleted && same(d.owner, o));
  if (docs.length) { famWrite(docs.map((d) => ({ c: "docs", id: d.id, r: { ...d, sharer: me } }))); mine.writeOwn(docs.map((d) => ({ c: "docs", id: d.id, r: null }))); }
  // 3. the files: the item's own and its papers', resealed with the family key
  const ids = new Set(docs.map((d) => d.id));
  const files = mine.own<FileRec>(FILES).filter((f) => !f.deleted && (same(f.owner, o) || (f.owner?.c === "docs" && ids.has(f.owner.id))));
  for (const [i, f] of files.entries()) {
    progress?.(`Moving ${i + 1} of ${files.length} files…`);
    const next = await intoFamily(f);
    famWrite([{ c: FILES, id: f.id, r: { ...next, sharer: me } }]);
    mine.writeOwn([{ c: FILES, id: f.id, r: null }]);
    await dropOwn(f);
  }
}

/** Stops sharing an item you shared: it, its papers and their files come back to you (files into your Drive). */
export async function unshareItem(o: Owner, progress?: (m: string) => void): Promise<void> {
  const mine = myStore(), me = myUid();
  if (!mine) throw new Error("Unlock first.");
  if (sharerOf(o) !== me) throw new Error("Only the person who shared it can stop sharing it.");
  const strip = <T extends Rec>(x: T): T => { const y = { ...x }; delete y.sharer; return y; };
  const docs = famOwn<Rec & { owner?: Owner }>("docs").filter((d) => same(d.owner, o));
  const ids = new Set(docs.map((d) => d.id));
  const files = famOwn<FileRec>(FILES).filter((f) => same(f.owner, o) || (f.owner?.c === "docs" && ids.has(f.owner.id)));
  for (const [i, f] of files.entries()) {
    progress?.(`Moving ${i + 1} of ${files.length} files back to your Drive…`);
    const next = await outOfFamily(f);
    mine.writeOwn([{ c: FILES, id: f.id, r: strip(next) }]);
    famWrite([{ c: FILES, id: f.id, r: null }]);
  }
  const ops: WriteOp[] = docs.map((d) => ({ c: "docs", id: d.id, r: strip(d) }));
  if (MOVES.has(o.c)) { const rec = famOwn(o.c).find((x) => x.id === o.id); if (rec) ops.push({ c: o.c, id: o.id, r: strip(rec) }); }
  if (ops.length) mine.writeOwn(ops);
  famWrite([...docs.map((d) => ({ c: "docs", id: d.id, r: null })), MOVES.has(o.c) ? { c: o.c, id: o.id, r: null } : { c: "famOwners", id: `${o.c}:${o.id}`, r: null }]);
}
