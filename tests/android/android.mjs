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

// when something goes wrong, what Android said (a crash, the WebView's renderer going away)
const androidLog = () => { try { return adb("logcat", "-d", "-v", "brief", "AndroidRuntime:E", "chromium:W", "cr_*:W", "Capacitor:W", "ActivityManager:I", "*:S").split("\n").filter((l) => /akhilavrutta|FATAL|crash|renderer|Kill|died|chromium|Capacitor/i.test(l)).slice(-40).join("\n   "); } catch (e) { return String(e); } };
process.on("uncaughtException", (e) => { console.log(`✗ stopped: ${e.message.split("\n")[0]}\n  Android log:\n   ${androidLog()}`); process.exit(1); });
process.on("unhandledRejection", (e) => { console.log(`✗ stopped: ${String(e?.message ?? e).split("\n")[0]}\n  Android log:\n   ${androidLog()}`); process.exit(1); });
adb("logcat", "-c");
adb("install", "-r", "-g", apk);
adb("shell", "am", "force-stop", PKG);

if (mode === "test") {
  // a start can replace its page once while it opens (a WebView left from before): try again then
  const opened = async (how) => {
    for (let i = 0; ; i++) {
      try { const r = await how(); await r.p.waitForSelector("#moneyView #view > *", { timeout: 30000 }); return r; }
      catch (e) { if (i === 2) throw e; console.log("  (the app's page went away while opening; again)"); await sleep(3000); }
    }
  };
  let { b, p } = await opened(launch);
  // the emulator sometimes drops the connection to the WebView: reconnect and try once more
  const ev = async (f, arg) => {
    try { return await p.evaluate(f, arg); }
    catch (e) { if (!/closed/.test(e.message)) throw e; console.log("  (lost the connection to the page; reconnecting)"); await sleep(2000); ({ p } = await connect()); return p.evaluate(f, arg); }
  };
  const logs = []; p.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`)); p.on("pageerror", (e) => logs.push(`error: ${e.message}`));
  process.on("exit", () => { if (fails) console.log("  page log:\n   " + logs.filter((l) => !/getPending|console\.groupEnd/.test(l)).slice(-40).join("\n   ")); });
  await p.waitForSelector("#moneyView #view > *", { timeout: 30000 });
  ok(await ev(() => window.Capacitor?.isNativePlatform?.() === true), "runs as the Android app (Capacitor)");
  const win = adb("shell", "dumpsys", "window", "windows").split(/\n(?=\s*Window #)/).find((b) => b.includes(`${PKG}/${PKG}.MainActivity`) || b.includes(`${PKG}/.MainActivity`)) ?? "";
  ok(/\bSECURE\b/.test(win), "the app's window is marked secure (blank in recent apps, no screenshots)");
  const bio = await ev(() => window.Capacitor.Plugins.AkhilaNative.bioAvailable().then((r) => r, (e) => ({ err: e.message })));
  ok(typeof bio.available === "boolean", `the app's own plugin answers (fingerprint available on this emulator: ${bio.available})`);
  const miss = await ev(() => window.Capacitor.Plugins.AkhilaNative.bioSecret().then(() => "unlocked?", (e) => e.code));
  ok(miss === "missing", `no fingerprint key yet: unlocking with it says so (${miss})`);
  const ov = await p.innerText("#moneyView #view");
  ok(/Net worth|This month|Overview|Balance/i.test(ov), "Overview is drawn");
  if (!/Net worth|This month|Overview|Balance/i.test(ov)) console.log("  page text:", ov.slice(0, 400).replace(/\s+/g, " "), "| hash", await ev(() => location.hash), "| body", (await p.innerText("body")).slice(0, 300).replace(/\s+/g, " "));
  await p.screenshot({ path: "test-results/android-overview.png" });

  // reminders: scheduled on the phone, names only
  console.log("  permission:", JSON.stringify(await ev(() => window.Capacitor.Plugins.LocalNotifications.checkPermissions())));
  let pend = [];
  for (let i = 0; i < 20 && !pend.length; i++) { await sleep(1000); pend = (await ev(() => window.Capacitor.Plugins.LocalNotifications.getPending())).notifications; }
  ok(pend.length > 0, `bill reminders are scheduled on the phone (${pend.length})`);
  ok(pend.every((n) => !/₹|\d{3}/.test(`${n.title} ${n.body}`)), `…naming the bill only, no amounts (e.g. "${pend[0]?.title}")`);
  ok(pend.every((n) => new Date(n.schedule?.at).getHours() === 9), "…at 9 AM");

  // a vault file out of the app: a decrypted copy saved to Downloads/Akhila Vrutta, or handed to the share sheet
  const name = `av-test-${Date.now()}.txt`, text = "Akhila Vrutta: a decrypted copy";
  const saved = await ev(([n, t]) => window.Capacitor.Plugins.AkhilaNative.saveFile({ name: n, mime: "text/plain", data: btoa(t) }).then((r) => r, (e) => ({ err: e.message })), [name, text]);
  let onDisk = ""; try { onDisk = adb("shell", "cat", `"/sdcard/Download/Akhila Vrutta/${name}"`); } catch (e) { onDisk = String(e).slice(0, 200); }
  ok(!saved.err && onDisk === text, `Save to phone puts the file in Downloads/Akhila Vrutta (${saved.err ?? saved.folder}; on disk: ${onDisk.slice(0, 60)})`);
  adb("shell", "rm", "-f", `"/sdcard/Download/Akhila Vrutta/${name}"`);
  const sh = await ev(([n, t]) => window.Capacitor.Plugins.AkhilaNative.shareFile({ name: n, mime: "text/plain", data: btoa(t) }).then(() => "ok", (e) => e.message), [name, text]);
  const focus = () => adb("shell", "dumpsys", "window").split("\n").filter((l) => /mCurrentFocus/.test(l)).join(" ");
  let chooser = false; for (let i = 0; i < 20 && !chooser; i++) { await sleep(500); chooser = /Chooser|Resolver|intentresolver/i.test(focus()); }
  ok(sh === "ok" && chooser, `Share opens Android's share sheet (${sh}; ${focus().trim().slice(0, 120)})`);
  let mine = false; for (let i = 0; i < 6 && !mine; i++) { back(); await sleep(1000); mine = focus().includes(PKG); }
  ok(mine, "…and Back from it returns to the app");
  await sleep(1000);

  // Back: closes a sheet, then goes back a page, then at Overview twice closes the app.
  // (The emulator delivers Back a moment later, so each step waits for its result.)
  const until = async (fn, ms = 10000) => { for (let t = 0; t < ms; t += 250) { if (await fn().catch(() => false)) return true; await sleep(250); } return false; };
  const hash = () => ev(() => `${location.hash} (Backs seen ${window.__backs ?? "?"})`).catch(() => "the app's page closed");
  await p.click("#moneyAdd");
  ok(await until(() => ev(() => !!document.querySelector("#mvLayer #modal .sheet"))), "+ opens the add form");
  // the form puts the cursor in a field, and Android's first Back only hides the keyboard
  const ime = () => /mInputShown=true|isInputViewShown=true/.test(adb("shell", "dumpsys", "input_method"));
  await sleep(1500);
  if (ime()) { back(); await until(async () => !ime(), 5000); await sleep(500); }
  await ev(() => { window.__backs = 0; window.Capacitor.Plugins.App.addListener("backButton", () => { window.__backs++; }); });
  back();
  ok(await until(() => ev(() => !document.querySelector("#mvLayer #modal .sheet"))), `Back closes the form (Back seen by the page: ${await ev(() => window.__backs)}, keyboard shown: ${ime()})`);
  await ev(() => { location.hash = "#/money/activity"; }); await sleep(800);
  await ev(() => { location.hash = "#/money/plan"; }); await sleep(800);
  back();
  ok(await until(async () => /activity/.test(await hash())), `Back goes to the page before (${await hash()})`);
  back();
  ok(await until(async () => /home/.test(await hash())), `…and again, to Overview (${await hash()})`);
  // (closing finishes the app's screen; Android may keep the process around, so look at what's on screen)
  const onScreen = () => adb("shell", "dumpsys", "window").split("\n").some((l) => /mCurrentFocus|mFocusedApp/.test(l) && l.includes(PKG));
  back();
  const hinted = await until(() => ev(() => /Press back again/.test(document.querySelector("#toast")?.textContent ?? "")), 8000);
  ok(hinted && onScreen(), "at Overview, one Back doesn't close the app (it says to press again)");
  back();
  ok(await until(async () => !onScreen(), 8000), "…a second Back straight after does");
  await b.close().catch(() => {});

  // auto-lock: a few seconds away keeps the page; more than a minute away locks (reloads) it
  // closing kept the process (and its old WebView); start clean
  adb("shell", "am", "force-stop", PKG); await sleep(1000);
  ({ b, p } = await opened(launch));
  await ev(() => { window.__still = 1; });
  adb("shell", "input", "keyevent", "3"); await sleep(5000);
  adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`); await sleep(2000);
  ok(await ev(() => window.__still === 1), "5 seconds away: still open");
  adb("shell", "input", "keyevent", "3"); await sleep(65000);
  adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`); await sleep(3000);
  await b.close().catch(() => {});
  ({ b, p } = await opened(connect));
  ok(await ev(() => window.__still === undefined), "over a minute away: locked (opened afresh)");
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
