/**
 * The Money tab (KP Money Planner, rewritten into Akhila Vrutta). Every page and form is drawn here from
 * the encrypted store, where amounts are kept in paise; the page state (filters, month, tabs, which loan
 * or card is open) lives here too. Writes go straight to the store, then the automatic entries are made
 * and the page is drawn again; other devices' changes redraw it as well.
 */
import { aiOn } from "../../core/ai.ts";
import type { Module } from "../types.ts";
import { html, raw } from "../../core/dom.ts";
import { ctx } from "../../core/app.ts";
import { META, MONEY_COLLECTIONS, type Changes, type Rec } from "../../core/store.ts";
import { AMOUNTS_VERSION, fromStored, toStored, upgradeWrites } from "./paise.ts";
import { callable, config } from "../../core/firebase.ts";
import { moneyData, txPage, type PlannerState } from "./views/transactions.ts";
import { accountsPage } from "./views/accounts.ts";
import { planPage } from "./views/plan.ts";
import { homePage } from "./views/home.ts";
import { insightsPage } from "./views/insights.ts";
import { advisorPage, setAsk } from "./views/advisor.ts";
import { morePage, phoneItems } from "./views/more.ts";
import { cardPage } from "./views/card.ts";
import { loanPage } from "./views/loan.ts";
import { epfPage } from "./views/epf.ts";
import { ppfPage } from "./views/ppf.ts";
import { npsPage } from "./views/nps.ts";
import { propPage } from "./views/prop.ts";
import { mountPages } from "./views/pages.ts";
import { blankFilter } from "./views/txlist.ts";
import { addM, ymOf, todayOf } from "./calc/dates.ts";
import { txFilterSheet } from "./ui/txsheets.ts";
import { pxLine, pxRefresh } from "./ui/prices.ts";
import { maybeNotify, plannerData } from "./ui/dataio.ts";
import { autoEntries } from "./ui/auto.ts";
import { closeModal, ensureLayer, onSheet, sheetOpen, toast as kitToast } from "./ui/kit.ts";
import { phoneReminders } from "./ui/phone.ts";
import { scheduleReminders, setReminderSource } from "../../core/reminders.ts";
import { notePage, onBackClose } from "../../core/native.ts";
import { prefGet, prefSet, setEnv, uid, type WriteOp as MoneyWrite } from "./ui/env.ts";
import { txnForm } from "./ui/txform.ts";
import { mainAcc } from "./calc/forecast.ts";
import { freshPage } from "./fresh.ts";
import { addTip, hideStart, markSeen, setHelpGo } from "../../core/helptips.ts";
import { recForm } from "./ui/planforms.ts";
import { starterRec } from "./views/plan.ts";

/** Every money page. */
const PAGES = { home: homePage, activity: txPage, accounts: accountsPage, plan: planPage, insights: insightsPage, advisor: advisorPage, more: morePage, card: cardPage, loan: loanPage, epf: epfPage, ppf: ppfPage, nps: npsPage, prop: propPage };
type View = keyof typeof PAGES;
const isView = (v: string): v is View => v in PAGES;

const ICON = "M3 7h18v12H3zM3 11h18M7 15h3";

/** Money's own tabs: [page, label]. */
export const SUBTABS: [string, string][] = [
  ["home", "Overview"], ["activity", "Activity"], ["plan", "Plan"], ["accounts", "Accounts"],
];
/** Pages that belong under a tab. */
const PARENT: Record<string, string> = {
  forecast: "plan", loan: "accounts", card: "accounts", epf: "accounts", ppf: "accounts",
  nps: "accounts", props: "accounts", prop: "accounts", more: "more", insights: "activity", advisor: "home",
};
const tabOf = (v: string) => PARENT[v] ?? v;

/** The page state the planner kept in its S (filters, month, tabs, open loan / card / holding). */
const S = { view: "home", month: ymOf(todayOf()), fcH: 12, f: blankFilter() } as PlannerState & Record<string, unknown>;
let box: HTMLElement | null = null;
let pages: { render(first?: boolean): void } | null = null;
let shown = false;
let started = false;

/** Goes to a money page (the planner's go(): Forecast is Plan › Cash flow, Year is an Insights tab, Properties an Accounts tab). */
function go(v0: string): void {
  let v = v0;
  if (v === "forecast") { S.planTab = "cashflow"; v = "plan"; }
  if (v === "year") { S.insTab = "year"; v = "insights"; }
  if (v === "props") { S.accTab = "props"; v = "accounts"; }
  if (!isView(v)) v = "home";
  S.view = v;
  const t = tabOf(v);
  // the shell's tabs (bottom bar and side menu) follow the page shown
  document.querySelectorAll<HTMLElement>("[data-sub^='money:']").forEach((b) => {
    const on = b.dataset.sub === `money:${t}` || b.dataset.sub === `money:${v}`;
    b.classList.toggle("on", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  // Activity: transactions and insights, switched at the top
  const sw = document.getElementById("mvSw");
  if (sw) { sw.hidden = t !== "activity"; sw.querySelectorAll<HTMLElement>("[data-sw]").forEach((a) => { const on = a.dataset.sw === v; a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); }); }
  const want = `#/money/${v}`;
  if (location.hash.startsWith("#/money") && location.hash !== want) history.replaceState(null, "", want);
  notePage(want);
  show();
}
function show(): void {
  const first = !shown;
  shown = true;
  ensureBox().hidden = false;
  pages?.render(first);
}
function refresh(): void { if (shown) pages?.render(); }

function ensureBox(): HTMLElement {
  if (box) return box;
  box = document.createElement("div");
  box.id = "moneyView";
  box.hidden = true;
  box.innerHTML = '<div class="mv"><nav class="mvsw" id="mvSw" aria-label="Activity" hidden><a href="#/money/activity" data-sw="activity">Transactions</a><a href="#/money/insights" data-sw="insights">Insights</a></nav><div class="wrap" id="view" role="main"></div></div>';
  document.body.appendChild(box);
  pages = mountPages(box, PAGES, {
    data: currentData,
    state: () => S,
    pref: prefGet,
    prefSet,
    plannerHtml: (name) => (name === "pxLine" ? pxLine(currentData()) : ""),
    go,
    toast: kitToast,
    decorate: (v) => {
      const plan = S.view === "plan" ? String(S.planTab || "month") : "";
      addTip(v, `money:${S.view}${plan ? `:${plan === "ready" ? "cashflow" : plan}` : ""}`);
      if (plan === "cashflow" || plan === "ready") markSeen("cashflow");
    },
  });
  return box;
}

const dueItems = () => phoneItems(currentData());
const currentData = () => moneyData((c) => ctx.store!.all(c), MONEY_COLLECTIONS);

/** Saves records (in paise), makes the automatic entries that follow, and draws the page again. */
function writeMoney(ops0: MoneyWrite[]): void {
  if (!ctx.store || !ops0.length) return;
  ctx.store.writeMany(ops0.map(({ c, r }) => ({ c, id: r.id, r })));
  // what the planner filled in by itself after every change (carry-overs, card EMIs, the month's snapshot)
  const a = autoEntries(currentData());
  if (a.length) ctx.store.writeMany(a.map(({ c, r }) => ({ c, id: r.id, r })));
  refresh();
  scheduleReminders();
}
/** Another device changed something: make what follows from it and draw the page again. */
function onStoreChange(ch: Changes): void {
  if (ch.local || !ctx.store) return;
  if (!ch.keys.some(({ c }) => (MONEY_COLLECTIONS as readonly string[]).includes(c))) return;
  const a = autoEntries(currentData());
  if (a.length) ctx.store.writeMany(a.map(({ c, r }) => ({ c, id: r.id, r })));
  refresh();
  scheduleReminders();
}

/** The Advisor asks Claude through Akhila Vrutta's askClaude function (signed in, same session). */
function startAsk(): void {
  setAsk(async (turns, signal) => {
    const fn = await callable("askClaude", 300000);
    const stop = new Promise<never>((_, rej) => { signal?.addEventListener("abort", () => rej({ code: "cancelled" }), { once: true }); });
    try {
      const r = await Promise.race([fn({ messages: turns.map((m) => ({ role: m.role, content: m.content })) }), stop]) as { data?: { text?: string } };
      return { text: r.data?.text || "" };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err?.code === "cancelled") throw e;
      throw { code: String(err?.code || "error").replace(/^functions\//, ""), message: err?.message || "Couldn't get an answer." };
    }
  });
}

/** Test builds only (the emulator build and the test page): the planner's names for its data and page state. */
function testHooks(): void {
  const w = window as unknown as Record<string, unknown>;
  w.S = new Proxy(S, { get: (t, k) => (k === "data" ? plannerData(currentData()) : (t as Record<string | symbol, unknown>)[k]), set: (t, k, v) => { (t as Record<string | symbol, unknown>)[k] = v; return true; } });
  w.go = go;
  w.uid = uid;
  w.closeModal = closeModal;
  w.today = () => currentData().today;
  /** A record in the planner's rupees, saved as the app saves it. */
  w.upsert = (c: string, r: Rec) => writeMoney([{ c, r: toStored(c, { ...r, updatedAt: Date.now() }) }]);
  w.fromStored = fromStored;
  const pd = (): Record<string, Rec[]> => plannerData(currentData()) as Record<string, Rec[]>;
  w.live = (c: string) => (pd()[c] || []).filter((x) => !x.deleted);
  w.byId = (c: string, id: string) => (pd()[c] || []).find((x) => x.id === id);
  w.prefGet = prefGet;
  w.ymOf = ymOf;
  w.addM = addM;
  w.txFilterSheet = txFilterSheet;
  w.phoneReminders = () => phoneReminders(dueItems()).map((r) => ({ ...r, at: r.at.toISOString() }));
  w.dueItems = dueItems;
}

function start(): void {
  if (started) return;
  started = true;
  if (ctx.session) startAsk();
  setEnv({
    data: currentData,
    write: writeMoney,
    state: () => S,
    refresh,
    planner: (name, ...args) => { if (name === "go") go(String(args[0])); },
  });
  ensureLayer();
  ensureBox();
  ctx.store!.subscribe(onStoreChange);
  if (config().emulators || (window as unknown as { AV_TEST?: boolean }).AV_TEST) testHooks();
  // Carry-overs, card EMIs due by today and this month's snapshot, made once when Money opens (then after each change).
  { const ops = autoEntries(currentData()); if (ops.length) ctx.store!.writeMany(ops.map(({ c, r }) => ({ c, id: r.id, r }))); }
  // Today's official prices onto the linked holdings (at most every 3 hours), and today's due reminders on this device.
  if (ctx.session) window.setTimeout(() => { void pxRefresh(); void maybeNotify(); }, 1500);
  onSheet((open) => { document.body.classList.toggle("msheet", open); });
  // Help's buttons in Money: the Get started list and Regular's starters
  setHelpGo((k) => {
    if (k === "add") return addTxn();
    if (k === "hidestart") { hideStart(); document.getElementById("getStarted")?.remove(); return; }
    if (k === "regular" || k === "cashflow") { S.planTab = k; return go("plan"); }
    if (k === "accounts") { S.accTab = "banks"; return go("accounts"); }
    if (k.startsWith("rec:")) return recForm(starterRec(currentData(), +k.slice(4)));
  });
  // The Android app: Back closes an open sheet first; bills, EMIs and card dues as phone notifications.
  onBackClose(() => { if (!sheetOpen()) return false; closeModal(); return true; });
  setReminderSource("money", () => phoneReminders(dueItems()));
  scheduleReminders(1000);
}

/** For other areas (Household): Money's data and writer, ready without opening the Money tab. */
export function startMoney(): void { if (ctx.store) start(); }
export const moneyWrite = (ops: MoneyWrite[]): void => writeMoney(ops);
export const moneyNow = () => currentData();

const SUBICON: Record<string, string> = {
  home: "M4 11l8-7 8 7v9H4z", activity: "M5 7h14M5 12h14M5 17h9", plan: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  accounts: "M3 10l9-6 9 6M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18", insights: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  advisor: "M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z", more: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3",
};
const sub = ([id, label]: [string, string]) => ({ id, label, icon: SUBICON[id] ?? "", href: `#/money/${id}` });
export const money: Module = {
  id: "money",
  label: "Money",
  icon: ICON,
  subs: () => SUBTABS.map(sub),
  more: () => ([...(aiOn() ? [["advisor", "Advisor"]] : []), ["more", "Money settings"]] as [string, string][]).map(sub),
  sub: () => tabOf(S.view),
  render(root) {
    const s = ctx.store;
    if (!s) {
      root.innerHTML = html`<section class="card"><h2>Money</h2><p>Your money planner opens here once the app is unlocked.</p></section>`;
      return;
    }
    let meta = s.get(META, "money");
    // One version behind: the new money fields are converted where they are (no import needed).
    if (meta && meta.amounts !== AMOUNTS_VERSION) { const up = upgradeWrites(meta, (c) => s.all(c)); if (up) { s.writeMany(up.ops); meta = up.meta; } }
    // a new user: set up Money (the main account and starting categories)
    if (!meta) { freshPage(root, () => money.render(root)); return; }
    if (meta.amounts !== AMOUNTS_VERSION) {
      root.innerHTML = html`<section class="card"><h2>Bring in your money data</h2>
        <p>${meta ? "This version stores a few more amounts in paise. Import your KP Money Planner export once more to open the planner." : "Import your KP Money Planner export to start."}</p>
        <div class="btns"><a class="btn pri" href="#/settings">Go to Settings › Import</a></div></section>`;
      return;
    }
    const want = location.hash.split("/")[2];
    root.innerHTML = html`    <button class="fab" id="moneyAdd" type="button" aria-label="Add transaction">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`;
    // + : the add form, into the main account, from every money page.
    root.querySelector("#moneyAdd")!.addEventListener("click", addTxn);
    start();
    go(want && want !== S.view ? want : S.view);
  },
};

/** The Add transaction form, into the main account (Money's + and Today's +). */
export function addTxn(): void {
  txnForm({}, { accountId: mainAcc(currentData())?.id || currentData().live("accounts")[0]?.id });
}

/** Called by the shell when another tab is shown. */
export function hideMoney(): void {
  if (box) box.hidden = true;
  shown = false;
}
