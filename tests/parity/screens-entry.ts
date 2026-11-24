/* Injected into the planner's frame by screens.mjs: the rewritten screens, next to the old ones. */
import { MoneyData } from "../../app/modules/money/calc/data.ts";
import * as txlist from "../../app/modules/money/views/txlist.ts";
import * as txform from "../../app/modules/money/ui/txform.ts";
import * as txsheets from "../../app/modules/money/ui/txsheets.ts";
import * as kit from "../../app/modules/money/ui/kit.ts";
import * as accounts from "../../app/modules/money/views/accounts.ts";
import * as charts from "../../app/modules/money/views/charts.ts";
import * as plan from "../../app/modules/money/views/plan.ts";
import * as home from "../../app/modules/money/views/home.ts";
import * as insights from "../../app/modules/money/views/insights.ts";
import { setEnv } from "../../app/modules/money/ui/env.ts";
import { toStored } from "../../app/modules/money/paise.ts";
import { MONEY_COLLECTIONS } from "../../app/core/store.ts";

(window as unknown as { SCREENS: unknown }).SCREENS = {
  txlist, txform, txsheets, kit, setEnv, accounts, charts, plan, home, insights,
  dataFrom(legacy: Record<string, unknown>, today: string) {
    const cols: Record<string, { id: string }[]> = {};
    for (const c of MONEY_COLLECTIONS) cols[c] = ((legacy[c] as { id: string }[]) ?? []).map((r) => toStored(c, r));
    return new MoneyData(cols, today);
  },
};
