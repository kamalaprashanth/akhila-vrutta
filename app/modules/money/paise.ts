/**
 * Money amounts are stored in paise (whole numbers). The moved-over planner still works in rupees,
 * so records are converted on the way in and out. Only the fields listed here are money in rupees;
 * prices, units, rates and dollar amounts stay as they are.
 *
 * Path syntax: "a.b" nested field, "a[]" every item of a list, "a.*" every value of an object.
 */
import type { Rec } from "../../core/store.ts";

const EPF_ROW = ["emp", "eps", "epsw", "er", "wage"];
const EPF_FY = "epf.books.*.fys.*";

export const MONEY_FIELDS: Record<string, string[]> = {
  accounts: ["opening"],
  txns: ["amount", "carry", "fundAmt", "funds[].amt"],
  recurring: ["amount", "ov.*"],
  loans: ["principal", "emi", "bank.principal", "bank.emi", "plans[].amount"],
  holdings: [
    "openInvested", "value", "history[].value", "epfEmp", "epfEr", "yearly",
    "nps.contrib", "nps.value", "nps.charges", "ppf.rows[].amt",
    `${EPF_FY}.close[]`, `${EPF_FY}.int[]`, `${EPF_FY}.ob[]`, ...EPF_ROW.map((f) => `${EPF_FY}.rows[].${f}`),
  ],
  props: ["value", "cur", "plan[].amt", "plan[].gst", "stmt.chg", "stmt.int", "stmt.out", "stmt.pemi", "stmt.prin", "fund.start"],
  propItems: ["amt"],
  snaps: ["banks", "cards", "inv", "loans", "prop", "total"],
};

type Conv = (n: number) => number;
export const rupeesToPaise: Conv = (r) => Math.round(r * 100);
export const paiseToRupees: Conv = (p) => p / 100;

function tokens(path: string): string[] {
  return path.replace(/\[\]/g, ".[]").split(".").filter(Boolean);
}

/** Applies `fn` to every number at `toks` inside `node` (in place). */
function walk(node: unknown, toks: string[], fn: Conv): unknown {
  if (!toks.length) return typeof node === "number" && Number.isFinite(node) ? fn(node) : node;
  if (node === null || typeof node !== "object") return node;
  const [t, ...rest] = toks as [string, ...string[]];
  if (t === "[]") {
    if (Array.isArray(node)) for (let i = 0; i < node.length; i++) node[i] = walk(node[i], rest, fn);
    return node;
  }
  const o = node as Record<string, unknown>;
  if (t === "*") { for (const k of Object.keys(o)) o[k] = walk(o[k], rest, fn); return node; }
  if (t in o) o[t] = walk(o[t], rest, fn);
  return node;
}

function convert(c: string, r: Rec, fn: Conv): Rec {
  const paths = MONEY_FIELDS[c];
  const out = structuredClone(r);
  if (paths) for (const p of paths) walk(out, tokens(p), fn);
  return out;
}

/** A planner record (rupees) as it is stored (paise). */
export const toStored = (c: string, r: Rec): Rec => convert(c, r, rupeesToPaise);
/** A stored record (paise) as the planner uses it (rupees). */
export const fromStored = (c: string, r: Rec): Rec => convert(c, r, paiseToRupees);
