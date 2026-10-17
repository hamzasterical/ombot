// fetch_inbound_emails: list customer emails that arrived in the bank's Gmail inbox, for the backend to ingest.
// input  { query, max_results? }   query is a Gmail search string built by the backend (it holds the cursor)
// output { success, messages: [{ gmail_id, thread_id, received_at, from, subject, message_id, label_ids,
//          auto_submitted, precedence, list_header, text_b64, html_b64 }], error }
//
// Read-only: nothing is labelled, moved or marked read. The backend dedupes on gmail_id.
// Bodies are returned as Gmail's base64url data and decoded by the backend (the sandbox has no Buffer/atob).

const WANTED = ["from", "subject", "message-id", "auto-submitted", "precedence", "list-id", "list-unsubscribe"];

function headerMap(payload) {
  const out = {};
  for (const h of payload?.headers || []) {
    const name = String(h.name || "").toLowerCase();
    if (WANTED.includes(name) && out[name] === undefined) out[name] = String(h.value || "");
  }
  return out;
}

// First part of the given type, depth-first (multipart/mixed > multipart/alternative > text/plain)
function findPart(payload, mimeType) {
  if (!payload) return null;
  if (payload.mimeType === mimeType && payload.body?.data) return payload.body.data;
  for (const part of payload.parts || []) {
    const found = findPart(part, mimeType);
    if (found) return found;
  }
  return null;
}

export default async function (ctx) {
  const input = ctx.input || {};
  if (typeof input.query !== "string" || !input.query.trim()) {
    return { success: false, messages: [], error: "missing input: query" };
  }
  const maxResults = Math.min(Math.max(Number(input.max_results) || 20, 1), 50);

  try {
    const list = await fastn.connector.googleGmail.listMessages({ q: input.query, maxResults });
    const messages = [];
    for (const ref of list.output?.messages || []) {
      const msg = (await fastn.connector.googleGmail.getMessage({ id: ref.id, format: "full" })).output;
      if (!msg?.id) continue;
      const h = headerMap(msg.payload);
      messages.push({
        gmail_id: msg.id,
        thread_id: msg.threadId,
        received_at: new Date(Number(msg.internalDate)).toISOString(),
        from: h["from"] || "",
        subject: h["subject"] || "",
        message_id: h["message-id"] || null,
        label_ids: msg.labelIds || [],
        auto_submitted: h["auto-submitted"] || null,
        precedence: h["precedence"] || null,
        list_header: !!(h["list-id"] || h["list-unsubscribe"]),
        text_b64: findPart(msg.payload, "text/plain"),
        html_b64: findPart(msg.payload, "text/html"),
      });
    }
    fastn.loki.info("inbound emails fetched", { count: messages.length });
    return { success: true, messages, error: null };
  } catch (err) {
    fastn.loki.error("inbound fetch failed", { error: String(err?.message || err) });
    return { success: false, messages: [], error: String(err?.message || err) };
  }
}
