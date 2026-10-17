export type Tier = 'critical' | 'moderate' | 'low'

export type CaseStatus =
  | 'processing' // stored, the backend is still classifying it and writing the report
  | 'new'
  | 'awaiting_human'
  | 'delegated'
  | 'agent_running'
  | 'awaiting_approval'
  | 'resolved'
  | 'auto_replied'

// Where a case stands for the team: nobody has acted, someone is working it, or it is closed
export type Workflow = 'unchecked' | 'investigating' | 'solved'

export interface Category {
  id: string
  name: string
  tier: Tier
  description: string
  source: 'seed' | 'human_added'
}

export interface MatchedCategory {
  categoryId: string
  categoryName?: string
  confidence: number
  supportingQuote: string
}

export interface ReportEvidence {
  label: string
  value: string
}

export interface CaseReport {
  summary: string
  likelyCauses: string[]
  policyRefs: string[]
  evidence: ReportEvidence[]
  recommendedNextStep: string
}

export interface ToolTraceStep {
  step: number
  tool: string
  args: Record<string, unknown> | string
  result: Record<string, unknown> | string
  timestamp: string
  // Set when a human reviewed this call in a supervised run
  review?: 'approve' | 'reject' | 'edited'
}

// How much a supervised agent run pauses: every tool call, only the ones that write, or never
export type ReviewMode = 'all' | 'risky' | 'auto'

export interface AgentProposal {
  call_no: number
  tool: string
  args: Record<string, unknown>
}

export interface AgentReviewState {
  mode: ReviewMode | null // null: no supervised run is active
  pending: AgentProposal | null
}

export interface AgentReviewPayload {
  verdict?: 'approve' | 'reject' | 'abort'
  callNo?: number
  note?: string
  args?: Record<string, unknown>
  mode?: ReviewMode
}

export interface ProposedAction {
  type: 'freeze_payment' | 'issue_refund' | 'reply_only'
  details: string | Record<string, unknown>
  requiresApproval: boolean
  approvalId?: number
}

export interface Case {
  id: string
  complaintText: string
  customerId: string
  receivedAt: string
  tier: Tier
  status: CaseStatus
  workflow?: Workflow
  categories: MatchedCategory[]
  unknownCategory: boolean
  report: CaseReport
  toolTrace: ToolTraceStep[]
  proposedAction?: ProposedAction
  draftReply?: string
  assignedTo?: string
  lastUpdated?: string
}

export interface Decision {
  id: string
  caseId: string
  actor: 'human' | 'ai'
  action: string
  payload?: Record<string, unknown> | string
  evidence?: string | Record<string, unknown>
  model?: string
  createdAt: string
}

export interface Metrics {
  criticalRecall: number
  categoryAccuracy: number
  unknownRoutingRate: number
  costSavingPct: number
  overEscalationRate: number
  tierCounts: {
    critical: number
    moderate: number
    low: number
    unknown?: number
  }
}

export interface SubmitComplaintPayload {
  customerId: string
  complaintText: string
}

export interface SubmitComplaintResponse {
  case: Case
  matchedCategories: MatchedCategory[]
  tier: Tier
  queue: string
  unknownCategory: boolean
}

export interface CaseDecisionPayload {
  action: 'approve' | 'reject' | 'investigate' | 'delegate' | 'map_category' | 'create_category'
  payload?: Record<string, unknown> | string
}

export interface LowTierAuditItem {
  id: string
  caseId: string
  customerId: string
  complaintText: string
  sentReply: string
  sentAt: string
  category: string
  auditStatus: 'pending' | 'verified_fine' | 'escalated'
  auditedBy?: string
  auditedAt?: string
}
