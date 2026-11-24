/**
 * The Money tab. For now it runs the moved-over KP Money Planner in its own frame (/money/app)
 * and is the bridge between that frame and the encrypted store:
 *   load  → stored records (paise) converted to the planner's rupees
 *   save  → whatever the planner changed, converted back and written in batches
 *   other devices' changes → handed to the planner, which redraws
 */
import type { Module } from "../types.ts";
import { html, raw } from "../../core/dom.ts";
import { ctx } from "../../core/app.ts";
import { META, MONEY_COLLECTIONS, stableJSON, type Changes, type Rec, type WriteOp } from "../../core/store.ts";
import { AMOUNTS_VERSION, fromStored, toStored, unclassified } from "./paise.ts";
import { callable, initFirebase } from "../../core/firebase.ts";
import { moneyData, txPage, type PlannerState } from "./views/transactions.ts";
import { accountsPage } from "./views/accounts.ts";
import { planPage } from "./views/plan.ts";
import { homePage } from "./views/home.ts";
import { insightsPage } from "./views/insights.ts";
import { advisorPage, setAsk } from "./views/advisor.ts";
import { morePage } from "./views/more.ts";
import { cardPage } from "./views/card.ts";
import { loanPage } from "./views/loan.ts";
import { mountPages } from "./views/pages.ts";
import { ensureLayer, onSheet, toast as kitToast } from "./ui/kit.ts";
import { prefGet, prefSet, setEnv, type WriteOp as MoneyWrite } from "./ui/env.ts";
import { txnForm } from "./ui/txform.ts";
import { mainAcc } from "./calc/forecast.ts";

/** Planner pages that Akhila Vrutta now draws itself (the planner keeps their state and sheets). */
const PAGES = { home: homePage, activity: txPage, accounts: accountsPage, plan: planPage, insights: insightsPage, advisor: advisorPage, more: morePage, card: cardPage, loan: loanPage };
const MOVED = new Set(Object.keys(PAGES));

const ICON = "M3 7h18v12H3zM3 11h18M7 15h3";

/** Money's own tabs: [planner view, label]. */
export const SUBTABS: [string, string][] = [
  ["home", "Overview"], ["activity", "Transactions"], ["plan", "Plan"],
  ["insights", "Insights"], ["accounts", "Accounts"], ["advisor", "Advisor"],
];
/** Planner pages that belong under a tab. */
const PARENT: Record<string, string> = {
  forecast: "plan", loan: "accounts", card: "accounts", epf: "accounts", ppf: "accounts",
  nps: "accounts", props: "accounts", prop: "accounts", more: "more",
};
const tabOf = (v: string) => PARENT[v] ?? v;

type LegacyData = Record<string, unknown> & { schema: number };
interface FrameApi {
  go(v: string): void;
  /** Runs one of the planner's own functions (for screens that still open its sheets). */
  call(name: string, ...args: unknown[]): unknown;
  add(): void;
  replace(d: LegacyData): void;
  state(): PlannerState;
  openTx(id: string): void;
  filters(): void;
  cleanup(): void;
  bulk(k: string): void;
  chrome(mode: "" | "full" | "only", offsets?: { t: number; l: number; b: number }): void;
}

let frame: HTMLIFrameElement | null = null;
let api: FrameApi | null = null;
let view = "home";
/** What the planner last saw, per record, as stable JSON (rupees). */
let seen = new Map<string, string>();
let saveTimer = 0;
let pendingData: LegacyData | null = null;
/** The area where moved screens are drawn (same place as the frame), and whether a planner sheet is open. */
let box: HTMLElement | null = null;
let pages: { render(first?: boolean): void } | null = null;
let sheetOpen = false;
let onMoved = false;

const key = (c: string, id: string) => `${c}/${id}`;

/** A number field the paise lists don't know: saved as-is, and reported so the list gets fixed. */
const warned = new Set<string>();
function warnOnce(path: string): void {
  if (warned.has(path)) return;
  warned.add(path);
  console.error(`[money] number field not classified as money or not: ${path}. Add it to paise.ts.`);
}

function loadForPlanner(): LegacyData {
  const s = ctx.store!;
  const meta = s.get(META, "money");
  const data: LegacyData = { schema: typeof meta?.schema === "number" ? meta.schema : 1 };
  seen = new Map();
  for (const c of MONEY_COLLECTIONS) {
    data[c] = s.all(c).map((r) => {
      const x = fromStored(c, r);
      seen.set(key(c, x.id), stableJSON(x));
      return x;
    });
  }
  return data;
}

/** Works out what the planner changed and saves it. */
function flush(): void {
  const data = pendingData;
  pendingData = null;
  if (!data || !ctx.store) return;
  const ops: WriteOp[] = [];
  const next = new Map<string, string>();
  for (const c of MONEY_COLLECTIONS) {
    const list = Array.isArray(data[c]) ? (data[c] as Rec[]) : [];
    for (const r of list) {
      if (!r || typeof r.id !== "string") continue;
      const k = key(c, r.id);
      const j = stableJSON(r);
      next.set(k, j);
      if (seen.get(k) !== j) {
        ops.push({ c, id: r.id, r: toStored(c, JSON.parse(j) as Rec) });
        for (const p of unclassified(c, r)) warnOnce(`${c}: ${p}`);
      }
    }
  }
  for (const k of seen.keys()) if (!next.has(k)) { const [c, id] = [k.slice(0, k.indexOf("/")), k.slice(k.indexOf("/") + 1)]; ops.push({ c, id, r: null }); }
  seen = next;
  if (ops.length) ctx.store.writeMany(ops);
}

/** Other devices changed something: hand the planner the new data if it differs from what it has. */
function onStoreChange(ch: Changes): void {
  if (ch.local || !api || !ctx.store) return;
  const differs = ch.keys.some(({ c, id }) => {
    if (!(MONEY_COLLECTIONS as readonly string[]).includes(c)) return false;
    const r = ctx.store!.get(c, id);
    const now = r ? stableJSON(fromStored(c, r)) : undefined;
    return seen.get(key(c, id)) !== now;
  });
  if (differs) { flush(); api.replace(loadForPlanner()); }
}

declare global {
  interface Window {
    AV_MONEY?: {
      load(): LegacyData;
      save(d: LegacyData): void;
      onView(v: string): void;
      ready(a: FrameApi): void;
      /** Pages Akhila Vrutta draws itself (the planner leaves them blank). */
      moved: string[];
      /** A planner sheet opened or closed. */
      sheet(open: boolean): void;
      /** A planner message; shown by Akhila Vrutta when the planner's page isn't on screen. */
      toast(t: string): boolean;
      /** What the planner's price and Advisor code needs from Firebase (signed in, same session). */
      firebase(): Promise<{ fb: { fs: unknown }; db: unknown; appI: unknown; user: { uid: string } } | null>;
      callable(name: string, timeout: number): Promise<(data: unknown) => Promise<{ data: unknown }>>;
    };
  }
}

function ensureFrame(): HTMLIFrameElement {
  if (frame) return frame;
  window.AV_MONEY = {
    load: loadForPlanner,
    save: (d) => {
      pendingData = d;
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(flush, 600);
    },
    onView: (v) => {
      view = v;
      const t = tabOf(v);
      document.querySelectorAll<HTMLElement>("#moneySub [data-mv]").forEach((b) => {
        b.classList.toggle("on", b.dataset.mv === t);
        if (b.dataset.mv === t) b.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
      const want = `#/money/${v}`;
      if (location.hash.startsWith("#/money") && location.hash !== want) history.replaceState(null, "", want);
      showMoved(MOVED.has(v));
    },
    sheet: (open) => setSheet(open),
    toast: (t) => {
      if (!onMoved || !box) return false;
      const el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("role", "status");
      el.textContent = t;
      box.querySelector(".mv")!.appendChild(el);
      window.setTimeout(() => el.remove(), 3800);
      return true;
    },
    ready: (a) => { api = a; },
    moved: [...MOVED],
    firebase: async () => {
      const f = await initFirebase();
      const s = ctx.session;
      return f && s ? { fb: { fs: f.fs }, db: f.db, appI: f.app, user: { uid: s.uid } } : null;
    },
    callable,
  };
  ctx.store!.subscribe(onStoreChange);
  // Save straight away when the app is put away.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { clearTimeout(saveTimer); flush(); } });
  frame = document.createElement("iframe");
  frame.id = "moneyFrame";
  frame.title = "Money";
  const start = location.hash.split("/")[2] || "home";
  frame.src = `/money/app#${encodeURIComponent(start)}`;
  document.body.appendChild(frame);
  return frame;
}

/** Shows a moved screen (drawn here) or the planner's own page. */
function showMoved(on: boolean): void {
  const first = on && !onMoved;
  onMoved = on;
  ensureBox().hidden = !on;
  if (frame) frame.hidden = on && !sheetOpen;
  if (!on) return;
  // Anything the planner just changed is saved first, so the page is drawn from current data.
  if (pendingData) { clearTimeout(saveTimer); flush(); }
  pages?.render(first);
}

/** A planner sheet: the frame fills the screen while it's open, so the sheet reaches the bottom and nothing covers it. */
function setSheet(open: boolean): void {
  if (!frame || !api || open === sheetOpen) return;
  sheetOpen = open;
  document.body.classList.toggle("msheet", open || !!document.querySelector("#mvLayer #modal > *"));
  document.body.classList.toggle("fsheet", open);
  if (open) {
    const r = (onMoved ? ensureBox() : frame).getBoundingClientRect();
    api.chrome(onMoved ? "only" : "full", { t: r.top, l: r.left, b: window.innerHeight - r.bottom });
    frame.classList.add("over");
    frame.hidden = false;
  } else {
    frame.classList.remove("over");
    api.chrome("");
    frame.hidden = onMoved;
  }
}

function ensureBox(): HTMLElement {
  if (box) return box;
  box = document.createElement("div");
  box.id = "moneyView";
  box.hidden = true;
  box.innerHTML = '<div class="mv"><div class="wrap" id="view" role="main"></div></div>';
  document.body.appendChild(box);
  pages = mountPages(box, PAGES, {
    data: currentData,
    state: () => api!.state() as PlannerState & Record<string, unknown>,
    pref: prefGet,
    prefSet,
    plannerHtml: (name) => String(api?.call("html", name) ?? ""),
    plannerClick: (attrs) => { api?.call("click", attrs); },
    go: (v) => api?.go(v),
    plannerFiles: (name, files) => { api?.call("files", name, files); },
    plannerCall: (name) => { api?.call("run", name); },
    toast: kitToast,
  });
  return box;
}

const currentData = () => moneyData((c) => ctx.store!.all(c), MONEY_COLLECTIONS);

/** Saves records changed by a screen Akhila Vrutta draws, then hands the planner the new data. */
function writeMoney(ops: MoneyWrite[]): void {
  if (!ctx.store || !ops.length) return;
  if (pendingData) { clearTimeout(saveTimer); flush(); }
  ctx.store.writeMany(ops.map(({ c, r }) => ({ c, id: r.id, r })));
  if (api) api.replace(loadForPlanner());   // the planner redraws, which redraws a moved screen too
  else refreshMoved();
}
function refreshMoved(): void { if (onMoved) pages?.render(); }

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

function startEnv(): void {
  if (ctx.session) startAsk();
  setEnv({
    data: currentData,
    write: writeMoney,
    state: () => (api ? api.state() : null),
    refresh: refreshMoved,
    planner: (name, ...args) => { if (api) api.call(name, ...args); },
  });
  ensureLayer();
  onSheet((open) => {
    document.body.classList.toggle("msheet", open || sheetOpen);
  });
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
    const meta = s.get(META, "money");
    if (!meta || meta.amounts !== AMOUNTS_VERSION) {
      root.innerHTML = html`<section class="card"><h2>Bring in your money data</h2>
        <p>${meta ? "This version stores a few more amounts in paise. Import your KP Money Planner export once more to open the planner." : "Import your KP Money Planner export to start."}</p>
        <div class="btns"><a class="btn pri" href="#/settings">Go to Settings › Import</a></div></section>`;
      return;
    }
    const want = location.hash.split("/")[2];
    root.innerHTML = html`<nav class="msub" id="moneySub" aria-label="Money">
      ${SUBTABS.map(([v, l]) => raw(html`<a href="#/money/${v}" data-mv="${v}" class="${tabOf(want || view) === v ? "on" : ""}">${l}</a>`))}
      <a href="#/money/more" data-mv="more" class="mset ${tabOf(want || view) === "more" ? "on" : ""}" aria-label="Money settings" title="Money settings">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg></a>
    </nav>
    <button class="fab" id="moneyAdd" type="button" aria-label="Add transaction">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`;
    // + : the add form (Akhila Vrutta's), into the main account, from every money page.
    root.querySelector("#moneyAdd")!.addEventListener("click", () => {
      if (!api) return;
      txnForm({}, { accountId: mainAcc(currentData())?.id || currentData().live("accounts")[0]?.id });
    });
    const f = ensureFrame();
    if (!box) startEnv();
    ensureBox();
    if (want && api && want !== view) api.go(want);
    else showMoved(MOVED.has(view) && !!api);
    if (!MOVED.has(view) || !api) f.hidden = false;
  },
};

/** Called by the shell when another tab is shown. */
export function hideMoney(): void {
  if (frame) frame.hidden = true;
  if (box) box.hidden = true;
  onMoved = false;
}
