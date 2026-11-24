/**
 * Settings forms, as in KP Money Planner: accounts, other ways to pay, categories, tags and the account the
 * Overview balance is read from. Read and saved in paise.
 */
import { esc } from "../../../core/dom.ts";
import { num, type MoneyData, type Paise, type Rec } from "../calc/data.ts";
import type { Account } from "../calc/accounts.ts";
import { reserveState } from "../calc/reserve.ts";
import { mainAcc } from "../calc/forecast.ts";
import { allTags, money, payers } from "../views/txlist.ts";
import { ACC_LBL, askConfirm, catTree, closeModal, field, openSheet, paiseOf, rs, toast, val } from "./kit.ts";
import { E, del, uid } from "./env.ts";

type Acc = Account & { group?: string | null; minBal?: Paise; reserve?: boolean; reserveStart?: Paise; emTarget?: Paise; stmtDay?: number | null; dueDay?: number | null; payFrom?: string | null; limit?: Paise; apr?: number; fee?: Paise; feeWaive?: Paise; reward?: number; rewardNote?: string; main?: boolean };
const $s = <T extends HTMLElement = HTMLElement>(s: HTMLElement, id: string): T => s.querySelector<T>("#" + id)!;
const stampW = (c: string, r: Rec): { c: string; r: Rec } => ({ c, r: { ...r, updatedAt: Date.now() } });
const accGroups = (d: MoneyData): string[] => [...new Set(d.live<Acc>("accounts").map((a) => a.group).filter(Boolean) as string[])].sort();
/** Money fields kept in paise; plain numbers (days, rates, %) kept as typed. */
const MONEY_K = new Set(["limit", "fee", "feeWaive", "minBal", "reserveStart", "emTarget"]);

export function accForm(a0: Partial<Acc> = {}): void {
  const d = E().data(), isNew = !a0.id, a: Partial<Acc> = { type: "bank", opening: 0, ...a0 };
  let split = "";
  if (!isNew && a.reserve) {
    const st = reserveState(d);
    if (st.a && st.a.id === a.id) {
      split = `<div class="card" style="padding:12px 14px;margin:0 0 14px;box-shadow:none;background:var(--bg)"><div class="kv" style="margin-top:0"><span>Balance today</span><b>${money(st.bal)}</b>
      <span>Big-bills reserve</span><b>${money(st.held)} <span class="mut" style="font-weight:400">of ${money(st.target)}</span></b>
      ${st.funds.filter((f) => f.have > 50 || f.need > 50).map((f) => `<span>${esc(f.p.name)} fund</span><b>${money(f.have)}</b>`).join("")}
      <span class="tot">Emergency fund</span><b class="tot ${st.emergency < 0 ? "neg" : ""}">${money(st.emergency)} <span class="mut" style="font-weight:400">of ${money(st.emTarget)}</span></b></div>
      <button class="lnk" type="button" id="toCash" style="margin-top:8px">See details in Plan › Cash flow ›</button></div>`;
    }
  }
  const mv = (k: keyof Acc): string | number => rs(a[k]);
  openSheet(isNew ? "Add account" : "Edit account", `${split}
    ${field(["name", "Name", "text", { value: a.name, ph: "e.g. HDFC savings, SBI Cashback card" }])}
    <div class="grid2">${field(["type", "Type", "select", { value: a.type, options: Object.entries(ACC_LBL) }])}${field(["group", "Group", "text", { value: a.group, ph: "e.g. Savings, Cards", list: "grpl" }])}</div><datalist id="grpl">${accGroups(d).map((g) => `<option value="${esc(g)}">`).join("")}</datalist>
    ${field(["opening", "Balance when you start (₹)", "number", { value: mv("opening"), step: "0.01", neg: 1, hint: "For a credit card, enter what you owe as a negative number, e.g. -12000: type the amount, then tap − / +." }])}
    <label class="opt"><input type="checkbox" id="f_hidden" ${a.hidden ? "checked" : ""}><div><b>Hide this account</b><span>Not shown on the Accounts tab or when adding transactions, and not counted in totals. Its history still shows in Transactions and reports.</span></div></label>
    <label class="opt"><input type="checkbox" id="f_noTotal" ${a.noTotal ? "checked" : ""}><div><b>Leave out of totals</b><span>Still shown with its balance, but not added to bank totals, card dues, forecast or net worth.</span></div></label>
    <div id="g_bank">${field(["minBal", "Keep at least (₹, optional)", "number", { value: mv("minBal"), step: "100", hint: "The readiness check warns you before this account drops below it" }])}
      <label class="opt"><input type="checkbox" id="f_reserve" ${a.reserve ? "checked" : ""}><div><b>Holds my big-bills reserve and emergency fund</b><span>The app splits this account's balance into the two pots. Only one account can hold them.</span></div></label>
      <div id="g_res" class="grid2">${field(["reserveStart", "Already set aside for big bills (₹)", "number", { value: mv("reserveStart"), step: "1" }])}${field(["emTarget", "Emergency fund target (₹)", "number", { value: mv("emTarget"), step: "1000", hint: "Leave empty to use the app's suggestion" }])}</div></div>
    <div id="g_card"><div class="grid2">${field(["stmtDay", "Statement day", "number", { value: a.stmtDay || "", ph: "1–31" }])}${field(["dueDay", "Payment due day", "number", { value: a.dueDay || "", ph: "1–31" }])}</div>
    ${field(["payFrom", "Bill usually paid from", "select", { value: a.payFrom || "", options: [["", "Not set"], ...d.live<Acc>("accounts").filter((x) => x.type !== "card").map((x) => [x.id, x.name] as [string, string])] }])}
    <p class="note" style="margin-top:-4px">The bill is what you owed on the statement day, less payments since. A due day on or before the statement day falls in the next month.</p>
    <p class="sect">Limit, charges and rewards (optional)</p>
    <div class="grid2">${field(["limit", "Credit limit (₹)", "number", { value: mv("limit"), step: "1000" }])}${field(["apr", "Interest (% a month)", "number", { value: a.apr ?? "", step: "0.01", ph: "e.g. 3.75" }])}</div>
    <div class="grid2">${field(["fee", "Annual fee (₹)", "number", { value: mv("fee"), step: "1" }])}${field(["feeWaive", "Fee waived if you spend (₹/year)", "number", { value: mv("feeWaive"), step: "1000" }])}</div>
    ${field(["reward", "Rewards worth (% of spend)", "number", { value: a.reward ?? "", step: "0.01", ph: "e.g. 1.5", hint: "Points or cashback as a % of what you spend, e.g. 5% on Amazon, 1% elsewhere → use your overall rate." }])}
    ${field(["rewardNote", "Reward notes", "text", { value: a.rewardNote || "", ph: "e.g. 5% on Swiggy, lounge access 4/yr" }])}</div>
    <div class="btns"><button class="btn pri" id="sv" type="button">${isNew ? "Add" : "Save"}</button>${isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>'}<button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    const sync = (): void => { $s(s, "g_card").hidden = val("type") !== "card"; $s(s, "g_bank").hidden = val("type") === "card"; $s(s, "g_res").hidden = !$s<HTMLInputElement>(s, "f_reserve").checked; };
    $s(s, "f_type").onchange = sync; $s(s, "f_reserve").onchange = sync; sync();
    const tc = s.querySelector<HTMLElement>("#toCash"); if (tc) tc.onclick = () => { closeModal(); const S = E().state() as Record<string, unknown> | null; if (S) S.planTab = "cashflow"; E().planner("go", "plan"); };
    $s(s, "cx").onclick = closeModal;
    const dl = s.querySelector<HTMLElement>("#dl"); if (dl) dl.onclick = () => askConfirm(`Delete "${a.name}"? Its transactions stay but will show no account.`, "Delete", () => del("accounts", a.id!));
    $s(s, "sv").onclick = () => {
      const name = val("name"); if (!name) { toast("Give the account a name."); return; }
      const sd = parseInt(val("stmtDay"), 10), dd = parseInt(val("dueDay"), 10), type = val("type");
      const o: Record<string, unknown> = { ...a, id: a.id || uid(), name, type, group: val("group") || null, opening: paiseOf(val("opening")) || 0 };
      const ops: { c: string; r: Rec }[] = [];
      if ($s<HTMLInputElement>(s, "f_hidden").checked) o.hidden = true; else delete o.hidden;
      if ($s<HTMLInputElement>(s, "f_noTotal").checked) o.noTotal = true; else delete o.noTotal;
      const setPos = (k: string): void => { const v = parseFloat(val(k)); if (v > 0) o[k] = MONEY_K.has(k) ? Math.round(v * 100) : v; else delete o[k]; };
      if (type === "card") {
        o.stmtDay = (sd >= 1 && sd <= 31) ? sd : null; o.dueDay = (dd >= 1 && dd <= 31) ? dd : null; o.payFrom = val("payFrom") || null;
        for (const k of ["limit", "apr", "fee", "feeWaive", "reward"]) setPos(k);
        if (val("rewardNote")) o.rewardNote = val("rewardNote"); else delete o.rewardNote;
      } else {
        for (const k of ["stmtDay", "dueDay", "payFrom", "limit", "apr", "fee", "feeWaive", "reward", "rewardNote"]) delete o[k];
        setPos("minBal");
        if ($s<HTMLInputElement>(s, "f_reserve").checked) {
          o.reserve = true;
          for (const x of d.live<Acc>("accounts")) if (x.reserve && x.id !== o.id) ops.push(stampW("accounts", { ...x, reserve: false }));
          for (const k of ["reserveStart", "emTarget"]) setPos(k);
        } else delete o.reserve;
      }
      closeModal(); ops.push(stampW("accounts", o as Rec)); E().write(ops);
    };
  });
}

interface Payer extends Rec { name: string; own?: boolean; tag?: string }
export function payerForm(p0: Partial<Payer> = {}): void {
  const d = E().data(), isNew = !p0.id, p: Partial<Payer> = { own: true, tag: "", ...p0 };
  const used = isNew ? 0 : d.live<Rec & { paidBy?: string }>("txns").filter((t) => t.paidBy === p.id).length;
  openSheet(isNew ? "Add a way to pay" : `Edit ${p.name}`, `
    ${field(["name", "Name", "text", { value: p.name, ph: "e.g. Cash, Pluxee, Spouse" }])}
    <fieldset class="fs"><legend>Whose money is it?</legend>
      <label class="opt"><input type="radio" name="own" value="1" ${p.own ? "checked" : ""}><div><b>Mine</b><span>Cash, a meal card, a wallet you don't track. Counts as paid by you in tag views.</span></div></label>
      <label class="opt"><input type="radio" name="own" value="0" ${p.own ? "" : "checked"}><div><b>Someone else's</b><span>Like your spouse paying from her account. Shown separately as paid by them.</span></div></label></fieldset>
    ${field(["tag", "Always tag with (optional)", "text", { value: p.tag, list: "pytags", ph: "e.g. Home", hint: "Added automatically to every entry paid this way." }])}<datalist id="pytags">${allTags(d).map((g) => `<option value="${esc(g)}">`).join("")}</datalist>
    <div class="btns"><button class="btn pri" id="sv" type="button">${isNew ? "Add" : "Save"}</button>${isNew ? "" : '<button class="btn danger" id="dl" type="button">Remove</button>'}<button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    const dl = s.querySelector<HTMLElement>("#dl");
    if (dl) dl.onclick = () => askConfirm(used ? `Remove "${p.name}"? Its ${used} entr${used === 1 ? "y stays" : "ies stay"} and keep the name, but you can't pick it for new ones.` : `Remove "${p.name}"?`, "Remove", () => del("payers", p.id!));
    $s(s, "sv").onclick = () => {
      const name = val("name").trim(); if (!name) { toast("Give it a name."); return; }
      if (payers(d).some((x) => x.id !== p.id && String(x.name).toLowerCase() === name.toLowerCase())) { toast("There's already one with that name."); return; }
      const o = { ...p, id: p.id || uid(), name, own: (s.querySelector<HTMLInputElement>('input[name="own"]:checked') || { value: "" }).value !== "0", tag: val("tag").trim() };
      closeModal(); E().write([stampW("payers", o as Rec)]); toast(isNew ? "Added" : "Saved");
    };
  });
}

interface Cat extends Rec { name: string; kind?: string; parentId?: string; limit?: Paise }
export function catForm(c0: Partial<Cat> = {}): void {
  const d = E().data(), isNew = !c0.id, c: Partial<Cat> = { kind: "expense", ...c0 };
  const hasSubs = !isNew && d.live<Cat>("categories").some((x) => x.parentId === c.id);
  const parents = (k: string): [string, string][] => [["", "None (main category)"], ...catTree(d, k).map(({ c: t }) => t).filter((t) => t.id !== c.id).map((t) => [t.id, String(t.name)] as [string, string])];
  openSheet(isNew ? "Add category" : "Edit category", `
    ${field(["name", "Name", "text", { value: c.name }])}
    ${field(["kind", "Used for", "select", { value: c.kind, options: [["expense", "Expenses"], ["income", "Income"]] }])}
    ${hasSubs ? '<p class="note">This category has subcategories, so it stays a main category.</p>' : field(["parentId", "Subcategory of", "select", { value: c.parentId || "", options: parents(String(c.kind)) }])}
    ${field(["limit", "Monthly limit (₹, optional)", "number", { value: rs(c.limit), step: "500", hint: "For main expense categories. Shown in Insights › Month and on Home when you get close. It doesn't change the forecast." }])}
    <div class="btns"><button class="btn pri" id="sv" type="button">${isNew ? "Add" : "Save"}</button>${isNew ? "" : '<button class="btn danger" id="dl" type="button">Delete</button>'}<button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    const lsync = (): void => { $s(s, "w_limit").hidden = val("kind") !== "expense" || (!hasSubs && !!val("parentId")); };
    lsync(); $s(s, "f_kind").addEventListener("change", lsync); if (!hasSubs) $s(s, "f_parentId").addEventListener("change", lsync);
    if (!hasSubs) $s(s, "f_kind").onchange = () => { $s(s, "f_parentId").innerHTML = parents(val("kind")).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(""); lsync(); };
    $s(s, "cx").onclick = closeModal;
    const dl = s.querySelector<HTMLElement>("#dl");
    if (dl) dl.onclick = () => askConfirm(`Delete "${c.name}"?${hasSubs ? " Its subcategories become main categories." : ""} Transactions using it will show as uncategorised.`, "Delete", () => {
      const ops: { c: string; r: Rec }[] = [];
      for (const x of d.live<Cat>("categories")) if (x.parentId === c.id) { const y: Record<string, unknown> = { ...x }; delete y.parentId; ops.push(stampW("categories", y as Rec)); }
      const r: Record<string, unknown> = { ...d.byId("categories", c.id!), deleted: true, updatedAt: Date.now() }; delete r.seed;
      ops.push({ c: "categories", r: r as Rec }); E().write(ops);
    });
    $s(s, "sv").onclick = () => {
      const name = val("name"); if (!name) { toast("Give it a name."); return; }
      const o: Record<string, unknown> = { ...c, id: c.id || uid(), name, kind: val("kind") };
      if (!hasSubs) { const p = val("parentId"); if (p) o.parentId = p; else delete o.parentId; }
      { const lm = parseFloat(val("limit")); if (lm > 0 && o.kind === "expense" && !o.parentId) o.limit = Math.round(lm * 100); else delete o.limit; }
      closeModal(); E().write([stampW("categories", o as Rec)]);
    };
  });
}

export function pickMainSheet(): void {
  const d = E().data(), m = mainAcc(d), banks = d.live<Acc>("accounts").filter((a) => a.type !== "card" && (!a.hidden || (m && a.id === m.id)));
  openSheet("Account for Home balance", `${field(["acc", "Show the current and month-end balance for", "select", { value: m ? m.id : "", options: banks.map((a) => [a.id, a.name] as [string, string]) }])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    $s(s, "cx").onclick = closeModal;
    $s(s, "sv").onclick = () => {
      const id = val("acc"), ops: { c: string; r: Rec }[] = [];
      for (const a of banks) { const want = a.id === id; if (!!a.main !== want) { const o: Record<string, unknown> = { ...a }; if (want) o.main = true; else delete o.main; ops.push(stampW("accounts", o as Rec)); } }
      closeModal(); E().write(ops);
    };
  });
}

export function tagSheet(g: string): void {
  const d = E().data(), tx = d.live<Rec & { tags?: string[] }>("txns"), n = tx.filter((t) => (t.tags || []).includes(g)).length;
  openSheet(`Tag: ${g}`, `${field(["name", "Name", "text", { value: g }])}<p class="note">Used on ${n} transaction${n === 1 ? "" : "s"}. Renaming updates all of them; removing takes the tag off them (the transactions stay).</p>
    <div class="btns"><button class="btn pri" id="sv" type="button">Rename</button><button class="btn danger" id="dl" type="button">Remove tag</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    const apply = (fn: (tags: string[]) => string[]): void => {
      const ops: { c: string; r: Rec }[] = [];
      for (const t of tx) if ((t.tags || []).includes(g)) { const o: Record<string, unknown> = { ...t }; const nt = fn(t.tags!); if (nt.length) o.tags = nt; else delete o.tags; ops.push(stampW("txns", o as Rec)); }
      const S = E().state() as { f?: { tag?: string } } | null; if (S?.f && S.f.tag === g) S.f.tag = "";
      closeModal(); E().write(ops);
    };
    $s(s, "cx").onclick = closeModal;
    $s(s, "sv").onclick = () => { const nn = val("name").replace(/\s+/g, " "); if (!nn) { toast("Enter a name."); return; } if (nn === g) { closeModal(); return; } apply((tags) => [...new Set(tags.map((x) => (x === g ? nn : x)))]); toast(`Renamed to ${nn}`); };
    $s(s, "dl").onclick = () => askConfirm(`Remove the tag "${g}" from ${n} transaction${n === 1 ? "" : "s"}?`, "Remove", () => { apply((tags) => tags.filter((x) => x !== g)); toast("Tag removed"); });
  });
}
void num;
