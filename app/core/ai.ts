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
/** Asks the functions once after unlocking; true when the answer changed what the app shows. */
export async function refreshAi(): Promise<boolean> {
  const uid = ctx.session?.uid;
  if (!uid) return false;
  try {
    const fn = await callable("aiStatus", 20000);
    const on = !!((await fn({})).data as { on?: boolean })?.on;
    const was = aiOn();
    try { localStorage.setItem(key(uid), on ? "1" : "0"); } catch { /* private mode */ }
    return was !== on;
  } catch { return false; }   // offline: keep what we knew
}
