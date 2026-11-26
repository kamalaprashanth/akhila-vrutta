/**
 * Profile (approved 26 Nov 2026): who you are in the app — first name, the user ID to share for Claude access —
 * and "About you" (age, family, income and tax, insurance, goals, property use, nominees), which Money's goals
 * and the Advisor use. Deleting the account stays in Settings › Account.
 */
import type { Module } from "../types.ts";
import { html, raw } from "../../core/dom.ts";
import { ctx } from "../../core/app.ts";
import { userName } from "../../core/firebase.ts";
import { moneyNow, startMoney } from "../money/index.ts";
import { ensureLayer, toast } from "../money/ui/kit.ts";
import { profileSection } from "../money/views/more.ts";
import { profForm } from "../money/ui/profform.ts";

const ICON = "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1-4 15-4 16 0";
const short = (uid: string): string => (uid.length > 10 ? `${uid.slice(0, 4)}…${uid.slice(-4)}` : uid);
let rootEl: HTMLElement | null = null, name = "";

function draw(root: HTMLElement): void {
  const s = ctx.session;
  if (!ctx.store) { root.innerHTML = html`<section class="card"><h2>Profile</h2><p>Your profile opens once the app is unlocked.</p></section>`; return; }
  let about = "";
  try { about = profileSection(moneyNow()); } catch { about = ""; }
  root.innerHTML = html`<div class="mv pfv"><div class="wrap">
    ${raw(s ? html`<div class="list">
      <div class="row"><span class="acav" aria-hidden="true">${(name || "·")[0]!.toUpperCase()}</span><div class="main"><div class="t">${name || "You"}</div><div class="s">Signed in with Google</div></div></div>
      <div class="row"><div class="main"><div class="t">Your user ID</div><div class="s"><code>${short(s.uid)}</code> · share it with the app's owner to switch Claude on for you</div></div><button class="btn sm" type="button" id="pfCopy">Copy</button></div>
    </div>` : "")}
    ${raw(about || html`<h2>About you</h2><p class="note">Set up Money first; then your age, family, income and goals go here.</p>`)}
  </div></div>`;
}

function onTap(e: Event): void {
  if (document.body.dataset.mod !== "profile") return;
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-prof],#pfCopy");
  if (!el || !rootEl?.contains(el)) return;
  if (el.id === "pfCopy") { const uid = ctx.session?.uid ?? ""; void navigator.clipboard?.writeText(uid).then(() => toast("User ID copied"), () => toast(uid)); return; }
  if (el.dataset.prof) profForm(el.dataset.prof);
}
function onKey(e: KeyboardEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[role="button"]');
  if (el && rootEl?.contains(el) && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); el.click(); }
}

export const profile: Module = {
  id: "profile",
  label: "Profile",
  icon: ICON,
  render(root) {
    if (ctx.store) { ensureLayer(); startMoney(); }
    if (rootEl !== root) { rootEl = root; root.addEventListener("click", onTap); root.addEventListener("keydown", onKey); }
    if (!name) void userName().then((n) => { if (n) { name = n; if (document.body.dataset.mod === "profile" && rootEl) draw(rootEl); } });
    draw(root);
  },
};
