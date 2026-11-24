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
const SYNCS = ["syncs[].bal", "syncs[].was"];

/** Bumped whenever MONEY_FIELDS changes: stored data from an older list must be imported again (or upgraded, below). */
export const AMOUNTS_VERSION = "paise-7";
/**
 * Stored data one version behind that can be brought up to date in place, without importing again:
 * the fields that became money (stored in rupees until then), per collection.
 */
export const UPGRADES: Record<string, { to: string; fields: Record<string, string[]> }> = {
  "paise-6": { to: "paise-7", fields: { accounts: ["limit", "fee", "feeWaive"] } },
};
/** The writes that bring stored data from `meta.amounts` up to AMOUNTS_VERSION, or null if it can't be. */
export function upgradeWrites(meta: Rec & { amounts?: unknown }, all: (c: string) => Rec[], now = Date.now()): { ops: { c: string; id: string; r: Rec }[]; meta: Rec } | null {
  const ops: { c: string; id: string; r: Rec }[] = [];
  let m: Rec & { amounts?: unknown } = meta;
  for (let up = UPGRADES[String(m.amounts)]; up; up = UPGRADES[String(m.amounts)]) {
    for (const [c, fields] of Object.entries(up.fields)) for (const r of all(c)) {
      const x: Record<string, unknown> = { ...r }; let changed = false;
      for (const f of fields) if (typeof x[f] === "number") { x[f] = rupeesToPaise(x[f] as number); changed = true; }
      if (changed) ops.push({ c, id: r.id, r: { ...(x as Rec), updatedAt: now } });
    }
    m = { ...m, amounts: up.to, upgraded: new Date(now).toISOString() };
  }
  if (m.amounts !== AMOUNTS_VERSION) return null;
  return { ops: [...ops, { c: "meta", id: String(m.id), r: m }], meta: m };
}

export const MONEY_FIELDS: Record<string, string[]> = {
  // A card's credit limit, annual fee and the spend that waives it are money too.
  accounts: ["opening", "minBal", "reserveStart", "emTarget", "limit", "fee", "feeWaive"],
  categories: ["limit"],
  txns: ["amount", "carry", "fundAmt", "funds[].amt", "charges"],
  recurring: ["amount", "ov.*", "charges"],
  loans: ["principal", "emi", "fee", "bank.principal", "bank.emi", "plans[].amount", ...SYNCS, ...SYNCS.map((x) => `bank.${x}`)],
  holdings: [
    "openInvested", "value", "history[].value", "epfEmp", "epfEr", "yearly",
    "nps.contrib", "nps.value", "nps.charges", "ppf.rows[].amt", "ppf.manual[].amt",
    ...["emp", "er", "eps", "epsw"].map((f) => `epf.manual[].${f}`),
    `${EPF_FY}.close[]`, `${EPF_FY}.int[]`, `${EPF_FY}.ob[]`, ...EPF_ROW.map((f) => `${EPF_FY}.rows[].${f}`),
  ],
  props: ["value", "cur", "plan[].amt", "plan[].gst", "plan[].youAmt", "plan[].bankAmt",
    "stmt.chg", "stmt.int", "stmt.out", "stmt.pemi", "stmt.prin", "fund.start"],
  propItems: ["amt", "loanAmt", "funds[].amt"],
  snaps: ["banks", "cards", "inv", "loans", "prop", "total"],
  // Education costs (school, graduation, post-grad) and retirement spending, in today's rupees.
  goals: ["target", "saved", "school", "ug", "pg", "spend"],
};

/**
 * Numbers that are not rupee amounts and stay as they are: days, rates and percentages, units, per-unit
 * prices (rupees per unit, with decimals), foreign-currency amounts, times. Anything numeric in neither
 * list is reported by `unclassified`, so a new money field can't slip through unconverted.
 */
export const NOT_MONEY: Record<string, string[]> = {
  "*": ["updatedAt"],
  accounts: ["dueDay", "stmtDay", "apr", "reward"],
  goals: ["pri", "kid", "inf", "ret", "life", "pre", "post"],
  recurring: ["day", "remind"],
  loans: ["day", "rate", "tenure", "gstRate", "rates[].rate", "bank.day", "bank.rate", "bank.tenure", "bank.rates[].rate", "plans[].day"],
  holdings: ["rate", "fx", "price", "openUnits", "usdCost", "navHist[][]", "priceJump.from", "priceJump.to",
    "epf.raise", "epf.rate", "epf.retireAge", "epf.manual[].fy", "nps.retireAge", "nps.alloc.*", "nps.xirr", "npsLines[].hist[][]", "npsLines[].price", "npsLines[].units"],
  props: ["fund.ltv"],
  // App settings: months of spending for the emergency fund. (Profile amounts are kept as typed text.)
  settings: ["emMonths"],
  // Units bought with an investment entry
  txns: ["units"],
  // Broker trades are in their own currency (ccy), with per-unit prices.
  trades: ["amt", "fee", "price", "qty"],
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

function pathRegex(p: string): RegExp {
  const esc = tokens(p).map((t) => (t === "*" ? "[^.]+" : t === "[]" ? "\\[\\]" : t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  return new RegExp(`^${esc.join("\\.").replace(/\\.\\\[\\\]/g, "\\[\\]")}$`);
}
const known = new Map<string, RegExp[]>();
function patterns(c: string): RegExp[] {
  if (!known.has(c)) known.set(c, [...(MONEY_FIELDS[c] ?? []), ...(NOT_MONEY[c] ?? []), ...(NOT_MONEY["*"] ?? [])].map(pathRegex));
  return known.get(c)!;
}

/** Number fields in a record that are in neither list (each path once, e.g. "loans: syncs[].bal"). */
export function unclassified(c: string, r: Rec): string[] {
  const found = new Set<string>();
  const leaf = (node: unknown, path: string): void => {
    if (typeof node === "number") { if (!patterns(c).some((re) => re.test(path))) found.add(path); return; }
    if (Array.isArray(node)) { for (const x of node) leaf(x, `${path}[]`); return; }
    if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) leaf(v, path ? `${path}.${k}` : k);
  };
  leaf(r, "");
  return [...found];
}

/** A planner record (rupees) as it is stored (paise). */
export const toStored = (c: string, r: Rec): Rec => convert(c, r, rupeesToPaise);
/** A stored record (paise) as the planner uses it (rupees). */
export const fromStored = (c: string, r: Rec): Rec => convert(c, r, paiseToRupees);
