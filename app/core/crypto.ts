/**
 * Encryption helpers. AES-256-GCM everywhere.
 * - The data key (DEK) is 32 random bytes; it encrypts every record.
 * - The DEK is stored only wrapped: by a key derived from the passphrase (Argon2id, 128 MB, 3 passes; older
 *   wraps used PBKDF2-SHA256 with 600k rounds and are upgraded at the next passphrase unlock), and per
 *   device by a fingerprint secret (WebAuthn PRF, or the Android Keystore).
 * - Each record is bound to its path with additional data, so a record can't be moved to another id.
 */

import { argon2id } from "../vendor/hash-wasm/argon2.ts";

const CR = globalThis.crypto.subtle;
export const TE = new TextEncoder();
export const TD = new TextDecoder();

export const PBKDF2_ITER = 600_000;
export const CHECK_TXT = "akhila-vrutta-check-v1";

export interface Sealed {
  iv: string;
  ct: string;
  /** 1 when the plaintext was gzipped before encrypting */
  z?: 0 | 1;
}

export const rnd = (n: number): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(n));

export function toB64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b: string): Uint8Array<ArrayBuffer> {
  const s = atob(b);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

export async function deriveRaw(pass: string, saltB64: string, iter = PBKDF2_ITER): Promise<Uint8Array<ArrayBuffer>> {
  const base = await CR.importKey("raw", TE.encode(pass.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await CR.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations: iter }, base, 256));
}

/** Imports raw bytes as an AES-GCM key. Non-extractable unless asked. */
export const aesKey = (raw: Uint8Array<ArrayBuffer>, extractable = false): Promise<CryptoKey> =>
  CR.importKey("raw", raw, { name: "AES-GCM" }, extractable, ["encrypt", "decrypt"]);

async function gz(u8: Uint8Array<ArrayBuffer>, dir: "c" | "d"): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([u8]).stream().pipeThrough(dir === "d" ? new DecompressionStream("gzip") : new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const ZIP_OVER = 1024;

export async function seal(key: CryptoKey, plain: Uint8Array<ArrayBuffer>, aad?: string): Promise<Sealed> {
  let body = plain;
  let z: 0 | 1 = 0;
  if (plain.length > ZIP_OVER) {
    const c = await gz(plain, "c");
    if (c.length < plain.length) { body = c; z = 1; }
  }
  const iv = rnd(12);
  const params: AesGcmParams = { name: "AES-GCM", iv };
  if (aad) params.additionalData = TE.encode(aad);
  const ct = new Uint8Array(await CR.encrypt(params, key, body));
  return z ? { iv: toB64(iv), ct: toB64(ct), z } : { iv: toB64(iv), ct: toB64(ct) };
}

export async function open(key: CryptoKey, s: Sealed, aad?: string): Promise<Uint8Array<ArrayBuffer>> {
  const params: AesGcmParams = { name: "AES-GCM", iv: fromB64(s.iv) };
  if (aad) params.additionalData = TE.encode(aad);
  const u = new Uint8Array(await CR.decrypt(params, key, fromB64(s.ct)));
  return s.z ? gz(u, "d") : u;
}

export const sealJSON = (key: CryptoKey, obj: unknown, aad?: string): Promise<Sealed> => seal(key, TE.encode(JSON.stringify(obj)), aad);
export const openJSON = async <T = unknown>(key: CryptoKey, s: Sealed, aad?: string): Promise<T> =>
  JSON.parse(TD.decode(await open(key, s, aad))) as T;

/**
 * The passphrase record kept in the cloud: how the key is derived, a check value and the wrapped data key.
 *   kdf "argon2id": salt (16 bytes), m (KiB), t (passes), p (lanes)
 *   kdf absent or "pbkdf2": salt, iter (PBKDF2-SHA256), the older form
 *   sk 1: a Secret Key is mixed in (HKDF-SHA256 over the derived key and the 128-bit Secret Key), so the
 *         passphrase alone opens nothing; the Secret Key lives only on the owner's devices and Emergency Kit
 */
export interface PassWrap {
  salt: string;
  kdf?: "pbkdf2" | "argon2id";
  iter?: number;
  m?: number;
  t?: number;
  p?: number;
  sk?: 1;
  check: Sealed;
  dek: Sealed;
}
/** Argon2id settings for new wraps: 128 MB of memory, 3 passes, 1 lane (about a second on a phone). */
export const ARGON2 = { m: 131072, t: 3, p: 1 } as const;

/** Argon2id (hash-wasm, bundled), 32 bytes. Settings outside sane bounds are refused (a bad file can't ask for 10 GB). */
export async function argon2Raw(pass: string, saltB64: string, m: number, t: number, p: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!(Number.isInteger(m) && m >= 8192 && m <= 1048576 && Number.isInteger(t) && t >= 1 && t <= 10 && Number.isInteger(p) && p >= 1 && p <= 4)) throw new Error("This key uses settings the app doesn't accept.");
  const out = await argon2id({ password: TE.encode(pass.normalize("NFKC")), salt: fromB64(saltB64), parallelism: p, iterations: t, memorySize: m, hashLength: 32, outputType: "binary" });
  return new Uint8Array(out);
}
/** Asked for when a wrap needs the Secret Key and none was given. */
export class SecretKeyNeeded extends Error { constructor() { super("This needs your Secret Key (it's on your Emergency Kit)."); this.name = "SecretKeyNeeded"; } }

/** The key that opens a wrap, derived from the passphrase the way the wrap says (and the Secret Key, if it has one). */
async function kekFor(pass: string, w: PassWrap, sk?: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  let raw: Uint8Array<ArrayBuffer>;
  if (w.kdf === "argon2id") raw = await argon2Raw(pass, w.salt, w.m!, w.t!, w.p!);
  else if (w.kdf && w.kdf !== "pbkdf2") throw new Error("This key was made by a newer version of the app.");
  else raw = await deriveRaw(pass, w.salt, w.iter ?? PBKDF2_ITER);
  if (!w.sk) return aesKey(raw);
  if (!sk) { raw.fill(0); throw new SecretKeyNeeded(); }
  return aesKey(await mixSecretKey(raw, sk, w.salt));
}
/** HKDF-SHA256 over (passphrase key ‖ Secret Key), salted with the wrap's salt: 32 bytes. */
export async function mixSecretKey(passKey: Uint8Array<ArrayBuffer>, sk: Uint8Array<ArrayBuffer>, saltB64: string): Promise<Uint8Array<ArrayBuffer>> {
  const ikm = new Uint8Array(passKey.length + sk.length);
  ikm.set(passKey); ikm.set(sk, passKey.length);
  const base = await CR.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  ikm.fill(0); passKey.fill(0);
  return new Uint8Array(await CR.deriveBits({ name: "HKDF", hash: "SHA-256", salt: fromB64(saltB64), info: TE.encode("akhila-vrutta secret key v1") }, base, 256));
}

/** An older (PBKDF2) wrap, or Argon2id with lighter settings than today's: re-wrap at the next unlock. */
export const needsUpgrade = (w: PassWrap): boolean => w.kdf !== "argon2id" || (w.m ?? 0) < ARGON2.m || (w.t ?? 0) < ARGON2.t;

/** Wraps the data key under a passphrase (Argon2id; "pbkdf2" only for tests of the older form). */
export async function wrapWithPass(pass: string, dekRaw: Uint8Array<ArrayBuffer>, kdf: "argon2id" | "pbkdf2" = "argon2id", sk?: Uint8Array<ArrayBuffer>): Promise<PassWrap> {
  const salt = toB64(rnd(16));
  const head: Omit<PassWrap, "check" | "dek"> = { ...(kdf === "argon2id" ? { salt, kdf, ...ARGON2 } : { salt, iter: PBKDF2_ITER }), ...(sk ? { sk: 1 as const } : {}) };
  const kek = await kekFor(pass, head as PassWrap, sk);
  return { ...head, check: await seal(kek, TE.encode(CHECK_TXT)), dek: await seal(kek, dekRaw, "dek") };
}

/** Returns the raw data key, or null when the passphrase is wrong. */
export async function unwrapWithPass(pass: string, w: PassWrap, sk?: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  const kek = await kekFor(pass, w, sk);
  try {
    if (TD.decode(await open(kek, w.check)) !== CHECK_TXT) return null;
    return await open(kek, w.dek, "dek");
  } catch {
    return null;
  }
}

/* ---------- the Secret Key: 128 random bits, written for people ---------- */
// Crockford base32 (no I, L, O, U), 26 characters, then 2 check characters; "A1-" says which kind of key.
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const newSecretKey = (): Uint8Array<ArrayBuffer> => rnd(16);
const check2 = (b: Uint8Array): number => b.reduce((s, x, i) => (s * 31 + x * (i + 1)) % 1021, 7) % 1024;
export function formatSecretKey(b: Uint8Array): string {
  let bits = "";
  for (const x of b) bits += x.toString(2).padStart(8, "0");
  bits = bits.padEnd(130, "0");
  let s = "";
  for (let i = 0; i < 130; i += 5) s += B32[parseInt(bits.slice(i, i + 5), 2)];
  const c = check2(b);
  s += B32[c >> 5]! + B32[c & 31]!;
  return `A1-${s.slice(0, 6)}-${s.slice(6, 12)}-${s.slice(12, 18)}-${s.slice(18, 24)}-${s.slice(24)}`;
}
/** Reads a Secret Key as typed (any case, spaces or dashes, O for 0, I or L for 1); null if it isn't one. */
export function parseSecretKey(t: string): Uint8Array<ArrayBuffer> | null {
  let s = t.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length === 30 && s.startsWith("A1")) s = s.slice(2);   // the "A1-" in front is optional
  if (s.length !== 28 || [...s].some((ch) => !B32.includes(ch))) return null;
  let bits = "";
  for (const ch of s.slice(0, 26)) bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const c = check2(b);
  return s.slice(26) === B32[c >> 5]! + B32[c & 31]! ? b : null;
}
