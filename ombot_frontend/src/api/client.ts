import type {
  AgentReviewPayload,
  AgentReviewState,
  Case,
  CaseDecisionPayload,
  Category,
  Decision,
  LowTierAuditItem,
  Metrics,
  SubmitComplaintPayload,
  SubmitComplaintResponse,
  Tier,
} from './types'
import { mockApi } from './mock'
import {
  queueFor,
  toAuditItem,
  toCase,
  toCategory,
  toDecision,
  toMetrics,
  type BackendAuditSample,
  type BackendCase,
  type BackendCategory,
  type BackendDecision,
  type BackendMetrics,
} from './adapters'

export const isMockMode = import.meta.env.VITE_USE_MOCK === 'true'

// fetch + JSON with the backend's error detail surfaced in the message
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body)
    } catch {
      // non-JSON error body: keep statusText
    }
    throw new Error(`${res.status}: ${detail}`)
  }
  return res.json()
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

// POST /complaints returns at once; classification and the report finish in the background
async function waitUntilProcessed(c: BackendCase, timeoutMs = 90_000): Promise<BackendCase> {
  const deadline = Date.now() + timeoutMs
  while (c.status === 'processing' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000))
    c = await request<BackendCase>(`/cases/${c.id}`)
  }
  return c
}

// Category names for case display; refreshed after a category is created
let categoryNames: Promise<Map<string, string>> | null = null
function getCategoryNames(): Promise<Map<string, string>> {
  categoryNames ??= request<BackendCategory[]>('/categories')
    .then((cats) => new Map(cats.map((c) => [c.id, c.name])))
    .catch((err) => {
      categoryNames = null
      throw err
    })
  return categoryNames
}

async function adaptCase(c: BackendCase): Promise<Case> {
  return toCase(c, await getCategoryNames())
}

// Translate a UI decision into the backend's action vocabulary
async function sendDecision(id: string, { action, payload }: CaseDecisionPayload): Promise<BackendCase> {
  const data = (typeof payload === 'object' && payload) || {}

  if (action === 'approve' || action === 'reject') {
    const current = await request<BackendCase>(`/cases/${id}`)
    const pending = current.pending_approvals[0]
    if (current.status === 'awaiting_approval' && pending) {
      return post(`/cases/${id}/decision`, { action, payload: { approval_id: pending.approval_id } })
    }
    if (action === 'reject') {
      throw new Error('Nothing to reject: this case has no pending money-moving request')
    }
    // No money movement pending: approving sends the reply and closes the case
    const reply = String(data.draftReply ?? data.finalReply ?? current.draft_reply ?? '')
    return post(`/cases/${id}/decision`, { action: 'resolve', payload: { reply } })
  }

  if (action === 'map_category') {
    return post(`/cases/${id}/decision`, { action, payload: { category_id: data.categoryId } })
  }

  if (action === 'create_category') {
    const category = data.category as Omit<Category, 'source'>
    await post(`/categories?case_id=${id}`, category)
    categoryNames = null
    return post(`/cases/${id}/decision`, { action: 'map_category', payload: { category_id: category.id } })
  }

  return post(`/cases/${id}/decision`, { action, payload: data })
}

export const api = {
  // Submit Complaint
  submitComplaint: async (payload: SubmitComplaintPayload): Promise<SubmitComplaintResponse> => {
    if (isMockMode) {
      // Simulate light network delay
      await new Promise((r) => setTimeout(r, 450))
      return mockApi.submitComplaint(payload)
    }

    const created = await adaptCase(
      await waitUntilProcessed(
        await post<BackendCase>('/complaints', {
          text: payload.complaintText,
          customer_id: payload.customerId.trim() || null,
        })
      )
    )
    return {
      case: created,
      matchedCategories: created.categories,
      tier: created.tier,
      queue: queueFor(created),
      unknownCategory: created.unknownCategory,
    }
  },

  // Get Cases for Queues
  getCases: async (tier?: Tier | 'unknown', status?: string): Promise<Case[]> => {
    if (isMockMode) {
      await new Promise((r) => setTimeout(r, 200))
      return mockApi.getCases(tier, status)
    }

    const params = new URLSearchParams({ limit: '200' })
    if (tier) params.append('tier', tier)
    if (status) params.append('status', status)
    const cases = await request<BackendCase[]>(`/cases?${params.toString()}`)
    const names = await getCategoryNames()
    return cases.map((c) => toCase(c, names))
  },

  // Get Case Details
  getCaseById: async (id: string): Promise<Case> => {
    if (isMockMode) {
      await new Promise((r) => setTimeout(r, 200))
      const found = await mockApi.getCaseById(id)
      if (!found) throw new Error(`Case ${id} not found`)
      return found
    }

    return adaptCase(await request<BackendCase>(`/cases/${id}`))
  },

  // Record Decision
  recordDecision: async (id: string, payload: CaseDecisionPayload): Promise<Case> => {
    if (isMockMode) {
      await new Promise((r) => setTimeout(r, 350))
      return mockApi.recordDecision(id, payload.action, payload.payload)
    }

    return adaptCase(await sendDecision(id, payload))
  },

  // Supervised agent run: what the agent is waiting on, and the reviewer's answer
  getAgentReview: async (id: string): Promise<AgentReviewState> => {
    if (isMockMode) return { mode: null, pending: null }
    return request<AgentReviewState>(`/cases/${id}/agent/review`)
  },

  reviewAgentStep: async (id: string, { callNo, ...rest }: AgentReviewPayload): Promise<AgentReviewState> => {
    if (isMockMode) throw new Error('Supervised review needs the real backend (VITE_USE_MOCK is on)')
    return post<AgentReviewState>(`/cases/${id}/agent/review`, { call_no: callNo, ...rest })
  },

  // Update Draft Reply
  updateDraftReply: async (id: string, reply: string): Promise<Case> => {
    if (isMockMode) {
      return mockApi.updateDraftReply(id, reply)
    }

    return adaptCase(
      await request<BackendCase>(`/cases/${id}/draft-reply`, {
        method: 'PATCH',
        body: JSON.stringify({ text: reply }),
      })
    )
  },

  // Categories
  getCategories: async (): Promise<Category[]> => {
    if (isMockMode) {
      return mockApi.getCategories()
    }
    return (await request<BackendCategory[]>('/categories')).map(toCategory)
  },

  createCategory: async (category: Omit<Category, 'source'>): Promise<Category> => {
    if (isMockMode) {
      return mockApi.createCategory(category)
    }
    const created = await post<BackendCategory>('/categories', category)
    categoryNames = null
    return toCategory(created)
  },

  // Audit Logs
  getAuditLogs: async (actor?: 'human' | 'ai', query?: string): Promise<Decision[]> => {
    if (isMockMode) {
      return mockApi.getAuditLogs(actor, query)
    }
    const rows = (await request<BackendDecision[]>('/audit?limit=500')).map(toDecision)
    const q = query?.toLowerCase()
    return rows.filter(
      (d) =>
        (!actor || d.actor === actor) &&
        (!q || d.action.includes(q) || d.caseId === q || JSON.stringify(d.payload).toLowerCase().includes(q))
    )
  },

  // Low Tier Audit Samples
  getLowTierAuditSamples: async (): Promise<LowTierAuditItem[]> => {
    if (isMockMode) {
      return mockApi.getLowTierAuditSamples()
    }
    return (await request<BackendAuditSample[]>('/low-tier/audit-sample?n=100')).map(toAuditItem)
  },

  reviewLowTierSample: async (
    sampleId: string,
    action: 'looks_fine' | 'escalate'
  ): Promise<LowTierAuditItem> => {
    if (isMockMode) {
      return mockApi.reviewLowTierSample(sampleId, action)
    }
    return toAuditItem(await post<BackendAuditSample>(`/low-tier/audit-sample/${sampleId}/review`, { action }))
  },

  // Metrics
  getMetrics: async (): Promise<Metrics> => {
    if (isMockMode) {
      return mockApi.getMetrics()
    }
    return toMetrics(await request<BackendMetrics>('/metrics'))
  },

  runEvaluation: async (): Promise<Metrics> => {
    if (isMockMode) {
      return mockApi.runEvaluation()
    }
    // The run stores its results; /metrics then reports them
    await post('/eval/run')
    return toMetrics(await request<BackendMetrics>('/metrics'))
  },
}
