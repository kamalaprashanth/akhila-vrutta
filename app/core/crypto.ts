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
 */
export interface PassWrap {
  salt: string;
  kdf?: "pbkdf2" | "argon2id";
  iter?: number;
  m?: number;
  t?: number;
  p?: number;
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
/** The key that opens a wrap, derived from the passphrase the way the wrap says. */
async function kekFor(pass: string, w: PassWrap): Promise<CryptoKey> {
  if (w.kdf === "argon2id") return aesKey(await argon2Raw(pass, w.salt, w.m!, w.t!, w.p!));
  if (w.kdf && w.kdf !== "pbkdf2") throw new Error("This key was made by a newer version of the app.");
  return aesKey(await deriveRaw(pass, w.salt, w.iter ?? PBKDF2_ITER));
}
/** An older (PBKDF2) wrap, or Argon2id with lighter settings than today's: re-wrap at the next unlock. */
export const needsUpgrade = (w: PassWrap): boolean => w.kdf !== "argon2id" || (w.m ?? 0) < ARGON2.m || (w.t ?? 0) < ARGON2.t;

/** Wraps the data key under a passphrase (Argon2id; "pbkdf2" only for tests of the older form). */
export async function wrapWithPass(pass: string, dekRaw: Uint8Array<ArrayBuffer>, kdf: "argon2id" | "pbkdf2" = "argon2id"): Promise<PassWrap> {
  const salt = toB64(rnd(16));
  const head: Omit<PassWrap, "check" | "dek"> = kdf === "argon2id" ? { salt, kdf, ...ARGON2 } : { salt, iter: PBKDF2_ITER };
  const kek = await kekFor(pass, head as PassWrap);
  return { ...head, check: await seal(kek, TE.encode(CHECK_TXT)), dek: await seal(kek, dekRaw, "dek") };
}

/** Returns the raw data key, or null when the passphrase is wrong. */
export async function unwrapWithPass(pass: string, w: PassWrap): Promise<Uint8Array<ArrayBuffer> | null> {
  const kek = await kekFor(pass, w);
  try {
    if (TD.decode(await open(kek, w.check)) !== CHECK_TXT) return null;
    return await open(kek, w.dek, "dek");
  } catch {
    return null;
  }
}
