/* Akhila Vrutta (moved from KP Money Planner unchanged) — "Ask Claude" for the money Advisor.
   The browser sends a short money summary and the question; this function checks that the caller is you,
   counts the day's questions, and forwards them to the Claude API with the key kept in Secret Manager.
   Nothing is stored except a per-day question count; prompts and answers are never logged. */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString, defineInt } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const OWNER_UID = defineString("OWNER_UID", { description: "Your Firebase Auth UID (the same one as in config.js)" });
const CLAUDE_MODEL = defineString("CLAUDE_MODEL", { default: "claude-opus-5-5", description: "claude-opus-5-5 (deepest), claude-sonnet-5-5 or claude-haiku-5-5" });
const DAILY_LIMIT = defineInt("DAILY_LIMIT", { default: 40, description: "Most questions allowed per day" });

const MAX_TURNS = 20, MAX_CHARS = 450000;   /* the advisor sends ~24 months of transactions (≈150k characters) */
const istDay = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

function checkMessages(m) {
  if (!Array.isArray(m) || m.length < 1 || m.length > MAX_TURNS) return "Send 1 to 20 messages.";
  let chars = 0;
  for (let i = 0; i < m.length; i++) {
    const x = m[i];
    if (!x || typeof x.content !== "string" || !x.content.trim()) return "Each message needs text.";
    if (x.role !== (i % 2 === 0 ? "user" : "assistant")) return "Messages must alternate, starting and ending with you.";
    chars += x.content.length;
  }
  if (m.length % 2 === 0) return "The last message must be your question.";
  if (chars > MAX_CHARS) return "That's too much text; start a new chat.";
  return null;
}

async function countToday(uid, limit) {
  const ref = getFirestore().doc(`aiUsage/${uid}`), day = istDay();
  return getFirestore().runTransaction(async tx => {
    const s = await tx.get(ref), d = s.exists ? s.data() : {};
    const n = d.day === day ? (d.n || 0) : 0;
    if (n >= limit) return false;
    tx.set(ref, { day, n: n + 1, total: FieldValue.increment(1) }, { merge: true });
    return true;
  });
}

/* Who may use Claude: the owner, and accounts switched on by hand in aiAccess/{uid} ({ on: true }; written only
   from the Firebase console, never by the app). For a public release everyone else is off. */
async function aiAllowed(uid) {
  if (!uid) return false;
  if (uid === OWNER_UID.value()) return true;
  const s = await getFirestore().doc(`aiAccess/${uid}`).get();
  return s.exists && s.data().on === true;
}

/* Is Claude switched on for the signed-in account (the app shows the Advisor and "Read with Claude" only then),
   and is it the owner (who sees Admin). Called once after each unlock, so it also notes when the account was
   last used (for the owner's "active this week" count; nothing else about the account is kept). */
exports.aiStatus = onCall({ region: "asia-south1", memory: "256MiB", maxInstances: 4 }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = req.auth.uid;
  await getFirestore().doc(`seen/${uid}`).set({ at: FieldValue.serverTimestamp() }).catch(() => {});
  return { on: await aiAllowed(uid), owner: uid === OWNER_UID.value(), appCheck: !!req.app };
});

/* App Check: with APP_CHECK=enforce, calls from anything but the genuine app (no valid App Check token) are
   refused. "watch" lets them through (the emulator tests, and before enforcing). */
const APP_CHECK = defineString("APP_CHECK", { default: "watch", description: "enforce or watch" });
const genuine = (req) => { if (APP_CHECK.value() === "enforce" && !req.app) throw new HttpsError("failed-precondition", "This app couldn't prove it's the genuine Akhila Vrutta. Update it from Google Play, or reload the website."); };
const isOwner = (req) => { if (!req.auth || req.auth.uid !== OWNER_UID.value()) throw new HttpsError("permission-denied", "Only the app's owner can do that."); };
const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;

/* Admin (owner only): how many accounts, how many used it this week, Claude questions today; counts only. */
exports.adminStats = onCall({ region: "asia-south1", memory: "256MiB", maxInstances: 1 }, async (req) => {
  isOwner(req); genuine(req);
  const db = getFirestore(), week = Timestamp.fromMillis(Date.now() - 7 * 864e5), day = istDay();
  const [users, active, usage] = await Promise.all([
    db.collection("users").count().get(),
    db.collection("seen").where("at", ">=", week).count().get(),
    db.collection("aiUsage").where("day", "==", day).get(),
  ]);
  return { accounts: users.data().count, active: active.data().count, asksToday: usage.docs.reduce((n, d) => n + (d.data().n || 0), 0) };
});

/* Admin: who has Claude (a name only the owner sees, on/off, questions today). */
exports.adminAiList = onCall({ region: "asia-south1", memory: "256MiB", maxInstances: 1 }, async (req) => {
  isOwner(req); genuine(req);
  const db = getFirestore(), day = istDay(), snap = await db.collection("aiAccess").get();
  const out = [];
  for (const d of snap.docs) {
    const u = await db.doc(`aiUsage/${d.id}`).get(), ud = u.exists ? u.data() : {};
    out.push({ uid: d.id, name: d.data().name || "", on: d.data().on === true, today: ud.day === day ? ud.n || 0 : 0 });
  }
  return { people: out.sort((a, b) => a.name.localeCompare(b.name)) };
});
exports.adminAiSet = onCall({ region: "asia-south1", memory: "256MiB", maxInstances: 1 }, async (req) => {
  isOwner(req); genuine(req);
  const { uid, name, on, remove } = req.data || {};
  if (typeof uid !== "string" || !UID_RE.test(uid)) throw new HttpsError("invalid-argument", "That isn't a user ID.");
  if (uid === OWNER_UID.value()) throw new HttpsError("invalid-argument", "Claude is always on for you.");
  const ref = getFirestore().doc(`aiAccess/${uid}`);
  if (remove) { await ref.delete(); return { ok: true }; }
  await ref.set({ on: on !== false, name: typeof name === "string" ? name.slice(0, 40) : "" }, { merge: true });
  return { ok: true };
});

/* Deletes the caller's account: every home they own (all its records), their membership elsewhere, their
   account records, and their sign-in. The app deletes their encrypted files in their Google Drive first. */
exports.deleteAccount = onCall({ region: "asia-south1", memory: "512MiB", timeoutSeconds: 300, maxInstances: 2 }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!req.data || req.data.confirm !== "DELETE") throw new HttpsError("invalid-argument", "Type DELETE to confirm.");
  const uid = req.auth.uid, db = getFirestore();
  const homes = await db.collection("homes").where(`members.${uid}`, "in", ["owner", "member"]).get();
  for (const h of homes.docs) {
    if (h.data().members[uid] === "owner") await db.recursiveDelete(h.ref);
    else { await h.ref.collection("keys").doc(uid).delete().catch(() => {}); await h.ref.update({ [`members.${uid}`]: FieldValue.delete() }); }
  }
  for (const c of ["users", "aiAccess", "aiUsage", "priceWatch", "seen"]) await db.doc(`${c}/${uid}`).delete().catch(() => {});
  await getAuth().deleteUser(uid).catch(() => {});
  return { ok: true, homes: homes.size };
});

exports.askClaude = onCall(
  { region: "asia-south1", secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: "256MiB", maxInstances: 2, concurrency: 4 },
  async (req) => {
    genuine(req);
    if (!req.auth || !(await aiAllowed(req.auth.uid))) throw new HttpsError("permission-denied", "This Google account isn't allowed to ask Claude.");
    const messages = req.data && req.data.messages;
    const bad = checkMessages(messages);
    if (bad) throw new HttpsError("invalid-argument", bad);
    if (!(await countToday(req.auth.uid, DAILY_LIMIT.value()))) throw new HttpsError("resource-exhausted", `You've asked ${DAILY_LIMIT.value()} questions today. Try again tomorrow.`);

    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_API_KEY.value(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
        /* the first message carries all the data: mark it for prompt caching so follow-ups re-read it at a tenth of the price */
        body: JSON.stringify({ model: CLAUDE_MODEL.value(), max_tokens: 8000, messages: messages.map((x, i) => ({ role: x.role, content: i === 0 && x.content.length > 4000 ? [{ type: "text", text: x.content, cache_control: { type: "ephemeral" } }] : x.content })) }),
        signal: AbortSignal.timeout(280000)
      });
    } catch (e) {
      throw new HttpsError("unavailable", "Couldn't reach Claude. Try again.");
    }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (body.error && body.error.message) || "";
      console.warn("Claude API error", r.status, body.error && body.error.type, msg.slice(0, 300));   // the API's own error text; never the prompt
      if (r.status === 401 || r.status === 403) throw new HttpsError("failed-precondition", "The Claude API key was rejected. Update the ANTHROPIC_API_KEY secret in Google Cloud Secret Manager.");
      if (/credit balance/i.test(msg)) throw new HttpsError("failed-precondition", "Your Claude API credits have run out. Add credits in the Claude Console.");
      if (r.status === 429) throw new HttpsError("resource-exhausted", "Claude is busy or your API spend limit was reached. Try again later.");
      if (r.status === 529 || r.status >= 500) throw new HttpsError("unavailable", "Claude is overloaded right now. Try again in a minute.");
      if (r.status === 404 || /model/i.test(msg)) throw new HttpsError("failed-precondition", `The model "${CLAUDE_MODEL.value()}" isn't available to your key.`);
      throw new HttpsError("failed-precondition", `Claude API said: ${msg.slice(0, 200) || "error " + r.status}`);
    }
    const text = (body.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
    if (!text) { console.warn("Claude returned no text", body.stop_reason, (body.content || []).map(b => b.type).join(",")); throw new HttpsError("failed-precondition", `Claude returned no answer (${body.stop_reason || "unknown"}). Try again, or ask a shorter question.`); }
    return { text, truncated: body.stop_reason === "max_tokens", model: body.model, usage: body.usage ? { in: body.usage.input_tokens, out: body.usage.output_tokens } : null };
  }
);
exports._test = { checkMessages, istDay };

/* daily official prices for mutual funds, NPS, Indian and US shares (README › Automatic prices) */
Object.assign(exports, require("./prices")(OWNER_UID));
