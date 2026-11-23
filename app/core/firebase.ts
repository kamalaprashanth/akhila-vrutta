/**
 * Firebase, loaded from Google's CDN as ES modules (no npm runtime dependency),
 * configured from window.AV_CONFIG, which the build writes into config.js
 * from the FIREBASE_WEB_CONFIG repository variable.
 */

const SDK = "10.14.1";
const cdn = (m: string) => `https://www.gstatic.com/firebasejs/${SDK}/firebase-${m}.js`;

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  [k: string]: string;
}

export interface AppConfig {
  firebase: FirebaseWebConfig | null;
  /** Commit the build came from, shown in Settings. */
  build: string;
}

declare global {
  interface Window {
    AV_CONFIG?: AppConfig;
  }
}

export interface SignedInUser {
  uid: string;
}

/* The SDK is loaded at run time; we call it through these loose module shapes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
export type FsModule = Record<string, Fn>;
type AuthModule = Record<string, Fn> & { GoogleAuthProvider: new () => { setCustomParameters(p: object): void } };

export const config = (): AppConfig => window.AV_CONFIG ?? { firebase: null, build: "local" };

export interface Fb {
  auth: unknown;
  authMod: AuthModule;
  db: unknown;
  fs: FsModule;
}

let ready: Promise<Fb | null> | null = null;
let current: SignedInUser | null = null;
let known: Promise<void> | null = null;

/** Loads Firebase once. Resolves null when there is no config (local runs, tests). */
export function initFirebase(): Promise<Fb | null> {
  return (ready ??= (async () => {
    const cfg = config().firebase;
    if (!cfg) return null;
    const [appMod, authMod, fs] = await Promise.all([
      import(/* @vite-ignore */ cdn("app")) as Promise<Record<string, Fn>>,
      import(/* @vite-ignore */ cdn("auth")) as Promise<AuthModule>,
      import(/* @vite-ignore */ cdn("firestore")) as Promise<FsModule>,
    ]);
    const app = appMod.initializeApp!(cfg);
    const auth = authMod.getAuth!(app);
    // The cache on this device holds only ciphertext, the same as the cloud.
    const db = fs.initializeFirestore!(app, {
      localCache: fs.persistentLocalCache!({ tabManager: fs.persistentMultipleTabManager!() }),
    });
    try { await authMod.getRedirectResult!(auth); } catch { /* no redirect pending */ }
    known = new Promise((res) => {
      authMod.onAuthStateChanged!(auth, (u: { uid: string } | null) => {
        current = u ? { uid: u.uid } : null;
        res();
      });
    });
    return { auth, authMod, db, fs };
  })());
}

/** The signed-in user once Firebase has decided, or null. */
export async function currentUser(): Promise<SignedInUser | null> {
  if (!(await initFirebase())) return null;
  await known;
  return current;
}

export async function onUser(cb: (u: SignedInUser | null) => void): Promise<void> {
  const fb = await initFirebase();
  if (!fb) { cb(null); return; }
  fb.authMod.onAuthStateChanged!(fb.auth, (u: { uid: string } | null) => cb(u ? { uid: u.uid } : null));
}

export async function signIn(): Promise<SignedInUser | null> {
  const fb = await initFirebase();
  if (!fb) throw new Error("Firebase isn't configured for this build.");
  const p = new fb.authMod.GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  try {
    const r = (await fb.authMod.signInWithPopup!(fb.auth, p)) as { user: { uid: string } };
    current = { uid: r.user.uid };
    return current;
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (/popup-blocked|operation-not-supported/.test(code)) {
      await fb.authMod.signInWithRedirect!(fb.auth, p);
      return null;
    }
    throw e;
  }
}

export async function signOutNow(): Promise<void> {
  const fb = await initFirebase();
  if (fb) await fb.authMod.signOut!(fb.auth);
}
