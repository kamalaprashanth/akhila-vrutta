/**
 * The family space (approved design, 26 Nov 2026): a second home, end-to-end encrypted with its own key, that
 * the members share. What's shared lives only there; everything else stays in each person's own home.
 *
 * Cloud:
 *   homes/{fam}                    { members: { uid: "owner" | "member" }, schema, created, invite? }
 *   homes/{fam}/txns/{id}          shared transactions (sealed with the family key)
 *   homes/{fam}/famMembers/{uid}   { name }  first names, for "added by"
 *   homes/{fam}/famRules/rules     { tags: string[] }  which tags are shared
 *   invites/{id}                   { home, by, exp, box }  one-time: id and key both come from the 6 words
 * Each member's own home keeps the family's id and key in `family/space` (sealed with their own data key).
 *
 * A shared transaction keeps its payer's account and category, plus the category's name and who set it. On the
 * other member's phone its account is "<Name>'s (family)", a hidden account (no balance, not in totals, so only
 * the payer's balance moves), and its category is theirs with the same name. Both count it as spending.
 */
import { aesKey, argon2Raw, fromB64, open, rnd, seal, TD, TE, toB64 } from "./crypto.ts";
import { callable, initFirebase, type Fb } from "./firebase.ts";
import { toast } from "./dom.ts";
import { FAMILY, FAMILY_COLLECTIONS, Store, type Overlay, type Rec, type WriteOp } from "./store.ts";

export interface Space extends Rec { home: string; key: string; role: "owner" | "member" }
export interface Member extends Rec { name: string }
export interface Rules extends Rec { tags: string[]; days?: boolean; lists?: boolean }
type Tx = Rec & { type?: string; tags?: string[]; accountId?: string; toAccountId?: string; categoryId?: string; owner?: string; ownerName?: string; cat?: string; catBy?: string };

let mine: Store | null = null, fam: Store | null = null, me = "", myName = "";
const listeners = new Set<() => void>();
export const onFamily = (fn: () => void): (() => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = (): void => listeners.forEach((f) => f());

async function fb(): Promise<Fb> { const f = await initFirebase(); if (!f) throw new Error("Firebase isn't configured for this build."); return f; }
let current: Space | null = null;
export const space = (): Space | null => (fam ? current : null) ?? (mine?.own<Space>(FAMILY).find((x) => x.id === "space" && !x.deleted) ?? null);
export const familyOpen = (): boolean => !!fam;
export const members = (): Member[] => (fam?.own<Member>("famMembers").filter((m) => !m.deleted) ?? []);
export const memberName = (uid: string): string => members().find((m) => m.id === uid)?.name || "Family";
/** The rules just saved here (a record is sealed in the background, so the store has it a moment later). */
let localRules: Rules | null = null;
const rules = (): Rules => localRules ?? fam?.own<Rules>("famRules").find((r) => r.id === "rules") ?? { id: "rules", tags: ["Home"] };
const saveRules = (next: Rules): void => { localRules = next; fam?.writeMany([{ c: "famRules", id: "rules", r: next }]); };
export const sharedTags = (): string[] => rules().tags ?? ["Home"];
/** Whole collections shared by a switch: family days, and the to-do and grocery lists. */
const WHOLE: Record<string, keyof Rules> = { famDays: "days", hhItems: "lists" };
export const shares = (what: "days" | "lists"): boolean => !!rules()[what];
const wholeOn = (c: string): boolean => !!WHOLE[c] && !!rules()[WHOLE[c]!];
export const myUid = (): string => me;

/* ---------- how shared transactions look here, and where writes go ---------- */
const virt = (uid: string): string => `fam:${uid}`;
const catId = (name?: string): string | undefined => {
  if (!name || !mine) return undefined;
  const n = name.trim().toLowerCase();
  return mine.own<Rec & { name?: string; deleted?: boolean }>("categories").find((c) => !c.deleted && String(c.name ?? "").trim().toLowerCase() === n)?.id;
};
const catName = (id?: string): string | undefined => (id && mine ? (mine.own<Rec & { name?: string }>("categories").find((c) => c.id === id)?.name as string | undefined) : undefined);
/** A family record as this person sees it. */
function view(t: Tx): Tx {
  const v: Tx = { ...t };
  if (t.owner && t.owner !== me) { v.accountId = virt(t.owner); delete v.toAccountId; }
  if (t.catBy !== me) { const c = catId(t.cat); if (c) v.categoryId = c; else delete v.categoryId; }
  return v;
}
const isShared = (t: Tx): boolean => (t.type === "expense" || t.type === "income") && (t.tags ?? []).some((g) => sharedTags().includes(g));

/** Items shared one by one (Documents' owners with their papers and files, appliances, vehicles): `sharer` is who shared it. */
const ITEM = new Set(["docs", "docOwners", "hhVehicles", "hhAppliances", "files", "famOwners"]);
type Owned = Rec & { owner?: { c: string; id: string }; sharer?: string };
const famRec = (c: string, id: string): Owned | undefined => fam?.own<Owned>(c).find((x) => x.id === id && !x.deleted);
/** Is this item (or the document a file belongs to) in the family space? */
export function ownerShared(o: { c: string; id: string } | undefined): boolean {
  if (!fam || !o) return false;
  if (famRec(o.c, o.id) || famRec("famOwners", `${o.c}:${o.id}`)) return true;
  if (o.c === "docs") { const d = famRec("docs", o.id); return !!d; }
  return false;
}
/** Who shared it (undefined: not shared). */
export const sharerOf = (o: { c: string; id: string }): string | undefined => (famRec(o.c, o.id) ?? famRec("famOwners", `${o.c}:${o.id}`))?.sharer;
/* the raw family store, for moving items in and out (famshare.ts) */
export const famOwn = <T extends Rec = Rec>(c: string): T[] => (fam?.own<T>(c).filter((x) => !(x as { deleted?: boolean }).deleted) ?? []);
export const famWrite = (ops: WriteOp[]): void => { fam?.writeMany(ops); };
export const famStore = (): Store | null => fam;
export const myStore = (): Store | null => mine;

const overlay: Overlay = {
  colls: new Set(["txns", "accounts", ...Object.keys(WHOLE), ...ITEM]),
  all(c) {
    if (!fam) return [];
    if (WHOLE[c]) return wholeOn(c) ? fam.own(c).filter((x) => !x.deleted) : [];
    if (ITEM.has(c)) return fam.own(c).filter((x) => !x.deleted);
    if (c === "txns") return fam.own<Tx>("txns").filter((t) => !t.deleted).map(view);
    // the other members' accounts: hidden, outside totals, never a balance here
    const others = new Set(fam.own<Tx>("txns").map((t) => t.owner).filter((u): u is string => !!u && u !== me));
    for (const m of members()) if (m.id !== me) others.add(m.id);
    return [...others].map((u) => ({ id: virt(u), name: `${memberName(u)}'s (family)`, type: "bank", hidden: true, noTotal: true, family: true }));
  },
  get(c, id) {
    if (!fam) return undefined;
    if (c === "txns") { const t = fam.own<Tx>("txns").find((x) => x.id === id && !x.deleted); return t ? view(t) : undefined; }
    if (WHOLE[c]) return wholeOn(c) ? fam.own(c).find((x) => x.id === id && !x.deleted) : undefined;
    if (ITEM.has(c)) return famRec(c, id);
    return id.startsWith("fam:") ? this.all(c).find((a) => a.id === id) : undefined;
  },
  route(op, here) {
    if (!fam) return [op];
    if (op.c === "accounts") return op.id.startsWith("fam:") ? [] : [op];
    if (ITEM.has(op.c)) {
      // a shared item stays shared; a new paper or file for a shared item joins it there
      const old = famRec(op.c, op.id);
      if (!op.r) { if (old) fam.writeMany([{ c: op.c, id: op.id, r: null }]); return here(op.c, op.id) ? [op] : []; }
      const r = op.r as Owned;
      if (old || ((op.c === "docs" || op.c === "files") && ownerShared(r.owner))) {
        fam.writeMany([{ c: op.c, id: op.id, r: { ...r, sharer: old?.sharer ?? me } }]);
        const out: WriteOp[] = here(op.c, op.id) ? [{ c: op.c, id: op.id, r: null }] : [];
        // a new paper for a shared item: the files added in its form (already in the family space) join it
        if (op.c === "docs" && mine) for (const f of mine.own<Owned & { fam?: number }>("files")) if (!f.deleted && f.fam && f.owner?.c === "docs" && f.owner.id === op.id) {
          fam.writeMany([{ c: "files", id: f.id, r: { ...f, sharer: me } }]); out.push({ c: "files", id: f.id, r: null });
        }
        return out;
      }
      return [op];
    }
    if (WHOLE[op.c]) {
      const old = fam.own(op.c).find((x) => x.id === op.id && !x.deleted);
      if (!op.r) { if (old) fam.writeMany([{ c: op.c, id: op.id, r: null }]); return here(op.c, op.id) ? [op] : []; }
      if (wholeOn(op.c)) { fam.writeMany([{ c: op.c, id: op.id, r: { ...op.r, owner: (old?.owner as string | undefined) ?? me } }]); return here(op.c, op.id) ? [{ c: op.c, id: op.id, r: null }] : []; }
      if (old) fam.writeMany([{ c: op.c, id: op.id, r: null }]);
      const clean = { ...op.r }; delete clean.owner;
      return [{ c: op.c, id: op.id, r: clean }];
    }
    const old = fam.own<Tx>("txns").find((x) => x.id === op.id && !x.deleted);
    if (!op.r) { if (old) fam.writeMany([{ c: "txns", id: op.id, r: null }]); return here(op.c, op.id) ? [op] : []; }
    const r = op.r as Tx, owner = old?.owner ?? me;
    if (owner !== me || isShared(r)) {
      const shown = old ? view(old).categoryId : undefined;
      const rec: Tx & { editedBy?: string; editedName?: string } = { ...r, owner, ownerName: old?.ownerName ?? myName, editedBy: me, editedName: myName };
      if (owner !== me) { rec.accountId = old!.accountId; if (old!.toAccountId) rec.toAccountId = old!.toAccountId; else delete rec.toAccountId; }
      if (!old || r.categoryId !== shown) { rec.catBy = me; rec.cat = catName(r.categoryId); if (!r.categoryId) delete rec.categoryId; }
      else { rec.categoryId = old.categoryId; rec.cat = old.cat; rec.catBy = old.catBy; }
      for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k];
      fam.writeMany([{ c: "txns", id: op.id, r: rec }]);
      return here(op.c, op.id) ? [{ c: op.c, id: op.id, r: null }] : [];
    }
    // not shared (any more), and yours: it lives in your own home
    if (old) fam.writeMany([{ c: "txns", id: op.id, r: null }]);
    const clean = { ...r }; for (const k of ["owner", "ownerName", "cat", "catBy"]) delete clean[k];
    return [{ c: op.c, id: op.id, r: clean }];
  },
};

/** Opens the family space (when this account has one) and shows it with your own data. */
export async function startFamily(store: Store, name: string, given?: Space): Promise<void> {
  mine = store; me = store.uid; myName = name || myName;
  // a space just saved is sealed in the background, so it may not be in the store yet: it's passed in
  const sp = given ?? space();
  if (!sp || fam) return;
  current = sp;
  // who you are in it now (an owner can hand over), or that you were taken out of it
  try {
    const { fs, db } = await fb();
    const hd = await fs.getDoc!(fs.doc!(db, "homes", sp.home));
    const role = (hd.data() as { members?: Record<string, string> } | undefined)?.members?.[me];
    if (role === "owner" || role === "member") current = { ...sp, role };
  } catch (e) {
    // "permission denied" also comes from an App Check or connection hiccup: nothing is deleted on its own;
    // the Family page says it can't be opened and lets the person forget it (review #1)
    if ((e as { code?: string }).code === "permission-denied") { lost = true; current = sp; changed(); return; }
  }
  try {
    const key = await aesKey(fromB64(sp.key));
    fam = await Store.open(sp.home, me, key, undefined, FAMILY_COLLECTIONS);
  } catch (e) { console.warn("family", e); fam = null; return; }
  fam.onWriteError((e) => toast(`Couldn't save a change to the family space${(e as { code?: string })?.code ? ` (${(e as { code?: string }).code})` : ""}. Check your connection and try again.`));
  fam.subscribe((ch) => { if (!ch.local && ch.keys.some((k) => k.c === "famRules")) localRules = null; mine?.overlayChanged(ch.keys); changed(); });
  store.attach(overlay);
  // always on the member list (the copier counts copies against it), with a first name when there is one
  const meRec = members().find((m) => m.id === me);
  if (!meRec || (myName && meRec.name !== myName)) fam.writeMany([{ c: "famMembers", id: me, r: { id: me, name: myName || meRec?.name || "" } }]);
  await moveForTags();   // a switch the other member changed: your own records follow it
  changed();
}
let lost = false;
/** The family space couldn't be opened (removed, or App Check / connection trouble). */
export const lostAccess = (): boolean => lost;
/** The person confirmed it: forget the family space here and delete its files from their Drive. */
export async function forgetFamily(): Promise<void> {
  await hooks.removed?.().catch((e) => console.warn("family files", e));
  lost = false; current = null;
  mine?.writeMany([{ c: FAMILY, id: "space", r: null }]);
  stopFamily();
}
/** Tries again to open a family space that couldn't be opened. */
export async function retryFamily(): Promise<void> { if (!mine) return; const sp = space(); lost = false; current = null; if (sp) await startFamily(mine, myName, sp); }
/** Reads who you are in the space now (after a hand-over on another phone; review #10). */
export async function refreshRole(): Promise<void> {
  const sp = current; if (!sp || !fam) return;
  try {
    const { fs, db } = await fb();
    const role = ((await fs.getDoc!(fs.doc!(db, "homes", sp.home))).data() as { members?: Record<string, string> } | undefined)?.members?.[me];
    if ((role === "owner" || role === "member") && role !== sp.role) { current = { ...sp, role }; mine?.writeMany([{ c: FAMILY, id: "space", r: { ...sp, role } }]); changed(); }
  } catch { /* offline */ }
}
/** Records in the family space that you shared or own, for your own backup (review #3). */
export function sharedByMe(c: string): Rec[] {
  if (!fam) return [];
  return fam.own<Rec & { sharer?: string; owner?: unknown }>(c).filter((x) => !x.deleted && (x.sharer === me || x.owner === me));
}
/** What the files side does when you leave or were taken out (deletes your Family folder in Drive). */
const hooks: { removed?: () => Promise<void>; leaving?: () => Promise<void> } = {};
export const setFamilyHooks = (h: typeof hooks): void => { Object.assign(hooks, h); };
function stopFamily(): void { fam?.close(); fam = null; current = null; localRules = null; mine?.attach(null); changed(); }
export const setMyName = (n: string): void => { myName = n; };

/** Starts a family space with you as its owner. */
export async function createFamily(): Promise<void> {
  if (!mine) throw new Error("Unlock first.");
  if (space()) throw new Error("You're already in a family space.");
  const { fs, db } = await fb();
  const home = toB64(rnd(15)).replace(/[+/=]/g, "x");
  await fs.setDoc!(fs.doc!(db, "homes", home), { members: { [me]: "owner" }, schema: 1, created: fs.serverTimestamp!() });
  const sp: Space = { id: "space", home, key: toB64(rnd(32)), role: "owner" };
  mine.writeMany([{ c: FAMILY, id: "space", r: sp }]);
  await startFamily(mine, myName, sp);
  saveRules({ id: "rules", tags: ["Home"] });
  await moveForTags();
}

/* ---------- invites: 6 words, once, for 24 hours ---------- */
const WORDS = ("acorn amber anchor apple arrow aster autumn bamboo banana basil beach bell berry birch bison blossom bridge brook bubble cabin cactus camel candle canyon carrot castle cedar cherry chess cider cloud clover cobalt comet copper coral cotton crane cricket crystal daisy delta desert dolphin dove dragon dune eagle ember falcon fern fig firefly flute forest fossil fox galaxy garden garlic gecko ginger glacier globe grape guava harbor hazel heron hill honey horizon island ivory jade jasmine jungle kayak kettle kiwi koala lagoon lantern lava lemon lily lime lion lotus lunar mango maple marble meadow melon mint monsoon moss mountain mustard nectar needle nest nutmeg oasis ocean olive onyx orange orchid otter owl palm panda papaya parrot peach pearl pebble pepper petal piano pine planet plum pond poppy prism pumpkin quartz quill rabbit radish rain raven reef ribbon river robin rocket rose ruby saffron sage salmon sand sapphire saturn scarf seed shell silver sky sloth snow spark spice spruce squash star stone storm sugar summit sun swan tamarind tea teak thunder tiger timber tomato topaz tulip turtle valley velvet violet volcano walnut water wave whale willow wind winter wolf yak zebra zinnia anise apricot badger beacon blaze bloom bramble breeze brick butter cashew cello chalk cliff cocoa compass cove crimson cumin cypress dawn dew drum elm emerald falls feather flame flint fog frost gale gem gold granite gull hawk heath hive ink iris jet juniper kite lark lattice leaf linen lynx mallow mesa mist moon nova oak pansy pigeon quince rattan sequoia sienna thistle tundra umber wren").split(" ");
const normCode = (code: string): string => code.toLowerCase().split(/[^a-z]+/).filter(Boolean).join(" ");
/**
 * The invite's id and key both come from one slow Argon2id run over the 6 words (review #7): an id seen
 * somewhere gives no shortcut to the words. id = first 16 bytes of SHA-256("id" ‖ k), key = SHA-256("key" ‖ k).
 */
async function fromCode(code: string): Promise<{ id: string; key: CryptoKey }> {
  const k = await argon2Raw(normCode(code), toB64(TE.encode("akhila-vrutta invite v2")), 65536, 3, 1);
  const part = async (tag: string): Promise<Uint8Array<ArrayBuffer>> => { const m = new Uint8Array(tag.length + k.length); m.set(TE.encode(tag)); m.set(k, tag.length); return new Uint8Array(await crypto.subtle.digest("SHA-256", m)); };
  const idb = await part("id"), key = await aesKey(await part("key"));
  k.fill(0);
  return { id: [...idb.slice(0, 16)].map((x) => x.toString(16).padStart(2, "0")).join(""), key };
}

/** Makes a one-time code that lets someone join (owner only). */
export async function makeInvite(): Promise<{ code: string; id: string }> {
  const sp = space();
  if (!sp || sp.role !== "owner") throw new Error("Only the family space's owner can invite.");
  // 256 words: one random byte picks each word evenly (6 words = 48 bits, slowed by Argon2id)
  const pick = rnd(6), code = [...pick].map((b) => WORDS[b % WORDS.length]!).join(" ");
  const { id, key } = await fromCode(code), box = await seal(key, TE.encode(JSON.stringify({ home: sp.home, key: sp.key })), `invite/${id}`);
  const { fs, db } = await fb();
  await fs.setDoc!(fs.doc!(db, "invites", id), { home: sp.home, by: me, exp: (fs.Timestamp as unknown as { fromMillis(n: number): unknown }).fromMillis(Date.now() + 24 * 3600e3), box });
  return { code, id };
}
export async function cancelInvite(id: string): Promise<void> { const { fs, db } = await fb(); await fs.deleteDoc!(fs.doc!(db, "invites", id)).catch(() => {}); }

/** Joins a family space with the 6 words its owner gave you. */
export async function joinFamily(code: string): Promise<void> {
  if (!mine) throw new Error("Unlock first.");
  if (space()) throw new Error("You're already in a family space. Leave it first.");
  if (normCode(code).split(" ").length !== 6) throw new Error("The code is 6 words.");
  const { id, key } = await fromCode(code), { fs, db } = await fb();
  const snap = await fs.getDoc!(fs.doc!(db, "invites", id)).catch(() => null);
  if (!snap || !snap.exists()) throw new Error("That code isn't right, or it was used or has expired. Ask for a new one.");
  const inv = snap.data() as { home: string; exp: { toMillis(): number }; box: { iv: string; ct: string } };
  if (inv.exp.toMillis() < Date.now()) throw new Error("That code has expired. Ask for a new one.");
  let got: { home: string; key: string };
  try { got = JSON.parse(TD.decode(await open(key, inv.box, `invite/${id}`))); } catch { throw new Error("That code isn't right. Check the 6 words."); }
  await fs.updateDoc!(fs.doc!(db, "homes", got.home), { [`members.${me}`]: "member", invite: id });
  await fs.deleteDoc!(fs.doc!(db, "invites", id)).catch(() => {});
  const sp: Space = { id: "space", home: got.home, key: got.key, role: "member" };
  mine.writeMany([{ c: FAMILY, id: "space", r: sp }]);
  await startFamily(mine, myName, sp);
  await moveForTags();
}

/** Leaves the family space (a member), or removes someone from it (the owner). Their copy of what they saw stays with them. */
export async function leaveFamily(): Promise<void> {
  const sp = space(); if (!sp || !mine) return;
  const { fs, db } = await fb();
  if (sp.role === "owner" && members().length > 1) throw new Error("You own the family space: hand it over to another member first.");
  await hooks.leaving?.().catch((e) => console.warn("family files", e));   // your copies in your Drive go
  fam?.writeMany([{ c: "famMembers", id: me, r: null }]);                    // off the member list (the owner can leave once alone)
  if (sp.role === "member") await fs.updateDoc!(fs.doc!(db, "homes", sp.home), { [`members.${me}`]: fs.deleteField!() });
  else await (await callable("deleteFamilySpace"))({ home: sp.home }).catch((e) => console.warn("family delete", e));   // an owner alone: nothing left behind
  stopFamily();
  mine.writeMany([{ c: FAMILY, id: "space", r: null }]);
}
export async function removeMember(uid: string): Promise<void> {
  const sp = space(); if (!sp || sp.role !== "owner" || uid === me) return;
  const { fs, db } = await fb();
  await fs.updateDoc!(fs.doc!(db, "homes", sp.home), { [`members.${uid}`]: fs.deleteField!() });
  fam?.writeMany([{ c: "famMembers", id: uid, r: null }]);
}

/** The owner hands the family space to another member (and becomes a member). */
export async function handOver(uid: string): Promise<void> {
  const sp = space(); if (!sp || sp.role !== "owner" || uid === me) return;
  const { fs, db } = await fb();
  await fs.updateDoc!(fs.doc!(db, "homes", sp.home), { [`members.${uid}`]: "owner", [`members.${me}`]: "member" });
  current = { ...sp, role: "member" };
  mine?.writeMany([{ c: FAMILY, id: "space", r: { ...sp, role: "member" } }]);
  changed();
}

/** Which tags are shared; your transactions move in or out to match. */
export async function setSharedTags(tags: string[]): Promise<void> {
  if (!fam) return;
  saveRules({ ...rules(), tags });
  await moveForTags();
}
/** Shares (or stops sharing) family days or the lists; your own move to match. */
export async function setShared(what: "days" | "lists", on: boolean): Promise<void> {
  if (!fam) return;
  saveRules({ ...rules(), [what]: on });
  await moveForTags();
}
/** Your own records go where the rules say (each write is routed): transactions by tag, family days and lists by their switch. */
async function moveForTags(): Promise<void> {
  if (!mine || !fam) return;
  const ops: WriteOp[] = [];
  for (const c of Object.keys(WHOLE)) {
    if (wholeOn(c)) { for (const x of mine.own(c)) if (!x.deleted) ops.push({ c, id: x.id, r: x }); }
    else for (const x of fam.own(c)) if (!x.deleted && x.owner === me) ops.push({ c, id: x.id, r: x });
  }
  for (const t of mine.own<Tx>("txns")) if (!t.deleted && isShared(t)) ops.push({ c: "txns", id: t.id, r: t });
  for (const t of fam.own<Tx>("txns")) if (!t.deleted && t.owner === me && !isShared(t)) ops.push({ c: "txns", id: t.id, r: view(t) });
  if (ops.length) mine.writeMany(ops);
}

/** This month's shared spending, by member (paise). */
export function togetherThisMonth(ym: string): { total: number; by: { uid: string; name: string; amount: number }[] } {
  const by = new Map<string, number>();
  for (const t of fam?.own<Tx & { date?: string; amount?: number }>("txns") ?? []) {
    if (t.deleted || t.type !== "expense" || !String(t.date ?? "").startsWith(ym)) continue;
    by.set(t.owner ?? "", (by.get(t.owner ?? "") ?? 0) + Math.abs(Number(t.amount) || 0));
  }
  const list = [...by].map(([uid, amount]) => ({ uid, name: uid === me ? "You" : memberName(uid), amount }));
  return { total: list.reduce((s, x) => s + x.amount, 0), by: list };
}

/** Tests only: put two stand-in stores in place of your home and the family space (review #15). */
export const __test = {
  setup(m: Store, f: Store, uid: string, name: string): void { mine = m; fam = f; me = uid; myName = name; localRules = null; current = { id: "space", home: "fam", key: "", role: "owner" }; },
  overlay,
  moveForTags: (): Promise<void> => moveForTags(),
};
