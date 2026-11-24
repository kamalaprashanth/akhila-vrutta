/**
 * A property's page, as in KP Money Planner: Overview (what it cost, who paid, where the money went),
 * Payments, Expected (the payment plan and its fund) and Loan.
 */
import { esc } from "../../../core/dom.ts";
import { diffM, mLabel, ymOf } from "../calc/dates.ts";
import { num, type Loan, type MoneyData } from "../calc/data.ts";
import { loanSum } from "../calc/loans.ts";
import { accName, fmtD, rateTxt } from "../calc/plan.ts";
import { PG, pcHow, pcOf, propCalc, propCats, propFundHeld, propFundNeed, propNwAt, type PlanRow, type Property } from "../calc/properties.ts";
import { money } from "./txlist.ts";
import { accountsPage, PROP_ST, rs0, short, shortR } from "./accounts.ts";
import type { Page } from "./pages.ts";
import { propPlanLoad, propStmtLoad } from "../ui/propforms.ts";

export interface PropState { propId?: string; propTab?: string; accTab?: string }
type P = Property & { kind?: string; place?: string; note?: string };
const PROP_KIND: Record<string, string> = { plot: "Plot", flat: "Flat", house: "House / villa", land: "Land", other: "Other" };
const PG_TAG: Record<string, string> = { cost: "in cost", sep: "separate", off: "separate · not for tax", int: "interest" };
type LoanN = Loan & { name?: string; lender?: string };

function propPlanTab(d: MoneyData, p: Property): string {
  const rows = (p.plan || []), f = p.fund || {}, need = propFundNeed(d, p);
  const grp = ([["Dated", rows.filter((r) => !r.done && r.when && r.when.length === 10)], ["Expected around a month", rows.filter((r) => !r.done && r.when && r.when.length === 7)], ["Not dated yet", rows.filter((r) => !r.done && !r.when)], ["Done", rows.filter((r) => r.done)]] as [string, PlanRow[]][]).filter(([, L]) => L.length);
  const line = (r: PlanRow): string => { const t = num(r.amt) + num(r.gst);
    return `<div class="row tap" data-pplan="${esc(r.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(r.name)} ${r.status === "estimate" ? '<span class="pill">estimate</span>' : ""}${r.done ? '<span class="pill good">paid</span>' : ""}</div>
      <div class="s">${r.when ? (r.when.length === 10 ? fmtD(d, r.when) : `around ${mLabel(r.when)}`) : "not dated"}${num(r.gst) ? ` · incl. GST ${money(num(r.gst))}` : ""}${r.tds ? ` · +1% TDS ${money(t * 0.01)}` : ""} · ${r.who === "bank" ? "bank pays" : r.who === "you" ? "you pay" : "bank / you"}</div></div><div class="amt">${money(t)}</div></div>`; };
  const monthly = f.by ? Math.ceil(Math.max(0, need - propFundHeld(d, p)) / 100 / Math.max(1, diffM(ymOf(d.today), f.by))) * 100 : 0;
  return `<div class="card"><b>What's still to come</b><div class="kv" style="margin-top:8px">
      <span>Still to pay in all</span><b>${money(rows.filter((r) => !r.done).reduce((s, r) => s + num(r.amt) + num(r.gst), 0))}</b>
      <span>Your share (bank lends ${f.ltv ?? 75}%)</span><b>${money(need)}</b>
      <span>Fund: have it ready by</span><b>${f.by ? mLabel(f.by) : "not set"}</b>${f.by ? `<span>Put aside each month</span><b>${money(monthly)}</b>` : ""}</div>
      <div class="btns" style="margin-top:12px"><button class="btn sm pri" type="button" data-pact="planadd">+ Expected payment</button><button class="btn sm" type="button" data-pact="planpdf">Load payment plan (PDF)</button><button class="btn sm" type="button" data-pact="planest">Add usual costs</button><button class="btn sm" type="button" data-pact="planfund">Fund settings</button></div>
      <input type="file" id="planPdf" accept="application/pdf,.pdf" hidden></div>
    <input class="lsearch" type="search" data-lsearch placeholder="Search expected payments" aria-label="Search this list" autocomplete="off">
    ${grp.map(([hd, L]) => `<div class="sh"><h3>${hd}</h3><span class="note" style="margin:0">${money(L.reduce((s, r) => s + num(r.amt) + num(r.gst), 0))}</span></div><div class="list">${L.map(line).join("")}</div>`).join("") || '<div class="list"><div class="empty">Nothing expected yet. Load the payment plan from your agreement, or add payments one by one.</div></div>'}
    <p class="note">When a builder demand arrives, tap its row and choose "Demand received": give the date and how much the bank pays. Your share goes on Pay by Tuesday, and the 1% TDS (Form 26QB, due within 30 days after the month you pay) is added for you once it's paid.</p>`;
}

export function propHtml(d: MoneyData, S: PropState): string | null {
  const p = S.propId ? d.byId<P>("props", S.propId) : undefined;
  if (!p || p.deleted) return null;
  const c = propCalc(d, p), I = c.I, tab = S.propTab || "overview";
  const IL = I.l as LoanN | null;
  const head = `<div class="monthbar"><button class="btn sm" type="button" data-acct="props" aria-label="Back to Properties">‹</button><div class="m" style="text-align:left">${esc(p.name)}</div><span class="chip">${esc(PROP_ST[String(p.status)] || "")}</span></div>`;
  const where = [PROP_KIND[String(p.kind)], p.place, p.since ? `${p.status === "registered" || p.status === "possession" ? "registered" : "since"} ${fmtD(d, p.since)}` : ""].filter(Boolean).join(" · ");
  const seg = `<div class="seg" role="group" aria-label="Property sections" style="margin-top:16px">${[["overview", "Overview"], ["payments", "Payments"], ["expected", "Expected"], ["loan", "Loan"]].map(([k, l]) => `<button type="button" data-ptab="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div>`;
  const acts = `<div class="btns epfacts"><button class="btn sm pri" type="button" data-pact="add">+ Add payment</button><button class="btn sm" type="button" data-pact="pick">Pick from Transactions</button><button class="btn sm" type="button" data-pact="edit">Edit</button></div>`;
  const value = num(p.value);
  let body = "";
  if (tab === "overview") {
    const col = (k: string, v: string): string => `<div><div class="k">${k}</div><div class="hv">${v}</div></div>`;
    const nwChip = `<span class="nwchip">${p.nw ? `In net worth · ${short(propNwAt(d, p))}` : "Not in net worth"}</span>`;
    const top = (lbl: string): string => `<div class="phead"><div class="lbl">${lbl}</div>${nwChip}</div>`;
    const pct = value > 0 ? Math.min(1, c.price / value) : 0;
    const hero = c.interest > 50 || IL
      ? `<div class="hero epfh">${top("Cost with interest")}<div class="big">${rs0(c.withInt)}</div><div class="epfsub">${esc(where)}</div>
          <div class="hrow epfsplit">${value > 0 ? col("Agreement value", rs0(value)) : ""}${col("Cost without interest", rs0(c.cost))}${col("Interest so far", rs0(c.interest))}</div></div>`
      : `<div class="hero epfh">${top(value > 0 ? "Paid towards the price" : "Cost so far")}<div class="big">${rs0(value > 0 ? c.price : c.cost)}</div>
          ${value > 0 ? `<div class="ppbar" role="img" aria-label="${(pct * 100).toFixed(1)}% of the price paid"><i style="width:${(pct * 100).toFixed(2)}%"></i></div><div class="epfsub">${pct * 100 < 1 ? (pct * 100).toFixed(1) : Math.round(pct * 100)}% of the agreement value paid</div>` : ""}
          <div class="epfsub">${esc(where)}</div>
          <div class="hrow epfsplit">${value > 0 ? col("Agreement value", rs0(value)) + col("Price still to pay", rs0(Math.max(0, value - c.price))) : ""}${col("Total cost so far", rs0(c.cost))}</div></div>`;
    const tile = (k: string, v: string, s = ""): string => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="ts">${s}</div>` : ""}</div>`;
    const tiles = `<div class="tiles t4 epft">${tile("Your money in", shortR(c.own), IL ? "incl. principal repaid" : "")}${tile("Paid by loans", shortR(c.paidBank + c.paidFam), [c.paidBank > 50 && `Bank ${shortR(c.paidBank)}`, c.paidFam > 50 && `Family ${shortR(c.paidFam)}`].filter(Boolean).join(" · "))}${tile("Still owed", c.owed > 50 ? shortR(c.owed) : "—", c.owedBy.length ? c.owedBy.map((x) => `${esc(x.name)} ${shortR(x.amt)}`).join(" · ") : "no loan")}${tile("Interest to come", IL || c.loans.some((o) => o.come > 50) ? shortR(c.toCome) : "—", IL ? "if you prepay nothing more" : "")}</div>`;
    const COL: Record<string, string> = { price: "var(--v1)", govt: "var(--v2)", legal: "var(--v4)", loan: "var(--v5)", broker: "var(--v6)", builder: "var(--v3)", util: "var(--v2)", setup: "var(--v4)", off: "#8a6d3b", run: "var(--vO)" };
    const lines: string[] = [];
    for (const [g, lbl, how] of PG) {
      const cats = propCats(d).filter((x) => x.g === g && Math.abs(c.by[x.k] || 0) > 0.4 && pcHow(x) !== "int" && pcHow(x) !== "prin"); if (!cats.length) continue;
      lines.push(`<span class="tot" style="border:0;padding-top:6px"><i class="dot" style="background:${COL[g]}"></i>${esc(lbl)} <span class="pill">${PG_TAG[how]}</span></span><b class="tot" style="border:0;padding-top:6px">${rs0(cats.reduce((a, x) => a + c.by[x.k]!, 0))}</b>`);
      for (const x of cats) lines.push(`<span style="padding-left:16px">${esc(x.name)}</span><b>${rs0(c.by[x.k]!)}</b>`);
    }
    if (c.interest > 50) lines.push(`<span class="tot" style="border:0;padding-top:6px"><i class="dot" style="background:var(--v3)"></i>Interest &amp; Pre-EMI <span class="pill">interest</span></span><b class="tot" style="border:0;padding-top:6px">${rs0(c.interest)}</b>`);
    const stk = ([["cost", c.cost, "var(--v1)"], ["int", c.interest, "var(--v3)"]] as [string, number, string][]).filter((x) => x[1] > 50), tot = stk.reduce((a, x) => a + x[1], 0) || 1;
    const who: [string, number, string][] = [[`Your own money`, c.mine, ""]];
    if (IL || c.bankPaid > 50) who.push([`${IL ? esc(IL.name) : "Bank loan"}${IL && IL.lender ? ` · ${esc(IL.lender)}` : ""}`, c.bankPaid, IL ? `still owed ${rs0(I.out)}` : ""]);
    for (const o of c.loans) who.push([`${esc(o.l.name)}${o.l.lender ? ` · ${esc(o.l.lender)}` : ""}`, o.amt, `${o.prep > 50 ? `${o.prep < o.amt - 50 ? `${rs0(o.prep)} of it ` : ""}prepaid ${IL ? esc(IL.name) : "the loan"} · ` : ""}${o.share < 0.995 ? `${Math.round(o.share * 100)}% of the loan · ` : ""}still owed ${rs0(o.owed)}${o.paid > 50 ? ` · repaid ${rs0(o.paid)}` : ""}`]);
    const whoTot = who.reduce((a, w) => a + w[1], 0) - c.prinFunded;
    const whoCard = who.length > 1 ? `<div class="card"><b>Who paid</b><div class="kv" style="margin-top:8px">${who.map(([n, v, sub]) => `<span>${n}${sub ? `<br><small class="mut">${sub}</small>` : ""}</span><b>${rs0(v)}</b>`).join("")}<span class="tot">Total paid for the property</span><b class="tot">${rs0(whoTot)}</b></div>
      ${c.prinFunded > 50 ? `<p class="cnote">Prepayments of ${IL ? esc(IL.name) : "the property's loan"} made with other loans (${rs0(c.prinFunded)}) replace part of that loan, so they aren't added to the total again.</p>` : ""}
      <p class="cnote">As you repay a loan, that repayment counts as your money in. A loan used only partly for this property counts in proportion.</p></div>` : "";
    body = `${hero}${tiles}${acts}${seg}<div class="epfb">${whoCard}<div class="card"><b>Where the money went</b>${stk.length ? `<div class="stack" aria-hidden="true">${stk.map(([, v, cl]) => `<i style="flex:${(v / tot).toFixed(4)};background:${cl}"></i>`).join("")}</div>` : ""}
      <div class="kv" style="margin-top:12px">${lines.join("") || '<span>Nothing added yet</span><b></b>'}
      <span class="tot">Cost without interest</span><b class="tot">${rs0(c.cost)}</b>${value > 0 ? `<span>Agreement value</span><b>${rs0(value)}</b>` : ""}${c.interest > 50 ? `<span>Cost with interest</span><b>${rs0(c.withInt)}</b>` : ""}
      ${c.off > 50 ? `<span>Off-record (not in the cost)</span><b>${rs0(c.off)}</b>` : ""}${c.sep > 50 ? `<span>Set-up &amp; running (not in the cost)</span><b>${rs0(c.sep)}</b>` : ""}
      ${c.off + c.sep > 50 ? `<span class="tot">Everything spent</span><b class="tot">${rs0(c.everything)}</b>` : ""}</div>
      <p class="cnote">"In cost" items make up the property's cost. Interest is added on top in "cost with interest". Set-up, running and off-record amounts are listed separately. Off-record cash isn't part of the cost you can show for tax.</p></div>
      ${p.note ? `<div class="card"><b>Notes</b><p class="cnote" style="white-space:pre-wrap">${esc(p.note)}</p></div>` : ""}</div>`;
    return head + body;
  }
  if (tab === "expected") return head + `${acts}${seg}<div class="epfb">${propPlanTab(d, p)}</div>`;
  if (tab === "payments") {
    const rows: { date: string; html: string }[] = [];
    if (I.next) rows.push({ date: I.next.date, html: `<div class="row"><div class="main"><div class="t">Interest · ${mLabel(I.next.ym)} EMI <span class="pill">next · estimate</span></div><div class="s">${fmtD(d, I.next.date)} · ${rs0(I.next.emi)} EMI = ${rs0(I.next.int)} interest + ${rs0(I.next.prin)} principal</div></div><div class="amt mut">${rs0(I.next.int)}</div></div>` });
    for (const r of I.est) rows.push({ date: r.date, html: `<div class="row"><div class="main"><div class="t">Interest · ${mLabel(r.ym)} EMI <span class="pill auto">auto</span></div><div class="s">${fmtD(d, r.date)} · worked out from the loan · ${rateTxt(r.rate)}%</div></div><div class="amt">${rs0(r.int)}</div></div>` });
    const st = I.st as (NonNullable<Property["stmt"]> & { bank?: string }) | null;
    if (st) { const dd = `${st.through}-10`;
      if (num(st.int)) rows.push({ date: dd, html: `<div class="row"><div class="main"><div class="t">EMI interest to ${mLabel(st.through ?? "")} <span class="pill auto">statement</span></div><div class="s">${esc(st.bank || "Bank")} loan statement of ${fmtD(d, st.asOf ?? "")}</div></div><div class="amt">${rs0(num(st.int))}</div></div>` });
      if (num(st.pemi)) rows.push({ date: dd, html: `<div class="row"><div class="main"><div class="t">Pre-EMI interest <span class="pill auto">statement</span></div><div class="s">${esc(st.bank || "Bank")} loan statement of ${fmtD(d, st.asOf ?? "")}</div></div><div class="amt">${rs0(num(st.pemi))}</div></div>` }); }
    for (const i of c.items as (typeof c.items[number] & { note?: string })[]) {
      const x = pcOf(d, i.cat), how = pcHow(x), ef = (i.funds || []).filter((f) => f.loan !== p.loanId && d.byId("loans", f.loan)), fl = ef.length;
      const tag = i.gone ? "transaction deleted" : fl ? ef.map((f) => `${d.byId<LoanN>("loans", f.loan)!.name} ${short(f.amt)}`).join(" · ") : x.f === "bank" ? "bank" : how === "prin" ? "principal" : how === "off" ? "off-record" : how === "sep" ? "separate" : "yours";
      const fundL = i.fund && !i.accountId ? d.byId<LoanN>("loans", i.fund) : undefined;
      rows.push({ date: i.date, html: `<div class="row tap" data-pitem="${esc(i.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(x.name)} <span class="pill">${tag}</span></div><div class="s">${fmtD(d, i.date)} · ${fundL ? `from ${esc(fundL.name)} (loan)${i.txnId ? " · linked" : ""}` : i.txnId ? `${esc(accName(d, i.accountId))} · linked` : i.accountId ? esc(accName(d, i.accountId)) : "not from an account"}${i.note || i.tnote ? ` · ${esc(i.note || i.tnote)}` : ""}</div></div><div class="amt ${i.amt < 0 ? "in" : ""}">${i.amt < 0 ? "−" : ""}${rs0(Math.abs(i.amt))}</div></div>` });
    }
    for (const o of c.loans) if (o.int > 50) rows.push({ date: d.today, html: `<div class="row"><div class="main"><div class="t">Interest · ${esc(o.l.name)} <span class="pill auto">auto</span></div><div class="s">${Math.round(o.iShare * 100)}% of the loan's interest so far</div></div><div class="amt">${rs0(o.int)}</div></div>` });
    rows.sort((a, b) => b.date.localeCompare(a.date));
    body = `${acts}${seg}<div class="epfb"><div class="list">${rows.map((r) => r.html).join("") || '<div class="empty">No payments yet. Add one, or pick it from Transactions.</div>'}</div>
      <p class="note"><b>auto</b> is interest worked out from the loan until the next statement replaces it · <b>statement</b> is the bank's own total · <b>yours</b> is a payment you made · <b>bank</b> was paid by the loan. Tap a payment to change or unlink it.</p></div>`;
    return head + body;
  }
  /* loan */
  const l = IL;
  if (!l) { body = `${acts}${seg}<div class="epfb"><div class="list"><div class="empty">No loan linked. If this property has a loan, add it in Plan, then pick it here.</div></div><div class="btns" style="margin-top:12px"><button class="btn sm pri" type="button" data-pact="edit">Link a loan</button></div></div>`; return head + body; }
  const x = loanSum(d, l), st = I.st as (NonNullable<Property["stmt"]> & { bank?: string }) | null;
  const chgItems = propCats(d).filter((k) => k.g === "loan" && pcHow(k) === "cost").reduce((a, k) => a + (c.by[k.k] || 0), 0);
  body = `${acts}${seg}<div class="epfb"><div class="card"><b>${esc(l.name)} · ${esc(l.lender || "")}</b><div class="kv">
      <span>Still owed</span><b>${rs0(x.out)}</b><span>EMI now</span><b>${x.emiNow ? rs0(x.emiNow) : "—"}</b><span>Rate now</span><b>${rateTxt(x.rateNow)}%</b><span>Ends</span><b>${x.end ? mLabel(x.end) : "—"}</b>
      <span class="tot">Interest so far</span><b class="tot">${rs0(c.interest)}</b><span>Principal repaid so far</span><b>${rs0(c.prin)}</b><span>Interest still to come</span><b>${rs0(I.toCome)}</b></div>
      <div class="btns" style="margin-top:12px"><button class="btn sm" type="button" data-loan="${esc(l.id)}">Open the loan</button><button class="btn sm" type="button" data-pact="stmt">Load loan statement (PDF)</button></div>
      <input type="file" id="propStmt" accept="application/pdf,.pdf" hidden></div>
    ${st ? `<div class="card"><b>From the ${esc(st.bank || "bank")} statement of ${fmtD(d, st.asOf ?? "")}</b><div class="kv">
      <span>EMI interest to ${mLabel(st.through ?? "")}</span><b>${rs0(num(st.int))}</b><span>Pre-EMI interest</span><b>${rs0(num(st.pemi))}</b><span>Principal repaid</span><b>${rs0(num(st.prin))}</b>
      <span>Charges (processing, admin, CERSAI)</span><b>${rs0(num(st.chg))}</b><span>Principal outstanding</span><b>${rs0(num(st.out))}</b></div>
      ${Math.abs(chgItems - num(st.chg)) > 100 ? `<p class="cnote">Bank charges you've added here come to ${rs0(chgItems)}; the statement shows ${rs0(num(st.chg))}. Check the Loan &amp; bank payments.</p>` : ""}
      ${Math.abs(x.out - num(st.out)) > 100 && !I.est.length ? `<p class="cnote">The app's loan shows ${rs0(x.out)} owed; the statement shows ${rs0(num(st.out))}. Use "Match bank statement" on the loan to line them up.</p>` : ""}</div>`
      : `<div class="card"><p class="cnote" style="margin:0">No statement loaded. Interest is worked out from the loan's rate and EMIs. Load the bank's loan statement to use the bank's exact figures.</p></div>`}
    ${I.est.length ? `<p class="note">After the statement: ${I.est.length} EMI${I.est.length === 1 ? "" : "s"} split by the app (${rs0(I.estInt)} interest). They're replaced when you load a newer statement.</p>` : ""}</div>`;
  return head + body;
}

export const propPage: Page = {
  html(d, h) {
    const x = propHtml(d, h.state() as PropState);
    if (x != null) return x;
    Object.assign(h.state(), { view: "accounts", accTab: "props" });   // the property is gone: Properties, as the planner does
    return accountsPage.html(d, h);
  },
  act(el, h, redraw) {
    const S = h.state() as unknown as PropState;
    if (el.dataset.ptab) { S.propTab = el.dataset.ptab; redraw(); return; }
    if (el.dataset.acct) { S.accTab = el.dataset.acct; h.prefSet("accTab", el.dataset.acct); h.go("accounts"); return; }
    if (el.dataset.loan) { Object.assign(S, { loanId: el.dataset.loan, loanTab: "overview" }); h.go("loan"); return; }
    if (el.dataset.pact === "planpdf" || el.dataset.pact === "stmt") { el.closest("#view")?.querySelector<HTMLInputElement>(el.dataset.pact === "stmt" ? "#propStmt" : "#planPdf")?.click(); return; }
    return false;   // payments, expected payments, edit, pick: the planner's forms for now
  },
  input(t) {
    if (!t.matches("[data-lsearch]")) return false;
    const q = t.value.trim().toLowerCase(), root = t.closest("#view") ?? document;
    root.querySelectorAll<HTMLElement>(".list").forEach((L) => {
      if (!(t.compareDocumentPosition(L) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
      let any = false;
      L.querySelectorAll<HTMLElement>(":scope > .row").forEach((r) => { const ok = !q || r.textContent!.toLowerCase().includes(q); r.hidden = !ok; if (ok) any = true; });
      L.hidden = !any && !!q;
      const hd = L.previousElementSibling as HTMLElement | null;
      if (hd && hd.classList.contains("sh")) hd.hidden = L.hidden;
    });
  },
  change(el, h) {
    if (el.id === "planPdf" || el.id === "propStmt") {
      const f = el.files?.[0], p = h.data().byId<P>("props", String((h.state() as PropState).propId)); el.value = "";
      if (f && p) void (el.id === "planPdf" ? propPlanLoad(p, f) : propStmtLoad(p, f));
      return;
    }
    return false;
  },
};
