/**
 * Properties: what each property has cost, how it was paid for, and what it adds to net worth.
 * Same rules as KP Money Planner, in paise. Interest comes from the bank statement's totals up to its last EMI,
 * then each later EMI from the loan's schedule (an estimate until the next statement).
 */
import { addDays, lastDay, pad, ymOf, type Day, type YM } from "./dates.ts";
import { num, type Loan, type MoneyData, type Paise, type Rec, type Txn } from "./data.ts";
import { bankOf, kindOf, loanSum, loanTx, schedule } from "./loans.ts";
import type { Account } from "./accounts.ts";
import { mainAcc } from "./forecast.ts";

/** Groups: [key, label, how it counts] — cost, separate (sep) or off-record (off). */
export const PG: [string, string, string][] = [["price","Price of the property","cost"],["govt","Government & registration","cost"],["legal","Legal & documents","cost"],["loan","Loan & bank","cost"],
  ["broker","Brokerage & agents","cost"],["builder","Builder extras","cost"],["util","Utilities","cost"],["setup","Set-up & move-in","sep"],["off","Off-record","off"],["run","Running costs","sep"]];
/** Built-in categories: [key, group, name, flag] — flag "bank" (paid by the loan), "int" (interest), "prin" (principal). */
export const PC0: string[][] = [
  ["token","price","Token / booking advance"],["agree","price","Agreement-time payment"],["inst","price","Instalment (construction-linked)"],["final","price","Final payment at registration"],
  ["bank","price","Paid by bank loan (disbursement)","bank"],["tds","price","TDS 1% paid for seller (Form 26QB)"],["plc","price","Floor rise / PLC (preferred location)"],["park","price","Car parking"],
  ["club","price","Clubhouse / amenities"],["gst","price","GST on the flat (under construction)"],
  ["stamp","govt","Stamp duty"],["regfee","govt","Registration fee"],["cess","govt","Cess & surcharge on stamp duty"],["estamp","govt","E-stamp / franking charges"],["sro","govt","Scanning & sub-registrar fees"],
  ["ec","govt","Encumbrance certificate (EC)"],["ccopy","govt","Certified copies of deed"],["khata","govt","Khata transfer / e-khata"],["better","govt","Betterment charges"],["taxarr","govt","Property tax arrears cleared"],
  ["dc","govt","DC conversion / land use (plots)"],["survey","govt","Survey / phodi / boundary sketch (plots)"],
  ["lawyer","legal","Lawyer's fees"],["title","legal","Title verification"],["agdraft","legal","Agreement drafting"],["sddraft","legal","Sale deed drafting"],["docw","legal","Document writer"],
  ["notary","legal","Notary / affidavit"],["poa","legal","Power of attorney"],["legoth","legal","Courier, travel & other"],
  ["proc","loan","Processing fee"],["admin","loan","Admin / login charges"],["cersai","loan","CERSAI fee"],["val","loan","Bank legal & technical valuation"],["motd","loan","MOTD stamp duty (title deed deposit)"],
  ["lstamp","loan","Loan agreement stamp / franking"],["lins","loan","Loan / property insurance"],["pemi","loan","Pre-EMI interest","int"],["emiint","loan","EMI interest","int"],["prepchg","loan","Prepayment / foreclosure charges"],["lprepay","loan","Prepayment of the property's loan (principal)","prin"],
  ["brok","broker","Broker commission"],["brokgst","broker","GST on brokerage"],["liaison","broker","Liaison / facilitation agent"],
  ["corpus","builder","Corpus / sinking fund"],["advmnt","builder","Advance maintenance"],["assoc","builder","Association membership / share certificate"],["bldleg","builder","Legal charges collected by builder"],
  ["infra","builder","Infrastructure / development charges"],["dg","builder","Generator / DG backup"],
  ["bescom","util","BESCOM deposit & meter"],["bwssb","util","BWSSB water & sanitary connection"],["gas","util","Gas pipeline connection"],["bore","util","Borewell / sump (plots)"],
  ["interior","setup","Interiors / modular kitchen"],["furn","setup","Furniture & appliances"],["fence","setup","Compound wall / fencing (plots)"],["puja","setup","Griha pravesha / puja"],["movers","setup","Packers & movers"],
  ["cash","off","Cash component of price"],["unoff","off","Unofficial payments (speed money)"],["offoth","off","Other cash, not on receipt"],
  ["maint","run","Maintenance"],["ptax","run","Property tax"],["hins","run","Home insurance"],["repair","run","Repairs"]];

interface PropCatsCfg extends Rec { custom?: { k: string; g: string; name: string }[]; hide?: string[]; names?: Record<string, string> }
export interface PropCat { k: string; g: string; name: string; base?: string; f: string; mine?: boolean; hidden?: boolean }

export interface PlanRow {
  id: string; name: string; amt?: Paise; gst?: Paise; when?: string; done?: boolean; status?: string;
  who?: "you" | "bank" | "split" | string; youAmt?: Paise; bankAmt?: Paise; tds?: boolean; paidOn?: Day; tdsDone?: boolean; accountId?: string;
}
export interface Property extends Rec {
  name?: string; rec?: string; since?: Day; status?: string; value?: Paise; cur?: Paise; curDate?: Day; nw?: boolean; loanId?: string;
  stmt?: { asOf?: Day; through?: YM; int?: Paise; pemi?: Paise; chg?: Paise; prin?: Paise; out?: Paise } | null;
  plan?: PlanRow[]; fund?: { by?: YM; ltv?: number; start?: Paise };
}
interface FundSplit { loan: string; amt: Paise; part: string }
interface PropItemRec extends Rec { prop?: string; cat?: string; amt?: Paise; date?: Day; txnId?: string; accountId?: string; loanId?: string; loanAmt?: Paise; funds?: FundSplit[] }
export interface PropItem extends PropItemRec { amt: Paise; date: Day; gone?: boolean; funds: FundSplit[]; fund: string; fundAmt: Paise; tnote?: string }
interface FundTxn extends Txn { fundLoan?: string; fundAmt?: Paise; fromLoan?: string; funds?: { loan: string; amt?: Paise; part?: string }[]; note?: string; pot?: string; toAccountId?: string }

const propCfg = (d: MoneyData): PropCatsCfg => d.byId<PropCatsCfg>("props", "propcats") ?? { id: "propcats", custom: [], hide: [], names: {} };
export const propList = (d: MoneyData): Property[] => d.live<Property>("props").filter((p) => p.rec !== "cats")
  .sort((a, b) => (a.since || "").localeCompare(b.since || "") || String(a.name).localeCompare(String(b.name)));

/** Every category (built-in and yours), with your names; hidden ones are kept for old entries. */
export function propCats(d: MoneyData): PropCat[] {
  return d.memo("pcats", () => {
    const c = propCfg(d), hide = new Set(c.hide ?? []);
    return [
      ...PC0.map(([k, g, name, f]) => ({ k: k!, g: g!, name: c.names?.[k!] || name!, base: name, f: f || "", mine: false })),
      ...(c.custom ?? []).map((x) => ({ k: x.k, g: x.g, name: c.names?.[x.k] || x.name, base: x.name, f: "", mine: true })),
    ].map((x) => ({ ...x, hidden: hide.has(x.k) }));
  });
}
export const pcOf = (d: MoneyData, k: string | undefined): PropCat => propCats(d).find((c) => c.k === k) ?? { k: k ?? "", g: "legal", name: k || "Other", f: "" };
export const pgOf = (g: string): [string, string, string] => PG.find((x) => x[0] === g) ?? PG[2]!;
export const pcHow = (c: PropCat): string => (c.f === "int" ? "int" : c.f === "prin" ? "prin" : pgOf(c.g)[2]);

/** The loan that paid for an expense (older single-loan form). */
function fundOf(t: FundTxn | undefined): { loan: string; amt: Paise } | null {
  if (!t || t.type !== "expense") return null;
  if (t.fundLoan) return { loan: t.fundLoan, amt: Math.min(num(t.fundAmt) || num(t.amount), num(t.amount)) };
  if (t.fromLoan) return { loan: t.fromLoan, amt: num(t.amount) };
  return null;
}
/** All the loans whose money paid for an expense. */
export function fundsOf(t: FundTxn | undefined): FundSplit[] {
  if (!t || t.type !== "expense") return [];
  const tot = Math.abs(num(t.amount));
  if ((t.funds ?? []).length) {
    let left = tot;
    return t.funds!.map((f) => { const a = Math.max(0, Math.min(num(f.amt), left)); left -= a; return { loan: f.loan, amt: a, part: f.part || "" }; })
      .filter((f) => f.loan && f.amt > 0);
  }
  const f = fundOf(t);
  return f ? [{ loan: f.loan, amt: f.amt, part: "" }] : [];
}

/** A property's items, with linked transactions read live (a refund or cashback counts as minus). */
export function propItems(d: MoneyData, p: Property): PropItem[] {
  return d.memo(`pi:${p.id}`, () => d.live<PropItemRec>("propItems").filter((i) => i.prop === p.id).map((i): PropItem => {
    if (i.txnId) {
      const t = d.byId<FundTxn>("txns", i.txnId);
      if (!t || t.deleted) return { ...i, gone: true, amt: 0, date: i.date ?? "", funds: [], fund: "", fundAmt: 0 };
      const fs = fundsOf(t);
      return { ...i, amt: (t.type === "income" ? -1 : 1) * num(t.amount), date: t.date ?? "", accountId: t.accountId, funds: fs, fund: t.fromLoan || "",
        fundAmt: fs.reduce((a, f) => a + f.amt, 0), tnote: t.note || "" };
    }
    const fs = (i.funds ?? []).length ? fundsOf({ id: "", type: "expense", amount: i.amt, funds: i.funds })
      : i.loanId ? [{ loan: i.loanId, amt: Math.min(num(i.loanAmt) || num(i.amt), num(i.amt)), part: "" }] : [];
    return { ...i, amt: num(i.amt), date: i.date ?? "", funds: fs, fund: (!i.accountId && i.loanId) || "", fundAmt: fs.reduce((a, f) => a + f.amt, 0) };
  }).sort((a, b) => b.date.localeCompare(a.date)));
}

interface SchedRowDated { ym: YM; int: number; prin: number; date: Day; emi: number; rate: number; [k: string]: unknown }
export interface PropInterest {
  l: Loan | null;
  st: Property["stmt"] | null;
  stInt: Paise;
  est: SchedRowDated[];
  estInt: number;
  estPrin: number;
  prepay: Paise;
  next: SchedRowDated | null;
  toCome: number;
  out: number;
}

/** Interest worked out from the loan for EMIs after the statement (or from the start, with no statement). */
export function propInt(d: MoneyData, p: Property): PropInterest {
  return d.memo(`pint:${p.id}`, () => {
    const l = p.loanId ? d.byId<Loan>("loans", p.loanId) : undefined;
    const st = p.stmt || null;
    const now = d.today;
    const out: PropInterest = { l: l && !l.deleted ? l : null, st, stInt: st ? num(st.int) + num(st.pemi) : 0, est: [], estInt: 0, estPrin: 0, prepay: 0, next: null, toCome: 0, out: 0 };
    if (!out.l) return out;
    const s = schedule(d, out.l);
    const b = bankOf(out.l) as ({ day?: number } & object) | null;
    const day = num(b?.day) || 10;
    const from = (st && st.through) || "";
    if (s) for (const r of s.rows) {
      if (from && r.ym <= from) continue;
      const due = `${r.ym}-${pad(Math.min(day, 28))}`;
      if (due <= now) { out.est.push({ ...r, date: due }); out.estInt += r.int; out.estPrin += r.prin; }
      else { if (!out.next) out.next = { ...r, date: due }; out.toCome += r.int; }
    }
    out.prepay = loanTx(d, out.l.id).filter((t) => t.act === "prepay" && (!st || (t.date ?? "") > (st.asOf ?? ""))).reduce((a, t) => a + num(t.amount), 0);
    out.out = loanSum(d, out.l).out;
    return out;
  });
}

export interface PropLoanShare { l: Loan & { lender?: string; name?: string }; amt: Paise; prep: Paise; share: number; iShare: number; int: number; paid: number; owed: number; come: number }

/** What a property has cost, how it was paid for, and what's still owed on it. */
export function propCalc(d: MoneyData, p: Property) {
  return d.memo(`pc:${p.id}`, () => {
    const items = propItems(d, p), I = propInt(d, p);
    const by: Record<string, Paise> = {}, grp: Record<string, Paise> = {};
    const fund = new Map<string, Paise>(), fpart = new Map<string, { b: number; o: number; u: number }>(), prepFund = new Map<string, Paise>();
    let cost = 0, intItems = 0, sep = 0, off = 0, bankPaid = 0, mine = 0, price = 0, prinFunded = 0;
    for (const i of items) {
      if (i.gone) continue;
      const c = pcOf(d, i.cat), how = pcHow(c);
      // A prepayment of the property's own loan isn't extra cost; it only matters when another loan funded it.
      const ext = i.funds.filter((f) => f.loan !== p.loanId), extAmt = ext.reduce((a, f) => a + f.amt, 0);
      const addF = (f: FundSplit, prep: boolean): void => {
        fund.set(f.loan, (fund.get(f.loan) ?? 0) + f.amt);
        const k = f.part === "bank" ? "b" : f.part === "own" ? "o" : "u";
        const m = fpart.get(f.loan) ?? { b: 0, o: 0, u: 0 };
        m[k] += f.amt;
        fpart.set(f.loan, m);
        if (prep) prepFund.set(f.loan, (prepFund.get(f.loan) ?? 0) + f.amt);
      };
      if (how === "prin") { by[i.cat!] = (by[i.cat!] ?? 0) + i.amt; ext.forEach((f) => addF(f, true)); prinFunded += extAmt; continue; }
      by[i.cat!] = (by[i.cat!] ?? 0) + i.amt;
      grp[c.g] = (grp[c.g] ?? 0) + i.amt;
      if (how === "cost") cost += i.amt; else if (how === "int") intItems += i.amt; else if (how === "off") off += i.amt; else sep += i.amt;
      if (c.g === "price") price += i.amt;
      const viaOwn = i.funds.some((f) => f.loan === p.loanId);
      if (c.f === "bank" || (viaOwn && !ext.length && i.fundAmt >= i.amt - 50)) bankPaid += i.amt;
      else { ext.forEach((f) => addF(f, false)); mine += i.amt - Math.min(i.amt, extAmt); }
    }
    // Other loans that paid part of it: the property carries their interest, and repayments count as your money,
    // in proportion to how much of the loan it used.
    const loans: PropLoanShare[] = [];
    let lInt = 0, lPaid = 0, lOwed = 0, lCome = 0;
    for (const [id, amt] of fund) {
      const l = d.byId<PropLoanShare["l"]>("loans", id);
      if (!l || l.deleted) { mine += amt; continue; }
      const x = loanSum(d, l), b = bankOf(l), bp = b ? num(b.principal) : 0;
      const borrowed = (x.own.borrowed || 0) + bp, share = borrowed > 0 ? Math.min(1, amt / borrowed) : 1;
      // For a loan with an interest-free part and a bank part, only money from the bank part carries the bank's interest.
      const m = fpart.get(id) ?? { b: 0, o: 0, u: amt };
      const iShare = kindOf(l) === "hybrid" ? (bp > 0 ? Math.min(1, (m.b + m.u * (bp / (borrowed || 1))) / bp) : 0) : share;
      const paid = Math.max(0, borrowed + x.paidInt - x.out);
      const o: PropLoanShare = { l, amt, prep: prepFund.get(id) ?? 0, share, iShare, int: iShare * x.paidInt, paid: share * paid, owed: share * x.out, come: iShare * Math.max(0, x.totalInt - x.paidInt) };
      loans.push(o);
      lInt += o.int; lPaid += o.paid; lOwed += o.owed; lCome += o.come;
    }
    const interest = intItems + I.stInt + I.estInt + lInt;
    const prin = (I.st ? num(I.st.prin) : 0) + I.estPrin + I.prepay;
    const loanPaid = loans.reduce((a, o) => a + o.amt, 0);
    const isBankLoan = (l: Loan): boolean => { const k = kindOf(l); return k !== "family" && k !== "hybrid"; };
    const owedBy: { name: string; amt: number; bank: boolean }[] = [];
    if (I.l && I.out > 50) owedBy.push({ name: String((I.l as PropLoanShare["l"]).lender || (I.l as PropLoanShare["l"]).name), amt: I.out, bank: isBankLoan(I.l) });
    for (const o of loans) if (o.owed > 50) owedBy.push({ name: String(o.l.lender || o.l.name), amt: o.owed, bank: isBankLoan(o.l) });
    const owedBank = owedBy.filter((x) => x.bank).reduce((a, x) => a + x.amt, 0);
    const owedFam = owedBy.filter((x) => !x.bank).reduce((a, x) => a + x.amt, 0);
    const paidBank = bankPaid + loans.filter((o) => isBankLoan(o.l)).reduce((a, o) => a + o.amt - o.prep, 0);
    const paidFam = loans.filter((o) => !isBankLoan(o.l)).reduce((a, o) => a + o.amt - o.prep, 0);
    return { items, I, by, grp, cost, interest, withInt: cost + interest, sep, off, bankPaid, loanPaid, loans, lInt, lPaid, mine, price,
      own: mine + I.stInt + I.estInt + prin - prinFunded + lPaid, prin, prinFunded, owed: I.out + lOwed, owedBy, owedBank, owedFam,
      paidBank, paidFam, toCome: I.toCome + lCome, everything: cost + interest + sep + off };
  });
}

export const propRegd = (p: Property): boolean => p.status === "registered" || p.status === "possession";

/**
 * What a property adds to net worth on a date: once registered, its current value (or agreement value, or cost);
 * before that, only what's been paid toward the price.
 */
export function propNwAt(d: MoneyData, p: Property, end?: Day): Paise {
  if (!p.nw) return 0;
  const at = end || d.today, c = propCalc(d, p);
  if (propRegd(p) && (!p.since || p.since <= at)) return num(p.cur) > 0 && (!p.curDate || p.curDate <= at) ? num(p.cur) : num(p.value) > 0 ? num(p.value) : c.cost;
  return c.items.filter((i) => !i.gone && pcOf(d, i.cat).g === "price" && i.date <= at).reduce((a, i) => a + i.amt, 0);
}
export function propNw(d: MoneyData): { on: Paise; off: Paise } {
  return d.memo("pnw", () => {
    let on = 0, off = 0;
    for (const p of propList(d)) { if (p.nw) on += propNwAt(d, p); else off += propNwAt(d, { ...p, nw: true }); }
    return { on, off };
  });
}

/** Still needed from you for a property, from its payment plan. */
export function propFundNeed(d: MoneyData, p: Property): number {
  const ltv = (p.fund?.ltv ?? 75) / 100, c = propCalc(d, p), rows = (p.plan ?? []).filter((r) => !r.done);
  const inst = rows.filter((r) => r.who === "split"), instT = inst.reduce((s, r) => s + num(r.amt) + num(r.gst), 0);
  const ownLeft = Math.max(0, Math.min(instT, (1 - ltv) * num(p.value) - c.price));
  return ownLeft + rows.filter((r) => r.who !== "split").reduce((s, r) => s + (r.who === "you" ? num(r.amt) + num(r.gst) : 0), 0)
    + rows.filter((r) => r.tds).reduce((s, r) => s + (num(r.amt) + num(r.gst)) * 0.01, 0);
}

export interface PropDue { key: string; src: "pp"; tds?: true; prop: string; rowId: string; name: string; type: "expense"; amount: Paise; date: Day; ym: YM; anyDay: false; auto: false; big: boolean; acc: string }

/** Dated payment-plan rows (and the TDS that follows a paid demand) as things to pay. */
export function propPlanDue(d: MoneyData, p: Property): PropDue[] {
  const out: PropDue[] = [];
  const main = (): string => mainAcc(d)?.id || "";
  for (const r of p.plan ?? []) {
    if (!r.done && r.when && r.when.length === 10 && r.who !== "bank") {
      const you = r.who === "you" ? num(r.amt) + num(r.gst) : num(r.youAmt);
      if (you > 50) out.push({ key: `pp:${p.id}|${r.id}`, src: "pp", prop: p.id, rowId: r.id, name: `${p.name} · ${r.name}`, type: "expense", amount: you,
        date: r.when, ym: r.when.slice(0, 7), anyDay: false, auto: false, big: true, acc: r.accountId || main() });
    }
    if (r.tds && r.paidOn && !r.tdsDone) {
      const t = (num(r.amt) + num(r.gst)) * 0.01, due = addDays(lastDay(ymOf(r.paidOn)), 30);
      out.push({ key: `pt:${p.id}|${r.id}`, src: "pp", tds: true, prop: p.id, rowId: r.id, name: `${p.name} · TDS (26QB) for ${r.name}`, type: "expense",
        amount: Math.round(t / 100) * 100, date: due, ym: due.slice(0, 7), anyDay: false, auto: false, big: false, acc: main() });
    }
  }
  return out;
}

/** The account holding the big-bills reserve and the emergency fund. */
export const reserveAcc = (d: MoneyData): (Account & { reserveStart?: Paise; emTarget?: Paise }) | null =>
  d.live<Account & { reserve?: boolean }>("accounts").find((a) => a.reserve && !a.hidden) ?? null;

/**
 * Money moved into or out of a pot (the reserve, a property fund) or back from the reserve. A month's set-aside done in
 * one transfer (approved 27 Nov 2026) carries its parts: { pot: "reserve" | "prop:<id>", amt } went into the reserve's
 * account and { back: "reserve", amt } came back out of it; the transfer's amount is what actually moved.
 */
export interface PotMove { pot?: string; back?: string; from: string; to: string; amt: Paise; date: Day }
export interface MovePart { pot?: string; back?: string; amt: Paise }
export function potMoves(d: MoneyData): PotMove[] {
  return d.memo("potmoves", () => {
    const out: PotMove[] = [];
    for (const t of d.live<Txn & { pot?: string; back?: string; parts?: MovePart[]; toAccountId?: string }>("txns")) {
      if (t.type !== "transfer" || !t.accountId || !t.toAccountId) continue;
      const date = String(t.date ?? "");
      if (t.parts?.length) {
        for (const x of t.parts) {
          if (x.pot) out.push({ pot: x.pot, from: t.accountId, to: t.toAccountId, amt: num(x.amt), date });
          else if (x.back) out.push({ back: x.back, from: t.toAccountId, to: t.accountId, amt: num(x.amt), date });
        }
      } else if (t.pot) out.push({ pot: t.pot, from: t.accountId, to: t.toAccountId, amt: num(t.amount), date });
      else if (t.back) out.push({ back: t.back, from: t.accountId, to: t.toAccountId, amt: num(t.amount), date });
    }
    return out;
  });
}

/** Money set aside in the reserve account for a property. */
export function propFundHeld(d: MoneyData, p: Property): Paise {
  const a = reserveAcc(d);
  if (!a) return 0;
  let h = num(p.fund?.start);
  for (const m of potMoves(d)) {
    if (m.pot !== `prop:${p.id}`) continue;
    if (m.to === a.id) h += m.amt;
    if (m.from === a.id) h -= m.amt;
  }
  return h;
}
