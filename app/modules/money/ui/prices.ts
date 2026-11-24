/**
 * Automatic prices, as in KP Money Planner. A daily job on Firebase saves the official price lists (AMFI
 * mutual funds, NPS Trust, NSE/BSE shares, Alpha Vantage US shares and the $ rate). This device reads them,
 * picks out the linked holdings and updates their price. Holdings never leave the encrypted vault, except the
 * list of US tickers (names only), which the job needs.
 */
import { esc } from "../../../core/dom.ts";
import { ctx } from "../../../core/app.ts";
import { callable, initFirebase } from "../../../core/firebase.ts";
import { dLabel } from "../calc/dates.ts";
import type { MoneyData, Rec } from "../calc/data.ts";
import { holdingSum, npsLines, type Holding } from "../calc/invest.ts";
import { closeModal, openSheet, toast } from "./kit.ts";
import { E } from "./env.ts";

export const PX_SRC: Record<string, string> = { mf: "AMFI", nps: "NPS Trust", stk: "NSE / BSE", us: "Alpha Vantage" };
const PX_WHAT: Record<string, string> = { mf: "Mutual funds", nps: "NPS", stk: "Indian shares", us: "US shares" };
export const pxKind = (type: unknown): string | null => (type === "Mutual Fund" ? "mf" : type === "Stock" ? "stk" : type === "US Stocks" ? "us" : type === "NPS" ? "nps" : null);
export const pxKey = (px: unknown): string => String(px || "").split(":").slice(1).join(":");
type Row = { p: number; d: string };
type Table = { date?: string; at?: string; from?: string; n?: number; rows: Record<string, Row>; hist?: string | null };
export type Name = { k: string; n: string; isin?: string; f?: string; s?: string; x?: string };
const P: { tables: Record<string, Table>; names: Record<string, Name[]>; status: { at?: string; runs?: Record<string, { ok?: boolean; date?: string; msg?: string; at?: string }> } | null; at: number; busy: Promise<boolean> | null; watch: string | null } =
  { tables: {}, names: {}, status: null, at: 0, busy: null, watch: null };
const HIST_MAX = 1300;   // about five years of trading days
const JUMP = 0.2;        // a change over 20% from the last official price is flagged (split, bonus or wrong price)

let testOn = false;
const pxOn = (): boolean => testOn || !!ctx.session;
/** For the screen test: price lists and names as if loaded (no Firebase). */
export function pxTest(tables: Record<string, Table>, names: Record<string, Name[]>): void { testOn = true; P.tables = tables; P.names = names; P.at = Date.now(); }
function rowsOf(text: string): Record<string, Row> { const o: Record<string, Row> = {}; for (const l of String(text || "").split("\n")) { const [k, p, d] = l.split("\t"); if (k && +p! > 0) o[k] = { p: +p!, d: d! }; } return o; }
async function gunzipB64(b64?: string): Promise<string> {
  if (!b64) return "";
  const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}
type Fs = Record<string, (...a: unknown[]) => unknown>;
async function fb(): Promise<{ fs: Fs; db: unknown } | null> { const f = await initFirebase(); return f ? { fs: f.fs as unknown as Fs, db: f.db } : null; }
async function doc(...path: string[]): Promise<Record<string, unknown> | null> {
  const f = await fb(); if (!f) return null;
  const s = await (f.fs.getDoc!(f.fs.doc!(f.db, ...path)) as Promise<{ exists(): boolean; data(): Record<string, unknown> }>);
  return s.exists() ? s.data() : null;
}
/** Which price lists this data needs: only those with a linked holding. */
export function pxNeeded(d: MoneyData): Set<string> {
  const need = new Set<string>();
  for (const h of d.live<Holding & { px?: string; isin?: string }>("holdings")) { const k = pxKind(h.type); if (k === "nps") { if (npsLines(h)) need.add("nps"); } else if (k && (h.px || (k === "mf" && h.isin))) need.add(k); }
  return need;
}
async function load(d: MoneyData, force = false): Promise<boolean> {
  if (!pxOn()) return false;
  if (!force && Date.now() - P.at < 3 * 3600e3) return true;
  if (P.busy) return P.busy;
  P.busy = (async () => {
    try {
      P.status = (await doc("priceStatus", "last")) as typeof P.status;
      for (const src of pxNeeded(d)) {
        const x = await doc("prices", src); if (!x) continue;
        const t: Table = { date: x.date as string, at: x.at as string, from: x.from as string, n: x.n as number, rows: rowsOf(await gunzipB64(x.gz as string)) };
        if (src === "us" && x.hist) t.hist = await gunzipB64(x.hist as string);
        P.tables[src] = t;
      }
      P.at = Date.now(); return true;
    } catch (e) { console.warn("prices", e); return false; } finally { P.busy = null; }
  })();
  return P.busy;
}
async function loadSrc(src: string): Promise<void> {
  if (P.tables[src] || !pxOn()) return;
  try { const x = await doc("prices", src); if (x) P.tables[src] = { date: x.date as string, at: x.at as string, from: x.from as string, n: x.n as number, rows: rowsOf(await gunzipB64(x.gz as string)), hist: src === "us" && x.hist ? await gunzipB64(x.hist as string) : null }; } catch { /* offline */ }
}
/** Earlier days (up to 30) from the saved day files, so a holding's price history has no gaps. */
async function backfill(src: string, after: string): Promise<[string, Record<string, Row>][]> {
  if (testOn) return [];
  try {
    const f = await fb(); if (!f) return [];
    const q = f.fs.query!(f.fs.collection!(f.db, "prices", src, "days"), f.fs.where!("date", ">", after), f.fs.orderBy!("date"));
    const qs = await (f.fs.getDocs!(q) as Promise<{ docs: { data(): Record<string, unknown> }[] }>), out: [string, Record<string, Row>][] = [];
    for (const dd of qs.docs) { const x = dd.data(); out.push([x.date as string, rowsOf(await gunzipB64(x.gz as string))]); }
    return out;
  } catch (e) { console.warn("price history", e); return []; }
}
const mergeHist = (old: [string, number][] | undefined, add: [string, number][]): [string, number][] => {
  const m = new Map((old || []).map(([d, p]) => [d, p])); for (const [d, p] of add) if (d && p > 0) m.set(d, p);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-HIST_MAX);
};
type Priced = { price?: number; priceDate?: string; priceAuto?: string; priceSrc?: string; priceManual?: boolean; priceJump?: { from: number; to: number; d: string } };
/** One price onto one record (a holding, or one NPS scheme line); true if it changed. */
export function pxSet(o: Priced, r: Row | undefined, src: string): boolean {
  if (!r) return false;
  if (o.priceManual && o.priceDate && o.priceDate >= r.d) return false;   // your own price is newer: keep it
  if (o.priceAuto === r.d && +(o.price ?? 0) === r.p) return false;
  if (o.priceAuto && o.priceAuto > r.d) return false;                     // never back to an older price
  const prev = +(o.price ?? 0) || 0;
  if (o.priceAuto && prev > 0 && Math.abs(r.p / prev - 1) > JUMP) o.priceJump = { from: prev, to: r.p, d: r.d }; else if (o.priceJump && o.priceJump.d !== r.d) delete o.priceJump;
  o.price = r.p; o.priceDate = r.d; o.priceAuto = r.d; o.priceSrc = PX_SRC[src]; delete o.priceManual;
  return true;
}
type HX = Holding & Priced & { px?: string; isin?: string; navHist?: [string, number][]; fx?: number; fxDate?: string; fxAuto?: string; fxManual?: boolean; ccy?: string; lines2?: never };
type NL = Priced & { px?: string; nm?: string; hist?: [string, number][] };
const nl = (h: HX): NL[] => (h.npsLines ?? []) as unknown as NL[];
const withHistory = (d: MoneyData, h: HX): HX => { const v = holdingSum(d, h as Holding).value; h.history = (h.history || []).filter((p) => p.date !== d.today).concat({ date: d.today, value: Math.round(v) }).slice(-60); return h; };
/** Applies the loaded prices to the linked holdings; returns how many changed. */
export async function pxApply(): Promise<number> {
  if (!pxOn() || !Object.keys(P.tables).length) return 0;
  let d = E().data();
  const link: Rec[] = [];
  // mutual funds added from a CAS carry the ISIN; NPS schemes from a statement carry the scheme name: link them once
  const mfNeed = d.live<HX>("holdings").filter((h) => h.type === "Mutual Fund" && !h.px && h.isin);
  if (mfNeed.length) { const names = (await pxNames("mf")) || []; for (const h0 of mfNeed) { const hit = names.find((x) => String(x.isin || "").split(",").includes(h0.isin!)); if (hit) link.push({ ...h0, px: "mf:" + hit.k }); } }
  const npsNeed = d.live<HX>("holdings").filter((h) => h.type === "NPS" && npsLines(h) && nl(h).some((l) => !l.px && l.nm));
  if (npsNeed.length) {
    const names = (await pxNames("nps")) || [], norm = (s: unknown): string => String(s || "").toUpperCase().replace(/\s+POP$/, "").replace(/\s+/g, " ").trim();
    for (const h0 of npsNeed) { const h = JSON.parse(JSON.stringify(h0)) as HX; let ch = false; for (const l of nl(h)) if (!l.px && l.nm) { const w = norm(l.nm), hit = names.find((x) => norm(x.n) === w) || names.find((x) => norm(x.n).includes(w) || w.includes(norm(x.n))); if (hit) { l.px = "nps:" + hit.k; ch = true; } } if (ch) link.push(h); }
  }
  if (link.length) { E().write(link.map((r) => ({ c: "holdings", r: { ...r, updatedAt: Date.now() } }))); d = E().data(); }
  const ops: Rec[] = [], back: Record<string, [HX, string][]> = {};
  for (const h0 of d.live<HX>("holdings")) {
    const src = pxKind(h0.type); if (!src) continue;
    const lines = src === "nps" ? npsLines(h0) : null; if (src !== "nps" && !h0.px) continue; if (src === "nps" && !lines) continue;
    const t = P.tables[src]; if (!t) continue;
    const h = JSON.parse(JSON.stringify(h0)) as HX; let ch = false;
    if (lines) { for (const l of nl(h)) { const r = t.rows[pxKey(l.px)]; if (r) { if (pxSet(l, r, src)) ch = true; l.hist = mergeHist(l.hist, [[r.d, r.p]]); } } }
    else {
      const r = t.rows[pxKey(h.px)];
      if (r && pxSet(h, r, src)) ch = true;
      if (src === "us") { const fx = t.rows.USDINR; if (fx && h.ccy === "USD" && (h.fxAuto !== fx.d || +(h.fx ?? 0) !== fx.p) && !(h.fxManual && (h.fxDate ?? "") >= fx.d)) { h.fx = fx.p; h.fxDate = fx.d; h.fxAuto = fx.d; delete h.fxManual; ch = true; } }
      if (r) {
        const before = (h.navHist || []).length, last = before ? h.navHist![before - 1]![0] : ""; let add: [string, number][] = [[r.d, r.p]];
        if (src === "us" && t.hist && (!last || last < r.d)) { const k = pxKey(h.px) + "\t"; add = add.concat(t.hist.split("\n").filter((l) => l.startsWith(k)).map((l) => { const [, p, dd] = l.split("\t"); return [dd!, +p!] as [string, number]; }).filter(([dd]) => !last || dd > last)); }
        else if (src !== "us" && (!last || last < r.d)) (back[src] = back[src] || []).push([h, last || "2000-01-01"]);
        h.navHist = mergeHist(h.navHist, add); if (h.navHist.length !== before) ch = true;
      }
    }
    if (ch) ops.push(withHistory(d, h));
  }
  for (const [src, list] of Object.entries(back)) {
    const after = list.reduce((m, [, dd]) => (dd < m ? dd : m), list[0]![1]), days = await backfill(src, after); if (!days.length) continue;
    for (const [h] of list) { const k = pxKey(h.px), add = days.map(([dd, rows]) => (rows[k] ? [dd, rows[k]!.p] as [string, number] : null)).filter(Boolean) as [string, number][];
      if (add.length) { const before = (h.navHist || []).length; h.navHist = mergeHist(h.navHist, add); if (h.navHist.length !== before && !ops.includes(h)) ops.push(h); } }
  }
  if (ops.length) E().write(ops.map((r) => ({ c: "holdings", r: { ...r, updatedAt: Date.now() } })));
  return ops.length;
}
/** The job needs the US tickers you hold (names only, no amounts). */
async function pxWatch(): Promise<void> {
  if (!pxOn()) return;
  const uid = ctx.session!.uid, d = E().data();
  const us = [...new Set(d.live<HX>("holdings").filter((h) => h.type === "US Stocks" && /^us:/.test(h.px || "")).map((h) => pxKey(h.px)))].sort();
  try {
    if (P.watch === null) { const x = await doc("priceWatch", uid); P.watch = ((x?.us as string[]) || []).slice().sort().join(","); }
    if (P.watch === us.join(",")) return;
    const f = await fb(); if (!f) return;
    await f.fs.setDoc!(f.fs.doc!(f.db, "priceWatch", uid), { us, at: new Date().toISOString() }); P.watch = us.join(",");
  } catch (e) { console.warn("price watch", e); }
}
/** Loads today's prices (at most every 3 hours unless forced), applies them and tells the job about US tickers. */
export async function pxRefresh(force = false): Promise<void> {
  if (!pxOn()) return;
  const ok = await load(E().data(), force); if (ok) await pxApply(); void pxWatch(); E().refresh();
}
/** After a holding is saved: its price from the lists already loaded. */
export const pxAfterSave = (): void => { void pxApply().then(() => pxWatch()); };
export async function pxNames(src: string): Promise<Name[] | null> {
  if (P.names[src]) return P.names[src]!;
  if (!pxOn()) return null;
  const x = await doc("priceNames", src); if (!x) return (P.names[src] = []);
  const txt = await gunzipB64(x.gz as string);
  return (P.names[src] = txt.split("\n").filter(Boolean).map((l) => { const [k, n, a, b] = l.split("\t") as [string, string, string?, string?]; return src === "mf" ? { k, n, isin: a } : src === "nps" ? { k, n, f: a } : { k, n, s: a, x: b }; }));
}
export async function pxPrice(src: string, key: string): Promise<Row | null> { await loadSrc(src); const t = P.tables[src]; return t ? t.rows[key] || null : null; }
export const pxTable = async (src: string): Promise<Table | null> => { await loadSrc(src); return P.tables[src] ?? null; };
export function pxSearch(list: Name[], q0: string): Name[] {
  const q = q0.trim().toLowerCase(); if (q.length < 2) return [];
  const toks = q.split(/\s+/), exact = list.filter((x) => x.k.toLowerCase() === q || (x.s || "").toLowerCase() === q || (x.isin || "").toLowerCase().includes(q));
  const hits = list.filter((x) => { const t = `${x.n} ${x.s || ""} ${x.k}`.toLowerCase(); return toks.every((w) => t.includes(w)); });
  return [...new Set([...exact, ...hits])].slice(0, 30);
}
const pxWhen = (iso?: string): string => { if (!iso) return ""; const dt = new Date(iso); return isNaN(+dt) ? "" : `${dLabel(new Date(dt.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10))}, ${dt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}`; };
/** The short line on the Investments tab. */
export function pxLine(d: MoneyData): string {
  const need = [...pxNeeded(d)], st = P.status?.runs || {};
  const bad = need.filter((s) => st[s] && !st[s]!.ok);
  const old = need.filter((s) => { const t = P.tables[s]; return t && t.date && Math.round((+new Date(d.today + "T00:00") - +new Date(t.date + "T00:00")) / 864e5) > 4; });
  const txt = !need.length ? "Automatic prices: link a fund, share or NPS scheme to update it daily"
    : bad.length || old.length ? `Prices: ${[...new Set([...bad, ...old])].map((s) => PX_WHAT[s]).join(", ")} not updating` : `Prices updated ${pxWhen(P.status?.at) || "daily"}`;
  return `<button class="pxline ${bad.length || old.length ? "warn" : ""}" type="button" id="pxStatus"><span>${esc(txt)}</span><span class="chev" aria-hidden="true"></span></button>`;
}
export function pxStatusSheet(): void {
  const st = P.status?.runs || {};
  const row = (src: string): string => {
    const r = st[src], t = P.tables[src];
    const state = !r ? '<span class="pill">Not run yet</span>' : r.ok ? '<span class="pill">OK</span>' : '<span class="pill bad">Failed</span>';
    return `<div class="row"><div class="main"><div class="t">${PX_WHAT[src]} ${state}</div><div class="s">${esc(PX_SRC[src])}${r && r.date ? ` · prices of ${dLabel(r.date)}` : t && t.date ? ` · prices of ${dLabel(t.date)}` : ""}</div>${r ? `<div class="s s2">${esc(r.msg || "")}${r.at ? ` · ${esc(pxWhen(r.at))}` : ""}</div>` : ""}</div></div>`;
  };
  openSheet("Automatic prices", `
    <p class="note" style="margin-top:0">Official prices are fetched every day at about 9:20 am and 11:20 pm. Mutual funds: AMFI. NPS: NPS Trust. Indian shares: NSE, with BSE as backup. US shares and the dollar rate: Alpha Vantage (morning only). If a source fails or looks wrong, the last good price is kept.</p>
    <div class="list">${["mf", "nps", "stk", "us"].map(row).join("")}</div>
    <p class="note">To link a holding, open it and use <b>Automatic price</b>. A price you type is kept until a newer official price arrives.</p>
    <div class="btns"><button class="btn pri" type="button" id="pxNow" data-lbl="Update prices now">Update prices now</button><button class="btn" type="button" id="cx">Close</button></div>`, (s) => {
    s.querySelector<HTMLElement>("#cx")!.onclick = closeModal;
    const b = s.querySelector<HTMLButtonElement>("#pxNow")!;
    b.onclick = async () => {
      if (!pxOn()) { toast("Sign in and sync first."); return; }
      b.disabled = true; b.textContent = "Updating… (up to a few minutes)";
      try { const fn = await callable("refreshPricesNow", 560000); await fn({}); P.tables = {}; await pxRefresh(true); closeModal(); pxStatusSheet(); toast("Prices updated"); }
      catch (e) { b.disabled = false; b.textContent = b.dataset.lbl!; const m = String((e as Error).message || (e as { code?: string }).code || "error"); toast(/not-found|internal/i.test(m) ? "Couldn't reach the price job. Deploy the functions first (README › Automatic prices)." : "Couldn't update: " + m); }
    };
  });
}
