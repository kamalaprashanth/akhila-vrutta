/**
 * Charts as KP Money Planner draws them: small SVGs from the validated palette (--v1..--v6, --vO other),
 * one axis, rounded data ends, a legend for 2+ series, a tooltip on every mark, and "Show as table".
 * Values here are rupees (callers divide paise by 100): the axis and tooltip formats are the planner's.
 */
import { esc } from "../../../core/dom.ts";
import { MN, type YM } from "../calc/dates.ts";
import { money } from "./txlist.ts";

type Tip = { tip(i: number): string };
const CH: Record<string, Tip> = {};
let chSeq = 0;
/** Resets the chart ids before a page is drawn (as the planner did on every render). */
export function resetCharts(): void { for (const k in CH) delete CH[k]; chSeq = 0; const t = document.querySelector<HTMLElement>("#ctip"); if (t) t.hidden = true; }

/** Width of the money area (the planner's frame had exactly this width). Tests fix it. */
let fixedW = 0;
export const setChartWidth = (w: number): void => { fixedW = w; };
const areaW = (): number => document.getElementById("moneyView")?.clientWidth || window.innerWidth;
export const CW = (half?: boolean): number => {
  if (fixedW) return fixedW;
  const v = document.getElementById("view"), vw = v?.clientWidth || areaW() - 32, two = half && areaW() >= 900;
  return Math.round(Math.max(280, Math.min(1100, two ? (vw - 16) / 2 - 24 : vw - 24)));
};
export const VC = ["var(--v1)", "var(--v2)", "var(--v3)", "var(--v4)", "var(--v5)", "var(--v6)"];
export const AX = (v: number): string => {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e7) return s + +(a / 1e7).toFixed(a >= 1e8 ? 0 : 1) + "Cr";
  if (a >= 1e5) return s + +(a / 1e5).toFixed(a >= 1e6 ? 0 : 1) + "L";
  if (a >= 1e3) return s + +(a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k";
  return s + Math.round(a);
};
export function niceTicks(lo: number, hi: number, n = 4): number[] {
  if (!(hi > lo)) hi = lo + 1;
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const t: number[] = [];
  for (let v = Math.floor(lo / step + 1e-9) * step; v <= Math.ceil(hi / step - 1e-9) * step + step * 1e-6; v += step) t.push(Math.round(v / step) * step);
  return t.length > 1 ? t : [t[0]!, t[0]! + step];
}
const rtop = (x: number, y: number, w: number, h: number, r: number): string => { if (h <= 0) return ""; r = Math.min(r, w / 2, h); return `M${x.toFixed(1)},${(y + h).toFixed(1)}V${(y + r).toFixed(1)}Q${x.toFixed(1)},${y.toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)}H${(x + w - r).toFixed(1)}Q${(x + w).toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${(y + r).toFixed(1)}V${(y + h).toFixed(1)}Z`; };
const rbot = (x: number, y: number, w: number, h: number, r: number): string => { if (h <= 0) return ""; r = Math.min(r, w / 2, h); return `M${x.toFixed(1)},${y.toFixed(1)}V${(y + h - r).toFixed(1)}Q${x.toFixed(1)},${(y + h).toFixed(1)} ${(x + r).toFixed(1)},${(y + h).toFixed(1)}H${(x + w - r).toFixed(1)}Q${(x + w).toFixed(1)},${(y + h).toFixed(1)} ${(x + w).toFixed(1)},${(y + h - r).toFixed(1)}V${y.toFixed(1)}Z`; };
export interface Series { name: string; color: string; values: (number | null)[]; dash?: boolean; dashTo?: number | null; width?: number; noDot?: boolean }
export const legendHtml = (series: { name: string; color: string; dash?: boolean }[]): string => series.length < 2 ? "" : `<div class="legend">${series.map((s) => `<span><i class="${s.dash ? "dash" : ""}" style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`;
/** Rupees, whole (the planner's money()). */
export const fmtMoney = (v: number): string => money(Math.round(v * 100));
export function tableHtml(labels: string[], series: { name: string; values: (number | null)[] }[], fmt: (v: number) => string = fmtMoney, total?: boolean): string {
  return `<details class="ctab"><summary>Show as table</summary><div class="tw"><table><thead><tr><th></th>${series.map((s) => `<th>${esc(s.name)}</th>`).join("")}${total ? "<th>Total</th>" : ""}</tr></thead><tbody>
    ${labels.map((l, i) => `<tr><td>${esc(l)}</td>${series.map((s) => `<td>${s.values[i] == null ? "—" : fmt(s.values[i]!)}</td>`).join("")}${total ? `<td>${fmt(series.reduce((a, s) => a + (Number(s.values[i]) || 0), 0))}</td>` : ""}</tr>`).join("")}</tbody></table></div></details>`;
}
export function tipRows(rows: { n: string; c?: string; v: string }[], title: string, foot?: string): string {
  return `<div class="tt">${esc(title)}</div>${rows.map((r) => `<div class="tr"><span>${r.c ? `<i style="background:${r.c}"></i>` : ""}${esc(r.n)}</span><b>${r.v}</b></div>`).join("")}${foot ? `<div class="tf">${foot}</div>` : ""}`;
}
/* x labels: at most ~7 shown; January carries its year */
export const xLabelEvery = (n: number): number => (n <= 8 ? 1 : n <= 14 ? 2 : n <= 26 ? 4 : Math.ceil(n / (areaW() < 600 ? 4.5 : 7)));
export const mTick = (ym: YM): string => { const m = +ym.slice(5); return m === 1 ? `${MN[0]} ’${ym.slice(2, 4)}` : MN[m - 1]!; };
export const mTicks = (M: YM[]): string[] => (M.length > 24 ? M.map((ym) => `${MN[+ym.slice(5) - 1]} ’${ym.slice(2, 4)}`) : M.map(mTick));

export interface BarOpts {
  labels: string[]; ticks?: string[]; full?: string[]; series: Series[]; stack?: boolean; h?: number; half?: boolean; fmt?: (v: number) => string; axFmt?: (v: number) => string;
  avg?: { v: number; label: string }; attrs?: (i: number) => string; tip?: (i: number) => string; foot?: (i: number) => string; dim?: (i: number) => boolean; aria?: string;
}
export function barChart(o: BarOpts): string {
  const id = "c" + (++chSeq), W = CW(o.half), H = o.h || 210, pl = 40, pr = 8, pt = 14, pb = 24, n = o.labels.length, k = o.series.length;
  const pos = (i: number): number => o.series.reduce((s, x) => s + Math.max(0, Number(x.values[i]) || 0), 0), neg = (i: number): number => o.series.reduce((s, x) => s + Math.min(0, Number(x.values[i]) || 0), 0);
  const vals = o.series.flatMap((s) => s.values.map((v) => Number(v) || 0));
  let hi = Math.max(o.stack ? Math.max(0, ...o.labels.map((_, i) => pos(i))) : Math.max(0, ...vals), o.avg ? o.avg.v : 0, 1), lo = Math.min(0, ...(o.stack ? o.labels.map((_, i) => neg(i)) : vals));
  const tk = niceTicks(lo, hi); lo = tk[0]!; hi = tk[tk.length - 1]!;
  const Y = (v: number): number => pt + (hi - v) * (H - pt - pb) / (hi - lo), bw = (W - pl - pr) / n, every = xLabelEvery(n);
  const gw = Math.min(o.stack ? 26 : Math.max(6, Math.min(15, (bw * .74 - (k - 1) * 2) / k)) * k + (k - 1) * 2, bw * .78), barW = o.stack ? gw : (gw - (k - 1) * 2) / k;
  let marks = "";
  for (let i = 0; i < n; i++) {
    const x0 = pl + i * bw + (bw - gw) / 2, op = o.dim && o.dim(i) ? ' opacity=".55"' : "";
    if (o.stack) {
      let up = 0, down = 0;
      const segs = o.series.map((s, j) => ({ j, v: Number(s.values[i]) || 0 })).filter((x) => Math.abs(x.v) > 0.005);
      const lastPos = segs.filter((x) => x.v > 0).pop();
      for (const g of segs) {
        if (g.v > 0) { const y1 = Y(up + g.v), y0 = Y(up), h = Math.max(0, y0 - y1 - (up > 0 ? 2 : 0)); marks += g === lastPos ? `<path d="${rtop(x0, y1, barW, h, 4)}" fill="${o.series[g.j]!.color}"${op}/>` : `<rect x="${x0.toFixed(1)}" y="${y1.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${o.series[g.j]!.color}"${op}/>`; up += g.v; }
        else { const y0 = Y(down), y1 = Y(down + g.v); marks += `<path d="${rbot(x0, y0, barW, Math.max(0, y1 - y0), 4)}" fill="${o.series[g.j]!.color}"${op}/>`; down += g.v; }
      }
    } else o.series.forEach((s, j) => { const v = Number(s.values[i]) || 0, x = x0 + j * (barW + 2); if (v > 0) { const y = Y(v); marks += `<path d="${rtop(x, y, barW, Y(0) - y, 4)}" fill="${s.color}"${op}/>`; } else if (v < 0) marks += `<path d="${rbot(x, Y(0), barW, Y(v) - Y(0), 4)}" fill="${s.color}"${op}/>`; });
  }
  const grid = tk.map((v) => `<line class="${v === 0 ? "z" : "gl"}" x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${(o.axFmt || AX)(v)}</text>`).join("");
  const xl = o.labels.map((_l, i) => (i % every === 0 || (i === n - 1 && n <= 8) ? `<text x="${(pl + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc((o.ticks || o.labels)[i])}</text>` : "")).join("");
  const avg = o.avg ? `<line x1="${pl}" x2="${W - pr}" y1="${Y(o.avg.v).toFixed(1)}" y2="${Y(o.avg.v).toFixed(1)}" stroke="var(--ink)" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - pr}" y="${(Y(o.avg.v) - 5).toFixed(1)}" text-anchor="end" style="fill:var(--ink);font-weight:700">${esc(o.avg.label)}</text>` : "";
  const hits = o.labels.map((_l, i) => `<rect class="hit" data-ci="${i}" x="${(pl + i * bw).toFixed(1)}" y="${pt}" width="${bw.toFixed(1)}" height="${H - pt - pb}" ${o.attrs ? o.attrs(i) : ""}/>`).join("");
  CH[id] = { tip: (i) => (o.tip ? o.tip(i) : tipRows(o.series.map((s) => ({ n: s.name, c: k > 1 ? s.color : "", v: (o.fmt || fmtMoney)(Number(s.values[i]) || 0) })), (o.full || o.labels)[i]!, o.foot ? o.foot(i) : "")) };
  return `<svg viewBox="0 0 ${W} ${H}" data-ch="${id}" role="img" aria-label="${esc(o.aria || "Bar chart")}">${grid}${marks}${avg}${xl}${hits}</svg>`;
}

export interface LineOpts {
  labels: string[]; ticks?: string[]; full?: string[]; series: Series[]; area?: number; band?: { v: number; label: string }; h?: number; half?: boolean; fmt?: (v: number) => string; axFmt?: (v: number) => string;
  tip?: (i: number) => string; foot?: (i: number) => string; zero?: boolean; dots?: boolean; mark?: number | null; markLabel?: string; attrs?: (i: number) => string; aria?: string;
}
export function lineChart(o: LineOpts): string {
  const id = "c" + (++chSeq), W = CW(o.half), H = o.h || 210, pl = 44, pr = 10, pt = 14, pb = 24, n = o.labels.length;
  const vals = o.series.flatMap((s) => s.values.filter((v) => v != null).map(Number));
  let lo = Math.min(...vals, o.band ? o.band.v : Infinity, o.zero === false ? Infinity : 0), hi = Math.max(...vals, o.band ? o.band.v : -Infinity, o.zero === false ? -Infinity : 0);
  if (!isFinite(lo)) lo = 0;
  if (!isFinite(hi)) hi = 1;
  if (o.zero === false) { const pad = (hi - lo) * .12 || Math.abs(hi) * .1 || 1; lo -= pad; hi += pad; }
  const tk = niceTicks(lo, hi); lo = tk[0]!; hi = tk[tk.length - 1]!;
  const X = (i: number): number => pl + (n <= 1 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (n - 1)), Y = (v: number): number => pt + (hi - v) * (H - pt - pb) / (hi - lo), every = xLabelEvery(n);
  const grid = tk.map((v) => `<line class="${v === 0 ? "z" : "gl"}" x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${(o.axFmt || AX)(v)}</text>`).join("");
  const band = o.band ? `<rect x="${pl}" y="${Y(o.band.v).toFixed(1)}" width="${W - pl - pr}" height="${Math.max(0, Y(lo) - Y(o.band.v)).toFixed(1)}" fill="var(--bad)" fill-opacity=".08"/><line x1="${pl}" x2="${W - pr}" y1="${Y(o.band.v).toFixed(1)}" y2="${Y(o.band.v).toFixed(1)}" stroke="var(--bad)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${pl + 6}" y="${(Y(o.band.v) + 14).toFixed(1)}" style="fill:var(--bad);font-weight:700">${esc(o.band.label)}</text>` : "";
  let lines = "", dots = "";
  o.series.forEach((s, j) => {
    const pts = s.values.map((v, i) => (v == null ? null : [X(i), Y(+v)] as [number, number]));
    const path = (from: number, to: number): string => { let d = "", on = false; for (let i = from; i <= to; i++) { const p = pts[i]; if (!p) { on = false; continue; } d += (on ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); on = true; } return d; };
    if (o.area === j) { const ix = pts.map((p, i) => (p ? i : -1)).filter((i) => i >= 0); if (ix.length > 1) lines += `<path d="${path(ix[0]!, ix[ix.length - 1]!)}L${pts[ix[ix.length - 1]!]![0].toFixed(1)},${Y(Math.min(hi, Math.max(lo, 0))).toFixed(1)}L${pts[ix[0]!]![0].toFixed(1)},${Y(Math.min(hi, Math.max(lo, 0))).toFixed(1)}Z" fill="${s.color}" fill-opacity=".10"/>`; }
    const w = s.width || 2;
    if (s.dashTo != null && s.dashTo > 0) {
      lines += `<path d="${path(0, Math.min(s.dashTo, n - 1))}" fill="none" stroke="${s.color}" stroke-width="${w}" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (s.dashTo < n - 1) lines += `<path d="${path(s.dashTo, n - 1)}" fill="none" stroke="${s.color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
    } else lines += `<path d="${path(0, n - 1)}" fill="none" stroke="${s.color}" stroke-width="${w}" ${s.dash ? 'stroke-dasharray="5 4"' : ""} stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = pts.map((p, i) => (p ? i : -1)).filter((i) => i >= 0).pop();
    if (last != null && !s.noDot) dots += `<circle cx="${pts[last]![0].toFixed(1)}" cy="${pts[last]![1].toFixed(1)}" r="4.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`;
    if (o.dots) pts.forEach((p, i) => { if (p && i !== last) dots += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${s.color}" stroke="var(--surface)" stroke-width="1.5"/>`; });
  });
  const mark = o.mark != null ? `<line x1="${X(o.mark).toFixed(1)}" x2="${X(o.mark).toFixed(1)}" y1="${pt}" y2="${H - pb}" stroke="var(--muted)" stroke-dasharray="2 3"/><text x="${(X(o.mark) + 4).toFixed(1)}" y="${pt + 8}" style="font-weight:700">${esc(o.markLabel || "Today")}</text>` : "";
  const xl = o.labels.map((_l, i) => (i % every === 0 ? `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 && n > 1 ? "start" : "middle"}">${esc((o.ticks || o.labels)[i])}</text>` : "")).join("");
  const step = n > 1 ? (W - pl - pr) / (n - 1) : W - pl - pr;
  const hits = o.labels.map((_l, i) => `<rect class="hit" data-ci="${i}" x="${Math.max(pl - 4, X(i) - step / 2).toFixed(1)}" y="${pt}" width="${step.toFixed(1)}" height="${H - pt - pb}" ${o.attrs ? o.attrs(i) : ""}/>`).join("");
  CH[id] = { tip: (i) => (o.tip ? o.tip(i) : tipRows(o.series.filter((s) => s.values[i] != null).map((s) => ({ n: s.name, c: o.series.length > 1 ? s.color : "", v: (o.fmt || fmtMoney)(+s.values[i]!) })), (o.full || o.labels)[i]!, o.foot ? o.foot(i) : "")) };
  return `<svg viewBox="0 0 ${W} ${H}" data-ch="${id}" role="img" aria-label="${esc(o.aria || "Line chart")}">${band}${grid}${lines}${mark}${dots}${xl}${hits}</svg>`;
}

export interface DonutItem { name: string; value: number; color: string; attrs?: string }
export function donutChart(o: { items: DonutItem[]; center: [string, string]; fmt?: (v: number) => string; aria?: string }): string {
  const id = "c" + (++chSeq), S2 = 200, R = 80, T = 26, C = 2 * Math.PI * R, tot = o.items.reduce((a, x) => a + Math.max(0, x.value), 0) || 1;
  let off = 0;
  const gap = o.items.length > 1 ? 2.2 : 0;
  const segs = o.items.map((x, i) => { const len = Math.max(0, x.value) / tot * C, d = `<circle class="dn" data-ci="${i}" cx="100" cy="100" r="${R}" fill="none" stroke="${x.color}" stroke-width="${T}" stroke-dasharray="${Math.max(.01, len - gap).toFixed(2)} ${(C - Math.max(.01, len - gap)).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 100 100)" ${x.attrs || ""}/>`; off += len; return d; }).join("");
  CH[id] = { tip: (i) => { const x = o.items[i]!; return tipRows([{ n: x.name, c: x.color, v: (o.fmt || fmtMoney)(x.value) }], x.name, `${(x.value / tot * 100).toFixed(1)}% of ${(o.fmt || fmtMoney)(tot)}${x.attrs && /data-trd/.test(x.attrs) ? " · tap to open" : ""}`); } };
  return `<svg viewBox="0 0 ${S2} ${S2}" data-ch="${id}" role="img" aria-label="${esc(o.aria || "Donut chart")}" style="max-width:220px;margin:0 auto">
    <circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--sunk)" stroke-width="${T}"/>${segs}
    <text x="100" y="98" text-anchor="middle" style="font:500 21px var(--display);fill:var(--ink)">${esc(o.center[0])}</text><text x="100" y="118" text-anchor="middle" style="font-size:11px">${esc(o.center[1])}</text></svg>`;
}
export const chartCard = (title: string, sub: string, body: string, extra = ""): string => `<div class="chart">${title || sub ? `<div class="chd"><b>${title}</b><span>${sub || ""}</span></div>` : ""}${body}${extra}</div>`;
/** Top-N + "Other" for part-to-whole: colors follow the rank in this chart, fixed order, never cycled. */
export function topN(entries: [string, number][], n = 6): [string, number][] {
  const s = [...entries].filter((e) => e[1] > 0.005).sort((a, b) => b[1] - a[1]);
  if (s.length <= n) return s;
  const rest = s.slice(n - 1).reduce((a, e) => a + e[1], 0);
  return [...s.slice(0, n - 1), ["__other", rest]];
}

/* tooltip: pointer over any [data-ci] inside a chart; on touch the first tap shows it, the second acts */
let chPtr = "mouse", chArmed: Element | null = null;
const inMoved = (t: EventTarget | null): boolean => !!(t as Element | null)?.closest?.("#moneyView, #mvLayer");
const tipEl = (): HTMLElement => {
  let d = document.querySelector<HTMLElement>("#ctip");
  if (!d) { d = document.createElement("div"); d.id = "ctip"; d.className = "ctip"; d.hidden = true; d.setAttribute("role", "status"); (document.querySelector("#mvLayer") ?? document.body).appendChild(d); }
  return d;
};
function chartTip(e: PointerEvent): void {
  const h = (e.target as Element | null)?.closest?.("[data-ci]") ?? null, t = tipEl();
  if (!h) { if (!t.hidden) t.hidden = true; document.querySelectorAll(".hit.on").forEach((x) => x.classList.remove("on")); return; }
  const svg = h.closest<SVGElement>("[data-ch]"), c = svg && CH[svg.dataset.ch!];
  if (!c) return;
  t.innerHTML = c.tip(+(h as HTMLElement).dataset.ci!);
  t.hidden = false;
  document.querySelectorAll(".hit.on").forEach((x) => x !== h && x.classList.remove("on"));
  if (h.classList.contains("hit")) h.classList.add("on");
  const r = t.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
  let x = e.clientX + 14, y = e.clientY - r.height - 12;
  if (x + r.width > vw - 8) x = e.clientX - r.width - 14;
  if (x < 8) x = 8;
  if (y < 8) y = e.clientY + 18;
  if (y + r.height > vh - 8) y = vh - r.height - 8;
  t.style.left = x + "px"; t.style.top = y + "px";
}
document.addEventListener("pointermove", (e) => { chPtr = e.pointerType || "mouse"; if (chPtr === "mouse" && inMoved(e.target)) chartTip(e); }, { passive: true });
document.addEventListener("pointerdown", (e) => { chPtr = e.pointerType || "mouse"; if (inMoved(e.target)) chartTip(e); }, { passive: true });
document.addEventListener("scroll", () => { const t = document.querySelector<HTMLElement>("#ctip"); if (t) t.hidden = true; chArmed = null; }, { passive: true, capture: true });
document.addEventListener("click", (e) => {
  const h = (e.target as Element | null)?.closest?.("[data-ci]");
  if (!h || chPtr === "mouse" || !inMoved(h)) { chArmed = null; return; }
  if (chArmed !== h) { chArmed = h; e.stopPropagation(); e.preventDefault(); }   /* first tap: tooltip only */
  else chArmed = null;
}, true);
