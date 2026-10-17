import type { ToolTraceStep } from './types'
import { isMockMode } from './client'

export type StreamCallback = (step: ToolTraceStep) => void

const SIMULATED_AGENT_STEPS: Omit<ToolTraceStep, 'timestamp'>[] = [
  {
    step: 1,
    tool: 'extract_claim_entities',
    args: { targetFields: ['amount', 'merchant', 'transactionId', 'timestamps'] },
    result: { status: 'extracted', verifiedEntities: 4, confidenceScore: 0.98 },
  },
  {
    step: 2,
    tool: 'query_core_banking_ledger',
    args: { lookbackWindow: '72h', includeHolds: true },
    result: { matchingDebitFound: true, settlementState: 'HELD_PENDING', cardToken: 'Virtual-PAN-9182' },
  },
  {
    step: 3,
    tool: 'evaluate_regulatory_framework',
    args: { jurisdiction: 'UK_FCA', categoryMatch: 'EFT_Dispute_Code_14' },
    result: { mandatoryFreezeRequired: false, provisionalCreditEligible: true },
  },
  {
    step: 4,
    tool: 'synthesize_case_report',
    args: { evidenceCount: 3, recommendedAction: 'issue_refund' },
    result: { resolutionDrafted: true, requiresStaffSignoff: true },
  },
]

export function subscribeToCaseStream(
  caseId: string,
  onStep: StreamCallback,
  onComplete?: () => void
): () => void {
  if (!isMockMode) {
    // Real SSE connection to backend
    const eventSource = new EventSource(`/api/cases/${caseId}/stream`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ToolTraceStep
        onStep(data)
      } catch (err) {
        console.error('Failed to parse SSE payload', err)
      }
    }

    eventSource.addEventListener('done', () => {
      eventSource.close()
      onComplete?.()
    })

    eventSource.onerror = (err) => {
      console.warn('SSE stream closed or encountered error', err)
      eventSource.close()
      onComplete?.()
    }

    return () => {
      eventSource.close()
    }
  }

  // MOCK SSE: simulate step-by-step emission with realistic timer intervals
  let isCancelled = false
  let currentStepIndex = 0

  const intervalId = setInterval(() => {
    if (isCancelled) {
      clearInterval(intervalId)
      return
    }

    if (currentStepIndex < SIMULATED_AGENT_STEPS.length) {
      const stepTemplate = SIMULATED_AGENT_STEPS[currentStepIndex]
      const step: ToolTraceStep = {
        ...stepTemplate,
        step: currentStepIndex + 1,
        timestamp: new Date().toISOString(),
      }
      onStep(step)
      currentStepIndex++
    } else {
      clearInterval(intervalId)
      onComplete?.()
    }
  }, 1400)

  return () => {
    isCancelled = true
    clearInterval(intervalId)
  }
}
