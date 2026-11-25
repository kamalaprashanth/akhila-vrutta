/**
 * Reminders on the Android phone: each area (Money's bills, Household's jobs and warranties) gives what it
 * wants shown; after any change the whole set is replaced. Notifications name the thing only, never an
 * amount, as they can show on the lock screen. In a browser this does nothing.
 */
import { isNative, nativeCall } from "./native.ts";

export interface Note { title: string; body?: string; at: Date }
const sources = new Map<string, () => Note[]>();
export const setReminderSource = (name: string, fn: () => Note[]): void => { sources.set(name, fn); };

/** Everything to schedule, soonest first, at most 120 (with ids). */
export function allNotes(now = new Date()): (Note & { id: number })[] {
  const list: Note[] = [];
  for (const fn of sources.values()) { try { list.push(...fn()); } catch (e) { console.warn("reminders", e); } }
  return list.filter((n) => n.at > now).sort((a, b) => +a.at - +b.at).slice(0, 120).map((n, i) => ({ ...n, id: 1000 + i }));
}

let timer = 0;
let asked = false;
/** Replaces the phone's scheduled reminders (debounced: called after every change). */
export function scheduleReminders(wait = 3000): void {
  if (!isNative()) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => void (async () => {
    try {
      // Android 13+ asks once whether the app may show notifications
      const perm = await nativeCall<{ display: string }>("LocalNotifications", "checkPermissions");
      if (perm.display !== "granted") {
        if (asked) return;
        asked = true;
        if ((await nativeCall<{ display: string }>("LocalNotifications", "requestPermissions")).display !== "granted") return;
      }
      const pend = await nativeCall<{ notifications: { id: number }[] }>("LocalNotifications", "getPending");
      if (pend.notifications.length) await nativeCall("LocalNotifications", "cancel", { notifications: pend.notifications.map((n) => ({ id: n.id })) });
      const list = allNotes();
      // inexact (Android times it, around 9 AM): Play allows exact alarms only for alarm and calendar apps,
      // and asking for them sends you to the "Alarms & reminders" settings screen
      if (list.length) await nativeCall("LocalNotifications", "schedule", { notifications: list.map((r) => ({ id: r.id, title: r.title, body: r.body ?? "Open Akhila Vrutta to see it.", schedule: { at: r.at.toISOString(), allowWhileIdle: true }, isExactNotification: false })) });
    } catch (e) { console.warn("reminders", e); }
  })(), wait);
}
