import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { TierBadge } from '../components/common/TierBadge'
import { EmptyState } from '../components/common/EmptyState'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'

export const ModerateQueue: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeActionId, setActiveActionId] = useState<string | null>(null)

  const { data: cases = [], isLoading, error } = useQuery({
    queryKey: ['cases', 'moderate'],
    queryFn: () => api.getCases('moderate'),
    refetchInterval: 5000,
  })

  const decisionMutation = useMutation({
    mutationFn: async ({ caseId, action }: { caseId: string; action: 'investigate' | 'delegate' }) => {
      setActiveActionId(caseId)
      return api.recordDecision(caseId, { action })
    },
    onSuccess: (updatedCase, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
      setActiveActionId(null)
      if (variables.action === 'investigate') navigate(`/cases/${updatedCase.id}`)
    },
    onError: () => setActiveActionId(null),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Page header */}
      <section style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 10px', borderRadius: 9999,
              background: '#FFFBEB', border: '1px solid #FDE68A',
              fontFamily: "'DM Sans', sans-serif", fontSize: '0.6875rem', fontWeight: 600,
              color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D97706', display: 'inline-block' }} />
              SLA ≤ 4 Hours
            </span>
          </div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.02em' }}>
            Moderate Risk Queue
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', color: 'var(--color-secondary)', margin: 0, marginTop: '0.375rem' }}>
            Complaints such as wrong-recipient transfers or failed debits. Human reviews the executive summary and chooses to investigate directly or delegate to an autonomous AI agent.
          </p>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1rem', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.5rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#B45309' }}>info</span>
          <div>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 700, color: '#B45309', display: 'block' }}>Triage Protocol</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', color: '#92400E' }}>Read summary • Choose Human vs AI delegation</span>
          </div>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', borderRadius: '0.5rem', background: 'var(--color-error-container)', border: '1px solid var(--color-error-border)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-error)', flexShrink: 0 }}>error</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-error)' }}>Failed to load moderate queue: {(error as Error).message}</span>
        </div>
      )}

      {isLoading ? (
        <LoadingSkeleton type="card" />
      ) : cases.length === 0 ? (
        <EmptyState title="No complaints in moderate queue" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {cases.map(c => {
            const primaryCategoryName = c.categories[0]?.categoryName || c.categories[0]?.categoryId || 'Moderate Risk Issue'
            const isDelegatedOrRunning = c.status === 'delegated' || c.status === 'agent_running'

            return (
              <div key={c.id} style={{
                background: 'var(--color-surface-bright)',
                border: '1px solid var(--color-outline)',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex', flexDirection: 'column', gap: '1rem',
                transition: 'border-color 0.15s',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-tertiary)' }}>{c.id}</span>
                    <span style={{ width: 1, height: 16, background: 'var(--color-outline)' }} />
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>{primaryCategoryName}</span>
                  </div>
                  <TierBadge tier={c.tier} size="md" />
                </div>

                {/* Report summary */}
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)', borderRadius: '0.5rem', padding: '1rem' }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
                    {c.report.summary}
                  </p>
                </div>

                {/* Delegated status */}
                {isDelegatedOrRunning && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '0.5rem', background: '#EEF2FF', border: '1px solid #C7D2FE' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#4338CA', animation: 'spin 1.5s linear infinite' }}>refresh</span>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600, color: '#4338CA' }}>AI Agent Autonomous Execution in Progress</span>
                    </div>
                    <button
                      onClick={() => navigate(`/cases/${c.id}`)}
                      style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 700, color: '#4338CA', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      Watch Live Tool Trace
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
                    </button>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={activeActionId === c.id}
                    onClick={() => decisionMutation.mutate({ caseId: c.id, action: 'investigate' })}
                    className="btn-secondary"
                    style={{ opacity: activeActionId === c.id ? 0.5 : 1 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_search</span>
                    Investigate myself
                  </button>
                  <button
                    type="button"
                    disabled={activeActionId === c.id || isDelegatedOrRunning}
                    onClick={() => decisionMutation.mutate({ caseId: c.id, action: 'delegate' })}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                      height: 40, padding: '0 1rem', borderRadius: '0.5rem',
                      background: '#4F46E5', color: '#FFF',
                      fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600,
                      border: 'none', cursor: 'pointer', transition: 'background 0.15s',
                      opacity: (activeActionId === c.id || isDelegatedOrRunning) ? 0.5 : 1,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>smart_toy</span>
                    {isDelegatedOrRunning ? 'Delegated to AI' : 'Delegate to AI agent'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
