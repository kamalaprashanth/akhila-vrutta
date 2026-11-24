// Every tappable thing on every Money page (and their tabs), tapped once: lists any tap that nothing in the
// app answers (the planner answered every one of them). The list must be empty.
// Run: node tests/e2e/taps.mjs   (AV_EXPORT=… for the real export)
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const EXPORT = process.env.AV_EXPORT && existsSync(process.env.AV_EXPORT) ? process.env.AV_EXPORT : "tests/fixtures/sample-export.json";
const harness = (await build({ entryPoints: ["tests/parity/harness.ts"], bundle: true, format: "esm", write: false, target: "es2022" })).outputFiles[0].text;
const T = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/export.json") return res.writeHead(200, { "content-type": T[".json"] }).end(await readFile(EXPORT));
  if (url === "/harness.js") return res.writeHead(200, { "content-type": T[".js"] }).end(harness);
  if (url === "/harness.html") return res.writeHead(200, { "content-type": T[".html"] }).end('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/money/mv.css"><main id="main"></main><script type="module" src="/harness.js"></script>');
  let file = join("dist", normalize(url).replace(/^(\.\.[/\\])+/, "")); if (!extname(file)) file += ".html";
  try { res.writeHead(200, { "content-type": T[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
await ctx.route(/fonts\.g/, (r) => r.abort());
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`http://127.0.0.1:${server.address().port}/harness.html#/money/home`);
await p.waitForFunction(() => typeof S === "object" && !!S.data, null, { timeout: 20000 });
await p.waitForSelector("#moneyView #view > *", { timeout: 15000 });

const res = await p.evaluate(async () => {
  const fw = window, S = window.S, box = document.querySelector("#moneyView"), V = () => box.querySelector("#view");
  // a tap nothing answers is logged by the pages (console.debug "[money] tap not handled")
  let passed = null;
  const od = console.debug; console.debug = (...a) => { if (String(a[0]).includes("tap not handled")) passed = JSON.stringify(a[1]); else od(...a); };
  const TAP = "[data-prof],[data-payer],[data-tagedit],[data-advq],[data-ins],[data-hm],[data-hmt],[data-hmo],[data-hmo2],[data-yr],[data-ytab],[data-taxfy],[data-trn],[data-trp],[data-trd],[data-ymc],[data-day],[data-mi],[data-cat],[data-insopen],[data-ptnext],[data-ptgo],[data-ptpay],[data-invpay],[data-invall],[data-hyr],[data-homem],[data-pt],[data-h],[data-bcm],[data-bcd],[data-repign],[data-repadd],[data-pay],[data-miss],[data-undo],[data-cpay],[data-rec],[data-goal],[data-emcat],[data-holi],[data-ptmove],[data-ptaside],[data-acct],[data-nwn],[data-hg],[data-hgo],[data-po],[data-card],[data-loan],[data-acc],[data-hold],[data-prop],[data-pact],[data-ym],[data-tx],[data-ftag],[data-ftype],[data-fcat],[data-fclear],[data-view],[data-bulk],[data-m],[data-go],button,[role=button]";
  const sig = (el) => el.getAttributeNames().filter((a) => a.startsWith("data-") || a === "id").map((a) => `${a}=${a === "data-tx" || a === "data-hold" || a === "data-rec" || a === "data-acc" || a === "data-cat" || a === "data-loan" || a === "data-card" || a === "data-prop" || a === "data-payer" || a === "data-mi" || a === "data-pay" || a === "data-ym" || a === "data-day" ? "…" : el.getAttribute(a)}`).join(" ") || el.textContent.trim().slice(0, 30);
  const close = () => { const m = document.querySelector("#mvLayer #modal"); if (m) m.innerHTML = ""; fw.closeModal?.(); };
  // pages and the page states with their own tabs
  const pageStates = [["home", {}], ["activity", {}], ["accounts", { accTab: "overview" }], ["accounts", { accTab: "banks" }], ["accounts", { accTab: "invest" }], ["accounts", { accTab: "loans" }], ["accounts", { accTab: "props" }],
    ...["month", "cashflow", "budgets", "goals", "emergency", "loans", "repeats"].map((t) => ["plan", { planTab: t }]),
    ...["overview", "spend", "year", "tax", "trend", "networth", "reserve"].map((t) => ["insights", { insTab: t }]), ["advisor", {}], ["more", {}]];
  const live = (c) => (S.data[c] || []).filter((x) => !x.deleted);
  for (const a of live("accounts").filter((a) => a.type === "card").slice(0, 2)) for (const t of ["billed", "unbilled", "emi"]) pageStates.push(["card", { cardId: a.id, cardTab: t }]);
  for (const l of live("loans").slice(0, 3)) for (const t of ["overview", "schedule", "entries", "rates"]) pageStates.push(["loan", { loanId: l.id, loanTab: t }]);
  for (const h of live("holdings").filter((h) => h.type === "EPF" && h.epf)) for (const t of ["overview", "passbook", "entries"]) pageStates.push(["epf", { epfId: h.id, epfTab: t }]);
  for (const h of live("holdings").filter((h) => h.type === "PPF" && h.ppf)) for (const t of ["overview", "years", "entries"]) pageStates.push(["ppf", { ppfId: h.id, ppfTab: t }]);
  for (const h of live("holdings").filter((h) => h.type === "NPS" && h.nps)) for (const t of ["overview", "entries"]) pageStates.push(["nps", { npsId: h.id, npsTab: t }]);
  for (const pp of live("props").slice(0, 2)) for (const t of ["overview", "plan", "items", "fund"]) pageStates.push(["prop", { propId: pp.id, propTab: t }]);
  const show = (v, st) => { Object.assign(S, st); fw.go(v); box.querySelectorAll("details").forEach((d) => d.setAttribute("open", "")); };
  const found = new Map(), seen = new Set(); let tapped = 0;
  for (const [v, st] of pageStates) {
    show(v, st);
    const n = V().querySelectorAll(TAP).length;
    for (let i = 0; i < n; i++) {
      show(v, st);
      const el = V().querySelectorAll(TAP)[i]; if (!el) continue;
      const k = v + " · " + sig(el); if (seen.has(k)) continue; seen.add(k);
      if (el.id === "notifOn" || el.closest("label[for]")) continue;
      passed = null; tapped++;
      try { if (typeof el.click === "function") el.click(); else el.dispatchEvent(new MouseEvent("click", { bubbles: true })); } catch (e) { found.set(k, "error " + e.message); }
      await new Promise((r) => setTimeout(r, 0));
      if (passed) found.set(k, passed);
      close();
    }
  }
  return { tapped, passed: [...found.entries()] };
});
console.log(`${res.tapped} different taps tried on the Money pages`);
for (const [k, v] of res.passed) console.log(`  ✗ nothing answers: ${k}   (${v})`);
if (errors.length) console.log("errors:", [...new Set(errors)].slice(0, 10).join(" | "));
await browser.close(); server.close();
console.log(res.passed.length ? `✗ ${res.passed.length} taps answered by nothing` : "taps: every tap answered by the app");
process.exit(res.passed.length ? 1 : 0);
