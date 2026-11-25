/**
 * Bill reminders on the Android phone: real notifications at 9 AM the day before and on the due day, for
 * bills, card dues, EMIs and SIPs (the same list as the calendar file), even when the app is closed. They
 * name the bill only: no amounts, as they can show on the lock screen. Scheduled by core/reminders.ts.
 */

type Day = string;
export interface Reminder { id: number; title: string; body: string; at: Date }
/** One line of the reminders list (views/more.ts reminderItems): name, first due day, repeat rule. */
export interface DueItem { t: string; d: Day; rr: string }

const pad = (n: number): string => String(n).padStart(2, "0");
const lastDayOf = (y: number, m: number): number => new Date(y, m, 0).getDate();
const dayStr = (y: number, m: number, d: number): Day => `${y}-${pad(m)}-${pad(Math.min(d, lastDayOf(y, m)))}`;

/** The due days of one item from its first date and its repeat rule, within [from, to]. */
export function dueDays(first: Day, rr: string, from: Day, to: Day): Day[] {
  const R = Object.fromEntries(rr.split(";").map((p) => p.split("=") as [string, string]));
  const step = Math.max(1, +(R.INTERVAL ?? 1) || 1), by = +(R.BYMONTHDAY ?? +first.slice(8)) || +first.slice(8);
  const until = R.UNTIL ? `${R.UNTIL.slice(0, 4)}-${R.UNTIL.slice(4, 6)}-${R.UNTIL.slice(6, 8)}` : "9999-12-31";
  const out: Day[] = [];
  let y = +first.slice(0, 4), m = +first.slice(5, 7);
  for (let i = 0; i < 400; i++) {
    const d = i === 0 ? first : dayStr(y, m, by);
    if (d > to || d > until) break;
    if (d >= from) out.push(d);
    m += step; while (m > 12) { m -= 12; y++; }
  }
  return out;
}

/** What the phone should show in the next `days` days (two per due day), soonest first. */
export function phoneReminders(items: DueItem[], now = new Date(), days = 45): Reminder[] {
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const end = new Date(now.getTime() + days * 864e5), to = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  const out: Omit<Reminder, "id">[] = [];
  for (const r of items) {
    if (!/( due| EMI)$/.test(r.t)) continue;   // income isn't a bill
    const name = r.t.replace(/ due$/, "");
    for (const day of dueDays(r.d, r.rr, today, to)) {
      const at = (dd: Day, back: number): Date => { const x = new Date(+dd.slice(0, 4), +dd.slice(5, 7) - 1, +dd.slice(8, 10), 9, 0, 0); x.setDate(x.getDate() - back); return x; };
      for (const [back, when] of [[1, "tomorrow"], [0, "today"]] as const) {
        const t = at(day, back); if (t <= now) continue;
        out.push({ title: `${name} due ${when}`, body: "Open Akhila Vrutta to pay or mark it paid.", at: t });
      }
    }
  }
  return out.sort((a, b) => +a.at - +b.at).slice(0, 120).map((x, i) => ({ ...x, id: 1000 + i }));
}
