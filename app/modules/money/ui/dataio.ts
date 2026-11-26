/**
 * Money settings › Backup and Reminders, as in KP Money Planner: the readable Excel file, the data as JSON
 * (the planner's own file format, in rupees, so it opens in either app), restoring from a backup (merge, or
 * replace everything), the calendar file of bills and the "notify me on this device" reminders.
 */
import { esc } from "../../../core/dom.ts";
import { MONEY_COLLECTIONS } from "../../../core/store.ts";
import { mLabel } from "../calc/dates.ts";
import { num, type Loan, type MoneyData, type Rec, type Txn } from "../calc/data.ts";
import { balances, type Account } from "../calc/accounts.ts";
import { accName, catName } from "../calc/plan.ts";
import { holdingSum, invTypeOf, netWorth, type Holding } from "../calc/invest.ts";
import { kindOf, loanSum } from "../calc/loans.ts";
import { monthFigures } from "../calc/insights.ts";
import { fromStored } from "../paise.ts";
import { isEncryptedBackup, parseOldExport } from "../import.ts";
import { FREQ_LBL } from "../views/plan.ts";
import { isClosed, KIND_LBL } from "../views/accounts.ts";
import { money, payerLbl } from "../views/txlist.ts";
import { needsYou } from "../views/home.ts";
import { reminderItems } from "../views/more.ts";
import { ACC_LBL, closeModal, field, openSheet, toast } from "./kit.ts";
import { XL, type XlSheet } from "./xlsxw.ts";
import { E, prefGet, prefSet } from "./env.ts";

const TYPE_LBL: Record<string, string> = { expense: "Expense", income: "Income", investment: "Investment", transfer: "Transfer" };
const ACT_LBL: Record<string, string> = { borrow: "Borrowed", repay: "Repaid", prepay: "Part payment", missed: "Missed EMI", catchup: "Paid missed EMIs" };
const pad = (n: number): string => String(n).padStart(2, "0");
const R = (p: unknown): number => num(p) / 100;   // paise → the rupees the sheet shows
type Tx = Txn & { act?: string; loanId?: string; dir?: string; carry?: number; budgetId?: string; tags?: string[]; paidBy?: string; instrument?: string; invType?: string; link?: string };

/** The data as KP Money Planner holds it (rupees), deletions included. */
export function plannerData(d: MoneyData): Record<string, unknown> {
  const out: Record<string, unknown> = { schema: 1 };
  for (const c of MONEY_COLLECTIONS) out[c] = d.all(c).map((r) => fromStored(c, r));
  return out;
}

export function excelSheets(d: MoneyData): XlSheet[] {
  const split = (id: string | undefined): [string, string] => { const n = catName(d, id); const i = n.indexOf(" › "); return i < 0 ? [n, ""] : [n.slice(0, i), n.slice(i + 3)]; };
  const tx = d.live<Tx>("txns").slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (num(b.updatedAt)) - (num(a.updatedAt))).map((t) => {
    const ty = String(t.type); let type = TYPE_LBL[ty] || ty, cat = "", sub = "", flow = "Out", amt = R(t.amount);
    const item = t.note || "";
    if (t.type === "expense" || t.type === "income") { [cat, sub] = split(t.categoryId as string | undefined); if (t.type === "income") flow = "In"; }
    else if (t.type === "transfer") { flow = "Transfer"; }
    else if (t.type === "investment") { cat = invTypeOf(d, t as never) || "Investment"; sub = t.instrument || ""; }
    else if (t.type === "loan") { const l = t.loanId ? d.byId<Loan & { name?: string }>("loans", t.loanId) : undefined; type = `Loan · ${ACT_LBL[t.act ?? ""] || t.act}`; cat = l ? String(l.name) : "Loan"; flow = t.act === "borrow" ? "In" : t.act === "missed" ? "Owed" : "Out"; }
    else if (t.type === "carry") { type = "Carry-over"; cat = t.dir === "in" ? "Last month balance" : "Carried to next month"; amt = R(t.carry); flow = t.dir === "in" ? "In" : "Out"; }
    const b = t.budgetId ? d.byId<Rec & { name?: string }>("recurring", t.budgetId) : undefined;
    return [t.date ?? "", type, cat, sub, t.paidBy ? `${payerLbl(d, t as never)} (no balance kept)` : t.accountId ? accName(d, t.accountId) : "", t.toAccountId ? accName(d, t.toAccountId as string) : "", flow, amt, item, (t.tags || []).join(", "), b ? b.name : ""];
  });
  const bal = balances(d);
  type A = Account & { opening?: number; stmtDay?: number; dueDay?: number; main?: boolean };
  const acc = d.live<A>("accounts").map((a) => [a.name, ACC_LBL[String(a.type)] || a.type, R(bal.get(a.id) || 0), R(a.opening || 0), a.stmtDay || "", a.dueDay || "", a.main ? "Yes" : ""]);
  type RR = Rec & { name: string; budget?: boolean; type: string; amount?: number; freq?: string; day?: number; start?: string; end?: string; accountId?: string; instrument?: string; categoryId?: string; invType?: string };
  const rec = d.live<RR>("recurring").map((r) => [r.name, r.budget ? "Budget" : (TYPE_LBL[r.type] || r.type), R(r.amount), FREQ_LBL[String(r.freq)] || r.freq, r.day || "", r.start || "", r.end || "", r.accountId ? accName(d, r.accountId) : "", r.type === "investment" ? (r.instrument || "") : (r.categoryId ? catName(d, r.categoryId) : ""), r.type === "investment" ? (r.invType || "") : ""]);
  const loans = d.live<Loan & { name?: string; lender?: string }>("loans").map((l) => { const x = loanSum(d, l); return [l.name, KIND_LBL[kindOf(l)] || "", l.lender || "", R(x.out), x.emiNow ? R(x.emiNow) : "", x.rateNow || "", x.end || "", isClosed(d, l, x) ? "Closed" : "Open"]; });
  const hold = d.live<Holding & { platform?: string }>("holdings").map((h) => { const x = holdingSum(d, h); return [h.name, h.type, h.platform || "", x.byUnits ? x.units : "", R(x.inv), R(x.value), x.isUsd ? x.usdValue : "", x.isUsd ? (+(h.fx ?? 0) || "") : "", R(x.gain), x.inv > 0 ? x.gain / x.inv : "", x.asOf || "", h.excludeNW ? "No" : "Yes"]; });
  const y = d.today.slice(0, 4), months = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`).map((ym) => { const f = monthFigures(d, ym); return [mLabel(ym), f.kind === "actual" ? "Actual" : f.kind === "projected" ? "So far + still due" : "Plan", R(f.income), R(f.expense), R(f.investment), R(f.income - f.expense - f.investment)]; });
  const nw = netWorth(d);
  const nwr = [["Bank (month-end for " + (nw.mainAcc ? nw.mainAcc.name : "main account") + ")", nw.banks], ["Investments", nw.inv], ["Property", nw.prop], ["You own", nw.banks + nw.inv + nw.prop], ["Loans", -nw.loans], ["Card bills", -nw.cards], ["You owe", -(nw.loans + nw.cards)], ["Net worth at month-end", nw.total], ["Not counted (property)", nw.excluded]].map(([k, v]) => [k, R(v)]);
  return [
    { name: "Transactions", cols: [{ h: "Date", t: "d", w: 13 }, { h: "Type", w: 18 }, { h: "Category", w: 22 }, { h: "Subcategory", w: 24 }, { h: "Account", w: 16 }, { h: "To account", w: 16 }, { h: "Flow", w: 9 }, { h: "Amount (₹)", t: "m", w: 14 }, { h: "Note", w: 30 }, { h: "Tags", w: 16 }, { h: "Budget", w: 16 }], rows: tx },
    { name: `Months ${y}`, cols: [{ h: "Month", w: 12 }, { h: "Figures", w: 18 }, { h: "Income (₹)", t: "m", w: 15 }, { h: "Expenses (₹)", t: "m", w: 15 }, { h: "Invested (₹)", t: "m", w: 15 }, { h: "Balance (₹)", t: "m", w: 15 }], rows: months },
    { name: "Accounts", cols: [{ h: "Account", w: 22 }, { h: "Type", w: 13 }, { h: "Balance today (₹)", t: "m", w: 18 }, { h: "Opening (₹)", t: "m", w: 15 }, { h: "Statement day", t: "n", w: 14 }, { h: "Due day", t: "n", w: 10 }, { h: "Main account", w: 13 }], rows: acc },
    { name: "Regular items", cols: [{ h: "Name", w: 24 }, { h: "Kind", w: 12 }, { h: "Amount (₹)", t: "m", w: 14 }, { h: "Frequency", w: 16 }, { h: "Day", t: "n", w: 6 }, { h: "Starts", w: 10 }, { h: "Ends", w: 10 }, { h: "Account", w: 16 }, { h: "Category / investment", w: 30 }, { h: "Investment type", w: 16 }], rows: rec },
    { name: "Loans", cols: [{ h: "Loan", w: 20 }, { h: "Kind", w: 18 }, { h: "Lender", w: 16 }, { h: "Outstanding (₹)", t: "m", w: 17 }, { h: "EMI now (₹)", t: "m", w: 14 }, { h: "Rate %", t: "n", w: 9 }, { h: "Ends", w: 10 }, { h: "Status", w: 10 }], rows: loans },
    { name: "Investments", cols: [{ h: "Holding", w: 26 }, { h: "Type", w: 14 }, { h: "Platform", w: 14 }, { h: "Units", t: "n", w: 11 }, { h: "Invested (₹)", t: "m", w: 15 }, { h: "Current value (₹)", t: "m", w: 17 }, { h: "Value in $", t: "m", w: 13 }, { h: "₹ per $", t: "n", w: 9 }, { h: "Gain (₹)", t: "m", w: 14 }, { h: "Gain %", t: "p", w: 10 }, { h: "Value as of", t: "d", w: 13 }, { h: "In net worth", w: 12 }], rows: hold },
    { name: "Net worth", cols: [{ h: "Item", w: 36 }, { h: "Amount (₹)", t: "m", w: 18 }], rows: nwr },
  ];
}

/** Hands the viewer a file (the artifact's downloads when there is one, else a normal download). */
export async function saveFile(filename: string, bytes: BlobPart, mime: string): Promise<void> {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); toast("Downloaded " + filename);
}
export function exportExcel(): void {
  try { const bytes = XL.book(excelSheets(E().data())); void saveFile(`Akhila Vrutta Money ${E().data().today}.xlsx`, bytes as BlobPart, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); }
  catch (e) { toast("Couldn't build the Excel file (" + ((e as Error).message || "error") + ")."); }
}
export const dlJson = (): void => { const d = E().data(); void saveFile(`Akhila_Vrutta_Money_${d.today}.json`, JSON.stringify({ app: "KP Money Planner", exported: new Date().toISOString(), data: plannerData(d) }), "application/json"); };
export function copyJson(): void {
  const j = JSON.stringify(plannerData(E().data()), null, 1);
  (navigator.clipboard ? navigator.clipboard.writeText(j) : Promise.reject()).then(() => toast("Copied. Paste it into a note to keep a backup."), () => openSheet("Your data", `<div class="f"><label for="f_dump">Select all and copy</label><textarea id="f_dump" readonly>${esc(j)}</textarea></div><button class="btn" id="cx" type="button">Close</button>`, (s) => { s.querySelector<HTMLElement>("#cx")!.onclick = closeModal; }));
}

/** What restoring writes: merge (newer copy of each record wins) or replace everything (the backup wins, the rest is deleted). */
export function restoreWrites(d: MoneyData, j: unknown, replace: boolean, now = Date.now()): { c: string; r: Rec }[] {
  let x = j as Record<string, unknown>;
  if (x && x.data && typeof x.data === "object" && !MONEY_COLLECTIONS.some((c) => Array.isArray(x[c]))) x = x.data as Record<string, unknown>;   // a "Download data" file
  if (!x || !MONEY_COLLECTIONS.some((c) => Array.isArray(x[c]))) throw new Error("");
  const { records } = parseOldExport({ data: x });
  const ops: { c: string; r: Rec }[] = [];
  for (const c of MONEY_COLLECTIONS) {
    const got = records[c] ?? [], ids = new Set(got.map((r) => r.id));
    if (replace) {
      for (const r of got) ops.push({ c, r: { ...r, updatedAt: now } });
      for (const r of d.all(c)) if (!ids.has(r.id) && !r.deleted) ops.push({ c, r: { ...r, deleted: true, updatedAt: now } });
      continue;
    }
    // as the planner: a backup with categories first drops the starter accounts and categories here (stamped now), then merges
    const dropSeed = ["accounts", "categories"].includes(c) && ((x.categories as unknown[]) || []).length > 0;
    const cur = new Map<string, Rec>(), changed = new Set<string>();
    for (const r of d.all(c)) {
      if (dropSeed && (r as Rec & { seed?: boolean }).seed && !r.deleted) { const y: Record<string, unknown> = { ...r, deleted: true, updatedAt: now }; delete y.seed; cur.set(r.id, y as Rec); changed.add(r.id); }
      else cur.set(r.id, r);
    }
    for (const r of got) { const p = cur.get(r.id); if (!p || num(r.updatedAt) > num(p.updatedAt)) { cur.set(r.id, r); changed.add(r.id); } }
    for (const id of changed) ops.push({ c, r: cur.get(id)! });
  }
  return ops;
}
export function restoreSheet(): void {
  openSheet("Restore from backup", `${field(["json", "Paste backup JSON", "textarea"])}<div class="f"><label for="f_file">Or choose a backup file (.json)</label><input id="f_file" type="file" accept=".json,application/json"></div><p class="note">Restoring merges the backup with what's here; for each record the newer copy wins.</p>
      <label class="opt"><input type="checkbox" id="f_repl"><div><b>Replace everything here with this backup</b><span>A hard reset: this copy becomes exactly the backup. Anything that isn't in the backup is deleted, here and on your other devices when they sync. Download a backup of this copy first.</span></div></label>
      <div class="btns"><button class="btn pri" id="sv" type="button">Restore</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    const q = <T extends HTMLElement>(id: string): T => s.querySelector<T>("#" + id)!;
    q("cx").onclick = closeModal;
    q<HTMLInputElement>("f_file").onchange = async (ev) => { const f = (ev.target as HTMLInputElement).files?.[0]; if (f) q<HTMLTextAreaElement>("f_json").value = await f.text(); };
    q("sv").onclick = () => {
      try {
        const j: unknown = JSON.parse(q<HTMLTextAreaElement>("f_json").value);
        if (isEncryptedBackup(j)) throw new Error("This is an encrypted backup. Open it with Import in the app's main Settings tab.");
        const repl = q<HTMLInputElement>("f_repl").checked;
        if (repl) { const b = q("sv"); if (!b.dataset.arm) { b.dataset.arm = "1"; b.textContent = "Tap again to replace everything"; b.classList.add("danger"); return; } }
        const ops = restoreWrites(E().data(), j, repl);
        closeModal(); if (ops.length) E().write(ops); toast(repl ? "Replaced with the backup" : "Restored");
      } catch (e) { toast(e instanceof Error && e.message ? "Couldn't restore: " + e.message : "That isn't a valid backup. Paste the JSON copied from this app."); }
    };
  });
}

/* ---------- reminders ---------- */
export function icsText(d: MoneyData, stamp = new Date()): string {
  const Rm = reminderItems(d), st = stamp.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Akhila Vrutta//EN", ...Rm.flatMap((x, i) => ["BEGIN:VEVENT", `UID:kpmp-${i}-${x.d}@kp`, `DTSTAMP:${st}`, `DTSTART;VALUE=DATE:${x.d.replace(/-/g, "")}`, `SUMMARY:${x.t.replace(/[,;]/g, " ")}`, `DESCRIPTION:${x.s.replace(/[,;]/g, " ")}`, `RRULE:${x.rr}`, "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "TRIGGER:-P1D", "END:VALARM", "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
}
export const icsAll = (): void => { void saveFile("Akhila Vrutta bills.ics", icsText(E().data()), "text/calendar"); };
export async function notifyToggle(): Promise<void> {
  if (prefGet("notify", false)) { prefSet("notify", false); toast("Notifications off on this device"); E().refresh(); return; }
  if (!("Notification" in window)) { toast("This browser can't show notifications."); return; }
  const p = await Notification.requestPermission(); if (p !== "granted") { toast("Notifications weren't allowed."); return; }
  prefSet("notify", true); prefSet("notifDay", ""); E().refresh(); void maybeNotify(true);
}
export async function maybeNotify(force = false): Promise<void> {
  if (!prefGet("notify", false) || !("Notification" in window) || Notification.permission !== "granted") return;
  const d = E().data();
  if (!force && prefGet("notifDay", "") === d.today) return; prefSet("notifDay", d.today);
  const n = needsYou(d).filter((x) => x.w <= 1); if (!n.length) { if (force) toast("Nothing due in the next few days."); return; }
  const body = n.slice(0, 4).map((x) => `${x.t} · ${money(x.a)}`).join("\n") + (n.length > 4 ? `\n+${n.length - 4} more` : "");
  const title = `${n.length} thing${n.length === 1 ? "" : "s"} need you`;
  try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg && reg.showNotification) await reg.showNotification(title, { body, icon: "icons/icon-192.png", tag: "kpmp-due" }); else new Notification(title, { body }); } catch { /* not shown */ }
}
