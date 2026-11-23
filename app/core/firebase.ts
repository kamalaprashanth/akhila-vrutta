/**
 * Firebase, loaded from Google's CDN as ES modules (no npm runtime dependency),
 * configured from window.AV_CONFIG, which the build writes into config.js
 * from the FIREBASE_WEB_CONFIG repository variable.
 */

const SDK = "10.14.1";
const cdn = (m: string) => `https://www.gstatic.com/firebasejs/${SDK}/${m}.js`;

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

type Listener = (user: SignedInUser | null) => void;

// Minimal shapes of the SDK functions we call; the SDK is loaded at run time.
interface AuthModule {
  getAuth(app: unknown): unknown;
  GoogleAuthProvider: new () => unknown;
  signInWithPopup(auth: unknown, provider: unknown): Promise<unknown>;
  signOut(auth: unknown): Promise<void>;
  onAuthStateChanged(auth: unknown, cb: (u: { uid: string } | null) => void): () => void;
}
interface AppModule {
  initializeApp(cfg: FirebaseWebConfig): unknown;
}

export const config = (): AppConfig => window.AV_CONFIG ?? { firebase: null, build: "local" };

let authMod: AuthModule | null = null;
let auth: unknown = null;
let ready: Promise<boolean> | null = null;

/** Loads Firebase once. Resolves false when there is no config (local runs, tests). */
export function initFirebase(): Promise<boolean> {
  if (ready) return ready;
  ready = (async () => {
    const cfg = config().firebase;
    if (!cfg) return false;
    const [appMod, a] = await Promise.all([
      import(/* @vite-ignore */ cdn("firebase-app")) as Promise<AppModule>,
      import(/* @vite-ignore */ cdn("firebase-auth")) as Promise<AuthModule>,
    ]);
    const app = appMod.initializeApp(cfg);
    authMod = a;
    auth = a.getAuth(app);
    return true;
  })();
  return ready;
}

export async function onUser(cb: Listener): Promise<void> {
  if (!(await initFirebase()) || !authMod) {
    cb(null);
    return;
  }
  authMod.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid } : null));
}

export async function signIn(): Promise<void> {
  if (!(await initFirebase()) || !authMod) throw new Error("Firebase isn't configured for this build.");
  await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
}

export async function signOutNow(): Promise<void> {
  if (authMod) await authMod.signOut(auth);
}
