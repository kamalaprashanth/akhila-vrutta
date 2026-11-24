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

// The money planner, moved over as-is: its script parts run as one classic script in its own frame.
const LEG = "app/modules/money/legacy";
const parts = readdirSync(LEG).filter((f) => f.endsWith(".js")).sort();
writeFileSync(`${out}/money/legacy.js`, parts.map((f) => `/* ${f} */\n${readFileSync(`${LEG}/${f}`, "utf8")}`).join("\n"));
writeFileSync(`${out}/money/money.css`, readFileSync(`${LEG}/money.css`, "utf8") + "\n" + readFileSync(`${LEG}/embed.css`, "utf8"));
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
const cfg = { firebase, build: sha.slice(0, 7) || "local", ...(emulators ? { emulators } : {}) };
writeFileSync(`${out}/config.js`, `window.AV_CONFIG=${JSON.stringify(cfg)};\n`);
console.log(firebase ? `config: project ${firebase.projectId}` : "config: no Firebase (local build)");
