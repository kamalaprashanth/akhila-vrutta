import { test } from "node:test";
import assert from "node:assert/strict";
import { aesKey, openJSON, rnd, sealJSON, unwrapWithPass, wrapWithPass } from "../../app/core/crypto.ts";
import { stableJSON } from "../../app/core/store.ts";

test("records round-trip and are bound to their path", async () => {
  const key = await aesKey(rnd(32));
  const rec = { id: "t1", amount: 1234.5, note: "Rent".repeat(400) };
  const s = await sealJSON(key, rec, "txns/t1");
  assert.equal(s.z, 1, "large records are compressed");
  assert.deepEqual(await openJSON(key, s, "txns/t1"), rec);
  await assert.rejects(openJSON(key, s, "txns/t2"), "moving a record to another id must fail");
  await assert.rejects(openJSON(await aesKey(rnd(32)), s, "txns/t1"), "another key must fail");
});

test("small records aren't compressed", async () => {
  const s = await sealJSON(await aesKey(rnd(32)), { id: "a" }, "accounts/a");
  assert.equal(s.z, undefined);
  assert.equal(s.iv.length, 16);
});

test("passphrase wraps and unwraps the data key", async () => {
  const dek = rnd(32);
  const w = await wrapWithPass("a long test passphrase", dek);
  assert.deepEqual(await unwrapWithPass("a long test passphrase", w), dek);
  assert.equal(await unwrapWithPass("wrong passphrase here", w), null);
});

test("stableJSON ignores key order and undefined", () => {
  assert.equal(stableJSON({ b: 1, a: [1, { d: 2, c: undefined }] }), stableJSON({ a: [1, { d: 2 }], b: 1 }));
  assert.notEqual(stableJSON({ a: 1 }), stableJSON({ a: 2 }));
});
