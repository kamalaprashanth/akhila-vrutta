// End-to-end test of the cloud parts, on Firebase's local emulators (Auth, Firestore, Hosting).
// Uses the real firebase.json (clean URLs, headers) and the real firestore.rules.
// Run through:  npm run test:cloud   (starts the emulators, needs Java and a build with AV_EMULATORS=1)
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

const PROJECT = "demo-akhila-vrutta";
const OWNER_UID = "Qc1qDKgHAJgWaYnppeUni1hPxXr1"; // the allowed account in firestore.rules
const BASE = "http://localhost:5050"; // localhost, not 127.0.0.1: fingerprint (WebAuthn) needs a domain
const AUTH = "http://127.0.0.1:9099";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${PROJECT}/asia-south1`;
const PASS1 = "first mango river kite lamp";
const PASS2 = "second tiger cloud orange bench";
const SHOTS = "test-results/cloud";
const SAMPLE = "tests/fixtures/sample-export.json";
mkdirSync(SHOTS, { recursive: true });

let failed = 0, step = 0;
let lastStep = "start";
const progress = (m) => { lastStep = m; console.log(`… ${m}`); };
// A stuck step must fail with details, never hang the pipeline.
const watchdog = setTimeout(async () => {
  console.error(`✗ watchdog: stuck after "${lastStep}" for too long`);
  for (const [name, page] of openPages) {
    const t = await page.locator("#lock").innerText({ timeout: 1000 }).catch(() => "(no lock screen)");
    console.error(`  ${name} screen: ${t.replace(/\s+/g, " ").slice(0, 300)}`);
    await page.screenshot({ path: `${SHOTS}/stuck-${name.replace(/\W/g, "")}.png` }).catch(() => {});
  }
  console.error("  console:\n    " + consoleLines.slice(-30).join("\n    "));
  process.exit(1);
}, 6 * 60 * 1000);
watchdog.unref();
const ok = (m) => console.log(`✓ ${m}`);
const bad = (m) => { failed++; console.error(`✗ ${m}`); };
const check = (cond, m) => (cond ? ok(m) : bad(m));

const denied0 = async (label, p) => { const r = await p; check(r.status === 403, `${label} (HTTP ${r.status})`); };
async function api(url, opts = {}, token = "owner") {
  const auth = token ? { authorization: `Bearer ${token}` } : {};
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), ...opts, headers: { "content-type": "application/json", ...auth, ...(opts.headers ?? {}) } });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}

/* ---------- emulator setup ---------- */
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
for (const [localId, who] of [[OWNER_UID, "owner"], ["intruder-uid", "intruder"]]) {
  const r = await api(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts`, { method: "POST", body: JSON.stringify({ localId, email: `${who}@test.local`, password: "test-password-123" }) });
  if (r.status !== 200) throw new Error(`couldn't create test user ${who}: ${JSON.stringify(r.body)}`);
}
async function idToken(who) {
  const r = await api(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test-api-key`, { method: "POST", body: JSON.stringify({ email: `${who}@test.local`, password: "test-password-123", returnSecureToken: true }) }, null);
  if (!r.body.idToken) throw new Error(`test sign-in failed for ${who}: ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body.idToken;
}

/* ---------- browser helpers ---------- */
const browser = await chromium.launch();
const pageErrors = [];
const consoleLines = [];
const openPages = [];

async function device(name, { user, bio } = {}) {
  // The emulator ports aren't in the production CSP; the real CSP is checked on the preview deploy.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, bypassCSP: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (user) await ctx.addInitScript((u) => { window.AV_TEST_USER = u; }, user);
  const page = await ctx.newPage();
  openPages.push([name, page]);
  page.on("console", (m) => { if (!/ERR_FAILED/.test(m.text())) consoleLines.push(`${name} [${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => pageErrors.push(`${name}: ${e.message}`));
  page.on("response", (r) => { if (r.url().startsWith(BASE) && r.status() >= 400) pageErrors.push(`${name}: ${r.status()} ${r.url()}`); });
  if (bio) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  }
  return { ctx, page };
}
const shot = (page, label) => page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-${label}.png` });
const lockText = (page) => page.locator("#lock").innerText({ timeout: 15000 });

async function signInAndSetup(page, { create, pass, mode = "pass", sk }) {
  await page.goto(BASE);
  await page.click("#lk_g");
  await page.waitForSelector("#lk_p");
  await page.fill("#lk_p", pass);
  if (create) await page.fill("#lk_p2", pass);
  await page.click("#lock .btn.pri");
  if (sk) {   // an account with a Secret Key: a new device asks for it
    await page.waitForSelector("#lk_skw:not([hidden])", { timeout: 30000 });
    await page.fill("#lk_sk", sk);
    await page.click("#lock .btn.pri");
  }
  await page.click(`#lock [data-m="${mode}"]`, { timeout: 20000 });
  await page.waitForSelector("#lock", { state: "detached", timeout: 30000 });
}
async function unlockWithPass(page, pass) {
  await page.waitForSelector("#lk_p", { timeout: 20000 });
  await page.fill("#lk_p", pass);
  await page.click("#lock .btn.pri");
}
/** Opens a money page; the planner's names (S, go, upsert, uid) are test hooks on the app's page (emulator build only). */
async function moneyFrame(page, view = "accounts") {
  await page.goto(`${BASE}/#/money/${view}`);
  await page.waitForSelector("#moneyView #view > *", { timeout: 20000 });
  await page.waitForFunction(() => typeof S === "object" && !!S.data);
  return page;
}
const plannerTxns = (f) => f.evaluate(() => S.data.txns.filter((t) => !t.deleted).map((t) => ({ note: t.note, amount: t.amount })));

try {
  progress("first device");
  /* 1. First device: sign in, create the passphrase, choose "passphrase every time" */
  const A = await device("device 1");
  await signInAndSetup(A.page, { create: true, pass: PASS1 });
  ok("first device: signed in, passphrase created, unlocked");
  await shot(A.page, "unlocked");

  progress("import");
  /* 2. Import the sample export */
  await A.page.goto(`${BASE}/#/settings`);
  await A.page.setInputFiles("#impFile", SAMPLE);
  await A.page.click("#impGo");
  await A.page.waitForFunction(() => /Imported|up to date/.test(document.querySelector("#toast")?.textContent ?? ""), null, { timeout: 30000 });
  check(true, `import finished: "${await A.page.innerText("#toast")}"`);
  await shot(A.page, "imported");

  progress("money frame");
  /* 3. The Money tab: the planner frame loads with its styles (today's bug) and shows the data */
  let f = await moneyFrame(A.page);
  const styled = await f.evaluate(() => {
    const card = document.querySelector("#moneyView .card"), font = card ? getComputedStyle(card).fontFamily : "";
    return { frame: !!document.querySelector("#moneyFrame, iframe[src*='money/app']"), radius: card ? getComputedStyle(card).borderRadius : "none", font };
  });
  check(!styled.frame && styled.radius !== "0px" && styled.radius !== "none", `Money is drawn by the app with the planner's look, and no planner frame is loaded (${JSON.stringify(styled)})`);
  { const pg = await fetch(`${BASE}/money/app`), js = await fetch(`${BASE}/money/legacy.js`), pt = await pg.text(), jt = await js.text();
    check(!pt.includes("legacy.js") && !jt.includes("01-core.js"), `the old planner isn't served (/money/app ${pg.status}, /money/legacy.js ${js.status})`); }
  await moneyFrame(A.page, "accounts");
  check(/Net worth/i.test(await A.page.innerText("#moneyView #view")) && /Test Bank|Net worth/.test(await A.page.innerText("#moneyView #view")), "Accounts (drawn by the app) shows the imported data");
  const fT = await moneyFrame(A.page, "activity");
  // The app makes what the planner used to fill in by itself: this month's net-worth snapshot, saved to the cloud.
  await A.page.waitForTimeout(1500);
  const snapYm = await fT.evaluate(() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; });
  check(await fT.evaluate((ym) => (S.data.snaps || []).some((x) => x.id === `nw-${ym}` && !x.deleted), snapYm), `this month's net-worth snapshot is made by the app when Money opens (nw-${snapYm})`);
  const imported = (await plannerTxns(fT)).find((t) => t.note === "sample expense 1234.56");
  check(imported?.amount === 1234.56, `an imported transaction is back in rupees (₹${imported?.amount})`);
  await shot(A.page, "money-accounts");
  await moneyFrame(A.page, "more");
  check(/Setup checklist/i.test(await A.page.innerText("#moneyView #view")) && /\d+ transactions/i.test(await A.page.innerText("#moneyView #view")), "Money settings (drawn by the app) shows the imported data");
  // A card's limit and fee are saved in paise (since paise-7) and read back as the same rupees after a reload.
  const fC = await moneyFrame(A.page, "accounts");
  await fC.evaluate(() => upsert("accounts", { id: "cloudcard", name: "Cloud card", type: "card", opening: -1000, limit: 50000, fee: 499, stmtDay: 5, dueDay: 25 }));
  await A.page.waitForTimeout(3000);
  await A.page.reload(); await unlockWithPass(A.page, PASS1); await A.page.waitForSelector("#lock", { state: "detached", timeout: 30000 });
  const fC2 = await moneyFrame(A.page, "accounts");
  await fC2.evaluate(() => { S.cardId = "cloudcard"; go("card"); }); await A.page.waitForTimeout(800);
  const cardTxt = await A.page.innerText("#moneyView #view");
  check(/of ₹50,000/.test(cardTxt) && /₹499/.test(cardTxt) && await fC2.evaluate(() => S.data.accounts.find((a) => a.id === "cloudcard")?.limit === 50000), "a card's ₹50,000 limit and ₹499 fee come back the same after a reload (stored in paise)");
  f = fC2;   // the page was reloaded: the planner's frame is a new one
  // An investment added with the app's own form is saved to the cloud in paise and comes back the same after a reload.
  { await moneyFrame(A.page, "accounts"); await A.page.click('#moneyView #view .accseg [data-acct="invest"]'); await A.page.waitForTimeout(500);
    await A.page.click("#moneyView #view #addHold"); await A.page.waitForSelector("#mvLayer #modal #f_name");
    await A.page.fill("#mvLayer #f_name", "Cloud Flexi Cap"); await A.page.fill("#mvLayer #f_openInvested", "25,000.50"); await A.page.fill("#mvLayer #f_openUnits", "250"); await A.page.fill("#mvLayer #f_price", "110");
    await A.page.click("#mvLayer #modal #sv"); await A.page.waitForTimeout(3000);
    await A.page.reload(); await unlockWithPass(A.page, PASS1); await A.page.waitForSelector("#lock", { state: "detached", timeout: 30000 });
    f = await moneyFrame(A.page, "accounts");
    const h = await f.evaluate(() => S.data.holdings.find((x) => x.name === "Cloud Flexi Cap" && !x.deleted));
    check(h && h.openInvested === 25000.5 && h.openUnits === 250 && h.price === 110, `an investment added with the app's form comes back the same after a reload (₹${h?.openInvested} invested, ${h?.openUnits} units at ₹${h?.price})`); }

  // The Advisor drawn by the app asks Claude itself: the call must reach askClaude as the owner (signed in),
  // and whatever comes back (an answer, or why Claude couldn't be reached here) is shown, not a sign-in error.
  await moneyFrame(A.page, "advisor");
  const pillOn = await A.page.$eval("#moneyView [data-advq]", (b) => !b.disabled).catch(() => false);
  check(pillOn, "Advisor (drawn by the app): the questions are enabled for the signed-in owner");
  if (pillOn) {
    await A.page.click("#moneyView [data-advq]");
    let said = "";
    for (let i = 0; i < 120 && !said; i++) { await A.page.waitForTimeout(500); said = await A.page.evaluate(() => { const t = document.querySelector("#mvLayer .toast"); const a = document.querySelector("#moneyView .adva:not(#advLive)"); return t ? "toast: " + t.textContent : a ? "answer" : ""; }); }
    check(!!said && !/permission|sign in|allowed/i.test(said), `Advisor: the app's own call reaches askClaude (${said || "nothing came back"})`);
  }

  progress("edit and reload");
  /* 4. An edit in the planner is saved: encrypted, in paise, and comes back after a reload */
  await f.evaluate(() => upsert("txns", { id: uid(), type: "expense", amount: 777.77, date: new Date().toISOString().slice(0, 10), accountId: S.data.accounts.find((a) => a.name === "Test Bank").id, note: "cloud test 42", updatedAt: Date.now() }));
  await A.page.waitForTimeout(3000);
  const owner = await idToken("owner");
  const users = await api(`${FS}/users/${OWNER_UID}`, {}, owner);
  const home = users.body?.fields?.home?.stringValue;
  check(!!home, "the account points to its home");
  const raw = await api(`${FS}/homes/${home}/txns?pageSize=100`);
  const docs = raw.body.documents ?? [];
  check(docs.length >= 6, `the transactions are in the cloud (${docs.length} records)`);
  const allowed = new Set(["iv", "ct", "z", "at", "by", "del"]);
  const shapes = docs.every((d) => Object.keys(d.fields).every((k) => allowed.has(k)));
  // Look inside the stored bytes: none of the plain text may appear (timestamps are allowed to contain digits).
  const plainHits = docs.filter((d) => {
    const bytes = Buffer.from(d.fields.ct?.stringValue ?? "", "base64").toString("latin1");
    return ["cloud test", "Test Bank", "sample expense", "777.77", "77777"].some((t) => bytes.includes(t));
  }).length;
  check(shapes && plainHits === 0, `records in the cloud hold only ciphertext (fields ${shapes ? "ok" : "unexpected"}, plain text found in ${plainHits})`);
  await A.page.reload();
  await unlockWithPass(A.page, "not the passphrase");
  await A.page.waitForSelector("#lk_e:not([hidden])", { timeout: 20000 });
  check(/doesn't match/.test(await A.page.innerText("#lk_e")), "a wrong passphrase is refused");
  await A.page.fill("#lk_p", PASS1);
  await A.page.click("#lock .btn.pri");
  await A.page.waitForSelector("#lock", { state: "detached", timeout: 30000 });
  const fA = await moneyFrame(A.page, "activity");
  const back = (await plannerTxns(fA)).find((t) => t.note === "cloud test 42");
  check(back?.amount === 777.77, `after reload the edit is back as ₹777.77 (got ${back?.amount})`);

  /* 4a. The passphrase lock is Argon2id; an older (PBKDF2) one is upgraded at the next passphrase unlock */
  const CRY = await import("../../app/core/crypto.ts");
  const fromFs = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, "stringValue" in v ? v.stringValue : "integerValue" in v ? Number(v.integerValue) : "mapValue" in v ? fromFs(v.mapValue.fields ?? {}) : null]));
  const toFs = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? { stringValue: v } : typeof v === "number" ? { integerValue: String(v) } : { mapValue: toFs(v) }])) });
  const keyUrl = `${FS}/homes/${home}/keys/${OWNER_UID}`;
  let wrap = fromFs((await api(keyUrl, {}, owner)).body.fields ?? {});
  check(wrap.kdf === "argon2id" && wrap.m === 131072 && wrap.t === 3 && wrap.p === 1 && !("iter" in wrap), `the passphrase lock in the cloud is Argon2id, 128 MB, 3 passes (${wrap.kdf} m=${wrap.m} t=${wrap.t})`);
  const dekRaw = await CRY.unwrapWithPass(PASS1, wrap);
  check(!!dekRaw, "…and opens with the passphrase");
  const old = await CRY.wrapWithPass(PASS1, dekRaw, "pbkdf2");
  const put = await api(keyUrl, { method: "PATCH", body: JSON.stringify(toFs(old)) }, owner);
  check(put.status === 200, `rules: an older PBKDF2 lock is still accepted (HTTP ${put.status})`);
  await denied0("rules: a lock with an unknown method is refused", api(keyUrl, { method: "PATCH", body: JSON.stringify(toFs({ ...old, kdf: "md5" })) }, owner));
  await A.page.reload();
  await unlockWithPass(A.page, PASS1);
  await A.page.waitForSelector("#lock", { state: "detached", timeout: 30000 });
  await A.page.waitForTimeout(3000);
  wrap = fromFs((await api(keyUrl, {}, owner)).body.fields ?? {});
  check(wrap.kdf === "argon2id" && !("iter" in wrap) && !!(await CRY.unwrapWithPass(PASS1, wrap)), `after a passphrase unlock, the older lock was upgraded to Argon2id (${wrap.kdf ?? "pbkdf2"})`);

  progress("household");
  /* 4b. Household: a home and a to-do are saved encrypted, survive a Money re-import, and come back after a reload */
  await A.page.goto(`${BASE}/#/household`);
  await A.page.waitForSelector("#hhView #addHome", { timeout: 20000 });
  await A.page.click("#hhView #addHome");
  await A.page.fill("#mvLayer #f_hname", "Cloud home");
  await A.page.click("#mvLayer #sv");
  await A.page.evaluate(() => { location.hash = "#/household/lists"; });
  await A.page.waitForSelector("#hhView #hhNew", { timeout: 20000 });
  await A.page.fill("#hhView #hhNew", "Cloud to-do 9");
  await A.page.press("#hhView #hhNew", "Enter");
  await A.page.waitForTimeout(3000);
  const hhDocs = [...((await api(`${FS}/homes/${home}/hhItems?pageSize=50`)).body.documents ?? []), ...((await api(`${FS}/homes/${home}/hhHomes?pageSize=50`)).body.documents ?? [])];
  const hhPlain = hhDocs.filter((d) => ["Cloud to-do", "Cloud home"].some((t) => Buffer.from(d.fields.ct?.stringValue ?? "", "base64").toString("latin1").includes(t))).length;
  check(hhDocs.length >= 2 && hhPlain === 0 && hhDocs.every((d) => Object.keys(d.fields).every((k) => allowed.has(k))), `household records are in the cloud as ciphertext only (${hhDocs.length} records)`);
  /* Habits: a habit and today's tick are saved encrypted too (checked again after the re-import and reload) */
  await A.page.goto(`${BASE}/#/habits`);
  await A.page.waitForSelector("#hbView #hbStarters", { timeout: 20000 });
  await A.page.click("#hbView #hbStarters");
  await A.page.check("#mvLayer #hs0");
  await A.page.click("#mvLayer #sv");
  await A.page.click("#hbView .hbrow .hbtick");
  await A.page.waitForTimeout(3000);
  const hbDocs = [...((await api(`${FS}/homes/${home}/habits?pageSize=50`)).body.documents ?? []), ...((await api(`${FS}/homes/${home}/habitLog?pageSize=50`)).body.documents ?? [])];
  const hbPlain = hbDocs.filter((d) => ["Walk 30 min", "habitLog"].some((t) => Buffer.from(d.fields.ct?.stringValue ?? "", "base64").toString("latin1").includes(t))).length;
  check(hbDocs.length >= 2 && hbPlain === 0 && hbDocs.every((d) => Object.keys(d.fields).every((k) => allowed.has(k))), `a habit and its tick are in the cloud as ciphertext only (${hbDocs.length} records)`);
  /* Vehicles and Documents: a car, a person and their Aadhaar are saved encrypted (checked again after the reload) */
  const tap = async (sel) => { try { await A.page.click(sel, { timeout: 15000 }); } catch (e) { await shot(A.page, "tap-failed"); throw new Error(`tap ${sel}: ${e.message.split("\n")[0]} | screen: ${(await A.page.innerText("body").catch(() => "")).replace(/\s+/g, " ").slice(0, 300)}`); } };
  await A.page.goto(`${BASE}/#/household/veh`);
  await A.page.waitForSelector("#hhView #addVeh", { timeout: 20000 });
  await tap("#hhView #addVeh");
  await A.page.fill("#mvLayer #f_vname", "Cloud car");
  await tap("#mvLayer #sv");
  await tap("#mvLayer #cx");
  await A.page.goto(`${BASE}/#/docs`);
  await A.page.waitForSelector('#dView [data-addowner="people"]', { timeout: 20000 });
  await tap('#dView [data-addowner="people"]');
  await A.page.fill("#mvLayer #f_oname", "Cloud person");
  await tap("#mvLayer #sv");
  await A.page.waitForSelector('#dView [data-add="aadhaar"]', { timeout: 20000 });
  await tap('#dView [data-add="aadhaar"]');
  await A.page.fill("#mvLayer #f_dnum", "1234 5678 9012");
  await tap("#mvLayer #sv");
  await A.page.waitForTimeout(3000);
  const dcDocs = [];
  for (const c of ["hhVehicles", "docs", "docOwners"]) dcDocs.push(...((await api(`${FS}/homes/${home}/${c}?pageSize=50`)).body.documents ?? []));
  const dcPlain = dcDocs.filter((d) => ["Cloud car", "Cloud person", "aadhaar", "9012"].some((t) => Buffer.from(d.fields.ct?.stringValue ?? "", "base64").toString("latin1").includes(t))).length;
  check(dcDocs.length >= 3 && dcPlain === 0 && dcDocs.every((d) => Object.keys(d.fields).every((k) => allowed.has(k))), `a vehicle, a person and their Aadhaar are in the cloud as ciphertext only (${dcDocs.length} records)`);
  /* Health: a reading and a medicine for the person added above, saved encrypted */
  await A.page.goto(`${BASE}/#/health`);
  await A.page.waitForSelector("#hlView #hlRead", { timeout: 20000 });
  await tap("#hlView #hlRead");
  await A.page.fill("#mvLayer #f_rv", "70.5");
  await tap("#mvLayer #sv");
  await tap("#hlView #hlMed");
  await A.page.fill("#mvLayer #f_mname", "Cloud vitamin");
  await tap("#mvLayer #sv");
  await A.page.waitForTimeout(3000);
  const hlDocs = [];
  for (const c of ["hlReadings", "hlMeds"]) hlDocs.push(...((await api(`${FS}/homes/${home}/${c}?pageSize=50`)).body.documents ?? []));
  const hlPlain = hlDocs.filter((d) => ["Cloud vitamin", "70.5", "weight"].some((t) => Buffer.from(d.fields.ct?.stringValue ?? "", "base64").toString("latin1").includes(t))).length;
  check(hlDocs.length >= 2 && hlPlain === 0 && hlDocs.every((d) => Object.keys(d.fields).every((k) => allowed.has(k))), `a reading and a medicine are in the cloud as ciphertext only (${hlDocs.length} records)`);
  /* Backup: a full backup downloads (made from the key the cloud keeps), and the weekly switch is saved encrypted */
  await A.page.goto(`${BASE}/#/settings`);
  await A.page.waitForSelector("#bkCard #bkDown", { timeout: 20000 });
  const [bk] = await Promise.all([A.page.waitForEvent("download", { timeout: 30000 }), A.page.click("#bkCard #bkDown")]);
  const bkText = (await readFile(await bk.path())).toString("utf8");
  check(JSON.parse(bkText).kind === "akhila-vrutta-backup" && !/Cloud to-do|Walk 30 min/.test(bkText), `a full backup downloads, nothing readable in it (${bk.suggestedFilename()})`);
  await A.page.click("#bkCard #bkWeekly");
  await A.page.waitForTimeout(3000);
  const bkDocs = (await api(`${FS}/homes/${home}/backupLog?pageSize=50`)).body.documents ?? [];
  check(bkDocs.length >= 2 && bkDocs.every((d) => Object.keys(d.fields).every((k) => allowed.has(k))), `the backup log and the weekly switch are in the cloud as ciphertext (${bkDocs.length} records)`);
  await A.page.click("#bkCard #bkWeekly");
  await A.page.waitForTimeout(2000);   // its save redraws Settings
  await A.page.goto(`${BASE}/#/settings`);
  await A.page.setInputFiles("#impFile", SAMPLE);
  await A.page.click("#impGo");
  await A.page.waitForFunction(() => /Imported|up to date/.test(document.querySelector("#toast")?.textContent ?? ""), null, { timeout: 30000 });
  await A.page.reload();
  await unlockWithPass(A.page, PASS1);
  await A.page.waitForSelector("#lock", { state: "detached", timeout: 30000 });
  await A.page.goto(`${BASE}/#/household`);
  await A.page.waitForSelector("#hhView .hchip", { timeout: 20000 });
  await A.page.evaluate(() => { location.hash = "#/household/lists"; });
  await A.page.waitForTimeout(500);
  const hhText = await A.page.innerText("#hhView");
  check(/Cloud home/.test(hhText) && /Cloud to-do 9/.test(hhText), "after a Money re-import and a reload, the home and the to-do are still there");
  await A.page.goto(`${BASE}/#/habits`);
  await A.page.waitForSelector("#hbView .hbrow", { timeout: 20000 });
  check(/Walk 30 min/.test(await A.page.innerText("#hbView")) && (await A.page.$$("#hbView .hbtick.on")).length === 1, "…and so are the habit and today's tick");
  await A.page.goto(`${BASE}/#/docs`);
  await A.page.waitForSelector("#dView .row", { timeout: 20000 });
  const dv = await A.page.innerText("#dView");
  check(/Cloud car/.test(dv) && /Cloud person/.test(dv) && /Aadhaar/.test(dv), "…and so are the car, the person and the Aadhaar record");
  await A.page.goto(`${BASE}/#/health`);
  await A.page.waitForSelector("#hlView .hltile", { timeout: 20000 });
  check(/70\.5/.test(await A.page.innerText("#hlView")) && /Cloud vitamin/.test(await A.page.innerText("#hlView")), "…and so are the reading and the medicine");
  await moneyFrame(A.page, "activity");   // back to Transactions for the next steps

  progress("second device");
  /* 5. Second device: "welcome back", same data, and changes flow between devices */
  const B = await device("device 2");
  await signInAndSetup(B.page, { create: false, pass: PASS1 });
  const fB = await moneyFrame(B.page, "activity");
  check((await plannerTxns(fB)).length === (await plannerTxns(fA)).length, "second device sees the same transactions as the first");
  await fB.evaluate(() => upsert("txns", { id: uid(), type: "expense", amount: 12.5, date: new Date().toISOString().slice(0, 10), accountId: S.data.accounts[0].id, note: "from device 2", updatedAt: Date.now() }));
  let seen = false;
  for (let i = 0; i < 20 && !seen; i++) { await A.page.waitForTimeout(500); seen = (await plannerTxns(fA)).some((t) => t.note === "from device 2"); }
  check(seen, "a change on device 2 reaches device 1 without reloading");
  let drawn = false;
  for (let i = 0; i < 20 && !drawn; i++) { drawn = (await A.page.innerText("#moneyView #view").catch(() => "")).includes("from device 2"); if (!drawn) await A.page.waitForTimeout(500); }
  check(drawn, "…and shows on device 1's Transactions page (drawn by the app from the cloud data)");
  // The app's own add form (not the planner's): saved encrypted, reaches the other device.
  await A.page.click(".fab");
  await A.page.waitForSelector("#mvLayer #modal .sheet #f_amount", { timeout: 10000 });
  await A.page.fill("#mvLayer #f_amount", "321.5");
  await A.page.evaluate(() => { const s = document.querySelector("#mvLayer #f_categoryId"); s.value = [...s.options].find((o) => o.value).value; });
  await A.page.fill("#mvLayer #f_note", "added with the new form");
  await A.page.click("#mvLayer #sv");
  let formSeen = false;
  for (let i = 0; i < 30 && !formSeen; i++) { await B.page.waitForTimeout(500); formSeen = (await plannerTxns(fB)).some((t) => t.note === "added with the new form" && t.amount === 321.5); }
  check(formSeen, "an entry added with the app's own form reaches device 2 (₹321.50)");
  await shot(B.page, "device2");

  progress("passphrase change");
  /* 6. Change the passphrase on device 1; device 2 must use the new one */
  await A.page.goto(`${BASE}/#/settings`);
  await A.page.click("#secPass");
  await A.page.fill("#op", PASS1); await A.page.fill("#np", PASS2); await A.page.fill("#np2", PASS2);
  await A.page.click("#passF .btn.pri");
  await A.page.waitForFunction(() => /Passphrase changed/.test(document.querySelector("#toast")?.textContent ?? ""), null, { timeout: 20000 });
  check(true, "passphrase changed");
  await B.page.reload();
  await unlockWithPass(B.page, PASS1);
  await B.page.waitForSelector("#lk_e:not([hidden])", { timeout: 20000 });
  await B.page.fill("#lk_p", PASS2); await B.page.click("#lock .btn.pri");
  await B.page.waitForSelector("#lock", { state: "detached", timeout: 30000 });
  ok("device 2: old passphrase refused, new one works");

  progress("secret key");
  /* 6b. The Secret Key: turned on on device 1 (Emergency Kit downloaded), the key in the cloud needs it; device 2
     is asked for it once, then remembers it */
  await A.page.goto(`${BASE}/#/settings`);
  await A.page.waitForSelector("#skCard #skOn", { timeout: 20000 });
  await A.page.click("#skCard #skOn");
  const SK = (await A.page.innerText("#skCard #skKey")).trim();
  const [kit] = await Promise.all([A.page.waitForEvent("download", { timeout: 20000 }), A.page.click("#skCard #skDl")]);
  const kitText = (await readFile(await kit.path())).toString("latin1");
  check(/^A1-[0-9A-Z]{6}-[0-9A-Z]{6}-[0-9A-Z]{6}-[0-9A-Z]{6}-[0-9A-Z]{4}$/.test(SK) && kitText.startsWith("%PDF") && kitText.includes(SK), `a Secret Key is made, and its Emergency Kit downloads as a PDF with the key in it (${kit.suggestedFilename()})`);
  await A.page.fill("#skCard #skLast", SK.slice(-4));
  await A.page.fill("#skCard #skPass", PASS2);
  await A.page.click("#skF .btn.pri");
  await A.page.waitForFunction(() => /Secret Key is on/.test(document.querySelector("#toast")?.textContent ?? ""), null, { timeout: 30000 });
  const keyDoc = (await api(`${FS}/homes/${home}/keys/${OWNER_UID}`, {}, owner)).body.fields ?? {};
  check(keyDoc.sk?.integerValue === "1" && keyDoc.kdf?.stringValue === "argon2id", "the key in the cloud now needs the Secret Key too");
  await B.page.reload();
  await unlockWithPass(B.page, PASS2);
  await B.page.waitForSelector("#lk_skw:not([hidden])", { timeout: 30000 });
  check(/Secret Key/.test(await B.page.innerText("#lk_e")), "device 2: the passphrase alone isn't enough any more; it asks for the Secret Key");
  await B.page.fill("#lk_sk", "A1-AAAAAA-AAAAAA-AAAAAA-AAAAAA-AAAA");
  await B.page.click("#lock .btn.pri");
  await B.page.waitForTimeout(1500);
  check(/isn't right|doesn't match/.test(await B.page.innerText("#lk_e")), "…a wrong Secret Key is refused");
  await B.page.fill("#lk_sk", SK.toLowerCase().replace(/-/g, " "));
  await B.page.click("#lock .btn.pri");
  await B.page.waitForSelector("#lock", { state: "detached", timeout: 30000 });
  await B.page.reload();
  await unlockWithPass(B.page, PASS2);
  await B.page.waitForSelector("#lock", { state: "detached", timeout: 30000 });
  ok("…the right one (typed in any case, with spaces) unlocks it, and next time the passphrase is enough there");

  progress("fingerprint");
  /* 7. Fingerprint unlock (virtual authenticator with PRF) */
  const C = await device("device 3", { bio: true });
  try {
    await signInAndSetup(C.page, { create: false, pass: PASS2, mode: "bio", sk: SK });
    await C.page.reload();
    await C.page.waitForSelector("#lock", { state: "detached", timeout: 30000 });
    ok("fingerprint: set up, and the app unlocks with it after a reload");
  } catch (e) {
    const t = await lockText(C.page).catch(() => "");
    if (/PRF/.test(t)) console.log("- fingerprint: skipped, this browser's test authenticator has no PRF");
    else bad(`fingerprint unlock: ${e.message.split("\n")[0]} | screen: ${t.replace(/\s+/g, " ").slice(0, 160)}`);
    await shot(C.page, "bio");
  }

  progress("intruder and rules");
  /* 8. Open to everyone: another Google account sets up its own home, and still can't touch the owner's */
  const X = await device("intruder", { user: "intruder" });
  await X.page.goto(BASE);
  check(/Only you can read it/.test(await lockText(X.page)) && /Terms/.test(await lockText(X.page)), "a new account sees the welcome: what the app is, privacy, Terms and Privacy policy");
  await signInAndSetup(X.page, { create: true, pass: "lantern ochre walrus fifteen quilt" });
  await X.page.waitForSelector(".tdy", { timeout: 30000 });
  ok("another Google account sets up its own home and opens Today");
  await shot(X.page, "second-account");
  const intr = await idToken("intruder");
  const xUser = await api(`${FS}/users/intruder-uid`, {}, intr), xHome = xUser.body?.fields?.home?.stringValue;
  check(xUser.status === 200 && !!xHome && xHome !== home, `…its own home, not the owner's (${xHome})`);
  check((await api(`${FS}/homes/${xHome}`, {}, intr)).status === 200 && (await api(`${FS}/homes/${xHome}`, {}, owner)).status === 403, "…which it can read, and the owner can't");
  check(typeof intr === "string" && intr.length > 20 && typeof owner === "string" && owner.length > 20, "test sign-in tokens obtained");
  const denied = async (label, p) => { const r = await p; check(r.status === 403, `rules: ${label} (HTTP ${r.status}${r.status === 403 ? "" : " " + JSON.stringify(r.body).slice(0, 160)})`); };
  await denied("another account can't read the home", api(`${FS}/homes/${home}`, {}, intr));
  await denied("another account can't list records", api(`${FS}/homes/${home}/txns?pageSize=5`, {}, intr));
  await denied("another account can't read the wrapped key", api(`${FS}/homes/${home}/keys/${OWNER_UID}`, {}, intr));
  await denied("another account can't read the owner's account record", api(`${FS}/users/${OWNER_UID}`, {}, intr));
  await denied("even the owner can't save an unencrypted record",
    api(`${FS}/homes/${home}/txns?documentId=plain1`, { method: "POST", body: JSON.stringify({ fields: { amount: { integerValue: "500" } } }) }, owner));
  await denied("records can't go into unknown collections",
    api(`${FS}/homes/${home}/secrets?documentId=x`, { method: "POST", body: JSON.stringify({ fields: { iv: { stringValue: "AAAAAAAAAAAAAAAA" }, ct: { stringValue: "abc" }, by: { stringValue: OWNER_UID } } }) }, owner));
  check((await api(`${FS}/prices/mf`, {}, intr)).status !== 403, "another account can read the public price lists");
  await denied("another account can't write a price watch list", api(`${FS}/priceWatch/intruder-uid`, { method: "PATCH", body: JSON.stringify({ fields: { us: { arrayValue: { values: [{ stringValue: "AAPL" }] } } } }) }, intr));
  const pw = await api(`${FS}/priceWatch/${OWNER_UID}`, { method: "PATCH", body: JSON.stringify({ fields: { us: { arrayValue: { values: [{ stringValue: "AAPL" }] } }, at: { stringValue: "now" } } }) }, owner);
  check(pw.status === 200, `rules: the owner can save their US ticker list (HTTP ${pw.status})`);
  const fnAs = async (name, token, data) => {
    const r = await fetch(`${FN}/${name}`, { signal: AbortSignal.timeout(60000), method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const a1 = await fnAs("askClaude", intr, { messages: [{ role: "user", content: "hi" }] });
  check(a1.status === 403 || a1.body?.error?.status === "PERMISSION_DENIED", `functions: another account can't ask Claude (HTTP ${a1.status} ${a1.body?.error?.status ?? ""})`);
  const a2 = await fnAs("refreshPricesNow", intr, {});
  check(a2.status === 403 || a2.body?.error?.status === "PERMISSION_DENIED", `functions: another account can't refresh prices (HTTP ${a2.status} ${a2.body?.error?.status ?? ""})`);
  // Claude is on for the owner only (a public release: off unless switched on by hand in aiAccess/{uid})
  const s1 = await fnAs("aiStatus", owner, {}), s2 = await fnAs("aiStatus", intr, {});
  check(s1.body?.result?.on === true && s2.body?.result?.on === false, `functions: Claude is on for the owner and off for another account (${JSON.stringify(s1.body?.result)} / ${JSON.stringify(s2.body?.result)})`);
  await denied("an account can't switch Claude on for itself", api(`${FS}/aiAccess/intruder-uid`, { method: "PATCH", body: JSON.stringify({ fields: { on: { booleanValue: true } } }) }, intr));
  // Admin (owner only): counts, and switching Claude on for someone
  const st = await fnAs("adminStats", owner, {});
  check(st.body?.result?.accounts >= 2, `admin: the owner sees how many accounts there are (${JSON.stringify(st.body?.result)})`);
  for (const f of ["adminStats", "adminAiList", "adminAiSet"]) { const r = await fnAs(f, intr, { uid: "intruder-uid", on: true }); check(r.status === 403 || r.body?.error?.status === "PERMISSION_DENIED", `admin: another account can't use ${f}`); }
  await fnAs("adminAiSet", owner, { uid: "intruder-uid", name: "Test", on: true });
  const on2 = await fnAs("aiStatus", intr, {}), lst = await fnAs("adminAiList", owner, {});
  check(on2.body?.result?.on === true && lst.body?.result?.people?.some((p) => p.uid === "intruder-uid" && p.name === "Test" && p.on), "admin: the owner switches Claude on for another account, and it's on for them");
  await fnAs("adminAiSet", owner, { uid: "intruder-uid", remove: true });
  check((await fnAs("aiStatus", intr, {})).body?.result?.on === false, "…and off again");
  // Deleting an account removes everything of theirs, and nothing of anyone else's
  const del0 = await fnAs("deleteAccount", intr, {});
  check(del0.status === 400 || del0.body?.error?.status === "INVALID_ARGUMENT", "deleting an account needs the typed confirmation");
  const del = await fnAs("deleteAccount", intr, { confirm: "DELETE" });
  check(del.body?.result?.ok === true, `an account deletes itself (${JSON.stringify(del.body).slice(0, 120)})`);
  check((await api(`${FS}/homes/${xHome}`)).status === 404 && (await api(`${FS}/homes/${xHome}/keys/intruder-uid`)).status === 404 && (await api(`${FS}/users/intruder-uid`)).status === 404, "…its home, key and account record are gone");
  check((await api(`${FS}/homes/${home}`)).status === 200, "…and the owner's home is untouched");
  const ownRead = await api(`${FS}/homes/${home}`, {}, owner);
  check(ownRead.status === 200, `rules: the owner can read their home (HTTP ${ownRead.status})`);

  for (const d of [A, B, C, X]) await d.ctx.close();
} catch (e) {
  bad(`stopped: ${e.message.split("\n")[0]}`);
  for (const [name, page] of openPages) {
    const t = await page.locator("#lock").innerText({ timeout: 1000 }).catch(() => "(no lock screen)");
    console.error(`  ${name} screen: ${t.replace(/\s+/g, " ").slice(0, 300)}`);
    await page.screenshot({ path: `${SHOTS}/failed-${name.replace(/\W/g, "")}.png` }).catch(() => {});
  }
  console.error("  console:\n    " + consoleLines.slice(-25).join("\n    "));
}
await browser.close();
const unclassifiedLines = consoleLines.filter((l) => /not classified as money/.test(l));
if (unclassifiedLines.length) bad(`number fields saved that aren't classified as money or not:\n  ${unclassifiedLines.join("\n  ")}`);
if (pageErrors.length) bad(`errors on the pages:\n  ${pageErrors.join("\n  ")}`);
console.log(failed ? `cloud: ${failed} check(s) failed` : "cloud: all passed");
process.exit(failed ? 1 : 0);
