/**
 * Firebase, loaded from Google's CDN as ES modules (no npm runtime dependency),
 * configured from window.AV_CONFIG, which the build writes into config.js
 * from the FIREBASE_WEB_CONFIG repository variable.
 */

import { isNative, nativeCall } from "./native.ts";

const SDK = "10.14.1";
/** The Android app carries the same SDK files inside it (config.sdkBase), so it opens offline. */
const cdn = (m: string) => `${config().sdkBase ?? `https://www.gstatic.com/firebasejs/${SDK}`}/firebase-${m}.js`;
export const FIREBASE_SDK = SDK;

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
  /** The Android app: where its own copy of the Firebase SDK is, and the web OAuth client for Google sign-in. */
  sdkBase?: string;
  googleClientId?: string;
  /** Firebase App Check: the website proves itself with reCAPTCHA Enterprise; the Android app with Play
   *  Integrity, through our own plugin (with the Android app's id and key). */
  appCheck?: { siteKey?: string; android?: { appId: string; apiKey: string } };
  /** Test builds only: talk to the local Firebase emulators instead of the cloud. */
  emulators?: { auth: string; firestoreHost: string; firestorePort: number; functionsHost?: string; functionsPort?: number };
}

declare global {
  interface Window {
    AV_CONFIG?: AppConfig;
    /** Test builds only: which test account signs in ("owner" by default). */
    AV_TEST_USER?: string;
    /** Cloud tests: a new account also goes through the Secret Key step (as in the real app). */
    AV_FORCE_SK?: boolean;
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
  app: unknown;
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
    const emu = config().emulators;
    if (!emu) await startAppCheck(app, cfg);
    const auth = authMod.getAuth!(app);
    if (emu) authMod.connectAuthEmulator!(auth, emu.auth, { disableWarnings: true });
    // The cache on this device holds only ciphertext, the same as the cloud.
    const db = fs.initializeFirestore!(app, {
      localCache: fs.persistentLocalCache!({ tabManager: fs.persistentMultipleTabManager!() }),
    });
    if (emu) fs.connectFirestoreEmulator!(db, emu.firestoreHost, emu.firestorePort);
    try { await authMod.getRedirectResult!(auth); } catch { /* no redirect pending */ }
    known = new Promise((res) => {
      authMod.onAuthStateChanged!(auth, (u: { uid: string } | null) => {
        current = u ? { uid: u.uid } : null;
        res();
      });
    });
    return { app, auth, authMod, db, fs };
  })());
}

/**
 * App Check: every request to the database and the Claude function carries a token showing it comes from
 * this site or this app. Until enforcement is switched on, a missing token is only counted, so a failure here
 * never stops the app; it's logged.
 */
async function startAppCheck(app: unknown, cfg: FirebaseWebConfig): Promise<void> {
  const ac = config().appCheck;
  if (!ac || (isNative() ? !ac.android : !ac.siteKey)) return;
  try {
    const m = (await import(/* @vite-ignore */ cdn("app-check"))) as Record<string, Fn> & { ReCaptchaEnterpriseProvider: new (k: string) => unknown; CustomProvider: new (o: object) => unknown };
    const provider = isNative()
      ? new m.CustomProvider({
        getToken: async () => {
          const r = await nativeCall<{ token: string; expires: number }>("AkhilaNative", "appCheckToken", { appId: ac.android!.appId, apiKey: ac.android!.apiKey, projectId: cfg.projectId });
          return { token: r.token, expireTimeMillis: r.expires };
        },
      })
      : new m.ReCaptchaEnterpriseProvider(ac.siteKey!);
    m.initializeAppCheck!(app, { provider, isTokenAutoRefreshEnabled: true });
  } catch (e) { console.warn("App Check", e); }
}

/** Cloud Functions live in Mumbai, next to the database. */
export const FUNCTIONS_REGION = "asia-south1";
let fnMod: Promise<Record<string, Fn>> | null = null;

/** A callable Cloud Function, e.g. callable("askClaude", 300000)({ messages }). */
export async function callable(name: string, timeout = 60000): Promise<(data: unknown) => Promise<{ data: unknown }>> {
  const fb = await initFirebase();
  if (!fb) throw new Error("Firebase isn't configured for this build.");
  fnMod ??= import(/* @vite-ignore */ cdn("functions")) as Promise<Record<string, Fn>>;
  const fx = await fnMod;
  const functions = fx.getFunctions!(fb.app, FUNCTIONS_REGION);
  const emu = config().emulators;
  if (emu?.functionsHost && !(functions as { _emulated?: boolean })._emulated) {
    fx.connectFunctionsEmulator!(functions, emu.functionsHost, emu.functionsPort);
    (functions as { _emulated?: boolean })._emulated = true;
  }
  return fx.httpsCallable!(functions, name, { timeout }) as (data: unknown) => Promise<{ data: unknown }>;
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
  if (config().emulators) {
    // Test builds sign in a prepared test account; Google's popup can't run in automated tests.
    const who = window.AV_TEST_USER ?? "owner";
    const r = (await fb.authMod.signInWithEmailAndPassword!(fb.auth, `${who}@test.local`, "test-password-123")) as { user: { uid: string } };
    current = { uid: r.user.uid };
    return current;
  }
  if (isNative()) {
    // Google blocks its sign-in page inside apps: Android's own account picker gives an ID token instead.
    const cid = config().googleClientId;
    if (!cid) throw new Error("This app build has no Google sign-in client.");
    const { idToken } = await nativeCall<{ idToken: string }>("AkhilaNative", "googleSignIn", { serverClientId: cid });
    const cred = (fb.authMod.GoogleAuthProvider as unknown as { credential(id: string): unknown }).credential(idToken);
    const r = (await fb.authMod.signInWithCredential!(fb.auth, cred)) as { user: { uid: string } };
    current = { uid: r.user.uid };
    return current;
  }
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

/** The signed-in Google account's first name (shown in Settings › Account; never the e-mail address). */
export async function userName(): Promise<string> {
  const fb = await initFirebase();
  const n = (fb?.auth as { currentUser?: { displayName?: string | null } } | undefined)?.currentUser?.displayName ?? "";
  return n.split(" ")[0] ?? "";
}

export async function signOutNow(): Promise<void> {
  const fb = await initFirebase();
  if (fb) await fb.authMod.signOut!(fb.auth);
}

/**
 * A short-lived Google access token for one more permission (Google Drive's "files this app made"), for the
 * signed-in account. Web: Google's consent popup through Firebase. Android: Android's own consent screen.
 */
export async function googleAccess(scope: string): Promise<string> {
  const fb = await initFirebase();
  if (!fb) throw new Error("Firebase isn't configured for this build.");
  const user = (fb.auth as { currentUser: { email?: string } | null }).currentUser;
  if (!user) throw new Error("Not signed in.");
  if (isNative()) {
    const r = await nativeCall<{ accessToken: string }>("AkhilaNative", "googleAccess", { scope, account: user.email ?? "" });
    return r.accessToken;
  }
  const p = new fb.authMod.GoogleAuthProvider() as { setCustomParameters(o: object): void; addScope(s: string): void };
  p.addScope(scope);
  p.setCustomParameters({ login_hint: user.email ?? "" });
  const res = await fb.authMod.reauthenticateWithPopup!(user, p);
  const cred = (fb.authMod.GoogleAuthProvider as unknown as { credentialFromResult(r: unknown): { accessToken?: string } | null }).credentialFromResult(res);
  if (!cred?.accessToken) throw new Error("Google didn't give access to Drive.");
  return cred.accessToken;
}
