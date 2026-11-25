import { test } from "node:test";
import assert from "node:assert/strict";
import { argon2id } from "../../app/vendor/hash-wasm/argon2.ts";
import { aesKey, ARGON2, argon2Raw, needsUpgrade, rnd, unwrapWithPass, wrapWithPass, type PassWrap } from "../../app/core/crypto.ts";
import { makeBackup, openBackup, readOutside } from "../../app/core/backup.ts";

const hex = (password: string, salt: string, p: number, t: number, m: number, len: number) =>
  argon2id({ password, salt, parallelism: p, iterations: t, memorySize: m, hashLength: len, outputType: "hex" });

test("Argon2id gives the published answers (hash-wasm's test vectors, from the reference implementation)", async () => {
  assert.equal(await hex("a", "abcdefgh", 1, 2, 16, 16), "f94aa50873d67fdd589d6774b87c0634");
  assert.equal(await hex("text demo", "123456789", 7, 20, 56, 32), "ec2f7a502b4bfe7dc758c4c5120c7420830d42efdc7a78971743649b30cafb15");
  assert.equal(await hex("text demo", "123456789", 2, 1, 64, 32), "b3f9d902f65bd329cf0810c78b19c746b6f46fbb8243647a8942ab83b6850d47");
  assert.equal(await hex("abc", "1234567812345678", 1, 1, 8, 4), "ffde3f6a");
  assert.equal(await hex("abc", "12345678", 3, 5, 31, 18), "4e37e561150881c66096b17bc6a326e37e87");
});

test("new passphrase locks are Argon2id, 128 MB, 3 passes; wrong passphrases don't open them", async () => {
  const dek = rnd(32);
  const t0 = Date.now();
  const w = await wrapWithPass("five words make it strong", dek);
  const ms = Date.now() - t0;
  assert.deepEqual([w.kdf, w.m, w.t, w.p, "iter" in w], ["argon2id", 131072, 3, 1, false]);
  assert.equal(needsUpgrade(w), false);
  assert.deepEqual(await unwrapWithPass("five words make it strong", w), dek);
  assert.equal(await unwrapWithPass("five words make it wrong", w), null);
  console.log(`  (one Argon2id derivation here: about ${ms} ms)`);
});

test("older PBKDF2 locks still open, and are marked for upgrade", async () => {
  const dek = rnd(32);
  const old = await wrapWithPass("an older passphrase lock", dek, "pbkdf2");
  assert.ok(!old.kdf && old.iter === 600_000);
  assert.equal(needsUpgrade(old), true);
  const raw = await unwrapWithPass("an older passphrase lock", old);
  assert.deepEqual(raw, dek);
  const up = await wrapWithPass("an older passphrase lock", raw!);
  assert.deepEqual(await unwrapWithPass("an older passphrase lock", up), dek);
  assert.equal(needsUpgrade({ ...up, m: 65536 }), true);
});

test("a backup made with an older PBKDF2 lock still opens", async () => {
  const raw = rnd(32), dek = await aesKey(raw);
  const old = await wrapWithPass("an older passphrase lock", raw, "pbkdf2");
  const f = readOutside(await makeBackup(old, dek, (c) => (c === "txns" ? [{ id: "t1", amount: 100 }] : [])));
  const r = await openBackup(f, "an older passphrase lock", dek);
  assert.ok(r && r.sameKey && r.contents.counts.txns === 1);
});

test("settings out of bounds (a doctored file asking for 10 GB) or an unknown method are refused", async () => {
  await assert.rejects(argon2Raw("x", "AAAAAAAAAAAAAAAAAAAAAA==", 10_000_000, 3, 1), /settings/);
  await assert.rejects(argon2Raw("x", "AAAAAAAAAAAAAAAAAAAAAA==", ARGON2.m, 99, 1), /settings/);
  const w = await wrapWithPass("five words make it strong", rnd(32));
  await assert.rejects(unwrapWithPass("five words make it strong", { ...w, kdf: "md5" } as unknown as PassWrap), /newer version/);
});
