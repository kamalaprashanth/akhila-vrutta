/**
 * Money is stored as whole paise (integers) everywhere in Akhila Vrutta.
 * Rupees with decimals drift when added up thousands of times; integers don't.
 * Convert at the edges only: when reading what a person typed, and when showing it.
 */

export type Paise = number;

/** "12,34,567.50", "₹1,000", "1000.5" or 1000.5 → paise. Returns null for anything that isn't a number. */
export function toPaise(input: string | number): Paise | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const negative = cleaned.startsWith("-");
  const [whole = "0", frac = ""] = cleaned.replace("-", "").split(".");
  const value = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -value : value;
}

/** Indian digit grouping: 1234567 → "12,34,567". */
export function groupIndian(whole: number): string {
  const s = String(Math.abs(Math.trunc(whole)));
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

export interface FormatOptions {
  /** Show paise ("₹1,234.50"); off by default ("₹1,235"). */
  paise?: boolean;
  /** Leave out the ₹ sign. */
  bare?: boolean;
}

/** Paise → "₹12,34,567" (or with paise). Negative amounts get a leading minus sign. */
export function formatINR(p: Paise, opts: FormatOptions = {}): string {
  const negative = p < 0;
  const abs = Math.abs(p);
  const sign = negative ? "−" : "";
  const sym = opts.bare ? "" : "₹";
  if (opts.paise) {
    const whole = Math.floor(abs / 100);
    const frac = String(abs % 100).padStart(2, "0");
    return `${sign}${sym}${groupIndian(whole)}.${frac}`;
  }
  return `${sign}${sym}${groupIndian(Math.round(abs / 100))}`;
}

/** Short form for summaries: ₹4.5 lakh, ₹1.39 crore, ₹950. */
export function formatShort(p: Paise): string {
  const r = Math.abs(p) / 100;
  const sign = p < 0 ? "−" : "";
  const trim = (n: number, d: number) => n.toFixed(d).replace(/\.?0+$/, "");
  if (r >= 1e7) return `${sign}₹${trim(r / 1e7, 2)} crore`;
  if (r >= 1e5) return `${sign}₹${trim(r / 1e5, 1)} lakh`;
  return formatINR(p);
}

/** Adds paise safely (integers only). */
export const sum = (values: Iterable<Paise>): Paise => {
  let total = 0;
  for (const v of values) total += v;
  return total;
};
