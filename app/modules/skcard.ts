/** Settings › Secret Key: turn it on (with the Emergency Kit), download the kit again, or turn it off. */
import { html, raw, toast } from "../core/dom.ts";
import { ctx } from "../core/app.ts";
import { formatSecretKey, newSecretKey, parseSecretKey, SecretKeyNeeded } from "../core/crypto.ts";
import { saveBlob } from "../core/files.ts";
import { kitPdf } from "../core/kit.ts";
import { localSecretKey, secretKeyOn, setSecretKey } from "../core/vault.ts";

const KIT_NAME = "Akhila Vrutta Emergency Kit.pdf";
const account = (): string => `UID ...${(ctx.session?.uid ?? "").slice(-7)}`;

export function skCard(): string {
  if (!ctx.session) return "";
  return html`<section class="card" id="skCard"><h2>Secret Key</h2><div id="skBody"><p class="note">Checking…</p></div><div id="skArea"></div></section>`;
}

export function wireSk(root: HTMLElement): void {
  const card = root.querySelector<HTMLElement>("#skCard"), s = ctx.session;
  if (!card || !s) return;
  const body = card.querySelector<HTMLElement>("#skBody")!, area = card.querySelector<HTMLElement>("#skArea")!;
  const err = (e: unknown): string => (e instanceof Error ? e.message : String(e));
  const download = async (key: string): Promise<void> => {
    const where = await saveBlob(KIT_NAME, "application/pdf", new Blob([kitPdf({ key, account: account(), made: new Date() })], { type: "application/pdf" }));
    toast(`${where}. Print it and keep it at home.`);
  };

  void (async () => {
    const on = await secretKeyOn(s).catch(() => false), here = await localSecretKey();
    body.innerHTML = on
      ? html`<p><b>On.</b> Your data opens only with your passphrase and your Secret Key.</p>
        <p class="note">${here ? "This device remembers the key." : "This device doesn't have the key yet: it was turned on elsewhere. You'll be asked for it the next time you use your passphrase here."}</p>
        <div class="btns">${raw(here ? '<button class="btn" type="button" id="skKit">Download Emergency Kit again</button>' : "")}<button class="btn ghost" type="button" id="skOff">Turn off</button></div>`
      : html`<p>A second, random key that works with your passphrase. Your data opens only with <b>both</b>, so even someone who steals the encrypted data and guesses your passphrase still can't read it.</p>
        <ol class="skl"><li>This phone and laptop remember it, so unlocking stays the same: fingerprint or passphrase.</li><li>On a <b>new</b> phone or computer, or to restore a backup there, you type it in once (or scan it).</li><li>Keep the <b>Emergency Kit</b>, a one-page PDF with the key, printed at home.</li></ol>
        <div class="bkwarn"><b>If you lose the Emergency Kit and every device that remembers the key, your data can't be opened by anyone.</b></div>
        <div class="btns"><button class="btn pri" type="button" id="skOn">Turn on Secret Key</button></div>`;
    body.querySelector("#skKit")?.addEventListener("click", () => void download(here!).catch((e) => toast(`Couldn't make the kit: ${err(e)}`)));
    body.querySelector("#skOn")?.addEventListener("click", () => turnOn());
    body.querySelector("#skOff")?.addEventListener("click", () => turnOff());
  })();

  function turnOn(): void {
    const bytes = newSecretKey(), key = formatSecretKey(bytes);
    area.innerHTML = html`<div class="bkstep"><p><b>Your Secret Key</b></p><div class="skkey" id="skKey">${key}</div>
      <p class="note" style="text-align:center">Only on your devices and your Emergency Kit. Never sent anywhere.</p>
      <div class="btns"><button class="btn pri" type="button" id="skDl">Download Emergency Kit (PDF)</button><button class="btn" type="button" id="skCopy">Copy</button></div>
      <form class="inl" id="skF" autocomplete="off"><input type="text" name="username" value="akhila-vrutta" autocomplete="username" hidden>
        <label for="skLast">To confirm you've saved it, type its last 4 characters</label><input id="skLast" type="text" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="4" class="skin" required>
        <label for="skPass">Your passphrase</label><input id="skPass" type="password" autocomplete="current-password" required>
        <div class="btns"><button class="btn pri" type="submit">Done: turn it on</button><button class="btn ghost" type="button" id="skX">Cancel</button></div></form></div>`;
    let saved = false;
    area.querySelector("#skX")!.addEventListener("click", () => { area.innerHTML = ""; });
    area.querySelector("#skDl")!.addEventListener("click", () => void download(key).then(() => { saved = true; }, (e) => toast(`Couldn't make the kit: ${err(e)}`)));
    area.querySelector("#skCopy")!.addEventListener("click", () => void navigator.clipboard?.writeText(key).then(() => toast("Copied. Paste it somewhere safe, then clear the clipboard."), () => toast("Couldn't copy; write it down instead.")));
    area.querySelector("form")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const last = area.querySelector<HTMLInputElement>("#skLast")!.value.trim().toUpperCase();
      if (last !== key.slice(-4)) return toast("Those aren't the last 4 characters. Check the key you saved.");
      if (!saved) toast("Tip: download the Emergency Kit too, and print it.");
      const b = area.querySelector<HTMLButtonElement>("#skF .btn.pri")!;
      b.disabled = true; b.textContent = "Turning it on…";
      try {
        if (await setSecretKey(s!, area.querySelector<HTMLInputElement>("#skPass")!.value, bytes)) { area.innerHTML = ""; toast("Secret Key is on"); ctx.rerender(); return; }
        toast("That passphrase doesn't match.");
      } catch (e) { toast(err(e)); }
      b.disabled = false; b.textContent = "Done: turn it on";
    });
  }

  function turnOff(): void {
    area.innerHTML = html`<form class="inl bkstep" id="skOffF" autocomplete="off"><input type="text" name="username" value="akhila-vrutta" autocomplete="username" hidden>
      <p>Turning it off means your passphrase alone opens your data again.</p>
      <label for="skPass2">Your passphrase</label><input id="skPass2" type="password" autocomplete="current-password" required>
      <div id="skOldW" hidden><label for="skOld">Secret Key</label><input id="skOld" type="text" autocomplete="off" spellcheck="false" class="skin" placeholder="A1-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXX"></div>
      <div class="btns"><button class="btn danger" type="submit">Turn off</button><button class="btn ghost" type="button" id="skX">Cancel</button></div></form>`;
    area.querySelector("#skX")!.addEventListener("click", () => { area.innerHTML = ""; });
    area.querySelector("form")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const oldW = area.querySelector<HTMLElement>("#skOldW")!, old = area.querySelector<HTMLInputElement>("#skOld")!.value.trim();
      if (!oldW.hidden && !parseSecretKey(old)) return toast("That Secret Key isn't right: check it against your Emergency Kit.");
      try {
        if (await setSecretKey(s!, area.querySelector<HTMLInputElement>("#skPass2")!.value, null, oldW.hidden ? undefined : old)) { area.innerHTML = ""; toast("Secret Key is off"); ctx.rerender(); return; }
        toast("That passphrase doesn't match.");
      } catch (e) {
        if (e instanceof SecretKeyNeeded) { oldW.hidden = false; return toast("This device doesn't have the key: type it from your Emergency Kit."); }
        toast(err(e));
      }
    });
  }
}
