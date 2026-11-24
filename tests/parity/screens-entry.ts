/* Injected into the planner's frame by screens.mjs: the rewritten screens, next to the old ones. */
import { MoneyData } from "../../app/modules/money/calc/data.ts";
import * as txlist from "../../app/modules/money/views/txlist.ts";
import { toStored } from "../../app/modules/money/paise.ts";
import { MONEY_COLLECTIONS } from "../../app/core/store.ts";

(window as unknown as { SCREENS: unknown }).SCREENS = {
  txlist,
  dataFrom(legacy: Record<string, unknown>, today: string) {
    const cols: Record<string, { id: string }[]> = {};
    for (const c of MONEY_COLLECTIONS) cols[c] = ((legacy[c] as { id: string }[]) ?? []).map((r) => toStored(c, r));
    return new MoneyData(cols, today);
  },
};
