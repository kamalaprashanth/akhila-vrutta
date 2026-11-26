/**
 * Money settings › My profile for the advisor, as in KP Money Planner (About me, Income & tax, Insurance,
 * Property use, Assets outside the app, Nominees & will), and the goals made once from the profile.
 * The profile keeps amounts as typed text (rupees), as the planner did.
 */
import { esc } from "../../../core/dom.ts";
import { num, type MoneyData, type Rec } from "../calc/data.ts";
import { kindOf, loanSum } from "../calc/loans.ts";
import { catName } from "../calc/plan.ts";
import { family } from "../views/advisor.ts";
import { money } from "../views/txlist.ts";
import { closeModal, field, openSheet, toast, val } from "./kit.ts";
import { E, uid } from "./env.ts";

type Kid = { id?: string; name?: string; dob?: string };
type Profile = Rec & Record<string, unknown> & { dob?: string; age?: string; retire?: string; spouse?: { name?: string; dob?: string }; kids?: Kid[]; depends?: Record<string, boolean>; propUse?: Record<string, string>; covered?: string[] };
const prof = (d: MoneyData): Profile => d.byId<Profile>("settings", "profile") ?? ({ id: "profile" } as Profile);
const ageOf = (d: MoneyData, dob?: string): number | null => { if (!dob) return null; const t = d.today, y = +t.slice(0, 4) - +dob.slice(0, 4); return t.slice(5) >= dob.slice(5) ? y : y - 1; };
const S_ = (v: unknown): string => (v == null ? "" : String(v));

export function profForm(k: string): void {
  const d = E().data(), P = prof(d);
  const sel = (id: string, l: string, opts: string[], v: unknown, h?: string): string => field([id, l, "select", { value: S_(v), options: [["", "—"], ...opts.map((o) => [o, o] as [string, string])], hint: h }]);
  const txt = (id: string, l: string, v: unknown, h?: string, ph?: string): string => field([id, l, "text", { value: S_(v), hint: h, ph }]);
  const save = (): string => `<div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`;
  const done = (s: HTMLElement, fn: () => [Record<string, unknown>, { c: string; r: Rec }[]?]): void => {
    s.querySelector<HTMLElement>("#cx")!.onclick = closeModal;
    s.querySelector<HTMLElement>("#sv")!.onclick = () => { const [o, more] = fn(); closeModal(); const now = Date.now(); E().write([...(more ?? []), { c: "settings", r: { ...prof(d), ...o, updated: d.today, updatedAt: now } as Rec }]); toast("Saved"); };
  };
  const chk = (s: HTMLElement, id: string): boolean => s.querySelector<HTMLInputElement>("#" + id)!.checked;
  if (k === "about") {
    const kids = (P.kids || []).map((c) => ({ ...c, id: c.id || uid() })), dp = P.depends || {};
    const ageL = (x?: string): string => { const a = ageOf(d, x); return a == null ? "" : `${a} yrs`; };
    const kidRow = (c: Kid, i: number): string => `<div class="fam" data-kid="${i}" data-kidid="${esc(c.id || uid())}"><div class="r">${txt("kn" + i, "Child", c.name, "", "e.g. Son")}${field(["kd" + i, "Date of birth", "date", { value: c.dob || "" }])}<span class="agep" data-agefor="f_kd${i}">${ageL(c.dob)}</span><button type="button" class="famx" data-kidx="${i}" aria-label="Remove this child">×</button></div></div>`;
    openSheet("About me", `<div class="grid2">${field(["pdob", "Your date of birth", "date", { value: P.dob || "" }])}<div class="f"><label>Age</label><div class="pfv" style="padding:12px 0;font-weight:700" data-agefor="f_pdob">${P.dob ? ageL(P.dob) : "—"}</div></div></div>
    ${field(["pr", "Plan to retire at (age)", "number", { value: P.retire || "" }])}
    <div class="pfsec" style="padding-left:0">Family</div>
    <div class="fam"><div class="r">${txt("sn", "Spouse or partner", (P.spouse || {}).name, "", "e.g. Partner")}${field(["sd", "Date of birth", "date", { value: (P.spouse || {}).dob || "" }])}<span class="agep" data-agefor="f_sd">${ageL((P.spouse || {}).dob)}</span></div></div>
    <div id="kidRows">${kids.map(kidRow).join("")}</div>${kids.length ? "" : '<p class="note" style="margin:4px 0 8px">No children added.</p>'}<button class="btn sm" type="button" id="addKid">+ Add child</button>
    <div class="f" style="margin-top:12px"><label>Others who depend on you</label><div class="chk"><label><input type="checkbox" id="dpf" ${dp.father ? "checked" : ""}> Father</label><label><input type="checkbox" id="dpm" ${dp.mother ? "checked" : ""}> Mother</label><label><input type="checkbox" id="dpo" ${dp.other ? "checked" : ""}> Other</label></div></div>
    ${txt("pd", "Anything else about dependents", P.deps, "", "e.g. parents depend on me partly")}
    ${sel("pj", "Job stability", ["Stable", "Average", "Uncertain"], P.job)}${sel("pk", "Risk appetite", ["Low", "Medium", "High"], P.risk, "How big a fall you can sit through without selling: low ≈ 10%, medium ≈ 25%, high ≈ 40%")}${save()}`,
    (s) => {
      let n = kids.length;
      s.addEventListener("input", (e) => { const t = e.target as HTMLInputElement; if (t.type !== "date") return; const o = s.querySelector(`[data-agefor="${t.id}"]`); if (o) o.textContent = t.value ? `${ageOf(d, t.value)} yrs` : "—"; });
      s.querySelector<HTMLElement>("#addKid")!.onclick = () => { const x = document.createElement("div"); x.innerHTML = kidRow({}, n++); s.querySelector("#kidRows")!.appendChild(x.firstElementChild!); const nn = s.querySelector("#kidRows + .note"); if (nn) nn.remove(); };
      s.addEventListener("click", (e) => { const x = (e.target as HTMLElement).closest("[data-kidx]"); if (x) x.closest(".fam")!.remove(); });
      done(s, () => {
        const ks: Kid[] = []; s.querySelectorAll<HTMLElement>("#kidRows .fam").forEach((r) => { const i = r.dataset.kid, nm = val("kn" + i), db = val("kd" + i); if (nm || db) ks.push({ id: r.dataset.kidid, name: nm, dob: db }); });
        /* a removed child's education goal goes too */
        const keep = new Set(ks.map((c) => c.id)), now = Date.now(), gone: { c: string; r: Rec }[] = [];
        for (const g of d.live<Rec & { kind?: string; kidId?: string }>("goals")) if (g.kind === "edu" && g.kidId && !keep.has(g.kidId)) gone.push({ c: "goals", r: { ...g, deleted: true, updatedAt: now } });
        const dob = val("pdob");
        return [{ dob, age: dob ? String(ageOf(d, dob)) : P.age, retire: val("pr"), spouse: { name: val("sn"), dob: val("sd") }, kids: ks, depends: { father: chk(s, "dpf"), mother: chk(s, "dpm"), other: chk(s, "dpo") }, deps: val("pd"), job: val("pj"), risk: val("pk") }, gone];
      });
    });
    return;
  }
  if (k === "income") {
    const sal = d.live<Rec & { type?: string; name?: string; amount?: number }>("recurring").find((r) => r.type === "income" && /salary/i.test(String(r.name)));
    const cats = d.live<Rec & { kind?: string; name?: string }>("categories").filter((c) => c.kind === "income").sort((a, b) => catName(d, a.id).localeCompare(catName(d, b.id)));
    openSheet("Income & tax", `${field(["ps", "Take-home salary a month (₹)", "number", { value: P.salary || (sal ? Math.round(num(sal.amount) / 100) : ""), hint: sal ? `Your Salary regular item says ${money(num(sal.amount))}` : "" }])}
    ${txt("pb", "Bonus or other income", P.bonus, "", "e.g. ₹1.5 lakh, usually in April")}
    ${sel("pg", "Tax regime", ["Old", "New", "Not sure"], P.regime, "Decides whether 80C, 80D and home-loan interest help you")}
    ${field(["pw", "Money from your spouse or partner is recorded under", "select", { value: S_(P.wifeCat) || "__new", options: [["", "Not recorded separately"], ["__new", "+ Create a \"From spouse or partner\" income category"], ...cats.map((c) => [c.id, catName(d, c.id)] as [string, string])], hint: "Treated as occasional: the advisor never counts on it" }])}${save()}`,
    (s) => done(s, () => {
      let w = val("pw"); const more: { c: string; r: Rec }[] = [];
      if (w === "__new") { const ex = d.live<Rec & { kind?: string; name?: string }>("categories").find((c) => c.kind === "income" && /^from (wife|spouse|spouse or partner)$/i.test(String(c.name))); if (ex) w = ex.id; else { w = uid(); more.push({ c: "categories", r: { id: w, name: "From spouse or partner", kind: "income", updatedAt: Date.now() } as Rec }); } }
      return [{ salary: val("ps"), bonus: val("pb"), regime: val("pg"), wifeCat: w || "" }, more];
    }));
    return;
  }
  if (k === "ins") {
    const F = family(d), cov = new Set(P.covered || []), nm = (id: string, l: string, v: unknown, h?: string): string => field([id, l, "number", { value: S_(v), hint: h }]);
    openSheet("Insurance", `<div class="pfsec" style="padding-left:0">Term life</div>
    ${nm("it", "Cover (₹)", P.termCover)}<div class="grid2">${field(["iu", "Until age", "number", { value: P.termUntil || "" }])}${nm("ip", "Premium (₹ a year)", P.termPrem)}</div>
    <div class="pfsec" style="padding-left:0">Health</div>
    <div class="grid2">${nm("ih", "Sum insured (₹)", P.healthSum)}${sel("iy", "Type", ["Family floater", "Individual", "Both"], P.healthType)}</div>
    <div class="f"><label>Who's covered</label><div class="chk">${F.map((m) => `<label><input type="checkbox" class="icv" value="${m.k}" ${cov.has(m.k) ? "checked" : ""}> ${esc(m.n)}${m.age != null ? ` (${m.age})` : ""}</label>`).join("")}</div>${F.length < 2 ? '<div class="hint">Add your family in About me to pick them here.</div>' : ""}</div>
    <div class="grid2">${nm("ihp", "Premium (₹ a year)", P.healthPrem)}${nm("io", "Super top-up (₹)", P.topup, "Leave empty for none")}</div>
    ${nm("ie", "Employer health cover (₹)", P.empHealth, "Ends if you change jobs")}${sel("iq", "Do your parents have their own health cover?", ["Yes", "No", "Not sure"], P.parents)}
    <div class="pfsec" style="padding-left:0">Other</div><div class="grid2">${nm("ia", "Personal accident (₹)", P.accident)}${nm("ig", "Employer group term (₹)", P.groupTerm)}</div>${save()}`,
    (s) => done(s, () => [{ termCover: val("it"), termUntil: val("iu"), termPrem: val("ip"), healthSum: val("ih"), healthType: val("iy"), covered: [...s.querySelectorAll<HTMLInputElement>(".icv:checked")].map((x) => x.value), healthPrem: val("ihp"), topup: val("io"), empHealth: val("ie"), parents: val("iq"), accident: val("ia"), groupTerm: val("ig") }]));
    return;
  }
  if (k === "goals") { const S = E().state() as unknown as Record<string, unknown> | null; if (S) S.planTab = "goals"; E().planner("go", "plan"); return; }
  if (k === "prop") {
    const U = ["Living in it", "Rented out", "Under construction", "Vacant", "Plan to sell"], ps = d.live<Rec & { name?: string }>("props");
    openSheet("Property use", (ps.map((p) => sel("pu_" + p.id, String(p.name), U, (P.propUse || {})[p.id])).join("") || '<p class="note">No properties yet.</p>') + save(), (s) => done(s, () => [{ propUse: Object.fromEntries(ps.map((p) => [p.id, val("pu_" + p.id)])) }]));
    return;
  }
  if (k === "assets") { openSheet("Assets outside the app", `${field(["as", "What else do you own?", "textarea", { value: P.assets || "", hint: "e.g. 20 g physical gold, ₹2 lakh FD in SBI, land in Mysuru, ESOPs" }])}${save()}`, (s) => done(s, () => [{ assets: val("as") }])); return; }
  if (k === "estate") openSheet("Nominees & will", `${sel("en", "Nominees updated on bank, EPF, NPS, PPF, funds, demat, insurance", ["All", "Some", "None", "Not sure"], P.nominees)}${sel("ew", "Do you have a will?", ["Yes", "No"], P.will)}${txt("ex", "Note", P.estateNote, "", "optional")}${save()}`, (s) => done(s, () => [{ nominees: val("en"), will: val("ew"), estateNote: val("ex") }]));
}

/** The goals made once from the profile: retirement, closing family loans, and each child's education. */
export function smartGoalWrites(d: MoneyData, now = Date.now()): { c: string; r: Rec }[] {
  type G = Rec & { kind?: string; pri?: number; kid?: number; kidId?: string };
  const P = prof(d), G0 = d.live<G>("goals"), A = d.byId<Rec & { goalsSeeded?: boolean; goalKids?: string[] }>("settings", "app") ?? { id: "app" }, seen = new Set(A.goalKids || []);
  const ops: { c: string; r: Rec }[] = [], G = [...G0]; let ch = false, pri = G.reduce((m, g) => Math.max(m, +(g.pri ?? 0) || 0), 0) + 1;
  const put = (r: G): void => { const x = { ...r, updatedAt: now }; ops.push({ c: "goals", r: x }); G.push(x); };
  if (!A.goalsSeeded) {
    const fam = d.live<Rec & { kind?: string }>("loans").filter((l) => ["family", "hybrid"].includes(kindOf(l as never)) && loanSum(d, l as never).out > 50).map((l) => l.id);
    if (fam.length && !G.some((g) => g.kind === "loans")) put({ id: uid(), kind: "loans", name: "Close family loans", loans: fam, by: `${+d.today.slice(0, 4) + 1}-12`, pri: pri++ } as G);
    if (!G.some((g) => g.kind === "retire")) put({ id: uid(), kind: "retire", name: "Retirement", pri: pri++ } as G);
    ch = true;
  }
  (P.kids || []).forEach((c, i) => { const key = (c.name || "") + "|" + (c.dob || ""); if (c && c.dob && !seen.has(key) && !G.some((g) => g.kind === "edu" && (c.id ? g.kidId === c.id : g.kid === i))) { put({ id: uid(), kind: "edu", kid: i, kidId: c.id, name: `${c.name || "Child"}'s education`, pri: pri++ } as G); seen.add(key); ch = true; } });
  if (ch) ops.push({ c: "settings", r: { ...A, goalsSeeded: true, goalKids: [...seen], updatedAt: now } });
  return ops;
}
