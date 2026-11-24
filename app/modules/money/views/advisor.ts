/**
 * The Advisor, as in KP Money Planner: quick questions and a chat with Claude about your whole picture
 * (through Akhila Vrutta's askClaude function), and the monthly check-up. What Claude sees is built here,
 * from the stored data, in rupees (the same text the planner sent).
 */
import { esc } from "../../../core/dom.ts";
import { addM, dLabel, mLabel, ymOf } from "../calc/dates.ts";
import { num, type Loan, type MoneyData, type Paise, type Rec } from "../calc/data.ts";
import { balances, cardInfo, type Account } from "../calc/accounts.ts";
import { accName, catName, FREQ, type Recurring } from "../calc/plan.ts";
import { readiness, reserveState } from "../calc/reserve.ts";
import { catLbl, emBase, emExcluded, emMonths, monthFigures, offBook } from "../calc/insights.ts";
import { holdingSum, type Holding } from "../calc/invest.ts";
import { loanSum } from "../calc/loans.ts";
import { propCalc, type Property } from "../calc/properties.ts";
import { money, type Tx } from "./txlist.ts";
import { dFull, GOAL_KINDS, recNextLbl, smartGoal } from "./plan.ts";
import type { Page, PageHost } from "./pages.ts";
import { openSheet, closeModal, toast } from "../ui/kit.ts";
import { E } from "../ui/env.ts";

export const ADV_Q: [string, string][] = [["Full health check", "Do a full financial health check of my situation across every area."], ["Prepay a loan or invest?", "Should I prepay any of my loans or keep investing? Which loan first, if any?"], ["Am I insured enough?", "Is my term, health and accident cover enough for my income, dependents and loans?"], ["Tax saving this year", "How can I save tax this financial year with what I already have? What's still unused?"], ["Am I ready for Kumar?", "Am I ready for the Kumar property payments and loan? What do I need and when?"], ["Retirement on track?", "Is my retirement on track for the age and income in my profile?"], ["Child education plan", "Am I on track for the child education goal? What should I put aside each month?"], ["Close loans faster?", "How can I close my loans faster without hurting my other goals?"]];

interface Profile extends Rec { dob?: string; age?: string | number; updated?: string; wifeCat?: string; covered?: string[]; propUse?: Record<string, string>; spouse?: { name?: string; dob?: string }; kids?: { name?: string; dob?: string }[]; depends?: { father?: boolean; mother?: boolean } }
const prof = (d: MoneyData): Profile => d.byId<Profile>("settings", "profile") ?? { id: "profile" };
const ageOf = (d: MoneyData, dob?: string): number | null => { if (!dob) return null; const t = d.today, y = +t.slice(0, 4) - +dob.slice(0, 4); return t.slice(5) >= dob.slice(5) ? y : y - 1; };
const myAge = (d: MoneyData): number | null => { const P = prof(d); return ageOf(d, P.dob) ?? (P.age ? +P.age : null); };
export function family(d: MoneyData): { k: string; n: string; dob?: string; age?: number | null; kid?: number }[] {
  const P = prof(d), F: { k: string; n: string; dob?: string; age?: number | null; kid?: number }[] = [{ k: "me", n: "You", dob: P.dob, age: myAge(d) }];
  if (P.spouse && (P.spouse.name || P.spouse.dob)) F.push({ k: "sp", n: P.spouse.name || "Spouse", dob: P.spouse.dob, age: ageOf(d, P.spouse.dob) });
  (P.kids ?? []).forEach((c, i) => { if (c && (c.name || c.dob)) F.push({ k: "k" + i, n: c.name || `Child ${i + 1}`, dob: c.dob, age: ageOf(d, c.dob), kid: i }); });
  const dp = P.depends || {};
  if (dp.father) F.push({ k: "father", n: "Father" });
  if (dp.mother) F.push({ k: "mother", n: "Mother" });
  return F;
}
export const advCheck = (d: MoneyData): Rec & { ym?: string; at?: string; triedOn?: string; quick?: { verdict?: string; pts?: { ok: boolean; t: string }[] }; full?: string } => d.byId("settings", "advcheck") ?? { id: "advcheck" };
const scrub = (s: unknown): string => String(s || "").replace(/\d{6,}/g, "…").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").replace(/\b[\w.-]+@[a-z]{2,}\b/gi, "[upi]").replace(/\s+/g, " ").trim();


/** What the advisor sees: every figure in whole rupees, as the planner sent it. */
export function advContext(d: MoneyData, nextLbl: (r: Recurring) => string = (r) => recNextLbl(d, r)): string {
  const P = prof(d) as Profile & Record<string, unknown>, now = ymOf(d.today), td = d.today, r0 = (p: unknown): number => Math.round(num(p) / 100), L: string[] = [], wc = P.wifeCat;
  const from = addM(now, -23) + "-01";
  L.push(`TODAY ${td}. All amounts in ₹. Only KP's own finances are planned. ${wc ? `Income in category "${catName(d, wc)}" is money KP's wife sends occasionally: treat it as a bonus, never rely on it.` : ""}`);
  const g = (k: string, l: string): string | null => { const v = P[k]; if (v == null || v === "" || (Array.isArray(v) && !v.length)) return null; return `${l}: ${/^(termCover|termPrem|healthSum|healthPrem|topup|empHealth|accident|groupTerm)$/.test(k) && +(v as string) > 0 ? money(Math.round(+(v as string) * 100)) : Array.isArray(v) ? v.join(", ") : v}`; };
  const fam = family(d);
  L.push("Family: " + fam.map((m) => `${m.n}${m.age != null ? ` (${m.age})` : ""}`).join(", ") + "; health cover includes: " + ((P.covered ?? []).map((k) => (fam.find((m) => m.k === k) || ({} as { n?: string })).n).filter(Boolean).join(", ") || "not said"));
  L.push("", "PROFILE (as filled in by KP; blank = unknown, ask if it matters):", ...[g("age", "Age"), g("dob", "Date of birth"), g("retire", "Plans to retire at"), g("deps", "Dependents"), g("job", "Job stability"), g("risk", "Risk appetite"), g("salary", "Take-home salary per month"), g("bonus", "Bonus"), g("regime", "Tax regime"),
    g("termCover", "Term cover"), g("termUntil", "Term cover until age"), g("termPrem", "Term premium"), g("healthSum", "Health sum insured"), g("healthType", "Health cover type"), g("healthPrem", "Health premium a year"), g("topup", "Health top-up"), g("empHealth", "Employer health cover"), g("parents", "Parents have health cover"), g("accident", "Personal accident cover"), g("groupTerm", "Employer group term"),
    g("assets", "Assets outside the app"), g("nominees", "Nominees updated"), g("will", "Has a will"), g("estateNote", "Estate note")].filter((x): x is string => !!x));
  { const GL = d.live<Rec & { pri?: number; name?: string; kind?: string }>("goals").slice().sort((a, b) => (num(a.pri) || 99) - (num(b.pri) || 99)); if (GL.length) { L.push("GOALS (priority order, with the app's own working):"); GL.forEach((x, i) => { const r = smartGoal(d, x); L.push(`${i + 1}. ${x.name} [${GOAL_KINDS[x.kind || "custom"]}]: ${r.sub}; ${r.rows.map(([a, b]) => a + " " + b).join(", ")}; ${r.msg}`); }); } }
  L.push(`Emergency fund basis: ${emMonths(d)} months of average monthly spending (${money(emBase(d))}, last 12 months, excluding ${[...emExcluded(d)].map((k) => catLbl(d, k)).join(", ") || "nothing"}).`);
  const pu = P.propUse || {}, pl = d.live<Property>("props").map((p) => (pu[p.id] ? `${p.name}: ${pu[p.id]}` : null)).filter(Boolean);
  if (pl.length) L.push("Property use: " + pl.join("; "));
  L.push("", "MONTHS (income | expenses | invested | set aside for big bills | balance):");
  for (let i = 23; i >= 0; i--) { const m = addM(now, -i), f = monthFigures(d, m); L.push(`${m}${m === now ? " (part-way: actual + still due)" : ""}: ${r0(f.income)} | ${r0(f.expense)} | ${r0(f.investment)} | ${r0(f.setAside)} | ${r0(f.balance)}`); }
  const yrs = new Map<string, Record<string, number>>();
  for (const t of d.live<Tx>("txns")) if ((t.date ?? "") < from && ["income", "expense", "investment"].includes(String(t.type)) && !offBook(t)) { const y = String(t.date).slice(0, 4), o = yrs.get(y) || { income: 0, expense: 0, investment: 0 }; o[t.type!]! += num(t.amount); yrs.set(y, o); }
  if (yrs.size) { L.push("", "EARLIER YEARS (income | expenses | invested):"); [...yrs.entries()].sort().forEach(([y, o]) => L.push(`${y}: ${r0(o.income)} | ${r0(o.expense)} | ${r0(o.investment)}`)); }
  const bal = balances(d);
  L.push("", "ACCOUNTS TODAY:");
  for (const a of d.live<Account & { hidden?: boolean; main?: boolean; reserve?: boolean; minBal?: Paise }>("accounts").filter((a) => !a.hidden)) {
    if (a.type === "card") { const c = cardInfo(d, a); L.push(`${a.name} (credit card): bill due ${r0(c ? c.dueLeft : 0)}${c && c.due ? ` by ${c.due}` : ""}, unbilled ${r0(c ? c.unbilled : 0)}`); }
    else L.push(`${a.name} (${a.type || "bank"}): ${r0(bal.get(a.id))}${a.main ? " · main account" : ""}${a.reserve ? " · holds big-bills reserve + emergency fund" : ""}${num(a.minBal) ? ` · keeps ${r0(a.minBal)}` : ""}`);
  }
  const st = reserveState(d);
  if (st.a) L.push(`Reserve in ${st.a.name}: big bills ${r0(st.held)} of ${r0(st.target)} needed · put aside ${r0(st.monthly)} this month (still to do ${r0(st.setAside)}) · emergency fund ${r0(st.emergency)}${st.emTarget ? ` (target ${r0(st.emTarget)})` : ""}`);
  L.push("", "INVESTMENTS (type · name · platform: value, invested, gain %):");
  for (const h of d.live<Holding & { platform?: string; nps?: { choice?: string } }>("holdings").filter((h) => !h.closed)) {
    const x = holdingSum(d, h);
    if (!(x.value > 50 || x.inv > 50)) continue;
    L.push(`${h.type} · ${h.name}${h.platform ? ` · ${h.platform}` : ""}: ${r0(x.value)}, ${r0(x.inv)}, ${x.inv > 0 ? (x.gain / x.inv * 100).toFixed(1) : "0"}%${x.isUsd ? ` (US$ ${num(x.usdValue).toFixed(0)} at ₹${h.fx})` : ""}${x.asOf ? ` · as of ${x.asOf}` : ""}${h.nps && h.nps.choice ? ` · ${h.nps.choice}` : ""}`);
  }
  L.push("", "LOANS:");
  for (const l of d.live<Loan & { name?: string; lender?: string; note?: string }>("loans")) { const x = loanSum(d, l); if (!(x.out > 50)) continue; L.push(`${l.name}${l.lender ? ` (${l.lender})` : ""}: owes ${r0(x.out)}, ${x.rateNow ? x.rateNow + "%" : "interest-free"}${x.emiNow ? `, EMI ${r0(x.emiNow)}` : ""}${x.end ? `, ends ${x.end}` : ""}${l.note ? ` · ${scrub(l.note).slice(0, 60)}` : ""}`); }
  for (const p of d.live<Property & { plan?: { done?: boolean; name?: string; amt?: Paise; when?: string; who?: string }[]; fund?: { ltv?: number; by?: string } }>("props")) {
    const c = propCalc(d, p) as unknown as Record<string, unknown>, nums = Object.entries(c).filter(([, v]) => typeof v === "number" && Math.abs(v) > 50).slice(0, 14).map(([k, v]) => `${k} ${r0(v)}`).join(", ");
    L.push("", `PROPERTY ${p.name} (${p.status || ""}${p.value ? `, agreement value ${r0(p.value)}` : ""}): ${nums}`);
    const due = (p.plan ?? []).filter((r) => !r.done);
    if (due.length) L.push("Still to pay: " + due.map((r) => `${r.name} ${r0(r.amt)}${r.when ? ` (${r.when})` : ""}${r.who && r.who !== "split" ? ` [${r.who === "bank" ? "bank pays" : "KP pays"}]` : ""}`).join("; "));
    if (p.fund) L.push(`Funding plan: bank lends ${p.fund.ltv}%${p.fund.by ? `, KP's share ready by ${p.fund.by}` : ""}`);
  }
  L.push("", "REGULAR ITEMS (name: amount type freq, next due):");
  for (const r of d.live<Recurring & { auto?: boolean }>("recurring").filter((r) => !r.end || r.end >= now)) L.push(`${r.name}: ${r0(r.amount)} ${r.type}${r.budget ? " budget" : ""} ${r.freq}${r.auto ? " auto" : ""}${(FREQ[String(r.freq)] || 1) >= 2 ? `, next ${nextLbl(r)}` : ""}`);
  const Rd = readiness(d, 45);
  if (Rd.length) L.push("", "SHORTFALLS NEXT 45 DAYS: " + Rd.map((s) => `${s.acc.name} short ${r0(s.need)} on ${s.date} (${s.item.name})`).join("; "));
  L.push("", "TRANSACTIONS, last 24 months (date|type|amount|category|account|note):");
  const tx = d.live<Tx & { pot?: string }>("txns").filter((t) => (t.date ?? "") >= from && t.type !== "carry").sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const t of tx) {
    const cat = t.type === "transfer" ? `→ ${accName(d, t.toAccountId)}` : t.type === "investment" ? t.instrument || "" : catName(d, t.categoryId);
    L.push(`${t.date}|${t.type}|${r0(t.amount)}|${scrub(cat)}|${accName(d, t.accountId)}|${scrub(t.note).slice(0, 50)}${t.pot === "reserve" ? " [from reserve]" : ""}${t.hist ? " [already in balances]" : ""}`);
  }
  return L.join("\n");
}
export const ADV_RULES = (ctx: string): string => `You are KP's personal financial planner in India. Think like a careful, independent (fee-only) certified planner and check every angle that matters for the question:
cash flow and readiness for upcoming payments; emergency fund; debt (interest rates, prepay vs invest, family loans that are interest-free); insurance adequacy (term cover vs income, dependents and loans; health cover incl. super top-up and parents; accident); investments (asset mix vs risk appetite and goals, concentration, leveraged ETFs, costs, overlap; US assets need Schedule FA in the ITR and LRS/TCS rules); tax (old vs new regime, 80C, 80D, 80CCD(1B), 24(b), using the ₹1.25 lakh yearly LTCG exemption, capital gains); property commitments; goals (retirement, child education, closing loans); estate (nominees, will).
Rules: use ONLY the data below and say when you assume something (default assumptions unless the profile says otherwise: inflation 6%, equity 11%, debt 7%). If something important is missing, say exactly what and ask at most 2 questions. Show the numbers behind each point. Money from the wife's category is occasional: never rely on it. Don't push new products for their own sake; you may compare fund types and the funds KP already holds. Use Indian formats (₹, lakh, crore). Never mention that you are an AI or add disclaimers.

DATA:
${ctx}`;
const ADV_QUICK = (q: string): string => `${q}

Answer format: line 1 is the answer as one bold sentence (**...**). Then at most 3 points, each on its own line starting "1. ", "2. ", "3. ", one or two sentences each with specific ₹ figures from the data. No headings, no preamble, under 130 words.`;
const ADV_DEEP = `Go deeper. Give the full analysis: a "## " heading for each area that matters here, the numbers and your workings, trade-offs and risks, and end with "## What to do" as a numbered list in priority order with amounts and dates.`;
const ADV_WHAT = `What would change this advice? List the 3–5 facts or events (with thresholds in ₹ or dates where possible) that would flip or change your recommendation, and what you'd advise then. Same short format: numbered lines, no headings.`;
const ADV_CHECK = (d: MoneyData): string => `Write my monthly financial check-up for ${mLabel(ymOf(d.today))}.
Format exactly:
VERDICT: one short sentence.
Then exactly 3 lines, each starting "OK: " (on track) or "ACT: " (needs action), one sentence each with ₹ figures and dates.
Then a line with only "---".
Then the full check-up: a "## " heading per area (cash flow & readiness, reserve & emergency, loans, insurance, investments, tax, goals, anything else worth flagging), and end with "## This month" as a numbered to-do list.`;
export const advFmt = (t: string): string => esc(t).split("\n").map((l) => {
  const b = (x: string): string => x.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  if (/^\s*#{2,3}\s+/.test(l)) return `<h4 class="advh">${b(l.replace(/^\s*#{2,3}\s+/, ""))}</h4>`;
  const m = l.match(/^\s*(\d+)[.)]\s+(.*)/);
  if (m) return `<div class="advl"><span class="mk n">${m[1]}</span><span>${b(m[2]!)}</span></div>`;
  if (/^\s*[-•]\s+/.test(l)) return `<div class="advl"><span class="mk d">•</span><span>${b(l.replace(/^\s*[-•]\s+/, ""))}</span></div>`;
  return l.trim() ? `<p>${b(l)}</p>` : "";
}).join("");

/* ---------- talking to Claude ---------- */
export type Ask = (turns: { role: string; content: string }[], signal?: AbortSignal) => Promise<{ text: string }>;
let ask: Ask | null = null;
/** Set by the Money tab once signed in: askClaude through Akhila Vrutta's functions. */
export const setAsk = (f: Ask | null): void => { ask = f; };
interface ChatMsg { role: "user" | "assistant"; content: string; q?: string; kind?: string }
interface AdvState { advChat?: ChatMsg[] }
let busy: { text: string; ctl: AbortController } | null = null, checkRunning = false;

async function advAsk(st: AdvState, redraw: () => void, ctxText: () => string, q: string, label?: string, kind?: string): Promise<void> {
  if (busy || !ask) return;
  const chat = (st.advChat = st.advChat || []);
  while (chat.length && chat[chat.length - 1]!.role !== "assistant") chat.pop();
  const content = chat.length ? q : ADV_RULES(ctxText()) + "\n\nQUESTION: " + ADV_QUICK(q);
  const turns = [...chat.map((m) => ({ role: m.role, content: m.content })), { role: "user", content }];
  chat.push({ role: "user", content, q: label || q, kind });
  busy = { text: "", ctl: new AbortController() };
  redraw();
  try {
    const { text } = await ask(turns, busy.ctl.signal);
    if (String(text || "").trim()) chat.push({ role: "assistant", content: text });
    else { chat.pop(); toast("No answer came back. Try again."); }
  } catch (e) {
    const err = e as { code?: string; message?: string; text?: string };
    const keep = err?.text || "";
    if (keep) chat.push({ role: "assistant", content: keep }); else chat.pop();
    if (!(err && err.code === "cancelled")) toast(err?.message && err.message !== err.code ? err.message : "Couldn't get an answer (" + (err?.code || "error") + ").");
  }
  busy = null;
  redraw();
}
async function advRunCheck(d: MoneyData, redraw: () => void, ctxText: () => string, force = true, onAdvisor: () => boolean = () => true): Promise<void> {
  const now = ymOf(d.today), c = advCheck(d);
  if (checkRunning || !ask || (!force && c.ym === now)) return;
  if (!force && c.triedOn === d.today) return;
  checkRunning = true;
  E().write([{ c: "settings", r: { ...c, triedOn: d.today, updatedAt: Date.now() } }]);
  redraw();
  try {
    const { text } = await ask([{ role: "user", content: ADV_RULES(ctxText()) + "\n\nQUESTION: " + ADV_CHECK(d) }]);
    const [top = "", ...rest] = String(text || "").split(/\n\s*---\s*\n/), lines = top.split("\n").map((s) => s.trim()).filter(Boolean);
    const verdict = (lines.find((l) => /^VERDICT:/i.test(l)) || lines[0] || "").replace(/^VERDICT:\s*/i, "").replace(/\*\*/g, "");
    const pts = lines.filter((l) => /^(OK|ACT):/i.test(l)).slice(0, 3).map((l) => ({ ok: /^OK/i.test(l), t: l.replace(/^(OK|ACT):\s*/i, "").replace(/\*\*/g, "") }));
    if (verdict) E().write([{ c: "settings", r: { ...advCheck(E().data()), ym: now, at: d.today, quick: { verdict, pts }, full: rest.join("\n---\n").trim() || text, updatedAt: Date.now() } }]);
  } catch (e) { if (onAdvisor()) toast("Couldn't write this month's check-up: " + ((e as { message?: string })?.message || "try again later")); }
  checkRunning = false;
  redraw();
}
function advCheckCard(d: MoneyData, on: boolean): string {
  const c = advCheck(d), now = ymOf(d.today);
  if (c.ym !== now) return `<div class="card advm"><div class="advmh"><span class="chip">Monthly check-up · ${mLabel(now)}</span></div>
    <p class="note" style="margin:6px 0">${checkRunning ? "Writing this month's check-up…" : on ? "Not written yet for this month." : "Needs the Claude version, or Ask Claude set up in the hosted app."}</p>
    ${on && !checkRunning ? '<button class="btn sm pri" type="button" id="advCk">Write it now</button>' : ""}</div>`;
  return `<div class="card advm"><div class="advmh"><span class="chip">Monthly check-up · ${mLabel(c.ym!)}</span><span class="note" style="margin:0">written ${dLabel(c.at!)}</span></div>
    <div class="advq"><b>${esc(c.quick!.verdict)}</b></div>
    ${(c.quick!.pts ?? []).map((p) => `<div class="advl"><span class="mk ${p.ok ? "ok" : "warn"}">${p.ok ? "✓" : "!"}</span><span>${esc(p.t)}</span></div>`).join("")}
    <div class="btns" style="margin-top:10px"><button class="btn sm" type="button" id="advFull">Open full check-up ›</button>${on ? `<button class="btn sm" type="button" id="advCk">${checkRunning ? "Writing…" : "Write again"}</button>` : ""}</div></div>`;
}
export function advisorHtml(d: MoneyData, st: AdvState, on: boolean): string {
  const chat = st.advChat || [], P = prof(d), last = chat.length ? chat[chat.length - 1] : null;
  const stale = P.updated && d.today.slice(5) >= "04-01" && P.updated < d.today.slice(0, 4) + "-04-01";
  const thread = chat.map((m, i) => (m.role === "user" ? `<div class="advu">${esc(m.q || m.content)}</div>` : `<div class="adva">${chat[i - 1] && !chat[i - 1]!.kind ? '<div class="advtag">Quick answer</div>' : ""}${advFmt(m.content)}</div>`)).join("");
  return `<p class="note" style="margin:6px 0 12px">Looks at your last 24 months of transactions, holdings, loans, property plans, insurance and your profile. Not a SEBI-registered adviser; check before acting.</p>
  ${!P.updated ? `<div class="rdyal" style="cursor:default;background:var(--warn-soft)"><span class="ra1" style="color:var(--warn)">Fill in your profile for better advice</span><span class="ra2">Age, tax regime, insurance and goals change most answers. <a href="#" data-go="more">Open Settings › My profile</a></span></div>` : stale ? `<div class="rdyal" style="cursor:default;background:var(--warn-soft)"><span class="ra1" style="color:var(--warn)">Time for the yearly profile review</span><span class="ra2">Last updated ${dFull(P.updated!)}. <a href="#" data-go="more">Review it</a></span></div>` : ""}
  ${advCheckCard(d, on)}
  <div class="sh"><h3>Ask about</h3></div><div class="pills advpills">${ADV_Q.map(([l], i) => `<button type="button" data-advq="${i}" ${busy || !on ? "disabled" : ""}>${l}</button>`).join("")}</div>
  ${chat.length || busy ? `<div class="card advchat">${thread}${busy ? `<div class="adva" id="advLive">${busy.text ? advFmt(busy.text) : '<span class="note">Looking through everything…</span>'}</div>` : ""}
    ${last && last.role === "assistant" && !busy ? `<div class="btns" style="margin-top:12px"><button class="btn sm pri" type="button" id="advDeep">Go deeper</button><button class="btn sm" type="button" id="advWhat">What would change this?</button></div>` : ""}
    ${busy ? '<div class="btns" style="margin-top:8px"><button class="btn sm" type="button" id="advStop">Stop</button></div>' : ""}</div>` : ""}
  ${on ? `<div class="txsearch" style="margin-top:12px"><input type="text" id="advIn" placeholder="${chat.length ? "Ask a follow-up" : "Or ask anything about your money"}" autocomplete="off" aria-label="Ask your advisor"><button class="btn sm pri" type="button" id="advGo" ${busy ? "disabled" : ""}>Ask</button></div>
    ${chat.length && !busy ? '<div class="btns" style="margin-top:6px"><button class="btn sm" type="button" id="advNew">New chat</button></div>' : ""}`
    : `<p class="cnote">The advisor needs the Claude version of the planner, or Ask Claude set up in the hosted app (README › Ask Claude).</p>`}
  <p class="note">${P.updated ? `Profile updated ${dFull(P.updated)} · ` : ""}<a href="#" data-go="more">Edit profile</a>. This chat is cleared when you close the app.</p>`;
}

/** As the planner: the first time Overview or the Advisor is shown, this month's check-up is written in the background (once a day at most). */
export function advAuto(h: PageHost): void {
  const S = h.state() as unknown as { advAuto?: boolean; view: string };
  if (S.advAuto || !ask) return;
  S.advAuto = true;
  window.setTimeout(() => { const d = h.data(); void advRunCheck(d, () => E().refresh(), () => advContext(h.data()), false, () => (h.state() as unknown as { view: string }).view === "advisor"); }, 2500);
}
export const advisorPage: Page = {
  html(d, h) { return advisorHtml(d, h.state() as unknown as AdvState, !!ask); },
  act(el, h, redraw) {
    const S = h.state() as unknown as AdvState, x = el.dataset, d = h.data(), ctxText = (): string => advContext(d);
    if (x.advq !== undefined) { const [l, q] = ADV_Q[+x.advq]!; S.advChat = []; void advAsk(S, redraw, ctxText, q, l); return; }
    switch (el.id) {
      case "advGo": {
        const v = document.querySelector<HTMLInputElement>("#moneyView #advIn")?.value;
        if (v && v.trim()) { if (!(S.advChat || []).length) void advAsk(S, redraw, ctxText, v.trim()); else void advAsk(S, redraw, ctxText, v.trim() + "\n\n(Keep the short format: one bold sentence, then at most 3 numbered points.)", v.trim(), "f"); }
        return;
      }
      case "advStop": busy?.ctl.abort(); return;
      case "advNew": S.advChat = []; return redraw();
      case "advDeep": void advAsk(S, redraw, ctxText, ADV_DEEP, "Go deeper", "d"); return;
      case "advWhat": void advAsk(S, redraw, ctxText, ADV_WHAT, "What would change this?", "w"); return;
      case "advCk": void advRunCheck(d, redraw, ctxText); return;
      case "advFull": { const c = advCheck(d); openSheet(`Check-up · ${mLabel(c.ym!)}`, `<div class="adva">${advFmt(c.full || "")}</div><div class="btns"><button class="btn" id="cx" type="button">Close</button></div>`, (s) => { s.querySelector<HTMLElement>("#cx")!.onclick = closeModal; }); return; }
    }
    if (el.matches("a[data-go]")) return false;
    return false;
  },
  after(root, h) {
    advAuto(h);
    const inp = root.querySelector<HTMLInputElement>("#advIn");
    if (inp) inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); root.querySelector<HTMLElement>("#advGo")?.click(); } };
    const live = root.querySelector("#advLive");
    if (live && busy?.text) live.innerHTML = advFmt(busy.text);
  },
};
