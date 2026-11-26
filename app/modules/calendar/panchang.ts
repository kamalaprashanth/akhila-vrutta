/**
 * The Telugu (amanta) panchang for a day, worked out on this device: the tithi at sunrise and the lunar month.
 * Sun and Moon from Meeus' Astronomical Algorithms (ch. 25 and 47, the main terms: well under a minute of arc,
 * so a tithi's start is right to a few minutes), sunrise for Bengaluru, months named the amanta way (a month runs
 * new moon to new moon and takes its name from the solar sign the Sun enters during it; a month in which the Sun
 * enters no new sign is Adhika). Lahiri ayanamsa for the signs.
 */
type Day = string;
export const MONTHS = ["Chaitra", "Vaishakha", "Jyeshtha", "Ashadha", "Shravana", "Bhadrapada", "Ashvayuja", "Kartika", "Margashira", "Pushya", "Magha", "Phalguna"];
export const TITHIS = ["Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi"];
/** Where sunrise is worked out (the tithi of a day is the one at sunrise). */
export const PLACE = { name: "Bengaluru", lat: 12.9716, lon: 77.5946, tz: 5.5 };

const rad = Math.PI / 180, norm = (x: number): number => ((x % 360) + 360) % 360, sin = (d: number): number => Math.sin(d * rad), cos = (d: number): number => Math.cos(d * rad);
const T = (jd: number): number => (jd - 2451545) / 36525;

function sunLon(jd: number): number {
  const t = T(jd), L0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t, M = 357.52911 + 35999.05029 * t - 0.0001537 * t * t;
  const C = (1.914602 - 0.004817 * t - 0.000014 * t * t) * sin(M) + (0.019993 - 0.000101 * t) * sin(2 * M) + 0.000289 * sin(3 * M);
  return norm(L0 + C - 0.00569 - 0.00478 * sin(125.04 - 1934.136 * t));
}
// Meeus table 47.A: D, M, M', F, Σl (millionths of a degree)
const MOON: [number, number, number, number, number][] = [
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618], [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332],
  [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066], [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528], [0, 0, 1, -2, 10980], [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034],
  [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888], [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
  [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665], [0, 1, -2, 0, -2689], [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390],
  [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236], [0, 1, 2, 0, -2120], [0, 2, 0, 0, -2069], [2, -2, -1, 0, 2048], [2, 0, 1, -2, -1773],
  [2, 0, 0, 2, -1595], [4, -1, -1, 0, 1215], [0, 0, 2, 2, -1110], [3, 0, -1, 0, -892], [2, 1, 1, 0, -810], [4, -1, -2, 0, 759],
];
function moonLon(jd: number): number {
  const t = T(jd);
  const Lp = 218.3164477 + 481267.88123421 * t - 0.0015786 * t * t, D = 297.8501921 + 445267.1114034 * t - 0.0018819 * t * t;
  const M = 357.5291092 + 35999.0502909 * t - 0.0001536 * t * t, Mp = 134.9633964 + 477198.8675055 * t + 0.0087414 * t * t;
  const F = 93.272095 + 483202.0175233 * t - 0.0036539 * t * t, E = 1 - 0.002516 * t - 0.0000074 * t * t;
  let s = 0;
  for (const [d, m, mp, f, c] of MOON) s += c * (Math.abs(m) === 1 ? E : m ? E * E : 1) * sin(d * D + m * M + mp * Mp + f * F);
  s += 3958 * sin(119.75 + 131.849 * t) + 1962 * sin(Lp - F) + 318 * sin(53.09 + 479264.29 * t);
  return norm(Lp + s / 1e6 - 0.00478 * sin(125.04 - 1934.136 * t));
}
/** The Moon ahead of the Sun, 0–360°. */
const elong = (jd: number): number => norm(moonLon(jd) - sunLon(jd));
const ayanamsa = (jd: number): number => 23.853 + 0.0139693 * (jd - 2451545) / 365.25;
const sign = (jd: number): number => Math.floor(norm(sunLon(jd) - ayanamsa(jd)) / 30);

const jdOf = (y: number, m: number, d: number, hUT = 0): number => Date.UTC(y, m - 1, d, 0, 0, 0) / 864e5 + 2440587.5 + hUT / 24;
/** Sunrise (UT hours) at the place on a day (NOAA's method; within a minute or two). */
function sunriseUT(y: number, m: number, d: number): number {
  const jd = jdOf(y, m, d, 12 - PLACE.lon / 15), t = T(jd);
  const e = 0.016708634 - 0.000042037 * t, L0 = norm(280.46646 + 36000.76983 * t), M = 357.52911 + 35999.05029 * t;
  const lam = sunLon(jd), eps = 23.439291 - 0.0130042 * t;
  const decl = Math.asin(sin(eps) * sin(lam)) / rad, yv = Math.tan((eps / 2) * rad) ** 2;
  const eqt = 4 / rad * (yv * sin(2 * L0) - 2 * e * sin(M) + 4 * e * yv * sin(M) * cos(2 * L0) - 0.5 * yv * yv * sin(4 * L0) - 1.25 * e * e * sin(2 * M)); // minutes
  const ha = Math.acos(cos(90.833) / (cos(PLACE.lat) * cos(decl)) - Math.tan(PLACE.lat * rad) * Math.tan(decl * rad)) / rad;
  return (720 - 4 * (PLACE.lon + ha) - eqt) / 60;
}
/** The nearest new moon before (dir −1) or after (dir 1) jd. */
function newMoon(jd: number, dir: -1 | 1): number {
  let x = jd + (dir < 0 ? -elong(jd) : 360 - elong(jd)) / 12.19;
  for (let i = 0; i < 8; i++) { let e = elong(x); if (e > 180) e -= 360; x -= e / 12.19; if (Math.abs(e) < 1e-6) break; }
  return x;
}

export interface Panchang { day: Day; tithi: number; paksha: "Shukla" | "Krishna"; num: number; name: string; month: number; adhika: boolean; sunrise: string }
const cache = new Map<Day, Panchang>();
const tithiAt = (jd: number): number => Math.floor(elong(jd) / 12);   // 0..29
export const tithiName = (i: number): string => (i === 14 ? "Purnima" : i === 29 ? "Amavasya" : TITHIS[i % 15]!);
export const monthName = (m: number, adhika = false): string => `${adhika ? "Adhika " : ""}${MONTHS[m]}`;
/** "Margashira Shukla Saptami". */
export const label = (p: { month: number; tithi: number; adhika?: boolean }): string => `${monthName(p.month, p.adhika)} ${p.tithi === 14 || p.tithi === 29 ? "" : `${p.tithi < 15 ? "Shukla" : "Krishna"} `}${tithiName(p.tithi)}`;

function riseJd(day: Day): number { const y = +day.slice(0, 4), m = +day.slice(5, 7), d = +day.slice(8, 10); return jdOf(y, m, d, sunriseUT(y, m, d)); }
const riseT = new Map<Day, number>();
/** The tithi at sunrise on a day (kept: the Today page asks for the same days again and again). */
function riseTithi(day: Day): number { let v = riseT.get(day); if (v === undefined) { v = tithiAt(riseJd(day)); if (riseT.size > 5000) riseT.clear(); riseT.set(day, v); } return v; }
function monthAt(jd: number): { month: number; adhika: boolean } {
  const a = newMoon(jd, -1), b = newMoon(jd, 1), s1 = sign(a + 1e-4), s2 = sign(b + 1e-4);
  return { month: (s1 + 1) % 12, adhika: s1 === s2 };
}
export function panchang(day: Day): Panchang {
  const hit = cache.get(day); if (hit) return hit;
  const jd = riseJd(day), ti = tithiAt(jd), mo = monthAt(jd);
  const h = sunriseUT(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10)) + PLACE.tz, hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  const p: Panchang = { day, tithi: ti, paksha: ti < 15 ? "Shukla" : "Krishna", num: (ti % 15) + 1, name: tithiName(ti), ...mo, sunrise: `${hh}:${String(mm).padStart(2, "0")} AM` };
  if (cache.size > 2000) cache.clear();
  cache.set(day, p);
  return p;
}

const pad = (n: number): string => String(n).padStart(2, "0");
export const addDays = (d: Day, n: number): Day => { const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };

/** The first day from `from` (within ~13 months) whose tithi is `tithi` (0–29) in lunar month `month` (not Adhika).
 * The day is the one with that tithi at sunrise; a tithi that starts and ends between two sunrises falls on the second. */
export function nextTithi(month: number, tithi: number, from: Day): Day | null {
  let prev = riseTithi(addDays(from, -1));
  for (let i = 0; i < 400; i++) {
    const day = addDays(from, i), cur = riseTithi(day);
    const span = (cur - prev + 30) % 30, back = (cur - tithi + 30) % 30;
    if (back < span) {
      const p = panchang(day);
      if (!p.adhika && p.month === month) return day;
    }
    prev = cur;
  }
  return null;
}
