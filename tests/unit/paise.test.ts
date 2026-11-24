import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fromStored, toStored, unclassified, MONEY_FIELDS } from "../../app/modules/money/paise.ts";

test("converts listed fields only, both ways", () => {
  const t = { id: "t", amount: 1234.56, funds: [{ amt: 0.1 }], price: 12.3456, note: "x" };
  const s = toStored("txns", t);
  assert.equal(s.amount, 123456);
  assert.deepEqual(s.funds, [{ amt: 10 }]);
  assert.equal(s.price, 12.3456, "prices aren't money amounts");
  assert.deepEqual(fromStored("txns", s), t);
  assert.equal(t.amount, 1234.56, "the input isn't changed");
});

test("wildcards reach every EPF year", () => {
  const h = { id: "h", epf: { books: { A: { fys: { "2024": { close: [1.5, 2], rows: [{ emp: 3, wage: 4.25 }] } } } } } };
  const s = toStored("holdings", h) as typeof h;
  assert.deepEqual(s.epf.books.A.fys["2024"], { close: [150, 200], rows: [{ emp: 300, wage: 425 }] });
});

test("strings and missing fields are left alone", () => {
  assert.deepEqual(toStored("txns", { id: "a", amount: "12" }), { id: "a", amount: "12" });
  assert.deepEqual(toStored("loans", { id: "l" }), { id: "l" });
  assert.ok(MONEY_FIELDS.accounts?.includes("opening"));
});

const real = process.env.AV_EXPORT;
test("the owner's real export round-trips exactly", { skip: !real || !existsSync(real) }, () => {
  const d = JSON.parse(readFileSync(real!, "utf8")).data;
  let n = 0;
  for (const [c, list] of Object.entries(d)) {
    if (!Array.isArray(list)) continue;
    for (const r of list) { assert.deepEqual(fromStored(c, toStored(c, r)), r, `${c}/${r.id}`); n++; }
  }
  assert.ok(n > 8000);
});

test("statement matches, goals, limits, fees and charges are money", () => {
  const l = toStored("loans", { id: "l", fee: 199, syncs: [{ ym: "2026-01", bal: 512345.67, was: 500000 }], bank: { syncs: [{ bal: 1.5 }] } }) as any;
  assert.deepEqual([l.fee, l.syncs[0].bal, l.syncs[0].was, l.bank.syncs[0].bal], [19900, 51234567, 50000000, 150]);
  assert.deepEqual(toStored("goals", { id: "g", target: 2000000, saved: 12.5, pri: 2 }), { id: "g", target: 200000000, saved: 1250, pri: 2 });
  assert.equal((toStored("categories", { id: "c", limit: 5000 }) as any).limit, 500000);
  assert.equal((toStored("accounts", { id: "a", minBal: 10000 }) as any).minBal, 1000000);
  assert.equal((toStored("txns", { id: "t", charges: 0.25 }) as any).charges, 25);
});

test("unknown number fields are reported, known ones aren't", () => {
  assert.deepEqual(unclassified("loans", { id: "a", principal: 1, rate: 9, syncs: [{ bal: 2, mystery: 4 }], updatedAt: 5 }), ["syncs[].mystery"]);
  assert.deepEqual(unclassified("holdings", { id: "h", epf: { books: { X1: { fys: { "2024": { close: [1], rows: [{ emp: 1 }] } } } } }, navHist: [[1, 2]] }), []);
  assert.deepEqual(unclassified("trades", { id: "t", amt: 10.5, qty: 2 }), []);
});

test("every number field in the owner's real export is classified", { skip: !real || !existsSync(real) }, () => {
  const d = JSON.parse(readFileSync(real!, "utf8")).data;
  const all = new Set<string>();
  for (const [c, list] of Object.entries(d)) if (Array.isArray(list)) for (const r of list) for (const p of unclassified(c, r)) all.add(`${c}: ${p}`);
  assert.deepEqual([...all], []);
});

test("stored data one version behind is upgraded in place", async () => {
  const { upgradeWrites, AMOUNTS_VERSION } = await import("../../app/modules/money/paise.ts");
  const recs: Record<string, { id: string; [k: string]: unknown }[]> = {
    accounts: [{ id: "c", type: "card", limit: 200000, fee: 499.5, opening: -120000 }, { id: "b", type: "bank", opening: 5000 }],
  };
  const up = upgradeWrites({ id: "money", amounts: "paise-6" }, (c) => recs[c] ?? [], 1000)!;
  assert.equal(up.meta.amounts, AMOUNTS_VERSION);
  assert.equal(up.ops.length, 2, "the card that had amounts, and the meta record");
  assert.deepEqual(up.ops[0], { c: "accounts", id: "c", r: { id: "c", type: "card", limit: 20000000, fee: 49950, opening: -120000, updatedAt: 1000 } });
  assert.equal(up.ops[1]!.c, "meta");
  assert.equal(upgradeWrites({ id: "money", amounts: "paise-5" }, () => []), null, "older than that: import again");
  assert.equal(upgradeWrites({ id: "money", amounts: AMOUNTS_VERSION }, () => [])!.ops.length, 1, "already current: nothing to convert");
});
