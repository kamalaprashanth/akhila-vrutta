/**
 * The Android app (Capacitor). The native side puts window.Capacitor on the page, so the web code calls
 * its plugins directly and ships no npm package. In a browser all of this is off.
 *   AkhilaNative       ours: Google sign-in (Credential Manager), fingerprint key (Android Keystore)
 *   App                back button, app sent to the background / brought back, exit
 *   LocalNotifications bill reminders while the app is closed
 */

interface CapPlugin {
  [method: string]: ((opts?: unknown) => Promise<unknown>) | undefined;
}
interface Cap {
  isNativePlatform?: () => boolean;
  Plugins: Record<string, CapPlugin | undefined>;
}
declare global { interface Window { Capacitor?: Cap } }

export const isNative = (): boolean => !!window.Capacitor?.isNativePlatform?.();

/** Calls a native plugin method. Rejects with { code, message } as the plugin does. */
export async function nativeCall<T = unknown>(plugin: string, method: string, opts: object = {}): Promise<T> {
  const p = window.Capacitor?.Plugins[plugin], fn = p?.[method];
  if (!fn) throw Object.assign(new Error(`${plugin}.${method} isn't available`), { code: "unavailable" });
  return (await fn.call(p, opts)) as T;
}
/** Listens to a native plugin event. */
export async function nativeOn(plugin: string, event: string, cb: (data: unknown) => void): Promise<void> {
  const p = window.Capacitor?.Plugins[plugin] as unknown as { addListener?: (e: string, f: (d: unknown) => void) => unknown } | undefined;
  await p?.addListener?.(event, cb);
}

/* ---------- back button ---------- */

/** Something on screen that Back should close first (a sheet); returns true when it closed something. */
const closers: (() => boolean)[] = [];
export const onBackClose = (fn: () => boolean): void => { closers.push(fn); };

/** Pages visited, for Back (money pages replace the address rather than adding to it). */
const visited: string[] = [];
export function notePage(route: string): void {
  if (visited[visited.length - 1] !== route) visited.push(route);
  if (visited.length > 50) visited.splice(0, visited.length - 50);
}

let exitArmed = 0;
async function back(home: string, hint: (t: string) => void): Promise<void> {
  for (const c of closers) if (c()) return;
  if (visited.length > 1) {
    visited.pop();
    const to = visited.pop()!;
    location.hash = to;
    return;
  }
  const here = location.hash || "#/";
  if (here !== home) { visited.length = 0; location.hash = home; return; }
  if (Date.now() - exitArmed < 2000) { await nativeCall("App", "exitApp"); return; }
  exitArmed = Date.now();
  hint("Press back again to close Akhila Vrutta");
}

/** The phone's own behaviour: Back, and locking after a minute away. */
export function installNative(o: { home: string; hint: (t: string) => void; lockAfterMs: number; lock: () => void; locks: () => boolean }): void {
  if (!isNative()) return;
  notePage(location.hash || o.home);
  window.addEventListener("hashchange", () => notePage(location.hash || o.home));
  void nativeOn("App", "backButton", () => { void back(o.home, o.hint); });
  let away = 0;
  void nativeOn("App", "appStateChange", (d) => {
    const active = (d as { isActive?: boolean }).isActive;
    if (!active) { away = Date.now(); return; }
    if (away && o.locks() && Date.now() - away > o.lockAfterMs) o.lock();
    away = 0;
  });
}
