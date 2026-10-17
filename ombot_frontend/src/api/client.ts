import type {
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

export const isMockMode = import.meta.env.VITE_USE_MOCK !== 'false'

export const api = {
  // Submit Complaint
  submitComplaint: async (payload: SubmitComplaintPayload): Promise<SubmitComplaintResponse> => {
    if (isMockMode) {
      // Simulate light network delay
      await new Promise((r) => setTimeout(r, 450))
      return mockApi.submitComplaint(payload)
    }

    const res = await fetch('/api/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Failed to submit complaint: ${res.statusText}`)
    return res.json()
  },

  // Get Cases for Queues
  getCases: async (tier?: Tier | 'unknown', status?: string): Promise<Case[]> => {
    if (isMockMode) {
      await new Promise((r) => setTimeout(r, 200))
      return mockApi.getCases(tier, status)
    }

    const params = new URLSearchParams()
    if (tier) params.append('tier', tier)
    if (status) params.append('status', status)

    const res = await fetch(`/api/cases?${params.toString()}`)
    if (!res.ok) throw new Error(`Failed to fetch cases: ${res.statusText}`)
    return res.json()
  },

  // Get Case Details
  getCaseById: async (id: string): Promise<Case> => {
    if (isMockMode) {
      await new Promise((r) => setTimeout(r, 200))
      const found = await mockApi.getCaseById(id)
      if (!found) throw new Error(`Case ${id} not found`)
      return found
    }

    const res = await fetch(`/api/cases/${id}`)
    if (!res.ok) throw new Error(`Failed to fetch case ${id}: ${res.statusText}`)
    return res.json()
  },

  // Record Decision
  recordDecision: async (id: string, payload: CaseDecisionPayload): Promise<Case> => {
    if (isMockMode) {
      await new Promise((r) => setTimeout(r, 350))
      return mockApi.recordDecision(id, payload.action, payload.payload)
    }

    const res = await fetch(`/api/cases/${id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Failed to record decision: ${res.statusText}`)
    return res.json()
  },

  // Update Draft Reply
  updateDraftReply: async (id: string, reply: string): Promise<Case> => {
    if (isMockMode) {
      return mockApi.updateDraftReply(id, reply)
    }

    const res = await fetch(`/api/cases/${id}/draft-reply`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftReply: reply }),
    })
    if (!res.ok) throw new Error(`Failed to update draft reply: ${res.statusText}`)
    return res.json()
  },

  // Categories
  getCategories: async (): Promise<Category[]> => {
    if (isMockMode) {
      return mockApi.getCategories()
    }
    const res = await fetch('/api/categories')
    if (!res.ok) throw new Error(`Failed to fetch categories: ${res.statusText}`)
    return res.json()
  },

  createCategory: async (category: Omit<Category, 'source'>): Promise<Category> => {
    if (isMockMode) {
      return mockApi.createCategory(category)
    }
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(category),
    })
    if (!res.ok) throw new Error(`Failed to create category: ${res.statusText}`)
    return res.json()
  },

  // Audit Logs
  getAuditLogs: async (actor?: 'human' | 'ai', query?: string): Promise<Decision[]> => {
    if (isMockMode) {
      return mockApi.getAuditLogs(actor, query)
    }
    const params = new URLSearchParams()
    if (actor) params.append('actor', actor)
    if (query) params.append('query', query)

    const res = await fetch(`/api/audit?${params.toString()}`)
    if (!res.ok) throw new Error(`Failed to fetch audit logs: ${res.statusText}`)
    return res.json()
  },

  // Low Tier Audit Samples
  getLowTierAuditSamples: async (): Promise<LowTierAuditItem[]> => {
    if (isMockMode) {
      return mockApi.getLowTierAuditSamples()
    }
    const res = await fetch('/api/low-tier/audit-sample')
    if (!res.ok) throw new Error(`Failed to fetch low tier audit samples: ${res.statusText}`)
    return res.json()
  },

  reviewLowTierSample: async (
    sampleId: string,
    action: 'looks_fine' | 'escalate'
  ): Promise<LowTierAuditItem> => {
    if (isMockMode) {
      return mockApi.reviewLowTierSample(sampleId, action)
    }
    const res = await fetch(`/api/low-tier/audit-sample/${sampleId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (!res.ok) throw new Error(`Failed to review sample: ${res.statusText}`)
    return res.json()
  },

  // Metrics
  getMetrics: async (): Promise<Metrics> => {
    if (isMockMode) {
      return mockApi.getMetrics()
    }
    const res = await fetch('/api/metrics')
    if (!res.ok) throw new Error(`Failed to fetch metrics: ${res.statusText}`)
    return res.json()
  },

  runEvaluation: async (): Promise<Metrics> => {
    if (isMockMode) {
      return mockApi.runEvaluation()
    }
    const res = await fetch('/api/eval/run', { method: 'POST' })
    if (!res.ok) throw new Error(`Failed to run evaluation: ${res.statusText}`)
    return res.json()
  },
}
