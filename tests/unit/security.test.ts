import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateBits, strength } from "../../app/core/strength.ts";

test("passphrase strength: common passwords are weak; several unrelated words are strong", () => {
  for (const p of ["password123", "Bangalore@2026", "1234567890", "aaaaaaaaaaaa", "qwertyuiop1"]) assert.equal(strength(p).level, 0, p);
  assert.ok(strength("mango kite river").level <= 1);
  assert.ok(strength("mango kite river seventy").level >= 1);
  assert.equal(strength("mango kite river seventy lamp").level, 3);
  assert.ok(estimateBits("mango kite river seventy lamp") >= 55);
  assert.ok(estimateBits("password password password") < 20);   // common words count for nothing
});

test("wrong passphrases: five free tries, then 30 s, doubling to at most an hour; a right one clears it", async () => {
  const mem = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } as Storage;
  const a = await import("../../app/core/attempts.ts");
  const t = 1_000_000;
  for (let i = 0; i < 4; i++) assert.equal(a.noteWrong(t), 0);
  assert.equal(a.noteWrong(t), 30_000);
  assert.equal(a.waitLeft(t + 10_000), 20_000);
  assert.equal(a.noteWrong(t), 60_000);
  for (let i = 0; i < 10; i++) a.noteWrong(t);
  assert.equal(a.waitLeft(t), 3_600_000);
  assert.equal(a.waitLabel(27_000), "0:27");
  a.noteRight();
  assert.equal(a.waitLeft(t), 0);
  assert.equal(a.failsSoFar(), 0);
});
