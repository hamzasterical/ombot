// send_approved_reply: email a backend-authorized reply to the customer through Gmail.
// input  { complaint_id, reply_text, authorization_token, recipient_email?, idempotency_key?,
//          reply_to_sender?, thread? }
// Deduplicated per (idempotency_key or complaint_id) + exact text, so a retry never emails twice.
// output { success, sent_at, error }
//
// reply_to_sender: the complaint arrived by email from recipient_email, so answer that person directly
//                  (still requires ombotReplyAllowRealRecipients=true; demo customers keep the override).
// thread:          { thread_id, message_id, subject } of the customer's email, to reply in the same thread.
//
// authorization_token must equal HMAC-SHA256(OMBOT_REPLY_AUTH_SECRET, "<complaint_id>:<sha256hex(reply_text)>"),
// so only the OmBot backend can authorize a send, and only for this exact text.
// secret:     OMBOT_REPLY_AUTH_SECRET (same value as REPLY_AUTH_SECRET in the backend .env)
// env config: ombotReplyOverrideTo  - when set, every reply goes to this address instead (test inbox).
//             ombotReplyAllowRealRecipients - must be "true" to email recipient_email when no override is set.
// Requires _crypto.js helpers inlined above this function (see build.mjs).

function header(value) {
  return String(value).replace(/[\r\n]+/g, " ");
}

export default async function (ctx) {
  const input = ctx.input || {};
  const fail = (error) => ({ success: false, sent_at: null, error });

  if (input.complaint_id === undefined || input.complaint_id === null || String(input.complaint_id) === "")
    return fail("missing input: complaint_id");
  if (typeof input.reply_text !== "string" || !input.reply_text.trim()) return fail("missing input: reply_text");
  if (typeof input.authorization_token !== "string") return fail("missing input: authorization_token");

  const secret = await fastn.secrets.get("OMBOT_REPLY_AUTH_SECRET");
  if (!secret) return fail("secret OMBOT_REPLY_AUTH_SECRET is not set");
  const textHash = sha256Hex(input.reply_text);
  const expected = hmacSha256Hex(String(secret), `${input.complaint_id}:${textHash}`);
  if (!safeEqual(expected, input.authorization_token.toLowerCase())) {
    fastn.loki.warn("reply rejected: bad token", { complaintId: input.complaint_id });
    return fail("invalid authorization_token");
  }

  const dedupeKey = `ombot:reply:${input.idempotency_key || input.complaint_id}:${textHash}`;
  const already = await fastn.state.get(dedupeKey);
  if (already) return { success: true, sent_at: already.sent_at, error: null };

  const override = await fastn.envConfig.get("ombotReplyOverrideTo");
  const allowReal = String((await fastn.envConfig.get("ombotReplyAllowRealRecipients")) || "") === "true";
  const toSender = !!(input.reply_to_sender && allowReal && input.recipient_email);
  const to = toSender ? input.recipient_email : override || (allowReal ? input.recipient_email : null);
  if (!to) {
    return fail(
      input.recipient_email
        ? "real recipients are disabled: set ombotReplyOverrideTo or ombotReplyAllowRealRecipients=true"
        : "no recipient: recipient_email missing and ombotReplyOverrideTo not set",
    );
  }

  const intro =
    !toSender && override && input.recipient_email ? `[Test inbox: intended for ${input.recipient_email}]\n\n` : "";
  const thread = toSender && input.thread && typeof input.thread === "object" ? input.thread : null;
  const subject = thread?.subject
    ? /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`
    : `Update on your complaint #${input.complaint_id}`;
  const raw = [
    `To: ${header(to)}`,
    `Subject: ${header(subject)}`,
    ...(thread?.message_id ? [`In-Reply-To: ${header(thread.message_id)}`, `References: ${header(thread.message_id)}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    intro + input.reply_text,
  ].join("\r\n");

  try {
    const res = await fastn.connector.googleGmail.sendMessage({
      raw: base64Url(raw),
      ...(thread?.thread_id ? { threadId: String(thread.thread_id) } : {}),
    });
    if (!res.output?.id) throw new Error(`Gmail did not return a message id: ${JSON.stringify(res.output).slice(0, 300)}`);
    const sent_at = new Date().toISOString();
    await fastn.state.set(dedupeKey, { sent_at, message_id: res.output.id });
    fastn.loki.info("reply sent", { complaintId: input.complaint_id, messageId: res.output.id, toSender, overridden: !toSender && !!override });
    return { success: true, sent_at, error: null };
  } catch (err) {
    fastn.loki.error("reply failed", { complaintId: input.complaint_id, error: String(err?.message || err) });
    return fail(String(err?.message || err));
  }
}
