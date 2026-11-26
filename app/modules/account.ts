/**
 * Settings › Account (everyone): who's signed in (first name only, never the e-mail), the user ID to share
 * for Claude access, and deleting the account with all its data (Google Play requires it).
 * Settings › Admin (only the app's owner): account counts and who has Claude. Counts only, never data.
 */
import { html, raw } from "../core/dom.ts";
import { ctx } from "../core/app.ts";
import { appCheckError, callable, signOutNow, userName } from "../core/firebase.ts";
import { isNative } from "../core/native.ts";
import { forgetDevice } from "../core/vault.ts";
import { connectDrive, driveBackups, removeFile, type FileRec } from "../core/files.ts";
import { FILES } from "../core/store.ts";
import { appCheckSeen, isOwner } from "../core/ai.ts";
import { toast } from "./money/ui/kit.ts";

const short = (uid: string): string => (uid.length > 10 ? `${uid.slice(0, 4)}…${uid.slice(-4)}` : uid);
const err = (e: unknown): string => String((e as { message?: string })?.message ?? e).replace(/^.*?:\s*/, "");

export function accountCard(): string {
  const s = ctx.session;
  if (!s) return "";
  return html`<section class="card" id="acCard">
    <h2>Account</h2>
    <div class="acwho"><span class="acav" id="acAv">·</span><span><b id="acName">Signed in with Google</b><span class="note">Signed in with Google</span></span></div>
    <div class="acdel">
      <h3>Delete account</h3>
      <p class="note">Deletes everything: your records in the cloud, your encrypted files and backups in your Google Drive, and your sign-in. It can't be undone. Make a backup first if you might want it later.</p>
      <button class="btn danger" type="button" id="acDel">Delete my account and data</button>
      <div id="acDelArea"></div>
    </div>
  </section>`;
}

export function wireAccount(root: HTMLElement): void {
  const s = ctx.session;
  if (!s || !root.querySelector("#acCard")) return;
  void userName().then((n) => { if (!n) return; const a = root.querySelector("#acName"), v = root.querySelector("#acAv"); if (a) a.textContent = n; if (v) v.textContent = n[0]!.toUpperCase(); });
  root.querySelector("#acDel")?.addEventListener("click", () => {
    const area = root.querySelector<HTMLElement>("#acDelArea")!;
    area.innerHTML = html`<div class="confirm"><p><b>This deletes all your data for good.</b> Type <b>DELETE</b> to confirm.</p>
      <input class="skin" id="acDelIn" autocomplete="off" aria-label="Type DELETE to confirm"><div class="btns"><button class="btn danger" type="button" id="acDelGo">Delete everything</button><button class="btn" type="button" id="acDelNo">Cancel</button></div><p class="note" id="acDelSt"></p></div>`;
    area.querySelector("#acDelNo")!.addEventListener("click", () => { area.innerHTML = ""; });
    area.querySelector("#acDelGo")!.addEventListener("click", () => void (async () => {
      if (area.querySelector<HTMLInputElement>("#acDelIn")!.value.trim() !== "DELETE") { toast("Type DELETE to confirm"); return; }
      const st = area.querySelector<HTMLElement>("#acDelSt")!, go = area.querySelector<HTMLButtonElement>("#acDelGo")!;
      go.disabled = true;
      try {
        // 1. the encrypted files and backups in their Google Drive (the app made them, so it can delete them)
        const files = (ctx.store?.all<FileRec>(FILES) ?? []).filter((f) => !f.deleted);
        if (files.length) { st.textContent = `Deleting ${files.length} files from your Google Drive…`; await connectDrive(); for (const f of files) await removeFile(f).catch(() => {}); }
        try { st.textContent = "Deleting your backups…"; for (const b of await driveBackups.list()) await driveBackups.remove(b.id).catch(() => {}); } catch { /* no backups folder */ }
        // 2. everything in the cloud, and the sign-in
        st.textContent = "Deleting your data in the cloud…";
        await (await callable("deleteAccount", 300000))({ confirm: "DELETE" });
        // 3. this device
        await forgetDevice();
        try { localStorage.clear(); } catch { /* private mode */ }
        await signOutNow().catch(() => {});
        st.textContent = "Your account and data are deleted.";
        setTimeout(() => location.reload(), 1200);
      } catch (e) { go.disabled = false; st.textContent = `Couldn't finish: ${err(e)}. Nothing more was deleted; try again.`; }
    })());
  });
}

export function adminCard(): string {
  if (!ctx.session || !isOwner()) return "";
  return html`<section class="card" id="adCard">
    <h2>Admin <span class="chip">Only you</span></h2>
    <div class="adstats" id="adStats"><span><span class="note">Accounts</span><b>…</b></span><span><span class="note">Active this week</span><b>…</b></span><span><span class="note">Claude today</span><b>…</b></span></div>
    <p class="note" id="adAc">${appCheckSeen === null ? "App Check on this device: not checked yet (reopen the app)" : appCheckSeen ? "App Check on this device: verified ✓ (this device would keep working when it's enforced)" : "App Check on this device: NOT verified ✗ (this device would be blocked if it were enforced)"}${appCheckSeen === false ? appCheckError ? ` · ${isNative() ? "Play" : "reCAPTCHA"} said: ${appCheckError}` : " · this device got no error (its token didn't reach the server)" : ""}</p>
    <h3>Claude access</h3>
    <div id="adList"><p class="note">Loading…</p></div>
    <div class="adadd"><input class="skin" id="adUid" placeholder="Paste a user ID" aria-label="User ID" autocomplete="off"><input class="skin" id="adName" placeholder="Name" aria-label="A name only you see" autocomplete="off"><button class="btn pri" type="button" id="adAdd">Add</button></div>
    <p class="note">People find their user ID in Profile. Claude costs you per question, so it's off for everyone you don't add. You see counts only, never anyone's data.</p>
  </section>`;
}

export function wireAdmin(root: HTMLElement): void {
  const card = root.querySelector<HTMLElement>("#adCard");
  if (!card) return;
  const list = async (): Promise<void> => {
    try {
      const r = (await (await callable("adminAiList"))({})).data as { people: { uid: string; name: string; on: boolean; today: number }[] };
      card.querySelector("#adList")!.innerHTML = html`<div class="adrow"><span><b>You</b><span class="note">Always on · 40 a day</span></span></div>${raw(r.people.map((p) => html`<div class="adrow"><span><b>${p.name || "No name"}</b><span class="note"><code>${short(p.uid)}</code>${p.today ? ` · ${p.today} today` : ""}</span></span><label class="adsw"><input type="checkbox" data-uid="${p.uid}" data-name="${p.name}" ${p.on ? "checked" : ""} aria-label="Claude for ${p.name || p.uid}"></label><button class="btn ghost" type="button" data-rm="${p.uid}" aria-label="Remove ${p.name || p.uid}">✕</button></div>`).join(""))}`;
    } catch (e) { card.querySelector("#adList")!.innerHTML = html`<p class="note err">Couldn't load: ${err(e)}</p>`; }
  };
  const set = async (data: Record<string, unknown>, msg: string): Promise<void> => {
    try { await (await callable("adminAiSet"))(data); toast(msg); await list(); } catch (e) { toast(`Couldn't save: ${err(e)}`); }
  };
  void (async () => {
    try {
      const r = (await (await callable("adminStats"))({})).data as { accounts: number; active: number; asksToday: number };
      card.querySelector("#adStats")!.innerHTML = html`<span><span class="note">Accounts</span><b>${String(r.accounts)}</b></span><span><span class="note">Active this week</span><b>${String(r.active)}</b></span><span><span class="note">Claude today</span><b>${String(r.asksToday)}</b></span>`;
    } catch { /* offline */ }
  })();
  void list();
  card.addEventListener("change", (e) => { const i = e.target as HTMLInputElement; if (i.dataset.uid) void set({ uid: i.dataset.uid, name: i.dataset.name, on: i.checked }, i.checked ? "Claude switched on" : "Claude switched off"); });
  card.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const rm = t.closest<HTMLElement>("[data-rm]");
    if (rm) { void set({ uid: rm.dataset.rm, remove: true }, "Removed"); return; }
    if (t.closest("#adAdd")) {
      const uid = card.querySelector<HTMLInputElement>("#adUid")!.value.trim(), name = card.querySelector<HTMLInputElement>("#adName")!.value.trim();
      if (!uid) { toast("Paste their user ID"); return; }
      void set({ uid, name, on: true }, `Claude switched on for ${name || "them"}`).then(() => { card.querySelector<HTMLInputElement>("#adUid")!.value = ""; card.querySelector<HTMLInputElement>("#adName")!.value = ""; });
    }
  });
}
