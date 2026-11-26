// Checks a deployed copy of the app (a preview address, or the live site) as a visitor would see it,
// with the real hosting rules, headers and CSP. No sign-in needed.
// Usage: node tests/live/live.mjs https://kp-akhila-vrutta.web.app [expected build sha]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = (process.argv[2] ?? "").replace(/\/$/, "");
const SHA = (process.argv[3] ?? "").slice(0, 7);
if (!BASE) throw new Error("usage: live.mjs <url> [sha]");
const SHOTS = `test-results/live-${new URL(BASE).hostname.split(".")[0]}`;
mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (cond, m) => { if (cond) console.log(`✓ ${m}`); else { failed++; console.error(`✗ ${m}`); } };

/* 1. Files: every one the app needs loads, with the right type, and isn't an error page */
const FILES = [
  ["/", "text/html", 500], ["/app.js", "javascript", 5000], ["/app.css", "text/css", 1000], ["/config.js", "javascript", 50],
  ["/manifest.webmanifest", "", 100], ["/icons/logo.svg", "image/svg", 100], ["/icons/icon-192.png", "image/png", 500],
  ["/money/mv.css", "text/css", 10000], ["/privacy", "text/html", 2000],
  ["/money/vendor/pdfjs/pdf.min.mjs", "javascript", 10000], ["/money/vendor/pdfjs/pdf.worker.min.mjs", "javascript", 10000],
];
for (const [path, type, min] of FILES) {
  const r = await fetch(BASE + path, { redirect: "follow" });
  const body = await r.text();
  const ct = r.headers.get("content-type") ?? "";
  check(r.ok && ct.includes(type) && body.length >= min, `${path}: ${r.status} ${ct.split(";")[0]} ${body.length} bytes`);
  if (path === "/config.js") {
    check(body.includes('"projectId":"akhila-vrutta"'), "config.js is the production config");
    if (SHA) check(body.includes(`"build":"${SHA}"`), `the deployed build is ${SHA}`);
  }
  if (path === "/") {
    const h = (k) => r.headers.get(k) ?? "";
    check(/frame-ancestors 'self'/.test(h("content-security-policy")) && h("x-frame-options") === "SAMEORIGIN", "security headers: CSP and same-origin framing");
    check(/max-age=\d+/.test(h("strict-transport-security")), "security headers: HSTS");
  }
}

/* The old planner (now only the parity tests' reference) isn't part of the site. */
{ const t = await (await fetch(BASE + "/money/legacy.js")).text(), a = await (await fetch(BASE + "/money/app")).text();
  check(!t.includes("01-core.js") && !a.includes("legacy.js"), "the old planner isn't served"); }

/* 2. In a browser, with the real CSP: the lock screen appears, Firebase loads, nothing errors */
const browser = await chromium.launch();
for (const [label, vp] of [["phone", { width: 390, height: 844 }], ["laptop", { width: 1366, height: 800 }]]) {
  const page = await browser.newPage({ viewport: vp });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${m.text()} ${m.location()?.url ?? ""}`); });
  page.on("requestfailed", (r) => { if (!/fonts\.g/.test(r.url())) errors.push(`failed: ${r.url()} ${r.failure()?.errorText}`); });
  const sdk = [], appCheck = [];
  page.on("request", (r) => { if (/firebase-(app|auth|firestore)\.js/.test(r.url())) sdk.push(r.url()); });
  page.on("response", (r) => { if (/exchangeRecaptchaEnterpriseToken/.test(r.url())) appCheck.push(r.status()); });
  await page.goto(BASE);
  try {
    await page.waitForSelector("#lock #lk_g", { timeout: 20000 });
    await page.waitForFunction(() => performance.getEntriesByType("resource").some((e) => /firebase-firestore\.js/.test(e.name)), null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    check(true, `${label}: lock screen shows and Firebase loads`);
  } catch { check(false, `${label}: lock screen or Firebase didn't load`); }
  // the passphrase lock (Argon2id) runs as WebAssembly: the site's CSP must allow it
  const wasm = await page.evaluate(() => WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])).then(() => "ok", (e) => String(e))).catch((e) => String(e));
  check(wasm === "ok", `${label}: WebAssembly is allowed (for the Argon2id passphrase lock)${wasm === "ok" ? "" : ": " + wasm.slice(0, 120)}`);
  const origin = new URL(BASE).origin;
  check(sdk.length >= 3 && sdk.every((u) => u.startsWith(origin + "/firebase/")), `${label}: the Firebase SDK comes from the site itself, not Google's CDN (${sdk.map((u) => u.replace(origin, "")).join(", ") || "none seen"})`);
  // App Check (watch-only for now): reported, not required. A preview address isn't on the reCAPTCHA key's list,
  // and a headless browser may score too low, so its own messages don't count as errors here.
  console.log(`  ${label}: App Check exchange ${appCheck.length ? appCheck.join(", ") : "not seen"}`);
  for (let i = errors.length - 1; i >= 0; i--) if (/recaptcha|app-?check|AppCheck|requestStorageAccess|exchangeRecaptcha|firebaseappcheck/i.test(errors[i])) { console.log(`  (App Check, not counted) ${errors[i].slice(0, 200)}`); errors.splice(i, 1); }
  await page.screenshot({ path: `${SHOTS}/${label}-lock.png` });

  check(errors.length === 0, `${label}: no errors in the browser${errors.length ? ":\n    " + errors.join("\n    ") : ""}`);
  await page.close();
}
await browser.close();
console.log(failed ? `live ${BASE}: ${failed} check(s) failed` : `live ${BASE}: all passed`);
process.exit(failed ? 1 : 0);
