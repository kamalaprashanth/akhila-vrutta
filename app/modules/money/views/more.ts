/**
 * Money settings, as in KP Money Planner (inside Akhila Vrutta): the setup checklist, the profile for the
 * advisor, people who pay without a balance, reminders, tags, categories, security and backups.
 */
import { isNative } from "../../../core/native.ts";
import { esc } from "../../../core/dom.ts";
import { addM, dayIn, dLabel, lastDay, mShort, ymOf, type Day } from "../calc/dates.ts";
import { num, type Loan, type MoneyData, type Paise, type Rec } from "../calc/data.ts";
import { cardInfo, countsAcc, dueOf, type Account } from "../calc/accounts.ts";
import { cardBills, catName, fmtD, FREQ, NSE_HOL, type Recurring } from "../calc/plan.ts";
import { bigBills } from "../calc/reserve.ts";
import { propList, reserveAcc, type Property } from "../calc/properties.ts";
import { bankOf, kindOf, loanSum, schedule } from "../calc/loans.ts";
import { allTags, money, payers } from "./txlist.ts";
import { FREQ_LBL, shortAmt } from "./plan.ts";
import { family } from "./advisor.ts";
import { catTree } from "../ui/kit.ts";
import type { Page } from "./pages.ts";

interface Profile extends Rec { dob?: string; age?: string | number; retire?: string; risk?: string; salary?: string; regime?: string; wifeCat?: string; termCover?: string; healthSum?: string; propUse?: Record<string, string>; assets?: string; nominees?: string; will?: string; updated?: string }
const prof = (d: MoneyData): Profile => d.byId<Profile>("settings", "profile") ?? { id: "profile" };
const appSet = (d: MoneyData): Rec & { holidays?: string[] } => d.byId("settings", "app") ?? { id: "app" };
const ageOf = (d: MoneyData, dob?: string): number | null => { if (!dob) return null; const t = d.today, y = +t.slice(0, 4) - +dob.slice(0, 4); return t.slice(5) >= dob.slice(5) ? y : y - 1; };
const myAge = (d: MoneyData): number | null => { const P = prof(d); return ageOf(d, P.dob) ?? (P.age ? +P.age : null); };

const PROF_SECS: [string, string][] = [["about", "About me"], ["income", "Income & tax"], ["ins", "Insurance"], ["goals", "Goals"], ["prop", "Property use"], ["assets", "Assets outside the app"], ["estate", "Nominees & will"]];
function profSub(d: MoneyData, k: string, P: Profile): string {
  const j = (a: (string | false | null | undefined | 0)[]): string => a.filter(Boolean).join(" · ");
  if (k === "about") { const F = family(d), a = myAge(d); return j([a != null && `Age ${a}`, P.retire && `retire at ${P.retire}`, F.length > 1 && F.slice(1).map((m) => m.n + (m.age != null ? ` (${m.age})` : "")).join(", "), P.risk && `${P.risk} risk`]); }
  if (k === "income") return j([P.salary && `${money(Math.round(+P.salary * 100))} a month`, P.regime && `${P.regime} regime`, P.wifeCat && `wife: ${catName(d, P.wifeCat)}`]);
  if (k === "ins") return j([+(P.termCover ?? 0) > 0 && `term ${shortAmt(Math.round(+P.termCover! * 100))}`, +(P.healthSum ?? 0) > 0 && `health ${shortAmt(Math.round(+P.healthSum! * 100))}`]);
  if (k === "goals") return d.live<Rec & { pri?: number; name?: string }>("goals").slice().sort((a, b) => (num(a.pri) || 99) - (num(b.pri) || 99)).map((g) => g.name).join(" · ") + " › in Plan";
  if (k === "prop") return j(d.live<Property>("props").map((p) => (P.propUse || {})[p.id] && `${p.name}: ${(P.propUse || {})[p.id]}`));
  if (k === "assets") return (P.assets || "").slice(0, 60);
  if (k === "estate") return j([P.nominees && `nominees ${P.nominees.toLowerCase()}`, P.will && `will: ${P.will.toLowerCase()}`]);
  return "";
}
/** Profile › About you (moved out of Money settings, 26 Nov 2026). */
export function profileSection(d: MoneyData): string {
  const P = prof(d);
  return `<h2>About you<span class="sp"></span>${P.updated ? `<span class="chip">Updated ${dLabel(P.updated)}</span>` : ""}</h2>
  <div class="list">${PROF_SECS.map(([k, l]) => { const s = profSub(d, k, P); return `<div class="row tap" data-prof="${k}" role="button" tabindex="0"><div class="main"><div class="t">${l}</div><div class="s">${esc(s) || '<span class="mut">Not filled in</span>'}</div></div><div class="amt mut">›</div></div>`; }).join("")}</div>
  <p class="note">Used for your goals in Money › Plan and for the Advisor's answers; never account numbers, PAN or PRAN. A reminder to review it shows every April.</p>`;
}
function setupChecks(d: MoneyData): { t: string; s: string; at: string }[] {
  const out: { t: string; s: string; at: string }[] = [], td = d.today, R = d.live<Recurring & { shift?: string }>("recurring").filter((r) => !r.end || r.end >= ymOf(td));
  for (const r of R.filter((r) => r.type === "investment" && !r.accountId)) out.push({ t: `${r.name}: no account to pay from`, s: "Needed for the readiness check and Invest day", at: `data-rec="${esc(r.id)}"` });
  for (const r of R.filter((r) => (r.type === "expense" || r.type === "investment") && !r.budget && !r.day && r.freq !== "once")) out.push({ t: `${r.name}: no due day`, s: "Without a day it can't go on Pay by Tuesday or the calendar", at: `data-rec="${esc(r.id)}"` });
  for (const a of d.live<Account & { hidden?: boolean }>("accounts").filter((a) => a.type === "card" && !a.hidden && !cardInfo(d, a))) out.push({ t: `${a.name}: statement and due day missing`, s: "Needed to work out each bill", at: `data-acc="${esc(a.id)}"` });
  if (!reserveAcc(d) && bigBills(d).length) out.push({ t: "No account holds the big-bills reserve", s: "Edit the account (e.g. Slice) and tick the reserve option", at: 'data-ptgo="cashflow"' });
  for (const p of propList(d) as (Property & { plan?: { done?: boolean }[]; fund?: { by?: string } })[]) if ((p.plan ?? []).some((r) => !r.done) && !(p.fund && p.fund.by)) out.push({ t: `${p.name}: no "ready by" date for its fund`, s: "Set it in the property's Expected tab › Fund settings", at: `data-prop="${esc(p.id)}"` });
  const ny = String(+td.slice(0, 4) + 1);
  if (td.slice(5, 7) === "12" && ![...NSE_HOL, ...(appSet(d).holidays ?? [])].some((x) => x.startsWith(ny)) && R.some((r) => r.shift === "trading")) out.push({ t: `Add ${ny}'s market holidays`, s: "NSE publishes them in December; Plan › Cash flow › Market holidays", at: 'data-holi="1"' });
  return out;
}
const nextDate = (d: MoneyData, day: number): Day => { const td = d.today; let ym = ymOf(td); const [y, m] = ym.split("-").map(Number) as [number, number]; let x = dayIn(y, m, day); if (x < td) { ym = addM(ym, 1); const [y2, m2] = ym.split("-").map(Number) as [number, number]; x = dayIn(y2, m2, day); } return x; };
const addDay = (x: Day): Day => { const t = new Date(x + "T00:00"); t.setDate(t.getDate() + 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const gcalUrl = (title: string, date: Day, details: string, rrule?: string): string => { const a = date.replace(/-/g, ""), b = addDay(date).replace(/-/g, ""); return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${a}/${b}&details=${encodeURIComponent(details || "")}${rrule ? `&recur=${encodeURIComponent("RRULE:" + rrule)}` : ""}`; };
const gcalLink = (title: string, date: Day, details: string, rrule?: string, lbl = "Add to Google Calendar"): string => `<a class="gcal" href="${esc(gcalUrl(title, date, details, rrule))}" target="_blank" rel="noopener">${lbl}</a>`;
export function reminderItems(d: MoneyData): { t: string; d: Day; rr: string; s: string }[] {
  const now = ymOf(d.today), out: { t: string; d: Day; rr: string; s: string }[] = [];
  for (const r of d.live<Recurring>("recurring")) if ((!r.end || r.end >= now) && r.day && r.freq !== "once") { const st = FREQ[String(r.freq)] || 1; out.push({ t: `${r.name}${r.type === "income" ? "" : " due"}`, d: nextDate(d, +r.day), rr: `FREQ=MONTHLY;INTERVAL=${st};BYMONTHDAY=${+r.day}${r.end ? `;UNTIL=${lastDay(r.end).replace(/-/g, "")}` : ""}`, s: `${money(num(r.amount))} · ${FREQ_LBL[String(r.freq)]}` }); }
  for (const a of d.live<Account & { dueDay?: number }>("accounts")) if (a.type === "card" && countsAcc(a) && num(a.dueDay)) out.push({ t: `${a.name} bill due`, d: nextDate(d, num(a.dueDay)), rr: `FREQ=MONTHLY;BYMONTHDAY=${num(a.dueDay)}`, s: "Credit card · every month" });
  for (const l of d.live<Loan & { name?: string }>("loans")) {
    const b = bankOf(l) as { day?: number } | null, s = schedule(d, l);
    if (!b || !s || !num(b.day) || kindOf(l) === "cardemi" || l.closedOn || !s.end || s.end < now) continue;
    out.push({ t: `${l.name} EMI`, d: nextDate(d, num(b.day)), rr: `FREQ=MONTHLY;BYMONTHDAY=${num(b.day)};UNTIL=${lastDay(s.end).replace(/-/g, "")}`, s: `${money(loanSum(d, l).emiNow)} · until ${mShort(s.end)}` });
  }
  return out.sort((a, b) => a.d.localeCompare(b.d));
}

/** The phone's reminders: as above, but a card only when it has a bill to pay. A card's every-month rule
 *  (right for a calendar file) is replaced by this month's and next month's actual bills: none when nothing is
 *  owed or the bill is already paid. */
export function phoneItems(d: MoneyData): { t: string; d: Day; rr: string; s: string }[] {
  const out = reminderItems(d).filter((x) => !x.t.endsWith(" bill due"));
  const cards = new Map(d.live<Account>("accounts").map((a) => [a.id, a]));
  const seen = new Set<string>();
  for (const ym of [ymOf(d.today), addM(ymOf(d.today), 1)]) for (const b of cardBills(d, ym)) {
    const a = cards.get(b.id); if (!a || b.paidC || b.amount < 50 || seen.has(b.key)) continue;
    seen.add(b.key);
    const due = dueOf(a, b.key.split("|")[1]!);
    out.push({ t: `${a.name} bill due`, d: due, rr: `FREQ=MONTHLY;UNTIL=${due.replace(/-/g, "")}`, s: "Credit card bill" });
  }
  return out.sort((a, b) => a.d.localeCompare(b.d));
}
function remindersCard(d: MoneyData, nOn: boolean): string {
  const R = reminderItems(d);
  return `<h2>Reminders</h2>
  <div class="card"><p style="margin:0 0 8px">For reminders on your phone, add your bills to Google Calendar once; each one repeats on its due day.</p>
  ${R.length ? `<details class="fm" style="box-shadow:none;background:var(--sunk)"><summary><span class="mn">${R.length} bills, EMIs and SIPs with a due day</span><span class="sub" style="text-align:right">tap to show</span></summary><div class="list" style="box-shadow:none;border-radius:0">${R.map((x) => `<div class="row"><div class="main"><div class="t">${esc(x.t)}</div><div class="s">${esc(x.s)} · next ${fmtD(d, x.d)}</div></div>${gcalLink(x.t, x.d, `${x.s}. From KP Money Planner.`, x.rr, "Add")}</div>`).join("")}</div></details>` : '<p class="note">Add a due day to your regular items, cards and loans to set reminders.</p>'}
  <div class="btns" style="margin-top:12px">${R.length ? '<button class="btn" type="button" id="icsAll">Download all as a calendar file</button>' : ""}<button class="btn" type="button" id="notifOn">${nOn ? "Turn off notifications" : "Notify me on this device"}</button></div>
  <p class="note">Notifications show when you open the app and something is overdue or due within 3 days. Reminders while the app is closed need Google Calendar (or a paid Firebase plan).</p>${isNative() ? '<p class="note">On this phone, bills, EMIs and card dues also come as notifications at 9 AM the day before and on the due day, even when the app is closed.</p>' : ""}</div>`;
}
const hostedCard = (): string => `<h2>Security &amp; saving</h2><div class="card"><p style="margin:0">Your money data is encrypted and saved by Akhila Vrutta. Unlocking, your passphrase and importing are in the app's main <b>Settings</b> tab.</p></div>`;

export function moreHtml(d: MoneyData, nOn: boolean): string {
  type C = Rec & { name: string; limit?: Paise };
  const crow = (c: C): string => `<div class="row tap" data-cat="${esc(c.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(c.name)}</div>${num(c.limit) > 0 ? `<div class="s">Limit ${money(num(c.limit))} a month</div>` : ""}</div></div>`;
  const tree = (k: string): string => catTree(d, k).map(({ c, subs }) => `${crow(c as C)}${subs.length ? `<div class="row" style="padding-left:28px;min-height:0;border-top:0;padding-top:0"><div class="main"><div class="s">${subs.map((s) => `<button class="chip mute" type="button" data-cat="${esc(s.id)}" style="border:0;cursor:pointer;margin:2px 4px 2px 0">${esc(s.name)}</button>`).join("")}</div></div></div>` : ""}`).join("");
  const CK = setupChecks(d), tags = allTags(d);
  return `
  <h2>Setup checklist<span class="sp"></span>${CK.length ? `<span class="chip warn">${CK.length} to do</span>` : '<span class="chip">All set ✓</span>'}</h2>
  ${CK.length ? `<div class="list">${CK.map((x) => `<div class="row tap" ${x.at} role="button" tabindex="0"><div class="main"><div class="t">${esc(x.t)}</div><div class="s">${esc(x.s)}</div></div><span class="mut" aria-hidden="true" style="font-size:18px">›</span></div>`).join("")}</div>` : '<p class="note">Everything the planner needs is set up.</p>'}
  <h2>People &amp; other payers<span class="sp"></span><button class="btn sm" type="button" id="addPayer">Add</button></h2>
  <p class="note">For money you don't track a balance for, like cash, a meal card or your spouse paying. Entries never change a balance and stay out of your totals, but show in Transactions and under their tags.</p>
  <div class="list">${payers(d).map((p) => { const n = d.live<Rec & { paidBy?: string }>("txns").filter((t) => t.paidBy === p.id).length; return `<div class="row tap" data-payer="${esc(p.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(p.name)}</div><div class="s">${p.own ? "Your money" : "Someone else's money"}${p.tag ? ` · tagged ${esc(p.tag)}` : ""}</div></div><div class="amt mut" style="font-size:13px">${n} entr${n === 1 ? "y" : "ies"}</div></div>`; }).join("") || '<div class="empty">None yet.</div>'}</div>
  ${remindersCard(d, nOn)}
  <h2>Tags</h2>
  <div class="list">${tags.length ? tags.map((g) => { const n = d.live<Rec & { tags?: string[] }>("txns").filter((t) => (t.tags ?? []).includes(g)).length; return `<div class="row tap" data-tagedit="${esc(g)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(g)}</div></div><div class="amt mut" style="font-size:13px">${n} transaction${n === 1 ? "" : "s"}</div></div>`; }).join("") : '<div class="empty">No tags yet. Add one when you record a transaction.</div>'}</div>
  <h2>Expense categories<span class="sp"></span><button class="btn sm" type="button" id="addCat">Add</button></h2>
  <details class="fm"><summary><span class="mn">${catTree(d, "expense").length} expense categories</span><span class="sub" style="text-align:right">tap to show</span></summary><div class="list" style="border-radius:0">${tree("expense")}</div></details>
  <h2>Income categories</h2>
  <details class="fm"><summary><span class="mn">${catTree(d, "income").length} income categories</span><span class="sub" style="text-align:right">tap to show</span></summary><div class="list" style="border-radius:0">${tree("income")}</div></details>
  ${hostedCard()}
  
  
  <h2>Backup</h2>
  
  <div class="card"><div class="btns"><button class="btn pri" type="button" id="xlsx">Download Excel (readable)</button><button class="btn" type="button" id="copyJson">Copy data as JSON</button><button class="btn" type="button" id="dlJson">Download data (.json)</button><button class="btn" type="button" id="restore">Restore from backup</button></div>
  <p class="note">To copy everything to your other KP Money Planner (Claude version ↔ Firebase app): Download data here, then Restore from backup there and choose the file. Restore normally merges (the newer copy of each entry wins, deletions carry across); tick <b>Replace everything</b> to make the other copy an exact copy of this one. The file is readable, so keep it somewhere safe.</p>
  <p class="note">The Excel file has every transaction, month totals, accounts, regular items, loans, investments and net worth.</p>
  <p class="note" style="margin-bottom:0">${d.live("txns").length} transactions · ${d.live("recurring").length} regular items · ${d.live("loans").length} loans · ${d.live("accounts").length} accounts</p></div>`;
}

export const morePage: Page = {
  html(d, h) { return moreHtml(d, h.pref("notify", false)); },
  act(el, h) {
    if (el.dataset.ptgo !== undefined) { (h.state() as unknown as { planTab?: string }).planTab = el.dataset.ptgo; h.go("plan"); return; }
    return false;   // forms, backups, imports, reminders: the planner's for now
  },
};
