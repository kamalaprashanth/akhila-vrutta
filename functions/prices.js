/* KP Money Planner — daily official prices.
   Runs at 9:20 am and 11:20 pm IST (one Cloud Scheduler job) and when you tap "Update prices now".
   Sources (all official, all free):
     Mutual funds   AMFI's daily NAV file (every fund house reports here)
     NPS            NPS Trust's daily NAV report
     Indian shares  NSE's end-of-day bhavcopy, with BSE's bhavcopy for anything NSE doesn't have or when NSE is unreachable
     US shares, $   Alpha Vantage (licensed market data; free key, 25 lookups a day) — morning run only
   Your money data stays encrypted: the job saves the whole day's price list for mutual funds, NPS and Indian shares,
   and the app picks out your holdings on your device. Only your list of US tickers is stored (no units or amounts).
   A source that fails or looks wrong never replaces the last good prices; what happened is saved in priceStatus/last. */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const C = require("./prices-core");

const ALPHAVANTAGE_KEY = defineSecret("ALPHAVANTAGE_KEY");
const REGION = "asia-south1";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const SRC = {
  amfi: ["https://www.amfiindia.com/spages/NAVAll.txt", "https://portal.amfiindia.com/spages/NAVAll.txt"],
  nps: ["https://npstrust.org.in/nav-report-excel"],
  nse: d => `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${d.replace(/-/g, "")}_F_0000.csv.zip`,
  bse: d => `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${d.replace(/-/g, "")}_F_0000.CSV`
};
const KEEP_DAYS = 30, MAX_US = 22, MANUAL_PER_DAY = 6;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const istDay = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const istHour = () => new Date(Date.now() + 5.5 * 3600e3).getUTCHours();

async function get(url, { referer, binary, tries = 2 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "*/*", "Accept-Language": "en-IN,en;q=0.9", ...(referer ? { Referer: referer } : {}) }, signal: AbortSignal.timeout(60000) });
      if (r.status === 404) return null;                  // no file for that day (holiday) — not an error
      if (!r.ok) throw new Error("HTTP " + r.status);
      return binary ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) { last = e; if (i < tries - 1) await sleep(5000); }
  }
  throw new Error(`couldn't download (${last && last.message || last})`);
}

/* save a source's table if it passed the checks: latest doc, one doc per day (last 30 days) and the names list */
async function save(src, rows, from, extra = {}) {
  const db = getFirestore(), ref = db.doc(`prices/${src}`);
  const prev = (await ref.get()).data() || null;
  const chk = C.checkTable(src, rows, prev);
  if (!chk.ok) return { ok: false, msg: chk.msg, date: prev && prev.date };
  if (!chk.fresh && !extra.force) return { ok: true, msg: `no newer prices yet (latest ${chk.date})`, date: chk.date, n: chk.n };
  const gz = C.packPrices(rows), at = new Date().toISOString();
  const batch = db.batch();
  batch.set(ref, { date: chk.date, n: chk.n, gz, at, from, ...(extra.doc || {}) });
  batch.set(db.doc(`prices/${src}/days/${chk.date}`), { date: chk.date, n: chk.n, gz, at });
  if (src !== "us" && !extra.skipNames) batch.set(db.doc(`priceNames/${src}`), { n: chk.n, gz: C.packNames(src, rows), at });
  await batch.commit();
  const old = await db.collection(`prices/${src}/days`).orderBy("date", "desc").offset(KEEP_DAYS).limit(50).get();
  if (!old.empty) { const b = db.batch(); old.docs.forEach(d => b.delete(d.ref)); await b.commit(); }
  return { ok: true, msg: `${chk.n} prices saved`, date: chk.date, n: chk.n };
}

async function doMf() {
  let text, err;
  for (const u of SRC.amfi) { try { text = await get(u); if (text) break; } catch (e) { err = e; } }
  if (!text) throw err || new Error("AMFI file not found");
  return save("mf", C.parseAmfi(text), "AMFI");
}
async function doNps() {
  const text = await get(SRC.nps[0], { referer: "https://npstrust.org.in/" });
  if (!text) throw new Error("NPS Trust report not found");
  return save("nps", C.parseNps(text), "NPS Trust");
}
async function bhav(exch) {
  for (const d of C.bhavDates(Date.now())) {
    const url = exch === "NSE" ? SRC.nse(d) : SRC.bse(d);
    const body = await get(url, { binary: exch === "NSE", referer: exch === "NSE" ? "https://www.nseindia.com/" : "https://www.bseindia.com/" });
    if (!body) continue;
    const text = exch === "NSE" ? C.unzipFirst(body).toString("utf8") : body;
    if (!/TckrSymb/.test(text.slice(0, 2000))) throw new Error(`${exch} sent something that isn't a bhavcopy (it may be blocking downloads)`);
    const rows = C.parseUdiff(text, exch);
    for (const r of Object.values(rows)) if (!r.d) r.d = d;
    return { rows, date: d };
  }
  throw new Error(`${exch}: no bhavcopy for the last 6 trading days`);
}
async function doStocks() {
  const [n, b] = await Promise.allSettled([bhav("NSE"), bhav("BSE")]);
  if (n.status === "rejected" && b.status === "rejected") throw new Error(`NSE: ${n.reason.message}; BSE: ${b.reason.message}`);
  let rows = C.mergeStocks(n.value && n.value.rows, b.value && b.value.rows);
  /* when one exchange couldn't be downloaded, its shares keep their last good price (with its date) instead of dropping out */
  if (n.status === "rejected" || b.status === "rejected") {
    const prev = (await getFirestore().doc("prices/stk").get()).data();
    if (prev && prev.gz) rows = { ...C.unpackRows(prev.gz), ...rows };
  }
  const from = [n.value && `NSE ${n.value.date}`, b.value && `BSE ${b.value.date}`].filter(Boolean).join(" + ");
  const r = await save("stk", rows, from, { skipNames: n.status === "rejected" || b.status === "rejected" });
  const warn = [n.status === "rejected" && `NSE failed (${n.reason.message}), used BSE`, b.status === "rejected" && `BSE failed (${b.reason.message})`].filter(Boolean).join("; ");
  return warn ? { ...r, msg: `${r.msg}. ${warn}` } : r;
}
async function doUs(key) {
  const db = getFirestore(), owner = OWNER();
  const w = owner ? ((await db.doc(`priceWatch/${owner}`).get()).data() || {}) : {};
  const tick = [...new Set((w.us || []).map(t => String(t).toUpperCase().trim()).filter(t => /^[A-Z0-9.\-]{1,12}$/.test(t)))].slice(0, MAX_US);
  if (!tick.length) return { ok: true, msg: "no US tickers to look up" };
  if (!key) throw new Error("the Alpha Vantage key isn't set (README › Automatic prices)");
  const av = async (q, label) => { const r = await fetch(`https://www.alphavantage.co/query?${q}&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(30000) }); return C.parseAv(await r.json(), label); };
  const rows = {}, hist = [], fails = [];
  const all = [["USDINR", "function=FX_DAILY&from_symbol=USD&to_symbol=INR&outputsize=compact"], ...tick.map(t => [t, `function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(t)}&outputsize=compact`])];
  for (let i = 0; i < all.length; i++) {
    const [t, q] = all[i];
    try { const x = await av(q, t); rows[t] = { p: x.p, d: x.d }; x.hist.forEach(([d, p]) => hist.push(`${t}\t${p}\t${d}`)); }
    catch (e) { fails.push(e.message); if (/rate limit|per day|premium/i.test(e.message)) break; }
    if (i < all.length - 1) await sleep(13000);            // the free key allows 5 lookups a minute
  }
  if (!Object.keys(rows).length) throw new Error(fails[0] || "no US prices");
  const prev = (await db.doc("prices/us").get()).data() || {};
  /* a ticker that failed this time keeps its last good price */
  const prevRows = prev.gz ? C.unpackRows(prev.gz) : {};
  for (const t of ["USDINR", ...tick]) if (!rows[t] && prevRows[t]) rows[t] = prevRows[t];
  const r = await save("us", rows, "Alpha Vantage", { force: true, doc: { hist: C.packLines(hist), fetched: new Date().toISOString() } });
  return fails.length ? { ...r, msg: `${r.msg}; not found: ${fails.join("; ").slice(0, 300)}` } : r;
}

async function run({ manual = false, avKey = "" } = {}) {
  const db = getFirestore(), stRef = db.doc("priceStatus/last");
  const st = (await stRef.get()).data() || {};
  const runs = { ...(st.runs || {}) }, at = new Date().toISOString();
  const job = async (name, fn) => {
    try { const r = await fn(); runs[name] = { ...r, at }; }
    catch (e) { console.warn("prices", name, e.message); runs[name] = { ok: false, msg: String(e.message).slice(0, 400), at, date: runs[name] && runs[name].date }; }
  };
  await Promise.all([job("mf", doMf), job("nps", doNps), job("stk", doStocks)]);
  /* US shares once a day: the morning run (after the US market closes), or on demand if not looked up in the last 6 hours */
  const lastUs = st.runs && st.runs.us && st.runs.us.at ? Date.parse(st.runs.us.at) : 0;
  if ((istHour() < 12 && !manual) || (manual && Date.now() - lastUs > 6 * 3600e3)) await job("us", () => doUs(avKey));
  await stRef.set({ at, manual, runs }, { merge: false });
  return runs;
}

module.exports = (OWNER_UID) => { _owner = OWNER_UID; return { refreshPrices, refreshPricesNow }; };
let _owner = null;
const OWNER = () => (_owner ? _owner.value() : "");

const refreshPrices = onSchedule(
  { schedule: "20 9,23 * * *", timeZone: "Asia/Kolkata", region: REGION, secrets: [ALPHAVANTAGE_KEY], timeoutSeconds: 540, memory: "512MiB", retryCount: 1, maxInstances: 1 },
  async () => { await run({ avKey: ALPHAVANTAGE_KEY.value() }); }
);

const refreshPricesNow = onCall(
  { region: REGION, secrets: [ALPHAVANTAGE_KEY], timeoutSeconds: 540, memory: "512MiB", maxInstances: 1 },
  async (req) => {
    const owner = OWNER();
    if (!req.auth || !owner || req.auth.uid !== owner) throw new HttpsError("permission-denied", "This Google account can't update prices.");
    const ref = getFirestore().doc(`priceStatus/manual`), day = istDay();
    const ok = await getFirestore().runTransaction(async tx => {
      const s = await tx.get(ref), d = s.exists ? s.data() : {}, n = d.day === day ? d.n || 0 : 0;
      if (n >= MANUAL_PER_DAY) return false;
      tx.set(ref, { day, n: n + 1, total: FieldValue.increment(1) }, { merge: true }); return true;
    });
    if (!ok) throw new HttpsError("resource-exhausted", `Prices were already updated ${MANUAL_PER_DAY} times today by hand. They update by themselves every morning and night.`);
    return { runs: await run({ manual: true, avKey: ALPHAVANTAGE_KEY.value() }) };
  }
);
