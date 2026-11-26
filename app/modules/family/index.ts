/**
 * Profile › Family (approved design, 26 Nov 2026): start a family space or join one with 6 words, its members,
 * invites, which tags are shared, and this month's shared spending. The space itself: core/family.ts.
 */
import type { Module } from "../types.ts";
import { html, raw } from "../../core/dom.ts";
import { ctx } from "../../core/app.ts";
import { formatINR } from "../../core/money.ts";
import { connectDrive, famDrive } from "../../core/files.ts";
import { notInMyDrive, syncFamilyFiles } from "../../core/famfiles.ts";
import { cancelInvite, createFamily, familyOpen, forgetFamily, handOver, lostAccess, refreshRole, retryFamily, setShared, shares, joinFamily, leaveFamily, makeInvite, members, myUid, onFamily, removeMember, setSharedTags, sharedTags, space, togetherThisMonth } from "../../core/family.ts";
import { askConfirm, closeModal, ensureLayer, openSheet, toast } from "../../core/ui.ts";

const ICON = "M8 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM16 8a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM2 20c.8-3.5 11.2-3.5 12 0M13 20c.6-2.6 7.4-2.6 8 0";
const err = (e: unknown): string => (e instanceof Error ? e.message : String(e));
let rootEl: HTMLElement | null = null, busy = false;
const ym = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
/** Every tag used in your transactions, and the shared ones. */
const allTags = (): string[] => { const s = new Set<string>(sharedTags()); for (const t of ctx.store?.all<{ id: string; tags?: string[]; deleted?: boolean }>("txns") ?? []) if (!t.deleted) for (const g of t.tags ?? []) s.add(g); return [...s].sort((a, b) => a.localeCompare(b)); };

function draw(root: HTMLElement): void {
  if (!ctx.store) { root.innerHTML = html`<section class="card"><h2>Family</h2><p>Opens once the app is unlocked.</p></section>`; return; }
  const sp = space();
  if (!sp) {
    root.innerHTML = html`<div class="mv fmv"><div class="wrap">
      <h2>Family</h2>
      <p class="note">A shared space for your family. What you share is end-to-end encrypted with the family's own key; everything else stays private to each of you.</p>
      <div class="list"><button type="button" class="row tap fmbtn" id="fmNew"><div class="main"><div class="t">Start a family space</div><div class="s">Then invite your family with a one-time code</div></div><span class="amt mut">›</span></button>
      <button type="button" class="row tap fmbtn" id="fmJoin"><div class="main"><div class="t">Join a family</div><div class="s">With the 6 words you were given</div></div><span class="amt mut">›</span></button></div>
    </div></div>`;
    return;
  }
  if (lostAccess()) {
    root.innerHTML = html`<div class="mv fmv"><div class="wrap">
      <h2>Family</h2>
      <p class="note">The family space couldn't be opened just now. Usually that's the connection or the app's security check; it can also mean you were taken out of it. Nothing has been deleted.</p>
      <div class="btns"><button type="button" class="btn pri" id="fmRetry">Try again</button><button type="button" class="btn danger" id="fmForget">I was removed: forget it</button></div>
    </div></div>`;
    return;
  }
  const ms = members(), me = myUid(), owner = sp.role === "owner", tg = sharedTags(), mo = togetherThisMonth(ym());
  root.innerHTML = html`<div class="mv fmv"><div class="wrap">
    <p class="note">A shared space for your family. What you share is end-to-end encrypted with the family's own key; everything else stays private to each of you.</p>
    ${raw(familyOpen() ? "" : html`<p class="note err">The family space couldn't be opened just now. Check your connection.</p>`)}
    <h2>Members</h2>
    <div class="list">${raw(ms.map((m) => html`<div class="row"><span class="acav" aria-hidden="true">${(m.name || "?")[0]!.toUpperCase()}</span><div class="main"><div class="t">${m.id === me ? `${m.name || "You"} (you)` : m.name || "Member"}</div></div>${raw(owner && m.id !== me ? html`<button type="button" class="btn sm ghost" data-own="${m.id}">Make owner</button><button type="button" class="btn sm ghost" data-rm="${m.id}">Remove</button>` : "")}</div>`).join("") || html`<div class="empty">Only you so far.</div>`)}</div>
    ${raw(owner ? html`<button type="button" class="btn pri fmwide" id="fmInvite" ${busy ? "disabled" : ""}>Invite someone</button>` : "")}
    ${raw(notInMyDrive() ? html`<div class="list"><div class="row"><div class="main"><div class="t">${String(notInMyDrive())} family file${notInMyDrive() === 1 ? "" : "s"} not in your Drive yet</div><div class="s">${famDrive.ready() ? "Copying now; they open meanwhile. If it stays, your Google Drive may be full." : "They open meanwhile; tap to let this device save them to your Drive."}</div></div>${raw(famDrive.ready() ? "" : html`<button type="button" class="btn sm" id="fmDrive">Save to Drive</button>`)}</div></div>` : "")}
    <h2>Shared in Money</h2>
    <p class="note">Transactions with these tags are shared as soon as either of you saves them. Both of you can see and change them, and both count them as household spending; only the payer's balance changes.</p>
    <div class="fmtags" role="group" aria-label="Shared tags">${raw(allTags().map((g) => html`<button type="button" data-tag="${g}" class="${tg.includes(g) ? "on" : ""}" aria-pressed="${String(tg.includes(g))}">${g}</button>`).join(""))}</div>
    <h2>This month, together</h2>
    <div class="list"><div class="row"><div class="main"><div class="t">${formatINR(mo.total)} shared spending</div><div class="s">${mo.by.map((x) => `${x.name} ${formatINR(x.amount)}`).join(" · ") || "Nothing shared yet this month"}</div></div></div></div>
    <h2>Also share</h2>
    <div class="list">
      <label class="row dchk"><div class="main"><div class="t">Family days</div><div class="s">Birthdays, anniversaries and shraddha, with reminders on both phones</div></div><input type="checkbox" id="fmDays" ${shares("days") ? "checked" : ""} aria-label="Share family days"></label>
      <label class="row dchk"><div class="main"><div class="t">Groceries and to-do lists</div><div class="s">Household › Lists, one list for both of you</div></div><input type="checkbox" id="fmLists" ${shares("lists") ? "checked" : ""} aria-label="Share the lists"></label>
    </div>
    <p class="note">Documents, appliances, vehicles and properties: share each one from its own page (in the next update).</p>
    <div class="btns" style="margin-top:12px">${raw(owner && ms.length > 1 ? "" : html`<button type="button" class="btn danger" id="fmLeave">Leave the family space</button>`)}</div>
  </div></div>`;
}

function inviteSheet(code: string, id: string): void {
  openSheet("Invite someone", html`<p class="note">Tell them these 6 words. On their phone: Profile › Family › Join a family. The code works once, for 24 hours.</p>
    <div class="fmcode" aria-label="Invite code">${raw(code.split(" ").map((w) => html`<span>${w}</span>`).join(""))}</div>
    <p class="note">Say it on a call or send it on WhatsApp. The family key travels locked with these words; our servers never see it.</p>
    <div class="btns"><button class="btn pri" type="button" id="fmCopy">Copy the words</button><button class="btn" type="button" id="cx">Done</button><button class="btn danger" type="button" id="fmCancel">Cancel invite</button></div>`, (s) => {
    s.querySelector<HTMLElement>("#fmCopy")!.onclick = () => { void navigator.clipboard?.writeText(code).then(() => toast("Copied"), () => toast(code)); };
    s.querySelector<HTMLElement>("#cx")!.onclick = closeModal;
    s.querySelector<HTMLElement>("#fmCancel")!.onclick = () => { void cancelInvite(id).then(() => { closeModal(); toast("Invite cancelled"); }); };
  });
}
function joinSheet(): void {
  openSheet("Join a family", html`<div class="f"><label for="f_fmcode">The 6 words</label><input id="f_fmcode" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="e.g. lotus mango river seven tiger bell"></div>
    <p class="note">After joining you'll see what's shared with the family. Your transactions with a shared tag (like Home) are shared too; nothing else of yours is.</p>
    <p class="note" id="fmSt"></p>
    <div class="btns"><button class="btn pri" type="button" id="sv">Join</button><button class="btn" type="button" id="cx">Cancel</button></div>`, (s) => {
    s.querySelector<HTMLElement>("#cx")!.onclick = closeModal;
    const go = s.querySelector<HTMLButtonElement>("#sv")!;
    go.onclick = () => void (async () => {
      go.disabled = true; s.querySelector("#fmSt")!.textContent = "Joining…";
      try { await joinFamily(s.querySelector<HTMLInputElement>("#f_fmcode")!.value); closeModal(); toast("You've joined the family space"); }
      catch (e) { go.disabled = false; s.querySelector("#fmSt")!.textContent = err(e); }
    })();
  });
}

function onTap(e: Event): void {
  if (document.body.dataset.mod !== "family" || busy) return;
  const el = (e.target as HTMLElement).closest<HTMLElement>("#fmNew,#fmJoin,#fmInvite,#fmLeave,#fmDrive,#fmRetry,#fmForget,[data-tag],[data-rm],[data-own]");
  if (!el || !rootEl?.contains(el)) return;
  const run = (fn: () => Promise<void>, ok?: string): void => { busy = true; void fn().then(() => { if (ok) toast(ok); }, (x) => toast(err(x))).finally(() => { busy = false; if (rootEl) draw(rootEl); }); };
  if (el.id === "fmNew") return run(createFamily, "Family space started");
  if (el.id === "fmJoin") return joinSheet();
  if (el.id === "fmRetry") return run(retryFamily);
  if (el.id === "fmForget") return askConfirm("Forget the family space on this account? Its files are moved to your Drive's Trash. Do this only if you were removed.", "Forget it", () => run(forgetFamily, "Family space forgotten"));
  if (el.id === "fmDrive") return run(async () => { await connectDrive(); await syncFamilyFiles(); }, "Saving family files to your Drive");
  if (el.dataset.own) return askConfirm("Make them the owner of the family space? You stay a member; they can invite and remove people.", "Make owner", () => run(() => handOver(el.dataset.own!), "Ownership handed over"));
  if (el.id === "fmInvite") { busy = true; void makeInvite().then(({ code, id }) => inviteSheet(code, id), (x) => toast(err(x))).finally(() => { busy = false; }); return; }
  if (el.id === "fmLeave") return askConfirm("Leave the family space? What's shared stays with the family; you won't see it any more, and its files are deleted from your Drive.", "Leave", () => run(leaveFamily, "You've left the family space"));
  if (el.dataset.rm) return askConfirm("Remove them from the family space? They won't see new shared items; what they already saw can't be taken back.", "Remove", () => run(() => removeMember(el.dataset.rm!), "Removed"));
  if (el.dataset.tag) { const t = el.dataset.tag, cur = sharedTags(); return run(() => setSharedTags(cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]), cur.includes(t) ? `${t} is no longer shared` : `${t} is shared`); }
}

function onChange(e: Event): void {
  const i = e.target as HTMLInputElement;
  if (document.body.dataset.mod !== "family" || !["fmDays", "fmLists"].includes(i.id)) return;
  const what = i.id === "fmDays" ? "days" : "lists", label = what === "days" ? "Family days" : "The lists";
  busy = true;
  void setShared(what, i.checked).then(() => toast(i.checked ? `${label} shared with the family` : `${label} no longer shared`), (x) => toast(err(x))).finally(() => { busy = false; if (rootEl) draw(rootEl); });
}

let unsub: (() => void) | null = null;
export const family: Module = {
  id: "family",
  label: "Family",
  icon: ICON,
  hidden: true,
  render(root) {
    if (ctx.store) ensureLayer();
    if (rootEl !== root) { rootEl = root; root.addEventListener("click", onTap); root.addEventListener("change", onChange); }
    unsub ??= onFamily(() => { if (document.body.dataset.mod === "family" && rootEl) draw(rootEl); });
    draw(root);
    void refreshRole();   // a hand-over made on another phone shows here at once
  },
};
