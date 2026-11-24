/* Test page: the old KP Money Planner on its own (the reference the parity tests compare against), given the
   export the way Akhila Vrutta stores it (paise) and hands it back (rupees). It is no longer part of the app. */
import { MONEY_COLLECTIONS } from "../../app/core/store.ts";
import { parseOldExport } from "../../app/modules/money/import.ts";
import { fromStored } from "../../app/modules/money/paise.ts";
import { moneyData } from "../../app/modules/money/views/transactions.ts";
import { autoEntries } from "../../app/modules/money/ui/auto.ts";
import type { Rec } from "../../app/core/store.ts";

const j = await (await fetch("/export.json")).json();
const p = parseOldExport(j);
// as in the app: what Money makes by itself when it opens (carry-overs, card EMIs, the month's snapshot, payers)
const recs = new Map<string, Map<string, Rec>>(MONEY_COLLECTIONS.map((c) => [c, new Map((p.records[c] ?? []).map((r) => [r.id, r]))]));
for (const { c, r } of autoEntries(moneyData((c) => [...(recs.get(c)?.values() ?? [])], MONEY_COLLECTIONS))) recs.get(c)!.set(r.id, r);
const data: Record<string, unknown> = { schema: 1 };
for (const c of MONEY_COLLECTIONS) data[c] = [...recs.get(c)!.values()].map((r) => fromStored(c, r));
(window as unknown as { AV_MONEY: unknown }).AV_MONEY = {
  load: () => JSON.parse(JSON.stringify(data)),
  save: () => {}, onView: () => {}, ready: () => {}, moved: [], sheet: () => {}, toast: () => false,
  firebase: async () => null,
  callable: async () => { throw new Error("no cloud in tests"); },
};
const f = document.createElement("iframe");
f.id = "moneyFrame";
f.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0";
f.src = "/money/app#home";
document.body.appendChild(f);
