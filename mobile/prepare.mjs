// Gets mobile/www ready for `cap sync`: the built site (or a test page), Google's Firebase SDK files copied
// in (so the app opens offline; their links to each other point at /firebase), and the app icon and splash
// images drawn from the site's logo for @capacitor/assets.
//   node mobile/prepare.mjs <site dir> [--icons]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const src = process.argv[2] ?? "dist";
const WWW = "mobile/www";
rmSync(WWW, { recursive: true, force: true });
cpSync(src, WWW, { recursive: true });

/* the Firebase SDK the app asks for, at the version firebase.ts pins */
const SDK = readFileSync("app/core/firebase.ts", "utf8").match(/const SDK = "([^"]+)"/)[1];
const BASE = `https://www.gstatic.com/firebasejs/${SDK}/`;
mkdirSync(`${WWW}/firebase`, { recursive: true });
const todo = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js", "firebase-functions.js"], done = new Set();
while (todo.length) {
  const f = todo.pop();
  if (done.has(f)) continue;
  done.add(f);
  const r = await fetch(BASE + f);
  if (!r.ok) throw new Error(`Firebase SDK ${f}: HTTP ${r.status}`);
  let t = await r.text();
  for (const m of t.matchAll(/https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/([\w.-]+\.js)/g)) todo.push(m[1]);
  t = t.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^/"']+\//g, "/firebase/");
  writeFileSync(`${WWW}/firebase/${f}`, t);
}
console.log(`Firebase SDK ${SDK}: ${[...done].join(", ")}`);

/* icon and splash, from the logo */
if (process.argv.includes("--icons")) {
  const { chromium } = await import("playwright");
  const svg = readFileSync("static/icons/logo.svg", "utf8"), bg = "#f7f2e8";
  const inner = svg.replace(/<rect width="512" height="512" rx="116" fill="#f7f2e8"\/>/, "");   // the logo without its tile
  const shots = [
    ["icon-only.png", 1024, `<div style="width:1024px;height:1024px;background:${bg}">${svg.replace("<svg ", '<svg width="1024" height="1024" ')}</div>`],
    ["icon-foreground.png", 1024, `<div style="width:1024px;height:1024px;display:grid;place-items:center">${inner.replace("<svg ", '<svg width="620" height="620" ')}</div>`],
    ["icon-background.png", 1024, `<div style="width:1024px;height:1024px;background:${bg}"></div>`],
    ["splash.png", 2732, `<div style="width:2732px;height:2732px;background:${bg};display:grid;place-items:center">${inner.replace("<svg ", '<svg width="700" height="700" ')}</div>`],
    ["splash-dark.png", 2732, `<div style="width:2732px;height:2732px;background:#10201b;display:grid;place-items:center">${inner.replace("<svg ", '<svg width="700" height="700" ')}</div>`],
  ];
  mkdirSync("mobile/assets", { recursive: true });
  const b = await chromium.launch();
  for (const [name, size, body] of shots) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<style>html,body{margin:0;background:transparent}</style>${body}`);
    await p.screenshot({ path: `mobile/assets/${name}`, omitBackground: true });
    await p.close();
  }
  await b.close();
  console.log("icons: mobile/assets/*.png");
}
if (!existsSync(`${WWW}/index.html`)) throw new Error(`${WWW}/index.html is missing`);
