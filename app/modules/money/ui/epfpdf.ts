/**
 * Reading EPFO member passbook PDFs on this device (one financial year of one member ID each), as in KP
 * Money Planner. Parsed in rupees exactly as the planner did, then stored in paise like any other import.
 */
import type { Rec } from "../calc/data.ts";
import { fromStored, toStored } from "../paise.ts";
import { pdfLines } from "./pdf.ts";
import { toast } from "./kit.ts";
import { E } from "./env.ts";

const EPF_MON: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const epfN = (s: string): number => +String(s).replace(/,/g, "") || 0;
type Row = { k: string; wm: string | null; d: string | null; emp: number; er: number; eps: number; wage?: number; epsw?: number; note?: string; from?: string };
export interface Book { acc: string; est: string; fy: number | null; dob: string; ob: number[] | null; int: number[] | null; close: number[] | null; rows: Row[] }
/** The lines of one passbook → its member ID, establishment, year, balances and rows (rupees). */
export function epfParse(lines: string[]): Book {
  const L = lines.map((l) => String(l).replace(/\s*\|\s*/g, "  ").replace(/\s+$/, ""));
  const B: Book = { acc: "", est: "", fy: null, dob: "", ob: null, int: null, close: null, rows: [] };
  const three = (s: string): number[] | null => { const m = s.match(/(-?[\d,]+)\s+(-?[\d,]+)\s+(-?[\d,]+)\s*$/); return m ? [epfN(m[1]!), epfN(m[2]!), epfN(m[3]!)] : null; };
  for (let i = 0; i < L.length; i++) {
    const l = L[i]!; let m: RegExpMatchArray | null;
    if (!B.acc && /Member ID/i.test(l) && (m = l.match(/\b([A-Z]{5}\d{10,17})\b/))) B.acc = m[1]!;
    if (!B.est && (m = l.match(/\b[A-Z]{5}\d{7,10}\s*\/\s*(.+)$/)) && !/Member/i.test(l)) B.est = m[1]!.trim();
    if (!B.dob && /Date of Birth/i.test(l) && (m = l.match(/(\d\d)-(\d\d)-(\d{4})/))) B.dob = `${m[3]}-${m[2]}-${m[1]}`;
    if (B.fy == null && (m = l.match(/Financial Year\s*-\s*(\d{4})\s*-\s*\d{4}/))) B.fy = +m[1]!;
    if (/OB Int\. Updated/i.test(l)) B.ob = three(l);
    else if (/^\s*Int\. Updated upto/i.test(l)) B.int = three(l);
    else if (/Closing Balance/i.test(l)) B.close = three(l);
    else if (/IPR\s*\(Back Period\).*Contribution only/i.test(l)) { const v = three(l); if (v && (v[0] || v[1] || v[2])) B.rows.push({ k: "ipr", wm: null, d: null, emp: v[0]!, er: v[1]!, eps: v[2]!, note: "Back-period credit (IPR)" }); }
    else if ((m = l.match(/^\s*([A-Z][a-z]{2})-(\d{4})\s+(\d\d)-(\d\d)-(\d{4})\s+(CR|DR)\b(.*)$/)) && EPF_MON[m[1]!]) {
      const nums = (m[7]!.match(/(?:^|\s)-?[\d,]+(?=\s|$)/g) || []).map((x) => x.trim()).filter((x) => !/^\d{6}$/.test(x));
      if (nums.length < 5) continue;
      const [wage, epsw, emp, er, eps] = nums.slice(-5).map(epfN) as [number, number, number, number, number];
      const ctx = L.slice(Math.max(0, i - 4), i + 3).join(" ");
      const r: Row = { k: m[6] === "DR" ? "dr" : "cont", wm: `${m[2]}-${String(EPF_MON[m[1]!]).padStart(2, "0")}`, d: `${m[5]}-${m[4]}-${m[3]}`, wage, epsw, emp, er, eps };
      if (r.k === "cont" && /TRANSFER IN/i.test(ctx) && !wage) { r.k = "tin"; const f = ctx.match(/Old Member[\s\S]*?:\s*([A-Z]{5}\d{10,17})/i); if (f) r.from = f[1]; r.note = "Transfer in" + (/INTEREST/i.test(ctx) ? " (interest)" : ""); }
      if (r.k === "dr") { const p = m[7]!.match(/PARA\s*[\d()a-z.]+/i); r.note = p ? "Claim " + p[0].replace(/\s+/g, " ") : "Withdrawal"; }
      B.rows.push(r);
    }
  }
  if (B.fy != null) B.rows.forEach((r) => { if (r.k === "ipr") r.d = `${B.fy}-04-01`; });
  return B;
}
type Epf = { books?: Record<string, { est?: string; fys: Record<string, unknown> }>; dob?: string; [k: string]: unknown };
/** Freshly read passbooks into the holding's EPF: one passbook replaces the same member ID and year. */
export function epfMerge(E0: Epf | undefined, list: Book[]): { E: Epf; n: number } {
  const Ex: Epf = { ...(E0 || {}), books: { ...((E0 && E0.books) || {}) } }; let n = 0;
  for (const B of list) {
    if (!B.acc || B.fy == null) continue;
    const bk = (Ex.books![B.acc] = { ...(Ex.books![B.acc] || { fys: {} }) }); bk.fys = { ...bk.fys }; if (B.est) bk.est = B.est;
    bk.fys[B.fy] = { ob: B.ob, int: B.int, close: B.close, rows: B.rows }; n++;
    if (B.dob && !Ex.dob) Ex.dob = B.dob;
  }
  return { E: Ex, n };
}
export async function epfLoadFiles(files: File[]): Promise<{ list: Book[]; bad: string[] }> {
  const list: Book[] = [], bad: string[] = [];
  for (const f of files) {
    try { const B = epfParse(await pdfLines(f)); if (!B.acc || B.fy == null || !B.ob) throw new Error("not an EPF passbook"); list.push(B); }
    catch (e) { console.warn("passbook", f.name, e); bad.push(f.name); }
  }
  return { list, bad };
}
/** The EPF page's "Load passbooks": read, merge into the holding, save (in paise). */
export async function epfPdfToHolding(hid: string, files: File[]): Promise<void> {
  if (!files.length) return; toast(`Reading ${files.length} PDF${files.length > 1 ? "s" : ""}…`);
  try {
    const { list, bad } = await epfLoadFiles(files);
    if (!list.length) { toast("Couldn't read these as EPF passbooks."); return; }
    const cur = E().data().byId("holdings", hid); if (!cur) return;
    const h = fromStored("holdings", cur) as Rec & { epf?: Epf & { manual?: unknown[] } };
    const r = epfMerge(h.epf || { rate: 8.25, raise: 0, retireAge: 58 }, list);
    E().write([{ c: "holdings", r: { ...toStored("holdings", { ...h, epf: { ...r.E, manual: (h.epf && h.epf.manual) || [] } }), updatedAt: Date.now() } }]);
    toast(`${list.length} passbook${list.length > 1 ? "s" : ""} loaded${bad.length ? `, ${bad.length} couldn't be read` : ""}`);
  } catch (e) { console.warn(e); toast("Couldn't open the PDF reader. Try again."); }
}
