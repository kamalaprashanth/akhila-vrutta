/**
 * Encryption helpers. AES-256-GCM everywhere.
 * - The data key (DEK) is 32 random bytes; it encrypts every record.
 * - The DEK is stored only wrapped: by a key derived from the passphrase (PBKDF2-SHA256, 600k rounds),
 *   and per device by a fingerprint secret (WebAuthn PRF).
 * - Each record is bound to its path with additional data, so a record can't be moved to another id.
 */

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

/** The passphrase record kept in the cloud: salt, a check value and the wrapped data key. */
export interface PassWrap {
  salt: string;
  iter: number;
  check: Sealed;
  dek: Sealed;
}

/** Wraps the data key under a new passphrase. */
export async function wrapWithPass(pass: string, dekRaw: Uint8Array<ArrayBuffer>): Promise<PassWrap> {
  const salt = toB64(rnd(16));
  const kek = await aesKey(await deriveRaw(pass, salt));
  return { salt, iter: PBKDF2_ITER, check: await seal(kek, TE.encode(CHECK_TXT)), dek: await seal(kek, dekRaw, "dek") };
}

/** Returns the raw data key, or null when the passphrase is wrong. */
export async function unwrapWithPass(pass: string, w: PassWrap): Promise<Uint8Array<ArrayBuffer> | null> {
  const kek = await aesKey(await deriveRaw(pass, w.salt, w.iter));
  try {
    if (TD.decode(await open(kek, w.check)) !== CHECK_TXT) return null;
    return await open(kek, w.dek, "dek");
  } catch {
    return null;
  }
}
