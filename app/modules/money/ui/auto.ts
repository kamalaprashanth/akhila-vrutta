/**
 * What the planner filled in by itself whenever it drew a page: the main account's carried balance for each
 * month just ended, card EMIs posted on their statement dates, a net-worth snapshot each month (refreshed at
 * most hourly), and the starter ways to pay. Each has a fixed id, so it is made once; one that was deleted is
 * never made again.
 */
import { kindOf } from "../calc/loans.ts";
import type { MoneyData, Rec } from "../calc/data.ts";
import { carriesToMake } from "../calc/forecast.ts";
import { catByName, cemiParts } from "../calc/plan.ts";
import { netWorth } from "../calc/invest.ts";
import { ymOf } from "../calc/dates.ts";

const PAYER_DEFAULTS = [{ id: "spouse", name: "Spouse", own: false, tag: "Home" }, { id: "cash", name: "Cash", own: true, tag: "" }, { id: "pluxee", name: "Pluxee", own: true, tag: "" }];
let snapT = 0;

export function autoEntries(d: MoneyData, now = Date.now()): { c: string; r: Rec }[] {
  const ops: { c: string; r: Rec }[] = [], st = (r: Rec): Rec => ({ ...r, updatedAt: now });
  if (!d.all("payers").length) for (const p of PAYER_DEFAULTS) ops.push({ c: "payers", r: { ...p, updatedAt: 1 } });
  const ids = new Set(d.all("txns").map((t) => t.id));
  for (const t of carriesToMake(d, ids)) ops.push({ c: "txns", r: st(t as Rec) });
  const intCat = catByName(d, "Interest Charges", "Fees & Charges", "Fees, legal & tax"), feeCat = catByName(d, "Service Charges", "Fees & Charges", "Fees, legal & tax");
  type CL = Rec & { kind?: string; accountId?: string; categoryId?: string; postFrom?: string; name?: string };
  for (const l of d.live<CL>("loans")) if (kindOf(l as never) === "cardemi" && l.accountId) for (const p of cemiParts(d, l as never)) {
    if (p.stmt > d.today) break;
    if (l.postFrom && p.stmt < l.postFrom) continue;   // statements before you added it are already in the card's balance
    const base = `cemi-${l.id}-${p.ym}`;
    const mk = (sfx: string, amount: number, cat: string | null | undefined, note: string): void => {
      if (amount < 0.5 || ids.has(base + sfx)) return;
      ops.push({ c: "txns", r: st({ id: base + sfx, type: "expense", amount, date: p.stmt, accountId: l.accountId, categoryId: cat || l.categoryId || null, note, cemi: l.id } as Rec) });
    };
    mk("-p", p.prin, l.categoryId, `${l.name} EMI ${p.k}/${p.n}`);
    mk("-i", p.intg, intCat, `${l.name} interest + GST ${p.k}/${p.n}`);
    mk("-f", p.fee, feeCat, `${l.name} processing fee + GST`);
  }
  if (now - snapT >= 36e5 && d.live("accounts").length) {
    snapT = now;
    const ym = ymOf(d.today), id = "nw-" + ym, x = d.byId<Rec & Record<string, number>>("snaps", id), n = netWorth(d) as unknown as Record<string, number>;
    const o: Record<string, unknown> = { id, ym, day: d.today };
    for (const k of ["total", "banks", "inv", "prop", "cards", "loans"]) o[k] = Math.round(n[k] ?? 0);
    if (!(x && !x.deleted && ["total", "inv", "prop", "loans", "banks", "cards"].every((k) => Math.abs((+x[k]! || 0) - (o[k] as number)) < 100))) ops.push({ c: "snaps", r: st(o as Rec) });
  }
  return ops;
}
/** For the screen test: the next call makes a snapshot again. */
export const resetSnapClock = (): void => { snapT = 0; };
