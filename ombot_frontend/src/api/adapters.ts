// Maps FastAPI response shapes (snake_case, numeric ids) to the frontend types in ./types.
import type {
  Case,
  CaseReport,
  CaseStatus,
  Category,
  Decision,
  LowTierAuditItem,
  MatchedCategory,
  Metrics,
  ProposedAction,
  ReportEvidence,
  Tier,
  ToolTraceStep,
  Workflow,
} from './types'

type Json = Record<string, unknown>

export interface BackendPendingApproval {
  approval_id: number
  action: string
  params: Json
  reason?: string | null
}

export interface BackendDecision {
  id: number
  case_id: number
  actor: string
  action: string
  payload: Json
  evidence: Json
  model: string | null
  created_at: string
}

export interface BackendCase {
  id: number
  complaint_id: number
  complaint_text: string
  customer_id: string | null
  categories: string[]
  confidence: Record<string, number>
  quotes: Record<string, string>
  tier: string | null
  status: string
  workflow: Workflow
  report: Json
  assigned_layer: number | null
  created_at: string
  draft_reply: string | null
  pending_approvals: BackendPendingApproval[]
  decisions?: BackendDecision[]
}

export interface BackendCategory {
  id: string
  name: string
  tier: Tier
  description: string
  source: string
}

export interface BackendAuditSample {
  case_id: number
  complaint_text: string
  reply: string
  created_at: string
  customer_id: string | null
  category: string | null
  review_status: LowTierAuditItem['auditStatus']
  reviewed_at: string | null
}

export interface BackendMetrics {
  by_tier: Record<string, number>
  critical_recall: number | null
  category_accuracy: number | null
  cost_saving_pct: number | null
  over_escalation_rate: number | null
  unknown_routing_rate: number | null
  last_eval: Record<string, number | null> | null
}

// The backend stores UTC timestamps without an offset; tell Date they are UTC.
export const utc = (ts: string) => (/[zZ]|[+-]\d\d:\d\d$/.test(ts) ? ts : `${ts}Z`)

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])

function formatEvidenceValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return `${v.length} record${v.length === 1 ? '' : 's'}`
  if (typeof v === 'object') {
    const flat = Object.entries(v as Json)
      .filter(([, x]) => x !== null && x !== '' && typeof x !== 'object')
      .map(([k, x]) => `${k}: ${x}`)
    return flat.length ? flat.join(', ') : JSON.stringify(v)
  }
  return String(v)
}

function toReport(r: Json): CaseReport {
  const evidence: ReportEvidence[] = Object.entries((r.evidence as Json) || {}).map(([k, v]) => ({
    label: k.replace(/_/g, ' '),
    value: formatEvidenceValue(v),
  }))
  const resolution = (r.agent_resolution as Json | undefined)?.resolution
  return {
    summary: String(r.summary ?? (r.error ? 'Report generation failed; manual review needed.' : 'No report yet.')),
    likelyCauses: asStrings(r.likely_causes),
    policyRefs: asStrings(r.policy_references),
    evidence,
    recommendedNextStep: String(resolution ?? r.recommended_next_step ?? ''),
  }
}

function toProposedAction(p: BackendPendingApproval | undefined): ProposedAction | undefined {
  if (!p) return undefined
  const type = p.action === 'freeze_payment' || p.action === 'issue_refund' ? p.action : 'reply_only'
  return {
    type,
    details: { ...p.params, ...(p.reason ? { reason: p.reason } : {}) },
    requiresApproval: true,
    approvalId: p.approval_id,
  }
}

// Agent tool calls plus gateway deliveries (notify, ticket, reply), in the order they ran.
export function toToolTrace(decisions: BackendDecision[]): ToolTraceStep[] {
  // Supervised runs: the reviewer's verdict per call number (the n-th tool call of the case)
  const verdicts = new Map<number, string>()
  const edited = new Set<number>()
  for (const d of decisions) {
    if (d.action !== 'step_review') continue
    verdicts.set(Number(d.payload.call_no), String(d.payload.verdict))
    if (d.payload.edited_args) edited.add(Number(d.payload.call_no))
  }
  let calls = 0
  return decisions
    .filter((d) => d.action === 'tool_call' || d.evidence?.gateway)
    .map((d, i) => {
      const isCall = d.action === 'tool_call'
      if (isCall) calls += 1
      const verdict = isCall ? verdicts.get(calls) : undefined
      const review = verdict === 'reject' ? 'reject' : verdict === 'approve' ? (edited.has(calls) ? 'edited' : 'approve') : undefined
      return {
        step: i + 1,
        tool: isCall ? String(d.payload.name) : d.action,
        args: (isCall ? (d.payload.args as Json) : d.payload) ?? {},
        result: (d.evidence?.result as Json) ?? {},
        timestamp: utc(d.created_at),
        ...(review ? { review } : {}),
      }
    })
}

export function toCase(c: BackendCase, categoryNames: Map<string, string>): Case {
  const unknown = c.tier === 'unknown' || c.tier === null
  const categories: MatchedCategory[] = c.categories.map((id) => ({
    categoryId: id,
    categoryName: categoryNames.get(id),
    confidence: c.confidence[id] ?? 0,
    supportingQuote: c.quotes[id] ?? '',
  }))
  return {
    id: String(c.id),
    complaintText: c.complaint_text,
    customerId: c.customer_id ?? '—',
    receivedAt: utc(c.created_at),
    // Unknown cases go to a human, so they are shown with the moderate colour and an "unknown" badge
    tier: unknown ? 'moderate' : (c.tier as Tier),
    status: c.status as CaseStatus,
    workflow: c.workflow,
    categories,
    unknownCategory: unknown,
    report: toReport(c.report || {}),
    toolTrace: c.decisions ? toToolTrace(c.decisions) : [],
    proposedAction: toProposedAction(c.pending_approvals[0]),
    draftReply: c.draft_reply ?? undefined,
    lastUpdated: utc(c.created_at),
  }
}

export const toCategory = (c: BackendCategory): Category => ({
  id: c.id,
  name: c.name,
  tier: c.tier,
  description: c.description,
  source: c.source === 'human_added' ? 'human_added' : 'seed',
})

export const toDecision = (d: BackendDecision): Decision => ({
  id: String(d.id),
  caseId: String(d.case_id),
  actor: d.actor === 'human' ? 'human' : 'ai',
  action: d.action,
  payload: d.payload,
  evidence: d.evidence,
  model: d.model ?? undefined,
  createdAt: utc(d.created_at),
})

export const toAuditItem = (s: BackendAuditSample): LowTierAuditItem => ({
  id: String(s.case_id),
  caseId: String(s.case_id),
  customerId: s.customer_id ?? '—',
  complaintText: s.complaint_text,
  sentReply: s.reply,
  sentAt: utc(s.created_at),
  category: s.category ?? 'uncategorized',
  auditStatus: s.review_status,
  auditedBy: s.reviewed_at ? 'human' : undefined,
  auditedAt: s.reviewed_at ? utc(s.reviewed_at) : undefined,
})

// Backend ratios are 0..1 (cost saving is already a percent); the UI shows percents.
// Sealed-test results from the last eval run take precedence over live-case numbers.
export function toMetrics(m: BackendMetrics): Metrics {
  const pick = (key: keyof BackendMetrics & string) => {
    const evalValue = m.last_eval?.[key]
    return evalValue ?? (m[key] as number | null)
  }
  const pct = (v: number | null) => (v === null ? 0 : v * 100)
  return {
    criticalRecall: pct(pick('critical_recall')),
    categoryAccuracy: pct(pick('category_accuracy')),
    unknownRoutingRate: pct(pick('unknown_routing_rate')),
    costSavingPct: pick('cost_saving_pct') ?? 0,
    overEscalationRate: pct(pick('over_escalation_rate')),
    tierCounts: {
      critical: m.by_tier.critical ?? 0,
      moderate: m.by_tier.moderate ?? 0,
      low: m.by_tier.low ?? 0,
      unknown: (m.by_tier.unknown ?? 0) + (m.by_tier.unclassified ?? 0),
    },
  }
}

export function queueFor(c: Case): string {
  if (c.status === 'processing') return 'Still processing: it will appear in its queue shortly'
  if (c.unknownCategory) return 'Unknown / Learning Queue'
  if (c.tier === 'critical') return 'Critical Queue (Layer 1 human)'
  if (c.tier === 'moderate') return 'Moderate Queue (Layer 2)'
  return 'Low Tier (auto-reply, sampled audit)'
}
