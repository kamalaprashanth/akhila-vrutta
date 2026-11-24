/**
 * The EPF page, as in KP Money Planner: the balance and its shares, then Overview (where it came from, each
 * year's additions, member IDs), Passbook (by financial year), Projection and Pension.
 */
import { esc } from "../../../core/dom.ts";
import { dLabel, diffM, mLabel, ymOf } from "../calc/dates.ts";
import type { MoneyData, Paise } from "../calc/data.ts";
import { epfCalc, type Holding } from "../calc/invest.ts";
import { fmtD } from "../calc/plan.ts";
import { rs0, short, shortR } from "./accounts.ts";
import { barChart, chartCard, fmtMoney, legendHtml, lineChart, tableHtml, type Series } from "./charts.ts";
import type { Page } from "./pages.ts";
import { accountsPage } from "./accounts.ts";

type Epf = NonNullable<ReturnType<typeof epfCalc>>;
type Row = Epf["rows"][number] & { k: string; wm?: string; d?: string; from?: string; note?: string; manual?: boolean; mid?: string; internal?: boolean; fy: number };
export interface EpfState { epfId?: string; epfTab?: string; epfFy?: number }

const fyLbl = (y: number): string => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
const fyShort = (fy: number): string => `FY${String(fy + 1).slice(2)}`;
const svcTxt = (m: number): string => { const y = Math.floor(m / 12), r = m % 12; return `${y} yr${y === 1 ? "" : "s"}${r ? ` ${r} mo` : ""}`; };
export function titleCase(s: unknown): string { return String(s || "").split(/\s+/).map((w) => (/^[A-Z]{2,3}$/.test(w) && !/^(OF|AND|THE|FOR)$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(" ").replace(/\b(Of|And|The|For)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase()); }
const EPF_KIND: Record<string, string> = { cont: "Contribution", ipr: "Back-period credit", tin: "Transfer in", tout: "Moved to new account", wd: "Withdrawal", exp: "Expected", int: "Interest" };
export const epfHold = (d: MoneyData, S: EpfState): Holding | undefined => (S.epfId ? d.byId<Holding>("holdings", S.epfId) : undefined) || d.live<Holding>("holdings").find((h) => h.type === "EPF" && h.epf);

function epfEntryRows(e: Epf, fy: number): Row[] {
  const nowFy = e.fyNow;
  return (e.rows as Row[]).filter((r) => r.fy === fy).concat(fy === nowFy ? (e.expected as Row[]).map((r) => ({ ...r, fy })) : []).concat((e.ints as Row[]).filter((x) => x.fy === fy).map((x) => ({ ...x, k: "int" })))
    .sort((a, b) => (b.d || "").localeCompare(a.d || "") || (a.k === "int" ? -1 : 1));
}
function epfRowHtml(d: MoneyData, r: Row): string {
  const out = r.k === "wd" || r.k === "tout", amt = r.emp + r.er;
  const title = r.k === "int" ? `Interest for FY ${fyLbl(r.fy)}` : r.k === "cont" || r.k === "exp" ? `${mLabel(r.wm ?? "")} contribution` : r.k === "tin" ? `Transfer in${r.from ? ` from …${r.from.slice(-5)}` : ""}` : r.k === "tout" ? "Moved to your new account" : r.k === "wd" ? "Withdrawal" : EPF_KIND[r.k] || "Entry";
  const parts = [r.d ? (r.k === "exp" ? `Due around ${dLabel(r.d)}` : `Credited ${fmtD(d, r.d)}`) : "", `You ${rs0(r.emp)}`, `Employer ${rs0(r.er)}`, r.eps ? `EPS ${rs0(r.eps)}` : ""].filter(Boolean);
  const chip = r.k === "exp" ? '<span class="chip mute">Expected</span>' : r.manual ? '<span class="chip">Added by you</span>' : r.k === "wd" ? `<span class="chip bad">${esc(r.note || "Claim")}</span>` : r.k === "tin" && r.internal ? '<span class="chip mute">Same money</span>' : "";
  const tap = r.manual ? ` tap" data-epfm="${esc(r.mid)}" role="button" tabindex="0` : "";
  return `<div class="row epr${r.k === "exp" ? " exp" : ""}${tap}"><div class="main"><div class="t">${esc(title)} ${chip}</div><div class="s">${parts.map(esc).join(" · ")}</div></div><div class="amt ${out ? "" : "in"}">${out ? "−" : "+"}${rs0(amt)}</div></div>`;
}

export function epfHtml(d: MoneyData, S: EpfState): string | null {
  const h = epfHold(d, S); if (!h) return null;
  S.epfId = h.id;
  const e = epfCalc(d, h), tab = S.epfTab || "overview";
  const head = `<div class="monthbar"><button class="btn sm" type="button" data-go="accounts" aria-label="Back to Accounts">‹</button><div class="m" style="text-align:left">EPF</div><span class="chip">Provident fund</span></div>`;
  const acts = `<div class="btns epfacts"><button class="btn sm pri" type="button" data-ea="add">Add entry</button><button class="btn sm" type="button" data-ea="pdf">Load passbooks</button><button class="btn sm" type="button" data-ea="edit">Assumptions</button><input type="file" id="epfPdfV" accept="application/pdf,.pdf" multiple hidden></div>`;
  if (!e) return head + `<div class="list"><div class="empty">Load your EPF passbooks (PDFs from the EPFO member passbook site) or add entries by hand to see your EPF here.</div></div>` + acts;
  const E = h.epf!, acc = e.accs[e.accs.length - 1], gain = e.value - e.inv;
  const manual = e.manual as Row[], expected = e.expected as Row[];
  const hero = `<div class="hero epfh">
    <div class="lbl">EPF balance</div>
    <div class="big">${rs0(e.value)}</div>
    <div class="epfsub">${expected.length ? `Includes ${expected.length} expected month${expected.length > 1 ? "s" : ""} · ` : ""}last credit ${e.lastWm ? mLabel(e.lastWm) : "—"}${acc ? ` · ${esc(titleCase(acc.est.split(" ").slice(0, 3).join(" ")))}` : ""}</div>
    <div class="hrow epfsplit">
      <div><div class="k">Your share</div><div class="hv">${shortR(e.accs.reduce((a, x) => a + x.emp, 0) + manual.reduce((a, r) => a + (r.k === "wd" ? -1 : 1) * r.emp, 0) + expected.reduce((a, r) => a + r.emp, 0))}</div></div>
      <div><div class="k">Employer's share</div><div class="hv">${shortR(e.accs.reduce((a, x) => a + x.er, 0) + manual.reduce((a, r) => a + (r.k === "wd" ? -1 : 1) * r.er, 0) + expected.reduce((a, r) => a + r.er, 0))}</div></div>
      <div><div class="k">Pension (EPS)</div><div class="hv">${shortR(e.epsBal + e.expEps)}</div></div>
    </div></div>`;
  const tile = (k: string, v: string, s = ""): string => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="ts">${s}</div>` : ""}</div>`;
  const tiles = `<div class="tiles t4 epft">${tile("Invested", shortR(e.inv), "you + employer − withdrawals")}${tile("Interest earned", shortR(e.interest), `${e.inv > 0 ? ((gain / e.inv) * 100).toFixed(1) : "0"}% on invested`)}${tile("This year's interest", "≈ " + shortR(e.accrued), "credited after 31 Mar")}${tile(`At ${e.age}`, e.corpus ? "≈ " + shortR(e.corpus) : "—", e.retYm ? mLabel(e.retYm) : "add date of birth")}</div>`;
  const TABS = [["overview", "Overview"], ["passbook", "Passbook"], ["projection", "Projection"], ["pension", "Pension"]];
  const seg = `<div class="seg" role="group" aria-label="EPF sections" style="margin-top:16px">${TABS.map(([k, l]) => `<button type="button" data-et="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div>`;
  const rows = e.rows as Row[], ints = e.ints as Row[];
  let body = "";
  if (tab === "overview") {
    const parts: [string, Paise, string][] = [["Your contributions", e.contEmp, "var(--v1)"], ["Employer's contributions", e.contEr, "var(--v2)"], ["Interest", e.interest, "var(--v3)"]];
    const tot = parts.reduce((a, p) => a + p[1], 0) || 1;
    const comp = `<div class="card"><b>Where the balance came from</b>
      <div class="stack" aria-hidden="true">${parts.map(([, v, c]) => `<i style="flex:${Math.max(v, 0) / tot};background:${c}"></i>`).join("")}</div>
      <div class="kv" style="margin-top:12px">${parts.map(([l, v, c]) => `<span><i class="dot" style="background:${c}"></i>${l}</span><b>${rs0(v)}</b>`).join("")}
      ${e.tinExt ? `<span>Moved in from accounts not loaded</span><b>${rs0(e.tinExt)}</b>` : ""}
      ${e.wd ? `<span>Withdrawn</span><b>${rs0(-e.wd)}</b>` : ""}
      ${e.expAmt ? `<span>Expected months</span><b>${rs0(e.expAmt)}</b>` : ""}
      <span class="tot">Balance</span><b class="tot">${rs0(e.value)}</b></div></div>`;
    const pfys = [...new Set([...rows.map((r) => r.fy), ...ints.map((x) => x.fy)])].sort((a, b) => a - b);
    const by = (f: (r: Row) => boolean, k: "emp" | "er"): number[] => pfys.map((y) => rows.filter((r) => r.fy === y && f(r)).reduce((a, r) => a + r[k], 0));
    const isC = (r: Row): boolean => r.k === "cont" || r.k === "ipr" || (r.k === "tin" && !r.internal);
    const you = by(isC, "emp"), er = by(isC, "er"), intr = pfys.map((y) => ints.filter((x) => x.fy === y).reduce((a, x) => a + x.emp + x.er, 0)), wdE = by((r) => r.k === "wd", "emp"), wdR = by((r) => r.k === "wd", "er"), wdv = pfys.map((_, i) => -(wdE[i]! + wdR[i]!));
    const R = (a: number[]): number[] => a.map((v) => v / 100);
    const ser: Series[] = [{ name: "Your share", color: "var(--v1)", values: R(you) }, { name: "Employer", color: "var(--v2)", values: R(er) }, { name: "Interest", color: "var(--v3)", values: R(intr) }];
    if (wdv.some((v) => v < 0)) ser.push({ name: "Withdrawn", color: "var(--v4)", values: R(wdv) });
    const chart = chartCard("Added each year", `${shortR(e.contEmp + e.contEr)} paid in · ${shortR(e.interest)} interest`, barChart({ labels: pfys.map(fyShort), ticks: pfys.map(fyShort), full: pfys.map((y) => `FY ${fyLbl(y)}`), series: ser, stack: true, h: 210, aria: "Contributions, interest and withdrawals in each financial year", foot: (i) => `Net ${rs0(you[i]! + er[i]! + intr[i]! + wdv[i]!)}` }), legendHtml(ser) + tableHtml(pfys.map((y) => "FY " + fyLbl(y)), ser, fmtMoney, true));
    const accts = `<h2>Member IDs</h2><div class="list">${e.accs.map((a) => `<div class="row"><div class="main"><div class="t">${esc(titleCase(a.est))}</div><div class="s">${esc(a.acc)} · FY ${fyLbl(a.first).slice(0, 4)}–${String(a.last + 1)}${a.emp + a.er > 50 ? "" : " · moved to the next account"}</div></div><div class="amt">${rs0(a.emp + a.er)}</div></div>`).join("")}</div>`;
    const wds = rows.filter((r) => r.k === "wd");
    body = comp + chart + (wds.length ? `<h2>Withdrawals</h2><div class="list">${wds.map((r) => epfRowHtml(d, r)).join("")}</div>` : "") + accts
      + (e.issues.length ? `<div class="banner">${e.issues.map(esc).join("<br>")}</div>` : `<p class="note">Every loaded passbook adds up to its closing balance.</p>`);
  }
  if (tab === "passbook") {
    const fys = [...new Set([...rows.map((r) => r.fy), ...ints.map((x) => x.fy), e.fyNow])].sort((a, b) => b - a);
    const fy = fys.includes(S.epfFy!) ? S.epfFy! : fys[0]!;
    const er = epfEntryRows(e, fy), open = e.fyEnd.get(fy - 1) ?? null;
    const paidIn = er.filter((r) => r.k === "cont" || r.k === "ipr" || r.k === "exp").reduce((a, r) => a + r.emp + r.er, 0), intr = er.filter((r) => r.k === "int").reduce((a, r) => a + r.emp + r.er, 0), wd = er.filter((r) => r.k === "wd").reduce((a, r) => a + r.emp + r.er, 0);
    const close = fy === e.fyNow ? e.value : e.fyEnd.get(fy);
    body = `<div class="fychips" role="group" aria-label="Financial year">${fys.map((y) => `<button type="button" class="chip fchip ${y === fy ? "" : "mute"}" data-efy="${y}" aria-pressed="${y === fy}">FY ${fyLbl(y)}</button>`).join("")}</div>
      <div class="kp3 epfk"><div class="tile"><div class="k">Opening</div><div class="v">${open != null ? shortR(open) : "—"}</div></div><div class="tile"><div class="k">Paid in</div><div class="v">${shortR(paidIn)}</div></div><div class="tile"><div class="k">${fy === e.fyNow ? "Interest so far ≈" : "Interest"}</div><div class="v">${shortR(fy === e.fyNow && !intr ? e.accrued : intr)}</div></div><div class="tile"><div class="k">${fy === e.fyNow ? "Balance now" : "Closing"}</div><div class="v">${close != null ? shortR(close) : "—"}</div></div></div>
      ${wd ? `<p class="note">Withdrawn this year: ${rs0(wd)}.</p>` : ""}
      <div class="list" style="margin-top:12px">${er.length ? er.map((r) => epfRowHtml(d, r)).join("") : '<div class="empty">No entries for this year.</div>'}</div>
      <p class="note">${fy === e.fyNow ? "Interest for this year is credited after 31 March. " : ""}Expected months are replaced when a newer passbook is loaded or you add the month yourself. Entries you added can be tapped to change.</p>`;
  }
  if (tab === "projection") {
    const nowFy = e.fyNow, firstFy = Math.min(...(e.fyEnd.size ? e.fyEnd.keys() : [nowFy]));
    const projAt = new Map((e.proj as [string, number][]).map(([dd, v]) => { const y = +dd.slice(0, 4), m = +dd.slice(5, 7); return [m >= 4 ? y : y - 1, v]; }));
    const lastFy = Math.max(nowFy, ...projAt.keys()), fys: number[] = []; for (let y = firstFy; y <= lastFy; y++) fys.push(y);
    const act = fys.map((y) => (y < nowFy ? (e.fyEnd.get(y) ?? null) : y === nowFy ? e.value : null)), prj = fys.map((y) => (y === nowFy ? e.value : y > nowFy ? (projAt.get(y) ?? null) : null));
    const R = (a: (number | null)[]): (number | null)[] => a.map((v) => (v == null ? null : v / 100));
    const ser: Series[] = [{ name: "Passbook", color: "var(--v1)", values: R(act) }, { name: "Projected", color: "var(--v2)", values: R(prj), dash: true }];
    const alt = (o: Record<string, number>): number | null | undefined => { const c = epfCalc(d, { epf: { ...E, ...o } } as Holding); return c && c.corpus; };
    const sc = ([["Interest falls to 7.5%", alt({ rate: 7.5 })], [`Contribution grows ${(+(E.raise ?? 0) || 0) + 5}% a year`, alt({ raise: (+(E.raise ?? 0) || 0) + 5 })], [`Retire at ${(+(E.retireAge ?? 0) || 58) - 3}`, alt({ retireAge: (+(E.retireAge ?? 0) || 58) - 3 })]] as [string, number | null | undefined][]).filter(([, v]) => v);
    const yrs = e.retYm ? diffM(ymOf(d.today), e.retYm) / 12 : 0;
    body = e.corpus ? `<div class="card epfcorp"><div class="k">Tentative EPF at ${e.age} · ${mLabel(e.retYm!)}</div><div class="big">≈ ${shortR(e.corpus)}</div><div class="s">≈ ${shortR(e.corpus / Math.pow(1.06, yrs))} in today's money (6% inflation) · ${yrs.toFixed(0)} years away</div></div>
      ${chartCard("Balance by year", "", lineChart({ labels: fys.map(fyShort), ticks: fys.map(fyShort), full: fys.map((y) => `FY ${fyLbl(y)}`), series: ser, h: 220, mark: fys.indexOf(nowFy), markLabel: "Now", fmt: (v) => short(v * 100), aria: "EPF balance at the end of each financial year, from your passbooks and projected to retirement" }), legendHtml(ser))}
      <div class="card"><b>What if</b><div class="kv">${sc.map(([l, v]) => `<span>${esc(l)}</span><b>≈ ${shortR(v!)}</b>`).join("")}</div></div>
      <div class="card"><b>Assumptions</b><div class="kv"><span>Interest rate</span><b>${(e.rate * 100).toFixed(2)}% a year</b><span>Going in each month</span><b>${rs0(e.mon.emp + e.mon.er)}${E.raise ? `, +${E.raise}% a year` : ", no raises"}</b><span>Retire at</span><b>${e.age}</b></div>
        <p class="cnote">No withdrawals or job gaps. Interest is worked out the way EPFO does it: on each month's opening balance, credited every 31 March.</p>
        <div class="btns" style="margin-top:8px"><button class="btn sm" type="button" data-ea="edit">Change assumptions</button></div></div>
      <div class="card"><b>Taking money out</b><div class="kv"><span>Partial withdrawal now (75%)</span><b>up to ${rs0(e.partial)}</b><span>After leaving a job: at once</span><b>up to ${rs0(e.epfBal * .75)}</b><span>…the rest after 12 months without work</span><b>${rs0(e.epfBal * .25)}</b><span>At ${e.age}</span><b>all of it, tax-free</b></div>
        <p class="cnote">EPFO's rules from October 2025: with 12 months of service you can take out up to 75% of the balance; 25% stays. Tax-free because your service has been continuous for more than 5 years. Check the EPFO portal before you apply.</p></div>`
      : `<div class="list"><div class="empty">Add your date of birth under Assumptions to see the projection.</div></div>`;
  }
  if (tab === "pension") {
    const p = e.pension;
    body = `<div class="card epfcorp"><div class="k">Tentative pension from ${e.age}</div><div class="big">${p ? `≈ ${rs0(p)}<small>/month</small>` : "Needs 10 years"}</div><div class="s">${p && e.sal > 1500000 ? `≈ ${rs0(e.pensionLow!)}/month if the old ₹15,000 cap applies to your earlier service` : ""}</div></div>
      <div class="tiles t4 epft">${tile("Pension balance", shortR(e.epsBal + e.expEps), "not in net worth")}${tile("Service so far", svcTxt(e.svcNow), "months with EPS")}${tile(`Service at ${e.age}`, svcTxt(e.svcAt58), e.bonus ? "+ 2 bonus years" : "")}${tile("Salary for pension", rs0(e.sal), "EPS ceiling")}</div>
      ${e.epsLeft.length ? `<div class="banner" style="margin-top:12px">${e.epsLeft.map((a) => `${rs0(a.eps)} of pension money is still in your old account (${esc(titleCase(a.est.split(" ").slice(0, 3).join(" ")))}, ${esc(a.acc)}). It wasn't moved when the EPF was transferred.`).join(" ")} Ask EPFO or your employer to transfer it so the service counts together.</div>` : ""}
      <h2>Pension balance by account</h2><div class="list">${e.accs.map((a) => `<div class="row"><div class="main"><div class="t">${esc(titleCase(a.est))}</div><div class="s">${esc(a.acc)}</div></div><div class="amt">${rs0(a.eps)}</div></div>`).join("")}</div>
      <p class="note">Estimate: average pensionable salary of the last 60 months × years of service ÷ 70, with service capped at 35 years (2 bonus years after 20). Only months with a pension contribution count. The ₹25,000 ceiling started on 17 Sep 2026; how it applies to earlier service isn't settled yet.</p>`;
  }
  return head + hero + tiles + acts + seg + `<div class="epfb">${body}</div>`;
}

export const epfPage: Page = {
  html(d, h) {
    const x = epfHtml(d, h.state() as EpfState);
    if (x != null) return x;
    (h.state() as { view: string }).view = "accounts";   // no EPF: Accounts, as the planner does
    return accountsPage.html(d, h);
  },
  act(el, h, redraw) {
    const S = h.state() as unknown as EpfState;
    if (el.dataset.et) { S.epfTab = el.dataset.et; redraw(); return; }
    if (el.dataset.efy) { S.epfFy = +el.dataset.efy; redraw(); return; }
    if (el.dataset.go) { h.go(el.dataset.go); return; }
    if (el.dataset.ea === "pdf") { el.closest("#view")?.querySelector<HTMLInputElement>("#epfPdfV")?.click(); return; }
    return false;   // add entry, assumptions, an entry you added: the planner's forms for now
  },
  change(el, h) {
    if (el.id === "epfPdfV") { h.plannerFiles("epfPdf", [...(el.files ?? [])]); el.value = ""; return; }
    return false;
  },
};
