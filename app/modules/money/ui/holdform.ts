/**
 * Adding or editing an investment, as in KP Money Planner: type, name, what's already held, the current
 * value or units × price (with the automatic price link), NPS by scheme units, EPF passbooks, EPF and PPF
 * details, the retirement summary and the trades behind a share. Saved in paise.
 */
import { esc } from "../../../core/dom.ts";
import { addM, dLabel, mLabel, mShort } from "../calc/dates.ts";
import { num, type Paise, type Rec } from "../calc/data.ts";
import { epfCalc, epfInfo, holdingSum, npsLines, ppfInfo, UNIT_TYPES, type Holding, type HoldingSum } from "../calc/invest.ts";
import { fmtD } from "../calc/plan.ts";
import { money } from "../views/txlist.ts";
import { ONE_OF, short } from "../views/accounts.ts";
import { INV_TYPES, instruments } from "./txform.ts";
import { askConfirm, closeModal, field, openSheet, toast, val } from "./kit.ts";
import { pxAfterSave, pxKey, pxKind, pxNames, pxPrice, pxSearch, pxSet, pxTable } from "./prices.ts";
import { epfLoadFiles, epfMerge, type Book } from "./epfpdf.ts";
import { tradesBlock } from "./trades.ts";
import { E, uid } from "./env.ts";

const HOLD_LBL: Record<string, { ph: string; plat: [string, string] | null }> = {
  EPF: { ph: "EPF", plat: null }, PPF: { ph: "PPF", plat: ["Bank / post office (optional)", "e.g. SBI, India Post"] }, NPS: { ph: "NPS", plat: ["Provider (optional)", "e.g. Protean, KFintech"] },
  Gold: { ph: "e.g. Gullak gold", plat: ["App (optional)", "e.g. Gullak"] }, "Real estate": { ph: "e.g. Plot at Kanakapura Road", plat: null },
};
const holdName = (name: string, type: string): string => (name || "").trim() || (ONE_OF.includes(type) ? type : "");
const usd = (n: number): string => "$" + (+n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rsF = (p: unknown): string | number => (p === undefined || p === null || p === "" ? "" : num(p) / 100);
const $s = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T => s.querySelector<T>("#" + id)!;
const opt = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T | null => s.querySelector<T>("#" + id);
const btnRow = (isNew: boolean, addLbl: string): string => `<div class="btns"><button class="btn pri" id="sv" type="button">${isNew ? addLbl : "Save"}</button><button class="btn" id="cx" type="button">Cancel</button>${isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>'}</div>`;
type EpfX = NonNullable<Holding["epf"]> & { books: Record<string, { est?: string; fys: Record<string, unknown> }> };
type HH = Holding & Rec & { platform?: string; px?: string; npsMode?: string; npsLines?: (Rec & { px?: string; units?: number; n?: string; price?: number; priceDate?: string })[]; joined?: string; opened?: string; priceManual?: boolean; fxManual?: boolean; fxDate?: string; fxAuto?: string; priceAuto?: string; priceSrc?: string; navHist?: unknown; priceJump?: unknown };

/** Passbook rows read in rupees → paise, as an import stores them. */
const bookPaise = (B: Book): Book => {
  const P = (x: number): number => Math.round(x * 100), arr = (a: number[] | null): number[] | null => (a ? a.map(P) : a);
  return { ...B, ob: arr(B.ob), int: arr(B.int), close: arr(B.close), rows: B.rows.map((r) => ({ ...r, emp: P(r.emp), er: P(r.er), eps: P(r.eps), ...(r.wage != null ? { wage: P(r.wage) } : {}), ...(r.epsw != null ? { epsw: P(r.epsw) } : {}) })) };
};

/** EPF, PPF: what the holding means for retirement (edit form). */
export function retirementBlock(h: HH, x: HoldingSum | null): string {
  const d = E().data();
  if (h.type === "EPF" && x && x.epf) {
    const e = epfCalc(d, h)!;
    return `<div class="card" style="margin-top:12px"><b>EPF</b><div class="kv">
      ${e.corpus ? `<span>At ${e.age} (${mLabel(e.retYm!)})</span><b>≈ ${short(e.corpus)}</b>` : ""}
      <span>Interest building up this year</span><b>≈ ${money(e.accrued)}</b>
      <span>You can withdraw now (75%)</span><b>up to ${money(e.partial)}</b>
      ${e.pension ? `<span>Pension from ${e.age}</span><b>≈ ${money(e.pension)}/month</b>` : ""}</div>
      <p class="cnote">From your passbooks. Open <b>EPF</b> on the Investments tab for the passbook, projection and pension.</p></div>`;
  }
  if (h.type === "EPF" && x) {
    const e = epfInfo(d, h, x);
    return `<div class="card" style="margin-top:12px"><b>EPF</b><div class="kv">
      <span>Interest this year at ${(e.r * 100).toFixed(2)}%</span><b>≈ ${money(e.int)}</b>
      ${e.mon ? `<span>Going in each month</span><b>${money(e.mon)}</b><span>In 5 years</span><b>≈ ${short(e.p5)}</b><span>In 10 years</span><b>≈ ${short(e.p10)}</b>` : ""}
      <span>You can withdraw now</span><b>${e.can === false ? "Not yet" : `up to ${money(e.wd)}`}</b></div>
      <p class="cnote">Under EPFO's rules from October 2025, after 12 months of service you can take out up to 75% of your balance (employee and employer share; 25% must stay) for illness, education, marriage, housing, or special circumstances. ${e.can === false ? `You'll have 12 months of service in ${mShort(addM(h.joined!, 12))}.` : e.can == null ? "Add when you joined to check the 12 months." : ""} Interest for FY 2025-26 is 8.25%. Check the EPFO portal before you apply.</p></div>`;
  }
  if (h.type === "PPF" && x) {
    const p = ppfInfo(d, h, x) as ReturnType<typeof ppfInfo> & Record<string, never>;
    if (p.fy0 == null) return `<p class="note">Add the date the PPF account was opened to see its maturity and what you can withdraw.</p>`;
    return `<div class="card" style="margin-top:12px"><b>PPF</b><div class="kv">
      <span>Year of the account</span><b>${p.idx} of 15</b><span>Matures</span><b>${fmtD(d, p.matures!)}</b>
      <span>Value at maturity at ${(p.r * 100).toFixed(1)}%${num(h.yearly) ? ` with ${money(num(h.yearly))}/year` : ""}</span><b>≈ ${short(p.mv!)}</b>
      <span>Partial withdrawal</span><b>${p.wdOk ? `up to ≈ ${money(p.w!)}` : `from FY ${p.wdFrom}`}</b>
      ${p.loanOk ? `<span>Loan against PPF</span><b>up to ≈ ${money(p.ln!)}</b>` : ""}</div>
      <p class="cnote">From the 7th financial year you can withdraw once a year, up to half of the balance at the end of the 4th year before, or of last year, whichever is lower. In years 3 to 6 you can take a loan of up to 25% of the balance two years before. ${p.haveDeps ? "Past balances are worked back from your PPF deposits, so check your passbook." : "Past balances are estimated; record PPF deposits as investment entries to sharpen them."} Interest is 7.1% for Oct–Dec 2026.</p></div>`;
  }
  return "";
}

export function holdingForm(h0: Partial<HH> = {}): void {
  const d = E().data(), isNew = !h0.id, h: HH = { type: "Mutual Fund", ...h0 } as HH, x = isNew ? null : holdingSum(d, h);
  const E0 = h.epf;
  const body = `
    ${field(["type", "Type", "select", { value: h.type, options: INV_TYPES.map((t) => [t, t] as [string, string]) }])}
    <div class="grid2">${field(["name", "Name", "text", { value: h.name, ph: "e.g. Navi Nifty 50" }])}${field(["platform", "Platform (optional)", "text", { value: h.platform, ph: "e.g. Groww, Zerodha, INDmoney" }])}</div>
    ${field(["instrument", "Matches entries named", "text", { value: h.instrument || h.name || "", list: "instl2", hint: "SIPs and investment entries with this name add to this holding." }])}<datalist id="instl2">${instruments(d).map((i) => `<option value="${esc(i)}">`).join("")}</datalist>
    <div id="g_epfb"><p class="sect">EPF passbook</p><div class="note" id="epfSt" style="margin-top:0"></div>
      <div class="btns epfbtns"><label class="btn" for="f_epfPdf" tabindex="0" role="button">Load passbook PDFs</label><input type="file" id="f_epfPdf" accept="application/pdf,.pdf" multiple hidden><button type="button" class="btn" id="epfOpen">Open EPF page</button></div>
      <div id="g_epfset"><p class="sect">Projection</p><div class="grid2">${field(["epfRate", "Interest rate (%)", "number", { value: E0?.rate ?? 8.25, step: "0.01", hint: "8.25% for FY 2025-26" }])}${field(["epfRaise", "Yearly raise in contribution (%)", "number", { value: E0?.raise ?? 0, step: "0.5" }])}</div>
        <div class="grid2">${field(["epfAge", "Retire at age", "number", { value: E0?.retireAge ?? 58, step: "1" }])}${field(["epfDob", "Date of birth", "date", { value: E0?.dob || "", hint: "From your passbook" }])}</div>
        <label class="opt"><input type="checkbox" id="f_epfExp" ${E0 && E0.expected === false ? "" : "checked"}><div><b>Add expected months</b><span>Until a newer passbook is loaded, each month adds your usual contribution, marked expected.</span></div></label>
        <button type="button" class="lnk" id="epfClr">Remove passbook data</button></div></div>
    <div id="g_hold"><p class="sect">What you already hold</p>
    <div class="grid2">${field(["openInvested", "Amount invested (₹)", "number", { value: rsF(h.openInvested), step: "0.01" }])}<div id="w_ou">${field(["openUnits", "Units held", "number", { value: h.openUnits ?? "", step: "any" }])}</div></div>
    <div id="w_uao2">${field(["unitsAsOf", "Units as of (optional)", "date", { value: h.unitsAsOf || (isNew ? d.today : ""), hint: "The date of the statement your units come from. SIPs after this date that don't say how many units are counted at the amount paid until you update the units." }])}</div>
    ${field(["inclTo", "These include entries up to", "date", { value: h.inclTo || (h.history && h.history[0] && h.history[0].date) || d.today, hint: "Investment entries on or before this date are already counted above, so they aren't added again." }])}</div>
    <p class="sect" id="s_curv">Current value</p>
    <div id="g_px" ></div>
    <div id="g_units">${field(["price", "Latest price / NAV per unit (₹)", "number", { value: h.price ?? "", step: "any", hint: x && x.byUnits ? `${x.units.toLocaleString("en-IN", { maximumFractionDigits: 4 })} ${h.type === "Gold" ? "grams" : h.type === "US Stocks" ? "shares" : "units"} in total` : "" }])}
      <div id="g_fx">${field(["fx", "Dollar rate (₹ per $1)", "number", { value: h.fx ?? "", step: "any", ph: "e.g. 84.50", hint: "Today's rate, e.g. from INDmoney or Vested. Used to show the value in ₹ for net worth." }])}</div></div>
    <div id="g_nps" ><div class="seg" role="group" aria-label="How to value NPS" id="npsSeg"><button type="button" data-k="value" aria-pressed="${h.npsMode !== "units"}">Type the balance</button><button type="button" data-k="units" aria-pressed="${h.npsMode === "units"}">Scheme units</button></div>
      <div id="g_npsu" hidden><p class="note">Enter the units of each scheme from your NPS statement (Protean, KFintech or CAMS app). The value then updates every day from NPS Trust's official NAVs.</p>
        ${field(["npsPfm", "Pension fund", "select", { value: "", options: [["", "Loading…"]] }])}<div id="npsRows"></div></div></div>
    <div id="g_value">${field(["value", "Current balance (₹)", "number", { value: rsF(h.value), step: "0.01", hint: "From your passbook, statement or app." }])}</div>
    <div id="g_epf"><p class="sect">EPF details (optional)</p><div class="grid2">${field(["epfEmp", "Your share each month (₹)", "number", { value: rsF(h.epfEmp), step: "1", hint: "12% of basic, from your payslip" }])}${field(["epfEr", "Employer's share to EPF (₹)", "number", { value: rsF(h.epfEr), step: "1", hint: "Usually 3.67% of basic" }])}</div>
      <div class="grid2">${field(["joined", "Service started", "month", { value: h.joined || "" }])}${field(["rateE", "Interest rate (%)", "number", { value: h.type === "EPF" ? (h.rate ?? 8.25) : 8.25, step: "0.01" }])}</div></div>
    <div id="g_ppf"><p class="sect">PPF details (optional)</p><div class="grid2">${field(["opened", "Account opened on", "date", { value: h.opened || "" }])}${field(["yearly", "You put in each year (₹)", "number", { value: rsF(h.yearly), step: "500" }])}</div>
      ${field(["rateP", "Interest rate (%)", "number", { value: h.type === "PPF" ? (h.rate ?? 7.1) : 7.1, step: "0.01" }])}</div>
    ${isNew ? "" : retirementBlock(h, x)}
    ${isNew ? "" : tradesBlock(d, h)}
    <label class="opt" id="w_excl"><input type="checkbox" id="f_excl" ${h.excludeNW || (isNew && h.type === "Real estate") ? "checked" : ""}><div><b>Leave out of net worth</b><span>Still listed under investments, just not added to the total (e.g. a plot).</span></div></label>
    <div class="note" id="hcalc"></div>
    ${btnRow(isNew, "Add investment")}`;
  openSheet(isNew ? "Add investment" : `${h.name}`, body, (s) => {
    let px = h.px || "", pxDrawn: string | null = null, npsMode = h.npsMode === "units" ? "units" : "value", npsDrawn = false;
    const g$ = <T extends HTMLElement = HTMLElement>(id: string): T | null => s.querySelector<T>("#" + id);
    /* the automatic price link: AMFI code, ISIN or US ticker */
    const pxDraw = async (): Promise<void> => {
      const ty = val("type"), src = pxKind(ty), g = $s(s, "g_px");
      if (!(src === "mf" || src === "stk" || src === "us")) { g.hidden = true; g.innerHTML = ""; return; } g.hidden = false;
      if (px && !px.startsWith(src + ":")) px = "";
      if (src === "us") {
        g.innerHTML = `<div class="f"><label for="f_pxus">Automatic price: US ticker (optional)</label><input id="f_pxus" value="${esc(pxKey(px))}" placeholder="e.g. AAPL, VOO" autocapitalize="characters" autocomplete="off" spellcheck="false"><div class="hint" id="pxInfo"></div></div>`;
        const inp = $s<HTMLInputElement>(s, "f_pxus");
        const info = async (): Promise<void> => {
          const t = inp.value.trim().toUpperCase(); px = t ? "us:" + t : ""; const r = t ? await pxPrice("us", t) : null, fx = await pxPrice("us", "USDINR"); const el = g$("pxInfo"); if (!el) return;
          if (r && px !== h.px) { const f = g$<HTMLInputElement>("f_price"); if (f) f.value = String(r.p); if (fx && g$("f_fx")) g$<HTMLInputElement>("f_fx")!.value = String(fx.p); calc(); }
          el.textContent = !t ? "With a ticker, the price and the dollar rate update every morning (Alpha Vantage)." : r ? `Latest close $${r.p} on ${dLabel(r.d)}${fx ? ` · $1 = ₹${fx.p}` : ""} (Alpha Vantage)` : "Its price arrives with the next morning update. Or, after saving, tap the prices line on the Investments tab › Update prices now.";
        };
        inp.addEventListener("input", () => { const t = inp.value.trim().toUpperCase(); px = t ? "us:" + t : ""; }); inp.addEventListener("change", () => void info()); void info(); return;
      }
      const what = src === "mf" ? "fund" : "share";
      g.innerHTML = `<div class="f"><label for="f_pxq">Automatic price</label><div class="pxcur" id="pxCur"></div><input id="f_pxq" placeholder="${src === "mf" ? "Search AMFI by fund name or scheme code" : "Search NSE / BSE by name, symbol or ISIN"}" autocomplete="off" spellcheck="false"><div class="pxres" id="pxRes"></div></div>`;
      const cur = async (): Promise<void> => {
        const el = g$("pxCur"); if (!el) return; const key = pxKey(px);
        if (!px) { el.innerHTML = `<span class="mut">Not linked. Find the ${what} below and its price updates every day.</span>`; return; }
        const names = (await pxNames(src)) || [], n = names.find((y) => y.k === key), r = await pxPrice(src, key); if (!g$("pxCur")) return;
        el.innerHTML = `<span><b>${esc(n ? n.n : key)}</b> <span class="mut">${n && n.s ? esc(n.s) + " · " : ""}${src === "mf" ? "AMFI code" : "ISIN"} ${esc(key)}${r ? ` · ₹${r.p} on ${dLabel(r.d)}` : ""}</span></span> <button type="button" class="lnk" id="pxUn">Unlink</button>`;
        $s(s, "pxUn").onclick = () => { px = ""; void cur(); };
      };
      void cur();
      const q = $s<HTMLInputElement>(s, "f_pxq"), res = $s(s, "pxRes"); let tm = 0;
      q.addEventListener("input", () => { clearTimeout(tm); tm = window.setTimeout(async () => {
        const list = await pxNames(src);
        if (!list) { res.innerHTML = '<p class="note">Sign in and sync to search.</p>'; return; }
        if (!list.length) { res.innerHTML = '<p class="note">The price list isn\'t ready yet. Deploy the price job, then on the Investments tab tap the prices line › Update prices now.</p>'; return; }
        const hits = pxSearch(list, q.value);
        res.innerHTML = hits.map((y) => `<button type="button" class="pxhit" data-k="${esc(y.k)}"><b>${esc(y.n || y.s || y.k)}</b><span>${src === "mf" ? "AMFI code " + esc(y.k) : `${esc(y.s || "")} · ${esc(y.x || "")} · ${esc(y.k)}`}</span></button>`).join("") || (q.value.trim().length > 1 ? '<p class="note">No match. Try fewer words.</p>' : "");
        res.querySelectorAll<HTMLElement>(".pxhit").forEach((b) => { b.onclick = () => {
          px = src + ":" + b.dataset.k; const n = list.find((y) => y.k === b.dataset.k);
          if (n && isNew && !val("name")) { $s<HTMLInputElement>(s, "f_name").value = n.n; $s<HTMLInputElement>(s, "f_instrument").value = n.n; sync(); }
          q.value = ""; res.innerHTML = ""; void cur();
          void pxPrice(src, b.dataset.k!).then((r) => { const f = g$<HTMLInputElement>("f_price"); if (r && f) { f.value = String(r.p); calc(); } });
        }; });
      }, 250); });
    };
    /* NPS by scheme units */
    const NPS_ASSET: Record<string, string> = { E: "equity", C: "corporate bonds", G: "government bonds", A: "alternative assets" };
    const shortScheme = (n: unknown): string => { const m = String(n || "").match(/scheme\s+([ECGA])\b/i); if (m) return `Scheme ${m[1]!.toUpperCase()} · ${NPS_ASSET[m[1]!.toUpperCase()]}`; const k = String(n || "").match(/scheme\b.*$/i); return k ? k[0] : String(n); };
    const npsOrder = (n: unknown): number => { const m = String(n || "").match(/scheme\s+([ECGA])\b/i); return m ? "ECGA".indexOf(m[1]!.toUpperCase()) : 9; };
    let npsRows: Record<string, { p: number; d: string }> = {};
    const npsCollect = (): HH["npsLines"] & object => [...s.querySelectorAll<HTMLInputElement>("#npsRows [data-np]")].map((i) => {
      const k = i.dataset.np!, u = parseFloat(i.value); if (!(u > 0)) return null;
      const old = (h.npsLines || []).find((y) => pxKey(y.px) === k) || {}, r = npsRows[k], l: Record<string, unknown> = { ...old, px: "nps:" + k, units: u, n: i.dataset.n };
      if (r) pxSet(l, r, "nps"); return l;
    }).filter(Boolean) as never;
    const npsDraw = async (): Promise<void> => {
      npsDrawn = true; const sel = $s<HTMLSelectElement>(s, "f_npsPfm"), rows = $s(s, "npsRows");
      const list = await pxNames("nps"); const t = await pxTable("nps"); npsRows = t?.rows ?? {}; if (!g$("npsRows")) return;
      if (!list || !list.length) { sel.innerHTML = '<option value="">Not available yet</option>'; rows.innerHTML = '<p class="note">The NPS price list isn\'t ready yet. Deploy the price job, then on the Investments tab tap the prices line › Update prices now.</p>'; return; }
      const curL = h.npsLines || [], k0 = curL[0] && pxKey(curL[0].px), curPfm = list.find((y) => y.k === k0)?.f || "";
      const pfms = [...new Set(list.map((y) => y.f).filter(Boolean) as string[])].sort();
      sel.innerHTML = '<option value="">Pick your pension fund</option>' + pfms.map((f) => `<option value="${esc(f)}" ${f === curPfm ? "selected" : ""}>${esc(f)}</option>`).join("");
      const draw = (): void => {
        const f = sel.value; if (!f) { rows.innerHTML = ""; calc(); return; }
        let sch = list.filter((y) => y.f === f && /\btier\s*-?\s*(i|1)\b/i.test(y.n)); if (!sch.length) sch = list.filter((y) => y.f === f);
        rows.innerHTML = `<div class="npsg">${sch.sort((a, b) => npsOrder(a.n) - npsOrder(b.n) || a.n.localeCompare(b.n)).map((y) => { const l = curL.find((z) => pxKey(z.px) === y.k), r = npsRows[y.k];
          return `<div class="f"><label for="np_${esc(y.k)}">${esc(shortScheme(y.n))}</label><input id="np_${esc(y.k)}" data-np="${esc(y.k)}" data-n="${esc(shortScheme(y.n))}" type="number" step="any" inputmode="decimal" value="${l ? esc(l.units) : ""}" placeholder="Units"><div class="hint">${r ? `NAV ₹${r.p} on ${dLabel(r.d)}` : "No NAV yet"}</div></div>`; }).join("")}</div><p class="note">Leave a scheme empty if you don't hold it.</p>`;
        rows.querySelectorAll("input").forEach((i) => { i.addEventListener("input", () => { unitsTouched(); calc(); }); }); calc();
      };
      sel.onchange = draw; draw();
    };
    /* EPF passbook (read on this device; nothing is uploaded), kept in paise */
    let ebk: EpfX | null = h.epf ? JSON.parse(JSON.stringify(h.epf)) : null;
    const epfSet = (): EpfX | null => (ebk ? { ...ebk, rate: parseFloat(val("epfRate")) || 8.25, raise: parseFloat(val("epfRaise")) || 0, retireAge: parseInt(val("epfAge")) || 58, dob: val("epfDob") || ebk.dob || "", expected: $s<HTMLInputElement>(s, "f_epfExp").checked } : null);
    const epfStatus = (): void => {
      const el = g$("epfSt"); if (!el) return; const e = ebk ? epfCalc(d, { id: "", epf: epfSet()! } as Holding, { noProj: true }) : null;
      if (!e) { el.innerHTML = `Load your EPF passbooks (one PDF per financial year per member ID, from the EPFO member passbook site) and the balance, contributions, interest, withdrawals and pension are worked out from them. The PDFs are read on this device.`; return; }
      const nb = Object.values(ebk!.books).reduce((a, b) => a + Object.keys(b.fys).length, 0);
      el.innerHTML = `<b>${nb} passbook${nb === 1 ? "" : "s"} · ${e.accs.length} member ID${e.accs.length === 1 ? "" : "s"} · up to ${mLabel(e.lastWm)}</b><br>Balance ${money(e.epfBal)}${e.expected.length ? ` + ${e.expected.length} expected month${e.expected.length === 1 ? "" : "s"} (${money(e.expAmt)})` : ""} · invested ${money(e.invested)} · interest ${money(e.interest)}${e.issues.length ? `<br><span style="color:var(--warn)">${e.issues.map(esc).join("<br>")}</span>` : ""}`;
    };
    const epfPick = async (files: File[]): Promise<void> => {
      if (!files.length) return; const st = $s(s, "epfSt"); st.textContent = `Reading ${files.length} PDF${files.length === 1 ? "" : "s"}…`;
      try {
        const { list, bad } = await epfLoadFiles(files);
        if (list.length) { const r = epfMerge(ebk || { rate: 8.25, raise: 0, retireAge: 58 }, list.map(bookPaise)); ebk = r.E as EpfX; if (!val("epfDob") && ebk.dob) $s<HTMLInputElement>(s, "f_epfDob").value = String(ebk.dob); }
        epfStatus(); sync(); calc();
        toast(list.length ? `${list.length} passbook${list.length === 1 ? "" : "s"} read${bad.length ? `, ${bad.length} couldn't be read` : ""}. Save to keep them.` : "Couldn't read these as EPF passbooks.");
      } catch (e) { console.warn(e); st.textContent = "Couldn't open the PDF reader. Check your connection and try again."; }
    };
    const uao0 = val("unitsAsOf"), unitsTouched = (): void => { const f = g$<HTMLInputElement>("f_unitsAsOf"); if (f && f.value === uao0) f.value = d.today; };
    const lbl = (id: string, t: string): void => { s.querySelector<HTMLElement>(`#${id} label`)!.textContent = t; };
    const sync = (): void => {
      const ty = val("type"), u = UNIT_TYPES.includes(ty), L = HOLD_LBL[ty], one = ONE_OF.includes(ty), nu = ty === "NPS" && npsMode === "units";
      $s(s, "g_units").hidden = !u; $s(s, "w_ou").hidden = !u; $s(s, "g_value").hidden = u || nu; $s(s, "w_uao2").hidden = !(u || nu);
      $s(s, "g_nps").hidden = ty !== "NPS"; $s(s, "g_npsu").hidden = !nu;
      const pb = ty === "EPF" && !!ebk; $s(s, "g_epfb").hidden = ty !== "EPF"; $s(s, "g_epfset").hidden = !pb; $s(s, "epfOpen").hidden = !pb || isNew;
      const pp = ty === "PPF" && !!h.ppf;
      $s(s, "g_hold").hidden = pb || pp; $s(s, "s_curv").hidden = pb || pp; $s(s, "w_instrument").hidden = pb; if (pb || pp) $s(s, "g_value").hidden = true;
      if (pxDrawn !== ty) { pxDrawn = ty; void pxDraw(); }
      const g = ty === "Gold"; lbl("w_openUnits", g ? "Grams held" : "Units held"); $s<HTMLInputElement>(s, "f_openUnits").placeholder = g ? "e.g. 4.2513" : "";
      const us = ty === "US Stocks"; $s(s, "g_fx").hidden = !us; $s(s, "g_epf").hidden = ty !== "EPF" || !!ebk; $s(s, "g_ppf").hidden = ty !== "PPF";
      lbl("w_price", g ? "Latest price per gram (₹)" : us ? "Latest price per share ($)" : "Latest price / NAV per unit (₹)");
      if (us) { lbl("w_openUnits", "Shares held"); lbl("w_openInvested", "Amount invested (₹ paid)"); } else lbl("w_openInvested", "Amount invested (₹)");
      lbl("w_name", one ? "Name (optional)" : "Name"); $s<HTMLInputElement>(s, "f_name").placeholder = L ? L.ph : "e.g. Navi Nifty 50";
      const pl = L ? L.plat : ["Platform (optional)", "e.g. Groww, Zerodha, INDmoney"] as [string, string]; $s(s, "w_platform").hidden = !pl; if (pl) { lbl("w_platform", pl[0]); $s<HTMLInputElement>(s, "f_platform").placeholder = pl[1]; }
      if (isNew) { const auto = holdName(val("name"), ty); $s<HTMLInputElement>(s, "f_instrument").placeholder = auto || "Same as the name"; }
    };
    const P = (id: string): Paise => Math.round((parseFloat(val(id)) || 0) * 100);
    const calc = (): void => {
      if (isNew) return;
      const t = { ...h, type: val("type"), openInvested: P("openInvested"), openUnits: parseFloat(val("openUnits")) || 0, inclTo: val("inclTo"), price: parseFloat(val("price")) || 0, fx: parseFloat(val("fx")) || 0, ccy: val("type") === "US Stocks" ? "USD" : h.ccy, value: P("value"), instrument: val("instrument") || val("name"), unitsAsOf: val("unitsAsOf"),
        npsMode: val("type") === "NPS" ? npsMode : undefined, npsLines: val("type") === "NPS" && npsMode === "units" ? npsCollect() : h.npsLines, epf: val("type") === "EPF" ? epfSet() || undefined : undefined } as HH;
      const y = holdingSum(d, t);
      $s(s, "hcalc").textContent = `Invested ${money(y.inv)} · value ${y.isUsd ? usd(y.usdValue ?? 0) + " = " : ""}${money(y.value)}${y.atCost > 50 ? ` (incl. ${money(y.atCost)} of SIPs at cost until you update the units)` : ""} · ${y.gain >= 0 ? "gain" : "loss"} ${money(Math.abs(y.gain))} (${y.pct.toFixed(1)}%)`;
    };
    $s(s, "f_type").onchange = () => { sync(); if (val("type") === "Real estate") $s<HTMLInputElement>(s, "f_excl").checked = true; calc(); };
    s.querySelectorAll("input").forEach((i) => { i.addEventListener("input", calc); i.addEventListener("change", calc); }); sync(); calc();
    $s(s, "f_openUnits").addEventListener("input", unitsTouched);
    $s<HTMLInputElement>(s, "f_epfPdf").onchange = (e) => { const t = e.target as HTMLInputElement; void epfPick([...(t.files ?? [])]); t.value = ""; };
    s.querySelector<HTMLElement>('label[for="f_epfPdf"]')!.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $s(s, "f_epfPdf").click(); } };
    $s(s, "epfClr").onclick = (e) => { const b = e.currentTarget as HTMLElement; if (!b.dataset.arm) { b.dataset.arm = "1"; b.textContent = "Tap again to remove the passbooks (then Save)"; return; } ebk = null; delete b.dataset.arm; b.textContent = "Remove passbook data"; epfStatus(); sync(); calc(); };
    $s(s, "epfOpen").onclick = () => { closeModal(); const S = E().state() as Record<string, unknown> | null; if (S) S.epfId = h.id; E().planner("go", "epf"); };
    ["epfRate", "epfRaise", "epfAge", "epfDob"].forEach((k) => $s(s, "f_" + k).addEventListener("input", epfStatus)); $s(s, "f_epfExp").addEventListener("change", () => { epfStatus(); calc(); });
    epfStatus();
    s.querySelectorAll<HTMLElement>("#npsSeg button").forEach((b) => { b.onclick = () => { npsMode = b.dataset.k!; s.querySelectorAll("#npsSeg button").forEach((y) => y.setAttribute("aria-pressed", String(y === b))); sync(); if (npsMode === "units" && !npsDrawn) void npsDraw(); calc(); }; });
    if (h.type === "NPS" && npsMode === "units") void npsDraw();
    $s(s, "f_name").addEventListener("input", () => { if (isNew) { $s<HTMLInputElement>(s, "f_instrument").value = val("name"); sync(); } });
    $s(s, "cx").onclick = closeModal;
    const dl = opt(s, "dl"); if (dl) dl.onclick = () => askConfirm(`Remove "${h.name}" from investments? Your investment entries stay.`, "Remove", () => { const r: Record<string, unknown> = { ...E().data().byId("holdings", h.id)!, deleted: true, updatedAt: Date.now() }; delete r.seed; E().write([{ c: "holdings", r: r as Rec }]); });
    $s(s, "sv").onclick = () => {
      const name = holdName(val("name"), val("type")); if (!name) { toast("Give it a name, e.g. the fund or stock."); return; }
      const type = val("type"), u = UNIT_TYPES.includes(type), price = parseFloat(val("price")), value = parseFloat(val("value"));
      const o: Record<string, unknown> = { ...h, id: h.id || uid(), type, name, platform: $s(s, "w_platform").hidden ? "" : val("platform"), instrument: val("instrument") || name, openInvested: P("openInvested"), inclTo: val("inclTo") || d.today, excludeNW: $s<HTMLInputElement>(s, "f_excl").checked || undefined };
      if (!o.excludeNW) delete o.excludeNW;
      for (const k of ["epfEmp", "epfEr", "joined", "opened", "yearly", "rate"]) delete o[k];
      if (type === "EPF") {
        const a = parseFloat(val("epfEmp")), b = parseFloat(val("epfEr")), r = parseFloat(val("rateE")); if (a > 0) o.epfEmp = Math.round(a * 100); if (b > 0) o.epfEr = Math.round(b * 100); if (val("joined")) o.joined = val("joined"); if (r > 0) o.rate = r;
        if (ebk) { o.epf = epfSet(); const e = epfCalc(d, { id: "", epf: o.epf } as Holding, { noProj: true }); if (e) { o.epfEmp = e.mon.emp; o.epfEr = e.mon.er; o.rate = (o.epf as EpfX).rate; } } else delete o.epf;
      } else delete o.epf;
      if (type === "PPF") { const y = parseFloat(val("yearly")), r = parseFloat(val("rateP")); if (val("opened")) o.opened = val("opened"); if (y > 0) o.yearly = Math.round(y * 100); if (r > 0) o.rate = r; }
      if (u) {
        o.openUnits = parseFloat(val("openUnits")) || 0; const us = type === "US Stocks";
        if (us && h.ccy !== "USD") { o.ccy = "USD"; if (price > 0) { o.price = price; o.priceDate = d.today; } }   // switching an older ₹-priced holding to $
        else if (price > 0 && price !== +(h.price ?? 0)) { o.price = price; o.priceDate = d.today; o.priceManual = true; }
        if (us) { const fx = parseFloat(val("fx")); if (fx > 0 && fx !== +(h.fx ?? 0)) { o.fx = fx; o.fxDate = d.today; o.priceDate = d.today; o.fxManual = true; } } else { delete o.fx; delete o.fxDate; delete o.ccy; delete o.fxAuto; delete o.fxManual; }
        delete o.value; delete o.valueDate;
      } else { if (value >= 0 && val("value") !== "" && Math.round(value * 100) !== num(h.value)) { o.value = Math.round(value * 100); o.valueDate = d.today; } delete o.price; delete o.priceDate; delete o.openUnits; }
      delete o.priceJump;
      const pk = pxKind(type);
      if ((pk === "mf" || pk === "stk" || pk === "us") && px) { if (px !== h.px) { o.px = px; delete o.priceAuto; delete o.navHist; delete o.priceManual; delete o.fxAuto; } }
      else { delete o.px; delete o.priceAuto; delete o.priceSrc; delete o.navHist; }
      if (!o.px) { delete o.priceManual; delete o.fxManual; }
      if (type === "NPS") { if (npsMode === "units") { const L = npsCollect(); if (!L.length) { toast("Enter the units of at least one scheme, or switch to Type the balance."); return; } o.npsMode = "units"; o.npsLines = L; } else delete o.npsMode; }
      else { delete o.npsMode; delete o.npsLines; }
      if (u || npsLines(o as Holding)) { const ua = val("unitsAsOf"); if (ua) o.unitsAsOf = ua; else delete o.unitsAsOf; } else delete o.unitsAsOf;
      const nv = holdingSum(d, o as Holding).value;
      o.history = ((h.history || []) as { date?: string }[]).filter((p) => p.date !== d.today).concat({ date: d.today, value: Math.round(nv) } as never).slice(-60);
      closeModal(); E().write([{ c: "holdings", r: { ...(o as Rec), updatedAt: Date.now() } }]); toast(isNew ? "Investment added" : "Updated");
      pxAfterSave();
    };
  });
}
