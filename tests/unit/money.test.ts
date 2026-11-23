import { test } from "node:test";
import assert from "node:assert/strict";
import { toPaise, groupIndian, formatINR, formatShort, sum } from "../../app/core/money.ts";

test("toPaise reads what people type", () => {
  assert.equal(toPaise("12,34,567.50"), 123456750);
  assert.equal(toPaise("₹1,000"), 100000);
  assert.equal(toPaise("1000.5"), 100050);
  assert.equal(toPaise("-250"), -25000);
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.equal(toPaise("abc"), null);
  assert.equal(toPaise(""), null);
  assert.equal(toPaise("1.234"), null);
});

test("Indian digit grouping", () => {
  assert.equal(groupIndian(0), "0");
  assert.equal(groupIndian(999), "999");
  assert.equal(groupIndian(1000), "1,000");
  assert.equal(groupIndian(100000), "1,00,000");
  assert.equal(groupIndian(12345678), "1,23,45,678");
});

test("formatINR", () => {
  assert.equal(formatINR(123456750), "₹12,34,568");
  assert.equal(formatINR(123456750, { paise: true }), "₹12,34,567.50");
  assert.equal(formatINR(-250000), "−₹2,500");
  assert.equal(formatINR(500, { bare: true }), "5");
});

test("formatShort", () => {
  assert.equal(formatShort(1390000000), "₹1.39 crore");
  assert.equal(formatShort(45000000), "₹4.5 lakh");
  assert.equal(formatShort(95000), "₹950");
});

test("sum stays exact over many entries", () => {
  const many = Array.from({ length: 10000 }, () => toPaise("0.10") ?? 0);
  assert.equal(sum(many), 100000);
});
