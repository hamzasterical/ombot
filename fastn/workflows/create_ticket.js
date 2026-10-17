// create_ticket: open a ClickUp task for an OmBot case. Deduplicated per idempotency_key
// (falls back to complaint_id). The backend scopes the key by database instance, because
// complaint ids restart at 1 when the database is re-seeded.
// input  { complaint_id, category, summary, risk_tier, dashboard_url?, idempotency_key? }
// output { success, ticket_id, ticket_url, error }
// env config: ombotClickupListId (required; the ClickUp list that receives OmBot tickets).

// ClickUp priority: 1 urgent, 2 high, 3 normal, 4 low.
const TIER_PRIORITY = { critical: 1, moderate: 2, low: 3 };

export default async function (ctx) {
  const input = ctx.input || {};
  const missing = ["complaint_id", "category", "summary", "risk_tier"].filter(
    (k) => input[k] === undefined || input[k] === null || String(input[k]).trim() === "",
  );
  if (missing.length) {
    return { success: false, ticket_id: null, ticket_url: null, error: `missing input: ${missing.join(", ")}` };
  }

  const dedupeKey = `ombot:ticket:${input.idempotency_key || input.complaint_id}`;
  const existing = await fastn.state.get(dedupeKey);
  if (existing) return { success: true, ticket_id: existing.ticket_id, ticket_url: existing.ticket_url, error: null };

  try {
    const listId = await fastn.envConfig.get("ombotClickupListId");
    if (!listId) throw new Error("env config ombotClickupListId is not set");
    const tier = String(input.risk_tier).toLowerCase();

    const body = [
      `**Complaint #${input.complaint_id}**, category \`${input.category}\`, risk tier **${tier}**.`,
      "",
      String(input.summary),
    ];
    if (input.dashboard_url) body.push("", `Case in OmBot: ${input.dashboard_url}`);

    const res = await fastn.connector.clickup.createTask({
      listId: String(listId),
      name: `[OmBot ${tier}] Complaint #${input.complaint_id}: ${input.category}`.slice(0, 250),
      markdown_description: body.join("\n"),
      priority: TIER_PRIORITY[tier] || 3,
      tags: ["ombot", `ombot-${tier}`],
    });
    const task = res.output || {};
    if (!task.id) throw new Error(`ClickUp did not return a task id: ${JSON.stringify(task).slice(0, 300)}`);

    const ticket = { ticket_id: task.id, ticket_url: task.url || `https://app.clickup.com/t/${task.id}` };
    await fastn.state.set(dedupeKey, ticket);
    fastn.loki.info("ticket created", { complaintId: input.complaint_id, taskId: task.id });
    return { success: true, ...ticket, error: null };
  } catch (err) {
    fastn.loki.error("ticket failed", { complaintId: input.complaint_id, error: String(err?.message || err) });
    return { success: false, ticket_id: null, ticket_url: null, error: String(err?.message || err) };
  }
}
