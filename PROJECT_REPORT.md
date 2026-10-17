# Ombot Project Report

## 1. Executive summary

Ombot is an AI-assisted bank complaint triage platform. It accepts customer complaints,
classifies them against a bank-owned category registry, routes them by risk, gathers
supporting evidence, and presents a human-facing case workspace.

The central product decision is **risk-tiered human/AI collaboration**:

| Tier | Typical categories | Default handling |
| --- | --- | --- |
| Critical | Unauthorized transaction, account takeover, lost/stolen device | AI prepares evidence and a report; a human investigates and replies |
| Moderate | Wrong recipient, failed payment, delayed transfer, duplicate charge | A human investigates personally or delegates to the stronger agent |
| Low | App/login issue, fees, general feedback | A cheaper model drafts and sends a reply, subject to sampled audit |
| Unknown | No reliable registry match | Human maps the case to an existing category or creates one |

The system is deliberately conservative:

1. **Rules decide risk.** The LLM proposes categories, but tier is looked up from the
   registry and can only be raised by deterministic safeguards.
2. **Unknown goes to a human.** Low-confidence or invalid model output does not create
   an automatic low-risk response.
3. **Money-moving operations are approval-gated in code.** Prompts cannot bypass the
   approval mechanism.
4. **Important work is auditable.** Classifications, reports, tool calls, human decisions,
   gateway results, and model usage are recorded.
5. **The demo uses synthetic data.** The database seeder creates a deterministic banking
   world for repeatable demonstrations and tests.

This document describes the implementation as it exists in the repository. The older
planning documents remain useful for background and intent:
[ARCHITECTURE.md](./ARCHITECTURE.md), [BACKEND_IMPLEMENTATION.md](./BACKEND_IMPLEMENTATION.md),
and [TECH_STACK.md](./TECH_STACK.md).

## 2. Repository map

| Location | Responsibility |
| --- | --- |
| [`backend/app/main.py`](./backend/app/main.py) | FastAPI application, startup lifecycle, database initialization, route registration, frontend serving |
| [`backend/app/pipeline.py`](./backend/app/pipeline.py) | End-to-end complaint intake orchestration |
| [`backend/app/models.py`](./backend/app/models.py) | SQLModel persistence models |
| [`backend/app/schemas.py`](./backend/app/schemas.py) | Pydantic LLM and HTTP contracts |
| [`backend/app/classify.py`](./backend/app/classify.py) | Registry-aware LLM classification |
| [`backend/app/routing.py`](./backend/app/routing.py) | Deterministic confidence filtering and risk routing |
| [`backend/app/report.py`](./backend/app/report.py) | Evidence collection and structured report generation |
| [`backend/app/agents/`](./backend/app/agents/) | Low-tier reply generation and moderate-tier investigation agent |
| [`backend/app/approvals.py`](./backend/app/approvals.py) | Human approval and execution gate for money-moving actions |
| [`backend/app/tools/`](./backend/app/tools/) | Local tools, local gateway, Fastn gateway, and gateway abstraction |
| [`backend/app/mcp_server/server.py`](./backend/app/mcp_server/server.py) | Standalone MCP resources and tools |
| [`backend/app/routers/`](./backend/app/routers/) | HTTP API route modules |
| [`backend/app/seeding.py`](./backend/app/seeding.py) | Deterministic synthetic banking dataset |
| [`backend/app/evaluation.py`](./backend/app/evaluation.py) | Sealed classifier/routing evaluation and learning-loop measurement |
| [`backend/tests/`](./backend/tests/) | Backend unit, API, integration, safety, and gateway tests |
| [`ombot_frontend/src/`](./ombot_frontend/src/) | React dashboard, API adapters, pages, components, and SSE client |
| [`fastn/workflows/`](./fastn/workflows/) | Fastn workflow source for notifications, tickets, email intake, and replies |
| [`Dockerfile`](./Dockerfile) | Two-stage production image: build React, then serve it from FastAPI |

Generated or local runtime artifacts such as `node_modules`, `.venv`, SQLite databases,
build output, and caches are not application source and should not be treated as part of
the architecture.

## 3. Architectural overview

```text
Customer complaint
        |
        v
FastAPI POST /api/complaints
        |
        v
Create Complaint + Case
        |
        v
LLM classifier <---- Category registry + learning examples
        |
        v
Deterministic routing
  - confidence threshold
  - highest matching tier wins
  - danger phrase critical floor
        |
        +--> Evidence tools + policy documents
        |          |
        |          v
        |     Structured report
        |
        +--> Critical: notify officer and create ticket
        +--> Moderate: wait for human investigate/delegate decision
        +--> Low: cheap reply agent, escalation safeguard, auto reply
        +--> Unknown: human category mapping or new category
        |
        v
SQLite records cases, reports, decisions, and learning examples
        |
        +--> SSE event history for case detail/tool traces
        +--> Local gateway or Fastn outbound workflows
```

The backend and dashboard are separate during development but are packaged as one service
for deployment. FastAPI serves the compiled frontend after registering `/api` routes, so
API paths take precedence over the SPA fallback.

## 4. End-to-end complaint lifecycle

### 4.1 Intake and case creation

`POST /api/complaints` validates the optional customer ID and calls
[`process_complaint`](./backend/app/pipeline.py). The pipeline:

1. Inserts a `Complaint`.
2. Optionally lets email intake associate the complaint with its source thread.
3. Inserts a `Case` immediately so every later audit record has a case ID.
4. Classifies the text.
5. Computes the tier and assigned layer.
6. Collects database evidence.
7. Generates and stores the structured report.
8. Sends critical/unknown officer notifications through the gateway.
9. Creates a ticket for critical cases.
10. Runs the low-tier reply path only after a successful report.

The case is committed at several checkpoints. This keeps partial work visible to staff
and ensures model failures become explicit human-review states rather than disappearing.

### 4.2 Classification

[`classify.py`](./backend/app/classify.py) builds a prompt containing the current category
registry and up to ten recent `LearningExample` records. The model must return
`ClassificationResult`, containing category IDs, confidence values, and supporting quotes.

The result is validated and filtered against category IDs actually present in the database.
Unknown IDs, missing matches, invalid JSON, provider errors, and schema failures become a
`raw_category` of `"none"` and are logged. The classifier is never trusted to set a tier.

The shared LLM wrapper in [`llm.py`](./backend/app/llm.py):

- uses the OpenAI-compatible async client and configured base URL;
- requests JSON mode where supported;
- retries in compatibility mode for providers that reject `response_format`;
- removes reasoning blocks and code fences before parsing;
- validates the result with Pydantic;
- records token usage, latency, model, and errors;
- returns a failure-shaped `LLMResult` so callers can route safely to a human.

### 4.3 Deterministic routing

[`routing.py`](./backend/app/routing.py) is intentionally independent of LLM urgency
claims:

- matches below `CONFIDENCE_THRESHOLD` (default `0.7`) are ignored;
- matches without a supporting quote are ignored;
- the highest tier among usable registry matches wins;
- no usable match produces `unknown`;
- configured danger phrases force `critical`, even for an otherwise unknown case;
- `critical`, `moderate`, and `low` map to layers 1, 2, and 3;
- non-low cases wait for a human, while low cases remain `new` until a reply is actually sent.

If several categories match, the most severe category wins. This prevents a broad or
low-risk match from masking a serious one.

### 4.4 Evidence collection and reports

[`report.py`](./backend/app/report.py) gathers evidence from local tools using the customer
ID and complaint text. It tries, in order, to identify a transaction by:

1. explicit transaction IDs such as `T1234`;
2. an amount quoted by the customer;
3. the latest customer transaction, clearly marked as a possibly unrelated fallback.

The evidence bundle can include customer history, sent and received transactions, security
events, usual payees, sender/receiver details, and merchant details. Policy documents are
selected from category policy references, with keyword search as a best-effort fallback for
unknown complaints.

The report model returns a summary, likely causes, policy references, evidence, and a
recommended next step. Evidence from the database replaces any model-generated evidence,
so the LLM cannot invent transaction facts. A report failure stores an error summary and
forces `awaiting_human`.

### 4.5 Critical cases

Critical cases never enter an autonomous reply path. The pipeline notifies an officer and
creates a ticket through the gateway. The dashboard exposes the report and evidence so a
human can investigate, edit a reply, and resolve the case.

If the human proposes a freeze, the action becomes an approval request. It is not executed
until a stored human approval is found for that exact request.

### 4.6 Moderate cases

Moderate cases begin in `awaiting_human`. Staff can:

- investigate personally, which keeps the case human-led; or
- delegate to the Layer 2 agent.

Delegation changes the case to `agent_running` and runs a background task. The agent is a
plain OpenAI-style tool-calling loop rather than a framework. It has:

- a configured maximum step count (`AGENT_MAX_STEPS`, default `8`);
- a timeout (`AGENT_TIMEOUT_SECONDS`, default `60`);
- read-only lookup tools;
- `draft_reply`;
- proposal-only `freeze_payment` and `issue_refund` tools.

A read-only investigation can resolve with a drafted reply. A money-moving proposal moves
the case to `awaiting_approval`. A timeout, provider error, invalid final response, or step
limit returns the case to human review.

### 4.7 Low cases

[`low_reply.py`](./backend/app/agents/low_reply.py) is restricted to short reply drafting.
Before calling the model, deterministic escalation phrases such as “deducted”, “money is
missing”, and “charged twice” can raise the case to a human. The model can also set
`needs_escalation`; that decision is checked again against the text of the generated reply.

Only a successful, non-escalated result is sent. Sending is audited and the case becomes
`auto_replied`. Failed generation becomes `awaiting_human`. The low-tier audit endpoint
samples sent replies for human review; a reviewer can mark a sample fine or escalate it.

### 4.8 Unknown categories and continuous learning

Unknown cases appear in the Unknown queue. Staff can map one to an existing category or
create a category through `POST /api/categories`. Human mapping:

- writes a `LearningExample`;
- records a human supporting quote;
- recalculates tier using the same danger floor;
- reruns low-tier handling if the mapped tier is low.

Human-created categories are marked `source="human_added"` and are included in future
classifier registry prompts. The evaluation code measures the effect of teaching from one
half of the labeled examples on a held-out half.

## 5. Data model and persistence

SQLite is accessed through SQLModel. The core entities are defined in
[`models.py`](./backend/app/models.py):

| Model | Purpose |
| --- | --- |
| `Customer` | Synthetic customer identity, contact, home city, usual device, and segment |
| `Account` | Customer accounts, balance, status, type, and currency |
| `Card` | Cards associated with accounts |
| `Merchant` | Merchant identity and complaint count |
| `Transaction` | Sender/receiver, amount, merchant, device, location, status, and failure reason |
| `SecurityEvent` | Login, device, credential, SIM, and beneficiary evidence |
| `Category` | Registry ID, description, examples, causes, policy refs, tier, and source |
| `Complaint` | Original text, customer link, receipt time, and optional synthetic ground truth |
| `Case` | Classification, confidence, quotes, tier, status, report, and assigned layer |
| `Decision` | Immutable-style audit event with actor, action, payload, evidence, model, and time |
| `AppMeta` | Database-scoped metadata such as email cursors and evaluation results |
| `LearningExample` | Human category labels used in future classifier prompts |

The seed builder in [`seeding.py`](./backend/app/seeding.py) creates a deterministic
synthetic world, including scenario-specific evidence for unauthorized activity, takeover,
lost devices, transfer problems, failed/pending transactions, duplicate charges, app
issues, and fees. Startup seeding runs only when the category table is empty and
`SEED_ON_STARTUP=true`.

The database is intentionally simple for the prototype. SQLite is suitable for a local or
single-container demo, but a multi-worker production deployment would need a stronger
database, migration process, concurrency strategy, and backup policy.

## 6. API surface

All application routes are mounted under `/api`; health is available at both `/health` and
`/api/health`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/complaints` | Submit and process a complaint |
| `GET` | `/api/cases` | List cases with optional tier/status and pagination |
| `GET` | `/api/cases/{id}` | Case detail including decisions and pending approvals |
| `POST` | `/api/cases/{id}/decision` | Human investigate, delegate, map, resolve, approve, or reject |
| `POST` | `/api/cases/{id}/delegate` | Dedicated moderate-case delegation endpoint |
| `PATCH` | `/api/cases/{id}/draft-reply` | Save a human-edited draft |
| `GET` | `/api/cases/{id}/stream` | SSE case event and tool trace stream |
| `GET` | `/api/categories` | List category registry |
| `POST` | `/api/categories` | Create a human-added category |
| `GET` | `/api/audit` | Query audit decisions |
| `GET` | `/api/low-tier/audit-sample` | Get sent low-tier samples |
| `POST` | `/api/low-tier/audit-sample/{id}/review` | Review a low-tier sample |
| `GET` | `/api/metrics` | Current case and evaluation metrics |
| `POST` | `/api/eval/run` | Run the sealed classifier evaluation |
| `GET` | `/api/inbound/email/status` | Show optional email intake state |
| `POST` | `/api/inbound/email/poll` | Trigger an email poll immediately |

Pydantic response models in [`schemas.py`](./backend/app/schemas.py) are the backend
contract. The frontend uses typed adapters in [`api/adapters.ts`](./ombot_frontend/src/api/adapters.ts)
to translate backend-shaped data into dashboard models.

## 7. Frontend architecture

The dashboard is a strict TypeScript React 19 application built with Vite and styled with
Tailwind CSS. React Router defines the screen routes; TanStack Query manages server state.
The main composition is:

- [`App.tsx`](./ombot_frontend/src/App.tsx): route table and application shell;
- [`components/layout/AppShell.tsx`](./ombot_frontend/src/components/layout/AppShell.tsx):
  navigation, queue counts, and environment indicator;
- `pages/`: submit, critical, moderate, unknown, case detail, low-tier audit, audit log,
  metrics, and category registry screens;
- `components/case/`: queue tables, report display, and tool trace timeline;
- `components/common/`: badges, status pills, dialogs, loading and empty states;
- [`api/client.ts`](./ombot_frontend/src/api/client.ts): HTTP API and mock switch;
- [`api/mock.ts`](./ombot_frontend/src/api/mock.ts): stand-alone in-memory demo behavior;
- [`api/stream.ts`](./ombot_frontend/src/api/stream.ts): real SSE consumer or mock trace simulator.

`VITE_USE_MOCK=true` allows the dashboard to run without the backend. With the flag false,
the Vite development server proxies `/api` to `http://localhost:8000`. The production
Docker build sets the value through a build argument and normally connects to the real
FastAPI service.

The frontend presents the same governance model as the backend: risk badges, human
decision actions, editable drafts, pending approval dialogs, audit history, category
learning, and metrics. The frontend is not a second source of truth for safety decisions;
the backend validates every action.

## 8. Realtime events and auditability

[`sse.py`](./backend/app/sse.py) implements a per-case in-memory event bus. Events are
replayed to late subscribers, retained up to 200 per case, and terminate on `agent_done` or
`error`. Events include classification, evidence fetch, report generation, agent steps,
tool calls, decisions, and failures.

This event bus is intentionally process-local. It is reliable for the one-process demo, but
does not provide cross-worker replay or durable event delivery. A production deployment
using multiple workers should move the event stream to a shared broker or persisted event
store.

The durable audit log is the source for governance and history. The SSE stream is a
presentation and progress mechanism, not the only record of an operation.

## 9. Tool and integration architecture

### 9.1 Local tools and MCP

Local read tools query the synthetic SQLite database and policy files. The standalone MCP
server exposes:

- `categories://registry` as a registry resource;
- `policies://{policy_id}` as policy resources;
- transaction, account, customer history, security, merchant, and policy search tools;
- draft reply and send reply operations where permitted;
- proposal-only money-moving tools.

MCP money-moving tools create an approval request rather than changing an account or
transaction directly.

### 9.2 Gateway abstraction

[`gateway.py`](./backend/app/tools/gateway.py) provides a common interface for officer
notifications, ticket creation, and approved reply delivery. It wraps either:

- `LocalGateway`, which records safe local outcomes for offline demos; or
- `FastnGateway`, which calls configured Fastn workflows.

Every call is audited and emitted to the case stream. If Fastn is disabled, unavailable, or
returns failure, the gateway records the error and falls back to the local implementation.
This preserves the demo while keeping the failure visible.

### 9.3 Fastn workflows

The source workflows in [`fastn/workflows/`](./fastn/workflows/) cover:

- officer notification;
- ClickUp ticket creation;
- Gmail reply delivery;
- inbound Gmail polling.

[`fastn/build.mjs`](./fastn/build.mjs) inlines shared crypto helpers into deployable
workflow files. [`fastn/deploy.mjs`](./fastn/deploy.mjs) compares, updates, and publishes
workflow versions using configured environment variables. The manifest and workflow IDs
are kept in [`fastn/workflows.json`](./fastn/workflows.json).

Approved replies use an HMAC token over the complaint ID and exact reply text. The Fastn
workflow verifies the token and uses idempotency keys so retries do not send duplicate
messages. Real-recipient delivery is separately controlled by Fastn environment
configuration.

## 10. Safety and governance decisions

### Money-moving guardrail

`freeze_payment` and `issue_refund` are only executable through
[`execute_approved_action`](./backend/app/approvals.py). The code verifies:

- the request exists and belongs to the case;
- parameters refer to existing records;
- refund amount is positive and does not exceed the transaction amount;
- a human `approve` decision exists for that exact request;
- the request was not already executed.

Rejection hands the case back to human handling. Approval is recorded before execution,
and execution is recorded afterward.

### Reply guardrails

- Critical and unknown cases cannot be autonomously replied to through the MCP send tool.
- Low-tier reply generation has deterministic and model-based escalation checks.
- Human edits replace agent drafts before a human resolve action.
- Fastn reply delivery requires a backend-generated authorization token.
- Local fallback delivery is used when external integration is not configured.

### Data safety

The repository's intended data is synthetic. The deployment image runs as a non-root
`ombot` user and stores its SQLite database under `/app/data`. Secrets belong in environment
configuration; do not commit `.env` values, API keys, or Fastn credentials.

The prototype does not implement authentication or authorization for dashboard users. It
should not be exposed publicly without an identity layer, role checks, TLS, secret
management, rate limiting, and production data handling controls.

## 11. Metrics and evaluation

[`metrics.py`](./backend/app/metrics.py) computes live values from stored cases and audit
usage:

- total cases;
- cases by tier and status;
- critical recall;
- category accuracy;
- cost saving relative to using the strong model for all logged tokens;
- low-case over-escalation;
- unknown/out-of-list human routing rate;
- last sealed evaluation results.

[`evaluation.py`](./backend/app/evaluation.py) uses the labeled JSON test set in
[`backend/seed/complaints_labeled.json`](./backend/seed/complaints_labeled.json) and an
in-memory database. It evaluates classification/routing without modifying the live
database, then teaches misclassified even-indexed examples and measures held-out odd-indexed
learning effect.

The metrics are useful demo indicators, not regulatory performance evidence. They depend on
the quality and coverage of the synthetic labels and the configured model.

## 12. Configuration

The documented template is [`.env.example`](./.env.example). Important settings include:

| Setting | Role |
| --- | --- |
| `LLM_BASE_URL`, `LLM_API_KEY` | OpenAI-compatible provider connection |
| `CLASSIFIER_MODEL` | Category classifier |
| `REPORT_MODEL` | Structured report generation |
| `LOW_TIER_REPLY_MODEL` | Cheap low-tier reply model |
| `AGENT_MODEL` | Strong delegated moderate-tier agent |
| `CONFIDENCE_THRESHOLD` | Minimum classification confidence, default `0.7` |
| `DANGER_PHRASES` | Critical floor phrases |
| `ESCALATION_PHRASES` | Low-tier escalation phrases |
| `AGENT_MAX_STEPS` | Moderate agent loop cap, default `8` |
| `AGENT_TIMEOUT_SECONDS` | Moderate agent timeout, default `60` |
| `DATABASE_URL` | SQLModel database URL |
| `SEED_ON_STARTUP` | Seed an empty database |
| `FASTN_ENABLED` | Enable external workflow gateway |
| `FASTN_WORKFLOW_IDS` | Workflow name-to-ID mapping |
| `REPLY_AUTH_SECRET` | Shared secret for approved reply authorization |
| `INBOUND_EMAIL_ENABLED` | Enable optional Gmail polling |

The backend requires Python `>=3.12` according to
[backend/pyproject.toml](./backend/pyproject.toml). The frontend README documents Node.js
18 or newer.

## 13. Local development

### Backend

From `backend\`:

```powershell
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

The application initializes the schema and seeds an empty database on startup when
`SEED_ON_STARTUP=true`. To explicitly rebuild synthetic data, use the project seeding
entry point documented in [TECH_STACK.md](./TECH_STACK.md) and ensure the selected
database URL is the intended one.

### Frontend

From `ombot_frontend\`:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. Set `VITE_USE_MOCK=true` for a browser-only demo or
`false` to use the FastAPI backend.

### MCP server

From `backend\`, run the standalone server over stdio:

```powershell
uv run python -m app.mcp_server.server
```

For streamable HTTP, use the server's `--http`, `--host`, and `--port` options. It is a
separate process from FastAPI and shares the configured database.

### Docker

From the repository root:

```powershell
docker build -t ombot .
docker run --rm -p 8000:8000 --env-file .env ombot
```

The image builds the frontend with Node 22, installs the Python backend on Python 3.12,
serves both through Uvicorn, and performs a `/health` check. Persist `/app/data` in any
deployment that needs the SQLite database to survive container replacement.

## 14. Validation and test coverage

The backend test suite uses pytest and covers:

- health and API contracts;
- classification filtering and failure routing;
- highest-tier and danger-floor routing;
- evidence selection and report failures;
- synthetic seeding invariants;
- MCP resources, tool exposure, and money-tool proposal behavior;
- approval-required freeze/refund execution and idempotence;
- low-tier auto replies and escalation;
- moderate-agent read-only, proposal, timeout, and API-failure paths;
- audit samples and learning-loop mapping;
- SSE replay and termination;
- local/Fastn gateway behavior, fallback, authentication, and deduplication;
- inbound email cleaning, filtering, customer matching, and threaded replies;
- LLM JSON compatibility and failure handling.

Run the focused backend suite from `backend\`:

```powershell
uv run pytest
```

Build and lint the frontend from `ombot_frontend\`:

```powershell
npm run build
npm run lint
```

Evaluation requiring a live model also requires `CLASSIFIER_MODEL` and the other relevant
provider configuration. Tests disable Fastn by default so they do not send real Slack,
ClickUp, or Gmail traffic.

## 15. Known limitations and production follow-up

The project is a strong demo/prototype, not a finished banking production system. The main
follow-up areas are:

1. Add authentication, role-based authorization, and operator identity to every human action.
2. Replace SQLite with a managed transactional database and add schema migrations.
3. Replace the process-local SSE event bus with durable shared event infrastructure.
4. Add model/provider observability, tracing, spend budgets, and circuit breakers.
5. Formalize prompt/model versioning and retain reproducible evaluation snapshots.
6. Add stronger input validation, abuse controls, and customer-data redaction policies.
7. Define retention, deletion, encryption, backup, and disaster recovery policies.
8. Make external delivery and retry semantics operationally observable.
9. Add deployment configuration for separate development, test, and production Fastn
   environments.
10. Establish human-review SLAs and escalation ownership for critical and unknown queues.
11. Review the API/frontend contract continuously; the frontend currently uses hand-maintained
   adapters rather than generated OpenAPI TypeScript types.
12. Revisit the older planning docs when behavior changes so they do not describe removed or
   still-proposed features as implemented.

## 16. Architectural decision record

### Why risk tiers are registry-driven

Risk is a governance decision owned by the bank, not a probabilistic model output. A
database registry makes the policy inspectable, editable through a controlled learning
loop, and testable independently of model wording.

### Why the model returns supporting quotes

Quotes make a category proposal explainable to staff and allow the router to reject a
match that has no textual evidence. This is a lightweight, useful boundary between
language-model interpretation and deterministic business logic.

### Why there are separate cheap and strong model paths

Low-risk complaints are numerous and inexpensive to answer. Moderate investigations benefit
from a tool-using stronger model. Critical complaints deliberately stop at an AI-generated
evidence pack so the highest-risk decision remains human-led. This is both a cost-control
choice and a governance choice.

### Why the agent is a plain loop

The moderate agent has a small, explicit tool set, a bounded step count, a timeout, and
clear approval semantics. Avoiding a general agent framework keeps the behavior visible,
testable, and easy to constrain for a hackathon-sized system.

### Why gateways have local fallback

Fastn adds useful outbound integrations but can be unavailable, misconfigured, or unsafe
to call during local development. A common gateway lets the application preserve its
workflow and audit behavior without making external side effects a prerequisite for the
demo.

### Why synthetic data is first-class

Complaint scenarios need correlated transactions, customers, devices, merchants, and
security events to demonstrate evidence reasoning. Deterministic synthetic data provides
that richness without exposing real customer information and makes tests repeatable.

## 17. Recommended onboarding path

For a new contributor:

1. Read this report and [ARCHITECTURE.md](./ARCHITECTURE.md).
2. Read [`models.py`](./backend/app/models.py), [`schemas.py`](./backend/app/schemas.py),
   and [`pipeline.py`](./backend/app/pipeline.py).
3. Trace one complaint through [`classify.py`](./backend/app/classify.py),
   [`routing.py`](./backend/app/routing.py), and [`report.py`](./backend/app/report.py).
4. Review [`approvals.py`](./backend/app/approvals.py) before changing tools or agent code.
5. Run the backend tests and frontend build.
6. Use mock mode for UI-only work and Fastn-disabled mode for backend work.
7. Add or update tests for every change to routing, approval, gateway, audit, or status
   transitions.

