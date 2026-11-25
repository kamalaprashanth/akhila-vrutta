/**
 * The Emergency Kit: a one-page PDF (A4) with the Secret Key in words and as a QR code, made here on the
 * device (never uploaded). A small hand-written PDF: Helvetica text and the QR's squares as filled boxes.
 */
import qrcode from "../vendor/qrcode/qrcode.mjs";
import { TE } from "./crypto.ts";

/** The QR code's dark squares for a text (medium error correction, size chosen to fit). */
export function qrModules(text: string): boolean[][] {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}

/** PDF text: only plain characters, with ( ) \ escaped. */
const pdfText = (s: string): string => s.replace(/[^\x20-\x7e]/g, "-").replace(/([()\\])/g, "\\$1");

export interface Kit { key: string; account: string; made: Date }

export function kitPdf(k: Kit): Uint8Array<ArrayBuffer> {
  const ops: string[] = [];
  const text = (x: number, y: number, size: number, s: string, bold = false): void => { ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfText(s)}) Tj ET`); };
  const day = k.made.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  // a green band at the top
  ops.push("0.055 0.37 0.30 rg 0 772 595 70 re f 1 1 1 rg");
  text(48, 800, 22, "Akhila Vrutta - Emergency Kit", true);
  ops.push("0 0 0 rg");
  text(48, 735, 11, `Made ${day}. Print this page and keep it somewhere safe at home.`);
  text(48, 705, 12, "Account", true); text(160, 705, 12, k.account);
  text(48, 670, 12, "Secret Key", true);
  ops.push("0.96 0.95 0.92 rg 48 612 499 46 re f 0 0 0 rg");
  ops.push(`BT /F3 17 Tf 62 629 Td (${pdfText(k.key)}) Tj ET`);
  text(48, 585, 12, "Passphrase", true);
  ops.push("0.6 0.6 0.6 RG 0.8 w 160 580 m 547 580 l S");
  text(160, 566, 9, "Write it here by hand, or keep it separately.");
  // the QR code
  const m = qrModules(k.key), n = m.length, size = 170, cell = size / n, x0 = 48, y0 = 340;
  ops.push("0 0 0 rg");
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r]![c]) ops.push(`${(x0 + c * cell).toFixed(2)} ${(y0 + size - (r + 1) * cell).toFixed(2)} ${cell.toFixed(2)} ${cell.toFixed(2)} re`);
  ops.push("f");
  const notes = [
    "What it's for",
    "Your data opens only with your passphrase AND this Secret Key.",
    "Your phone and laptop remember the key, so you won't type it every day.",
    "You need it on a new phone or computer, or to restore a backup there:",
    "type it in, or scan the QR code with the app.",
    "",
    "If you lose this page and every device that remembers the key,",
    "nobody can open your data: not Google, not Anthropic, not you.",
  ];
  notes.forEach((t, i) => text(240, 495 - i * 18, i === 0 ? 12 : 10.5, t, i === 0));
  text(48, 60, 8.5, "Akhila Vrutta keeps no copy of this key. Anyone with this page AND your passphrase can open your data.");
  const content = ops.join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${TE.encode(content).length} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n", offs: number[] = [];
  objs.forEach((o, i) => { offs.push(TE.encode(out).length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = TE.encode(out).length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return TE.encode(out);
}
