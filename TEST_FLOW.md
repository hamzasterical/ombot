# OmBot: post-deployment test flow

Run these in order on the deployed app. Each step lists what to do and what you should see. When something differs,
send back: the step number, the case id, what you saw, and (if you can) the case's Audit Trail tab and the server log.

`BASE` below is your deployed URL, for example `https://your-app.example.com`.

## 0. Before you start

Variables set on the service: `LLM_API_KEY`, `CLASSIFIER_MODEL`, `REPORT_MODEL`, `LOW_TIER_REPLY_MODEL`, `AGENT_MODEL`,
`DATABASE_URL=sqlite:////app/data/app.db` with a persistent volume at `/app/data`. Optional: `FASTN_*`, `INBOUND_EMAIL_*`.
Run **one** instance only (breaker, live trace and supervised-run state live in memory).

Seeded customers you will use:

| Customer | Data | Use |
|---|---|---|
| `CUST-10031` | transfer `T1955`, $1,200 to G. Kim, pending | moderate, delayed transfer, no refund needed |
| `CUST-10037` | `T2135` and `T2136`, $129.99 at ShopSphere, 40 s apart | moderate, duplicate charge, refund proposal |
| `CUST-10032` | transfer `T1987`, $2,800, pending | spare moderate case |
| any customer | | critical / low / unknown texts below |

Texts:

- **Pending (moderate):** `I sent $1,200 to G. Kim four days ago from the app (reference T1955) and it still shows as pending. The money has left my account. Where is it?`
- **Duplicate (moderate):** `I was charged twice for the same ShopSphere order #SS-48213, $129.99 each, about a minute apart on 15 October. Please investigate and fix it.`
- **Critical:** `My account was hacked and someone moved money out of it overnight.`
- **Low:** `How do I reset my password?`
- **Low that must escalate:** `The app froze and money was deducted from my account.`
- **Unknown:** `I want to apply for a mortgage.`

## 1. Smoke

1. `curl BASE/health` returns `{"status":"ok","llm":{"available":true,"retry_in_seconds":0}}`.
2. Open `BASE`. The dashboard loads and shows real data, not demo data. The Metrics page loads without errors.
   If you see built-in mock cases, the image was built with `VITE_USE_MOCK=true`: rebuild with `false`.
3. Refresh on a deep link such as `BASE/cases/1`. The page loads (no 404).

## 2. Intake and routing (background processing)

For each text, open Submit Complaint, enter the Customer ID and text, submit.

| Text | Expected tier / queue | Expected status when finished |
|---|---|---|
| Pending | Moderate | `awaiting_human`, workflow **Unchecked** |
| Duplicate | Moderate | `awaiting_human` |
| Critical | Critical | `awaiting_human`; critical words force this tier |
| Low | Low | `auto_replied`, workflow **Solved** |
| Low that must escalate | escalates to Moderate | `awaiting_human`, no reply sent, audit shows an `escalate` entry |
| Unknown | Unknown queue | `awaiting_human` |

Also check:
- The page waits (spinner) a few seconds, then shows the result. It does not time out.
- In another tab, open the Moderate queue right after submitting. The case may appear in `processing` state before it routes.
- Every case has a **State** badge. Each queue filter works: pick one chip, then two, then **All** to clear.
  The counts on the chips match the cases listed.

## 3. Critical case: human only

1. Open the critical case. Tabs: Overview, Resolution, Audit Trail. There are **no** Agent tabs.
2. Overview shows complaint, categories and a report that includes evidence from the database.
3. Click **Start investigation**. The badge changes to **Under investigation**.
4. Resolution tab: write a reply (Edit Reply, Save Draft), then **Approve & Dispatch**.
   The status becomes `resolved`, workflow **Solved**. If fastn is on, the Gmail reply goes out.
5. Negative: `curl -X POST BASE/api/cases/<critical id>/delegate` returns **409** (agents never touch critical cases).

## 4. Moderate case: let the agent handle it

1. Use the **Duplicate** case. Moderate queue, **Let the agent handle it**.
2. The case opens on the Agent Trace tab. Steps appear live (customer history, transactions, merchant, policy).
3. Expected end: agent proposes `issue_refund`. Status `awaiting_approval`, red dot on **Resolution**.
4. Resolution tab shows the refund (txn, amount $129.99, reason). **Authorize & Execute**, confirm.
   Status becomes `resolved`. Check the account balance rose by $129.99 exactly **once**.
5. Repeat with another duplicate-style complaint and press **Reject**. Nothing executes, case does not resolve silently.
6. Use the **Pending** case the same way. Expected end: `resolved` with a reply and no approval (no money moves).
7. Reload the page while the agent runs. The trace still follows, no duplicate steps.

## 5. Moderate case: supervised run

Use a fresh Pending or Duplicate case. Case page, **Supervised Run** tab.

1. Pick **Review every step**, **Start supervised run**.
2. The agent pauses at step 1. The card shows the tool, a plain explanation and its arguments. Red dot on the tab.
3. **Approve step**. Step 2 appears. The trace tab marks step 1 "Approved by reviewer".
4. On a later step, **Reject…** with a note such as `check the receiver first`. The agent should change course
   (it sees your note). The trace marks the step "Rejected by reviewer" and its output shows `rejected_by_reviewer`.
5. On another step, **Edit arguments**, change a value (for example a txn id), **Approve with my edits**.
   The trace marks it "Edited by reviewer" and shows your values.
6. Switch the pause level to **Risky only**. Lookups run without stopping; it stops again at `draft_reply` / `issue_refund`.
7. At a paused step, switch to **Let it finish**. The waiting step runs and the agent completes alone.
8. Start another supervised run and click **Stop run**. Status goes to `awaiting_human`.
9. Pause on a step, then reload the page. The pending card is still there. Open the same case in a second tab and
   answer from there. The first tab updates within a couple of seconds.
10. Audit Trail lists each human `step_review` with verdict, note and edits.
11. Negative: while paused, `curl -X POST BASE/api/cases/<id>/agent/review -H 'Content-Type: application/json' -d '{"verdict":"approve","call_no":99}'` returns **409**.

## 6. Unknown queue and learning loop

1. Submit the **Unknown** text. It lands in the Unknown queue.
2. Create a new category (low tier) and map the case. It becomes Low, replies automatically, **Solved**.
3. Submit a similar text. It now routes to that category by itself, with no human step.

## 7. Low tier audit

1. Low Tier Audit page lists auto-replied cases. Badges: **Unchecked** (not yet audited), **Solved** (verified), **Under investigation** (escalated).
2. **Looks fine** on one: it becomes Solved. **Wrong, escalate** on another: it appears as a moderate case waiting for staff.
3. The state filter chips work here too.

## 8. Guardrails (all should be refused)

| Action | Expected |
|---|---|
| Approve with nothing pending: `POST /api/cases/<id>/decision {"action":"approve"}` | 409 |
| Approve the same refund twice | second one refused ("already executed"), balance unchanged |
| Delegate a case that is not moderate / not waiting on a human | 409 |
| Edit the draft after the case is resolved | 409 |
| Complaint containing `hacked`, `stolen`, `not me` or `didn't make this` | always Critical |
| Reply text asks for a PIN, password or OTP | never appears in any agent draft |

## 9. Failure behaviour

1. **Bad key:** set `LLM_API_KEY` to garbage, restart. Submit a complaint. It ends in the Unknown queue with a
   report saying manual review is needed. No crash, and nothing stays `processing`.
   `GET /api/health` keeps `llm.available: true` (a bad key is not a rate limit).
2. **Rate limit (breaker):** hard to trigger on demand, covered by automated tests. On a free OpenRouter tier you may see it
   during a burst: submit 6 complaints quickly. If the breaker opens, `/api/health` shows `available:false` with a
   countdown, new cases say "LLM unavailable (rate limit reached)" in the report, and the app recovers by itself.
3. **Restart mid-run:** start a supervised run, pause on a step, restart the service. The case becomes `awaiting_human`
   and its audit trail has a `recovered` entry. Same for a case caught in `processing`.
4. **Persistence:** restart the service. Cases, decisions and balances remain. (If they vanish, the volume is not mounted at `/app/data`.)
5. **Slow model:** if one agent turn exceeds 60 s the case goes to a human with "no answer from the model within 60s on step N".

## 10. Email intake (only if enabled)

1. Set the sender's email on the customer record to the Gmail you will send from.
2. Send the Pending email to the bank inbox. Within `INBOUND_POLL_SECONDS` a case appears for that customer.
3. After resolving it, the reply arrives in the same Gmail thread. No second reply to the same email.

## 11. Evaluation and metrics

1. Metrics page, **Run evaluation**. It completes and shows critical recall, category accuracy and cost saving.
   Send me the numbers. Critical recall is the one that must not drop: a missed critical case is the worst failure.

## What to send back when something fails

- Step number and the case id.
- The case's **Audit Trail** tab (or `GET BASE/api/cases/<id>`).
- Server log lines around the time.
- For UI problems, a screenshot and the tab you were on.
