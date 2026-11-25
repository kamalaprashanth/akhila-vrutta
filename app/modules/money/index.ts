/**
 * The Money tab (KP Money Planner, rewritten into Akhila Vrutta). Every page and form is drawn here from
 * the encrypted store, where amounts are kept in paise; the page state (filters, month, tabs, which loan
 * or card is open) lives here too. Writes go straight to the store, then the automatic entries are made
 * and the page is drawn again; other devices' changes redraw it as well.
 */
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
import { morePage, reminderItems } from "./views/more.ts";
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
import { schedulePhone } from "./ui/phone.ts";
import { notePage, onBackClose } from "../../core/native.ts";
import { prefGet, prefSet, setEnv, uid, type WriteOp as MoneyWrite } from "./ui/env.ts";
import { txnForm } from "./ui/txform.ts";
import { mainAcc } from "./calc/forecast.ts";

/** Every money page. */
const PAGES = { home: homePage, activity: txPage, accounts: accountsPage, plan: planPage, insights: insightsPage, advisor: advisorPage, more: morePage, card: cardPage, loan: loanPage, epf: epfPage, ppf: ppfPage, nps: npsPage, prop: propPage };
type View = keyof typeof PAGES;
const isView = (v: string): v is View => v in PAGES;

const ICON = "M3 7h18v12H3zM3 11h18M7 15h3";

/** Money's own tabs: [page, label]. */
export const SUBTABS: [string, string][] = [
  ["home", "Overview"], ["activity", "Transactions"], ["plan", "Plan"],
  ["insights", "Insights"], ["accounts", "Accounts"], ["advisor", "Advisor"],
];
/** Pages that belong under a tab. */
const PARENT: Record<string, string> = {
  forecast: "plan", loan: "accounts", card: "accounts", epf: "accounts", ppf: "accounts",
  nps: "accounts", props: "accounts", prop: "accounts", more: "more",
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
  document.querySelectorAll<HTMLElement>("#moneySub [data-mv]").forEach((b) => {
    b.classList.toggle("on", b.dataset.mv === t);
    if (b.dataset.mv === t) b.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
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
  box.innerHTML = '<div class="mv"><div class="wrap" id="view" role="main"></div></div>';
  document.body.appendChild(box);
  pages = mountPages(box, PAGES, {
    data: currentData,
    state: () => S,
    pref: prefGet,
    prefSet,
    plannerHtml: (name) => (name === "pxLine" ? pxLine(currentData()) : ""),
    go,
    toast: kitToast,
  });
  return box;
}

const dueItems = () => reminderItems(currentData());
const currentData = () => moneyData((c) => ctx.store!.all(c), MONEY_COLLECTIONS);

/** Saves records (in paise), makes the automatic entries that follow, and draws the page again. */
function writeMoney(ops0: MoneyWrite[]): void {
  if (!ctx.store || !ops0.length) return;
  ctx.store.writeMany(ops0.map(({ c, r }) => ({ c, id: r.id, r })));
  // what the planner filled in by itself after every change (carry-overs, card EMIs, the month's snapshot)
  const a = autoEntries(currentData());
  if (a.length) ctx.store.writeMany(a.map(({ c, r }) => ({ c, id: r.id, r })));
  refresh();
  schedulePhone(dueItems);
}
/** Another device changed something: make what follows from it and draw the page again. */
function onStoreChange(ch: Changes): void {
  if (ch.local || !ctx.store) return;
  if (!ch.keys.some(({ c }) => (MONEY_COLLECTIONS as readonly string[]).includes(c))) return;
  const a = autoEntries(currentData());
  if (a.length) ctx.store.writeMany(a.map(({ c, r }) => ({ c, id: r.id, r })));
  refresh();
  schedulePhone(dueItems);
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
  // The Android app: Back closes an open sheet first; bills, EMIs and card dues as phone notifications.
  onBackClose(() => { if (!sheetOpen()) return false; closeModal(); return true; });
  schedulePhone(dueItems, 1000);
}

export const money: Module = {
  id: "money",
  label: "Money",
  icon: ICON,
  render(root) {
    const s = ctx.store;
    if (!s) {
      root.innerHTML = html`<section class="card"><h2>Money</h2><p>Your money planner opens here once the app is unlocked.</p></section>`;
      return;
    }
    let meta = s.get(META, "money");
    // One version behind: the new money fields are converted where they are (no import needed).
    if (meta && meta.amounts !== AMOUNTS_VERSION) { const up = upgradeWrites(meta, (c) => s.all(c)); if (up) { s.writeMany(up.ops); meta = up.meta; } }
    if (!meta || meta.amounts !== AMOUNTS_VERSION) {
      root.innerHTML = html`<section class="card"><h2>Bring in your money data</h2>
        <p>${meta ? "This version stores a few more amounts in paise. Import your KP Money Planner export once more to open the planner." : "Import your KP Money Planner export to start."}</p>
        <div class="btns"><a class="btn pri" href="#/settings">Go to Settings › Import</a></div></section>`;
      return;
    }
    const want = location.hash.split("/")[2];
    root.innerHTML = html`<nav class="msub" id="moneySub" aria-label="Money">
      ${SUBTABS.map(([v, l]) => raw(html`<a href="#/money/${v}" data-mv="${v}" class="${tabOf(want || S.view) === v ? "on" : ""}">${l}</a>`))}
      <a href="#/money/more" data-mv="more" class="mset ${tabOf(want || S.view) === "more" ? "on" : ""}" aria-label="Money settings" title="Money settings">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg></a>
    </nav>
    <button class="fab" id="moneyAdd" type="button" aria-label="Add transaction">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`;
    // + : the add form, into the main account, from every money page.
    root.querySelector("#moneyAdd")!.addEventListener("click", () => {
      txnForm({}, { accountId: mainAcc(currentData())?.id || currentData().live("accounts")[0]?.id });
    });
    start();
    go(want && want !== S.view ? want : S.view);
  },
};

/** Called by the shell when another tab is shown. */
export function hideMoney(): void {
  if (box) box.hidden = true;
  shown = false;
}
