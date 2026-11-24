/**
 * The Transactions page's sheets: filters (with saved views), clean-up (uncategorised and possible
 * duplicates), and changes to selected entries (category, tag, delete). As in KP Money Planner; the
 * filter lives in the planner's shared page state until the planner is gone.
 */
import { esc } from "../../../core/dom.ts";
import { num, type MoneyData, type Rec } from "../calc/data.ts";
import { accName, catName, fmtD } from "../calc/plan.ts";
import { allTags, blankFilter, money, payers, PERIODS, txMatches, viewOf, type TxFilter, type Tx } from "../views/txlist.ts";
import { $, askConfirm, attachPickers, catOpts, closeModal, field, openSheet, toast, val } from "./kit.ts";
import { E, prefGet, prefSet, uid, upsert, del } from "./env.ts";

const TYPE_LBL: Record<string, string> = { expense: "Expense", income: "Income", investment: "Investment", transfer: "Transfer" };
interface SavedView extends Rec { name: string; f?: Partial<TxFilter> }
const st = () => E().state()!;

export function txFilterSheet(): void {
  const d = E().data(), f = st().f;
  const views = d.live<SavedView>("views");
  openSheet("Filter transactions", `
    ${field(["categoryId", "Category (includes its subcategories)", "select", { value: f.cat, options: [["", "All categories"], ...catOpts(d)] }])}
    ${field(["accountId", "Account, card or paid by", "select", { value: f.acc, options: [["", "All accounts"], ...d.live<Rec & { name: string; hidden?: boolean }>("accounts").filter((a) => !a.hidden || a.id === f.acc).map((a) => [a.id, a.name] as [string, string]), ...payers(d).map((p) => ["@" + p.id, "Paid by " + p.name] as [string, string])] }])}
    <div class="grid2">${field(["min", "Amount from (₹)", "number", { value: f.min || "", step: "1" }])}${field(["max", "Amount up to (₹)", "number", { value: f.max || "", step: "1" }])}</div>
    ${field(["hist", "Money Manager history", "select", { value: f.hist || "", options: [["", "Include"], ["none", "Leave out"], ["only", "Only history"]] }])}
    <label class="opt"><input type="checkbox" id="f_uncat" ${f.uncat ? "checked" : ""}><div><b>Only uncategorised</b><span>Expenses and income with no category.</span></div></label>
    ${allTags(d).length ? field(["tag", "Tag", "select", { value: f.tag || "", options: [["", "Any tag"], ...allTags(d).map((g) => [g, g] as [string, string])] }]) : ""}
    ${field(["period", "Period", "select", { value: f.period, options: PERIODS }])}
    <div class="grid2" id="w_range">${field(["from", "From", "date", { value: f.from }])}${field(["to", "To", "date", { value: f.to }])}</div>
    <div class="btns"><button class="btn pri" id="sv" type="button">Apply</button><button class="btn" id="rs" type="button">Reset</button><button class="btn" id="cx" type="button">Cancel</button></div>
    <p class="sect">Saved views</p>
    <div class="grid2" style="align-items:end">${field(["vname", "Save these filters as", "text", { ph: "e.g. Big spends, Trip 2026" }])}<div class="f"><button class="btn" id="vsave" type="button" style="width:100%">Save view</button></div></div>
    ${views.length ? `<div class="list">${views.map((v) => `<div class="row"><div class="main"><div class="t">★ ${esc(v.name)}</div></div><button class="btn sm danger" type="button" data-vdel="${esc(v.id)}">Remove</button></div>`).join("")}</div>` : '<p class="note">Saved views show as chips at the top of Transactions and sync to all your devices.</p>'}`, (s) => {
    const sync = (): void => { $("#mvLayer #w_range")!.hidden = val("period") !== "custom"; };
    $<HTMLSelectElement>("#mvLayer #f_period")!.onchange = sync;
    sync();
    const read = (): Partial<TxFilter> => ({ tag: val("tag"), cat: val("categoryId"), acc: val("accountId"), period: val("period"), from: val("from"), to: val("to"), min: val("min"), max: val("max"), hist: val("hist"), uncat: $<HTMLInputElement>("#mvLayer #f_uncat")!.checked });
    s.querySelector<HTMLElement>("#vsave")!.onclick = () => {
      const n = val("vname");
      if (!n) { toast("Name the view."); return; }
      Object.assign(f, read()); st().txLimit = 0;
      const ex = views.find((v) => v.name.toLowerCase() === n.toLowerCase());
      closeModal();
      upsert("views", { ...(ex ?? {}), id: ex ? ex.id : uid(), name: n, f: viewOf(f) } as Rec);
      toast(`Saved "${n}"`);
    };
    s.querySelectorAll<HTMLElement>("[data-vdel]").forEach((b) => b.onclick = () => { closeModal(); del("views", b.dataset.vdel!); toast("View removed"); });
    s.querySelector<HTMLElement>("#cx")!.onclick = closeModal;
    s.querySelector<HTMLElement>("#rs")!.onclick = () => { st().f = blankFilter(f.type); st().txLimit = 0; closeModal(); E().refresh(); };
    s.querySelector<HTMLElement>("#sv")!.onclick = () => { Object.assign(f, read()); st().txLimit = 0; closeModal(); E().refresh(); };
    attachPickers(d, s);
  });
}

/* ---------- clean-up: uncategorised entries and possible duplicates ---------- */
function dupPairs(d: MoneyData): { k: string; ts: Tx[] }[] {
  const ign = new Set(prefGet<string[]>("dupIgnore", [])), G = new Map<string, Tx[]>();
  for (const t of d.live<Tx>("txns")) {
    if (t.type === "carry" || t.type === "loan" || t.link || t.cemi || t.splitOf) continue;
    const nn = String(t.note || "").toLowerCase().replace(/\(history\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const k = [t.type, t.accountId || "@" + t.paidBy, t.toAccountId || "", (num(t.amount) / 100).toFixed(2), t.date, nn || t.categoryId || ""].join("|");
    if (!G.has(k)) G.set(k, []);
    G.get(k)!.push(t);
  }
  const out: { k: string; ts: Tx[] }[] = [];
  for (const [k, ts] of G) if (ts.length > 1 && !ign.has(k)) out.push({ k, ts });
  return out.sort((a, b) => String(b.ts[0]!.date).localeCompare(String(a.ts[0]!.date)));
}
export function cleanupSheet(): void {
  const d = E().data();
  const unc = d.live<Tx>("txns").filter((t) => (t.type === "expense" || t.type === "income") && !(t.categoryId && d.byId("categories", t.categoryId))), D = dupPairs(d);
  openSheet("Clean up", `
    <div class="list"><div class="row ${unc.length ? "tap" : ""}" ${unc.length ? 'id="cuUnc" role="button" tabindex="0"' : ""}><div class="main"><div class="t">Uncategorised</div><div class="s">${unc.length ? `${unc.length} expense and income entries with no category` : "Everything has a category"}</div></div>${unc.length ? '<span class="pill warn">Show</span>' : '<span class="pill">✓</span>'}</div></div>
    <p class="sect">Possible duplicates · ${D.length}</p>
    <div class="list">${D.length ? D.slice(0, 40).map((p) => `<div class="row"><div class="main"><div class="t">${money(num(p.ts[0]!.amount))} · ${fmtD(d, String(p.ts[0]!.date))}</div><div class="s">${esc(p.ts.map((t) => (t.note || catName(d, t.categoryId) || TYPE_LBL[String(t.type)] || "") + (t.hist ? " (history)" : "")).join("  ·  "))} · ${esc(accName(d, p.ts[0]!.accountId))}</div></div>
      <span class="btns" style="flex-wrap:nowrap;gap:6px"><button class="btn sm" type="button" data-dupok="${esc(p.k)}">Not duplicates</button><button class="btn sm danger" type="button" data-dupdel="${esc(p.ts[p.ts.length - 1]!.id)}">Delete one</button></span></div>`).join("") : '<div class="empty">No duplicates found.</div>'}</div>
    <p class="note">Duplicates are entries of the same type, amount, account and date. Use Select on the Transactions page to change many entries at once.</p>
    <div class="btns"><button class="btn" id="cx" type="button">Close</button></div>`, (s) => {
    s.querySelector<HTMLElement>("#cx")!.onclick = closeModal;
    const u = s.querySelector<HTMLElement>("#cuUnc");
    if (u) u.onclick = () => { st().f = { ...blankFilter(), period: "all", uncat: true }; st().txLimit = 0; closeModal(); E().planner("go", "activity"); };
    s.querySelectorAll<HTMLElement>("[data-dupok]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); const a = prefGet<string[]>("dupIgnore", []); a.push(b.dataset.dupok!); prefSet("dupIgnore", a.slice(-500)); cleanupSheet(); });
    s.querySelectorAll<HTMLElement>("[data-dupdel]").forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const t = E().data().byId("txns", b.dataset.dupdel!);
      if (t) { E().write([{ c: "txns", r: { ...t, deleted: true, updatedAt: Date.now() } }]); toast("Deleted"); }
      cleanupSheet();
    });
  });
}

/* ---------- changes to selected entries ---------- */
export function bulkAct(k: string): void {
  const d = E().data(), S = st(), sel = S.sel ?? new Set<string>();
  const tx = [...sel].map((id) => d.byId<Tx>("txns", id)).filter((t): t is Tx => !!t && !t.deleted);
  if (k === "done") { S.selOn = false; sel.clear(); return E().refresh(); }
  if (k === "all") { S.sel = sel; for (const t of d.live<Tx>("txns")) if (txMatches(d, t, S.f, S.month) && t.type !== "carry") sel.add(t.id); return E().refresh(); }
  if (!tx.length) return;
  const save = (list: Rec[]): void => { const now = Date.now(); E().write(list.map((r) => ({ c: "txns", r: { ...r, updatedAt: now } }))); };
  if (k === "del") return askConfirm(`Delete ${tx.length} transaction${tx.length === 1 ? "" : "s"}? This can't be undone.`, "Delete", () => { sel.clear(); save(tx.map((t) => ({ ...t, deleted: true }))); toast(`Deleted ${tx.length}`); });
  if (k === "tag") return openSheet(`Tag ${tx.length} transaction${tx.length === 1 ? "" : "s"}`, `${field(["tag", "Tag", "text", { list: "btags", ph: "e.g. Home, Trip" }])}<datalist id="btags">${allTags(d).map((g) => `<option value="${esc(g)}">`).join("")}</datalist>
    <div class="btns"><button class="btn pri" id="sv" type="button">Add tag</button><button class="btn" id="rm" type="button">Remove this tag</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
    s.querySelector<HTMLElement>("#cx")!.onclick = closeModal;
    const go = (add: boolean): void => {
      const g = val("tag").replace(/\s+/g, " ").trim();
      if (!g) { toast("Type a tag."); return; }
      const g2 = allTags(d).find((x) => x.toLowerCase() === g.toLowerCase()) || g;
      const out = tx.map((t) => { const tg = (t.tags ?? []).filter((x) => x !== g2); if (add) tg.push(g2); const o: Tx = { ...t }; if (tg.length) o.tags = tg; else delete o.tags; return o; });
      closeModal(); save(out); toast(add ? `Tagged ${tx.length}` : `Tag removed from ${tx.length}`);
    };
    s.querySelector<HTMLElement>("#sv")!.onclick = () => go(true);
    s.querySelector<HTMLElement>("#rm")!.onclick = () => go(false);
  });
  if (k === "cat") {
    const ex = tx.filter((t) => t.type === "expense"), inc = tx.filter((t) => t.type === "income");
    if (!ex.length && !inc.length) { toast("Only expenses and income have categories."); return; }
    return openSheet("Set category", `${ex.length ? field(["ce", `Category for ${ex.length} expense${ex.length === 1 ? "" : "s"}`, "select", { options: [["", "Leave as is"], ...catOpts(d, "expense")] }]) : ""}${inc.length ? field(["ci", `Category for ${inc.length} income entr${inc.length === 1 ? "y" : "ies"}`, "select", { options: [["", "Leave as is"], ...catOpts(d, "income")] }]) : ""}
      ${tx.length > ex.length + inc.length ? `<p class="note">${tx.length - ex.length - inc.length} transfers, investments or loan entries are left alone.</p>` : ""}<div class="btns"><button class="btn pri" id="sv" type="button">Apply</button><button class="btn" id="cx" type="button">Cancel</button></div>`, (s) => {
      s.querySelector<HTMLElement>("#cx")!.onclick = closeModal;
      s.querySelector<HTMLElement>("#sv")!.onclick = () => {
        const ce = val("ce"), ci = val("ci"), out: Tx[] = [];
        for (const t of ex) if (ce) out.push({ ...t, categoryId: ce });
        for (const t of inc) if (ci) out.push({ ...t, categoryId: ci });
        closeModal();
        if (out.length) { save(out); toast(`Updated ${out.length}`); }
      };
    });
  }
}
