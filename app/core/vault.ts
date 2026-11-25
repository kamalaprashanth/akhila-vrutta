/**
 * The vault: who you are, which home your data lives in, and the data key that opens it.
 *
 * Cloud (Firestore):
 *   users/{uid}            { home }                         which home this account belongs to
 *   homes/{home}           { members: {uid: "owner"}, schema, created }
 *   homes/{home}/keys/{uid} PassWrap                        the data key, wrapped by this member's passphrase
 * This device (IndexedDB):
 *   device   { uid, home, mode, credId?, prfSalt? }
 *   wrap     PassWrap (copy, so the passphrase works offline)
 *   sk       the Secret Key, as written on the Emergency Kit (when it's turned on)
 *   bioDek   the data key wrapped by the fingerprint secret   (mode "bio")
 *   dek      the data key as a non-extractable CryptoKey     (mode "remember")
 */
import { isNative, nativeCall } from "./native.ts";
import { aesKey, formatSecretKey, fromB64, needsUpgrade, open, parseSecretKey, rnd, seal, SecretKeyNeeded, toB64, unwrapWithPass, wrapWithPass, type PassWrap, type Sealed } from "./crypto.ts";
import { IDB } from "./idb.ts";
import { currentUser, initFirebase, signIn, type Fb } from "./firebase.ts";

export type UnlockMode = "bio" | "remember" | "pass";
export const MODE_LABEL: Record<UnlockMode, string> = {
  bio: "Fingerprint or screen lock",
  remember: "Stays unlocked on this device",
  pass: "Passphrase every time",
};

export interface Device {
  uid: string;
  home: string;
  mode: UnlockMode;
  credId?: string;
  prfSalt?: string;
}

export interface Session {
  uid: string;
  home: string;
  dek: CryptoKey;
  mode: UnlockMode;
}

/* ---------- cloud documents ---------- */

async function fb(): Promise<Fb> {
  const f = await initFirebase();
  if (!f) throw new Error("Firebase isn't configured for this build.");
  return f;
}

/** Reads a document, from the server when online, else from this device's cache. */
async function readDoc<T>(...path: string[]): Promise<T | null> {
  const { fs, db } = await fb();
  const ref = fs.doc!(db, ...path);
  let snap;
  try {
    snap = await fs.getDoc!(ref);
  } catch (e) {
    // Only being offline falls back to this device's copy. A refusal (permission-denied) is never "not found".
    if ((e as { code?: string }).code !== "unavailable") throw e;
    snap = await fs.getDocFromCache!(ref).catch(() => null);
  }
  return snap && snap.exists() ? (snap.data() as T) : null;
}

/**
 * Which home this account belongs to, asked of the server itself: setting up a device must never
 * mistake "offline" or "not allowed" for "no data yet" (that would start a second, empty home).
 */
export async function homeOf(uid: string): Promise<string | null> {
  const { fs, db } = await fb();
  const snap = await fs.getDocFromServer!(fs.doc!(db, "users", uid));
  return snap.exists() ? ((snap.data() as { home?: string }).home ?? null) : null;
}
export const passWrapOf = (home: string, uid: string) => readDoc<PassWrap>("homes", home, "keys", uid);

async function savePassWrap(home: string, uid: string, w: PassWrap): Promise<void> {
  const { fs, db } = await fb();
  await fs.setDoc!(fs.doc!(db, "homes", home, "keys", uid), w);
  await IDB.set("wrap", w);
}

/** Creates a new home with this account as its owner, and a fresh data key. */
export async function createHome(uid: string, pass: string): Promise<{ home: string; dekRaw: Uint8Array<ArrayBuffer> }> {
  const { fs, db } = await fb();
  const home = toB64(rnd(15)).replace(/[+/=]/g, "x");
  const dekRaw = rnd(32);
  const w = await wrapWithPass(pass, dekRaw);
  const b = fs.writeBatch!(db);
  b.set(fs.doc!(db, "homes", home), { members: { [uid]: "owner" }, schema: 1, created: fs.serverTimestamp!() });
  b.set(fs.doc!(db, "homes", home, "keys", uid), w);
  b.set(fs.doc!(db, "users", uid), { home });
  await b.commit();
  await IDB.set("wrap", w);
  return { home, dekRaw };
}

/* ---------- the Secret Key on this device ---------- */
/** This device's copy of the Secret Key (formatted), if it has one. */
export const localSecretKey = (): Promise<string | undefined> => IDB.get<string>("sk");
async function skBytes(typed?: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (typed) { const b = parseSecretKey(typed); if (!b) throw new Error("That Secret Key isn't right: check it against your Emergency Kit."); return b; }
  const kept = await IDB.get<string>("sk");
  return kept ? parseSecretKey(kept) ?? undefined : undefined;
}
/** Does the account's key need a Secret Key? */
export async function secretKeyOn(s: { home: string; uid: string }): Promise<boolean> {
  const w = (await passWrapOf(s.home, s.uid).catch(() => null)) ?? (await IDB.get<PassWrap>("wrap"));
  return !!w?.sk;
}
async function currentWrap(s: { home: string; uid: string }): Promise<PassWrap> {
  const w = (await passWrapOf(s.home, s.uid).catch(() => null)) ?? (await IDB.get<PassWrap>("wrap"));
  if (!w) throw new Error("Couldn't read your key. Check your connection.");
  return w;
}
/**
 * Turns the Secret Key on (sk given) or off (null): the data key is re-wrapped under the passphrase with or
 * without it. False when the passphrase is wrong. Records stay as they are.
 */
export async function setSecretKey(s: Session, pass: string, sk: Uint8Array<ArrayBuffer> | null, typedOld?: string): Promise<boolean> {
  const w = await currentWrap(s);
  const raw = await unwrapWithPass(pass, w, await skBytes(typedOld));
  if (!raw) return false;
  await savePassWrap(s.home, s.uid, await wrapWithPass(pass, raw, "argon2id", sk ?? undefined));
  raw.fill(0);
  if (sk) await IDB.set("sk", formatSecretKey(sk)); else await IDB.del("sk");
  return true;
}

/** Re-wraps the data key under a new passphrase (keeping the Secret Key, if it's on). Records stay as they are. */
export async function changePassphrase(s: Session, oldPass: string, newPass: string, typedSk?: string): Promise<boolean> {
  const w = await currentWrap(s), sk = await skBytes(typedSk);
  const raw = await unwrapWithPass(oldPass, w, sk);
  if (!raw) return false;
  await savePassWrap(s.home, s.uid, await wrapWithPass(newPass, raw, "argon2id", w.sk ? sk : undefined));
  raw.fill(0);
  if (typedSk && sk) await IDB.set("sk", formatSecretKey(sk));
  return true;
}

/* ---------- fingerprint (WebAuthn PRF) ---------- */

export const bioCapable = async (): Promise<boolean> => {
  if (isNative()) return nativeCall<{ available: boolean }>("AkhilaNative", "bioAvailable").then((r) => r.available, () => false);
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
};

interface PrfResults { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }

async function prfSecret(credId: string, prfSalt: string): Promise<Uint8Array<ArrayBuffer>> {
  const a = (await navigator.credentials.get({
    publicKey: {
      challenge: rnd(32),
      allowCredentials: [{ type: "public-key", id: fromB64(credId) }],
      userVerification: "required",
      timeout: 60000,
      extensions: { prf: { eval: { first: fromB64(prfSalt) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential;
  const r = (a.getClientExtensionResults() as PrfResults).prf;
  if (!r?.results?.first) throw new Error("This phone's fingerprint unlock doesn't support the needed feature (PRF).");
  return new Uint8Array(r.results.first);
}

/* The Android app: a 32-byte secret kept under a key in the phone's secure hardware that only a strong
   fingerprint opens, and that Android deletes when a new fingerprint is added. It wraps the data key the
   same way the WebAuthn secret does on the web. */
const ANDROID = "android-keystore";
async function nativeSecret(method: "bioEnroll" | "bioSecret"): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const { secret } = await nativeCall<{ secret: string }>("AkhilaNative", method);
    return fromB64(secret);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "cancelled") throw Object.assign(new Error("cancelled"), { name: "NotAllowedError" });
    if (code === "changed") throw Object.assign(new Error("A fingerprint was added to this phone, so fingerprint unlock was switched off. Enter your passphrase, then turn it on again in Settings."), { name: "BioChanged" });
    throw e;
  }
}

async function bioEnroll(dekRaw: Uint8Array<ArrayBuffer>): Promise<{ credId: string; prfSalt: string }> {
  if (isNative()) {
    const secret = await nativeSecret("bioEnroll");
    await IDB.set("bioDek", await seal(await aesKey(secret), dekRaw, "dek"));
    secret.fill(0);
    return { credId: ANDROID, prfSalt: ANDROID };
  }
  const salt = rnd(32);
  const c = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Akhila Vrutta", id: location.hostname },
      user: { id: rnd(16), name: "akhila-vrutta", displayName: "Akhila Vrutta" },
      challenge: rnd(32),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential;
  const ext = (c.getClientExtensionResults() as PrfResults).prf;
  if (!ext || ext.enabled === false) throw new Error("This device's fingerprint unlock doesn't support the needed feature (PRF).");
  const m = { credId: toB64(new Uint8Array(c.rawId)), prfSalt: toB64(salt) };
  const secret = ext.results?.first ? new Uint8Array(ext.results.first) : await prfSecret(m.credId, m.prfSalt);
  await IDB.set("bioDek", await seal(await aesKey(secret), dekRaw, "dek"));
  secret.fill(0);
  return m;
}

/** Sets how this device unlocks. `dekRaw` is needed for fingerprint and stay-unlocked. */
export async function setMode(dev: Omit<Device, "mode">, mode: UnlockMode, dekRaw?: Uint8Array<ArrayBuffer>): Promise<Device> {
  let next: Device = { uid: dev.uid, home: dev.home, mode };
  if (mode === "bio") {
    if (!dekRaw) throw new Error("Passphrase needed");
    next = { ...next, ...(await bioEnroll(dekRaw)) };
    await IDB.del("dek");
  } else if (mode === "remember") {
    if (!dekRaw) throw new Error("Passphrase needed");
    await IDB.set("dek", await aesKey(dekRaw));
    await IDB.del("bioDek");
  } else {
    await IDB.del("dek");
    await IDB.del("bioDek");
  }
  if (mode !== "bio" && isNative()) await nativeCall("AkhilaNative", "bioForget").catch(() => {});
  await IDB.set("device", next);
  return next;
}

export const deviceInfo = () => IDB.get<Device>("device");

/* ---------- unlocking ---------- */

export async function unlockBio(dev: Device): Promise<CryptoKey> {
  if (!dev.credId || !dev.prfSalt) throw new Error("Fingerprint isn't set up on this device.");
  const wrapped = await IDB.get<Sealed>("bioDek");
  if (!wrapped) throw new Error("Fingerprint isn't set up on this device.");
  const secret = dev.credId === ANDROID ? await nativeSecret("bioSecret") : await prfSecret(dev.credId, dev.prfSalt);
  const raw = await open(await aesKey(secret), wrapped, "dek");
  secret.fill(0);
  const key = await aesKey(raw);
  raw.fill(0);
  return key;
}

export const unlockRemembered = () => IDB.get<CryptoKey>("dek");

/** Unwraps the data key with the passphrase; uses the cloud copy, or this device's copy offline. */
export async function unlockPass(dev: { uid: string; home: string }, pass: string, typedSk?: string): Promise<Uint8Array<ArrayBuffer> | null> {
  let w: PassWrap | null | undefined = null;
  try { w = await passWrapOf(dev.home, dev.uid); } catch { /* offline */ }
  if (w) await IDB.set("wrap", w);
  else w = await IDB.get<PassWrap>("wrap");
  if (!w) throw new Error("Couldn't read your key. Connect to the internet once and try again.");
  // a Secret Key: the one typed now (from the Emergency Kit), or this device's copy; none → SecretKeyNeeded
  const sk = await skBytes(typedSk);
  const raw = await unwrapWithPass(pass, w, sk);
  if (raw && typedSk && sk) await IDB.set("sk", formatSecretKey(sk));   // this device remembers it from now on
  // an older (PBKDF2) wrap: re-wrapped with Argon2id now, while the passphrase is at hand (best effort)
  if (raw && needsUpgrade(w)) await savePassWrap(dev.home, dev.uid, await wrapWithPass(pass, raw, "argon2id", w.sk ? sk : undefined)).catch((e) => console.warn("key upgrade", e));
  return raw;
}

export { currentUser, signIn, SecretKeyNeeded };

/** Removes everything this device knows (the cloud copy stays). */
export async function forgetDevice(): Promise<void> {
  await IDB.clear();
}
