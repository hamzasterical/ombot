// notify_officer: post an OmBot case summary to the officers' Slack channel.
// input  { complaint_id, category, risk_tier, summary, required_action, officer_email? }
// output { success, sent_via, message_id, error }
// env config: ombotSlackChannel (default "#ombot-officers"); the fastn Slack app must be in that channel.
// Never throws on delivery failure: it returns success:false so the backend falls back to local.

const TIER_BADGE = { critical: ":rotating_light: CRITICAL", moderate: ":warning: MODERATE", low: ":information_source: LOW" };

async function resolveChannel(name) {
  if (/^[CG][A-Z0-9]{6,}$/.test(name)) return name;
  const wanted = name.replace(/^#/, "");
  let cursor;
  do {
    const res = await fastn.connector.slack.listConversationsList({ types: "public_channel", limit: 200, cursor });
    const hit = (res.output?.channels || []).find((c) => c.name === wanted);
    if (hit) return hit.id;
    cursor = res.output?.response_metadata?.next_cursor;
  } while (cursor);
  throw new Error(`Slack channel #${wanted} not found (create it and invite the fastn app)`);
}

export default async function (ctx) {
  const input = ctx.input || {};
  const missing = ["complaint_id", "category", "risk_tier", "summary", "required_action"].filter(
    (k) => input[k] === undefined || input[k] === null || String(input[k]).trim() === "",
  );
  if (missing.length) {
    return { success: false, sent_via: "slack", message_id: null, error: `missing input: ${missing.join(", ")}` };
  }

  const tier = String(input.risk_tier).toLowerCase();
  const lines = [
    `*${TIER_BADGE[tier] || tier.toUpperCase()}* complaint #${input.complaint_id} (${input.category})`,
    `*Summary:* ${input.summary}`,
    `*Required action:* ${input.required_action}`,
  ];
  if (input.officer_email) lines.push(`*Assigned officer:* ${input.officer_email}`);

  try {
    const channelName = (await fastn.envConfig.get("ombotSlackChannel")) || "#ombot-officers";
    const channel = await resolveChannel(String(channelName));
    const res = await fastn.connector.slack.createChatPostMessage({ channel, text: lines.join("\n") });
    if (!res.output?.ok) throw new Error(res.output?.error || "Slack rejected the message");
    fastn.loki.info("officer notified", { complaintId: input.complaint_id, tier, channel });
    return { success: true, sent_via: "slack", message_id: res.output.ts, error: null };
  } catch (err) {
    fastn.loki.error("notify failed", { complaintId: input.complaint_id, error: String(err?.message || err) });
    return { success: false, sent_via: "slack", message_id: null, error: String(err?.message || err) };
  }
}
