# Ombot Frontend Prototype - Bank Complaint Triage Platform

A clean, high-performance frontend prototype for an AI-assisted bank complaint-triage tool used by human bank staff.

---

## ⚡ Tech Stack

- **Framework**: React 19 + Vite + TypeScript (strict)
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM (`v7`)
- **Data Fetching & State**: TanStack React Query (`v5`)
- **Icons**: Lucide React
- **API Mock Layer**: In-memory simulated store + SSE streaming emulation, toggled with `VITE_USE_MOCK=true`

---

## 🚀 Getting Started

### 1. Installation

Ensure you have Node.js (v18+) installed.

```bash
npm install
```

### 2. Environment Configuration

By default, the application runs fully stand-alone using the realistic in-memory mock data layer (`src/api/mock.ts`).

The project includes `.env`:
```ini
# Set to 'true' to run fully stand-alone in browser
# Set to 'false' to connect to FastAPI backend at http://localhost:8000
VITE_USE_MOCK=true
```

### 3. Run Development Server

```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

### 4. Build for Production

```bash
npm run build
npm run preview
```

---

## 🏛 Product Context & Triage Architecture

Customer complaints are classified into 10 declared categories with fixed risk tiers:
- **Critical Risk (Red)**: (e.g. *Unauthorized Transaction*, *Account Takeover*, *Lost/Stolen Device*)
  - Human staff must investigate manually.
  - The AI prepares an evidence report, likely root causes, and policy references.
- **Moderate Risk (Amber)**: (e.g. *Wrong Recipient Transfer*, *Failed Payment Money Deducted*, *Delayed Transfer*)
  - Staff reviews the executive summary.
  - Staff chooses either **"Investigate myself"** or **"Delegate to AI agent"**.
- **Low Risk (Green)**: (e.g. *App/Login Glitch*, *ATM/FX Fee Question*, *Dark Mode/Feedback*)
  - Cheap AI replies automatically.
  - Human staff audit random samples in the **Low-Tier Audit Queue**.
- **Unknown Category Queue (Purple)**:
  - Catches unclassified complaints with confidence below threshold.
  - Staff can either map to an existing category or create a new category with a risk tier.
  - Creates a **Continuous Learning Loop** that updates the taxonomy.
- **Money-Moving Guardrails**:
  - Actions involving fund custody or holds (`freeze_payment`, `issue_refund`) require explicit human authorization via a high-visibility confirmation dialog.
- **Audit & Governance Log**:
  - Every action (human decision, automated AI response, model signature, tool step) is recorded in an immutable audit trail.

---

## 🧭 Routes & Screen Overview

| Route | Screen | Description |
|---|---|---|
| `/submit` | **Submit Complaint** | Live intake form with quick judge presets. Instant classification card showing confidence score, quote, tier badge, and queue routing. |
| `/critical` | **Critical Queue** | Sortable/filterable table of high-risk cases. Row click navigates to Case Detail. |
| `/moderate` | **Moderate Queue** | Card list showing **only** report summary, tier badge, category, and 2 action buttons: "Investigate myself" & "Delegate to AI agent". |
| `/unknown` | **Unknown Category Queue** | Unmatched complaints with dropdown category mapping and "Create new category" modal with continuous learning notes. |
| `/cases/:id` | **Case Detail** | Two-column split view: Original complaint, matched categories, AI report (left), Live SSE Tool-Call Trace timeline, editable draft reply, proposed action, and confirmation modal for money-moving operations (right), plus bottom decision audit trail. |
| `/low-audit` | **Low-Tier Audit** | QA table of sampled auto-sent replies with side-by-side complaint/reply view and "Looks fine" / "Wrong, escalate" buttons. |
| `/audit` | **Audit Log** | Filterable governance log (actor: All/Human/AI, search) with expandable rows revealing evidence and model payloads. |
| `/metrics` | **Metrics & Eval** | 5 core stat cards (Critical Recall, Category Accuracy, Unknown Rate, Cost Saving %, Over-Escalation Rate), stacked bar tier caseload chart, and a live "Run Test Set" evaluation runner. |
| `/categories` | **Category Registry** | Read-only directory of the 10 baseline seed categories plus `human_added` tags for categories registered through the learning loop. |

---

## 📁 Project Directory Structure

```
src/
├── api/
│   ├── types.ts              # Strict TypeScript definitions (Tier, Case, Category, Decision, Metrics)
│   ├── mock.ts               # 14+ realistic banking cases, categories, decisions, and simulated store
│   ├── client.ts             # API client with VITE_USE_MOCK fallback switch
│   └── stream.ts             # SSE stream handler + realistic timer simulator for live tool traces
├── components/
│   ├── common/
│   │   ├── TierBadge.tsx     # Color-coded badges for Critical, Moderate, Low, Unknown
│   │   ├── StatusPill.tsx    # Badges for New, Awaiting Human, Delegated, Agent Running, Resolved, etc.
│   │   ├── ConfirmDialog.tsx # High-risk confirmation modal for freeze_payment / issue_refund
│   │   ├── EmptyState.tsx    # Clean state graphics
│   │   └── LoadingSkeleton.tsx # Loading placeholders
│   ├── case/
│   │   ├── CaseTable.tsx     # Reusable queue table with filters & search
│   │   ├── ReportView.tsx    # AI executive summary, causes, policy refs, evidence table, next step
│   │   └── ToolTraceTimeline.tsx # Numbered tool trace with arguments/results JSON and SSE pulse
│   ├── category/
│   │   └── CreateCategoryModal.tsx # Dialog to register learned categories with tier selection
│   └── layout/
│       └── AppShell.tsx      # Sidebar with live badge counts, Reviewer indicator, and Mock status
├── pages/
│   ├── SubmitComplaint.tsx   # /submit
│   ├── CriticalQueue.tsx     # /critical
│   ├── ModerateQueue.tsx     # /moderate
│   ├── UnknownQueue.tsx      # /unknown
│   ├── CaseDetail.tsx        # /cases/:id
│   ├── LowTierAudit.tsx      # /low-audit
│   ├── AuditLog.tsx          # /audit
│   ├── MetricsPage.tsx       # /metrics
│   └── CategoriesPage.tsx    # /categories
├── App.tsx                   # Central router definition
├── main.tsx                  # React DOM entrypoint with TanStack Query provider
└── index.css                 # Tailwind CSS styling
```
