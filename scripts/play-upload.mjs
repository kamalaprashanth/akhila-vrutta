// Uploads the signed app bundle to Google Play's internal testing track (Android Publisher API), as the
// deploy service account. The first release of a new app must be uploaded by hand in Play Console; until
// then this says so and stops without failing the release.
//   GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/play-upload.mjs <app.aab> <release name>
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const [aab, name = ""] = process.argv.slice(2);
const PKG = "in.kp.akhilavrutta", TRACK = "internal";
const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));

/** A token for the Android Publisher API from the service account's key (a signed JWT). */
async function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url"), now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "RS256", typ: "JWT" }), body = b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(sa.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${body}.${sig}` });
  const j = await r.json();
  if (!j.access_token) throw new Error(`token: ${JSON.stringify(j)}`);
  return j.access_token;
}

const T = await token();
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
async function call(method, url, body, type = "application/json") {
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${T}`, ...(body ? { "Content-Type": type } : {}) }, body });
  const text = await r.text();
  if (!r.ok) throw Object.assign(new Error(`${method} ${url.replace(API, "")}: ${r.status} ${text.slice(0, 400)}`), { status: r.status, text });
  return text ? JSON.parse(text) : {};
}

let edit;
try {
  edit = await call("POST", `${API}/edits`);
} catch (e) {
  if (/not found|Package not found|404/i.test(e.message) || e.status === 404) {
    console.log("::warning title=Google Play::The app has no release in Play Console yet. Upload the first .aab by hand (Testing › Internal testing), then later releases go up by themselves.");
    process.exit(0);
  }
  if (e.status === 403) { console.log(`::warning title=Google Play::No permission to release (${e.message.slice(0, 200)}). Check the service account in Play Console › Users and permissions.`); process.exit(0); }
  throw e;
}
const up = await call("POST", `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}/edits/${edit.id}/bundles?uploadType=media`, readFileSync(aab), "application/octet-stream");
console.log(`uploaded version ${up.versionCode}`);
const release = (status) => JSON.stringify({ track: TRACK, releases: [{ name, versionCodes: [String(up.versionCode)], status }] });
try {
  await call("PUT", `${API}/edits/${edit.id}/tracks/${TRACK}`, release("completed"));
  await call("POST", `${API}/edits/${edit.id}:commit`);
  console.log(`::notice title=Google Play::Version ${up.versionCode} is on the internal testing track.`);
} catch (e) {
  // an app not yet reviewed and published takes draft releases only
  if (!/draft/i.test(e.message)) throw e;
  await call("PUT", `${API}/edits/${edit.id}/tracks/${TRACK}`, release("draft"));
  await call("POST", `${API}/edits/${edit.id}:commit`);
  console.log(`::notice title=Google Play::Version ${up.versionCode} is a draft on the internal testing track: roll it out in Play Console.`);
}
