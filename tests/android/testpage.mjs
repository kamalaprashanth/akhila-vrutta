// The Android test app's page: the built site plus the Money test page (made-up sample data, no cloud), as
// its start page. node tests/android/testpage.mjs <out dir>
import { build } from "esbuild";
import { cpSync, rmSync, writeFileSync } from "node:fs";
const out = process.argv[2] ?? "build-android-test";
rmSync(out, { recursive: true, force: true });
cpSync("dist", out, { recursive: true });
const js = (await build({ entryPoints: ["tests/parity/harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
writeFileSync(`${out}/harness.js`, js);
cpSync("tests/fixtures/sample-export.json", `${out}/export.json`);
writeFileSync(`${out}/index.html`, '<!doctype html><meta charset="utf-8"><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/money/mv.css"><main id="main"></main><script type="module" src="/harness.js"></script>');
console.log(`Android test page in ${out}`);
