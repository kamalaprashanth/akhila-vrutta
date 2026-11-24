/* Akhila Vrutta (moved from KP Money Planner unchanged) — "Ask Claude" for the money Advisor.
   The browser sends a short money summary and the question; this function checks that the caller is you,
   counts the day's questions, and forwards them to the Claude API with the key kept in Secret Manager.
   Nothing is stored except a per-day question count; prompts and answers are never logged. */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString, defineInt } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

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

exports.askClaude = onCall(
  { region: "asia-south1", secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: "256MiB", maxInstances: 2, concurrency: 4 },
  async (req) => {
    const owner = OWNER_UID.value();
    if (!req.auth || !owner || req.auth.uid !== owner) throw new HttpsError("permission-denied", "This Google account isn't allowed to ask Claude.");
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
