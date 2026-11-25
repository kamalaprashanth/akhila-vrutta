// Fetches the app as Google Play signs it (Play App Signing re-signs with Play's own key) and saves it as
// play.apk, so its certificate fingerprints can be added to Firebase for Google sign-in.
//   GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/play-signing.mjs [versionCode]
import { createSign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const PKG = "in.kp.akhilavrutta";
const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url"), now = Math.floor(Date.now() / 1000);
const head = b64({ alg: "RS256", typ: "JWT" }), body = b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(sa.private_key, "base64url");
const T = (await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${body}.${sig}` })).json()).access_token;
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const get = async (url) => { const r = await fetch(url, { headers: { Authorization: `Bearer ${T}` } }); if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 400)}`); return r; };

let vc = process.argv[2];
if (!vc) {
  const edit = await (await fetch(`${API}/edits`, { method: "POST", headers: { Authorization: `Bearer ${T}` } })).json();
  const tr = await (await get(`${API}/edits/${edit.id}/tracks/internal`)).json();
  vc = tr.releases.flatMap((r) => r.versionCodes ?? []).sort((a, b) => b - a)[0];
  await fetch(`${API}/edits/${edit.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${T}` } });
}
console.log("version", vc);
const g = await (await get(`${API}/generatedApks/${vc}`)).json();
for (const k of g.generatedApks ?? []) console.log("Play signing key SHA-256:", k.certificateSha256Hash);
const k = (g.generatedApks ?? [])[0];
const id = k?.generatedUniversalApk?.downloadId ?? k?.generatedSplitApks?.find((s) => s.moduleName === "base" && !s.splitId)?.downloadId ?? k?.generatedSplitApks?.[0]?.downloadId;
if (!id) throw new Error("no generated APK: " + JSON.stringify(g).slice(0, 600));
writeFileSync("play.apk", Buffer.from(await (await get(`${API}/generatedApks/${vc}/downloads/${encodeURIComponent(id)}:download?alt=media`)).arrayBuffer()));
console.log("saved play.apk");
