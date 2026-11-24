/* KP Money Planner — reading the official daily price files.
   Pure functions only (no Firebase), so they can be tested on sample files.
   Every reader finds its columns by the header names, not by position, so a reordered or extra column doesn't break it.
   If a file's layout changes so much that the header can't be found, the reader throws a clear message and the
   last good prices are kept. */
const zlib = require("zlib");

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, "0");
/* dates come as 17-Nov-2026, 17-11-2026, 17/11/2026, 2026-11-17 or 20261117; returns 2026-11-17 or "" */
function isoDate(s) {
  s = String(s || "").trim().replace(/^"|"$/g, "");
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[-\/ ]([A-Za-z]{3})[A-Za-z]*[-\/ ](\d{4})/)) && MON[m[2].toLowerCase()]) return `${m[3]}-${pad(MON[m[2].toLowerCase()])}-${pad(m[1])}`;
  if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/))) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return "";
}
const num = s => { const v = parseFloat(String(s == null ? "" : s).replace(/[",\s₹]/g, "")); return isFinite(v) ? v : NaN; };
const okPrice = p => isFinite(p) && p > 0 && p < 1e9;

/* one CSV / TSV line → fields (handles quoted fields with commas) */
function splitLine(line, sep) {
  if (sep !== "," || line.indexOf('"') < 0) return line.split(sep).map(x => x.trim());
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur.trim()); cur = ""; } else cur += c;
  }
  out.push(cur.trim()); return out;
}
const lines = text => String(text || "").replace(/^﻿/, "").split(/\r?\n/);
const findCol = (head, re) => head.findIndex(h => re.test(h));

/* ---------- AMFI NAVAll.txt (all mutual funds) ----------
   Header: Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
   (";" for many years; some copies use "|"). Between the data lines are fund-house and category headings, which are skipped. */
function parseAmfi(text) {
  const L = lines(text);
  const hi = L.findIndex(l => /scheme\s*code/i.test(l) && /net\s*asset\s*value/i.test(l));
  if (hi < 0) throw new Error("AMFI file: header row not found (the file layout may have changed)");
  const sep = L[hi].includes("|") ? "|" : L[hi].includes(";") ? ";" : "\t";
  const head = splitLine(L[hi], sep);
  const c = { code: findCol(head, /scheme\s*code/i), isin: findCol(head, /isin.*(payout|growth)/i), isin2: findCol(head, /isin.*reinv/i),
    name: findCol(head, /scheme\s*name/i), nav: findCol(head, /net\s*asset\s*value/i), date: findCol(head, /^date/i) };
  if (c.code < 0 || c.nav < 0 || c.date < 0) throw new Error("AMFI file: code, NAV or date column missing");
  const rows = {};
  for (let i = hi + 1; i < L.length; i++) {
    const l = L[i]; if (!l || l.indexOf(sep) < 0) continue;
    const f = splitLine(l, sep); if (f.length < head.length - 1) continue;
    const code = f[c.code]; if (!/^\d{3,8}$/.test(code)) continue;
    const p = num(f[c.nav]), d = isoDate(f[c.date]); if (!okPrice(p) || !d) continue;
    const isin = [f[c.isin], f[c.isin2]].filter(x => x && /^IN[A-Z0-9]{10}$/.test(x)).join(",");
    rows[code] = { p, d, n: c.name >= 0 ? f[c.name] : "", i: isin };
  }
  return rows;
}

/* ---------- NPS Trust daily NAV report (all pension fund schemes) ----------
   Tab-separated with columns including SCHEME ID, SCHEME NAME, PFM NAME, DATE OF NAV, NAV VALUE. */
function parseNps(text) {
  const L = lines(text);
  const hi = L.findIndex(l => /scheme\s*id/i.test(l) && /nav/i.test(l));
  if (hi < 0) throw new Error("NPS Trust file: header row not found (the file layout may have changed)");
  const sep = L[hi].includes("\t") ? "\t" : L[hi].includes("|") ? "|" : ",";
  const head = splitLine(L[hi], sep).map(h => h.replace(/^"|"$/g, ""));
  const c = { id: findCol(head, /scheme\s*id/i), name: findCol(head, /scheme\s*name/i), pfm: findCol(head, /pfm|fund\s*manager/i),
    date: findCol(head, /date/i), nav: findCol(head, /nav\s*value|^nav$/i) };
  if (c.id < 0 || c.nav < 0 || c.date < 0) throw new Error("NPS Trust file: scheme id, NAV or date column missing");
  const rows = {};
  for (let i = hi + 1; i < L.length; i++) {
    if (!L[i].trim()) continue;
    const f = splitLine(L[i], sep).map(x => x.replace(/^"|"$/g, ""));
    const id = (f[c.id] || "").toUpperCase(); if (!/^[A-Z]{1,3}\d{3,9}$/.test(id)) continue;
    const p = num(f[c.nav]), d = isoDate(f[c.date]); if (!okPrice(p) || !d) continue;
    const prev = rows[id]; if (prev && prev.d >= d) continue;   // keep the newest if a scheme is listed twice
    rows[id] = { p, d, n: c.name >= 0 ? f[c.name] : "", f: c.pfm >= 0 ? f[c.pfm] : "" };
  }
  return rows;
}

/* ---------- NSE / BSE bhavcopy in the exchanges' common UDiFF layout ----------
   Header uses ISO tags: TradDt, Sgmt, FinInstrmTp, ISIN, TckrSymb, SctySrs, FinInstrmNm, ClsPric … Keyed by ISIN,
   which stays the same when a company renames its symbol. Ordinary series (EQ, then BE …) are preferred. */
const SERIES_RANK = s => ({ EQ: 0, BE: 1, BZ: 2, SM: 3, ST: 3, GB: 4 })[s] ?? 5;
function parseUdiff(text, exch) {
  const L = lines(text);
  const hi = L.findIndex(l => /TckrSymb/i.test(l) && /ClsPric/i.test(l));
  if (hi < 0) throw new Error(`${exch} bhavcopy: header row not found (the file layout may have changed)`);
  const head = splitLine(L[hi], ",");
  const col = n => head.findIndex(h => h.toLowerCase() === n.toLowerCase());
  const c = { isin: col("ISIN"), sym: col("TckrSymb"), close: col("ClsPric"), ser: col("SctySrs"), name: col("FinInstrmNm"), date: col("TradDt"), sg: col("Sgmt") };
  if (c.isin < 0 || c.sym < 0 || c.close < 0) throw new Error(`${exch} bhavcopy: ISIN, symbol or close column missing`);
  const rows = {};
  for (let i = hi + 1; i < L.length; i++) {
    if (!L[i]) continue;
    const f = splitLine(L[i], ",");
    if (c.sg >= 0 && f[c.sg] && f[c.sg] !== "CM") continue;
    const isin = (f[c.isin] || "").toUpperCase(); if (!/^IN[A-Z0-9]{10}$/.test(isin)) continue;
    const p = num(f[c.close]), d = c.date >= 0 ? isoDate(f[c.date]) : ""; if (!okPrice(p)) continue;
    const s = c.ser >= 0 ? f[c.ser] : "", prev = rows[isin];
    if (prev && SERIES_RANK(prev.r) <= SERIES_RANK(s)) continue;
    rows[isin] = { p, d, s: f[c.sym], n: c.name >= 0 ? f[c.name] : "", x: exch, r: s };
  }
  return rows;
}
/* NSE first, BSE for anything NSE doesn't have (or when NSE couldn't be downloaded) */
function mergeStocks(nse, bse) {
  const out = {};
  for (const [k, v] of Object.entries(bse || {})) out[k] = v;
  for (const [k, v] of Object.entries(nse || {})) { const b = out[k]; out[k] = b && b.d > v.d ? b : v; }
  return out;
}

/* ---------- the first file inside a .zip (NSE ships its bhavcopy zipped) ---------- */
function unzipFirst(buf) {
  buf = Buffer.from(buf);
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error("not a zip file");
  let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("zip: end record not found");
  const cd = buf.readUInt32LE(e + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error("zip: central directory not found");
  const method = buf.readUInt16LE(cd + 10), csize = buf.readUInt32LE(cd + 20), off = buf.readUInt32LE(cd + 42);
  const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), data = buf.subarray(start, start + csize);
  if (method === 0) return data;
  if (method === 8) return zlib.inflateRawSync(data);
  throw new Error("zip: unsupported compression " + method);
}

/* ---------- Alpha Vantage (US shares and the dollar rate) ---------- */
function parseAv(json, label) {
  if (!json || typeof json !== "object") throw new Error(`${label}: empty answer`);
  const msg = json["Error Message"] || json["Note"] || json["Information"];
  const key = Object.keys(json).find(k => /time series/i.test(k));
  if (!key) throw new Error(`${label}: ${msg ? String(msg).slice(0, 160) : "no prices in the answer"}`);
  const hist = Object.entries(json[key]).map(([d, o]) => [isoDate(d), num(o["4. close"])]).filter(([d, p]) => d && okPrice(p)).sort((a, b) => a[0] < b[0] ? -1 : 1);
  if (!hist.length) throw new Error(`${label}: no prices in the answer`);
  const [d, p] = hist[hist.length - 1];
  return { p, d, hist: hist.slice(-100) };
}

/* ---------- checks before a new table replaces the last good one ---------- */
const MIN_ROWS = { mf: 3000, nps: 40, stk: 800, us: 1 };
function checkTable(src, rows, prev) {
  const n = Object.keys(rows).length;
  if (n < MIN_ROWS[src]) return { ok: false, msg: `only ${n} prices found (expected at least ${MIN_ROWS[src]}); kept the last good prices` };
  if (prev && prev.n && n < prev.n * 0.6) return { ok: false, msg: `only ${n} prices found, far fewer than last time (${prev.n}); kept the last good prices` };
  const date = Object.values(rows).reduce((m, r) => r.d > m ? r.d : m, "");
  if (prev && prev.date && date < prev.date) return { ok: false, msg: `the file is older (${date}) than the prices already saved (${prev.date}); kept those` };
  return { ok: true, n, date, fresh: !prev || !prev.date || date > prev.date };
}

/* ---------- compact storage: tab-separated lines, gzipped, base64 (well under Firestore's 1 MB a document) ---------- */
const clean = s => String(s == null ? "" : s).replace(/[\t\r\n]+/g, " ").trim();
function packPrices(rows) { return zlib.gzipSync(Object.entries(rows).map(([k, r]) => `${k}\t${r.p}\t${r.d}`).join("\n")).toString("base64"); }
function packNames(src, rows) {
  const ln = Object.entries(rows).map(([k, r]) => src === "mf" ? `${k}\t${clean(r.n)}\t${clean(r.i)}` : src === "nps" ? `${k}\t${clean(r.n)}\t${clean(r.f)}` : `${k}\t${clean(r.n)}\t${clean(r.s)}\t${r.x}`);
  return zlib.gzipSync(ln.join("\n")).toString("base64");
}
function unpack(b64) { return zlib.gunzipSync(Buffer.from(b64, "base64")).toString("utf8"); }
const packLines = a => zlib.gzipSync(a.join("\n")).toString("base64");
function unpackRows(b64) { const o = {}; for (const l of unpack(b64).split("\n")) { const [k, p, d] = l.split("\t"); if (k && +p > 0) o[k] = { p: +p, d }; } return o; }

/* trading-day dates to try for a bhavcopy: today (only after 6:30 pm IST, when it's published), then earlier weekdays */
function bhavDates(nowMs, days = 6) {
  const ist = new Date(nowMs + 5.5 * 3600e3), out = [];
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  if (ist.getUTCHours() * 60 + ist.getUTCMinutes() < 18 * 60 + 30) d.setUTCDate(d.getUTCDate() - 1);
  while (out.length < days) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
  return out;
}

module.exports = { isoDate, parseAmfi, parseNps, parseUdiff, mergeStocks, unzipFirst, parseAv, checkTable, packPrices, packNames, unpack, unpackRows, packLines, bhavDates, splitLine };
