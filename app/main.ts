/** The shell: unlock, then header, tab bar and routing between modules. */
import { refreshAi } from "./core/ai.ts";
import { MODULES } from "./modules/pages.ts";
import type { Module, Sub } from "./modules/types.ts";
import { todayCount } from "./modules/today/index.ts";
import { lotus } from "./core/logo.ts";
import { html, raw, $, toast } from "./core/dom.ts";
import { installNative, isNative, onBackClose } from "./core/native.ts";
import { config } from "./core/firebase.ts";
import { ctx } from "./core/app.ts";
import { closeLock, lockProgress, unlock } from "./core/lock.ts";
import { Store } from "./core/store.ts";
import { hideMoney, startMoney } from "./modules/money/index.ts";
import { startHousehold } from "./modules/household/index.ts";
import { startHabits } from "./modules/habits/index.ts";
import { startDocs } from "./modules/documents/index.ts";
import { startHealth } from "./modules/health/index.ts";
import { startCalendar } from "./modules/calendar/index.ts";
import { startFamily } from "./core/family.ts";
import { startFamilyFiles } from "./core/famfiles.ts";
import { userName } from "./core/firebase.ts";
import { startBackups } from "./core/backup-auto.ts";
import { addTip, installHelp, newAccountTips } from "./core/helptips.ts";

const AUTO_LOCK_MS = 2 * 60 * 1000;

const routeId = (): string => { const r = location.hash.replace(/^#\/?/, "").split("/")[0] || "today"; return r === "home" ? "today" : r; };
const svg = (d: string): string => html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const LOCK = "M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3";

/** The side menu: every section, the open one with its own pages under it. */
function renderDrawer(mod: Module): string {
  const cur = mod.sub?.() ?? "";
  const item = (m: Module): string => {
    const on = m.id === mod.id, n = m.id === "today" ? todayCount() : 0;
    // the Dashboard's bar is only shortcuts to other sections: not repeated under it (27 Nov 2026)
    const subs = on && m.id !== "today" ? [...(m.subs?.() ?? []), ...(m.more?.() ?? [])] : [];
    return html`<a href="#/${m.id}" class="dit${on ? " on" : ""}" ${raw(on ? 'aria-current="page"' : "")}>${raw(svg(m.icon))}<span>${m.label}</span>${raw(n ? html`<i>${String(n)}</i>` : "")}</a>
      ${raw(subs.length ? html`<div class="dsub">${raw(subs.map((x) => html`<a href="${x.href}" data-sub="${m.id}:${x.id}" class="${x.id === cur ? "on" : ""}" ${raw(x.id === cur ? 'aria-current="page"' : "")}>${x.label}</a>`).join(""))}</div>` : "")}`;
  };
  const main = MODULES.filter((m) => !m.hidden && m.id !== "settings"), set = MODULES.find((m) => m.id === "settings");
  const locks = ctx.session && ctx.session.mode !== "remember";
  return html`<div class="dhead">${raw(lotus(36))}<b>Akhila Vrutta</b></div>
    <nav class="dlist" aria-label="Sections">${raw(main.map(item).join(""))}</nav>
    <div class="dfoot">${raw(set ? item(set) : "")}${raw(locks ? html`<button type="button" class="dit" id="lockNow">${raw(svg(LOCK))}<span>Lock now</span></button>` : "")}</div>`;
}

const MENU: Sub = { id: "menu", label: "Menu", icon: "M4 7h16M4 12h16M4 17h10", href: "#menu" };
/** The bottom bar: the section's own tabs, then Menu; a page without tabs gets Today's bar with itself in
 * the fourth place (Today, Money, Household, <this page>, Menu). */
function barOf(mod: Module): { subs: Sub[]; cur: string } {
  if (mod.subs) { const s = mod.subs(); return { subs: s.some((x) => x.href === "#menu") ? s : [...s, MENU], cur: mod.sub?.() ?? "" }; }
  const main = MODULES.find((m) => m.id === "today")?.subs?.() ?? [];
  const me: Sub = { id: mod.id, label: mod.tab ?? mod.label, icon: mod.icon, href: `#/${mod.id}` };
  const subs = main.some((x) => x.id === mod.id) ? main : main.map((x, i) => (i === 3 ? me : x));
  return { subs, cur: mod.id };
}

/** The open section's own tabs, at the bottom of a phone. */
function renderNav(mod: Module): string {
  const { subs, cur } = barOf(mod);
  const key = mod.subs ? mod.id : "main";
  return subs.map((x) => x.href === "#menu"
    ? html`<button type="button" class="tab" id="navMenu" aria-controls="drawer"><span class="ti">${raw(svg(x.icon))}</span><span>${x.label}</span></button>`
    : html`<a href="${x.href}" data-sub="${key}:${x.id}" class="tab${x.id === cur ? " on" : ""}" ${raw(x.id === cur ? 'aria-current="page"' : "")}><span class="ti">${raw(svg(x.icon))}</span><span>${x.label}</span></a>`).join("");
}

function setDrawer(open: boolean): void {
  document.body.classList.toggle("dopen", open);
  $("#scrim")!.hidden = !open;
  $("#menuBtn")?.setAttribute("aria-expanded", String(open));
  if (open) $("#drawer .dit.on")?.focus({ preventScroll: true });
}
const drawerOpen = (): boolean => document.body.classList.contains("dopen");

let lastHash = "";
function render(): void {
  const mod = MODULES.find((m) => m.id === routeId()) ?? MODULES[0];
  if (!mod) return;
  // a new page closes the menu (a redraw after a change doesn't)
  if (location.hash !== lastHash) { lastHash = location.hash; setDrawer(false); }
  const nav = $("#nav"), main = $("#main"), title = $("#title"), drawer = $("#drawer");
  document.body.dataset.mod = mod.id;
  if (mod.id !== "money") hideMoney();
  if (title) title.textContent = mod.label;
  const sb = $("#searchBtn"); if (sb) sb.hidden = mod.id === "search";
  if (main) {
    mod.render(main);
    // a new user's note on top of the page (Money puts its own)
    if (mod.id !== "money") addTip(main, [mod.id, mod.sub?.()].filter(Boolean).join(":"));
    main.focus({ preventScroll: true });
  }
  // after the page: a section may pick its tab while rendering (Money, Home)
  document.body.classList.toggle("hassubs", barOf(mod).subs.length > 0);
  if (nav) nav.innerHTML = renderNav(mod);
  if (drawer) drawer.innerHTML = renderDrawer(mod);
  document.title = mod.id === "today" ? "Akhila Vrutta" : `${mod.label} · Akhila Vrutta`;
}

function installShell(): void {
  $("#menuBtn")?.addEventListener("click", () => setDrawer(!drawerOpen()));
  $("#nav")?.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("#navMenu")) setDrawer(true); });
  $("#scrim")?.addEventListener("click", () => setDrawer(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawerOpen()) setDrawer(false); });
  $("#drawer")?.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("#lockNow")) { location.reload(); return; }
    if (t.closest("a")) setDrawer(false);
  });
  // swipe in from the left edge opens the menu; swipe left closes it
  let x0 = -1, y0 = 0;
  document.addEventListener("touchstart", (e) => { const p = e.touches[0]!; x0 = drawerOpen() || p.clientX < 24 ? p.clientX : -1; y0 = p.clientY; }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (x0 < 0) return;
    const p = e.changedTouches[0]!, dx = p.clientX - x0, dy = Math.abs(p.clientY - y0);
    if (dy < 60 && dx > 50 && !drawerOpen()) setDrawer(true);
    else if (dy < 60 && dx < -50 && drawerOpen()) setDrawer(false);
    x0 = -1;
  }, { passive: true });
  // Android Back closes the menu first
  onBackClose(() => { if (!drawerOpen()) return false; setDrawer(false); return true; });
}

async function boot(): Promise<void> {
  ctx.rerender = render;
  installShell();
  installHelp();
  window.addEventListener("hashchange", render);
  if (!config().firebase) { render(); return; } // local and test builds run without the cloud
  const session = await unlock();
  lockProgress("Opening your data…");
  try {
    ctx.store = await Store.open(session.home, session.uid, session.dek, lockProgress);
  } catch (e) {
    lockProgress(`Couldn't open your data: ${e instanceof Error ? e.message : String(e)}. Reload to try again.`);
    return;
  }
  ctx.session = session;
  if (session.fresh) newAccountTips();
  // a save the cloud refused stays on this device only until the app closes: say so
  ctx.store.onWriteError((e) => {
    const code = (e as { code?: string })?.code ?? "";
    toast(code === "permission-denied" ? "Couldn't save your last change to the cloud (not allowed). Reload the app and try again; it will be lost when the app closes." : `Couldn't save your last change to the cloud${code ? ` (${code})` : ""}. Check your connection and try again.`);
  });
  let queued = false;
  ctx.store.subscribe(() => {
    if (queued || document.body.dataset.mod === "money") return; // the planner redraws itself
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      // Don't redraw under someone typing in a form.
      // …nor under a backup or restore in progress in Settings.
      if (!document.activeElement?.closest("form, #impArea, #bkArea") && !document.querySelector("#bkArea > *, #skArea > *, #impArea .confirm, #impArea form")) render();
    });
  });
  render();
  closeLock();
  // Claude (Advisor, Read with Claude): on for this account? Redraw if that changed.
  void refreshAi().then((changed) => { if (changed) render(); });
  // Phone reminders from Money, Household, Habits, Documents and Health, whichever tab is open
  startMoney();
  startHousehold();
  startHabits();
  startDocs();
  startHealth();
  startCalendar();
  startBackups();
  // the family space, if this account is in one: its shared items join yours
  startFamilyFiles();
  void userName().then((n) => startFamily(ctx.store!, n ?? "")).catch((e) => console.warn("family", e));

  // The Android app: Back, and locking after a minute away (choosing a file also leaves the app for a moment).
  installNative({ home: "#/today", hint: (t) => toast(t), lockAfterMs: 60 * 1000, lock: () => location.reload(), locks: () => session.mode !== "remember" });
  if (isNative()) return;
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
    if (session.mode !== "remember" && hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) location.reload();
  });
}

void boot();
