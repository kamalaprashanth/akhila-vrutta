// The Android app on an emulator (CI). Drives its WebView through Playwright's Android support (debug builds only).
//   node tests/android/android.mjs test <test.apk>   Money test page: native plugins, pages, reminders, Back, auto-lock
//   node tests/android/android.mjs app  <app.apk>    the real app: opens to the sign-in screen with its own Firebase SDK
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { _android } from "playwright";

const [mode, apk] = process.argv.slice(2);
const PKG = "in.kp.akhilavrutta";
const adb = (...a) => execFileSync("adb", a, { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) fails++; };
mkdirSync("test-results", { recursive: true });

async function launch() {
  adb("shell", "am", "start", "-W", "-n", `${PKG}/.MainActivity`);
  return connect();
}
// Playwright's Android support finds the app's WebView through adb and gives a page for it.
let device = null;
async function connect() {
  device ??= (await _android.devices())[0];
  if (!device) throw new Error("no emulator found");
  const wv = await device.webView({ pkg: PKG }, { timeout: 60000 });
  const p = await wv.page();
  await p.waitForLoadState();
  return { b: { close: async () => {} }, p };
}
const running = () => { try { return !!adb("shell", "pidof", PKG); } catch { return false; } };
const back = () => adb("shell", "input", "keyevent", "4");

adb("install", "-r", "-g", apk);
adb("shell", "am", "force-stop", PKG);

if (mode === "test") {
  let { b, p } = await launch();
  await p.waitForSelector("#moneyView #view > *", { timeout: 30000 });
  ok(await p.evaluate(() => window.Capacitor?.isNativePlatform?.() === true), "runs as the Android app (Capacitor)");
  const bio = await p.evaluate(() => window.Capacitor.Plugins.AkhilaNative.bioAvailable().then((r) => r, (e) => ({ err: e.message })));
  ok(typeof bio.available === "boolean", `the app's own plugin answers (fingerprint available on this emulator: ${bio.available})`);
  const miss = await p.evaluate(() => window.Capacitor.Plugins.AkhilaNative.bioSecret().then(() => "unlocked?", (e) => e.code));
  ok(miss === "missing", `no fingerprint key yet: unlocking with it says so (${miss})`);
  ok(/Net worth|This month|Overview/i.test(await p.innerText("#moneyView #view")), "Overview is drawn");
  await p.screenshot({ path: "test-results/android-overview.png" });

  // reminders: scheduled on the phone, names only
  let pend = [];
  for (let i = 0; i < 20 && !pend.length; i++) { await sleep(1000); pend = (await p.evaluate(() => window.Capacitor.Plugins.LocalNotifications.getPending())).notifications; }
  ok(pend.length > 0, `bill reminders are scheduled on the phone (${pend.length})`);
  ok(pend.every((n) => !/₹|\d{3}/.test(`${n.title} ${n.body}`)), `…naming the bill only, no amounts (e.g. "${pend[0]?.title}")`);
  ok(pend.every((n) => new Date(n.schedule?.at).getHours() === 9), "…at 9 AM");

  // Back: closes a sheet, then goes back a page, then at Overview twice closes the app
  await p.click("#moneyAdd"); await sleep(600);
  ok(await p.evaluate(() => !!document.querySelector("#mvLayer #modal .sheet")), "+ opens the add form");
  back(); await sleep(800);
  ok(await p.evaluate(() => !document.querySelector("#mvLayer #modal .sheet")), "Back closes the form");
  await p.evaluate(() => { location.hash = "#/money/activity"; }); await sleep(600);
  await p.evaluate(() => { location.hash = "#/money/plan"; }); await sleep(600);
  back(); await sleep(800);
  ok(/activity/.test(await p.evaluate(() => location.hash)), `Back goes to the page before (${await p.evaluate(() => location.hash)})`);
  back(); await sleep(800);
  ok(/home/.test(await p.evaluate(() => location.hash)), "…and again, to Overview");
  back(); await sleep(800);
  ok(running(), "at Overview, one Back doesn't close the app");
  back(); await sleep(1500);
  ok(!running(), "…a second Back does");
  await b.close().catch(() => {});

  // auto-lock: a few seconds away keeps the page; more than a minute away locks (reloads) it
  ({ b, p } = await launch());
  await p.waitForSelector("#moneyView #view > *", { timeout: 30000 });
  await p.evaluate(() => { window.__still = 1; });
  adb("shell", "input", "keyevent", "3"); await sleep(5000);
  adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`); await sleep(2000);
  ok(await p.evaluate(() => window.__still === 1), "5 seconds away: still open");
  adb("shell", "input", "keyevent", "3"); await sleep(65000);
  adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`); await sleep(3000);
  await b.close().catch(() => {});
  ({ b, p } = await connect());
  await p.waitForSelector("#moneyView #view > *", { timeout: 30000 });
  ok(await p.evaluate(() => window.__still === undefined), "over a minute away: locked (opened afresh)");
  await b.close().catch(() => {});
}

if (mode === "app") {
  const { b, p } = await launch();
  await p.waitForSelector("#lock", { timeout: 30000 });
  await p.waitForSelector("#lk_g", { timeout: 30000 });
  ok(/Sign in with Google/.test(await p.innerText("#lock")), "opens to the sign-in screen");
  await sleep(1500);
  const res = await p.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name));
  ok(res.some((u) => /\/firebase\/firebase-auth\.js$/.test(u)) && !res.some((u) => /gstatic\.com\/firebasejs/.test(u)), "Firebase comes from inside the app, not the internet");
  ok(await p.evaluate(() => !!window.AV_CONFIG?.googleClientId), "the Google sign-in client is set");
  await p.screenshot({ path: "test-results/android-lock.png" });
  await b.close().catch(() => {});
}

console.log(fails ? `android ${mode}: ${fails} failed` : `android ${mode}: all passed`);
process.exit(fails ? 1 : 0);
