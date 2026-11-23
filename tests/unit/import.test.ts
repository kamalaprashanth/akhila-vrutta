import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseOldExport } from "../../app/modules/money/import.ts";

test("rejects files that aren't exports", () => {
  assert.throws(() => parseOldExport({}), /isn't a KP Money Planner export/);
  assert.throws(() => parseOldExport({ app: "Other", data: {} }), /not KP Money Planner/);
  assert.throws(() => parseOldExport({ data: { txns: [{ id: "a" }, { id: "a" }] } }), /twice/);
  assert.throws(() => parseOldExport({ data: { txns: [{ id: "a/b" }] } }), /unusable id/);
  assert.throws(() => parseOldExport({ data: { mystery: [] } }), /doesn't know yet: mystery/);
});

test("reads a small export", () => {
  const p = parseOldExport({ app: "KP Money Planner", exported: "2026-11-23T00:00:00Z", data: { schema: 1, txns: [{ id: "t1", amount: 10 }] } });
  assert.equal(p.counts.txns, 1);
  assert.equal(p.records.accounts?.length, 0);
  assert.equal(p.records.meta?.[0]?.id, "money");
});

// A real export, only when one is provided locally (never committed).
const real = process.env.AV_EXPORT;
test("reads the owner's real export", { skip: !real || !existsSync(real) }, () => {
  const j = JSON.parse(readFileSync(real!, "utf8"));
  const p = parseOldExport(j);
  for (const [c, list] of Object.entries(j.data)) if (Array.isArray(list)) assert.equal(p.counts[c], list.length, c);
});
