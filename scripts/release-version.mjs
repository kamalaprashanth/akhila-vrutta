// Releases an existing Hosting version on a channel, through the Hosting API.
// Used to roll live back to the version that was live before a failed release.
// Usage: node scripts/release-version.mjs <channel> <versionId>   (needs GOOGLE_APPLICATION_CREDENTIALS)
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const [channel, version] = process.argv.slice(2);
const SITE = process.env.SITE ?? "kp-akhila-vrutta";
if (!channel || !version) throw new Error("usage: release-version.mjs <channel> <versionId>");

// A service-account access token, signed here (no extra packages).
const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.hosting https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 600 })}`;
const jwt = `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url")}`;
const tok = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` })).json();
if (!tok.access_token) throw new Error(`couldn't get a token: ${JSON.stringify(tok)}`);

const url = `https://firebasehosting.googleapis.com/v1beta1/sites/${SITE}/channels/${channel}/releases?versionName=sites/${SITE}/versions/${version}`;
const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${tok.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ message: `Released version ${version} by CI` }) });
const body = await r.json();
if (!r.ok) throw new Error(`release failed: HTTP ${r.status} ${JSON.stringify(body)}`);
console.log(`Released ${version} on ${SITE}/${channel}: ${body.name}`);
