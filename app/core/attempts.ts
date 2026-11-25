/**
 * Wrong passphrases on this device: after 5 in a row, a wait before the next try (30 s, then doubling up to
 * an hour). It slows guessing through the app only; someone with a stolen copy of the data guesses offline,
 * where only the passphrase's strength (and the 600,000 rounds) count.
 */
const KEY = "av.attempts";
interface State { fails: number; until: number }
const read = (): State => { try { return { fails: 0, until: 0, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") } as State; } catch { return { fails: 0, until: 0 }; } };
const write = (s: State): void => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not kept */ } };

export const FREE_TRIES = 5;
/** Milliseconds still to wait (0 = may try now). */
export const waitLeft = (now = Date.now()): number => Math.max(0, read().until - now);
export const failsSoFar = (): number => read().fails;
/** A wrong passphrase: returns the wait that now applies (ms). */
export function noteWrong(now = Date.now()): number {
  const s = read();
  s.fails += 1;
  const over = s.fails - FREE_TRIES;
  s.until = over >= 0 ? now + Math.min(3600_000, 30_000 * 2 ** over) : 0;
  write(s);
  return Math.max(0, s.until - now);
}
export const noteRight = (): void => { try { localStorage.removeItem(KEY); } catch { /* fine */ } };
export const waitLabel = (ms: number): string => { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`; };
