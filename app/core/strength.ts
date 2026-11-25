/**
 * Passphrase strength, roughly: how long someone with a stolen copy of the data would need to guess it.
 * Each guess costs the 600,000 PBKDF2 rounds, so we assume a well-equipped attacker manages ~100,000 guesses
 * a second. Words count as ~11 bits each (people pick common words), characters by their mix, with
 * penalties for well-known passwords, repeats and runs. A guide, not a guarantee.
 */
import { html, raw } from "./dom.ts";
const COMMON = ["password", "passphrase", "qwerty", "admin", "welcome", "letmein", "iloveyou", "india", "bharat", "bangalore", "bengaluru", "akhila", "vrutta", "monkey", "dragon", "sunshine", "princess", "football", "cricket", "master", "secret", "abc123", "111111", "123456", "000000"];
const RATE = 1e5;

export interface Strength { bits: number; level: 0 | 1 | 2 | 3; label: string; time: string }

export function estimateBits(p: string): number {
  const s = p.normalize("NFKC"), low = s.toLowerCase();
  if (!s) return 0;
  let pool = 0;
  if (/[a-z]/.test(s)) pool += 26;
  if (/[A-Z]/.test(s)) pool += 26;
  if (/\d/.test(s)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(s)) pool += 33;
  let chars = s.length * Math.log2(pool || 1);
  if (new Set(low).size < s.length / 2) chars *= 0.6;
  if (/(.)\1\1/.test(s)) chars -= 10;
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf)/i.test(s)) chars -= 15;
  for (const w of COMMON) if (low.includes(w)) chars -= 20;
  const words = s.trim().split(/[\s\-_.,]+/).filter((w) => /[a-z]{2,}/i.test(w));
  let est = chars;
  if (words.length >= 2) {
    const extras = (/\d/.test(s) ? 4 : 0) + (/[^a-zA-Z0-9\s\-_.,]/.test(s) ? 4 : 0);
    est = Math.min(chars, words.filter((x) => !COMMON.includes(x.toLowerCase())).length * 11 + extras);
  }
  // one word dressed up with capitals, a symbol and a number or year (Bangalore@2026): a well-known pattern
  const letters = s.match(/[a-z]+/gi) ?? [];
  if (letters.length === 1 && letters[0]!.length <= 14 && /[^a-z]/i.test(s)) est = Math.min(est, 35);
  return Math.max(0, Math.round(est));
}

export function timeToGuess(bits: number): string {
  const sec = 2 ** bits / 2 / RATE;
  if (sec < 60) return "seconds";
  if (sec < 3600) return "minutes";
  if (sec < 86400) return "hours";
  if (sec < 86400 * 31) return "days";
  if (sec < 86400 * 365) return "months";
  const y = sec / (86400 * 365);
  return y < 100 ? `about ${Math.max(1, Math.round(y))} year${Math.round(y) <= 1 ? "" : "s"}` : y < 1e4 ? "centuries" : "longer than anyone will live";
}

export function strength(p: string): Strength {
  const bits = estimateBits(p), sec = 2 ** bits / 2 / RATE, day = 86400, year = 365 * day;
  const level = sec < 30 * day ? 0 : sec < 10 * year ? 1 : sec < 1000 * year ? 2 : 3;
  return { bits, level, label: ["Weak", "Fair", "Good", "Strong"][level]!, time: timeToGuess(bits) };
}

/** A four-bar meter under a passphrase field, updated as it's typed. */
export function attachMeter(input: HTMLInputElement, box: HTMLElement): void {
  const draw = (): void => {
    const v = input.value;
    if (!v) { box.innerHTML = ""; return; }
    const s = strength(v);
    box.className = `pwmeter l${s.level}`;
    box.innerHTML = html`<div class="bars">${raw([0, 1, 2, 3].map((i) => `<i class="${i <= s.level ? "on" : ""}"></i>`).join(""))}</div><div class="pwnote"><b>${s.label}</b> · would take ${s.time} to guess.${s.level < 2 ? " Add another unrelated word or two." : ""}</div>`;
  };
  input.addEventListener("input", draw);
  draw();
}
