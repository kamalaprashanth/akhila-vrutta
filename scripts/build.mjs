// Builds dist/: bundles app/main.ts and app/styles.css with esbuild, copies static/,
// and writes dist/config.js from the FIREBASE_WEB_CONFIG variable (the firebaseConfig
// object copied from the Firebase console; JS object syntax is fine).
import { build } from "esbuild";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { scopeCss } from "./scope-css.mjs";

const out = "dist";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync("static", out, { recursive: true });

await build({
  entryPoints: { app: "app/main.ts" },
  bundle: true, format: "esm", target: "es2022", minify: true, sourcemap: true,
  outdir: out, logLevel: "info",
});
await build({ entryPoints: { app: "app/styles.css" }, bundle: true, minify: true, outdir: out, logLevel: "info" });

// The old planner, kept only as the reference the parity tests compare against: built beside the site
// (dist-planner/), never into it, so it is never deployed.
const LEG = "app/modules/money/legacy", REF = "dist-planner";
rmSync(REF, { recursive: true, force: true });
mkdirSync(`${REF}/money`, { recursive: true });
const parts = readdirSync(LEG).filter((f) => f.endsWith(".js")).sort();
writeFileSync(`${REF}/money/legacy.js`, parts.map((f) => `/* ${f} */\n${readFileSync(`${LEG}/${f}`, "utf8")}`).join("\n"));
writeFileSync(`${REF}/money/money.css`, readFileSync(`${LEG}/money.css`, "utf8") + "\n" + readFileSync(`${LEG}/embed.css`, "utf8"));
cpSync("tests/parity/planner.html", `${REF}/money/app.html`);
// Screens rewritten into the app keep the planner's look: its stylesheet, scoped to the money area.
writeFileSync(`${out}/money/mv.css`, scopeCss(readFileSync(`${LEG}/money.css`, "utf8")) + "\n" + readFileSync("app/modules/money/views/mv-fixes.css", "utf8"));

/** Reads `key: "value"` pairs out of a pasted firebaseConfig snippet. */
function parseConfig(text) {
  if (!text || !text.trim()) return null;
  const obj = {};
  for (const m of text.matchAll(/["']?([A-Za-z]+)["']?\s*:\s*["']([^"']*)["']/g)) obj[m[1]] = m[2];
  for (const k of ["apiKey", "projectId", "appId"]) if (!obj[k]) throw new Error(`FIREBASE_WEB_CONFIG is missing ${k}`);
  // Sign-in runs through our own address, so the popup stays on our own address.
  if (process.env.AUTH_DOMAIN) obj.authDomain = process.env.AUTH_DOMAIN;
  return obj;
}

let sha = process.env.GITHUB_SHA ?? "";
if (!sha) { try { sha = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { sha = "local"; } }
// AV_EMULATORS=1 makes a test build that talks to the local Firebase emulators (never deployed).
const emulators = process.env.AV_EMULATORS === "1"
  ? { auth: "http://127.0.0.1:9099", firestoreHost: "127.0.0.1", firestorePort: 8080, functionsHost: "127.0.0.1", functionsPort: 5001 } : undefined;
const firebase = emulators
  ? { apiKey: "test-api-key", authDomain: "127.0.0.1", projectId: "demo-akhila-vrutta", appId: "test-app" }
  : parseConfig(process.env.FIREBASE_WEB_CONFIG);
// AV_MOBILE=1: the Android app's copy. It carries the Firebase SDK itself (mobile/sdk.mjs puts it in
// /firebase) and signs in with Google through Android, using the project's web OAuth client.
const mobile = process.env.AV_MOBILE === "1" ? { sdkBase: "/firebase", googleClientId: process.env.GOOGLE_WEB_CLIENT_ID || "" } : {};
const cfg = { firebase, build: sha.slice(0, 7) || "local", ...mobile, ...(emulators ? { emulators } : {}) };
writeFileSync(`${out}/config.js`, `window.AV_CONFIG=${JSON.stringify(cfg)};\n`);
console.log(firebase ? `config: project ${firebase.projectId}` : "config: no Firebase (local build)");
