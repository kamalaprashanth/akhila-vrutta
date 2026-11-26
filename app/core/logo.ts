/**
 * The logo: a six-petal lotus, one petal for each part of the app, clockwise from the top:
 * Money, Home, Health, Papers, Habits, Calendar. Big uses carry a small icon on each petal; small ones
 * (the app icon, the side menu) plain petals, which stay crisp.
 */
type Tone = "onLight" | "onDark";
const PETALS: Record<Tone, [string, string, string, string]> = {
  // petal colours, alternating, and the centre and icon colour
  onLight: ["#0e5e4c", "#3f8f78", "#c9902f", "#ffffff"],
  onDark: ["#f3eedf", "#8fc7b2", "#e8b04b", "#0b4f40"],
};

const ICONS = (c: string): string => `
<text x="60" y="26.5" text-anchor="middle" dominant-baseline="central" font-family="Manrope, system-ui, sans-serif" font-weight="800" font-size="13" fill="${c}">₹</text>
<g transform="translate(78.5 36.5) scale(.6)" fill="none" stroke="${c}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9H4z"/></g>
<g transform="translate(78.5 66) scale(.6)" fill="none" stroke="${c}" stroke-width="2.8" stroke-linejoin="round"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></g>
<g transform="translate(52.8 79.5) scale(.6)" fill="none" stroke="${c}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/></g>
<g transform="translate(27 66) scale(.6)" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></g>
<g transform="translate(27 36.5) scale(.6)" fill="none" stroke="${c}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></g>`;

/** The lotus as an inline SVG (no user data in it). */
export function lotus(size: number, tone: Tone = "onLight", icons = false, label = ""): string {
  const [a, b, c, mid] = PETALS[tone];
  const petals = [a, b, c, a, b, c].map((f, i) => `<ellipse cx="60" cy="32" rx="14" ry="25" fill="${f}"${i ? ` transform="rotate(${i * 60} 60 60)"` : ""}/>`).join("");
  const center = tone === "onLight" ? (icons ? "#ffffff" : "#0e5e4c") : (icons ? mid : "#f3eedf");
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="lotus" viewBox="0 0 120 120" width="${size}" height="${size}" ${a11y}>${petals}<circle cx="60" cy="60" r="9" fill="${center}"/>${icons ? ICONS(tone === "onLight" ? "#ffffff" : mid) : ""}</svg>`;
}
