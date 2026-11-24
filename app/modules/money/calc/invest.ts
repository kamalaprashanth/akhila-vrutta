/**
 * Investments and net worth. Same rules as KP Money Planner, in paise.
 * Per-unit prices (NAVs, share prices) stay in rupees per unit with decimals, so units × price is converted
 * to paise here; US shares are priced in dollars and converted with the holding's exchange rate.
 */
import { addM, diffM, ymOf, type Day, type YM } from "./dates.ts";
import { num, type Loan, type MoneyData, type Paise, type Rec, type Txn } from "./data.ts";
import { balances, countsAcc, isHist, type Account } from "./accounts.ts";
import { bankOut, loanSum } from "./loans.ts";
import type { Recurring } from "./plan.ts";
import { forecast, mainAcc } from "./forecast.ts";
import { propNw } from "./properties.ts";
import { invNet } from "./insights.ts";

export const UNIT_TYPES = ["Mutual Fund", "Stock", "US Stocks", "Gold"];

interface NpsLine { k?: string; nm?: string; n?: string; units?: number; price?: number; priceDate?: Day; priceSrc?: string }
interface EpfRow { k: string; wm?: string | null; d?: Day; wage?: Paise; epsw?: Paise; emp: Paise; er: Paise; eps: Paise; from?: string; note?: string; [x: string]: unknown }
interface EpfYear { ob?: Paise[]; int?: Paise[]; close?: Paise[]; rows: EpfRow[] }
interface EpfManual { id?: string; k: string; fy?: number; wm?: string; d?: Day; emp?: Paise; er?: Paise; eps?: Paise; epsw?: Paise; note?: string }
interface PpfRow { k: string; d: Day; amt: Paise; id?: string; via?: string }

export interface Holding extends Rec {
  name?: string; instrument?: string; type?: string; closed?: boolean; excludeNW?: boolean;
  openInvested?: Paise; openUnits?: number; inclTo?: Day; history?: { date?: Day; value?: Paise }[];
  value?: Paise; valueDate?: Day; price?: number; priceDate?: Day; unitsAsOf?: Day; ccy?: string; fx?: number;
  npsMode?: string; npsLines?: NpsLine[];
  rate?: number; yearly?: Paise; epfEmp?: Paise; epfEr?: Paise; joined?: YM; opened?: Day;
  epf?: { books?: Record<string, { est?: string; fys?: Record<string, EpfYear> }>; manual?: EpfManual[]; rate?: number; raise?: number; retireAge?: number; dob?: Day; expected?: boolean };
  ppf?: { rows?: PpfRow[]; manual?: PpfRow[]; stmtDate?: Day; opened?: Day };
  nps?: { alloc?: Record<string, number>; dob?: Day; retireAge?: number; ret?: Record<string, number>; stmtDate?: Day; contrib?: Paise; charges?: Paise; xirr?: number; pfm?: string; choice?: string };
}
interface InvTxn extends Txn { instrument?: string; units?: number; invType?: string; link?: string; charges?: Paise }

const lc = (s: unknown): string => String(s ?? "").trim().toLowerCase();
const fyOfD = (d: string): number => { const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); return m >= 4 ? y : y - 1; };
export const fyOf = fyOfD;
const ageDays = (d: MoneyData, asOf: Day | null | undefined): number | null =>
  asOf ? Math.round((Date.parse(`${d.today}T00:00`) - Date.parse(`${asOf}T00:00`)) / 864e5) : null;

export const npsLines = (h: Holding): NpsLine[] | null =>
  h.type === "NPS" && h.npsMode === "units" && Array.isArray(h.npsLines) && h.npsLines.length ? h.npsLines : null;
export const holdingFor = (d: MoneyData, name: string | undefined): Holding | null => {
  if (!name) return null;
  const k = lc(name);
  return d.live<Holding>("holdings").find((h) => lc(h.instrument || h.name) === k) ?? null;
};
/** The kind of investment a transaction is: set on it, on its SIP, or the holding's type. */
export const invTypeOf = (d: MoneyData, t: InvTxn): string | null =>
  t.invType || (t.link && t.link.startsWith("r:") ? d.byId<Recurring & { invType?: string }>("recurring", t.link.slice(2).split("|")[0]!)?.invType : null)
  || holdingFor(d, t.instrument)?.type || null;

/* ---------- PPF: from the bank statement ---------- */

export function ppfCalc(d: MoneyData, h: Holding, today: Day = d.today) {
  const P = h.ppf;
  if (!P) return null;
  const now = today, rate = (num(h.rate) || 7.1) / 100, sd = P.stmtDate || "";
  const inst = lc(h.instrument || h.name || "PPF");
  type Row = PpfRow & { src: string; tid?: string };
  const rows: Row[] = [
    ...(P.rows ?? []).map((r) => ({ ...r, src: "stmt" })),
    ...(P.manual ?? []).map((m) => ({ ...m, src: "manual" })),
    ...d.live<InvTxn>("txns").filter((t) => t.type === "investment" && lc(t.instrument) === inst && (t.date ?? "") > sd)
      .map((t) => ({ k: "dep", d: t.date ?? "", amt: invNet(t), src: "txn", tid: t.id })),
  ].filter((r) => r.src !== "manual" || r.d > sd || r.k !== "dep").sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const sg = (r: Row): number => (r.k === "wd" ? -1 : 1);
  const sum = (k: string): Paise => rows.filter((r) => r.k === k).reduce((a, r) => a + r.amt, 0);
  const bal = rows.reduce((a, r) => a + sg(r) * r.amt, 0), dep = sum("dep"), int = sum("int"), wd = sum("wd");
  const fy0 = fyOfD(P.opened || rows[0]?.d || now), fyNow = fyOfD(now), idx = fyNow - fy0 + 1, matures = `${fy0 + 16}-04-01`;
  const balOn = (day: string): Paise => rows.filter((r) => r.d <= day).reduce((a, r) => a + sg(r) * r.amt, 0);
  const fyEnd = new Map<number, Paise>();
  for (let y = fy0; y < fyNow; y++) fyEnd.set(y, balOn(`${y + 1}-03-31`));
  // Interest: each month on the lowest balance between the 5th and the month end, credited on 31 March.
  const monthInt = (ym: YM, startBal: number): number => {
    const inM = rows.filter((r) => r.d.slice(0, 7) === ym && r.k !== "int");
    const low = startBal + inM.filter((r) => r.k === "dep" && Number(r.d.slice(8, 10)) <= 5).reduce((a, r) => a + r.amt, 0)
      - inM.filter((r) => r.k === "wd").reduce((a, r) => a + r.amt, 0);
    return (Math.max(0, low) * rate) / 12;
  };
  let accrued = 0;
  { let ym = `${fyNow}-04`; const nowYm = now.slice(0, 7); while (ym < nowYm) { accrued += monthInt(ym, balOn(`${ym}-00`)); ym = addM(ym, 1); } }
  const fyDep = (y: number): Paise => rows.filter((r) => r.k === "dep" && fyOfD(r.d) === y).reduce((a, r) => a + r.amt, 0);
  const yearly = num(h.yearly) > 0 ? num(h.yearly) : rows.filter((r) => r.k === "dep" && r.d > `${addM(now.slice(0, 7), -12)}-31`).reduce((a, r) => a + r.amt, 0);
  // Projection to maturity: the same yearly amount, paid monthly on the 3rd, interest at today's rate.
  const proj: [number, number][] = [];
  let mv: number | null = null;
  if (now < matures) {
    const nowYm = now.slice(0, 7), per = yearly / 12, depNow = rows.some((r) => r.k === "dep" && r.d.slice(0, 7) === nowYm);
    let b = bal, intY = accrued, ym = nowYm;
    while (ym < matures.slice(0, 7)) {
      if (ym !== nowYm || !depNow) b += per;
      intY += (b * rate) / 12;
      if (ym.endsWith("-03")) { b += intY; intY = 0; proj.push([Number(ym.slice(0, 4)) - 1, b]); }
      ym = addM(ym, 1);
    }
    mv = b + intY;
  }
  // Partial withdrawal from the 7th year: half the lower of the balance 4 years ago and last year.
  const wdOk = idx >= 7, wdMax = wdOk ? Math.min(fyEnd.get(fyNow - 4) ?? 0, fyEnd.get(fyNow - 1) ?? 0) * 0.5 : 0;
  const loanOk = idx >= 3 && idx <= 6, loanMax = loanOk ? (fyEnd.get(fyNow - 2) ?? 0) * 0.25 : 0;
  return { rows, bal, dep, int, wd, inv: dep - wd, value: bal, accrued, rate, fy0, fyNow, idx, matures, fyEnd, fyDepNow: fyDep(fyNow), yearly, proj, mv,
    wdOk, wdMax, loanOk, loanMax, sd, lastDep: rows.filter((r) => r.k === "dep").slice(-1)[0] };
}

/* ---------- EPF: from the loaded passbooks ---------- */

const EPF_RETIRE = 58;

export function epfCalc(d: MoneyData, h: Holding, opt: { today?: Day; noProj?: boolean } = {}) {
  const E = h.epf, books = E?.books ?? {};
  if (!E || (!Object.keys(books).length && !(E.manual ?? []).length)) return null;
  const now = opt.today || d.today, rate = (num(E.rate) || 8.25) / 100, raise = num(E.raise) / 100, age = num(E.retireAge) || EPF_RETIRE;
  type Row = EpfRow & { acc: string; fy: number; internal?: boolean; manual?: boolean; mid?: string };
  const rows: Row[] = [], ints: Row[] = [], issues: string[] = [];
  const accs: { acc: string; est: string; first: number; last: number; emp: Paise; er: Paise; eps: Paise }[] = [];
  let epfBal = 0, epsBal = 0;
  for (const [acc, b] of Object.entries(books)) {
    const fys = Object.keys(b.fys ?? {}).map(Number).sort((a, c) => a - c);
    if (!fys.length) continue;
    for (let i = 1; i < fys.length; i++) if (fys[i] !== fys[i - 1]! + 1) issues.push(`${acc}: passbook for FY ${fys[i - 1]! + 1}-${String((fys[i - 1]! + 2) % 100).padStart(2, "0")} is missing`);
    for (const fy of fys) {
      const Y = b.fys![fy]!;
      Y.rows.forEach((r) => rows.push({ ...r, acc, fy }));
      if (Y.int && (Y.int[0] || Y.int[1] || Y.int[2])) ints.push({ k: "int", acc, fy, d: `${fy + 1}-03-31`, emp: Y.int[0] ?? 0, er: Y.int[1] ?? 0, eps: Y.int[2] ?? 0 });
    }
    const lastFy = fys[fys.length - 1]!, Y = b.fys![lastFy]!, v = [...(Y.ob ?? [0, 0, 0])] as number[];
    for (const r of Y.rows) { const s = r.k === "dr" ? -1 : 1; v[0]! += s * r.emp; v[1]! += s * r.er; v[2]! += s * r.eps; }
    if (Y.int) { v[0]! += Y.int[0]!; v[1]! += Y.int[1]!; v[2]! += Y.int[2]!; }
    if (Y.close && (Y.close[0] !== v[0] || Y.close[1] !== v[1])) issues.push(`${acc}: FY ${lastFy} doesn't add up to the passbook's closing balance`);
    accs.push({ acc, est: b.est || "", first: fys[0]!, last: lastFy, emp: v[0]!, er: v[1]!, eps: v[2]! });
    epfBal += v[0]! + v[1]!;
    epsBal += v[2]!;
  }
  accs.sort((a, b) => a.first - b.first);
  // Entries added by hand: used until a passbook covering them is loaded.
  const pbWm = new Set(rows.filter((r) => r.k === "cont" && r.wm).map((r) => r.wm)), pbIntFy = new Set(ints.map((x) => x.fy));
  const manual: Row[] = [], manualOld: EpfManual[] = [];
  for (const m of E.manual ?? []) {
    const fy = m.k === "int" ? num(m.fy) : fyOfD(m.d ?? "");
    const sup = m.k === "cont" ? pbWm.has(m.wm) : m.k === "int" ? pbIntFy.has(fy) : rows.some((r) => r.k === "dr" && r.d === m.d && r.emp === num(m.emp) && r.er === num(m.er));
    if (sup) { manualOld.push(m); continue; }
    const r: Row = { k: m.k === "wd" ? "wd" : m.k, wm: m.wm || null, d: m.k === "int" ? `${fy + 1}-03-31` : m.d, wage: 0, epsw: num(m.epsw), emp: num(m.emp), er: num(m.er), eps: num(m.eps),
      note: m.note || "", acc: "manual", fy, manual: true, mid: m.id };
    if (m.k === "int") ints.push(r); else rows.push(r);
    const sg = m.k === "wd" ? -1 : 1;
    epfBal += sg * (r.emp + r.er);
    epsBal += sg * r.eps;
    manual.push(r);
  }
  // A DR in an account that was moved into another loaded account is that transfer, not a withdrawal.
  const tins = rows.filter((r) => r.k === "tin");
  for (const r of rows) if (r.k === "dr") {
    const t = tins.filter((x) => x.from === r.acc).reduce((a, x) => a + x.emp + x.er, 0);
    r.k = t && Math.abs(t - (r.emp + r.er)) <= Math.max(1000, (r.emp + r.er) * 0.02) ? "tout" : "wd";
  }
  for (const r of rows) if (r.k === "tin") r.internal = !!(r.from && books[r.from]);
  rows.sort((a, b) => ((a.d || "") < (b.d || "") ? -1 : (a.d || "") > (b.d || "") ? 1 : 0));
  const sum = (f: (r: Row) => boolean, k: "emp" | "er" | "eps"): Paise => rows.filter(f).reduce((a, r) => a + r[k], 0);
  const isC = (r: Row): boolean => r.k === "cont" || r.k === "ipr", isW = (r: Row): boolean => r.k === "wd", isX = (r: Row): boolean => r.k === "tin" && !r.internal;
  const contEmp = sum(isC, "emp"), contEr = sum(isC, "er"), contEps = sum(isC, "eps"), wd = sum(isW, "emp") + sum(isW, "er"), tinExt = sum(isX, "emp") + sum(isX, "er");
  const interest = ints.reduce((a, x) => a + x.emp + x.er, 0), invested = contEmp + contEr + tinExt - wd;
  // Months not loaded yet: the usual contribution, marked expected.
  const conts = rows.filter((r) => r.k === "cont" && r.wm), lastWm = conts.reduce((m, r) => (r.wm! > m ? r.wm! : m), "");
  const lastRow = conts.filter((r) => r.wm === lastWm).sort((a, b) => ((a.d ?? "") < (b.d ?? "") ? 1 : -1))[0];
  const mon = lastRow ? { emp: lastRow.emp, er: lastRow.er, eps: lastRow.eps, epsw: num(lastRow.epsw), wage: num(lastRow.wage) } : { emp: 0, er: 0, eps: 0, epsw: 0, wage: 0 };
  const dNow = new Date(`${now}T00:00`);
  dNow.setDate(dNow.getDate() - 15);
  const upTo = addM(`${dNow.getFullYear()}-${String(dNow.getMonth() + 1).padStart(2, "0")}`, -1);
  const expected: (typeof mon & { k: string; wm: YM; d: Day })[] = [];
  if (lastWm && E.expected !== false) for (let wm = addM(lastWm, 1); wm <= upTo; wm = addM(wm, 1)) expected.push({ k: "exp", wm, d: `${addM(wm, 1)}-15`, ...mon });
  const expAmt = expected.reduce((a, r) => a + r.emp + r.er, 0), expEps = expected.reduce((a, r) => a + r.eps, 0);
  // Interest builds up month by month on the balance at the start of each month, credited each 31 March.
  const fyOfYm = (ym: string): number => { const [y, m] = ym.split("-").map(Number); return (m ?? 0) >= 4 ? y! : y! - 1; };
  const nowYm = now.slice(0, 7), fyNow = fyOfYm(nowYm);
  let start = 0;
  for (const a of accs) { const Y = books[a.acc]!.fys![fyNow]; if (Y) start += Y.ob ? Y.ob[0]! + Y.ob[1]! : 0; else if (a.last < fyNow) start += a.emp + a.er; }
  for (const r of manual) if (r.fy < fyNow) start += (r.k === "wd" ? -1 : 1) * (r.emp + r.er);
  const credit = new Map<YM, number>();
  const addC = (ym: YM, v: number): void => { credit.set(ym, (credit.get(ym) ?? 0) + v); };
  for (const r of rows) if (r.d && fyOfYm(r.d.slice(0, 7)) === fyNow && (isC(r) || isX(r))) addC(r.d.slice(0, 7), r.emp + r.er);
  const debit = new Map<YM, number>();
  for (const r of rows) if (isW(r) && r.d && fyOfYm(r.d.slice(0, 7)) === fyNow) debit.set(r.d.slice(0, 7), (debit.get(r.d.slice(0, 7)) ?? 0) + r.emp + r.er);
  for (const r of expected) if (fyOfYm(r.d.slice(0, 7)) === fyNow) addC(r.d.slice(0, 7), r.emp + r.er);
  let b = start, accrued = 0;
  for (let ym = `${fyNow}-04`; ym < nowYm; ym = addM(ym, 1)) { b -= debit.get(ym) ?? 0; accrued += (b * rate) / 12; b += credit.get(ym) ?? 0; }
  // Projection to retirement: the same contribution every month (plus any yearly raise).
  const dob = E.dob || "", retYm = dob ? addM(dob.slice(0, 7), age * 12) : null;
  const proj: [string, number][] = [];
  let corpus: number | null = null, svcFuture = 0;
  if (retYm && retYm > nowYm && !opt.noProj) {
    let bal = start, intY = 0, m = { ...mon }, ym = `${fyNow}-04`;
    const futureCredit = new Map(credit);
    let lastCreditedWm = expected.length ? expected[expected.length - 1]!.wm : lastWm;
    for (;;) {
      if (ym >= nowYm) {
        if (ym.endsWith("-04") && ym > nowYm && raise) m = { ...m, emp: m.emp * (1 + raise), er: m.er * (1 + raise) };
        const wm = addM(ym, -1);
        if (wm > lastCreditedWm && wm < retYm) { futureCredit.set(ym, (futureCredit.get(ym) ?? 0) + m.emp + m.er); lastCreditedWm = wm; if (m.eps > 0) svcFuture++; }
      }
      bal -= debit.get(ym) ?? 0;
      intY += (bal * rate) / 12;
      bal += futureCredit.get(ym) ?? 0;
      if (ym.endsWith("-03")) { bal += intY; intY = 0; proj.push([`${ym.slice(0, 4)}-03-31`, bal]); }
      if (ym === retYm) { bal += intY; corpus = bal; proj.push([`${ym}-01`, bal]); break; }
      ym = addM(ym, 1);
    }
  }
  // Pension (EPS): service = months with a pension contribution.
  const epsMonths = new Set(conts.filter((r) => r.eps > 0).map((r) => r.wm));
  expected.forEach((r) => { if (r.eps > 0) epsMonths.add(r.wm); });
  const svcNow = epsMonths.size, svcAt58 = svcNow + svcFuture, yrs = (m: number): number => Math.floor(m / 12) + (m % 12 >= 6 ? 1 : 0);
  const svcYrs = yrs(svcAt58), bonus = svcYrs >= 20 ? 2 : 0;
  const pYrs = Math.min(35, svcYrs + bonus); // pensionable service is capped at 35 years
  const sal = mon.epsw || 1500000; // ₹15,000
  const pension = svcAt58 >= 120 ? Math.max(100000, Math.round((sal * pYrs) / 70 / 100) * 100) : null;
  const pensionLow = svcAt58 >= 120 ? Math.max(100000, Math.round((Math.min(sal, 1500000) * pYrs) / 70 / 100) * 100) : null;
  const epsLeft = accs.filter((a, i) => a.eps > 0 && i < accs.length - 1);
  const fyEnd = new Map<number, Paise>();
  for (const bk of Object.values(books)) for (const [fy, Y] of Object.entries(bk.fys ?? {})) { if (!Y.close) continue; fyEnd.set(Number(fy), (fyEnd.get(Number(fy)) ?? 0) + Y.close[0]! + Y.close[1]!); }
  return { accs, rows, ints, issues, manual, manualOld, epfBal, epsBal, contEmp, contEr, contEps, wd, tinExt, interest, invested, expected, expAmt, expEps, mon, lastWm,
    value: epfBal + expAmt, inv: invested + expAmt, accrued, rate, raise, fyNow, retYm, age, corpus, proj, svcNow, svcAt58, svcYrs, bonus, pYrs, sal, pension, pensionLow,
    epsLeft, fyEnd, dob, lastCredit: rows.filter((r) => r.d).reduce((m, r) => (r.d! > m ? r.d! : m), ""), partial: epfBal * 0.75 };
}

/* ---------- a holding's value ---------- */

export interface HoldingSum {
  inv: Paise; units: number; value: Paise; gain: Paise; pct: number; byUnits: boolean; asOf: Day | null | undefined; age: number | null; lastBuy: string;
  isUsd: boolean; usdValue: number | null; fxMissing: boolean; atCost: Paise; lines: NpsLine[] | null;
  ppf?: NonNullable<ReturnType<typeof ppfCalc>>; epf?: NonNullable<ReturnType<typeof epfCalc>>;
}

export function holdingSum(d: MoneyData, h: Holding): HoldingSum {
  if (h.type === "PPF" && h.ppf) {
    const p = d.memo(`ppf:${h.id}:${h.updatedAt ?? ""}`, () => ppfCalc(d, h));
    if (p) return { inv: p.inv, units: 0, value: p.value, gain: p.value - p.inv, pct: p.inv > 0 ? ((p.value - p.inv) / p.inv) * 100 : 0, byUnits: false, asOf: d.today, age: 0,
      lastBuy: p.lastDep ? p.lastDep.d : "", isUsd: false, usdValue: null, fxMissing: false, atCost: 0, lines: null, ppf: p };
  }
  if (h.type === "EPF" && h.epf && h.epf.books) {
    const e = d.memo(`epf:${h.id}:${h.updatedAt ?? ""}`, () => epfCalc(d, h, { noProj: true }));
    if (e) {
      const asOf = e.expected.length || h.epf.expected !== false ? d.today : e.lastCredit;
      return { inv: e.inv, units: 0, value: e.value, gain: e.value - e.inv, pct: e.inv > 0 ? ((e.value - e.inv) / e.inv) * 100 : 0, byUnits: false, asOf, age: ageDays(d, asOf),
        lastBuy: e.lastCredit, isUsd: false, usdValue: null, fxMissing: false, atCost: 0, lines: null, epf: e };
    }
  }
  const k = lc(h.instrument || h.name);
  let inv = num(h.openInvested), units = num(h.openUnits), lastBuy = "";
  const incl = h.inclTo || h.history?.[0]?.date || "";
  const lines = npsLines(h), byUnits = UNIT_TYPES.includes(String(h.type)), ua = ((byUnits || lines) && h.unitsAsOf) || "";
  // Entries after "units as of" that don't say how many units count at the amount paid, until the units are updated.
  let atCost = 0;
  for (const t of d.live<InvTxn>("txns")) {
    if (t.type !== "investment" || isHist(t) || lc(t.instrument) !== k || (incl && (t.date ?? "") <= incl)) continue;
    inv += invNet(t);
    units += num(t.units);
    if ((t.date ?? "") > lastBuy) lastBuy = t.date ?? "";
    if (ua && (t.date ?? "") > ua && !(num(t.units) > 0)) atCost += invNet(t);
  }
  const isUsd = h.type === "US Stocks" && h.ccy === "USD";
  const usdValue = isUsd ? units * num(h.price) : null;
  const linesValue = lines ? lines.reduce((a, l) => a + num(l.units) * num(l.price), 0) : 0;
  // units × price is in rupees (dollars × rate for US shares): × 100 for paise
  const value = (isUsd ? usdValue! * num(h.fx) * 100 : byUnits ? units * num(h.price) * 100 : lines ? linesValue * 100 : num(h.value)) + atCost;
  const asOf = lines ? lines.reduce<string>((m, l) => (!m || (l.priceDate && l.priceDate < m) ? l.priceDate || m : m), "") || null : byUnits ? h.priceDate : h.valueDate;
  return { inv, units, value, gain: value - inv, pct: inv > 0 ? ((value - inv) / inv) * 100 : 0, byUnits, asOf, age: ageDays(d, asOf), lastBuy, isUsd, usdValue,
    fxMissing: isUsd && !(num(h.fx) > 0), atCost, lines };
}

/* ---------- NPS ---------- */

const NPS_RET: Record<string, number> = { E: 10, C: 8, G: 7.5, A: 8 };
export const npsKey = (l: NpsLine): string => l.k || ((String(l.nm || l.n || "").match(/scheme\s+([ECGA])\b/i) || [])[1] || "").toUpperCase();

export function npsCalc(d: MoneyData, h: Holding) {
  const x = holdingSum(d, h), N = h.nps ?? {}, L = npsLines(h) ?? [], now = d.today;
  const lines = L.map((l) => ({ ...l, key: npsKey(l), value: num(l.units) * num(l.price) * 100, pct: 0 }));
  const tot = lines.reduce((a, l) => a + l.value, 0) || 1;
  lines.forEach((l) => { l.pct = (l.value / tot) * 100; });
  const inst = lc(h.instrument || "NPS");
  const entries = d.live<InvTxn>("txns").filter((t) => t.type === "investment" && lc(t.instrument) === inst).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const alloc = N.alloc || { E: 75, C: 10, G: 15 };
  const dob = N.dob || d.live<Holding>("holdings").find((e) => e.type === "EPF" && e.epf && e.epf.dob)?.epf?.dob || "";
  const at = num(N.retireAge) || 60, retYm = dob ? addM(dob.slice(0, 7), at * 12) : null;
  const rec = d.live<Recurring & { instrument?: string }>("recurring").find((r) => r.type === "investment" && lc(r.instrument) === inst && (!r.end || r.end >= ymOf(now)));
  const perYear: Record<string, number> = { monthly: 12, quarterly: 4, yearly: 1 };
  const yearly = num(h.yearly) > 0 ? num(h.yearly) : rec ? num(rec.amount) * (perYear[rec.freq ?? ""] || 12) : 0;
  const ret = Object.entries(alloc).reduce((a, [k, p]) => a + (num(p) / 100) * (N.ret?.[k] ?? NPS_RET[k] ?? 8), 0) / 100;
  let corpus: number | null = null;
  const proj: [number, number][] = [];
  if (retYm && retYm > ymOf(now)) {
    let b = x.value, ym = ymOf(now);
    const per = yearly / 12;
    while (ym < retYm) { b = b * (1 + ret / 12) + per; if (ym.endsWith("-03")) proj.push([Number(ym.slice(0, 4)) - 1, b]); ym = addM(ym, 1); }
    corpus = b;
  }
  const fyNow = fyOfD(now), fyIn = entries.filter((t) => fyOfD(t.date ?? "") === fyNow).reduce((a, t) => a + invNet(t), 0);
  return { x, N, lines, entries, alloc, dob, at, retYm, yearly, ret, corpus, proj, lump: corpus != null ? corpus * 0.6 : null, annuity: corpus != null ? corpus * 0.4 : null,
    pension: corpus != null ? (corpus * 0.4 * 0.06) / 12 : null, fyIn, unitsAsOf: h.unitsAsOf || N.stmtDate || "" };
}

/* ---------- EPF and PPF details (without passbooks) ---------- */

export function epfInfo(d: MoneyData, h: Holding, x: HoldingSum) {
  const r = (num(h.rate) || 8.25) / 100, mon = num(h.epfEmp) + num(h.epfEr), bal = x.value, now = ymOf(d.today);
  const svc = h.joined ? diffM(h.joined, now) : null, can = svc == null ? null : svc >= 12;
  const proj = (n: number): number => { let b = bal; for (let i = 0; i < n; i++) b = b * (1 + r) + mon * 12 * (1 + r * 0.46); return b; };
  return { r, mon, bal, svc, can, wd: bal * 0.75, int: bal * r, p5: proj(5), p10: proj(10) };
}
const fyLbl = (y: number): string => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
export function ppfInfo(d: MoneyData, h: Holding, x: HoldingSum) {
  const r = (num(h.rate) || 7.1) / 100, bal = x.value, td = d.today, fy0 = h.opened ? fyOfD(h.opened) : null, fyNow = fyOfD(td);
  if (fy0 == null) return { r, bal };
  const idx = fyNow - fy0 + 1, matures = `${fy0 + 16}-04-01`, yrsLeft = Math.max(0, fy0 + 16 - (fyNow + 1));
  // Past FY-end balances, worked back from today with the PPF deposits.
  const dep = new Map<number, Paise>();
  for (const t of d.live<InvTxn>("txns")) {
    if (t.type === "investment" && (invTypeOf(d, t) === "PPF" || lc(t.instrument) === lc(h.instrument || h.name))) dep.set(fyOfD(t.date ?? ""), (dep.get(fyOfD(t.date ?? "")) ?? 0) + num(t.amount));
  }
  const endOf = (fy: number): number => { let b = bal - (dep.get(fyNow) ?? 0); for (let y = fyNow - 1; y > fy; y--) b = b / (1 + r) - (dep.get(y) ?? 0); return Math.max(0, b); };
  const wdOk = idx >= 7, w = wdOk ? Math.min(endOf(fyNow - 4), endOf(fyNow - 1)) * 0.5 : 0, loanOk = idx >= 3 && idx <= 6, ln = loanOk ? endOf(fyNow - 2) * 0.25 : 0;
  let mv = bal;
  for (let i = 0; i < yrsLeft; i++) mv = mv * (1 + r) + num(h.yearly) * (1 + r);
  return { r, bal, fy0, idx, matures, yrsLeft, wdOk, w, wdFrom: fyLbl(fy0 + 6), loanOk, ln, mv, haveDeps: dep.size > 0 };
}

/* ---------- net worth ---------- */

/**
 * Net worth at the end of this month: the main account's month-end balance, card dues after this month's bills,
 * loans after this month's EMIs and repayments, and SIPs still to go counted as investments.
 */
export function netWorth(d: MoneyData) {
  const bal = balances(d), m = mainAcc(d), now = ymOf(d.today), nx = addM(now, 1);
  const rows0 = m ? forecast(d, 1).months[0]!.rows.filter((r) => !r.paid) : [];
  const pend = rows0.filter((r) => (r.type === "transfer"
    ? (r.accountId === m!.id) !== (r.toAccountId === m!.id) && (r.accountId === m!.id || r.toAccountId === m!.id)
    : !r.accountId || r.accountId === m!.id));
  const isIn = (r: (typeof rows0)[number]): boolean => r.type === "income" || (r.type === "transfer" && r.toAccountId === m!.id);
  const sum = (f: (r: (typeof rows0)[number]) => boolean): Paise => pend.filter(f).reduce((x, r) => x + r.amount, 0);
  const inS = sum(isIn), outS = sum((r) => !isIn(r));
  const bankNow = d.live<Account>("accounts").filter((a) => a.type !== "card" && countsAcc(a)).reduce((x, a) => x + (bal.get(a.id) ?? 0), 0);
  // Other counted bank accounts also move by month-end: money moved to them, EMIs and bills paid from them.
  const other = (id: string | null | undefined): boolean => { const a = id ? d.byId<Account>("accounts", id) : undefined; return !!a && a.type !== "card" && countsAcc(a) && (!m || a.id !== m.id); };
  let otherMove = 0;
  for (const r of rows0) {
    if (r.type === "transfer") { if (other(r.toAccountId)) otherMove += r.amount; if (other(r.accountId)) otherMove -= r.amount; }
    else if (other(r.accountId)) otherMove += r.type === "income" ? r.amount : -r.amount;
  }
  const mainNow = m ? bal.get(m.id) ?? 0 : 0, mainEnd = mainNow + inS - outS, banks = bankNow + mainEnd - mainNow + otherMove;
  const cardsNow = d.live<Account>("accounts").filter((a) => a.type === "card" && countsAcc(a)).reduce((x, a) => x + Math.max(0, -(bal.get(a.id) ?? 0)), 0);
  const counted = (r: (typeof rows0)[number]): boolean => !r.accountId || (!!m && r.accountId === m.id) || other(r.accountId);
  const sumAll = (f: (r: (typeof rows0)[number]) => boolean): Paise => rows0.filter((r) => f(r) && counted(r)).reduce((x, r) => x + r.amount, 0);
  const cards = Math.max(0, cardsNow - sumAll((r) => r.src === "c"));
  let loans = 0;
  for (const l of d.live<Loan>("loans")) {
    const x = loanSum(d, l);
    if (!x.out) continue;
    // By month-end this month's EMI is done.
    const bankDrop = x.b ? Math.max(0, bankOut(d, l, now) - bankOut(d, l, nx)) : 0;
    const famDrop = sumAll((r) => r.src === "p" && r.id === l.id);
    loans += Math.max(0, x.out - bankDrop - famDrop);
  }
  const sipPend = sumAll((r) => r.type === "investment");
  let inv = sipPend, excluded = 0, invested = sipPend;
  for (const h of d.live<Holding>("holdings")) { const x = holdingSum(d, h); if (h.excludeNW) excluded += x.value; else { inv += x.value; invested += x.inv; } }
  const pn = propNw(d);
  return { banks, mainAcc: m, mainEnd, otherBanks: banks - mainEnd, sipPend, inv, invested, excluded, prop: pn.on, propOff: pn.off, cards, loans,
    total: banks + inv + pn.on - cards - loans };
}

