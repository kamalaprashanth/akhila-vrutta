/** The shell: unlock, then header, tab bar and routing between modules. */
import { MODULES } from "./modules/pages.ts";
import { html, raw, $, toast } from "./core/dom.ts";
import { installNative, isNative } from "./core/native.ts";
import { config } from "./core/firebase.ts";
import { ctx } from "./core/app.ts";
import { closeLock, lockProgress, unlock } from "./core/lock.ts";
import { Store } from "./core/store.ts";
import { hideMoney, startMoney } from "./modules/money/index.ts";
import { startHousehold } from "./modules/household/index.ts";
import { startHabits } from "./modules/habits/index.ts";
import { startDocs } from "./modules/documents/index.ts";
import { startBackups } from "./core/backup-auto.ts";

const AUTO_LOCK_MS = 2 * 60 * 1000;

const routeId = (): string => location.hash.replace(/^#\/?/, "").split("/")[0] || "home";

function renderNav(active: string): string {
  return MODULES.map((m) =>
    html`<a href="#/${m.id}" class="tab${m.id === active ? " on" : ""}" ${raw(m.id === active ? 'aria-current="page"' : "")}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${m.icon}"/></svg><span>${m.tab ?? m.label}</span></a>`,
  ).join("");
}

function render(): void {
  const mod = MODULES.find((m) => m.id === routeId()) ?? MODULES[0];
  if (!mod) return;
  const nav = $("#nav");
  const main = $("#main");
  const title = $("#title");
  if (nav) nav.innerHTML = renderNav(mod.id);
  document.body.dataset.mod = mod.id;
  if (mod.id !== "money") hideMoney();
  if (title) title.textContent = mod.id === "home" ? "Akhila Vrutta" : mod.label;
  if (main) {
    mod.render(main);
    main.focus({ preventScroll: true });
  }
  document.title = mod.id === "home" ? "Akhila Vrutta" : `${mod.label} · Akhila Vrutta`;
}

async function boot(): Promise<void> {
  ctx.rerender = render;
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
  // Phone reminders from Money, Household, Habits and Documents, whichever tab is open
  startMoney();
  startHousehold();
  startHabits();
  startDocs();
  startBackups();

  // The Android app: Back, and locking after a minute away (choosing a file also leaves the app for a moment).
  installNative({ home: "#/home", hint: (t) => toast(t), lockAfterMs: 60 * 1000, lock: () => location.reload(), locks: () => session.mode !== "remember" });
  if (isNative()) return;
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
    if (session.mode !== "remember" && hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) location.reload();
  });
}

void boot();
