import { accountCard, adminCard, wireAccount, wireAdmin } from "./account.ts";
import { privacyCard } from "./privacy.ts";
import type { Module } from "./types.ts";
import { isOwner } from "../core/ai.ts";
import { dlJson, exportExcel } from "./money/ui/dataio.ts";
import { startMoney } from "./money/index.ts";
import { html, raw, toast } from "../core/dom.ts";
import { config, signOutNow } from "../core/firebase.ts";
import { ctx } from "../core/app.ts";
import { bioCapable, changePassphrase, forgetDevice, MODE_LABEL, setMode, type UnlockMode } from "../core/vault.ts";
import { confirmPassphrase } from "../core/lock.ts";
import { META } from "../core/store.ts";
import { attachMeter, strength } from "../core/strength.ts";
import { backupCard, wireBackup } from "./backupcard.ts";
import { skCard, wireSk } from "./skcard.ts";
import { SecretKeyNeeded } from "../core/crypto.ts";
import { isEncryptedBackup, openOldBackup, parseOldExport, type Parsed } from "./money/import.ts";

const ICON = "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.5-1.5L17 5l-3-1-1 2h-2l-1-2-3 1 .5 1.8L6 8.3 4 8l-1 3 2 1v0l-2 1 1 3 2-.3 1.5 1.5L7 19l3 1 1-2h2l1 2 3-1-.5-1.8 1.5-1.5 2 .3 1-3z";

const LABELS: Record<string, string> = {
  txns: "transactions", accounts: "accounts", holdings: "investments", categories: "categories",
  recurring: "regular payments", loans: "loans", props: "properties", propItems: "property costs",
  trades: "broker trades", goals: "goals", payers: "payers", snaps: "month-end snapshots", settings: "settings",
};
const n = (x: number) => x.toLocaleString("en-IN");
const when = (iso: unknown) => typeof iso === "string" ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

/** "26 Nov 2026 · f238961": the day it was built and its code (the same on the website and the phone). */
const version = (cfg: { build: string; built?: string }): string => `${cfg.built ? new Date(`${cfg.built}T00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + " · " : ""}${cfg.build}`;

function dataCard(): string {
  const s = ctx.store;
  if (!s) return "";
  const meta = s.get(META, "money");
  const main = ["txns", "accounts", "holdings", "categories"].map((c) => `${n(s.count(c))} ${LABELS[c]}`).join(" · ");
  return html`<section class="card" id="dataCard">
    <h2>Your data</h2>
    ${raw(meta ? html`<p>${main}</p>${raw(isOwner() ? html`<p class="note">${meta.source === "Fresh start" ? "Set up" : "Imported"} ${when(meta.imported)}${meta.exported ? `, from an export made ${when(meta.exported)}` : ""}.</p>` : "")}` : html`<p>Nothing in Money yet. Open Money to set it up.</p>`)}
    <p class="note">${s.pending ? `Saving ${n(s.pending)} change${s.pending === 1 ? "" : "s"}…` : "Everything is saved, encrypted, in your cloud."}</p>
    <div class="btns">${raw(meta ? html`<button type="button" class="btn" id="dlMine">Download my data</button><button type="button" class="btn" id="dlMineX">Excel</button>` : "")}${raw(isOwner() ? html`<label class="btn ${meta ? "" : "pri"}" for="impFile">Import from KP Money Planner</label>
    <input id="impFile" type="file" accept=".json,application/json" hidden>` : "")}</div>
    <div id="impArea"></div>
  </section>`;
}

function securityCard(): string {
  const s = ctx.session;
  if (!s) return "";
  return html`<section class="card" id="secCard">
    <h2>Security</h2>
    <dl class="kv"><dt>This device</dt><dd>${MODE_LABEL[s.mode]}</dd></dl>
    <div class="btns">
      <button class="btn" type="button" id="secMode">Change how this device unlocks</button>
      <button class="btn" type="button" id="secPass">Change passphrase</button>
      <button class="btn" type="button" id="secLock">Lock now</button>
      <button class="btn ghost" type="button" id="secOut">Sign out of this device</button>
    </div>
    <div id="secArea"></div>
  </section>`;
}

async function wireImport(root: HTMLElement): Promise<void> {
  const input = root.querySelector<HTMLInputElement>("#impFile");
  const area = root.querySelector<HTMLElement>("#impArea");
  if (!input || !area) return;
  input.addEventListener("change", async () => {
    const f = input.files?.[0];
    input.value = "";
    if (!f) return;
    let j: unknown;
    try { j = JSON.parse(await f.text()); } catch { area.innerHTML = html`<p class="lockm err">That file isn't readable JSON.</p>`; return; }
    if (isEncryptedBackup(j)) {
      const enc = j;
      area.innerHTML = html`<form class="inl" id="impPassF"><label for="impPass">This is an encrypted backup. Enter your KP Money Planner passphrase:</label>
        <input id="impPass" type="password" autocomplete="off" required><button class="btn pri" type="submit">Open</button></form>`;
      area.querySelector("form")!.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const b = area.querySelector<HTMLButtonElement>("button")!;
        b.disabled = true; b.textContent = "Opening…";
        const x = await openOldBackup(enc, area.querySelector<HTMLInputElement>("#impPass")!.value);
        if (!x) { b.disabled = false; b.textContent = "Open"; toast("That passphrase doesn't open this backup."); return; }
        review(area, x);
      });
      return;
    }
    review(area, j);
  });
}

function review(area: HTMLElement, j: unknown): void {
  let p: Parsed;
  try { p = parseOldExport(j); } catch (e) { area.innerHTML = html`<p class="lockm err">${e instanceof Error ? e.message : "Couldn't read that file."}</p>`; return; }
  const list = Object.entries(p.counts).filter(([, v]) => v > 0).map(([k, v]) => `${n(v)} ${LABELS[k] ?? k}`).join(" · ");
  area.innerHTML = html`<div class="confirm"><p><b>In this file:</b> ${list}${p.exported ? ` (exported ${when(p.exported)})` : ""}.</p>
    <p>Importing <b>replaces everything</b> in Akhila Vrutta's money data with this file. Your KP Money Planner isn't touched.</p>
    <div class="btns"><button class="btn pri" type="button" id="impGo">Replace with this file</button><button class="btn ghost" type="button" id="impNo">Cancel</button></div>
    <p class="note" id="impProg"></p></div>`;
  area.querySelector("#impNo")!.addEventListener("click", () => { area.innerHTML = ""; });
  area.querySelector("#impGo")!.addEventListener("click", async () => {
    const store = ctx.store;
    if (!store) return;
    area.querySelectorAll("button").forEach((b) => (b.disabled = true));
    const prog = area.querySelector<HTMLElement>("#impProg")!;
    try {
      const r = await store.replaceAll(p.records, (d, t) => { prog.textContent = t ? `Encrypting and saving… ${n(d)} of ${n(t)}` : "Nothing has changed since the last import."; });
      toast(r.written + r.removed ? `Imported: ${n(r.written)} saved, ${n(r.removed)} removed` : "Already up to date");
      ctx.rerender();
    } catch (e) {
      prog.textContent = `Import stopped: ${e instanceof Error ? e.message : String(e)}. Run it again to finish; done parts aren't repeated.`;
      area.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  });
}

async function wireSecurity(root: HTMLElement): Promise<void> {
  const s = ctx.session;
  const area = root.querySelector<HTMLElement>("#secArea");
  if (!s || !area) return;
  root.querySelector("#secLock")?.addEventListener("click", () => location.reload());
  root.querySelector("#secOut")?.addEventListener("click", (ev) => {
    const b = ev.currentTarget as HTMLButtonElement;
    if (!b.dataset.arm) { b.dataset.arm = "1"; b.textContent = "Tap again: sign out and remove this device's copy"; b.classList.add("danger"); return; }
    void (async () => { ctx.store?.close(); await forgetDevice(); await signOutNow(); location.reload(); })();
  });
  root.querySelector("#secMode")?.addEventListener("click", async () => {
    const canBio = await bioCapable();
    const modes: UnlockMode[] = canBio ? ["bio", "remember", "pass"] : ["remember", "pass"];
    area.innerHTML = html`<form class="inl" id="modeF">${modes.map((m) => raw(html`<label class="opt"><input type="radio" name="um" value="${m}" ${raw(s.mode === m ? "checked" : "")}> ${MODE_LABEL[m]}</label>`))}
      ${raw(canBio ? "" : html`<p class="note">Fingerprint unlock isn't available in this browser.</p>`)}
      <div class="btns"><button class="btn pri" type="submit">Save</button><button class="btn ghost" type="button" id="mx">Cancel</button></div></form>`;
    area.querySelector("#mx")!.addEventListener("click", () => { area.innerHTML = ""; });
    area.querySelector("form")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const m = area.querySelector<HTMLInputElement>('input[name="um"]:checked')?.value as UnlockMode | undefined;
      if (!m || m === s.mode) { area.innerHTML = ""; return; }
      let rawKey: Uint8Array<ArrayBuffer> | null = null;
      if (m !== "pass") {
        rawKey = await confirmPassphrase(s, `Enter your passphrase to switch to “${MODE_LABEL[m]}”.`);
        if (!rawKey) return;
      }
      try { await setMode(s, m, rawKey ?? undefined); s.mode = m; toast(`Saved: ${MODE_LABEL[m]}`); ctx.rerender(); }
      catch (e) { toast(`Couldn't set that up: ${e instanceof Error ? e.message : String(e)}`); }
      finally { rawKey?.fill(0); }
    });
  });
  root.querySelector("#secPass")?.addEventListener("click", () => {
    area.innerHTML = html`<form class="inl" id="passF" autocomplete="off">
      <input type="text" name="username" value="akhila-vrutta" autocomplete="username" hidden>
      <label for="op">Current passphrase</label><input id="op" type="password" autocomplete="current-password" required>
      <label for="np">New passphrase (10+ characters; 5 or more words is best)</label><input id="np" type="password" autocomplete="new-password" required><div id="npm"></div>
      <label for="np2">New passphrase again</label><input id="np2" type="password" autocomplete="new-password" required>
      <div id="npskw" hidden><label for="npsk">Secret Key (from your Emergency Kit)</label><input id="npsk" type="text" autocomplete="off" spellcheck="false" class="skin"></div>
      <p class="note">Only the key is re-locked, so this is quick. Your other devices keep their fingerprint unlock.</p>
      <div class="btns"><button class="btn pri" type="submit">Change</button><button class="btn ghost" type="button" id="px">Cancel</button></div></form>`;
    area.querySelector("#px")!.addEventListener("click", () => { area.innerHTML = ""; });
    attachMeter(area.querySelector<HTMLInputElement>("#np")!, area.querySelector<HTMLElement>("#npm")!);
    area.querySelector("form")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const v = (id: string) => area.querySelector<HTMLInputElement>(`#${id}`)!.value;
      if (v("np").length < 10) return toast("Use at least 10 characters.");
      if (strength(v("np")).level === 0) return toast("That would be quick to guess. Add another unrelated word or two.");
      if (v("np") !== v("np2")) return toast("The new passphrases don't match.");
      const b = area.querySelector<HTMLButtonElement>(".btn.pri")!;
      b.disabled = true; b.textContent = "Changing…";
      try {
        const skw = area.querySelector<HTMLElement>("#npskw")!;
        if (await changePassphrase(s, v("op"), v("np"), skw.hidden ? undefined : v("npsk"))) { area.innerHTML = ""; toast("Passphrase changed"); }
        else { toast("The current passphrase is wrong."); }
      } catch (e) {
        if (e instanceof SecretKeyNeeded) { area.querySelector<HTMLElement>("#npskw")!.hidden = false; toast("This device doesn't have your Secret Key yet: type it from your Emergency Kit."); }
        else toast(e instanceof Error ? e.message : String(e));
      }
      b.disabled = false; b.textContent = "Change";
    });
  });
}

export const settings: Module = {
  id: "settings",
  label: "Settings",
  icon: ICON,
  render(root) {
    const cfg = config();
    root.innerHTML = html`${raw(privacyCard())}${raw(accountCard())}${raw(adminCard())}${raw(backupCard())}${raw(dataCard())}${raw(securityCard())}${raw(skCard())}
      <section class="card" id="aboutCard">
        <h2>About</h2>
        <dl class="kv">
          <dt>Version</dt><dd>${version(cfg)}</dd>
          <dt>Privacy and terms</dt><dd><a href="/privacy" target="_blank" rel="noopener">Privacy policy</a> · <a href="/terms" target="_blank" rel="noopener">Terms</a></dd>
          <dt>Help and feedback</dt><dd>kamalaprashanth2@gmail.com</dd>
        </dl>
      </section>`;
    // Download my data: the Money data as JSON, or as Excel (the planner's own exports)
    root.querySelector("#dlMine")?.addEventListener("click", () => { startMoney(); dlJson(); });
    root.querySelector("#dlMineX")?.addEventListener("click", () => { startMoney(); exportExcel(); });
    void wireImport(root);
    wireBackup(root);
    wireSk(root);
    void wireSecurity(root);
    wireAccount(root);
    wireAdmin(root);
  },
};
