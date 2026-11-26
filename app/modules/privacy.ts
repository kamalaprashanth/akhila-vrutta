/** Settings › Privacy & security: how the data is protected, in plain words (approved design, 26 Nov 2026). */
import { html, raw } from "../core/dom.ts";
import { aiOn } from "../core/ai.ts";

const ROW = (icon: string, title: string, text: string): string => html`<div class="pvrow"><span class="pvic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg></span><span><b>${title}</b><span>${text}</span></span></div>`;

export function privacyCard(): string {
  return html`<section class="card pv" id="pvCard">
    <h2>Zero-knowledge. Encrypted end to end.</h2>
    <p>Your data is encrypted on your device before it leaves it. The cloud stores only ciphertext, and we never hold your keys, so we can't read your data, hand it over, or leak it in a breach.</p>
    <div class="pvbadges"><span>AES-256-GCM</span><span>Argon2id</span><span>128-bit Secret Key</span><span>TLS</span></div>
    <h3>How it works</h3>
    ${raw(ROW("M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3", "Sealed with AES-256-GCM", "The authenticated cipher banks and governments rely on. Every record and file; any tampering is detected."))}
    ${raw(ROW("M4 12h4l2-5 4 10 2-5h4", "Passphrase hardened with Argon2id", "128 MB of memory per guess, the Password Hashing Competition winner. Brute force is impractical."))}
    ${raw(ROW("M8 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 12h9M18 12v3M21 12v2", "128-bit Secret Key", "Made on your device and mixed into your key. A leaked passphrase alone opens nothing."))}
    ${raw(ROW("M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z", "Locked down on the phone", "Fingerprint unlock, auto-lock after a minute, no screenshots or app previews."))}
    <h3>You stay in control</h3>
    ${raw(aiOn() ? html`<p class="pvp"><b>Ask the advisor</b> and <b>Read with Claude</b> are the only times data leaves readable: just the text needed, over an encrypted connection, never stored.</p>` : "")}
    <p class="pvp">Files you export or share leave the vault unencrypted, so the app tells you every time. We can't reset your passphrase: keep your Emergency Kit safe.</p>
  </section>`;
}
