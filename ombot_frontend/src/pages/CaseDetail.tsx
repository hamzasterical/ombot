import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { subscribeToCaseStream } from '../api/stream'
import type { Decision, ToolTraceStep } from '../api/types'
import { TierBadge } from '../components/common/TierBadge'
import { StatusPill } from '../components/common/StatusPill'
import { ReportView } from '../components/case/ReportView'
import { ToolTraceTimeline } from '../components/case/ToolTraceTimeline'
import { SupervisedReview } from '../components/case/SupervisedReview'
import { CaseTabs, type CaseTab } from '../components/case/CaseTabs'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'
import { WorkflowBadge, workflowOf } from '../components/common/WorkflowBadge'
// Using Material Symbols (loaded via index.html) for icons in this page

export const CaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  // State
  const [draftReplyText, setDraftReplyText] = useState('')
  const [isEditingReply, setIsEditingReply] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | null>(null)
  const [liveTrace, setLiveTrace] = useState<ToolTraceStep[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  // Fetch Case Data
  const {
    data: caseData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['case', id],
    queryFn: () => api.getCaseById(id || ''),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 2000 : false),
  })

  // Fetch Decisions for bottom audit history
  const { data: allDecisions = [] } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.getAuditLogs(),
    refetchInterval: 5000,
  })

  const caseDecisions = allDecisions.filter((d: Decision) => d.caseId === id)

  // Sync draft reply and trace when data arrives
  useEffect(() => {
    if (caseData) {
      if (caseData.draftReply && !draftReplyText) {
        setDraftReplyText(caseData.draftReply)
      }
      if (liveTrace.length === 0 && caseData.toolTrace) {
        setLiveTrace(caseData.toolTrace)
      }
    }
  }, [caseData])

  // While the moderate agent works, follow its tool calls live and reload the case when it ends
  const agentRunning = caseData?.status === 'agent_running'
  useEffect(() => {
    if (!id || !agentRunning) return
    setIsStreaming(true)
    return subscribeToCaseStream(
      id,
      (newStep) => setLiveTrace((prev) => (prev.some((s) => s.step === newStep.step) ? prev : [...prev, newStep])),
      () => {
        setIsStreaming(false)
        queryClient.invalidateQueries({ queryKey: ['case', id] })
        queryClient.invalidateQueries({ queryKey: ['cases'] })
        queryClient.invalidateQueries({ queryKey: ['audit'] })
      }
    )
  }, [id, agentRunning, queryClient])

  // Shared with the Supervised Run tab (same query key), so the tab can flag a step waiting for review
  const { data: agentReview } = useQuery({
    queryKey: ['agent-review', id],
    queryFn: () => api.getAgentReview(id || ''),
    enabled: !!id && agentRunning,
    refetchInterval: agentRunning ? 1500 : false,
  })

  // Mutation for decisions
  const decisionMutation = useMutation({
    mutationFn: async ({
      action,
      payload,
    }: {
      action: 'approve' | 'reject' | 'investigate' | 'delegate'
      payload?: Record<string, unknown>
    }) => {
      if (!id) throw new Error('Missing Case ID')
      return api.recordDecision(id, { action, payload })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', id] })
      queryClient.invalidateQueries({ queryKey: ['cases'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
      setIsConfirmOpen(false)
      setPendingAction(null)
    },
  })

  // Mutation for draft reply save
  const replyMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!id) throw new Error('Missing Case ID')
      return api.updateDraftReply(id, text)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', id] })
      setIsEditingReply(false)
    },
  })

  // Tabs: the agent tabs only exist for moderate cases, the only tier an agent may work on
  const isModerate = caseData?.tier === 'moderate' && !caseData.unknownCategory
  const canDelegate = isModerate && caseData?.status === 'awaiting_human'
  const awaitingReview = !!agentReview?.pending
  const tabs: CaseTab[] = [
    { id: 'overview', label: 'Overview', icon: 'description' },
    ...(isModerate
      ? [
          { id: 'agent', label: 'Agent Trace', icon: 'terminal', count: liveTrace.length },
          { id: 'supervised', label: 'Supervised Run', icon: 'fact_check', attention: awaitingReview },
        ]
      : []),
    {
      id: 'resolution',
      label: 'Resolution',
      icon: 'gavel',
      attention: caseData?.status === 'awaiting_approval' || (caseData?.status === 'awaiting_human' && !isModerate),
    },
    { id: 'audit', label: 'Audit Trail', icon: 'history', count: caseDecisions.length },
  ]
  const defaultTab = caseData?.status === 'awaiting_approval' ? 'resolution' : agentRunning ? 'agent' : 'overview'
  const requestedTab = searchParams.get('tab')
  const tab = tabs.some((t) => t.id === requestedTab) ? (requestedTab as string) : defaultTab
  const selectTab = (next: string) => setSearchParams({ tab: next }, { replace: true })

  // Handle Approve button click
  const handleApproveClick = () => {
    const isMoneyMoving =
      caseData?.proposedAction?.type === 'freeze_payment' ||
      caseData?.proposedAction?.type === 'issue_refund'

    if (isMoneyMoving) {
      setPendingAction('approve')
      setIsConfirmOpen(true)
    } else {
      decisionMutation.mutate({
        action: 'approve',
        payload: { draftReply: draftReplyText },
      })
    }
  }

  // Handle Reject button click
  const handleRejectClick = () => {
    decisionMutation.mutate({
      action: 'reject',
      payload: { reason: 'Rejected by human reviewer in case detail' },
    })
  }

  const handleConfirmAuthorize = () => {
    if (pendingAction === 'approve') {
      decisionMutation.mutate({
        action: 'approve',
        payload: {
          proposedAction: caseData?.proposedAction,
          finalReply: draftReplyText,
        },
      })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton type="detail" />
      </div>
    )
  }

  if (error || !caseData) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center space-y-3">
        <h3 className="text-base font-bold text-red-900">Case Not Found</h3>
        <p className="text-xs text-red-700">The requested case #{id} could not be loaded.</p>
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 transition"
        >
          Go Back
        </button>
      </div>
    )
  }

  const isMoneyMoving =
    caseData.proposedAction?.type === 'freeze_payment' ||
    caseData.proposedAction?.type === 'issue_refund'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <button
            onClick={() => navigate(-1)}
            style={{ width: 36, height: 36, borderRadius: '0.5rem', border: '1px solid var(--color-outline)', background: 'var(--color-surface-bright)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-secondary)', transition: 'background 0.15s', flexShrink: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.02em' }}>
                {caseData.id}
              </h1>
              <TierBadge tier={caseData.unknownCategory ? 'unknown' : caseData.tier} size="md" />
              <WorkflowBadge workflow={workflowOf(caseData)} size="md" />
              <StatusPill status={caseData.status} />
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-tertiary)', margin: 0, marginTop: 2 }}>
              Customer: <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--color-on-surface)' }}>{caseData.customerId}</span>
              {' '}•{' '}Received: {new Date(caseData.receivedAt).toLocaleString()}
            </p>
          </div>
        </div>

        {workflowOf(caseData) === 'unchecked' && (
          <button
            type="button"
            onClick={() => decisionMutation.mutate({ action: 'investigate' })}
            disabled={decisionMutation.isPending}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 1rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', background: 'var(--color-on-tertiary-container)', color: '#FFF', fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 700, opacity: decisionMutation.isPending ? 0.5 : 1 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>manage_search</span>
            Start investigation
          </button>
        )}

        {caseData.status === 'resolved' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.875rem', borderRadius: '0.5rem', background: 'var(--color-tertiary-container)', border: '1px solid #A7F3D0', fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 700, color: '#047857' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
            Resolution Finalized & Executed
          </span>
        )}
      </div>

      <CaseTabs tabs={tabs} active={tab} onChange={selectTab} />

      {/* OVERVIEW: what the customer said and what the system concluded */}
      {tab === 'overview' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 520px), 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        {/* LEFT COLUMN: Complaint, Matched Categories */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Original Complaint Card */}
          <div style={{ background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline)', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-tertiary)' }}>Original Customer Complaint</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: 'var(--color-tertiary)' }}>Raw Input Channel</span>
            </div>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)', borderRadius: '0.5rem', padding: '1rem' }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
                &ldquo;{caseData.complaintText}&rdquo;
              </p>
            </div>
          </div>

          {/* Matched Categories */}
          <div style={{ background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline)', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-tertiary)' }}>Matched Taxonomy Categories</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: 'var(--color-tertiary)' }}>{caseData.categories.length} match{caseData.categories.length === 1 ? '' : 'es'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {caseData.categories.map((cat, idx) => (
                <div key={idx} style={{ border: '1px solid var(--color-outline)', borderRadius: '0.5rem', background: 'var(--color-surface)', padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.375rem' }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>{cat.categoryName || cat.categoryId}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-on-tertiary-container)', background: 'var(--color-tertiary-container)', padding: '1px 8px', borderRadius: 4 }}>{(cat.confidence * 100).toFixed(1)}% Confidence</span>
                  </div>
                  <div style={{ height: 4, width: '100%', borderRadius: 9999, background: 'var(--color-outline)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 9999, background: 'var(--color-on-tertiary-container)', width: `${Math.min(100, cat.confidence * 100)}%`, transition: 'width 0.4s ease' }} />
                  </div>
                  {cat.supportingQuote && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline-variant)', borderRadius: '0.375rem', padding: '0.625rem 0.75rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--color-tertiary)', flexShrink: 0, marginTop: 2 }}>format_quote</span>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, fontStyle: 'italic' }}>
                        <strong style={{ fontStyle: 'normal', fontWeight: 600, color: 'var(--color-on-surface)' }}>Quote: </strong>
                        &ldquo;{cat.supportingQuote}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Report */}
        <div>
          <ReportView report={caseData.report} />
        </div>
      </div>
      )}

      {/* AGENT TRACE: every tool call the agent made; "Let the agent handle it" starts an unsupervised run */}
      {tab === 'agent' && (
        <div style={{ maxWidth: 900 }}>
          <ToolTraceTimeline
            trace={liveTrace}
            isStreaming={isStreaming}
            action={
              canDelegate
                ? {
                    label: 'Let the agent handle it',
                    icon: 'smart_toy',
                    disabled: decisionMutation.isPending,
                    onClick: () => decisionMutation.mutate({ action: 'delegate' }),
                  }
                : undefined
            }
          />
          {decisionMutation.error && (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-error)' }}>
              {decisionMutation.error.message}
            </p>
          )}
        </div>
      )}

      {/* SUPERVISED RUN: approve, reject or edit each agent step */}
      {tab === 'supervised' && (
        <div style={{ maxWidth: 900 }}>
          <SupervisedReview
            caseId={caseData.id}
            tier={caseData.tier}
            status={caseData.status}
            trace={liveTrace}
            onOpenTrace={() => selectTab('agent')}
          />
        </div>
      )}

      {/* RESOLUTION: proposed action, reply and the final human decision */}
      {tab === 'resolution' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 820 }}>

          {/* Proposed Resolution & Action Card */}
          {caseData.proposedAction && (
            <div style={{
              borderRadius: '0.75rem',
              border: `1px solid ${isMoneyMoving ? 'var(--color-error-border)' : 'var(--color-outline)'}`,
              padding: '1.25rem',
              boxShadow: 'var(--shadow-sm)',
              background: isMoneyMoving ? 'var(--color-error-container)' : 'var(--color-surface-bright)',
              display: 'flex', flexDirection: 'column', gap: '0.875rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', paddingBottom: '0.75rem', borderBottom: `1px solid ${isMoneyMoving ? 'var(--color-error-border)' : 'var(--color-outline-variant)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: isMoneyMoving ? 'var(--color-error)' : 'var(--color-info)', flexShrink: 0 }}>
                    {isMoneyMoving ? 'shield_lock' : 'smart_toy'}
                  </span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-on-surface)' }}>Agent Proposed Resolution Action</span>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: isMoneyMoving ? 'var(--color-error-border)' : '#BAE6FD', color: isMoneyMoving ? 'var(--color-error)' : 'var(--color-info)', textTransform: 'uppercase' }}>
                  {caseData.proposedAction.type.replace('_', ' ')}
                </span>
              </div>

              {isMoneyMoving && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-error)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                  Money-Moving Operation • Explicit Human Authorization Required
                </div>
              )}

              {caseData.proposedAction.details && (
                <div style={{ background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline)', borderRadius: '0.5rem', padding: '0.875rem' }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-on-surface)', display: 'block', marginBottom: '0.5rem' }}>Action Specifications:</span>
                  {typeof caseData.proposedAction.details === 'string' ? (
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>{caseData.proposedAction.details}</p>
                  ) : (
                    <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 0.5rem' }}>
                      {Object.entries(caseData.proposedAction.details).map(([k, v]) => (
                        <React.Fragment key={k}>
                          <dt style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-tertiary)', fontWeight: 500, textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}:</dt>
                          <dd style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', color: 'var(--color-on-surface)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                            {typeof v === 'number' && k.toLowerCase().includes('amount') ? `$${v.toFixed(2)}` : String(v)}
                          </dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Draft Reply Area */}
          <div style={{ background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline)', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-secondary)' }}>send</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-on-surface)' }}>Draft Customer Reply</span>
              </div>
              <div>
                {isEditingReply ? (
                  <button type="button" onClick={() => replyMutation.mutate(draftReplyText)} disabled={replyMutation.isPending}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 30, padding: '0 0.75rem', borderRadius: '0.375rem', background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857', fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>save</span> Save Draft
                  </button>
                ) : (
                  <button type="button" onClick={() => setIsEditingReply(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 30, padding: '0 0.75rem', borderRadius: '0.375rem', background: 'var(--color-surface-container-low)', border: 'none', color: 'var(--color-secondary)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span> Edit Reply
                  </button>
                )}
              </div>
            </div>
            <textarea
              rows={5}
              value={draftReplyText}
              disabled={!isEditingReply && caseData.status === 'resolved'}
              onChange={e => setDraftReplyText(e.target.value)}
              placeholder="Draft customer communication…"
              style={{ width: '100%', borderRadius: '0.5rem', border: `1px solid ${isEditingReply ? 'var(--color-on-tertiary-container)' : 'var(--color-outline)'}`, background: isEditingReply ? 'var(--color-surface-bright)' : 'var(--color-surface)', padding: '0.75rem', fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', color: 'var(--color-on-surface)', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.55, transition: 'border-color 0.15s' }}
            />
          </div>

          {/* Decision Action Buttons */}
          {caseData.status !== 'resolved' && (
            <div style={{ background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline)', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-tertiary)', display: 'block' }}>Human Reviewer Decision</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={handleApproveClick} disabled={decisionMutation.isPending}
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', height: 40, padding: '0 1rem', borderRadius: '0.5rem', background: isMoneyMoving ? 'var(--color-error)' : 'var(--color-on-tertiary-container)', color: '#FFF', fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', opacity: decisionMutation.isPending ? 0.5 : 1, transition: 'background 0.15s' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>gavel</span>
                  {isMoneyMoving ? `Authorize & Execute (${caseData.proposedAction?.type.replace('_', ' ')})` : 'Approve & Dispatch'}
                </button>
                <button type="button" onClick={handleRejectClick} disabled={decisionMutation.isPending}
                  className="btn-secondary"
                  style={{ opacity: decisionMutation.isPending ? 0.5 : 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-error)' }}>cancel</span>
                  Reject
                </button>
              </div>
              {(decisionMutation.error || replyMutation.error) && (
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-error)', margin: 0 }}>
                  {(decisionMutation.error || replyMutation.error)?.message}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* AUDIT: who did what on this case */}
      {tab === 'audit' && (
      <div style={{ background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline)', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-secondary)' }}>history</span>
          <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.0625rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: 0 }}>Case Audit Trail &amp; Decision History</h3>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: 'var(--color-secondary)', background: 'var(--color-surface-container-low)', padding: '1px 8px', borderRadius: 9999, border: '1px solid var(--color-outline)' }}>
            {caseDecisions.length} recorded {caseDecisions.length === 1 ? 'event' : 'events'}
          </span>
        </div>
        {caseDecisions.length === 0 ? (
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', color: 'var(--color-tertiary)', margin: 0 }}>No historical decisions recorded for this case yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr>
                <th>Timestamp</th><th>Actor</th><th>Action</th><th>Model / Reviewer</th><th>Evidence / Summary</th>
              </tr></thead>
              <tbody>
                {caseDecisions.map((dec: Decision) => (
                  <tr key={dec.id}>
                    <td><span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: 'var(--color-secondary)' }}>{new Date(dec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', background: dec.actor === 'human' ? '#EFF6FF' : '#F5F3FF', color: dec.actor === 'human' ? '#1D4ED8' : '#7C3AED' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{dec.actor === 'human' ? 'person' : 'smart_toy'}</span>
                        {dec.actor}
                      </span>
                    </td>
                    <td><span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)', textTransform: 'capitalize' }}>{dec.action.replace('_', ' ')}</span></td>
                    <td><span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-secondary)', fontWeight: 500 }}>{dec.model || 'System'}</span></td>
                    <td><span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', maxWidth: 360, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeof dec.evidence === 'string' ? dec.evidence : JSON.stringify(dec.evidence)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Confirmation Dialog for Money-Moving Actions */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        title={`Authorize Money-Moving Action: ${caseData.proposedAction?.type.replace('_', ' ').toUpperCase()}`}
        description={`You are about to authorize an explicit funds custody or account freeze operation for Case ${caseData.id}. Once executed, this triggers ledger holds and settlement locks.`}
        actionType={
          caseData.proposedAction?.type === 'freeze_payment' ||
          caseData.proposedAction?.type === 'issue_refund'
            ? caseData.proposedAction.type
            : 'generic'
        }
        details={caseData.proposedAction?.details}
        confirmText="Confirm & Authorize Transaction"
        isLoading={decisionMutation.isPending}
        onConfirm={handleConfirmAuthorize}
        onCancel={() => {
          setIsConfirmOpen(false)
          setPendingAction(null)
        }}
      />
    </div>
  )
}
