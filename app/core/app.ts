/** What the whole app shares once it's unlocked. */
import type { Session } from "./vault.ts";
import type { Store } from "./store.ts";

export interface Ctx {
  session: Session | null;
  store: Store | null;
  /** Re-renders the current page. */
  rerender(): void;
}

export const ctx: Ctx = { session: null, store: null, rerender: () => {} };
