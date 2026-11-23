/**
 * Reads a KP Money Planner export: the plain "Export" file, or an encrypted backup
 * ({kpvault:1, salt, iter, check, iv, ct, z}) which needs that app's passphrase.
 */
import { aesKey, deriveRaw, open, TD, type Sealed } from "../../core/crypto.ts";
import { META, MONEY_COLLECTIONS, type Rec } from "../../core/store.ts";
import { toStored } from "./paise.ts";

export interface OldExport {
  app?: string;
  exported?: string;
  data: Record<string, unknown> & { schema?: number };
}
interface OldVault extends Sealed {
  kpvault: 1;
  salt: string;
  iter?: number;
  check?: Sealed;
}

export const isEncryptedBackup = (j: unknown): j is OldVault => !!j && typeof j === "object" && (j as OldVault).kpvault === 1;

/** Opens an encrypted backup of the old app; null when the passphrase is wrong. */
export async function openOldBackup(j: OldVault, pass: string): Promise<OldExport | null> {
  const key = await aesKey(await deriveRaw(pass, j.salt, j.iter ?? 600_000));
  try {
    if (j.check && TD.decode(await open(key, j.check)) !== "kpmp-check-v1") return null;
    const data = JSON.parse(TD.decode(await open(key, j))) as OldExport["data"];
    return { app: "KP Money Planner", data };
  } catch {
    return null;
  }
}

export interface Parsed {
  records: Record<string, Rec[]>;
  counts: Record<string, number>;
  exported: string | null;
}

/** Checks the file and turns it into records per collection. Throws a readable error. */
export function parseOldExport(j: unknown): Parsed {
  const x = j as OldExport;
  if (!x || typeof x !== "object" || !x.data || typeof x.data !== "object") throw new Error("This isn't a KP Money Planner export.");
  if (x.app && x.app !== "KP Money Planner") throw new Error(`This file is from "${x.app}", not KP Money Planner.`);
  const records: Record<string, Rec[]> = {};
  const counts: Record<string, number> = {};
  for (const c of MONEY_COLLECTIONS) {
    const list = x.data[c];
    if (list === undefined) { records[c] = []; continue; }
    if (!Array.isArray(list)) throw new Error(`"${c}" in the file isn't a list.`);
    const seen = new Set<string>();
    records[c] = list.map((r, i) => {
      if (!r || typeof r !== "object" || typeof (r as Rec).id !== "string" || !(r as Rec).id) throw new Error(`Item ${i + 1} in "${c}" has no id.`);
      const id = (r as Rec).id;
      if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(id) || id.startsWith("__")) throw new Error(`"${c}" has an unusable id: ${id}`);
      if (seen.has(id)) throw new Error(`"${c}" has the id ${id} twice.`);
      seen.add(id);
      return toStored(c, r as Rec);
    });
    counts[c] = records[c].length;
  }
  const unknown = Object.keys(x.data).filter((k) => k !== "schema" && !(MONEY_COLLECTIONS as readonly string[]).includes(k));
  if (unknown.length) throw new Error(`The file has parts this version doesn't know yet: ${unknown.join(", ")}.`);
  records[META] = [{ id: "money", schema: x.data.schema ?? 1, amounts: "paise", source: "KP Money Planner", exported: x.exported ?? null, imported: new Date().toISOString() }];
  return { records, counts, exported: x.exported ?? null };
}
