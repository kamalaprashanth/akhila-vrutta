// Gets mobile/www ready for `cap sync`: the built site (or a test page), Google's Firebase SDK files copied
// in (so the app opens offline; their links to each other point at /firebase), and the app icon and splash
// images drawn from the site's logo for @capacitor/assets.
//   node mobile/prepare.mjs <site dir> [--icons]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { copySdk } from "../scripts/firebase-sdk.mjs";

const src = process.argv[2] ?? "dist";
const WWW = "mobile/www";
rmSync(WWW, { recursive: true, force: true });
cpSync(src, WWW, { recursive: true });

/* the Firebase SDK the app asks for (scripts/firebase-sdk.mjs) */
if (!process.argv.includes("--no-sdk")) await copySdk(WWW);

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
    // big images are drawn at half size and twice the pixel density (a 2732-px screenshot can fail in CI)
    const k = size > 1500 ? 2 : 1;
    for (let tries = 0; ; tries++) {
      const p = await b.newPage({ viewport: { width: size / k, height: size / k }, deviceScaleFactor: k });
      try {
        await p.setContent(`<style>html,body{margin:0;background:transparent}body{zoom:${1 / k}}</style>${body}`);
        await p.screenshot({ path: `mobile/assets/${name}`, omitBackground: true });
        break;
      } catch (e) { if (tries === 2) throw e; } finally { await p.close(); }
    }
  }
  await b.close();
  console.log("icons: mobile/assets/*.png");
}
if (!existsSync(`${WWW}/index.html`)) throw new Error(`${WWW}/index.html is missing`);
