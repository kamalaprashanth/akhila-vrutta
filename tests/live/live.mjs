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
  ["/money/app", "text/html", 500], ["/money/money.css", "text/css", 10000], ["/money/legacy.js", "javascript", 100000],
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

/* 2. In a browser, with the real CSP: the lock screen appears, Firebase loads, nothing errors */
const browser = await chromium.launch();
for (const [label, vp] of [["phone", { width: 390, height: 844 }], ["laptop", { width: 1366, height: 800 }]]) {
  const page = await browser.newPage({ viewport: vp });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (!/fonts\.g/.test(r.url())) errors.push(`failed: ${r.url()} ${r.failure()?.errorText}`); });
  await page.goto(BASE);
  try {
    await page.waitForSelector("#lock #lk_g", { timeout: 20000 });
    await page.waitForFunction(() => performance.getEntriesByType("resource").some((e) => /firebase-firestore\.js/.test(e.name)), null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    check(true, `${label}: lock screen shows and Firebase loads`);
  } catch { check(false, `${label}: lock screen or Firebase didn't load`); }
  await page.screenshot({ path: `${SHOTS}/${label}-lock.png` });

  // The money frame page on its own: its styles and script must load under the real CSP.
  await page.goto(`${BASE}/money/app`);
  await page.waitForTimeout(1500);
  const frame = await page.evaluate(() => ({
    styled: [...document.styleSheets].some((s) => { try { return s.cssRules.length > 50; } catch { return false; } }),
    script: typeof window.S === "object" || /Open this from Akhila Vrutta/.test(document.body.textContent ?? ""),
  }));
  check(frame.styled && frame.script, `${label}: money frame loads its styles and script`);
  await page.screenshot({ path: `${SHOTS}/${label}-money-frame.png` });
  check(errors.length === 0, `${label}: no errors in the browser${errors.length ? ":\n    " + errors.join("\n    ") : ""}`);
  await page.close();
}
await browser.close();
console.log(failed ? `live ${BASE}: ${failed} check(s) failed` : `live ${BASE}: all passed`);
process.exit(failed ? 1 : 0);
