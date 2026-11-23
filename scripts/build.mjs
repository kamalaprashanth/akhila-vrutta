// Builds dist/: bundles app/main.ts and app/styles.css with esbuild, copies static/,
// and writes dist/config.js from the FIREBASE_WEB_CONFIG variable (the firebaseConfig
// object copied from the Firebase console; JS object syntax is fine).
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

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

/** Reads `key: "value"` pairs out of a pasted firebaseConfig snippet. */
function parseConfig(text) {
  if (!text || !text.trim()) return null;
  const obj = {};
  for (const m of text.matchAll(/["']?([A-Za-z]+)["']?\s*:\s*["']([^"']*)["']/g)) obj[m[1]] = m[2];
  for (const k of ["apiKey", "projectId", "appId"]) if (!obj[k]) throw new Error(`FIREBASE_WEB_CONFIG is missing ${k}`);
  // Sign-in runs through our own address, so the popup stays on kp.web.app.
  if (process.env.AUTH_DOMAIN) obj.authDomain = process.env.AUTH_DOMAIN;
  return obj;
}

let sha = process.env.GITHUB_SHA ?? "";
if (!sha) { try { sha = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { sha = "local"; } }
const firebase = parseConfig(process.env.FIREBASE_WEB_CONFIG);
writeFileSync(`${out}/config.js`, `window.AV_CONFIG=${JSON.stringify({ firebase, build: sha.slice(0, 7) || "local" })};\n`);
console.log(firebase ? `config: project ${firebase.projectId}` : "config: no Firebase (local build)");
