import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fromStored, toStored, MONEY_FIELDS } from "../../app/modules/money/paise.ts";

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
