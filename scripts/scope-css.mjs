// Scopes the planner's stylesheet to `.mv`, so screens rewritten into the app look exactly as they did
// in the planner without touching the rest of the app:
//   :root / html / body  → .mv   (the page itself)
//   any other selector   → .mv <selector>
//   @media (min/max-width) → @container mv (…)  (the money area's width, as the planner's frame had)
// @keyframes and @font-face stay global.

/** Splits CSS into top-level statements: { head, body } for blocks, { text } for anything else. */
function blocks(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i), semi = css.indexOf(";", i);
    if (open < 0) { const rest = css.slice(i).trim(); if (rest) out.push({ text: rest }); break; }
    if (semi >= 0 && semi < open && css.slice(i, semi).trim().startsWith("@")) { out.push({ text: css.slice(i, semi + 1).trim() }); i = semi + 1; continue; }
    let depth = 0, j = open;
    for (; j < css.length; j++) { if (css[j] === "{") depth++; else if (css[j] === "}" && --depth === 0) break; }
    out.push({ head: css.slice(i, open).trim(), body: css.slice(open + 1, j) });
    i = j + 1;
  }
  return out;
}

const ROOT = /^(:root|html|body)(?![\w-])/;
function scopeSelector(sel, scope) {
  return sel.split(/,(?![^(]*\))/).map((s) => {
    s = s.trim();
    if (!s) return s;
    if (ROOT.test(s)) return s.replace(ROOT, scope);
    return `${scope} ${s}`;
  }).join(",");
}
const WIDTH_ONLY = /^\(\s*(min|max)-width\s*:\s*[\d.]+px\s*\)(\s*and\s*\(\s*(min|max)-width\s*:\s*[\d.]+px\s*\))*$/;

export function scopeCss(css, scope = ".mv", container = "mv") {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const walk = (src) => blocks(src).map((b) => {
    if (b.text !== undefined) return b.text.startsWith("@import") || b.text.startsWith("@charset") ? "" : b.text;
    const h = b.head;
    if (/^@(-webkit-)?keyframes|^@font-face/.test(h)) return `${h}{${b.body}}`;
    if (h.startsWith("@media")) {
      const q = h.slice(6).trim();
      return WIDTH_ONLY.test(q) ? `@container ${container} ${q}{${walk(b.body)}}` : `${h}{${walk(b.body)}}`;
    }
    if (h.startsWith("@supports")) return `${h}{${walk(b.body)}}`;
    return `${scopeSelector(h, scope)}{${b.body}}`;
  }).join("\n");
  return walk(css);
}
