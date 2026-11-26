// The web app icons from static/icons/logo.svg (run after changing the logo): node scripts/icons.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const svg = readFileSync("static/icons/logo.svg", "utf8");
const bare = svg.replace(/<rect width="512" height="512" rx="116" fill="#0e5e4c"\/>/, "");   // the lotus without its tile
const tile = (px) => `<div style="width:${px}px;height:${px}px">${svg.replace("<svg ", `<svg width="${px}" height="${px}" `)}</div>`;
// maskable: full-bleed green, the lotus inside the middle 60% safe zone
const mask = (px) => `<div style="width:${px}px;height:${px}px;background:#0e5e4c;display:grid;place-items:center">${bare.replace("<svg ", `<svg width="${px * 0.78}" height="${px * 0.78}" `)}</div>`;
// iOS rounds the corners itself
const square = (px) => `<div style="width:${px}px;height:${px}px;background:#0e5e4c;display:grid;place-items:center">${bare.replace("<svg ", `<svg width="${px}" height="${px}" `)}</div>`;
const b = await chromium.launch();
for (const [name, px, body] of [["icon-192.png", 192, tile(192)], ["icon-512.png", 512, tile(512)], ["maskable-512.png", 512, mask(512)], ["apple-touch-180.png", 180, square(180)]]) {
  const p = await b.newPage({ viewport: { width: px, height: px } });
  await p.setContent(`<style>html,body{margin:0;background:transparent}</style>${body}`);
  await p.screenshot({ path: `static/icons/${name}`, omitBackground: true });
  await p.close();
}
await b.close();
console.log("static/icons: icon-192, icon-512, maskable-512, apple-touch-180");
