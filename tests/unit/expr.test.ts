// The calculator in Add transaction (27 Nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcValue } from "../../app/modules/money/calc/expr.ts";

test("adds, takes away, × and ÷ first, to 2 decimals", () => {
  assert.equal(calcValue("450+120"), 570);
  assert.equal(calcValue("1000−250"), 750);
  assert.equal(calcValue("120×2+30"), 270);
  assert.equal(calcValue("100÷3"), 33.33);
  assert.equal(calcValue("10+20×3−5÷5"), 69);
  assert.equal(calcValue("99.5+0.25"), 99.75);
});
test("a trailing sign is ignored; nonsense and ÷0 give nothing", () => {
  assert.equal(calcValue("450+"), 450);
  assert.equal(calcValue(""), null);
  assert.equal(calcValue("+"), null);
  assert.equal(calcValue("5÷0"), null);
});
