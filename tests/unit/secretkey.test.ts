import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSecretKey, newSecretKey, parseSecretKey, rnd, SecretKeyNeeded, unwrapWithPass, wrapWithPass, aesKey } from "../../app/core/crypto.ts";
import { makeBackup, openBackup, readOutside } from "../../app/core/backup.ts";
import { kitPdf, qrModules } from "../../app/core/kit.ts";

test("a Secret Key is written for people, and read back however it's typed", () => {
  for (let i = 0; i < 50; i++) {
    const b = newSecretKey(), s = formatSecretKey(b);
    assert.match(s, /^A1-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{4}$/);
    assert.deepEqual(parseSecretKey(s), b);
    assert.deepEqual(parseSecretKey(s.toLowerCase().replace(/-/g, " ")), b);
    assert.deepEqual(parseSecretKey(s.slice(3)), b);                       // without "A1-"
  }
  const s = formatSecretKey(newSecretKey());
  const typo = s.slice(0, 5) + (s[5] === "7" ? "8" : "7") + s.slice(6);
  assert.equal(parseSecretKey(typo), null, "a mistyped character is caught by the check characters");
  assert.equal(parseSecretKey("A1-123"), null);
  assert.deepEqual(parseSecretKey(s.replace(/0/g, "O").replace(/1/g, "l")), parseSecretKey(s), "O for 0 and l for 1 are forgiven");
});

test("with the Secret Key on, the passphrase alone opens nothing", async () => {
  const dek = rnd(32), sk = newSecretKey();
  const w = await wrapWithPass("five words make it strong", dek, "argon2id", sk);
  assert.equal(w.sk, 1);
  await assert.rejects(unwrapWithPass("five words make it strong", w), SecretKeyNeeded);
  assert.equal(await unwrapWithPass("five words make it strong", w, newSecretKey()), null, "another Secret Key: no");
  assert.equal(await unwrapWithPass("wrong words entirely here", w, sk), null, "a wrong passphrase: no");
  assert.deepEqual(await unwrapWithPass("five words make it strong", w, sk), dek);
});

test("a backup made with the Secret Key on needs it to open", async () => {
  const raw = rnd(32), sk = newSecretKey(), key = await aesKey(raw);
  const w = await wrapWithPass("five words make it strong", raw, "argon2id", sk);
  const f = readOutside(await makeBackup(w, key, (c) => (c === "txns" ? [{ id: "t1", amount: 1 }] : [])));
  await assert.rejects(openBackup(f, "five words make it strong", key), SecretKeyNeeded);
  const r = await openBackup(f, "five words make it strong", key, sk);
  assert.equal(r?.contents.counts.txns, 1);
});

test("the Emergency Kit is a one-page PDF with the key and its QR code", () => {
  const key = formatSecretKey(newSecretKey());
  const pdf = new TextDecoder("latin1").decode(kitPdf({ key, account: "UID ...abc1234", made: new Date(2026, 10, 25) }));
  assert.ok(pdf.startsWith("%PDF-1.4") && pdf.trimEnd().endsWith("%%EOF"));
  assert.ok(pdf.includes(`(${key})`) && pdf.includes("/Count 1"));
  const xref = +pdf.match(/startxref\n(\d+)/)![1]!;
  assert.equal(pdf.slice(xref, xref + 4), "xref", "the cross-reference table is where the file says");
  const m = qrModules(key);
  assert.ok(m.length >= 21 && m.every((row) => row.length === m.length));
  assert.ok(m[0]![0] && m[0]![6] && m[6]![0] && !m[7]![7], "finder patterns in the corners");
});
