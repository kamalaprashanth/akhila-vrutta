/* Injected into the planner's frame by calc.mjs: the new typed calculations, next to the old ones. */
import { MoneyData } from "../../app/modules/money/calc/data.ts";
import * as loans from "../../app/modules/money/calc/loans.ts";
import * as dates from "../../app/modules/money/calc/dates.ts";
import * as accounts from "../../app/modules/money/calc/accounts.ts";
import * as plan from "../../app/modules/money/calc/plan.ts";
import * as forecast from "../../app/modules/money/calc/forecast.ts";
import * as props from "../../app/modules/money/calc/properties.ts";
import * as insights from "../../app/modules/money/calc/insights.ts";
import * as reserve from "../../app/modules/money/calc/reserve.ts";
import * as invest from "../../app/modules/money/calc/invest.ts";
import { toStored, unclassified } from "../../app/modules/money/paise.ts";
import { MONEY_COLLECTIONS } from "../../app/core/store.ts";

(window as unknown as { NEW: unknown }).NEW = {
  loans, dates, accounts, plan, forecast, props, insights, reserve, invest,
  /** The planner's data (rupees) as stored (paise), wrapped for the new calculations. */
  dataFrom(legacy: Record<string, unknown>, today: string) {
    const cols: Record<string, { id: string }[]> = {};
    const unknown: string[] = [];
    for (const c of MONEY_COLLECTIONS) cols[c] = ((legacy[c] as { id: string }[]) ?? []).map((r) => {
      for (const p of unclassified(c, r)) unknown.push(`${c}: ${p}`);
      return toStored(c, r);
    });
    // Any number field the paise lists don't know would be converted wrongly: stop here.
    if (unknown.length) throw new Error(`number fields not classified as money or not: ${[...new Set(unknown)].join(", ")}`);
    return new MoneyData(cols, today);
  },
};
