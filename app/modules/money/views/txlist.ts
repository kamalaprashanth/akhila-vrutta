/**
 * The Transactions page, built from the stored data (amounts in paise). Same page as KP Money Planner's:
 * the same filters, rows, icons, totals and wording, so the HTML can be checked against the old one.
 * Pure: data and the page's state in, HTML out.
 */
import { addM, MN, mLabel, mShort, ymOf, type Day, type YM } from "../calc/dates.ts";
import { num, type MoneyData, type Paise, type Rec, type Txn } from "../calc/data.ts";
import { accEff, monthNet, type Account } from "../calc/accounts.ts";
import { accName, catName, catTop, fmtD } from "../calc/plan.ts";
import { mainAcc } from "../calc/forecast.ts";
import { invChg, invNet, offBook } from "../calc/insights.ts";
import { epfCalc, fyOf, ppfCalc, type Holding } from "../calc/invest.ts";
import { esc } from "../../../core/dom.ts";

/** The planner's filter (amounts typed in rupees, as text). */
export interface TxFilter {
  type: string; cat: string; acc: string; tag: string; period: string; from: string; to: string; q: string;
  min?: string; max?: string; hist?: string; uncat?: boolean;
}
/** What the page shows: the filter, the month, how many rows, and selection mode. */
export interface TxState { f: TxFilter; month: YM; txLimit?: number; selOn?: boolean; sel?: Set<string> }

export const TX_TYPES: [string, string][] = [["all", "All"], ["expense", "Expense"], ["income", "Income"], ["transfer", "Transfer"], ["investment", "Investment"], ["loan", "Loan"], ["epf", "EPF & PPF"], ["trade", "Trades"]];
export const PERIODS: [string, string][] = [["month", "Month"], ["3m", "Last 3 months"], ["year", "This year"], ["all", "All time"], ["custom", "Custom range"]];
export const blankFilter = (type = "all"): TxFilter => ({ type, cat: "", acc: "", tag: "", period: "month", from: "", to: "", q: "" });

export interface Tx extends Txn {
  toAccountId?: string; categoryId?: string; note?: string; instrument?: string; tags?: string[]; paidBy?: string;
  carry?: Paise; dir?: "in" | "out"; fromLoan?: string; fundLoan?: string; fundAmt?: Paise; funds?: { loan?: string; amt?: Paise; part?: string }[];
  budgetId?: string; splitOf?: string; charges?: Paise; link?: string; cemi?: string;
}
/** EPF, PPF and broker-trade entries listed for reference (never counted). Amounts in paise. */
export interface RefItem { id: string; type: "epf" | "trade"; date: Day; amount: Paise; title: string; sub: string; note: string; out: boolean; updatedAt: number; ccy?: string; hid?: string; mid?: string | null; fy?: number }
type Item = Tx | RefItem;
interface Payer extends Rec { name?: string; own?: boolean; tag?: string }
interface Category extends Rec { name?: string; parentId?: string | null; kind?: string }
interface Trade extends Rec { sym?: string; side?: string; ccy?: string; qty?: number; price?: number; amt?: number; date?: Day; broker?: string; ex?: string; isin?: string }
interface SavedView extends Rec { name?: string; f?: Partial<TxFilter> }

/* ---------- money as the planner shows it ---------- */
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
/** Whole rupees (summaries). */
export const money = (p: Paise): string => { const v = Math.round(p / 100); return inr0.format(v === 0 ? 0 : v); };
/** Rupees and paise (single entries). */
export const moneyP = (p: Paise): string => { const v = Math.round(p) / 100; return inr.format(v === 0 ? 0 : v); };
const usd = (n: number): string => "$" + (+n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs0 = (p: Paise): string => (p < 0 ? "−" : "") + "₹" + Math.abs(Math.round(p / 100)).toLocaleString("en-IN");
const fyLbl = (y: number): string => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
/** Paise in a lighter style and the ₹ sign marked, in text only (as the planner does after drawing a page). */
export const dress = (h: string): string => h.replace(/>([^<]+)</g, (_m, txt: string) => ">" + txt.replace(/(₹[\d,]+)\.(\d{2})(?![\dLCk])/g, '$1<span class="p">.$2</span>').replace(/₹/g, '<span class="cur">₹</span>') + "<");

/* ---------- people who pay for things ---------- */
/** Every payer, removed ones included (old entries still name them). */
const payersAll = (d: MoneyData): Payer[] => d.all<Payer>("payers");
export const payers = (d: MoneyData): Payer[] => [...d.live<Payer>("payers")].sort((a, b) => (a.own === b.own ? 0 : a.own ? 1 : -1) || String(a.name).localeCompare(String(b.name)));
const payerOf = (d: MoneyData, t: Tx): Payer | null => t.paidBy ? (payersAll(d).find((p) => p.id === t.paidBy) ?? { id: t.paidBy, name: t.paidBy, own: true }) : null;
export const payerLbl = (d: MoneyData, t: Tx): string => payerOf(d, t)?.name || "";
const othersPaid = (d: MoneyData, t: Tx): boolean => { const p = payerOf(d, t); return !!p && !p.own; };
const othersName = (d: MoneyData): string => { const o = payers(d).filter((p) => !p.own); return o.length === 1 ? String(o[0]!.name) : "others"; };

/** Tags, most used first. */
export function allTags(d: MoneyData): string[] {
  const m = new Map<string, number>();
  for (const t of d.live<Tx>("txns")) for (const g of t.tags ?? []) m.set(g, (m.get(g) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
}

/* ---------- loans that paid for an expense ---------- */
function fundsOf(t: Tx): { loan: string; amt: Paise }[] {
  if (t.type !== "expense") return [];
  const tot = Math.abs(num(t.amount));
  if ((t.funds ?? []).length) {
    let left = tot;
    return t.funds!.map((f) => { const a = Math.max(0, Math.min(num(f.amt), left)); left -= a; return { loan: f.loan ?? "", amt: a }; }).filter((f) => f.loan && f.amt > 0);
  }
  if (t.fundLoan) return [{ loan: t.fundLoan, amt: Math.min(num(t.fundAmt) || num(t.amount), num(t.amount)) }];
  if (t.fromLoan) return [{ loan: t.fromLoan, amt: num(t.amount) }];
  return [];
}
const loanName = (d: MoneyData, id: string | undefined): string | undefined => (id ? d.byId<Rec & { name?: string }>("loans", id)?.name : undefined);
const fundNames = (d: MoneyData, fs: { loan: string }[]): string => fs.map((f) => loanName(d, f.loan)).filter(Boolean).join(" + ");
const fromLoanName = (d: MoneyData, t: Tx): string => { const n = t.fromLoan && loanName(d, t.fromLoan); return n ? `Paid from ${n} (loan)` : "Paid from a loan"; };
const ACT_LBL: Record<string, string> = { borrow: "Borrowed", repay: "Repaid", prepay: "Part payment", missed: "Missed EMI", catchup: "Paid missed EMIs" };

/* ---------- which rows match ---------- */
export function txMatches(d: MoneyData, t: Item, f: TxFilter, month: YM): boolean {
  const x = t as Tx;
  if (f.type !== "all" && t.type !== f.type && !(f.type === "income" && t.type === "carry" && x.dir === "in")) return false;
  if (f.cat) { const c = x.categoryId ? d.byId<Category>("categories", x.categoryId) : undefined; if (!c || (c.id !== f.cat && c.parentId !== f.cat)) return false; }
  if (f.acc) {
    if (f.acc.startsWith("@")) { if (x.paidBy !== f.acc.slice(1)) return false; }
    else if (x.accountId !== f.acc && x.toAccountId !== f.acc) return false;
  }
  const rupees = num(t.amount) / 100;
  if (f.min && rupees < +f.min) return false;
  if (f.max && rupees > +f.max) return false;
  if (f.hist === "only" && !x.hist) return false;
  if (f.hist === "none" && x.hist) return false;
  if (f.uncat && !((t.type === "expense" || t.type === "income") && !(x.categoryId && d.byId("categories", x.categoryId)))) return false;
  const day = t.date ?? "", now = d.today;
  if (f.period === "month" && ymOf(day) !== month) return false;
  if (f.period === "3m" && day < addM(ymOf(now), -2) + "-01") return false;
  if (f.period === "year" && day.slice(0, 4) !== now.slice(0, 4)) return false;
  if (f.period === "custom" && ((f.from && day < f.from) || (f.to && day > f.to))) return false;
  if (f.tag && !(x.tags ?? []).includes(f.tag)) return false;
  if (f.q) {
    const q = f.q.toLowerCase(), ln = x.loanId ? loanName(d, x.loanId) : undefined;
    const hay = [...(x.tags ?? []), x.note, x.instrument, x.categoryId && catName(d, x.categoryId), accName(d, x.accountId), x.toAccountId && accName(d, x.toAccountId), ln, String(rupees)]
      .filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/* ---------- EPF, PPF and trades listed alongside (never counted) ---------- */
export function epfTxItems(d: MoneyData): RefItem[] {
  const out: RefItem[] = [];
  for (const h of d.live<Holding>("holdings")) if (h.type === "EPF" && h.epf) {
    const e = epfCalc(d, h, { noProj: true });
    if (!e) continue;
    type R = { k: string; d?: Day; wm?: YM | null; fy?: number; emp: Paise; er: Paise; eps: Paise; internal?: boolean; manual?: boolean; mid?: string };
    const add = (r: R, i: number | string): void => {
      if (!r.d) return;
      const k = r.k;
      if (k === "tout" || (k === "tin" && r.internal)) return;
      const title = k === "int" ? `EPF interest · FY ${fyLbl(r.fy!)}` : k === "cont" || k === "exp" ? `EPF · ${mLabel(r.wm!)} contribution` : k === "wd" ? "EPF withdrawal" : k === "ipr" ? "EPF back-period credit" : "EPF transfer in";
      const sub = `You ${rs0(r.emp)} · Employer ${rs0(r.er)}${r.eps ? ` · EPS ${rs0(r.eps)}` : ""}${k === "exp" ? " · expected" : ""}${r.manual ? " · added by you" : ""} · not from a bank account`;
      out.push({ id: `epf:${h.id}:${k}:${r.d}:${i}`, type: "epf", date: r.d, amount: r.emp + r.er, note: `${title} ${sub}`, title, sub, out: k === "wd", updatedAt: 0, hid: h.id, mid: r.mid, fy: r.fy ?? fyOf(r.d) });
    };
    (e.rows as R[]).forEach(add);
    (e.ints as R[]).forEach((r, i) => add({ ...r, k: "int" }, "i" + i));
    (e.expected as R[]).forEach((r, i) => add({ ...r, fy: fyOf(r.d!) }, "x" + i));
  }
  return out;
}
export function ppfTxItems(d: MoneyData): RefItem[] {
  const out: RefItem[] = [];
  for (const h of d.live<Holding>("holdings")) if (h.type === "PPF" && h.ppf) {
    const p = ppfCalc(d, h);
    if (!p) continue;
    const inst = String(h.instrument || "PPF").trim().toLowerCase();
    const mine = d.live<Tx>("txns").filter((t) => t.type === "investment" && String(t.instrument || "").trim().toLowerCase() === inst);
    p.rows.forEach((r, i) => {
      if (r.src === "txn") return;
      if (r.k === "dep" && mine.some((t) => Math.abs(num(t.amount) - r.amt) < 100 && Math.abs(+new Date(t.date ?? "") - +new Date(r.d)) <= 4 * 864e5)) return;
      const title = r.k === "int" ? `PPF interest · FY ${fyLbl(fyOf(r.d))}` : r.k === "wd" ? "PPF withdrawal" : "PPF deposit (from statement)";
      out.push({ id: `ppf:${h.id}:${r.k}:${r.d}:${i}`, type: "epf", date: r.d, amount: r.amt, note: `${title} PPF`, title, sub: `${r.src === "manual" ? "Added by you" : "SBI statement"} · not from a bank account`, out: r.k === "wd", updatedAt: 0, hid: h.id, mid: r.src === "manual" ? (r as { id?: string }).id ?? null : null });
    });
  }
  return out;
}
export function tradeTxItems(d: MoneyData): RefItem[] {
  return d.live<Trade>("trades").map((t) => {
    const amt = Math.round((t.amt ?? num(t.qty) * num(t.price)) * 100) / 100, buy = t.side === "buy", us = t.ccy === "USD";
    const f = (n: number): string => (us ? usd(n) : money(Math.round(n * 100)));
    return { id: "trd:" + t.id, type: "trade", ccy: t.ccy, date: t.date ?? "", amount: Math.round(amt * 100),
      title: `${t.sym} · ${buy ? "bought" : "sold"} ${us ? num(t.qty).toFixed(4) : t.qty} @ ${f(num(t.price))}`,
      sub: `${t.broker}${t.ex ? ` · ${t.ex}` : ""}${us ? ` · ${usd(amt)}` : ""} · not from a bank account`,
      note: `${t.sym} ${t.isin} ${t.broker} ${buy ? "buy bought" : "sell sold"}`, out: !buy, updatedAt: 0 };
  });
}

/* ---------- a row ---------- */
const ICO: Record<string, string> = {
  food: '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v6a2 2 0 0 1-2 2M7 3v6M16 3c-1.7 1.2-2.5 3-2.5 5.5 0 2 1 3 2.5 3.2V21"/>',
  cart: '<path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.3h8.6a1.5 1.5 0 0 0 1.5-1.2L20 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
  car: '<path d="M5 16v2.5M19 16v2.5M4 16h16v-4l-1.8-4.6A2 2 0 0 0 16.3 6H7.7a2 2 0 0 0-1.9 1.4L4 12z"/><path d="M4 12h16"/><circle cx="7.5" cy="14" r=".6"/><circle cx="16.5" cy="14" r=".6"/>',
  plane: '<path d="M10.5 13.5 4 11l1.5-1.5 6.5 1L16.5 6a2 2 0 0 1 2.8 2.8L15 13.3l1 6.5-1.5 1.5-2.5-6.5L9 17.5V20l-1.5 1L6 17.5 3 16l1-1.5h2.5z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M8 11.5h2l1-2 2 4 1-2h2"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  wifi: '<path d="M4.5 9.5a11 11 0 0 1 15 0M7.5 12.8a6.5 6.5 0 0 1 9 0M10.5 16a2 2 0 0 1 3 0"/><circle cx="12" cy="18.6" r=".6"/>',
  play: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9S10.5 4 8 5s1 4 4 4c3 0 5.5-3 4-4s-4 4-4 4"/>',
  lamp: '<path d="M12 3c1.5 2 2.5 3.2 2.5 4.7a2.5 2.5 0 0 1-5 0C9.5 6.2 10.5 5 12 3z"/><path d="M5 14h14l-2 4H7zM9 21h6M12 10.5V14"/>',
  receipt: '<path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.3 3 7.7 7 9.5 4-1.8 7-5.2 7-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M16 13.5h1.5"/>',
  trend: '<path d="M3 17 9.5 10.5l4 4L21 7"/><path d="M15 7h6v6"/>',
  bank: '<path d="M3.5 9 12 4l8.5 5zM5 9v8M9.5 9v8M14.5 9v8M19 9v8M3.5 20h17"/>',
  swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
  spark: '<path d="M12 3.5 13.8 9 19.5 10.5 13.8 12 12 17.5 10.2 12 4.5 10.5 10.2 9z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  repeat: '<path d="M17 3l3 3-3 3"/><path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M7 21l-3-3 3-3"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4"/>',
  people: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.8a3 3 0 0 1 0 5.4M17.5 14.2A5.5 5.5 0 0 1 20.5 19"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.3 6.3a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.3"/>',
  carry: '<path d="M4 12h13M13 7l5 5-5 5"/><path d="M20 5v14"/>',
};
const ICO_RULES: [RegExp, string, string][] = [
  [/salary|freelance|income|reimburse|splitwise|refund/i, "wallet", "green"], [/cashback|reward|dividend|interest &|^interest/i, "spark", "green"],
  [/emi|loan/i, "bank", "violet"], [/invest|sip|mutual|stock|ppf|nps|gold/i, "trend", "teal"],
  [/grocer|household/i, "cart", "green"], [/food|eat|restaurant|swiggy|zomato|dining|snack|delivery/i, "food", "amber"],
  [/fuel|transport|cab|uber|ola|auto|metro|parking|toll/i, "car", "blue"], [/travel|trip|flight|hotel/i, "plane", "blue"],
  [/health|medic|doctor|pharm|hospital|gym|fitness/i, "heart", "rose"], [/apparel|shopping|cloth|amazon|flipkart/i, "bag", "coral"],
  [/electric|power|utilit|gas|water/i, "bolt", "amber"], [/broadband|mobile|internet|recharge|phone/i, "wifi", "blue"],
  [/subscri|netflix|youtube|prime|spotify/i, "repeat", "violet"], [/entertain|movie|film/i, "play", "violet"],
  [/educat|school|course|book|tuition/i, "book", "blue"], [/gift|social/i, "gift", "rose"],
  [/pooja|temple|spirit|donat|vaastu|vastu/i, "lamp", "amber"], [/fee|charge|tax|legal/i, "receipt", "sand"],
  [/insur/i, "shield", "teal"], [/rent|maint|housing|home|furniture|property/i, "home", "sand"],
  [/beauty|groom|personal|salon/i, "spark", "rose"], [/family|support/i, "people", "coral"], [/cash/i, "cash", "green"],
];
function txIcon(d: MoneyData, t: { type?: string; categoryId?: string }): string {
  let k = "tag", h = "sand";
  if (t.type === "carry") { k = "carry"; h = "teal"; }
  else if (t.type === "transfer") { k = "swap"; h = "sand"; }
  else if (t.type === "investment") { k = "trend"; h = "teal"; }
  else if (t.type === "loan") { k = "bank"; h = "violet"; }
  else {
    const hay = [catName(d, t.categoryId) || "", t.type === "income" ? "income" : ""].join(" ");
    const r = ICO_RULES.find(([re]) => re.test(hay));
    if (r) { k = r[1]; h = r[2]; } else if (t.type === "income") { k = "wallet"; h = "green"; }
  }
  return `<span class="ico ${h}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICO[k]}</svg></span>`;
}

export function txLine(d: MoneyData, it: Item, st: TxState): string {
  if (it.type === "trade") {
    const t = it as RefItem;
    return `<div class="row tap epftx" data-tx="${esc(t.id)}" role="button" tabindex="0">${txIcon(d, { type: "investment" })}<div class="main"><div class="t">${esc(t.title)}</div><div class="s">${esc(t.sub)}</div></div><div class="amt ${t.out ? "in" : "mute"}">${t.out ? "+" : ""}${t.ccy === "USD" ? usd(t.amount / 100) : moneyP(t.amount)}</div></div>`;
  }
  if (it.type === "epf") {
    const t = it as RefItem;
    return `<div class="row tap epftx" data-tx="${esc(t.id)}" role="button" tabindex="0">${txIcon(d, { type: "investment" })}<div class="main"><div class="t">${esc(t.title)}</div><div class="s">${esc(t.sub)}</div></div><div class="amt ${t.out ? "out" : "mute"}">${t.out ? "−" : "+"}${moneyP(t.amount)}</div></div>`;
  }
  const t = it as Tx;
  if (t.type === "carry") {
    const v = t.dir === "in" ? num(t.carry) : -num(t.carry);
    return `<div class="row tap" data-tx="${esc(t.id)}" role="button" tabindex="0">${txIcon(d, t)}<div class="main"><div class="t">${t.dir === "in" ? "Last month balance" : "Carried to next month"}</div><div class="s">${t.dir === "in" ? `From ${mLabel(t.ym ?? "")}` : `Into ${mLabel(addM(t.ym ?? "", 1))}`} · ${esc(accName(d, t.accountId))}</div></div><div class="amt ${v >= 0 ? "in" : ""}">${v >= 0 ? "+" : "−"}${moneyP(Math.abs(v))}</div></div>`;
  }
  let title: string, sub: string, cls = "out", sign = "";
  if (t.type === "transfer") { title = `${accName(d, t.accountId)} → ${accName(d, t.toAccountId)}`; sub = t.note ? `Transfer · ${t.note}` : "Transfer"; cls = "mute"; }
  else if (t.type === "investment") { title = t.instrument || "Investment"; sub = `Investment · ${accName(d, t.accountId)}${invChg(t) ? ` · ${moneyP(invNet(t))} invested + ${moneyP(invChg(t))} charges` : ""}`; }
  else if (t.type === "loan") {
    const ln = t.loanId ? d.byId<Rec & { name?: string; lender?: string }>("loans", t.loanId) : undefined;
    title = `${ln ? ln.name : "Loan"} · ${ACT_LBL[t.act ?? ""]}${t.act === "missed" ? " " + mShort(t.ym ?? "") : ""}`;
    sub = t.act === "missed" ? `Paid to the bank by ${ln?.lender || "relative"} · now owed to them` : `Loan${t.part === "bank" && t.act === "borrow" ? " (bank part)" : ""} · ${t.accountId ? accName(d, t.accountId) : "No account"}`;
    if (t.act === "borrow") { cls = "in"; sign = "+"; }
    if (t.act === "missed") cls = "mute";
  } else {
    title = t.note || catName(d, t.categoryId);
    const fs = fundsOf(t);
    sub = `${t.note ? catName(d, t.categoryId) + " · " : ""}${t.paidBy ? (othersPaid(d, t) ? "Paid by " + payerLbl(d, t) : payerLbl(d, t)) + " · not in totals" : t.fromLoan ? fromLoanName(d, t) : accName(d, t.accountId) + (fs.length && !t.fromLoan ? ` · ${fundNames(d, fs)} money` : "")}`;
    if (t.type === "income") { cls = "in"; sign = "+"; }
    if (t.paidBy) cls = "mute";
  }
  const bud = t.budgetId ? d.byId<Rec & { name?: string }>("recurring", t.budgetId) : undefined;
  if (bud) sub += ` · ${bud.name} budget`;
  if (t.splitOf) sub += " · split";
  if (t.hist && (t.date ?? "") >= "2026-11-01") sub += " · already in balances";
  const picked = !!st.sel?.has(t.id);
  const selC = st.selOn ? ` selon ${picked ? "picked" : ""}` : "";
  return `<div class="row tap${selC}" data-tx="${esc(t.id)}" role="button" tabindex="0" ${selC ? `aria-pressed="${picked}"` : ""}>${txIcon(d, t)}<div class="main"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div>${(t.tags ?? []).length ? `<div class="tagrow">${t.tags!.map((g) => `<span class="tagmini">${esc(g)}</span>`).join("")}</div>` : ""}</div><div class="amt ${cls}">${sign}${moneyP(num(t.amount))}</div></div>`;
}

/* ---------- saved views and the bulk bar ---------- */
const VIEW_KEYS = ["type", "cat", "acc", "tag", "period", "from", "to", "q", "min", "max", "hist", "uncat"] as const;
export const viewOf = (f: Partial<TxFilter>): Record<string, unknown> => {
  const o: Record<string, unknown> = {};
  for (const k of VIEW_KEYS) { const v = f[k]; if (v !== undefined && v !== "" && v !== false) o[k] = v; }
  return o;
};
const sameView = (a: TxFilter, b: Partial<TxFilter> | undefined): boolean => JSON.stringify(viewOf(a)) === JSON.stringify(viewOf({ type: "all", period: "month", ...b }));
function viewChips(d: MoneyData, f: TxFilter): string {
  const V = [...d.live<SavedView>("views")].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!V.length) return "";
  return `<div class="vchips" role="group" aria-label="Saved views">${V.map((v) => `<button type="button" class="vc ${sameView(f, v.f) ? "on" : ""}" data-view="${esc(v.id)}">★ ${esc(v.name)}</button>`).join("")}</div>`;
}
function bulkBar(st: TxState): string {
  if (!st.selOn) return "";
  const n = st.sel?.size ?? 0;
  return `<div class="bulkbar" role="toolbar" aria-label="Selected transactions"><b>${n} selected</b><button type="button" data-bulk="all">Select all shown</button>${n ? `<button type="button" data-bulk="cat">Category</button><button type="button" data-bulk="tag">Add tag</button><button type="button" class="del" data-bulk="del">Delete</button>` : ""}<button type="button" data-bulk="done">Done</button></div>`;
}

/** The rows the page lists, newest first (before the "show more" limit). */
export function txRows(d: MoneyData, st: TxState): { tx: Tx[]; etx: RefItem[]; all: Item[] } {
  const f = st.f;
  const byDate = (a: Item, b: Item): number => (b.date ?? "").localeCompare(a.date ?? "") || num(b.updatedAt) - num(a.updatedAt);
  const tx = d.live<Tx>("txns").filter((t) => txMatches(d, t, f, st.month)).sort(byDate);
  const etx = (f.cat || f.acc || f.tag || f.uncat || f.hist === "only" || st.selOn) ? []
    : [...epfTxItems(d), ...ppfTxItems(d), ...tradeTxItems(d)].filter((t) => txMatches(d, t, f, st.month));
  const all: Item[] = etx.length ? [...tx, ...etx].sort(byDate) : tx;
  return { tx, etx, all };
}

/** The whole page. */
export function activityHtml(d: MoneyData, st: TxState): string {
  const f = st.f, { tx, etx, all } = txRows(d, st);
  const homeF = !!f.tag;
  const tot = { income: 0, expense: 0, investment: 0 } as Record<string, number>, sp = { n: 0, v: 0 }, ob = { n: 0, v: 0, who: new Set<string>() };
  for (const t of tx) {
    if (t.paidBy) { ob.n++; ob.v += num(t.amount); ob.who.add(payerLbl(d, t)); if (othersPaid(d, t)) { sp.n++; sp.v += num(t.amount); } continue; }
    if (tot[t.type ?? ""] !== undefined) tot[t.type!]! += num(t.amount);
    else if (t.type === "carry" && t.dir === "in") tot.income! += num(t.carry);
  }
  const acc = f.acc ? d.byId<Account>("accounts", f.acc) : undefined;
  let ain = 0, aout = 0;
  if (acc) for (const t of tx) { const e = accEff(acc.id, t); if (e > 0) ain += e; else aout -= e; }
  const byCat = new Map<string, number>();
  for (const t of tx) if (t.type === "expense" && (homeF || !offBook(t))) { const k = f.cat ? String(t.categoryId) : catTop(d, t.categoryId ?? ""); byCat.set(k, (byCat.get(k) ?? 0) + num(t.amount)); }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]), max = cats[0]?.[1] || 1;
  const shown = all.slice(0, st.txLimit || 300), more = all.length - shown.length;
  const g2 = new Map<string, Item[]>();
  for (const t of shown) { const k = t.date ?? ""; if (!g2.has(k)) g2.set(k, []); g2.get(k)!.push(t); }
  const chip = (k: string, label: string): string => `<button type="button" class="chip fchip" data-fclear="${k}" aria-label="Remove filter ${esc(label)}">${esc(label)} ✕</button>`;
  const pyF = f.acc && f.acc.startsWith("@") ? payersAll(d).find((p) => "@" + p.id === f.acc) : null;
  const actChips = [
    f.tag && chip("tag", `Tag: ${f.tag}`), f.cat && chip("cat", catName(d, f.cat)), acc && chip("acc", String(acc.name)), pyF && chip("acc", `Paid by ${pyF.name}`),
    (f.min || f.max) && chip("amt", f.min && f.max ? `₹${f.min} – ₹${f.max}` : f.min ? `From ₹${f.min}` : `Up to ₹${f.max}`),
    f.hist && chip("hist", f.hist === "only" ? "Only history" : "No history"), f.uncat && chip("uncat", "Uncategorised"),
    f.period !== "month" && chip("period", f.period === "custom" ? `${f.from ? fmtD(d, f.from) : "…"} – ${f.to ? fmtD(d, f.to) : "…"}` : PERIODS.find((p) => p[0] === f.period)![1]),
    f.q && chip("q", `"${f.q}"`),
  ].filter(Boolean) as string[];
  const dayTot = (ts: Item[]): string => {
    let i = 0, o = 0;
    for (const it of ts) {
      const t = it as Tx;
      if (acc) { const e = accEff(acc.id, t); if (e > 0) i += e; else o -= e; }
      else if (t.type === "income") i += num(t.amount);
      else if (t.type === "expense" && (homeF || !offBook(t))) o += num(t.amount);
      else if (t.type === "carry") { const v = t.dir === "in" ? num(t.carry) : -num(t.carry); if (v > 0) i += v; else o -= v; }
    }
    return `${i ? `<span class="amt in">+${money(i)}</span>` : ""}${o ? `<span class="amt">${money(o)}</span>` : ""}`;
  };
  const tags = allTags(d);
  const tiles = acc
    ? `<div class="sr"><span>Money in</span><b class="in">${money(ain)}</b></div><div class="sr"><span>Money out</span><b>${money(aout)}</b></div><div class="sr tot"><span>Net</span><b class="${ain - aout < 0 ? "neg" : ""}">${money(ain - aout)}</b></div>`
    : homeF
      ? `<div class="sr"><span>Paid by you</span><b>${money(tot.expense! + ob.v - sp.v)}</b></div>${sp.v > 50 ? `<div class="sr"><span>Paid by ${esc(othersName(d))}</span><b>${money(sp.v)}</b></div>` : ""}<div class="sr tot"><span>Total ${esc(f.tag)}</span><b>${money(tot.expense! + ob.v)}</b></div>`
      : `<div class="sr"><span>Spent (recorded)</span><b>${money(tot.expense!)}</b></div><div class="sr"><span>Income</span><b class="in">${money(tot.income!)}</b></div><div class="sr"><span>Invested</span><b>${money(tot.investment!)}</b></div>${ob.n ? `<div class="sr cnt"><span>Not counted: ${money(ob.v)} paid by ${[...ob.who].join(", ")} (no balance kept)</span></div>` : ""}`;
  const carryRow = ((): string => {
    const m = mainAcc(d);
    if (!m || f.period !== "month" || f.cat || f.acc || f.tag || f.q || f.type !== "all") return "";
    const net = monthNet(d, m.id, st.month), co = d.live<Tx>("txns").find((t) => t.type === "carry" && t.dir === "out" && t.ym === st.month && t.accountId === m.id);
    return `<div class="list" style="margin-bottom:8px"><div class="row ${co ? "tap" : ""}" ${co ? `data-tx="${esc(co.id)}" role="button" tabindex="0"` : ""}><div class="main"><div class="t">${esc(m.name)}: money in − out this month</div><div class="s">${co ? `${money(num(co.carry))} carried to ${mLabel(addM(st.month, 1))} · tap to edit` : st.month < ymOf(d.today) ? "Nothing to carry" : "Entries recorded so far · carries to next month on the 1st"}</div></div><div class="amt ${net < 0 ? "neg" : ""}">${money(net)}</div></div></div>`;
  })();
  const days = g2.size
    ? [...g2.entries()].map(([day, ts]) => {
      const dt = new Date(day + "T00:00");
      return `<div class="dayhd"><span class="dd">${dt.getDate()}</span><span class="dw">${dt.toLocaleDateString("en-IN", { weekday: "short" })}</span><span class="dm">${MN[dt.getMonth()]} ${dt.getFullYear()}</span><span class="sp"></span>${dayTot(ts)}</div><div class="list">${ts.map((t) => txLine(d, t, st)).join("")}</div>`;
    }).join("")
    : `<div class="list"><div class="empty">${d.live("txns").length ? "No transactions match these filters." : "No transactions yet. Tap + to add one."}</div></div>`;
  return `
  <div class="cols tx"><div>
  <div class="txsearch"><input type="search" id="txq" placeholder="Search notes, categories, accounts, amounts" value="${esc(f.q)}" autocomplete="off" aria-label="Search transactions"><button class="btn sm" type="button" id="txFilters">Filters${actChips.length ? ` (${actChips.length})` : ""}</button></div>
  ${viewChips(d, f)}
  <div class="btns" style="margin-top:8px"><button class="btn sm" type="button" id="txSel">${st.selOn ? "Selecting…" : "Select"}</button><button class="btn sm" type="button" id="txClean">Clean up</button></div>
  ${tags.length ? `<div class="typechips" role="group" aria-label="Tags">${tags.map((g) => `<button type="button" class="tagchip ${f.tag === g ? "on" : ""}" data-ftag="${esc(g)}" aria-pressed="${f.tag === g}">${esc(g)}</button>`).join("")}</div>` : ""}
  <div class="typechips" role="group" aria-label="Type">${TX_TYPES.map(([k, l]) => `<button type="button" class="chip ${f.type === k ? "" : "mute"} fchip" data-ftype="${k}" aria-pressed="${f.type === k}">${l}</button>`).join("")}</div>
  ${actChips.length ? `<div class="typechips">${actChips.join("")}<button type="button" class="chip mute fchip" data-fclear="all">Clear all</button></div>` : ""}
  ${f.period === "month" ? `<div class="monthbar"><button class="btn sm" type="button" data-m="-1" aria-label="Previous month">‹</button><div class="m"><label class="pick">${mLabel(st.month)}<input type="month" id="mpick" value="${st.month}" aria-label="Pick a month"></label></div><button class="btn sm" type="button" data-m="1" aria-label="Next month">›</button></div>` : ""}
  <div class="sumcard">${tiles}<div class="sr cnt"><span>${tx.length} transaction${tx.length === 1 ? "" : "s"}${acc ? ` touching ${esc(acc.name)}` : ""}${etx.length ? ` + ${etx.length} EPF / trade entr${etx.length === 1 ? "y" : "ies"} (not counted)` : ""}</span></div></div>
  ${carryRow}
  ${cats.length > 1 && (f.type === "all" || f.type === "expense") ? `<details class="fm"><summary><span class="mn">Spending by ${f.cat ? "subcategory" : "category"}</span><span class="sub" style="text-align:right">${cats.length}</span></summary><div class="list" style="border:0;border-top:1px solid var(--line);border-radius:0">${cats.map(([c, v]) => `<div class="row tap" data-fcat="${esc(c)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(catName(d, c))}</div><div class="bar"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div></div><div class="amt">${money(v)}</div></div>`).join("")}</div></details>` : ""}
  </div><div>
  ${days}
  ${more > 0 ? `<div class="btns" style="margin-top:12px;justify-content:center"><button class="btn" type="button" id="txMore">Show ${Math.min(more, 300)} more</button></div>` : ""}
  ${st.selOn ? '<div style="height:72px"></div>' : ""}</div></div>${bulkBar(st)}`;
}
