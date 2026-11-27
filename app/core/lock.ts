/** The lock screen: first-time setup on a device, and unlocking every time the app opens. */
import { lotus } from "./logo.ts";
import { html, raw, toast } from "./dom.ts";
import { formatSecretKey, newSecretKey, parseSecretKey, SecretKeyNeeded } from "./crypto.ts";
import { saveBlob } from "./files.ts";
import { kitPdf } from "./kit.ts";
import { attachMeter, strength } from "./strength.ts";
import { failsSoFar, noteRight, noteWrong, waitLabel, waitLeft } from "./attempts.ts";
import { aesKey } from "./crypto.ts";
import {
  bioCapable, createHome, currentUser, deviceInfo, forgetDevice, homeOf, setMode, setSecretKey, signIn,
  unlockBio, unlockPass, unlockRemembered, type Device, type Session, type UnlockMode,
} from "./vault.ts";
import { config, signOutNow, type SignedInUser } from "./firebase.ts";
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
  el.innerHTML = html`<div class="lockhero"><svg class="lockrings" viewBox="-80 -80 560 560" aria-hidden="true"><circle cx="200" cy="200" r="110"/><circle cx="200" cy="200" r="160"/><circle cx="200" cy="200" r="210"/><circle cx="200" cy="200" r="260"/></svg>${raw(lotus(120, "onDark", true, "Akhila Vrutta"))}<h2 class="lockt">Akhila Vrutta</h2><p class="locktag">Your whole life, in one private place</p></div>
    <div class="lockc">${raw(inner)}<p class="locksec"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3"/></svg>End-to-end encrypted · zero-knowledge</p>
      <nav class="lockfoot" aria-label="About the app"><a href="/help" target="_blank" rel="noopener">Help</a><a href="/privacy" target="_blank" rel="noopener">Privacy</a><a href="/terms" target="_blank" rel="noopener">Terms</a></nav></div>`;
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
  check(p: string, sk?: string): Promise<T | null>;
}

function askPassphrase<T>(title: string, note: string, o: AskOpts<T>): Promise<T> {
  return new Promise((resolve) => {
    const btn = o.btn ?? "Unlock";
    const e = show(html`${raw(msg(note))}<form class="lockf" autocomplete="off">
      <input type="text" name="username" value="akhila-vrutta" autocomplete="username" hidden>
      <label class="lockl" for="lk_p">${title}</label>
      <input id="lk_p" type="password" autocomplete="${o.create ? "new-password" : "current-password"}" required>
      ${raw(o.create ? html`<div id="lk_m"></div><label class="lockl" for="lk_p2">Type it again</label><input id="lk_p2" type="password" autocomplete="new-password" required>` : "")}
      ${raw(o.create ? "" : skField())}
      <p class="lockm err" id="lk_e" hidden></p>
      <button class="btn pri" type="submit" data-lbl="${btn}">${btn}</button></form>
      ${raw(o.create ? html`<p class="lockm small">Tip: 5 or more unrelated words, like <i>mango kite river seventy lamp</i>. Write it down and keep it at home: nobody can recover it for you.</p>`
        : html`<div class="lockmore"><a href="/help#q-forgot" target="_blank" rel="noopener">Forgot your passphrase?</a><button type="button" class="lockalt" id="lk_out">Use another Google account</button></div>`)}`);
    e.querySelector("#lk_out")?.addEventListener("click", async () => { await signOutNow().catch(() => {}); location.reload(); });
    const err = e.querySelector<HTMLElement>("#lk_e")!;
    const pass = e.querySelector<HTMLInputElement>("#lk_p")!, go = e.querySelector<HTMLButtonElement>(".btn.pri")!;
    const fail = (t: string) => { err.hidden = false; err.textContent = t; };
    if (o.create) attachMeter(pass, e.querySelector<HTMLElement>("#lk_m")!);
    const sk = wireSkField(e);
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
      try { r = await o.check(p, sk.value()); } catch (x) {
        busy(e, false);
        if (x instanceof SecretKeyNeeded) { sk.show(); return fail("This account also needs its Secret Key. It's on your Emergency Kit."); }
        return fail(x instanceof Error ? x.message : "Something went wrong.");
      }
      busy(e, false);
      if (r) { if (!o.create) noteRight(); clearTimeout(timer); resolve(r); return; }
      if (!o.create) { noteWrong(); if (hold()) return; }
      fail(o.wrong ?? (sk.shown() ? "That passphrase or Secret Key doesn't match. Try again." : "That passphrase doesn't match. Try again.")); pass.select();
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
  const keyRaw = await askPassphrase("Passphrase", "Enter your passphrase to open your data.", { check: (p, sk) => unlockPass(dev, p, sk) });
  const key = await aesKey(keyRaw);
  if (dev.mode === "remember") await setMode(dev, "remember", keyRaw);
  if (redo) { const m = await chooseMode(await bioCapable()); dev = await applyMode(dev, m, keyRaw); }
  keyRaw.fill(0);
  return done(key);
}

async function setup(): Promise<Session> {
  const pt = (d: string, b: string, t: string): string => html`<div class="lockpt"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg></span><p><b>${b}</b> ${t}</p></div>`;
  const e = show(html`<div class="lockpts">${raw(pt("M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3", "Only you can read it.", "Everything is encrypted on your device first; we never see your data or your passphrase."))}
    ${raw(pt("M3 5h18v16H3zM3 10h18", "One place for everything.", "Bills and budgets, home jobs and warranties, health records, papers, habits."))}
    ${raw(pt("M7 3h7l4 4v14H7zM14 3v4h4", "Your files stay in your Google Drive,", "encrypted. Sign in with Google so the app can keep them there."))}</div>
    <div class="lockopts"><button class="btn pri lockg" type="button" id="lk_g" data-lbl="Continue with Google"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2z" fill="#4285F4"/><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34A853"/><path d="M6.4 14a6 6 0 0 1 0-4V7.4H3.1a10 10 0 0 0 0 9.2z" fill="#FBBC05"/><path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1z" fill="#EA4335"/></svg>Continue with Google</button></div>
    <p class="lockm small">By continuing you agree to the <a href="/terms" target="_blank" rel="noopener">Terms</a> and the <a href="/privacy" target="_blank" rel="noopener">Privacy policy</a>. New here? <a href="/help" target="_blank" rel="noopener">How it works</a>.</p>
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
  const fresh = !home;
  if (home) {
    const h = home;
    dekRaw = await askPassphrase("Passphrase", "Welcome back. Enter your Akhila Vrutta passphrase to set up this device.", { check: (p, sk) => unlockPass({ uid, home: h }, p, sk) });
  } else {
    let pass = "";
    const r = await askPassphrase("Create a passphrase",
      "<b>Step 1 of 3 · Choose a passphrase.</b> It encrypts everything. Nobody, not Google and not us, can recover or reset it, so <b>save it in your password manager</b>.",
      { create: true, btn: "Create and continue", check: (p) => { pass = p; return createHome(uid, p); } });
    home = r.home;
    dekRaw = r.dekRaw;
    // Step 2: every new account gets a Secret Key, saved in its Emergency Kit before going on
    if (!config().emulators || window.AV_FORCE_SK) await secretKeyStep(uid, home, pass);
    pass = "";
  }
  const mode = await chooseMode(await bioCapable());
  const dev = await applyMode({ uid, home }, mode, dekRaw);
  const dek = await aesKey(dekRaw);
  dekRaw.fill(0);
  toast("This device is set up");
  return { uid, home, dek, mode: dev.mode, ...(fresh ? { fresh: true } : {}) };
}

/** Setup step 2: the Secret Key and its Emergency Kit. Can't be skipped: the kit is how a new phone gets in. */
function secretKeyStep(uid: string, home: string, pass: string): Promise<void> {
  const bytes = newSecretKey(), key = formatSecretKey(bytes);
  return new Promise((resolve) => {
    const e = show(html`${raw(msg("<b>Step 2 of 3 · Save your Emergency Kit.</b> Your Secret Key is mixed into your passphrase: a stolen passphrase alone opens nothing. It's kept only on your devices and in this kit, so print the kit and keep it at home; it's how you get in on a new phone."))}
      <div class="skkey" id="lk_key">${key}</div>
      <div class="lockopts"><button class="btn pri" type="button" id="lk_kit">Download Emergency Kit (PDF)</button></div>
      <form class="lockf" autocomplete="off" id="lk_skf"><label class="lockl" for="lk_last">Then type its last 4 characters</label>
        <input id="lk_last" type="text" class="skin" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" required>
        <p class="lockm err" id="lk_e" hidden></p>
        <button class="btn" type="submit" id="lk_skgo" data-lbl="Continue" disabled>Continue</button></form>`);
    const fail = (t: string) => { const x = e.querySelector<HTMLElement>("#lk_e")!; x.hidden = false; x.textContent = t; };
    const go = e.querySelector<HTMLButtonElement>("#lk_skgo")!;
    e.querySelector("#lk_kit")!.addEventListener("click", () => void (async () => {
      try {
        const where = await saveBlob("Akhila Vrutta Emergency Kit.pdf", "application/pdf", new Blob([kitPdf({ key, account: `UID ...${uid.slice(-7)}`, made: new Date() })], { type: "application/pdf" }));
        toast(`${where}. Print it and keep it at home.`);
        go.disabled = false; go.classList.add("pri");
      } catch (x) { fail(`Couldn't make the kit: ${x instanceof Error ? x.message : "error"}`); }
    })());
    e.querySelector("form")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (e.querySelector<HTMLInputElement>("#lk_last")!.value.trim().toUpperCase() !== key.slice(-4)) return fail("Those aren't the last 4 characters of your Secret Key.");
      go.disabled = true; go.textContent = "Saving…";
      try {
        if (await setSecretKey({ uid, home } as Session, pass, bytes)) { bytes.fill(0); resolve(); return; }
        fail("Couldn't turn the Secret Key on. Try again.");
      } catch (x) { fail(x instanceof Error ? x.message : "Couldn't save. Check your connection and try again."); }
      go.disabled = false; go.textContent = "Continue";
    });
  });
}

/** Re-asks for the passphrase in the lock screen and returns the raw data key (for turning on fingerprint). */
export function confirmPassphrase(s: Session, note: string): Promise<Uint8Array<ArrayBuffer> | null> {
  return new Promise((resolve) => {
    const e = show(html`${raw(msg(note))}<form class="lockf" autocomplete="off">
      <input type="text" name="username" value="akhila-vrutta" autocomplete="username" hidden>
      <label class="lockl" for="lk_p">Passphrase</label><input id="lk_p" type="password" autocomplete="current-password" required>
      ${raw(skField())}
      <p class="lockm err" id="lk_e" hidden></p>
      <button class="btn pri" type="submit" data-lbl="Continue">Continue</button><button class="btn lockalt" type="button" id="lk_x">Cancel</button></form>`);
    e.querySelector("#lk_x")!.addEventListener("click", () => { closeLock(); resolve(null); });
    const sk = wireSkField(e);
    e.querySelector("form")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      busy(e, true, "Checking…");
      const t = e.querySelector<HTMLElement>("#lk_e")!;
      const r = await unlockPass(s, e.querySelector<HTMLInputElement>("#lk_p")!.value, sk.value()).catch((x) => {
        if (x instanceof SecretKeyNeeded) sk.show();
        t.hidden = false; t.textContent = x instanceof SecretKeyNeeded ? "This also needs your Secret Key (on your Emergency Kit)." : x instanceof Error ? x.message : "Something went wrong.";
        return undefined;
      });
      busy(e, false);
      if (r) { closeLock(); resolve(r); }
      else if (r === null) { t.hidden = false; t.textContent = sk.shown() ? "That passphrase or Secret Key doesn't match." : "That passphrase doesn't match."; }
    });
  });
}

/* ---------- the Secret Key field (shown when an account needs it on this device) ---------- */
function skField(): string {
  return html`<div id="lk_skw" hidden><label class="lockl" for="lk_sk">Secret Key</label>
    <input id="lk_sk" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="A1-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXX" class="skin">
    ${raw("BarcodeDetector" in window ? html`<label class="btn" for="lk_scan">📷 Scan the Emergency Kit</label><input id="lk_scan" type="file" accept="image/*" capture="environment" hidden>` : "")}
    <p class="lockm small">This device will remember it, so you won't be asked again here.</p></div>`;
}
function wireSkField(e: HTMLElement): { value(): string | undefined; show(): void; shown(): boolean } {
  const w = e.querySelector<HTMLElement>("#lk_skw"), inp = e.querySelector<HTMLInputElement>("#lk_sk");
  e.querySelector<HTMLInputElement>("#lk_scan")?.addEventListener("change", async (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f || !inp) return;
    try {
      const D = (window as unknown as { BarcodeDetector: new (o: object) => { detect(i: ImageBitmap): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      const found = await new D({ formats: ["qr_code"] }).detect(await createImageBitmap(f));
      const v = found.map((x) => x.rawValue).find((x) => parseSecretKey(x));
      if (v) inp.value = formatSecretKey(parseSecretKey(v)!); else toast("No Secret Key found in that photo. Type it instead.");
    } catch { toast("Couldn't read that photo. Type the key instead."); }
  });
  return {
    value: () => (w && !w.hidden && inp?.value.trim() ? inp.value.trim() : undefined),
    show: () => { if (w) { w.hidden = false; inp?.focus(); } },
    shown: () => !!w && !w.hidden,
  };
}
