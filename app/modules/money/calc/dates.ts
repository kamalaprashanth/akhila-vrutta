/** Dates as the planner uses them: "YYYY-MM" months and "YYYY-MM-DD" days, local time. */

export type YM = string;
export type Day = string;

export const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const pad = (n: number): string => String(n).padStart(2, "0");

/** Today as YYYY-MM-DD. Tests pass their own date. */
export const todayOf = (d: Date = new Date()): Day => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const ymOf = (d: Day): YM => d.slice(0, 7);

function parts(ym: string): [number, number] {
  const [y, m] = ym.split("-").map(Number);
  return [y ?? 0, m ?? 0];
}

/** Month `n` months after `ym` (negative goes back). */
export function addM(ym: YM, n: number): YM {
  let [y, m] = parts(ym);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = (((m - 1) % 12) + 12) % 12 + 1;
  return `${y}-${pad(m)}`;
}

/** Months from `a` to `b`. */
export function diffM(a: YM, b: YM): number {
  const [y1, m1] = parts(a);
  const [y2, m2] = parts(b);
  return (y2 - y1) * 12 + (m2 - m1);
}

export const mLabel = (ym: YM): string => { const [y, m] = ym.split("-"); return `${MN[Number(m) - 1]} ${y}`; };
export const mShort = (ym: YM): string => { const [y, m] = ym.split("-"); return `${MN[Number(m) - 1]} '${(y ?? "").slice(2)}`; };
export const dLabel = (d: Day): string => { const [, m, dd] = d.split("-"); return `${Number(dd)} ${MN[Number(m) - 1]}`; };

/** Last day of the month. */
export function lastDay(ym: YM): Day {
  const [y, m] = parts(ym);
  return `${ym}-${pad(new Date(y, m, 0).getDate())}`;
}

/** Day `d` of a month, clamped to the month's length (31 → 30 Apr). */
export const dayIn = (y: number, m: number, d: number): Day => `${y}-${pad(m)}-${pad(Math.min(d, new Date(y, m, 0).getDate()))}`;
