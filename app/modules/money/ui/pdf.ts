/**
 * Reading a PDF's text on this device with pdf.js (served with the app under /money/vendor/pdfjs; nothing is
 * uploaded). Each line is the text on one row of the page, its pieces left to right joined by " | ".
 */
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(o: { data: Uint8Array; verbosity: number; isEvalSupported: boolean }): { promise: Promise<PdfDoc>; destroy(): Promise<void> };
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str?: string; transform: number[] }[] }> }> }

let lib: Promise<PdfJs> | null = null;
const load = (): Promise<PdfJs> => (lib ??= (async () => {
  const base = new URL("/money/vendor/pdfjs/", location.href).href;
  const m = (await import(/* @vite-ignore */ base + "pdf.min.mjs")) as PdfJs;
  m.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.mjs";
  return m;
})());

export async function pdfLines(file: Blob): Promise<string[]> {
  const pdfjs = await load();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0, isEvalSupported: false }), doc = await task.promise, out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent(), rows: { y: number; its: [number, string][] }[] = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5]!; let r = rows.find((q) => Math.abs(q.y - y) <= 2);
      if (!r) { r = { y, its: [] }; rows.push(r); }
      r.its.push([it.transform[4]!, it.str]);
    }
    rows.sort((a, b) => b.y - a.y).forEach((r) => out.push(r.its.sort((a, b) => a[0] - b[0]).map((x) => x[1].trim()).join(" | ")));
  }
  try { await task.destroy(); } catch { /* already gone */ }
  return out;
}
