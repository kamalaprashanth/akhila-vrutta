/**
 * The NPS page, as in KP Money Planner: value by scheme (units × NAV), then Schemes, Contributions (by
 * financial year) and Projection to retirement.
 */
import { esc } from "../../../core/dom.ts";
import { mLabel } from "../calc/dates.ts";
import type { MoneyData } from "../calc/data.ts";
import { npsCalc, type Holding } from "../calc/invest.ts";
import { invNet } from "../calc/insights.ts";
import { accName, fmtD } from "../calc/plan.ts";
import { accountsPage, rs0, shortR } from "./accounts.ts";
import { chartCard, lineChart, type Series } from "./charts.ts";
import type { Page } from "./pages.ts";

export interface NpsState { npsId?: string; npsTab?: string }
const NPS_RET: Record<string, number> = { E: 10, C: 8, G: 7.5, A: 8 };
const NPS_LBL: Record<string, string> = { E: "Equity (E)", C: "Corporate bonds (C)", G: "Government bonds (G)", A: "Alternative (A)" };
const fyLbl = (y: number): string => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
const fyShort = (fy: number): string => `FY${String(fy + 1).slice(2)}`;
const fyOf = (d: string): number => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 4 ? y : y - 1; };
export const npsHold = (d: MoneyData, S: NpsState): Holding | undefined => (S.npsId ? d.byId<Holding>("holdings", S.npsId) : undefined) || d.live<Holding>("holdings").find((h) => h.type === "NPS" && h.nps);

export function npsHtml(d: MoneyData, S: NpsState): string | null {
  const h = npsHold(d, S); if (!h) return null; S.npsId = h.id;
  const n = npsCalc(d, h), x = n.x, N = n.N as typeof n.N & { pran?: string; contrib?: number; charges?: number; xirr?: number; pfm?: string; choice?: string; stmtDate?: string }, tab = S.npsTab || "overview";
  type Line = (typeof n.lines)[number] & { nm?: string; priceDate?: string; priceSrc?: string };
  const lines = n.lines as Line[];
  const head = `<div class="monthbar"><button class="btn sm" type="button" data-go="accounts" aria-label="Back to Accounts">‹</button><div class="m" style="text-align:left">NPS</div><span class="chip">Tier I</span></div>`;
  const acts = `<div class="btns epfacts"><button class="btn sm pri" type="button" data-na="add">Add contribution</button><button class="btn sm" type="button" data-na="units">Update from statement</button><button class="btn sm" type="button" data-na="edit">Assumptions</button></div>`;
  const hero = `<div class="hero epfh"><div class="lbl">NPS value</div><div class="big">${rs0(x.value)}</div>
    <div class="epfsub">${esc(N.pfm || "")}${N.choice ? ` · ${esc(N.choice)}` : ""}${N.pran ? ` · PRAN ${esc(N.pran)}` : ""}</div>
    <div class="hrow epfsplit">${lines.map((l) => `<div><div class="k">${esc(NPS_LBL[l.key] || l.key)}</div><div class="hv">${shortR(l.value)}</div></div>`).join("")}</div></div>`;
  const tile = (k: string, v: string, s = ""): string => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="ts">${s}</div>` : ""}</div>`;
  const tiles = `<div class="tiles t4 epft">${tile("Invested", shortR(x.inv), `${rs0(n.fyIn)} this year`)}${tile("Gain", (x.gain >= 0 ? "+" : "") + shortR(x.gain), `${x.pct.toFixed(1)}% on invested`)}${tile("Return (XIRR)", N.xirr ? N.xirr + "%" : "—", N.stmtDate ? `per statement, ${fmtD(d, N.stmtDate)}` : "")}${tile(`At ${n.at}`, n.corpus ? "≈ " + shortR(n.corpus) : "—", n.retYm ? mLabel(n.retYm) : "add date of birth")}</div>`;
  const TABS = [["overview", "Schemes"], ["entries", "Contributions"], ["projection", "Projection"]];
  const seg = `<div class="seg" role="group" aria-label="NPS sections" style="margin-top:16px">${TABS.map(([k, l]) => `<button type="button" data-nt="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div>`;
  const alloc = n.alloc as Record<string, number>;
  let body = "";
  if (tab === "overview") {
    const col: Record<string, string> = { E: "var(--v1)", C: "var(--v2)", G: "var(--v3)", A: "var(--v4)" };
    body = `<div class="card"><b>How it's split</b>
      <div class="stack" aria-hidden="true">${lines.map((l) => `<i style="flex:${(+(l.units ?? 0) || 0) * (+(l.price ?? 0) || 0)};background:${col[l.key] || "var(--v5)"}"></i>`).join("")}</div>
      <div class="kv" style="margin-top:12px">${lines.map((l) => `<span><i class="dot" style="background:${col[l.key] || "var(--v5)"}"></i>${esc(NPS_LBL[l.key] || l.key)}</span><b>${l.pct.toFixed(1)}% <span class="mut">· target ${alloc[l.key] ?? "—"}%</span></b>`).join("")}</div>
      <p class="cnote">${N.choice ? `${esc(N.choice)}: ` : ""}new money goes ${Object.entries(alloc).map(([k, p]) => `${p}% to ${k}`).join(", ")}. With life-cycle choice the equity share steps down as you get older.</p></div>
      <h2>Schemes</h2><div class="list">${lines.map((l) => `<div class="row"><div class="main"><div class="t">${esc(NPS_LBL[l.key] || l.nm)}</div><div class="s">${(+(l.units ?? 0)).toLocaleString("en-IN", { maximumFractionDigits: 4 })} units × ₹${(+(l.price ?? 0)).toFixed(4)} NAV${l.priceDate ? ` · ${fmtD(d, l.priceDate)}` : ""}${l.priceSrc ? ` · ${esc(l.priceSrc)}` : ""}</div></div><div class="amt">${rs0(l.value)}</div></div>`).join("")}
        ${x.atCost > 50 ? `<div class="row"><div class="main"><div class="t">Contributions since the statement</div><div class="s">Counted at the amount paid until you update the units</div></div><div class="amt">${rs0(x.atCost)}</div></div>` : ""}</div>
      <p class="note">NAVs update every day from NPS Trust once the price job is deployed. Units as of ${n.unitsAsOf ? fmtD(d, n.unitsAsOf) : "—"}.${N.charges ? ` Charges taken as units so far: ${rs0(N.charges)}.` : ""}</p>`;
  }
  if (tab === "entries") {
    const g = new Map<number, typeof n.entries>(); for (const t of n.entries) { const y = fyOf(t.date ?? ""); if (!g.has(y)) g.set(y, []); g.get(y)!.push(t); }
    body = n.entries.length ? [...g.entries()].map(([y, ts]) => `<h2>FY ${fyLbl(y)}<span class="sp"></span><span class="chip mute">${rs0(ts.reduce((a, t) => a + invNet(t), 0))}</span></h2><div class="list">${ts.map((t) => `<div class="row tap" data-tx="${esc(t.id)}" role="button" tabindex="0"><div class="main"><div class="t">Contribution</div><div class="s">${fmtD(d, t.date!)} · ${esc(accName(d, t.accountId))}</div></div><div class="amt">${rs0(invNet(t))}</div></div>`).join("")}</div>`).join("")
      + `<p class="note">Your NPS entries in Transactions. The statement says ${N.contrib ? rs0(N.contrib) : "—"} went in up to ${N.stmtDate ? fmtD(d, N.stmtDate) : "—"}; that is the invested figure used here.</p>`
      : `<div class="list"><div class="empty">No NPS entries yet.</div></div>`;
  }
  if (tab === "projection") {
    const nowFy = fyOf(d.today), ys = [nowFy, ...n.proj.map((p) => p[0])], v = [x.value, ...n.proj.map((p) => p[1])];
    const ser: Series[] = [{ name: "Projected", color: "var(--v2)", values: v.map((q) => q / 100), dash: true }];
    body = n.corpus ? `<div class="card epfcorp"><div class="k">Tentative NPS at ${n.at} · ${mLabel(n.retYm!)}</div><div class="big">≈ ${shortR(n.corpus)}</div><div class="s">${rs0(n.yearly)} a year, ${(n.ret * 100).toFixed(1)}% a year blended return</div></div>
      ${chartCard("Value by year", "", lineChart({ labels: ys.map(fyShort), ticks: ys.map(fyShort), full: ys.map((y) => `FY ${fyLbl(y)}`), series: ser, h: 200, fmt: (q) => shortR(q * 100), aria: "Projected NPS value to retirement" }), "")}
      <div class="card"><b>At ${n.at}</b><div class="kv"><span>Take as a lump sum (60%, tax-free)</span><b>≈ ${shortR(n.lump!)}</b><span>Buy an annuity (at least 40%)</span><b>≈ ${shortR(n.annuity!)}</b><span>Pension from the annuity (≈6% a year)</span><b>≈ ${rs0(n.pension!)}/month</b></div>
        <p class="cnote">A tentative figure. Returns assumed: E ${NPS_RET.E}%, C ${NPS_RET.C}%, G ${NPS_RET.G}% a year, weighted by your ${Object.entries(alloc).map(([k, p]) => `${p}% ${k}`).join(" / ")} split; the life-cycle shift to bonds later isn't modelled. Annuity rates vary.</p></div>`
      : `<div class="list"><div class="empty">Add your date of birth under Assumptions to see the projection.</div></div>`;
  }
  return head + hero + tiles + acts + seg + `<div class="epfb">${body}</div>`;
}

export const npsPage: Page = {
  html(d, h) {
    const x = npsHtml(d, h.state() as NpsState);
    if (x != null) return x;
    (h.state() as { view: string }).view = "accounts";   // no NPS: Accounts, as the planner does
    return accountsPage.html(d, h);
  },
  act(el, h, redraw) {
    const S = h.state() as unknown as NpsState;
    if (el.dataset.nt) { S.npsTab = el.dataset.nt; redraw(); return; }
    if (el.dataset.go) { h.go(el.dataset.go); return; }
    return false;   // add contribution, update from statement, assumptions, an entry: the planner's forms for now
  },
};
