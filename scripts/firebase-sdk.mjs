// Copies Google's Firebase SDK files, at the version app/core/firebase.ts pins, into <dir>/firebase, with
// their links to each other pointing at /firebase. The site and the Android app then load the SDK from
// themselves, so the page needs no script from anywhere else (the CSP allows only 'self').
//   node scripts/firebase-sdk.mjs <dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function copySdk(dir) {
  const SDK = readFileSync("app/core/firebase.ts", "utf8").match(/const SDK = "([^"]+)"/)[1];
  const BASE = `https://www.gstatic.com/firebasejs/${SDK}/`;
  mkdirSync(`${dir}/firebase`, { recursive: true });
  const todo = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js", "firebase-functions.js", "firebase-app-check.js"], done = new Set();
  while (todo.length) {
    const f = todo.pop();
    if (done.has(f)) continue;
    done.add(f);
    const r = await fetch(BASE + f);
    if (!r.ok) throw new Error(`Firebase SDK ${f}: HTTP ${r.status}`);
    let t = await r.text();
    for (const m of t.matchAll(/https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/([\w.-]+\.js)/g)) todo.push(m[1]);
    t = t.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^/"']+\//g, "/firebase/");
    writeFileSync(`${dir}/firebase/${f}`, t);
  }
  console.log(`Firebase SDK ${SDK} in ${dir}/firebase: ${[...done].join(", ")}`);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await copySdk(process.argv[2] ?? "dist");
