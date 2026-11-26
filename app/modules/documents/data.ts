/**
 * Documents: every paper linked to what it belongs to, in the encrypted store; the files themselves are in the
 * vault (Drive, encrypted), owned by the document record.
 *   docs       { owner: { c, id }, type, year?, validTo?, num4?, note?, na?, added }
 *              na: marked "Not needed" for this owner (a property's checklist)
 *   docOwners  people, insurance policies and anything else that isn't elsewhere in the app
 * Owners: Money's properties (props), accounts and loans; Household's appliances (hhAppliances) and vehicles
 * (hhVehicles); docOwners.
 */
import type { Rec } from "../../core/store.ts";

export type Day = string;
export type Kind = "property" | "vehicle" | "person" | "appliance" | "insurance" | "account" | "other";
export interface Owner { c: string; id: string }
export interface Doc extends Rec { owner: Owner; type: string; year?: string; validTo?: Day; num4?: string; note?: string; na?: boolean; added: Day; deleted?: boolean }
export interface DocOwner extends Rec { group: "people" | "insurance" | "other"; name: string; rel?: string; kind?: string; insurer?: string; deleted?: boolean }
export interface Reader { all<T extends Rec = Rec>(c: string): T[]; get<T extends Rec = Rec>(c: string, id: string): T | undefined }
const live = <T extends Rec>(r: Reader, c: string): T[] => r.all<T>(c).filter((x) => !(x as { deleted?: boolean }).deleted);

/* ---------- document types ---------- */
export interface DocType { k: string; label: string; key?: boolean; yearly?: boolean; expires?: number; edu?: boolean }
const OTHER: DocType = { k: "other", label: "Other document" };
export const TYPES: Record<Kind, DocType[]> = {
  property: [
    { k: "sale_deed", label: "Sale deed", key: true },
    { k: "khata", label: "Khata certificate & extract", key: true },
    { k: "tax", label: "Property tax receipt", key: true, yearly: true },
    { k: "ec", label: "Encumbrance certificate (EC)", key: true },
    { k: "oc", label: "Occupancy / completion certificate", key: true },
    { k: "plan", label: "Approved building plan", key: true },
    { k: "agreement", label: "Sale agreement", key: true },
    { k: "rtc", label: "RTC / Pahani", key: true },
    { k: "mutation", label: "Mutation extract", key: true },
    { k: "conversion", label: "Land conversion order", key: true },
    { k: "power", label: "Electricity connection transfer", key: true },
    { k: "water", label: "Water connection transfer", key: true },
    { k: "society", label: "Society NOC / share certificate", key: true },
    OTHER,
  ],
  vehicle: [
    { k: "rc", label: "Registration certificate (RC)", key: true, expires: 60 },
    { k: "insurance", label: "Insurance policy", key: true, expires: 15 },
    { k: "puc", label: "PUC certificate", key: true, expires: 7 },
    { k: "fastag", label: "FASTag" },
    { k: "permit", label: "Permit", expires: 15 },
    { k: "invoice", label: "Purchase invoice" },
    { k: "loan", label: "Loan papers / NOC" },
    { k: "service", label: "Service record" },
    OTHER,
  ],
  person: [
    { k: "aadhaar", label: "Aadhaar", key: true },
    { k: "pan", label: "PAN card", key: true },
    { k: "passport", label: "Passport", expires: 180 },
    { k: "dl", label: "Driving licence", expires: 60 },
    { k: "voter", label: "Voter ID" },
    { k: "birth", label: "Birth certificate" },
    { k: "marriage", label: "Marriage certificate" },
    { k: "ration", label: "Ration card" },
    { k: "degree", label: "Degree certificate", edu: true },
    { k: "marks", label: "Mark sheets", edu: true },
    { k: "offer", label: "Offer / appointment letter", edu: true },
    { k: "relieving", label: "Relieving / experience letter", edu: true },
    { k: "form16", label: "Form 16", edu: true, yearly: true },
    { k: "payslip", label: "Payslips", edu: true },
    OTHER,
  ],
  appliance: [
    { k: "invoice", label: "Invoice / bill" },
    { k: "warranty", label: "Warranty card" },
    { k: "manual", label: "Manual" },
    { k: "amc", label: "AMC contract", expires: 30 },
    { k: "service", label: "Service report" },
    OTHER,
  ],
  insurance: [
    { k: "policy", label: "Policy document", key: true, expires: 30 },
    { k: "premium", label: "Premium receipt", yearly: true },
    { k: "claim", label: "Claim papers" },
    OTHER,
  ],
  account: [
    { k: "sanction", label: "Sanction / opening letter" },
    { k: "statement", label: "Statement", yearly: true },
    { k: "interest", label: "Interest certificate", yearly: true },
    { k: "noc", label: "NOC / closure letter" },
    OTHER,
  ],
  other: [OTHER],
};
export const typeOf = (kind: Kind, k: string): DocType => TYPES[kind].find((t) => t.k === k) ?? OTHER;

/* ---------- owners ---------- */
export interface OwnerInfo { owner: Owner; kind: Kind; name: string; icon: string; sub?: string }
const OWNER_KIND: Record<string, Kind> = { props: "property", hhVehicles: "vehicle", hhAppliances: "appliance", accounts: "account", loans: "account" };
const VEH_ICON: Record<string, string> = { car: "🚗", bike: "🏍️", other: "🚙" };
export function ownerKind(r: Reader, o: Owner): Kind {
  if (o.c === "docOwners") { const g = r.get<DocOwner>("docOwners", o.id)?.group; return g === "people" ? "person" : g === "insurance" ? "insurance" : "other"; }
  return OWNER_KIND[o.c] ?? "other";
}
export function ownerInfo(r: Reader, o: Owner): OwnerInfo | null {
  const x = r.get<Rec & { name?: string; deleted?: boolean; kind?: string; reg?: string; type?: string; lender?: string; group?: string; rel?: string; insurer?: string }>(o.c, o.id);
  if (!x || x.deleted) return null;
  const kind = ownerKind(r, o);
  const icon = kind === "property" ? "🏠" : kind === "vehicle" ? (VEH_ICON[x.kind ?? "car"] ?? "🚗") : kind === "person" ? "🧑" : kind === "appliance" ? "🔌" : kind === "insurance" ? "🛡️" : kind === "account" ? (o.c === "loans" ? "🏦" : "💳") : "📁";
  const sub = kind === "vehicle" ? x.reg : kind === "person" ? x.rel : kind === "insurance" ? [x.kind, x.insurer].filter(Boolean).join(" · ") : kind === "account" ? (o.c === "loans" ? ["loan", x.lender].filter(Boolean).join(" · ") : x.type) : undefined;
  return { owner: o, kind, name: String(x.name || (kind === "vehicle" ? "Vehicle" : "Untitled")), icon, sub: sub || undefined };
}
export const sameOwner = (a: Owner, b: Owner): boolean => a.c === b.c && a.id === b.id;

/** Every owner, grouped for the Documents page. */
export function groups(r: Reader): [string, OwnerInfo[]][] {
  const of = (c: string, pred: (x: Rec) => boolean = () => true): OwnerInfo[] => live(r, c).filter(pred).map((x) => ownerInfo(r, { c, id: x.id })).filter((x): x is OwnerInfo => !!x).sort((a, b) => a.name.localeCompare(b.name));
  const grp = (g: string) => (x: Rec): boolean => (x as DocOwner).group === g;
  const people = of("docOwners", grp("people"));
  const eduPeople = people.filter((p) => docsOf(r, p.owner).some((d) => typeOf("person", d.type).edu));
  return [
    ["Properties", of("props")],
    ["Vehicles", of("hhVehicles")],
    ["People", people],
    ["Education & work", eduPeople],
    ["Appliances", of("hhAppliances")],
    ["Insurance", of("docOwners", grp("insurance"))],
    ["Loans and accounts", [...of("loans"), ...of("accounts", (x) => (x as { type?: string }).type !== "cash")]],
    ["Other", of("docOwners", grp("other"))],
  ];
}

export const docsOf = (r: Reader, o: Owner): Doc[] => live<Doc>(r, "docs").filter((d) => sameOwner(d.owner, o));

/* ---------- years ---------- */
/** The Indian financial year a day falls in: "2026-27" for 1 Apr 2026 to 31 Mar 2027. */
export const fyOf = (d: Day): string => { const y = +d.slice(0, 4), m = +d.slice(5, 7), s = m >= 4 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; };
export const fyLabel = (fy: string): string => fy.replace("-", "–");
export const recentFys = (today: Day, n = 4): string[] => { const cur = +fyOf(today).slice(0, 4); return Array.from({ length: n }, (_, i) => `${cur - i}-${String((cur - i + 1) % 100).padStart(2, "0")}`); };

/* ---------- checklists ---------- */
export interface CheckRow { type: DocType; docs: Doc[]; na: boolean; years?: { fy: string; have: boolean }[] }
/** The key papers for an owner: which are there, which are marked not needed, and yearly ones by year. */
export function checklist(r: Reader, o: Owner, today: Day): CheckRow[] {
  const kind = ownerKind(r, o), ds = docsOf(r, o);
  return TYPES[kind].filter((t) => t.key).map((t) => {
    const mine = ds.filter((d) => d.type === t.k && !d.na), na = ds.some((d) => d.type === t.k && d.na);
    return { type: t, docs: mine, na, ...(t.yearly ? { years: recentFys(today).map((fy) => ({ fy, have: mine.some((d) => d.year === fy) })) } : {}) };
  });
}
/** How many key papers are there (yearly ones count when this year's is there), out of those that apply. */
export function keyScore(rows: CheckRow[]): { have: number; of: number } {
  const apply = rows.filter((x) => !x.na);
  return { have: apply.filter((x) => (x.years ? x.years[0]!.have : x.docs.length > 0)).length, of: apply.length };
}

/* ---------- needs attention ---------- */
export interface Attention { title: string; sub: string; date: Day; owner: Owner; docId?: string; level: "bad" | "warn" }
const days = (a: Day, b: Day): number => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export function attention(r: Reader, today: Day): Attention[] {
  const out: Attention[] = [];
  for (const d of live<Doc>(r, "docs")) {
    const info = ownerInfo(r, d.owner); if (!info || !d.validTo || d.na) continue;
    const t = typeOf(info.kind, d.type), warnFrom = Math.max(t.expires ?? 30, 30), left = days(today, d.validTo);
    // superseded: a newer one of the same type for the same owner
    if (live<Doc>(r, "docs").some((x) => x.id !== d.id && sameOwner(x.owner, d.owner) && x.type === d.type && (x.validTo ?? "") > d.validTo!)) continue;
    if (left > warnFrom || left < -90) continue;
    out.push({ title: `${t.label} · ${info.name}`, sub: left < 0 ? `Expired ${-left} days ago` : left === 0 ? "Expires today" : `Expires in ${left} days`, date: d.validTo, owner: d.owner, docId: d.id, level: left <= 15 ? "bad" : "warn" });
  }
  // this year's property tax receipt, from April
  const fy = fyOf(today);
  for (const p of live(r, "props")) {
    const o = { c: "props", id: p.id }, ds = docsOf(r, o);
    if (ds.some((d) => d.type === "tax" && (d.na || d.year === fy))) continue;
    const info = ownerInfo(r, o); if (!info) continue;
    out.push({ title: `Property tax ${fyLabel(fy)} · ${info.name}`, sub: "Receipt not added", date: `${fy.slice(0, 4)}-04-30`, owner: o, level: today > `${fy.slice(0, 4)}-04-30` ? "bad" : "warn" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- phone reminders ---------- */
const nine = (d: Day, back = 0): Date => { const x = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 9); x.setDate(x.getDate() - back); return x; };
/** Before a document expires (and on the day), and on 10 and 25 April when a property's tax receipt for the year is missing. Names only. */
export function docNotes(r: Reader, now: Date, horizon = 45): { title: string; at: Date }[] {
  const end = new Date(now.getTime() + horizon * 864e5), out: { title: string; at: Date }[] = [];
  const add = (title: string, at: Date): void => { if (at > now && at <= end) out.push({ title, at }); };
  for (const d of live<Doc>(r, "docs")) {
    if (!d.validTo || d.na) continue;
    const info = ownerInfo(r, d.owner); if (!info) continue;
    // vehicle renewals have their own reminders in Household
    if (info.kind === "vehicle" && ["insurance", "puc", "rc", "fastag", "permit"].includes(d.type)) continue;
    const t = typeOf(info.kind, d.type), before = t.expires ?? 30;
    add(`${t.label} (${info.name}) expires in ${before} days`, nine(d.validTo, before));
    add(`${t.label} (${info.name}) expires today`, nine(d.validTo));
  }
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const y = +today.slice(0, 4);
  for (const fy of new Set([fyOf(`${y}-04-15`), fyOf(`${y + 1}-04-15`)])) {
    for (const p of live(r, "props")) {
      const o = { c: "props", id: p.id };
      if (docsOf(r, o).some((d) => d.type === "tax" && (d.na || d.year === fy))) continue;
      const name = ownerInfo(r, o)?.name ?? "Property";
      for (const day of ["10", "25"]) add(`Property tax ${fyLabel(fy)} for ${name}: receipt not added`, nine(`${fy.slice(0, 4)}-04-${day}`));
    }
  }
  return out.sort((a, b) => +a.at - +b.at);
}

/* ---------- search ---------- */
export interface Hit { doc: Doc; info: OwnerInfo; label: string }
export function search(r: Reader, q: string, fileNames: (docId: string) => string[]): Hit[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: Hit[] = [];
  for (const d of live<Doc>(r, "docs")) {
    if (d.na) continue;
    const info = ownerInfo(r, d.owner); if (!info) continue;
    const label = typeOf(info.kind, d.type).label;
    const hay = [label, info.name, info.sub, d.note, d.year ? fyLabel(d.year) : "", d.num4, ...fileNames(d.id)].filter(Boolean).join(" ").toLowerCase();
    if (words.every((w) => hay.includes(w))) out.push({ doc: d, info, label });
  }
  return out.sort((a, b) => a.info.name.localeCompare(b.info.name) || a.label.localeCompare(b.label));
}

/** The last 4 characters of a number (the rest is never kept). */
export const last4 = (s: string): string => s.replace(/[\s-]/g, "").slice(-4).toUpperCase();
