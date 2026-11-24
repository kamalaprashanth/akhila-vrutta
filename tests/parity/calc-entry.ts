/* Injected into the planner's frame by calc.mjs: the new typed calculations, next to the old ones. */
import { MoneyData } from "../../app/modules/money/calc/data.ts";
import * as loans from "../../app/modules/money/calc/loans.ts";
import * as dates from "../../app/modules/money/calc/dates.ts";
import { toStored } from "../../app/modules/money/paise.ts";
import { MONEY_COLLECTIONS } from "../../app/core/store.ts";

(window as unknown as { NEW: unknown }).NEW = {
  loans, dates,
  /** The planner's data (rupees) as stored (paise), wrapped for the new calculations. */
  dataFrom(legacy: Record<string, unknown>, today: string) {
    const cols: Record<string, { id: string }[]> = {};
    for (const c of MONEY_COLLECTIONS) cols[c] = ((legacy[c] as { id: string }[]) ?? []).map((r) => toStored(c, r));
    return new MoneyData(cols, today);
  },
};
