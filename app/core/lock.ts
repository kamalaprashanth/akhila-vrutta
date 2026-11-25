/** The lock screen: first-time setup on a device, and unlocking every time the app opens. */
import { html, raw, toast } from "./dom.ts";
import { attachMeter, strength } from "./strength.ts";
import { failsSoFar, noteRight, noteWrong, waitLabel, waitLeft } from "./attempts.ts";
import { aesKey } from "./crypto.ts";
import {
  bioCapable, createHome, currentUser, deviceInfo, forgetDevice, homeOf, setMode, signIn,
  unlockBio, unlockPass, unlockRemembered, type Device, type Session, type UnlockMode,
} from "./vault.ts";
import { signOutNow, type SignedInUser } from "./firebase.ts";
import { isNative } from "./native.ts";

let el: HTMLElement | null = null;

function show(inner: string): HTMLElement {
  if (!el) {
    el = document.createElement("div");
    el.id = "lock";
    el.className = "lock";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Unlock Akhila Vrutta");
    document.body.appendChild(el);
  }
  el.innerHTML = html`<div class="lockc"><img class="lockmark" src="icons/logo.svg" alt=""><h2 class="lockt">Akhila Vrutta</h2>${raw(inner)}</div>`;
  const f = el.querySelector("input:not([hidden])") as HTMLInputElement | null;
  if (f) setTimeout(() => f.focus(), 60);
  return el;
}

const msg = (t: string, cls = "") => html`<p class="lockm ${cls}">${raw(t)}</p>`;

export function closeLock(): void {
  const e = el;
  el = null;
  if (e) { e.classList.add("out"); setTimeout(() => e.remove(), 260); }
}

export const lockProgress = (t: string) => { show(msg(html`${t}`)); };

function busy(e: HTMLElement, on: boolean, txt?: string): void {
  e.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button,input").forEach((b) => (b.disabled = on));
  const b = e.querySelector<HTMLButtonElement>(".btn.pri");
  if (b && txt) b.textContent = on ? txt : (b.dataset.lbl ?? b.textContent);
}

interface AskOpts<T> {
  create?: boolean;
  btn?: string;
  wrong?: string;
  check(p: string): Promise<T | null>;
}

function askPassphrase<T>(title: string, note: string, o: AskOpts<T>): Promise<T> {
  return new Promise((resolve) => {
    const btn = o.btn ?? "Unlock";
    const e = show(html`${raw(msg(note))}<form class="lockf" autocomplete="off">
      <input type="text" name="username" value="akhila-vrutta" autocomplete="username" hidden>
      <label class="lockl" for="lk_p">${title}</label>
      <input id="lk_p" type="password" autocomplete="${o.create ? "new-password" : "current-password"}" required>
      ${raw(o.create ? html`<div id="lk_m"></div><label class="lockl" for="lk_p2">Type it again</label><input id="lk_p2" type="password" autocomplete="new-password" required>` : "")}
      <p class="lockm err" id="lk_e" hidden></p>
      <button class="btn pri" type="submit" data-lbl="${btn}">${btn}</button></form>
      ${raw(o.create ? html`<p class="lockm small">Tip: 5 or more unrelated words, like <i>mango kite river seventy lamp</i>. Write it down and keep it at home: nobody can recover it for you.</p>` : "")}`);
    const err = e.querySelector<HTMLElement>("#lk_e")!;
    const pass = e.querySelector<HTMLInputElement>("#lk_p")!, go = e.querySelector<HTMLButtonElement>(".btn.pri")!;
    const fail = (t: string) => { err.hidden = false; err.textContent = t; };
    if (o.create) attachMeter(pass, e.querySelector<HTMLElement>("#lk_m")!);
    // after 5 wrong tries on this device: a wait, counted down on the button
    let timer = 0;
    const hold = (): boolean => {
      const ms = waitLeft();
      if (!ms || o.create) { go.disabled = false; pass.disabled = false; go.textContent = btn; return false; }
      go.disabled = true; pass.disabled = true;
      go.textContent = `${btn} (${waitLabel(ms)})`;
      fail(`${failsSoFar()} wrong tries. Wait ${waitLabel(ms)} before trying again.`);
      clearTimeout(timer); timer = window.setTimeout(() => { if (!hold()) { err.hidden = true; pass.focus(); } }, 1000);
      return true;
    };
    hold();
    e.querySelector("form")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!o.create && hold()) return;
      const p = pass.value;
      if (o.create) {
        if (p.length < 10) return fail("Use at least 10 characters. A few words are easiest to remember.");
        if (strength(p).level === 0) return fail("That would be quick to guess. Add another unrelated word or two.");
        if (p !== e.querySelector<HTMLInputElement>("#lk_p2")!.value) return fail("The two entries don't match.");
      }
      busy(e, true, o.create ? "Setting up…" : "Unlocking…");
      let r: T | null = null;
      try { r = await o.check(p); } catch (x) { busy(e, false); return fail(x instanceof Error ? x.message : "Something went wrong."); }
      busy(e, false);
      if (r) { if (!o.create) noteRight(); clearTimeout(timer); resolve(r); return; }
      if (!o.create) { noteWrong(); if (hold()) return; }
      fail(o.wrong ?? "That passphrase doesn't match. Try again."); pass.select();
    });
  });
}

export function chooseMode(canBio: boolean): Promise<UnlockMode> {
  return new Promise((resolve) => {
    const e = show(html`${raw(msg("How should this device unlock from now on? You can change this later in Settings."))}
      <div class="lockopts">${raw(canBio ? html`<button class="lockopt" type="button" data-m="bio"><b>${isNative() ? "Fingerprint" : "Fingerprint or screen lock"}</b><span>${isNative() ? "The app asks for your fingerprint each time it opens. The phone's PIN doesn't open it; your passphrase always does." : "Recommended for your phone. The app asks for your fingerprint each time it opens."}</span></button>` : "")}
      <button class="lockopt" type="button" data-m="remember"><b>Stay unlocked on this device</b><span>Opens straight away. Anyone who can unlock this device can open the app.</span></button>
      <button class="lockopt" type="button" data-m="pass"><b>Passphrase every time</b><span>Most private. Type the passphrase whenever the app opens.</span></button></div>`);
    e.querySelectorAll<HTMLElement>("[data-m]").forEach((b) => b.addEventListener("click", () => resolve(b.dataset.m as UnlockMode)));
  });
}

async function applyMode(dev: Omit<Device, "mode">, mode: UnlockMode, dekRaw: Uint8Array<ArrayBuffer>): Promise<Device> {
  for (;;) {
    try {
      return await setMode(dev, mode, dekRaw);
    } catch (x) {
      const e = show(html`${raw(msg(html`Fingerprint unlock couldn't be set up: ${x instanceof Error ? x.message : "cancelled"}.`, "err"))}
        <div class="lockopts"><button class="btn pri" type="button" data-m="bio">Try again</button>
        <button class="btn" type="button" data-m="remember">Stay unlocked instead</button>
        <button class="btn" type="button" data-m="pass">Passphrase every time</button></div>`);
      mode = await new Promise<UnlockMode>((r) => e.querySelectorAll<HTMLElement>("[data-m]").forEach((b) => b.addEventListener("click", () => r(b.dataset.m as UnlockMode))));
    }
  }
}

/** Runs until the app is unlocked. Never resolves when this account isn't allowed. */
export async function unlock(): Promise<Session> {
  if (!globalThis.crypto?.subtle || !window.indexedDB) {
    show(msg("This browser can't run Akhila Vrutta securely (no Web Crypto or IndexedDB). Use a current Chrome, Edge, Safari or Firefox.", "err"));
    return new Promise(() => {});
  }
  const dev = await deviceInfo();
  if (dev) {
    const user = await currentUser().catch(() => null);
    if (user && user.uid !== dev.uid) { await forgetDevice(); return setup(); }
    return unlockDevice(dev);
  }
  return setup();
}

async function unlockDevice(dev0: Device): Promise<Session> {
  let dev = dev0;
  const done = (dek: CryptoKey): Session => ({ uid: dev.uid, home: dev.home, dek, mode: dev.mode });
  if (dev.mode === "remember") {
    const k = await unlockRemembered();
    if (k) return done(k);
  }
  let redo = false;
  if (dev.mode === "bio") {
    const r = await new Promise<CryptoKey | "pass">((resolve) => {
      const e = show(html`${raw(msg(isNative() ? "Unlock with your fingerprint." : "Unlock with your fingerprint or screen lock."))}
        <div class="lockopts"><button class="btn pri" type="button" id="lk_b">Unlock</button>
        <button class="btn lockalt" type="button" id="lk_pp">Use passphrase instead</button></div><p class="lockm err" id="lk_e" hidden></p>`);
      const go = async () => {
        try { resolve(await unlockBio(dev)); } catch (x) {
          // the phone's fingerprint key is gone (a fingerprint was added): passphrase, then choose again
          if (x instanceof Error && (x.name === "BioChanged" || (x as { code?: string }).code === "missing")) { redo = true; toast(x.name === "BioChanged" ? x.message : "Fingerprint unlock needs setting up again. Enter your passphrase."); resolve("pass"); return; }
          const t = e.querySelector<HTMLElement>("#lk_e")!;
          t.hidden = false;
          t.textContent = x instanceof Error && x.name === "NotAllowedError" ? "Cancelled. Tap Unlock to try again." : `Couldn't unlock: ${x instanceof Error ? x.message : "error"}`;
        }
      };
      e.querySelector("#lk_b")!.addEventListener("click", () => void go());
      e.querySelector("#lk_pp")!.addEventListener("click", () => resolve("pass"));
      void go();
    });
    if (r !== "pass") return done(r);
  }
  const keyRaw = await askPassphrase("Passphrase", "Enter your passphrase to open your data.", { check: (p) => unlockPass(dev, p) });
  const key = await aesKey(keyRaw);
  if (dev.mode === "remember") await setMode(dev, "remember", keyRaw);
  if (redo) { const m = await chooseMode(await bioCapable()); dev = await applyMode(dev, m, keyRaw); }
  keyRaw.fill(0);
  return done(key);
}

async function setup(): Promise<Session> {
  const e = show(html`${raw(msg("Your data is encrypted on this device and in the cloud. Sign in with your Google account to set up this device."))}
    <div class="lockopts"><button class="btn pri" type="button" id="lk_g" data-lbl="Sign in with Google">Sign in with Google</button></div>
    <p class="lockm err" id="lk_e" hidden></p>`);
  const err = (t: string) => { const x = e.querySelector<HTMLElement>("#lk_e"); if (x) { x.hidden = false; x.textContent = t; } };
  // Listen for the tap straight away: a tap while Firebase is still loading must not be lost.
  const tapped = new Promise<SignedInUser>((res) => {
    e.querySelector("#lk_g")!.addEventListener("click", async () => {
      busy(e, true, "Signing in…");
      try { const u = await signIn(); busy(e, false); if (u) res(u); }
      catch (x) { busy(e, false); err(`Sign-in didn't finish (${(x as { code?: string }).code ?? (x instanceof Error ? x.message : "error")}).`); }
    });
  });
  const user = (await currentUser().catch(() => null)) ?? (await tapped);
  const uid = user.uid;
  let home: string | null;
  try {
    lockProgress("Checking your account…");
    home = await homeOf(uid);
  } catch (x) {
    const code = String((x as { code?: string }).code ?? x);
    const denied = /permission/i.test(code);
    const e2 = show(html`${raw(msg(denied ? "This Google account isn't allowed to use this app." : html`Setting up this device needs the internet, and the cloud couldn't be reached (${code}). Check your connection and try again.`, "err"))}
      <div class="lockopts">${raw(denied ? "" : html`<button class="btn pri" type="button" id="lk_r">Try again</button>`)}<button class="btn" type="button" id="lk_o">Sign out</button></div>`);
    e2.querySelector("#lk_r")?.addEventListener("click", () => location.reload());
    e2.querySelector("#lk_o")!.addEventListener("click", async () => { await signOutNow(); location.reload(); });
    return new Promise(() => {});
  }
  let dekRaw: Uint8Array<ArrayBuffer>;
  if (home) {
    const h = home;
    dekRaw = await askPassphrase("Passphrase", "Welcome back. Enter your Akhila Vrutta passphrase to set up this device.", { check: (p) => unlockPass({ uid, home: h }, p) });
  } else {
    const r = await askPassphrase("Create a passphrase",
      "<b>Choose a passphrase.</b> It encrypts everything. Nobody, not Google and not Claude, can recover it, so <b>save it in your password manager</b>. It can be the same as your KP Money Planner passphrase.",
      { create: true, btn: "Create and continue", check: (p) => createHome(uid, p) });
    home = r.home;
    dekRaw = r.dekRaw;
  }
  const mode = await chooseMode(await bioCapable());
  const dev = await applyMode({ uid, home }, mode, dekRaw);
  const dek = await aesKey(dekRaw);
  dekRaw.fill(0);
  toast("This device is set up");
  return { uid, home, dek, mode: dev.mode };
}

/** Re-asks for the passphrase in the lock screen and returns the raw data key (for turning on fingerprint). */
export function confirmPassphrase(s: Session, note: string): Promise<Uint8Array<ArrayBuffer> | null> {
  return new Promise((resolve) => {
    const e = show(html`${raw(msg(note))}<form class="lockf" autocomplete="off">
      <input type="text" name="username" value="akhila-vrutta" autocomplete="username" hidden>
      <label class="lockl" for="lk_p">Passphrase</label><input id="lk_p" type="password" autocomplete="current-password" required>
      <p class="lockm err" id="lk_e" hidden></p>
      <button class="btn pri" type="submit" data-lbl="Continue">Continue</button><button class="btn lockalt" type="button" id="lk_x">Cancel</button></form>`);
    e.querySelector("#lk_x")!.addEventListener("click", () => { closeLock(); resolve(null); });
    e.querySelector("form")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      busy(e, true, "Checking…");
      const r = await unlockPass(s, e.querySelector<HTMLInputElement>("#lk_p")!.value).catch(() => null);
      busy(e, false);
      if (r) { closeLock(); resolve(r); }
      else { const t = e.querySelector<HTMLElement>("#lk_e")!; t.hidden = false; t.textContent = "That passphrase doesn't match."; }
    });
  });
}
