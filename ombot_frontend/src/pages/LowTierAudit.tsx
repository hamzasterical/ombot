import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { LowTierAuditItem } from '../api/types'
import { EmptyState } from '../components/common/EmptyState'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'

export const LowTierAudit: React.FC = () => {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'verified_fine' | 'escalated'>('all')

  const { data: samples = [], isLoading, error } = useQuery({
    queryKey: ['low-tier-audit'],
    queryFn: () => api.getLowTierAuditSamples(),
    refetchInterval: 5000,
  })

  const reviewMutation = useMutation({
    mutationFn: async ({ sampleId, action }: { sampleId: string; action: 'looks_fine' | 'escalate' }) =>
      api.reviewLowTierSample(sampleId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['low-tier-audit'] })
      queryClient.invalidateQueries({ queryKey: ['cases'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
      queryClient.invalidateQueries({ queryKey: ['metrics'] })
    },
  })

  const filteredSamples = samples.filter((s: LowTierAuditItem) => {
    if (statusFilter !== 'all' && s.auditStatus !== statusFilter) return false
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return s.caseId.toLowerCase().includes(term) || s.customerId.toLowerCase().includes(term) || s.complaintText.toLowerCase().includes(term) || s.sentReply.toLowerCase().includes(term) || s.category.toLowerCase().includes(term)
  })

  const chipStyle = (active: boolean): React.CSSProperties => ({
    height: 32, padding: '0 0.875rem', borderRadius: 9999,
    fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 500,
    cursor: 'pointer', border: 'none', outline: 'none', transition: 'background 0.15s, color 0.15s',
    background: active ? 'var(--color-primary)' : 'var(--color-surface-container-low)',
    color: active ? 'var(--color-on-primary)' : 'var(--color-secondary)',
    textTransform: 'capitalize' as const,
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
              background: '#ECFDF5', border: '1px solid #A7F3D0',
              fontFamily: "'DM Sans', sans-serif", fontSize: '0.6875rem', fontWeight: 600,
              color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
              Quality Assurance — 10% Sample Rate
            </span>
          </div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.02em' }}>
            Low-Tier Auto-Reply Audit
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', color: 'var(--color-secondary)', margin: 0, marginTop: '0.375rem' }}>
            Low-risk complaints (app bugs, fee FAQs, feedback) receive instant automated AI replies. Human staff audit random samples to detect anomalies or false negatives.
          </p>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1rem', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '0.5rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#047857' }}>verified_user</span>
          <div>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 700, color: '#047857', display: 'block' }}>Quality Assurance Sample</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', color: '#065F46' }}>Target audit sample rate: 10%</span>
          </div>
        </div>
      </section>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-secondary)' }}>Filter Status:</span>
          {(['all', 'pending', 'verified_fine', 'escalated'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={chipStyle(statusFilter === f)}>
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', minWidth: 280 }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--color-tertiary)' }}>search</span>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search sampled complaints or replies…"
            className="form-input"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', borderRadius: '0.5rem', background: 'var(--color-error-container)', border: '1px solid var(--color-error-border)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-error)', flexShrink: 0 }}>error</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-error)' }}>Failed to load audit sample: {(error as Error).message}</span>
        </div>
      )}

      {isLoading ? (
        <LoadingSkeleton type="table" />
      ) : filteredSamples.length === 0 ? (
        <EmptyState title="No audit samples matching filters" description="Try selecting a different status filter or clearing your search query." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredSamples.map((item: LowTierAuditItem) => {
            const isPending  = item.auditStatus === 'pending'
            const isVerified = item.auditStatus === 'verified_fine'
            const isEscalated = item.auditStatus === 'escalated'

            return (
              <div key={item.id} style={{
                background: 'var(--color-surface-bright)',
                border: '1px solid var(--color-outline)',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex', flexDirection: 'column', gap: '1rem',
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-tertiary)' }}>{item.caseId}</span>
                    <span style={{ color: 'var(--color-outline)' }}>•</span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-secondary)' }}>Customer: {item.customerId}</span>
                    <span style={{ color: 'var(--color-outline)' }}>•</span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>{item.category}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: 'var(--color-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>schedule</span>
                      {new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    {isVerified && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, background: '#ECFDF5', border: '1px solid #A7F3D0', fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, color: '#047857' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>
                        Verified Fine
                      </span>
                    )}
                    {isEscalated && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, background: 'var(--color-error-container)', border: '1px solid var(--color-error-border)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-error)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
                        Escalated to Staff
                      </span>
                    )}
                    {isPending && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, background: '#FFFBEB', border: '1px solid #FDE68A', fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, color: '#B45309', animation: 'pulse-dot 1.5s ease-in-out infinite' }}>
                        Audit Pending
                      </span>
                    )}
                  </div>
                </div>

                {/* Side-by-side comparison */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                  <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)', borderRadius: '0.5rem', padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--color-tertiary)' }}>format_quote</span>
                      Customer Complaint:
                    </div>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.55, fontWeight: 500 }}>{item.complaintText}</p>
                  </div>
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.5rem', padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, color: '#065F46' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#059669' }}>task_alt</span>
                      Automated Sent Reply:
                    </div>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', color: '#064E3B', margin: 0, lineHeight: 1.55 }}>{item.sentReply}</p>
                  </div>
                </div>

                {/* Audit buttons */}
                {isPending && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.25rem', borderTop: '1px solid var(--color-outline-variant)' }}>
                    <button
                      type="button"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ sampleId: item.id, action: 'looks_fine' })}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                        height: 36, padding: '0 1rem', borderRadius: '0.5rem',
                        background: '#ECFDF5', border: '1px solid #A7F3D0',
                        color: '#047857', fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600,
                        cursor: 'pointer', transition: 'background 0.15s',
                        opacity: reviewMutation.isPending ? 0.5 : 1,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                      Looks fine
                    </button>
                    <button
                      type="button"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ sampleId: item.id, action: 'escalate' })}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                        height: 36, padding: '0 1rem', borderRadius: '0.5rem',
                        background: 'var(--color-error-container)', border: '1px solid var(--color-error-border)',
                        color: 'var(--color-error)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600,
                        cursor: 'pointer', transition: 'background 0.15s',
                        opacity: reviewMutation.isPending ? 0.5 : 1,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                      Wrong, escalate
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
