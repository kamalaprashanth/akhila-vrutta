/**
 * The PPF page, as in KP Money Planner: the balance from the bank statement and your entries, then Overview,
 * Statement (by financial year) and Projection to maturity.
 */
import { esc } from "../../../core/dom.ts";
import type { MoneyData } from "../calc/data.ts";
import { ppfCalc, type Holding } from "../calc/invest.ts";
import { fmtD } from "../calc/plan.ts";
import { accountsPage, rs0, shortR } from "./accounts.ts";
import { barChart, chartCard, fmtMoney, legendHtml, lineChart, tableHtml, type Series } from "./charts.ts";
import type { Page } from "./pages.ts";

type Ppf = NonNullable<ReturnType<typeof ppfCalc>>;
type Row = Ppf["rows"][number] & { k: string; d: string; amt: number; src: string; id?: string; tid?: string; via?: string };
export interface PpfState { ppfId?: string; ppfTab?: string; ppfFy?: number }

const fyLbl = (y: number): string => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
const fyShort = (fy: number): string => `FY${String(fy + 1).slice(2)}`;
const fyOfD = (d: string): number => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 4 ? y : y - 1; };
export const ppfHold = (d: MoneyData, S: PpfState): Holding | undefined => (S.ppfId ? d.byId<Holding>("holdings", S.ppfId) : undefined) || d.live<Holding>("holdings").find((h) => h.type === "PPF" && h.ppf);

function ppfRowHtml(d: MoneyData, r: Row): string {
  const out = r.k === "wd";
  const title = r.k === "int" ? `Interest for FY ${fyLbl(fyOfD(r.d))}` : r.k === "dep" ? "Deposit" : "Withdrawal";
  const chip = r.src === "manual" ? '<span class="chip">Added by you</span>' : r.src === "txn" ? '<span class="chip mute">Your entry</span>' : "";
  const tap = r.src === "manual" ? ` tap" data-ppfm="${esc(r.id)}" role="button" tabindex="0` : r.src === "txn" ? ` tap" data-tx="${esc(r.tid)}" role="button" tabindex="0` : "";
  return `<div class="row epr${tap}"><div class="main"><div class="t">${esc(title)} ${chip}</div><div class="s">${fmtD(d, r.d)}${r.via && r.src === "stmt" ? ` · ${esc(r.via)}` : ""}</div></div><div class="amt ${out ? "" : "in"}">${out ? "−" : "+"}${rs0(r.amt)}</div></div>`;
}

export function ppfHtml(d: MoneyData, S: PpfState): string | null {
  const h = ppfHold(d, S); if (!h) return null; S.ppfId = h.id;
  const p = ppfCalc(d, h); if (!p) return null;
  const P = h.ppf as NonNullable<Holding["ppf"]> & { bank?: string; acct?: string }, tab = S.ppfTab || "overview";
  const rows = p.rows as Row[];
  const head = `<div class="monthbar"><button class="btn sm" type="button" data-go="accounts" aria-label="Back to Accounts">‹</button><div class="m" style="text-align:left">PPF</div><span class="chip">Public Provident Fund</span></div>`;
  const acts = `<div class="btns epfacts"><button class="btn sm pri" type="button" data-pa="add">Add entry</button><button class="btn sm" type="button" data-pa="edit">Assumptions</button></div>`;
  const hero = `<div class="hero epfh"><div class="lbl">PPF balance</div><div class="big">${rs0(p.bal)}</div>
    <div class="epfsub">${esc(P.bank || "")}${P.acct ? ` · account ${esc(P.acct)}` : ""} · statement to ${fmtD(d, p.sd)}${rows.some((r) => r.src !== "stmt") ? " + your entries" : ""}</div>
    <div class="hrow epfsplit"><div><div class="k">Year ${Math.min(p.idx, 15)} of 15</div><div class="hv">${p.idx > 15 ? "Extended" : "Running"}</div></div><div><div class="k">Matures</div><div class="hv">${fmtD(d, p.matures)}</div></div><div><div class="k">Rate</div><div class="hv">${(p.rate * 100).toFixed(2)}%</div></div></div></div>`;
  const tile = (k: string, v: string, s = ""): string => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="ts">${s}</div>` : ""}</div>`;
  const tiles = `<div class="tiles t4 epft">${tile("Deposited", shortR(p.inv), `${rs0(p.fyDepNow)} this year (limit ₹1.5L)`)}${tile("Interest earned", shortR(p.int), `${p.inv > 0 ? (p.int / p.inv * 100).toFixed(1) : "0"}% on deposits`)}${tile("This year's interest", "≈ " + shortR(p.accrued), "credited on 31 Mar")}${tile("At maturity", p.mv ? "≈ " + shortR(p.mv) : "—", p.mv ? `${rs0(p.yearly)} a year` : "")}</div>`;
  const TABS = [["overview", "Overview"], ["statement", "Statement"], ["projection", "Projection"]];
  const seg = `<div class="seg" role="group" aria-label="PPF sections" style="margin-top:16px">${TABS.map(([k, l]) => `<button type="button" data-pt2="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div>`;
  let body = "";
  const fys: number[] = []; for (let y = p.fy0; y <= p.fyNow; y++) fys.push(y);
  const R = (a: (number | null)[]): (number | null)[] => a.map((v) => (v == null ? null : v / 100));
  if (tab === "overview") {
    const parts: [string, number, string][] = [["Deposits", p.dep, "var(--v1)"], ["Interest", p.int, "var(--v3)"]], tot = p.dep + p.int || 1;
    const depv = fys.map((y) => rows.filter((r) => r.k === "dep" && fyOfD(r.d) === y).reduce((a, r) => a + r.amt, 0)), intv = fys.map((y) => rows.filter((r) => r.k === "int" && fyOfD(r.d) === y).reduce((a, r) => a + r.amt, 0));
    const ser: Series[] = [{ name: "Deposits", color: "var(--v1)", values: R(depv) }, { name: "Interest", color: "var(--v3)", values: R(intv) }];
    body = `<div class="card"><b>Where the balance came from</b><div class="stack" aria-hidden="true">${parts.map(([, v, c]) => `<i style="flex:${v / tot};background:${c}"></i>`).join("")}</div>
      <div class="kv" style="margin-top:12px">${parts.map(([l, v, c]) => `<span><i class="dot" style="background:${c}"></i>${l}</span><b>${rs0(v)}</b>`).join("")}${p.wd ? `<span>Withdrawn</span><b>${rs0(-p.wd)}</b>` : ""}<span class="tot">Balance</span><b class="tot">${rs0(p.bal)}</b></div></div>
      ${chartCard("Added each year", `${shortR(p.dep)} deposited · ${shortR(p.int)} interest`, barChart({ labels: fys.map(fyShort), ticks: fys.map(fyShort), full: fys.map((y) => `FY ${fyLbl(y)}`), series: ser, stack: true, h: 200, aria: "PPF deposits and interest in each financial year", foot: (i) => `Total ${rs0(depv[i]! + intv[i]!)}` }), legendHtml(ser) + tableHtml(fys.map((y) => "FY " + fyLbl(y)), ser, fmtMoney, true))}
      <div class="card"><b>Rules that apply now</b><div class="kv">
        <span>Deposit this year</span><b>${rs0(p.fyDepNow)} of ₹1,50,000</b>
        <span>Minimum to keep it active</span><b>₹500 a year ${p.fyDepNow >= 50000 ? "✓" : "· still due"}</b>
        <span>Partial withdrawal (year ${p.idx})</span><b>${p.wdOk ? `up to ${rs0(p.wdMax)}` : `from FY ${fyLbl(p.fy0 + 6)}`}</b>
        ${p.loanOk ? `<span>Loan against PPF</span><b>up to ${rs0(p.loanMax)}</b>` : ""}
        <span>Matures</span><b>${fmtD(d, p.matures)}</b></div>
        <p class="cnote">From the 7th financial year you can withdraw once a year, up to half of the lower of the balance at the end of the 4th year before and of last year. Deposits up to ₹1.5 lakh a year count under 80C, and interest and maturity are tax-free. At maturity you can take it all, or extend in 5-year blocks with or without deposits.</p></div>`;
  }
  if (tab === "statement") {
    const fy = fys.includes(S.ppfFy!) ? S.ppfFy! : p.fyNow, rs = rows.filter((r) => fyOfD(r.d) === fy).slice().reverse();
    const open = fy === p.fy0 ? 0 : (p.fyEnd.get(fy - 1) ?? null), dd = rs.filter((r) => r.k === "dep").reduce((a, r) => a + r.amt, 0), i = rs.filter((r) => r.k === "int").reduce((a, r) => a + r.amt, 0), close = fy === p.fyNow ? p.bal : p.fyEnd.get(fy);
    body = `<div class="fychips" role="group" aria-label="Financial year">${fys.slice().reverse().map((y) => `<button type="button" class="chip fchip ${y === fy ? "" : "mute"}" data-pfy="${y}" aria-pressed="${y === fy}">FY ${fyLbl(y)}</button>`).join("")}</div>
      <div class="kp3 epfk"><div class="tile"><div class="k">Opening</div><div class="v">${open != null ? shortR(open) : "—"}</div></div><div class="tile"><div class="k">Deposited</div><div class="v">${shortR(dd)}</div></div><div class="tile"><div class="k">${fy === p.fyNow ? "Interest so far ≈" : "Interest"}</div><div class="v">${shortR(fy === p.fyNow && !i ? p.accrued : i)}</div></div><div class="tile"><div class="k">${fy === p.fyNow ? "Balance now" : "Closing"}</div><div class="v">${close != null ? shortR(close) : "—"}</div></div></div>
      <div class="list" style="margin-top:12px">${rs.length ? rs.map((r) => ppfRowHtml(d, r)).join("") : '<div class="empty">No entries this year.</div>'}</div>
      <p class="note">From your SBI statement up to ${fmtD(d, p.sd)}. Deposits after that come from your PPF entries in Transactions; interest and withdrawals you add here.</p>`;
  }
  if (tab === "projection") {
    const proj = p.proj as [number, number][];
    const projAt = new Map(proj), last = proj.length ? proj[proj.length - 1]![0] : p.fyNow, all: number[] = []; for (let y = p.fy0; y <= Math.max(last, p.fyNow); y++) all.push(y);
    const act = all.map((y) => (y < p.fyNow ? (p.fyEnd.get(y) ?? null) : y === p.fyNow ? p.bal : null)), prj = all.map((y) => (y === p.fyNow ? p.bal : y > p.fyNow ? (projAt.get(y) ?? null) : null));
    const ser: Series[] = [{ name: "Statement", color: "var(--v1)", values: R(act) }, { name: "Projected", color: "var(--v2)", values: R(prj), dash: true }];
    const alt = (yr: number, rt: number): number => { const c = ppfCalc(d, { ...h, yearly: yr, rate: rt }); return (c && c.mv) || 0; };
    body = p.mv ? `<div class="card epfcorp"><div class="k">Tentative PPF at maturity · ${fmtD(d, p.matures)}</div><div class="big">≈ ${shortR(p.mv)}</div><div class="s">with ${rs0(p.yearly)} a year and ${(p.rate * 100).toFixed(2)}% interest · tax-free</div></div>
      ${chartCard("Balance by year", "", lineChart({ labels: all.map(fyShort), ticks: all.map(fyShort), full: all.map((y) => `FY ${fyLbl(y)}`), series: ser, h: 210, mark: all.indexOf(p.fyNow), markLabel: "Now", fmt: (v) => shortR(v * 100), aria: "PPF balance at the end of each financial year, from your statement and projected to maturity" }), legendHtml(ser))}
      <div class="card"><b>What if</b><div class="kv"><span>₹1,50,000 a year (the maximum)</span><b>≈ ${shortR(alt(15000000, p.rate * 100))}</b><span>₹50,000 a year</span><b>≈ ${shortR(alt(5000000, p.rate * 100))}</b><span>Rate falls to 6.5%</span><b>≈ ${shortR(alt(p.yearly, 6.5))}</b></div></div>
      <div class="card"><b>Assumptions</b><div class="kv"><span>Deposits</span><b>${rs0(p.yearly)} a year${+(h.yearly ?? 0) > 0 ? "" : " (last 12 months)"}</b><span>Interest</span><b>${(p.rate * 100).toFixed(2)}% (today's rate, every year)</b></div><div class="btns" style="margin-top:8px"><button class="btn sm" type="button" data-pa="edit">Change</button></div></div>`
      : `<div class="list"><div class="empty">The account has matured. You can extend it in 5-year blocks.</div></div>`;
  }
  return head + hero + tiles + acts + seg + `<div class="epfb">${body}</div>`;
}

export const ppfPage: Page = {
  html(d, h) {
    const x = ppfHtml(d, h.state() as PpfState);
    if (x != null) return x;
    (h.state() as { view: string }).view = "accounts";   // no PPF: Accounts, as the planner does
    return accountsPage.html(d, h);
  },
  act(el, h, redraw) {
    const S = h.state() as unknown as PpfState;
    if (el.dataset.pt2) { S.ppfTab = el.dataset.pt2; redraw(); return; }
    if (el.dataset.pfy) { S.ppfFy = +el.dataset.pfy; redraw(); return; }
    if (el.dataset.go) { h.go(el.dataset.go); return; }
    return false;   // add entry, assumptions, an entry: the planner's forms for now
  },
};
