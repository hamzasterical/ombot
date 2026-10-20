# OmBot

AI-assisted complaint triage for a fintech bank, built around **risk-tiered human/AI collaboration**
("Human + AI: Better Together").

Every incoming complaint is classified against a bank-owned category registry. The category's fixed risk tier
decides how much AI and how much human involvement the case gets:

| Tier | Handled by | Model use |
|---|---|---|
| **Critical** (e.g. unauthorized transaction) | A human investigates; AI only prepares the evidence report | Report generation only |
| **Moderate** (e.g. duplicate charge, delayed transfer) | A human investigates, or delegates to a stronger tool-calling agent | Strong model, supervised |
| **Low** (e.g. app issues, fees, feedback) | A cheap model drafts and sends the reply, with sampled audit | Cheap model |
| **Unknown** | A human maps it to an existing category or creates a new one | None |

## Design principles

1. **Rules decide, AI proposes.** Tier comes from a registry lookup, not from the LLM's opinion.
2. **Unknown means human.** Low-confidence or invalid model output never produces an automatic low-risk reply.
3. **Humans own money-moving actions.** Approval is enforced in code; prompts cannot bypass it.
4. **Everything is audited.** Classifications, reports, tool calls, human decisions and gateway results are stored.
5. **Synthetic data only.** The seeder builds a deterministic demo bank.

## Stack

- **Backend:** Python 3.12, FastAPI, SQLModel (SQLite), OpenAI-compatible LLM client (OpenRouter), MCP server for
  policies and bank-data tools, SSE for live agent traces.
- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS 4, TanStack Query, GSAP.
- **Delivery:** [fastn](fastn/) workflows for Slack, ClickUp and Gmail (optional; logged locally when disabled).
- **Deploy:** single Docker image (Node builds the dashboard, Python serves it and the API on one port).

## Repository layout

```
backend/
  app/
    main.py, config.py, models.py, db.py   app wiring, settings, SQLModel tables
    auth.py, routers/                      session auth and REST API (/api/...)
    classify.py, keyword_fallback.py       LLM classifier and keyword fallback
    routing.py, pipeline.py                tier lookup and intake pipeline
    report.py, replies.py                  evidence reports and reply drafting
    agents/                                low-tier replier, moderate agent, review gate
    mcp_server/                            MCP server and bank policy resources
    tools/                                 local and fastn gateways, local tools
    inbound_email.py                       Gmail intake via fastn
    llm.py                                 client with key failover and circuit breaker
    seed_data.py, seeding.py               demo dataset
  eval/run_eval.py                         classifier evaluation
  tests/                                   pytest suite
ombot_frontend/                            React dashboard and landing page
fastn/                                     workflow sources, build and deploy scripts
```

Further reading: [ARCHITECTURE.md](ARCHITECTURE.md), [PROJECT_REPORT.md](PROJECT_REPORT.md),
[BACKEND_IMPLEMENTATION.md](BACKEND_IMPLEMENTATION.md), [TECH_STACK.md](TECH_STACK.md),
[TEST_FLOW.md](TEST_FLOW.md) (post-deployment checklist).

## Getting started

### Prerequisites

- Python 3.12+ and [uv](https://docs.astral.sh/uv/) (or pip)
- Node.js 22+
- An OpenRouter (or other OpenAI-compatible) API key

### Configure

```bash
cp .env.example .env
```

Set at least `LLM_API_KEY`, the four model names (`CLASSIFIER_MODEL`, `REPORT_MODEL`, `LOW_TIER_REPLY_MODEL`,
`AGENT_MODEL`) and `AUTH_SECRET`. For local HTTP development set `AUTH_COOKIE_SECURE=false`.
See [.env.example](.env.example) for every option, including optional `LLM_BACKUP_API_KEYS`, fastn delivery and
email intake.

### Run the backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

On first start with an empty database the app seeds demo data (`SEED_ON_STARTUP=true`).
Health check: `GET /health`.

### Run the frontend

```bash
cd ombot_frontend
npm install
npm run dev
```

Set `VITE_USE_MOCK=true` to run the dashboard against built-in mock data without a backend.

### Docker

```bash
docker build -t ombot .
docker run -p 8000:8000 --env-file .env -v ombot-data:/app/data ombot
```

The container serves the API and the built dashboard on one port. Run a **single instance**: the circuit breaker,
live traces and supervised-run state are held in memory.

## API overview

All routes are under `/api`; `/api/auth/*` handles sign-up, login, logout and `me`.

| Route | Purpose |
|---|---|
| `POST /complaints` | Submit a complaint and run the triage pipeline |
| `GET /cases`, `GET /cases/{id}` | Case queues and detail |
| `POST /cases/{id}/decision` | Human decision (investigate, delegate, approve, reject) |
| `PATCH /cases/{id}/draft-reply` | Edit the drafted reply |
| `POST /cases/{id}/delegate` | Hand a moderate case to the agent |
| `GET/POST /cases/{id}/agent/review` | Supervised-run step review |
| `GET /cases/{id}/stream` | Live agent trace (SSE) |
| `GET/POST /categories` | Category registry |
| `GET /audit`, `/low-tier/audit-sample` | Audit log and low-tier sampling review |
| `GET /metrics` | Dashboard metrics |
| `POST /eval/run` | Run the classifier evaluation |
| `GET /inbound/email/status`, `POST /inbound/email/poll` | Email intake |

## Testing

```bash
cd backend
uv run pytest
uv run python eval/run_eval.py   # classifier evaluation (calls the LLM)
```

```bash
cd ombot_frontend
npm run lint
npm run build
```
