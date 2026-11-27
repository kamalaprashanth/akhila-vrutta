/**
 * The big-bills reserve, the emergency fund, and "ready for every payment" (each account's balance day by day).
 * Same rules as KP Money Planner, in paise.
 */
import { addDays, addM, dayDiff, dayIn, diffM, lastDay, ymOf, type Day, type YM } from "./dates.ts";
import { num, type Loan, type MoneyData, type Paise, type Rec, type Txn } from "./data.ts";
import { balances, countsAcc, dueOf, stmtFor, type Account } from "./accounts.ts";
import { kindOf } from "./loans.ts";
import { FREQ, paidMap, type PlanItem, type Recurring } from "./plan.ts";
import { forecast, mainAcc, type ForecastRow } from "./forecast.ts";
import { propFundHeld, propFundNeed, propList, propPlanDue, reserveAcc, type Property } from "./properties.ts";
import { emBase, emMonths } from "./insights.ts";

interface PotTxn extends Txn { pot?: string; toAccountId?: string }

/** This week's payment Tuesday (today if it's a Tuesday). */
export function payTue(d: MoneyData): Day {
  const g = new Date(`${d.today}T00:00`).getDay();
  return addDays(d.today, (2 - g + 7) % 7);
}

/** Paid for you: an auto-debited EMI, a regular item marked auto, or one charged to a card. */
export function isAutoItem(d: MoneyData, it: PlanItem): boolean {
  if (it.src === "l") { const l = d.byId<Loan & { manualEmi?: boolean }>("loans", it.id); return !!l && kindOf(l) !== "hybrid" && l.manualEmi !== true; }
  if (it.src === "r") {
    const r = d.byId<Recurring & { auto?: boolean }>("recurring", it.id);
    if (!r) return false;
    if (r.auto) return true;
    const a = r.accountId ? d.byId<Account>("accounts", r.accountId) : undefined;
    return !!(a && a.type === "card");
  }
  return false;
}
/** A big bill: a regular expense that comes round every 2 months or less often. */
export const isBigItem = (d: MoneyData, it: { src: string; id: string }): boolean =>
  it.src === "r" && (FREQ[d.byId<Recurring>("recurring", it.id)?.freq ?? ""] || 1) >= 2;
export const itemDate = (it: { day?: number | null }, ym: YM): Day | null => (it.day ? dayIn(Number(ym.slice(0, 4)), Number(ym.slice(5)), it.day) : null);
/** The account a planned item takes money from (or puts it into). */
export function itemAcc(d: MoneyData, it: PlanItem): string {
  if (it.src === "c") { const c = d.byId<Account>("accounts", it.id); return c?.payFrom || mainAcc(d)?.id || ""; }
  return it.accountId || "";
}

export interface Obligation extends Omit<Partial<ForecastRow>, "budget"> {
  key: string; name: string; type: string; amount: Paise; date: Day; ym: YM; anyDay: boolean; auto: boolean; big: boolean; acc: string;
  accountId?: string | null; toAccountId?: string;
  /** true for a budget (its planned amount is what's left of it) */
  budget?: boolean;
}

/** Everything still to pay or receive from the start of this month to `days` ahead, with a date. */
export function obligations(d: MoneyData, days = 60): Obligation[] {
  return d.memo(`obl:${days}`, () => {
    const td = d.today, end = addDays(td, days), now = ymOf(td), out: Obligation[] = [];
    const fc = forecast(d, Math.max(2, diffM(now, ymOf(end)) + 1));
    for (const m of fc.months) for (const r of m.rows) {
      if (r.paid || r.missed || !(r.amount > 50)) continue;
      let date = itemDate(r, m.ym), anyDay = false;
      if (!date) { date = m.ym === now ? lastDay(now) : `${m.ym}-01`; anyDay = true; }
      if (date > end) continue;
      out.push({ ...r, ym: m.ym, date, anyDay, auto: r.src === "b" || isAutoItem(d, r), budget: r.src === "b", big: isBigItem(d, r), acc: itemAcc(d, r) } as Obligation);
    }
    for (const p of propList(d)) for (const x of propPlanDue(d, p)) if (x.date <= end) out.push(x as unknown as Obligation);
    return out.sort((a, b) => a.date.localeCompare(b.date));
  });
}

/* ---------- the reserve ---------- */

export interface BigBill { r: Recurring; step: number; next: YM; left: number; amt: Paise; months: number; have?: Paise; ask?: Paise }

/** Big bills still to come, with when each is next due. */
export function bigBills(d: MoneyData): BigBill[] {
  const now = ymOf(d.today), paid = paidMap(d);
  return d.live<Recurring>("recurring").filter((r) => !r.budget && r.type === "expense" && (FREQ[r.freq ?? ""] || 1) >= 2 && (!r.end || r.end >= now)).map((r) => {
    const step = FREQ[r.freq ?? ""]!;
    let next = r.start >= now ? r.start : addM(r.start, Math.ceil(diffM(r.start, now) / step) * step);
    if (next === now && paid.has(`r:${r.id}|${now}`)) next = addM(next, step);
    const left = Math.max(0, diffM(now, next));
    // Months you can still put money aside: this month up to the month before it's due (at least 1).
    return { r, step, next, left, amt: num(r.amount), months: Math.max(1, left) };
  }).sort((a, b) => a.next.localeCompare(b.next));
}

/** Money in the reserve pot: what was set aside into it, less big bills paid from it. */
export function reserveHeld(d: MoneyData): Paise {
  return d.memo("rheld", () => {
    const a = reserveAcc(d);
    if (!a) return 0;
    let h = num(a.reserveStart);
    for (const t of d.live<PotTxn>("txns")) {
      if (t.pot !== "reserve") continue;
      if (t.type === "transfer") { if (t.toAccountId === a.id) h += num(t.amount); if (t.accountId === a.id) h -= num(t.amount); }
      else if (t.type === "expense") h -= num(t.amount);
    }
    return h;
  });
}

export interface PropFund { p: Property; need: number; have: Paise; by: YM; monthly: number; done: boolean }
export interface ReserveState {
  B: BigBill[]; a: ReturnType<typeof reserveAcc>; held: Paise; target: Paise; monthly: Paise; thisIn: Paise; behind: number;
  setAside: Paise; setAsideFull: Paise; capped: boolean; spareFrom: Account | null; doneThis: boolean;
  avg: number; emSuggest: Paise; emTarget: Paise; emergency: Paise; bal: Paise; funds: PropFund[];
}

/** Where the reserve stands: this month's set-aside, the emergency fund, property funds. */
export function reserveState(d: MoneyData): ReserveState {
  return d.memo("rstate", () => {
    const B = bigBills(d), a = reserveAcc(d), held = reserveHeld(d), now = ymOf(d.today), target = B.reduce((s, x) => s + x.amt, 0);
    // What went into the reserve this month (the set-aside and extra money alike).
    const thisIn = a ? d.live<PotTxn>("txns").filter((t) => t.pot === "reserve" && t.type === "transfer" && t.toAccountId === a.id && ymOf(t.date ?? "") === now)
      .reduce((s, t) => s + num(t.amount), 0) : 0;
    // This month's ask comes from what the reserve held when the month began, shared out to the soonest bills first;
    // what each still needs is spread over its months left.
    let pool = Math.max(0, held - thisIn), pool2 = Math.max(0, held);
    for (const x of B) {
      x.have = Math.min(x.amt, pool2); pool2 -= x.have;
      const st = Math.min(x.amt, pool); pool -= st;
      x.ask = Math.ceil(Math.max(0, x.amt - st) / x.months / 100) * 100; // whole rupees, rounded up
    }
    const monthly = B.reduce((s, x) => s + (x.ask ?? 0), 0);
    const setAsideFull = Math.max(0, Math.ceil((monthly - thisIn) / 100) * 100), doneThis = setAsideFull <= 50, behind = 0;
    // Only ask for what the main account can spare this month: its lowest point to month-end above its minimum.
    const m = mainAcc(d), src = a && m && m.id !== a.id ? m : null;
    let spare = Infinity;
    if (src && setAsideFull > 50) {
      const td = d.today, end = lastDay(now), ev: [Day, number][] = [];
      for (const o of obligations(d, Math.max(1, dayDiff(td, end) + 1))) {
        const day = o.date < td ? td : o.date;
        if (day > end) continue;
        if (o.type === "income") { if (o.acc === src.id) ev.push([day, num(o.amount)]); continue; }
        if (o.type === "transfer") { if (o.accountId === src.id) ev.push([day, -o.amount]); if (o.toAccountId === src.id) ev.push([day, num(o.amount)]); continue; }
        if (o.acc === src.id) ev.push([day, -o.amount]);
      }
      ev.sort((x, y) => x[0].localeCompare(y[0]) || x[1] - y[1]);
      let b = balances(d).get(src.id) ?? 0, low = b;
      for (const [, v] of ev) { b += v; if (b < low) low = b; }
      spare = Math.max(0, Math.floor((low - num((src as Account & { minBal?: Paise }).minBal)) / 100) * 100);
    }
    const setAside = Math.min(setAsideFull, spare), capped = setAside < setAsideFull - 50;
    const avg = emBase(d);
    const emSuggest = Math.round((avg * emMonths(d)) / 100000) * 100000; // nearest ₹1,000
    const emTarget = a && num(a.emTarget) > 0 ? num(a.emTarget) : emSuggest;
    const bal = a ? balances(d).get(a.id) ?? 0 : 0;
    const funds: PropFund[] = propList(d).filter((p) => p.fund && p.fund.by).map((p) => {
      const need = propFundNeed(d, p), have = propFundHeld(d, p), months = Math.max(1, diffM(now, p.fund!.by!));
      const monthlyP = Math.ceil(Math.max(0, need - have) / months / 100) * 100;
      const done = d.live<PotTxn>("txns").some((t) => t.pot === `prop:${p.id}` && t.type === "transfer" && ymOf(t.date ?? "") === now);
      return { p, need, have, by: p.fund!.by!, monthly: monthlyP, done };
    });
    const emergency = bal - held - funds.reduce((s, f) => s + f.have, 0);
    return { B, a, held, target, monthly, thisIn, behind, setAside, setAsideFull, capped, spareFrom: src, doneThis, avg, emSuggest, emTarget, emergency, bal, funds };
  });
}

/* ---------- the reserve in month figures (option B) ---------- */

export const resvOn = (d: MoneyData): boolean => !!reserveAcc(d);
/** A big bill paid from the reserve: already counted as set-aside, so not again as spending. */
export const resvPaid = (d: MoneyData, t: PotTxn): boolean => t.type === "expense" && t.pot === "reserve" && resvOn(d);
export const resvPlanned = (d: MoneyData, it: PlanItem): boolean => it.type === "expense" && resvOn(d) && isBigItem(d, it);

/** What's set aside for big bills in a month: actual for past months, this month's ask now, the plan later. */
export function setAsideOf(d: MoneyData, ym: YM): Paise {
  const a = reserveAcc(d);
  if (!a) return 0;
  const now = ymOf(d.today);
  const got = d.live<PotTxn>("txns").filter((t) => t.pot === "reserve" && t.type === "transfer" && t.toAccountId === a.id && ymOf(t.date ?? "") === ym)
    .reduce((s, t) => s + num(t.amount), 0);
  if (ym < now) return got;
  const st = reserveState(d);
  return ym === now ? got + st.setAside : st.monthly;
}

/* ---------- ready for every payment ---------- */

export interface Shortfall { acc: Account; date: Day; item: Obligation; need: Paise; bal: Paise; from?: Account | null; by?: Day }
export interface Low { acc: Account; low: Paise; lowD: Day; min: Paise }

/**
 * Each account's balance day by day for `days` ahead: every dip below its minimum (and how far it goes before
 * money next comes in), and where to move money from. The reserve account is never offered as a source.
 */
export function readiness(d: MoneyData, days = 45): Shortfall[] & { lows: Low[] } {
  return d.memo(`rdy:${days}`, () => {
    const td = d.today, bal = balances(d), O = obligations(d, days);
    const accs = d.live<Account & { minBal?: Paise }>("accounts").filter((a) => a.type !== "card" && countsAcc(a) && !a.hidden);
    const res = reserveAcc(d), held = res ? reserveHeld(d) : 0, short: Shortfall[] = [], spare = new Map<string, number>(), lows: Low[] = [];
    for (const a of accs) {
      const ev: [Day, number, Obligation][] = [];
      for (const o of O) {
        const day = o.date < td ? td : o.date; // overdue: assume it still goes out today
        if (o.type === "income") { if (o.acc === a.id) ev.push([day, num(o.amount), o]); continue; }
        if (o.type === "transfer") { if (o.accountId === a.id) ev.push([day, -o.amount, o]); if (o.toAccountId === a.id) ev.push([day, num(o.amount), o]); continue; }
        if (o.acc === a.id) ev.push([day, -o.amount, o]);
      }
      // This month's big-bills set-aside: from the main account into the reserve, by the payment Tuesday.
      if (res) {
        const sa = reserveState(d).setAside, m = mainAcc(d), src = m && m.id !== res.id ? m.id : null;
        if (sa > 50 && src) {
          const day = payTue(d) < td ? td : payTue(d);
          const o = { name: "Big-bills reserve", amount: sa, date: day, type: "transfer", accountId: src, toAccountId: res.id, key: "aside:reserve" } as Obligation;
          if (a.id === src) ev.push([day, -sa, o]);
          if (a.id === res.id) ev.push([day, sa, o]);
        }
      }
      ev.sort((x, y) => x[0].localeCompare(y[0]) || x[1] - y[1]);
      let b = bal.get(a.id) ?? 0, low = b, lowD = td, first: { date: Day; item: Obligation; bal: number } | null = null;
      const min = num(a.minBal);
      let gap = 0, open = false, inShort = false;
      const eps: { date: Day; item: Obligation; bal: number; gap: number }[] = [];
      const close = (): void => { if (first) { eps.push({ ...first, gap }); first = null; } };
      for (const [day, v, o] of ev) {
        b += v;
        if (b < low) { low = b; lowD = day; }
        if (b < min - 50 && !inShort && v < 0) { close(); first = { date: day, item: o, bal: b }; gap = b; open = true; inShort = true; }
        else if (open) { if (v > 0) open = false; else if (b < gap) gap = b; }
        if (v > 0 && b >= min - 50) inShort = false;
      }
      close();
      const protect = a.id === res?.id ? Math.max(0, (bal.get(a.id) ?? 0) - held) : 0;
      spare.set(a.id, a.id === res?.id ? 0 : Math.max(0, low - min - protect));
      lows.push({ acc: a, low, lowD, min });
      for (const e of eps) short.push({ acc: a, date: e.date, item: e.item, need: Math.ceil((min - e.gap) / 100) * 100, bal: e.bal });
    }
    for (const s of short) {
      const src = [...spare.entries()].filter(([id, v]) => id !== s.acc.id && v >= s.need).sort((x, y) => y[1] - x[1])[0];
      s.from = src ? d.byId<Account>("accounts", src[0]) ?? null : null;
      if (src) spare.set(src[0], src[1] - s.need);
      const back = (new Date(`${s.date}T00:00`).getDay() - 2 + 7) % 7, tue = addDays(s.date, -back);
      s.by = tue < td ? td : tue;
    }
    const r = short.sort((a, b) => a.date.localeCompare(b.date)) as Shortfall[] & { lows: Low[] };
    r.lows = lows.sort((a, b) => a.low - b.low);
    return r;
  });
}

/**
 * Big bills paid from the reserve, but with a card or another account (approved 27 Nov 2026): the money is still in
 * the reserve's account, so Pay by Tuesday asks to move it back, in the week it's needed: for a card spend, the
 * week its card bill is due (it goes to the main account, which pays the card bill); for another account, the
 * week it was paid (back to that account). Transfers out of the reserve's account marked back: "reserve" settle
 * the oldest first. One line per account it goes to, with the spends grouped by card bill.
 */
export interface BackItem { id: string; name: string; date: Day; amt: Paise }
export interface BackGroup { acc: string; due: Day; amt: Paise; items: BackItem[] }
export interface ReserveBack { from: Account; to: Account; amt: Paise; groups: BackGroup[] }
export function reserveBack(d: MoneyData, until: Day): ReserveBack[] {
  return d.memo(`rback:${until}`, () => {
    const from = reserveAcc(d);
    if (!from) return [];
    const accs = new Map(d.live<Account>("accounts").map((a) => [a.id, a])), main = mainAcc(d);
    const cats = new Map(d.live<Rec & { name?: string }>("categories").map((c) => [c.id, c.name]));
    // every reserve spend paid elsewhere: where its money goes back to, and when it's needed
    const owed = new Map<string, (BackItem & { acc: string; due: Day; left: Paise })[]>();
    for (const t of d.live<PotTxn & { hist?: boolean; note?: string; categoryId?: string }>("txns")) {
      if (t.type !== "expense" || t.pot !== "reserve" || t.hist || !t.accountId || t.accountId === from.id || num(t.amount) <= 0) continue;
      const a = accs.get(t.accountId);
      if (!a) continue;
      const card = a.type === "card", to = card ? (main && main.id !== from.id ? main : null) : a;
      if (!to) continue;
      const day = String(t.date ?? d.today), due = card && num(a.stmtDay) ? dueOf(a, stmtFor(a, day)) : day;
      const L = owed.get(to.id) ?? [];
      L.push({ id: t.id, name: String(t.note || (t.categoryId && cats.get(t.categoryId)) || "A big bill"), date: day, amt: num(t.amount), acc: String(a.name ?? ""), due, left: num(t.amount) });
      owed.set(to.id, L);
    }
    // what's been moved back already settles the oldest first
    for (const [toId, L] of owed) {
      let moved = d.live<PotTxn & { back?: string }>("txns").filter((t) => t.type === "transfer" && t.back === "reserve" && t.accountId === from.id && t.toAccountId === toId).reduce((x, t) => x + num(t.amount), 0);
      for (const it of L.sort((x, y) => x.due.localeCompare(y.due) || x.date.localeCompare(y.date))) { const k = Math.min(moved, it.left); it.left -= k; moved -= k; }
    }
    const out: ReserveBack[] = [];
    for (const [toId, L] of owed) {
      const due = L.filter((it) => it.left > 50 && it.due <= until);
      if (!due.length) continue;
      const groups = new Map<string, BackGroup>();
      for (const it of due) {
        const k = `${it.acc}|${it.due}`, g = groups.get(k) ?? { acc: it.acc, due: it.due, amt: 0, items: [] };
        g.amt += it.left; g.items.push({ id: it.id, name: it.name, date: it.date, amt: it.left }); groups.set(k, g);
      }
      const G = [...groups.values()].sort((x, y) => x.due.localeCompare(y.due));
      out.push({ from, to: accs.get(toId)!, amt: G.reduce((x, g) => x + g.amt, 0), groups: G });
    }
    return out;
  });
}
