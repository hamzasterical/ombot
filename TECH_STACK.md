# Tech Stack

Companion to `ARCHITECTURE.md`. This file **supersedes section 7 (Tech stack) and the frontend choice in section 11** of that document. For what the system does and why, read `ARCHITECTURE.md` first.

**Status tags**

- `[DECIDED]` — confirmed by the project owner.
- `[PROPOSED]` — recommended default; use unless told otherwise.
- `[OPEN]` — needs an answer; use the stated default meanwhile.

**Guiding rule `[DECIDED]`:** use existing SDKs and libraries wherever possible. Do not build custom frameworks. Time is very short.

---

## 1. Stack at a glance

| Layer | Choice | Status |
|---|---|---|
| Backend | **Python + FastAPI** | `[DECIDED]` |
| Frontend | **TypeScript + Tailwind CSS** (React + Vite) | TS and Tailwind `[DECIDED]`; React + Vite `[PROPOSED]` |
| Tool / integration layer | **fastn** (MCP gateway), used where it fits | `[DECIDED]` |
| MCP server (ours) | Official MCP Python SDK (FastMCP) for resources and local tool fallbacks | `[PROPOSED]` |
| Database | SQLite via SQLModel | `[PROPOSED]` |
| LLM access | Provider's official Python SDK (OpenAI-compatible) + Pydantic structured output | `[PROPOSED]` |
| Realtime updates | Server-Sent Events (SSE) for agent progress and tool-call trace | `[PROPOSED]` |
| Deployment | One service, one port: FastAPI serves the built frontend | `[PROPOSED]` |

---

## 2. Backend

### Core `[DECIDED: FastAPI]`

- **Python** 3.11+ (3.12 fine).
- **FastAPI** for the HTTP API; **Uvicorn** as the server.
- **Pydantic v2** (ships with FastAPI) for every request, response, and LLM output schema.
- **uv** for dependency and virtualenv management (fast, one lockfile). `[PROPOSED]` Fallback: `pip` + `venv`.

### Supporting libraries `[PROPOSED]`

| Need | Library | Why |
|---|---|---|
| ORM | **SQLModel** (SQLAlchemy + Pydantic) | Same author as FastAPI, one class is both table and schema |
| Settings / env | **pydantic-settings** | Typed config from `.env` |
| HTTP client | **httpx** | Async, used for any direct HTTP calls |
| LLM calls | Provider SDK (see section 5) | Official, least surprise |
| MCP | **mcp** (official Python SDK, includes FastMCP) | Server for resources, client for calling tools. Verify exact import paths against current docs |
| SSE | **sse-starlette** (or FastAPI `StreamingResponse`) | Stream agent steps to the dashboard |
| Tests | **pytest** + **pytest-asyncio** | Eval script and unit tests |
| Lint/format | **ruff** | One tool for both |

Do **not** add: LangChain, LlamaIndex, CrewAI, or any agent framework. The Layer 2 agent is a plain tool-calling loop with a step limit.

### API surface `[PROPOSED]`

```
POST /api/complaints                 submit a complaint (runs classify -> report -> route)
GET  /api/cases?tier=&status=        queues for the dashboard
GET  /api/cases/{id}                 report, evidence, tool-call trace, decision history
POST /api/cases/{id}/decision        human action: approve | reject | investigate | delegate | map_category
POST /api/cases/{id}/delegate        start Layer 2 agent
GET  /api/cases/{id}/stream          SSE: agent steps and tool calls
GET  /api/categories                 registry
POST /api/categories                 human creates a new category + tier (learning loop)
GET  /api/audit                      audit log (decisions table)
GET  /api/low-tier/audit-sample      sampled auto-sent replies
POST /api/eval/run                   run sealed test set
GET  /api/metrics                    numbers for the metrics panel
GET  /api/health
```

FastAPI auto-generates OpenAPI at `/openapi.json`; the frontend uses it to generate types (section 3).

---

## 3. Frontend

### Core `[DECIDED: TypeScript + Tailwind]`

- **TypeScript** (strict mode).
- **Tailwind CSS**. Follow the current official Tailwind install guide for Vite; do not copy old config from memory.
- **React + Vite** `[PROPOSED]` as the framework. No Next.js (no need for server rendering; one less moving part).

### Supporting libraries `[PROPOSED]`

| Need | Library | Why |
|---|---|---|
| Server state | **TanStack Query** | Polling/refetching the queues, simple cache |
| Routing | **React Router** | A handful of views |
| API types | **openapi-typescript** (+ **openapi-fetch**) | Generates TS types from FastAPI's OpenAPI. Backend schema changes show up as compile errors |
| UI components | **shadcn/ui** (copy-in components on Tailwind) | Fast, good-looking tables, dialogs, badges. Optional |
| Icons | **lucide-react** | Standard pairing with shadcn |
| Charts | **Recharts** | Metrics panel (critical recall, cost saving, tier distribution) |
| Streaming | Browser `EventSource` | Consume the SSE tool-call trace |
| Lint/format | **ESLint** + **Prettier** | Optional; ruff-equivalent speed matters more than strictness here |

### Views `[PROPOSED]`

1. **Submit complaint** (text box; also used live by judges).
2. **Critical queue** (investigate, approve freeze).
3. **Moderate queue** (summary only; buttons: Investigate / Delegate).
4. **Unknown-category queue** (map to existing or create new category + tier).
5. **Case detail** (report, evidence, live tool-call trace, decision history).
6. **Low-tier audit** (sampled auto-sent replies).
7. **Metrics** (eval numbers and tier distribution).

Design cues: color-code the three tiers consistently (e.g. red / amber / green) and show the **tier badge and the rule that produced it** on every case, since "rules decide, AI proposes" is the story.

### Frontend dev setup

- Vite dev server proxies `/api` to FastAPI (avoids CORS in dev).
- Types: `npm run gen:api` runs `openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts`.
- Production: `npm run build` outputs static files that FastAPI serves (section 7).

---

## 4. Tool layer: fastn and MCP

### What fastn is `[DECIDED to use]`

Docs: https://docs.fastn.ai/

fastn is a hosted integration platform (connectors to many apps, workflows, triggers). Its **MCP gateway** exposes connectors, actions, and workflows as **tools** to MCP clients. Facts from the docs reviewed so far:

- Gateway URL pattern shown in docs: `https://mcp.fastn.dev/fastn-workspace` (confirm yours in the dashboard).
- Auth: OAuth sign-in for assistants, or an API key header for clients that cannot sign in: `Authorization: Bearer fsk_live_<key>`. Test keys use header `X-fastn-Test-Mode: true`.
- You can narrow which connector actions are exposed and which customers a key can reach.
- **Test keys are not a sandbox.** They hit the same live connections and cause real writes.
- Workflows are written as TypeScript (`export default async function(ctx)`) and can be started by webhook, schedule, or app-event triggers.
- Docs reviewed describe **tools**. `[OPEN]` Whether fastn serves MCP **resources**.

Useful doc pages: MCP gateway (`/build/mcp-gateway`), Workflows (`/build/workflows`), Triggers (`/build/triggers`), API keys (`/manage/api-keys`), Workflow runtime API (`/reference/workflow-runtime`). Appending `.md` to a docs URL returns Markdown, and `llms.txt` lists every page.

### What goes where `[PROPOSED]`

| Capability | Where it lives |
|---|---|
| MCP **resources**: policy documents, category registry | **Our own MCP server** (FastMCP) |
| Investigation reads: `get_transaction`, `get_sender`, `get_receiver`, `get_customer_history`, `check_merchant`, `search_policy` | **Local MCP tools** against our SQLite (fast, no network risk). Optionally move to fastn if its Postgres is quick to use |
| Outbound actions: `notify_officer` (Slack/email), `send_reply` (email), `create_ticket` (ClickUp), `log_case` (e.g. Sheets) | **fastn** tools (this is where it adds real value) |
| Money-moving: `freeze_payment`, `issue_refund` | **Local only**, act on synthetic DB, **only after a stored human approval** |
| Optional intake | A fastn **webhook trigger** could feed complaints into `POST /api/complaints` |

### Tool gateway abstraction `[PROPOSED]`

So a fastn outage or slow signup never blocks the demo, every outbound tool goes through one interface with two implementations:

```python
# app/tools/gateway.py  (full contract: ARCHITECTURE.md, "fastn integration")
class ToolGateway(Protocol):
    async def notify_officer(self, complaint_id, category, risk_tier, summary, required_action, officer_email=None) -> NotifyResult: ...
    async def create_ticket(self, complaint_id, category, summary, risk_tier, dashboard_url=None) -> TicketResult: ...
    async def send_approved_reply(self, complaint_id, reply_text, authorization_token, recipient_email=None) -> SendReplyResult: ...

class FastnGateway: ...   # POSTs {"input": ...} to {FASTN_GATEWAY_URL}/<name>/execute
class LocalGateway: ...   # mock results, always works

def get_gateway() -> AuditedGateway:   # audit + SSE + fallback to local
    ...  # FastnGateway if settings.fastn_enabled else LocalGateway
```

Every call (either implementation) writes a row to the `decisions` audit log and emits an SSE event for the tool-call trace.

### Connecting to fastn from the backend `[PROPOSED]`

Plain HTTP (httpx): `POST {FASTN_GATEWAY_URL}/<name>/execute` with body `{"input": {...}}`, `Authorization: Bearer <key>` (or `X-API-Key` when `FASTN_AUTH_METHOD=api_key_header`) and `x-fastn-env`. fastn is the outbound layer only: it never owns policy or decisions, and our MCP server is the only MCP server. Keep the key in `.env`, never in the repo. Mint a key specifically for this project with the narrowest permissions and only the connectors needed.

### Safety rules for fastn `[DECIDED concept]`

- Connect **throwaway** Slack/email/ClickUp accounts only.
- Never point fastn at anything holding real customer data.
- Money-moving actions are not exposed through fastn at all.

---

## 5. LLM layer

| Role | Model class | Used by |
|---|---|---|
| Classifier | cheap, fast, supports JSON/structured output | classify.py |
| Report generator | `[OPEN]` cheap or mid-tier (default: same as classifier) | report.py |
| Low-tier replier | cheap, low token (e.g. Gemma; verify availability) | agents/low_reply.py |
| Moderate agent | stronger, higher-intelligence, tool-calling | agents/moderate_agent.py |

- `[OPEN]` Provider and exact model names (depends on hackathon credits and access). Default: one OpenAI-compatible provider through its official Python SDK.
- Model names live in `.env`/config so tiers can be swapped in minutes.
- **Structured output:** define Pydantic models for classification, report, and agent result; request JSON matching the schema; validate; on failure, retry once, then **route to a human** (never guess).
- `[PROPOSED]` Optional helper: **instructor** for Pydantic-validated LLM output with retries, if the provider SDK's native structured output is awkward.
- Log model name, latency, and token counts per call; this feeds the cost-saving metric.

---

## 6. Data and storage

- **SQLite** file (`app.db`) via SQLModel. No migrations tool needed for a hackathon; create tables at startup and re-seed with `seed/make_synthetic_data.py`.
- Schema is in `ARCHITECTURE.md` section 8.
- Synthetic data generator `[PROPOSED]`: **Faker** for names, accounts, and transactions, plus a hand-written labeled complaint set (`seed/complaints_labeled.json`).
- Policies are plain Markdown files in `mcp_server/policies/`, served as MCP resources.

---

## 7. Dev, build, and deployment

### Repo layout (updated) `[PROPOSED]`

```
.
├── ARCHITECTURE.md
├── TECH_STACK.md
├── .env.example
├── backend/
│   ├── pyproject.toml
│   └── app/
│       ├── main.py            # FastAPI app; mounts built frontend
│       ├── config.py          # pydantic-settings
│       ├── db.py, models.py   # SQLModel
│       ├── schemas.py         # Pydantic: classification, report, decisions
│       ├── classify.py, routing.py, report.py
│       ├── approvals.py, audit.py
│       ├── agents/{low_reply.py, moderate_agent.py}
│       ├── tools/{gateway.py, fastn_gateway.py, local_gateway.py}
│       └── mcp_server/{server.py, policies/*.md}
├── backend/seed/{make_synthetic_data.py, complaints_labeled.json}
├── backend/eval/run_eval.py
└── frontend/
    ├── package.json, vite.config.ts, tsconfig.json
    └── src/{main.tsx, api/, pages/, components/}
```

### Environment variables (`.env.example`) `[PROPOSED]`

```
# LLM
LLM_BASE_URL=
LLM_API_KEY=
CLASSIFIER_MODEL=
REPORT_MODEL=
LOW_TIER_REPLY_MODEL=
AGENT_MODEL=

# fastn
FASTN_ENABLED=false
FASTN_GATEWAY_URL=https://api.fastn.ai/api/v1/workflows
FASTN_API_KEY=
FASTN_AUTH_METHOD=bearer
FASTN_ENV=live
FASTN_TIMEOUT_SECONDS=30
REPLY_AUTH_SECRET=
OFFICER_EMAIL=
DASHBOARD_URL=

# App
DATABASE_URL=sqlite:///./app.db
AGENT_MAX_STEPS=8
CONFIDENCE_THRESHOLD=0.7
```

Never commit `.env`. Commit `.env.example` only.

### Commands `[PROPOSED]`

```bash
# backend
cd backend && uv sync
uv run python seed/make_synthetic_data.py
uv run uvicorn app.main:app --reload --port 8000

# frontend
cd frontend && npm install
npm run dev            # Vite dev server, proxies /api to :8000
npm run gen:api        # regenerate TS types from FastAPI OpenAPI

# eval
cd backend && uv run python eval/run_eval.py
```

### Single-service deployment `[PROPOSED]`

- `npm run build` produces `frontend/dist`.
- FastAPI mounts `frontend/dist` as static files and serves `index.html` for non-API routes.
- One **Dockerfile** (multi-stage: Node builds the frontend, Python image runs Uvicorn). One container, one port.
- `[OPEN]` The hackathon notes mention a required cloud ("Alternate Clouds"). Confirm hosting requirements and limits early.
- Keep a **local-only demo mode** (`FASTN_ENABLED=false`) as the fallback if the network or an external service fails on stage.

---

## 8. Team workflow with coding agents

1. Read `ARCHITECTURE.md` and `TECH_STACK.md` before coding.
2. **Contract first:** agree on Pydantic schemas (`schemas.py`) and the API list above, then split work: backend (classify/route/agents/MCP) and frontend (dashboard views) can proceed in parallel using generated types.
3. Backend owner keeps `openapi.json` accurate; frontend owner regenerates types after each backend change.
4. Commit small and often; one branch per feature; merge to `main` only when the app still starts.
5. Do not add dependencies outside this list without telling the team. Prefer what is already here.

---

## 9. Open items affecting the stack

| # | Question | Default |
|---|---|---|
| 1 | LLM provider and models available (is Gemma offered?) | One OpenAI-compatible provider, names in `.env` |
| 2 | Can fastn serve MCP resources? | No; our own MCP server serves resources |
| 3 | fastn account created and API key minted? Signup may include a validation step | `FASTN_ENABLED=false` until ready |
| 4 | Deployment target and constraints | Single Docker container |
| 5 | Is MCP usage mandatory or a bonus for judging? | Show tool-call trace in the UI either way |
| 6 | Frontend: React + Vite acceptable, or a different TS framework preferred? | React + Vite |
