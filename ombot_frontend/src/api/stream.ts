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
    // Real SSE connection to backend. It replays the case's history first, so tool calls are
    // numbered in the same order as the trace built from the audit log and dedupe by step.
    const eventSource = new EventSource(`/api/cases/${caseId}/stream`)
    let step = 0

    eventSource.addEventListener('tool_call', (event) => {
      try {
        const { name, args, result, review, ...rest } = JSON.parse((event as MessageEvent).data)
        step += 1
        onStep({
          step,
          tool: String(name),
          args: args ?? rest,
          result: result ?? {},
          timestamp: new Date().toISOString(),
          ...(review ? { review } : {}),
        })
      } catch (err) {
        console.error('Failed to parse SSE payload', err)
      }
    })

    const finish = () => {
      eventSource.close()
      onComplete?.()
    }
    eventSource.addEventListener('agent_done', finish)
    eventSource.addEventListener('error', (event) => {
      // Named "error" events from the agent carry data; connection errors do not
      if ((event as MessageEvent).data) console.warn('Agent failed', (event as MessageEvent).data)
      finish()
    })

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
