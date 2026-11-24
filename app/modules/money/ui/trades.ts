/**
 * Broker trades (Kite tradebooks), as in KP Money Planner: kept for reference and listed in Transactions; they
 * never change a balance or a total. Trades stay in their own currency (not paise): qty, price, amt, fee.
 */
import { esc } from "../../../core/dom.ts";
import type { MoneyData, Rec } from "../calc/data.ts";
import { fmtD } from "../calc/plan.ts";
import { money } from "../views/txlist.ts";
import { rs0 } from "../views/accounts.ts";
import { toast } from "./kit.ts";
import { E } from "./env.ts";

/** A small .xlsx reader: the first worksheet → rows of cell values. */
export async function xlsxRows(file: Blob): Promise<unknown[][]> {
  const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
  let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("not an .xlsx file");
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files: Record<string, { method: number; csize: number; off: number }> = {};
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl)); files[name] = { method, csize, off }; p += 46 + nl + xl + cl;
  }
  const read = async (name: string): Promise<string | null> => {
    const f = files[name]; if (!f) return null;
    const lh = f.off, start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true), data = buf.subarray(start, start + f.csize);
    if (f.method === 0) return new TextDecoder().decode(data);
    const s = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")); return await new Response(s).text();
  };
  const P = new DOMParser(), ss: string[] = [], sst = await read("xl/sharedStrings.xml");
  if (sst) { const doc = P.parseFromString(sst, "application/xml"); for (const si of doc.getElementsByTagName("si")) ss.push([...si.getElementsByTagName("t")].map((t) => t.textContent).join("")); }
  const sheetName = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0]!;
  const doc = P.parseFromString((await read(sheetName)) ?? "", "application/xml"), rows: unknown[][] = [];
  const col = (ref: string): number => { let c = 0; for (const ch of ref.replace(/\d+/g, "")) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; };
  for (const r of doc.getElementsByTagName("row")) {
    const row: unknown[] = [];
    for (const c of r.getElementsByTagName("c")) {
      const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0], is = c.getElementsByTagName("is")[0];
      const val = t === "s" ? ss[+(v?.textContent ?? "")] : t === "inlineStr" ? (is ? [...is.getElementsByTagName("t")].map((x) => x.textContent).join("") : "") : t === "b" ? v?.textContent === "1" : v ? (t === "str" ? v.textContent : (isNaN(+(v.textContent ?? "")) ? v.textContent : +(v.textContent ?? ""))) : null;
      row[col(c.getAttribute("r") || "A")] = val;
    }
    rows.push(row);
  }
  return rows;
}
export interface Trade extends Rec { broker: string; sym: string; isin: string; date: string; side: string; qty: number; price: number; ex: string; at: string; amt?: number; fee?: number; ccy?: string }
/** Kite tradebook rows → trade records. */
export function kiteTrades(rows: unknown[][]): Trade[] {
  const hi = rows.findIndex((r) => r && r.includes("Symbol") && r.includes("Trade Type")); if (hi < 0) throw new Error("not a Kite tradebook");
  const H = rows[hi]!, c = (n: string): number => H.indexOf(n), out: Trade[] = [];
  for (const r of rows.slice(hi + 1)) {
    if (!r || !r[c("Symbol")]) continue;
    const d = String(r[c("Trade Date")] || "").slice(0, 10), side = String(r[c("Trade Type")] || "").toLowerCase(), qty = +(r[c("Quantity")] as number), price = +(r[c("Price")] as number);
    if (!/^\d{4}-\d\d-\d\d$/.test(d) || !(qty > 0) || !(price >= 0) || !/^(buy|sell)$/.test(side)) continue;
    const ex = String(r[c("Exchange")] || ""), tid = String(r[c("Trade ID")] ?? ""), oid = String(r[c("Order ID")] ?? "");
    out.push({ id: `kt:${ex}:${d}:${tid}:${oid}`, broker: "Kite", sym: String(r[c("Symbol")]).trim(), isin: String(r[c("ISIN")] || ""), date: d, side, qty, price, ex, at: String(r[c("Order Execution Time")] || "") });
  }
  return out;
}
export async function importTradebooks(files: File[]): Promise<void> {
  if (!files.length) return;
  let added = 0, seen = 0, bad = 0; const d = E().data(), ops: { c: string; r: Rec }[] = [], have = new Set(d.all("trades").map((t) => t.id));
  for (const f of files) {
    try { for (const t of kiteTrades(await xlsxRows(f))) { seen++; if (!have.has(t.id)) { have.add(t.id); ops.push({ c: "trades", r: { ...t, updatedAt: Date.now() } }); added++; } } }
    catch (e) { console.warn("tradebook", f.name, e); bad++; }
  }
  if (ops.length) E().write(ops);
  toast(added ? `${added} trade${added > 1 ? "s" : ""} added${seen - added ? `, ${seen - added} already there` : ""}${bad ? `, ${bad} file${bad > 1 ? "s" : ""} couldn't be read` : ""}` : seen ? "All these trades are already in the app." : "Couldn't read these as Kite tradebooks.");
}
const tradeSym = (s: unknown): string => String(s || "").toUpperCase().replace(/-(E|RR|BE|EQ)$/, "").replace(/\s*\(.*\)$/, "").trim();
type HT = Rec & { type?: string; px?: string; name?: string; instrument?: string; aka?: string[]; platform?: string };
/** The trades behind one holding: same ISIN or symbol (or an older name in aka), on the holding's platform. */
export function tradesFor(d: MoneyData, h: HT | undefined): Trade[] {
  if (!h || !["Stock", "US Stocks", "Gold"].includes(String(h.type))) return [];
  const isin = String(h.px || "").startsWith("stk:") ? h.px!.slice(4) : "", syms = new Set([tradeSym(h.name), tradeSym(h.instrument), ...(h.aka || []).map(tradeSym)].filter(Boolean)), plat = String(h.platform || "").toLowerCase();
  return d.live<Trade>("trades").filter((t) => (!plat || plat === String(t.broker).toLowerCase()) && ((isin && t.isin === isin) || syms.has(tradeSym(t.sym)) || (h.aka || []).includes(t.isin))).sort((a, b) => b.date.localeCompare(a.date) || String(b.at).localeCompare(String(a.at)));
}
const usd = (n: number): string => "$" + (+n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function tradesBlock(d: MoneyData, h: HT): string {
  const T = tradesFor(d, h); if (!T.length) return "";
  const us = T[0]!.ccy === "USD", f = us ? usd : (x: number): string => money(x * 100), F = us ? usd : (x: number): string => rs0(x * 100), amt = (t: Trade): number => t.amt ?? t.qty * t.price;
  const buys = T.filter((t) => t.side === "buy"), sells = T.filter((t) => t.side === "sell"), sum = (a: Trade[]): number => a.reduce((x, t) => x + amt(t), 0), q = (a: Trade[]): number => +a.reduce((x, t) => x + t.qty, 0).toFixed(us ? 4 : 0);
  const row = (t: Trade): string => `<div class="row trow"><div class="main"><div class="t">${t.side === "buy" ? "Bought" : "Sold"} ${us ? (+t.qty).toFixed(4) : t.qty} @ ${f(t.price)}</div><div class="s">${fmtD(d, t.date)}${t.ex ? ` · ${esc(t.ex)}` : ""}${t.fee ? ` · fee ${f(t.fee)}` : ""}${t.sym !== T[0]!.sym ? ` · as ${esc(t.sym)}` : ""}</div></div><div class="amt ${t.side === "sell" ? "in" : ""}">${t.side === "sell" ? "+" : ""}${f(amt(t))}</div></div>`;
  return `<p class="sect">Trades on ${esc(T[0]!.broker)}</p>
    <div class="kp3 trk"><div class="tile"><div class="k">Bought · ${q(buys)}</div><div class="v">${F(sum(buys))}</div></div><div class="tile"><div class="k">Sold${sells.length ? ` · ${q(sells)}` : ""}</div><div class="v">${sells.length ? F(sum(sells)) : "—"}</div></div><div class="tile"><div class="k">First trade</div><div class="v">${fmtD(d, T[T.length - 1]!.date)}</div></div></div>
    <div class="list" style="margin-top:8px">${T.slice(0, 8).map(row).join("")}</div>
    ${T.length > 8 ? `<details class="ctab"><summary>Show all ${T.length} trades</summary><div class="list">${T.slice(8).map(row).join("")}</div></details>` : ""}
    <p class="note">From your tradebooks. Bonuses, splits and years not imported aren't in this list, so it can differ from the units held.</p>`;
}
