import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COLLECTIONS } from "../../app/core/store.ts";

test("the database rules allow writing every collection the app uses", () => {
  const rules = readFileSync("firestore.rules", "utf8"), list = rules.match(/coll in \[([^\]]+)\]/)?.[1] ?? "";
  const allowed = new Set([...list.matchAll(/'([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual(COLLECTIONS.filter((c) => !allowed.has(c)), []);
});
