import { test } from "node:test";
import assert from "node:assert/strict";
import { aesKey, rnd, TD, wrapWithPass } from "../../app/core/crypto.ts";
import { BACKED_UP, backupToDrive, fileName, KEEP, lastSunday, makeBackup, openBackup, readOutside, restoreSet, setBackupDrive, summary, weeklyDue, type LogRec } from "../../app/core/backup.ts";
import type { Rec } from "../../app/core/store.ts";

const data: Record<string, Rec[]> = {
  txns: [{ id: "t1", amount: 12345, note: "rent" }, { id: "t2", amount: 500, deleted: true } as Rec],
  hhItems: [{ id: "i1", list: "todo", text: "fix the tap" }],
  habits: [{ id: "h1", name: "Walk", kind: "check", start: "2026-11-01" }],
  habitLog: [{ id: "h1_2026-11-25", h: "h1", d: "2026-11-25", v: 1 }],
  files: [{ id: "f1", name: "bill.pdf" }],
  backupLog: [{ id: "settings", weekly: true }],
};
const all = (c: string) => data[c] ?? [];

test("a backup: everything but the log, sealed; opens with the passphrase it was made with", async () => {
  const raw = rnd(32), dek = await aesKey(raw), wrap = await wrapWithPass("five words make it strong", raw);
  const bytes = await makeBackup(wrap, dek, all, "abc1234");
  const text = TD.decode(bytes);
  for (const s of ["rent", "fix the tap", "Walk", "bill.pdf"]) assert.ok(!text.includes(s), `"${s}" is not readable in the file`);
  const f = readOutside(bytes);
  assert.equal(f.kind, "akhila-vrutta-backup");
  assert.equal(await openBackup(f, "not the passphrase", dek), null);
  const r = await openBackup(f, "five words make it strong", dek);
  assert.ok(r && r.sameKey);
  assert.deepEqual(r!.contents.counts, { txns: 1, hhItems: 1, habits: 1, habitLog: 1, files: 1 });
  assert.ok(!("backupLog" in r!.contents.collections) && !BACKED_UP().includes("backupLog"));
  const set = restoreSet(r!.contents, true);
  assert.equal(set.txns!.length, 1); assert.equal(set.files!.length, 1); assert.deepEqual(set.accounts, []);
  // another account's key: the vault-file records are left out (their files wouldn't open)
  const other = await aesKey(rnd(32));
  const r2 = await openBackup(f, "five words make it strong", other);
  assert.equal(r2!.sameKey, false);
  assert.equal(restoreSet(r2!.contents, false).files, undefined);
  assert.deepEqual(summary(r!.contents.counts).map(([l]) => l), ["Transactions", "Household: homes, jobs, appliances, vehicles, lists", "Habits and their days", "Vault files (kept in your Drive)"]);
});

test("not a backup, or from a newer app: said plainly", () => {
  assert.throws(() => readOutside(new TextEncoder().encode("{}")), /isn't an Akhila Vrutta backup/);
  assert.throws(() => readOutside(new TextEncoder().encode("hello")), /isn't an Akhila Vrutta backup/);
  assert.throws(() => readOutside(new TextEncoder().encode(JSON.stringify({ kind: "akhila-vrutta-backup", v: 2, wrap: {}, data: {} }))), /newer version/);
});

test("weekly: due when there's no Drive backup since the last Sunday", () => {
  const wed = new Date(2026, 10, 25, 10), sun = lastSunday(wed);
  assert.equal(sun.getDay(), 0); assert.equal(sun.getDate(), 22);
  assert.equal(lastSunday(new Date(2026, 10, 22, 18)).getDate(), 22);
  const log = (made: Date, where: LogRec["where"] = "drive"): LogRec => ({ id: String(+made), made: +made, size: 1, where });
  assert.equal(weeklyDue([], wed), true);
  assert.equal(weeklyDue([log(new Date(2026, 10, 21))], wed), true);
  assert.equal(weeklyDue([log(new Date(2026, 10, 22, 9))], wed), false);
  assert.equal(weeklyDue([log(new Date(2026, 10, 24), "file")], wed), true);   // a download isn't the Drive copy
  assert.equal(fileName(wed), "akhila-vrutta-backup-2026-11-25.avb");
});

test("Drive keeps the last 8", async () => {
  const files = Array.from({ length: 9 }, (_, i) => ({ id: `d${i}`, name: `b${i}.avb`, size: 1, made: i }));
  setBackupDrive({ available: () => true, upload: async (name) => { files.push({ id: "new", name, size: 1, made: 99 }); return "new"; }, list: async () => [...files], download: async () => new Uint8Array(), remove: async (id) => { files.splice(files.findIndex((f) => f.id === id), 1); } });
  await backupToDrive(new Uint8Array(3));
  assert.equal(files.length, KEEP);
  assert.ok(files.some((f) => f.id === "new") && !files.some((f) => f.id === "d0" || f.id === "d1"));
});
