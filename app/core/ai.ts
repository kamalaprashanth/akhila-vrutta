/**
 * Is Claude switched on for this account? The owner and accounts switched on by hand are; everyone else (a
 * public release) isn't. The functions decide (aiStatus); the answer is kept on this device per account so
 * the app knows straight away next time. Local and test builds (no account) have it on.
 */
import { ctx } from "./app.ts";
import { callable } from "./firebase.ts";

const key = (uid: string): string => `av.ai.${uid}`;
export function aiOn(): boolean {
  const uid = ctx.session?.uid;
  if (!uid) return true;
  try { return localStorage.getItem(key(uid)) === "1"; } catch { return false; }
}
/** The app's owner sees Admin (the functions check it again for every admin call). */
export function isOwner(): boolean {
  const uid = ctx.session?.uid;
  if (!uid) return false;
  try { return localStorage.getItem(`av.own.${uid}`) === "1"; } catch { return false; }
}
/** Asks the functions once after unlocking; true when the answer changed what the app shows. */
export async function refreshAi(): Promise<boolean> {
  const uid = ctx.session?.uid;
  if (!uid) return false;
  try {
    const fn = await callable("aiStatus", 20000);
    const d = ((await fn({})).data ?? {}) as { on?: boolean; owner?: boolean };
    const was = `${aiOn()}${isOwner()}`;
    try { localStorage.setItem(key(uid), d.on ? "1" : "0"); localStorage.setItem(`av.own.${uid}`, d.owner ? "1" : "0"); } catch { /* private mode */ }
    return was !== `${!!d.on}${!!d.owner}`;
  } catch { return false; }   // offline: keep what we knew
}
