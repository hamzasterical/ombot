import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Decision } from '../api/types'
import { EmptyState } from '../components/common/EmptyState'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'

export const AuditLog: React.FC = () => {
  const [actorFilter, setActorFilter] = useState<'all' | 'human' | 'ai'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  const { data: decisions = [], isLoading, error } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.getAuditLogs(),
    refetchInterval: 5000,
  })

  const toggleRow = (id: string) =>
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }))

  const filteredDecisions = decisions.filter((d: Decision) => {
    if (actorFilter !== 'all' && d.actor !== actorFilter) return false
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      d.caseId.toLowerCase().includes(q) ||
      d.action.toLowerCase().includes(q) ||
      (d.model && d.model.toLowerCase().includes(q)) ||
      (d.evidence && String(d.evidence).toLowerCase().includes(q))
    )
  })

  const actorChipStyle = (active: boolean): React.CSSProperties => ({
    height: 32, padding: '0 0.875rem', borderRadius: 9999,
    fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 500,
    cursor: 'pointer', border: 'none', outline: 'none', transition: 'background 0.15s, color 0.15s',
    background: active ? 'var(--color-primary)' : 'var(--color-surface-container-low)',
    color: active ? 'var(--color-on-primary)' : 'var(--color-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.03em',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Page header */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.02em' }}>
              Audit &amp; Governance Log
            </h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', color: 'var(--color-secondary)', margin: 0, marginTop: '0.375rem' }}>
              Immutable regulatory audit trail. Every autonomous AI action, human authorization, and taxonomy modification is recorded with evidentiary proof and model signatures.
            </p>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.625rem',
            padding: '0.625rem 1rem',
            background: 'var(--color-surface-bright)',
            border: '1px solid var(--color-outline)',
            borderRadius: '0.5rem',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-on-tertiary-container)' }}>verified_user</span>
            <div>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface)', display: 'block' }}>Compliance Ready</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: 'var(--color-secondary)' }}>{decisions.length} recorded events</span>
            </div>
          </div>
        </div>
      </section>

      {/* Filters & search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-secondary)' }}>Filter Actor:</span>
          {(['all', 'human', 'ai'] as const).map(f => (
            <button key={f} onClick={() => setActorFilter(f)} style={actorChipStyle(actorFilter === f)}>
              {f}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', minWidth: 280 }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--color-tertiary)' }}>search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by case, action, evidence…"
            className="form-input"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', borderRadius: '0.5rem', background: 'var(--color-error-container)', border: '1px solid var(--color-error-border)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-error)', flexShrink: 0 }}>error</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-error)' }}>Failed to load audit logs: {(error as Error).message}</span>
        </div>
      )}

      {isLoading ? (
        <LoadingSkeleton type="table" />
      ) : filteredDecisions.length === 0 ? (
        <EmptyState title="No audit log entries matching filters" description="Adjust your search query or actor filter to view recorded entries." />
      ) : (
        <div style={{ background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline)', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Case ID</th>
                  <th>Model / Operator</th>
                  <th style={{ textAlign: 'right' }}>Case Link</th>
                </tr>
              </thead>
              <tbody>
                {filteredDecisions.map((dec: Decision) => {
                  const isExpanded = !!expandedRows[dec.id]
                  return (
                    <React.Fragment key={dec.id}>
                      <tr
                        onClick={() => toggleRow(dec.id)}
                        style={{ cursor: 'pointer', transition: 'background 0.12s' }}
                      >
                        <td>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-tertiary)', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'block' }}>
                            chevron_right
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: 'var(--color-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>schedule</span>
                            {new Date(dec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 9999,
                            fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', fontWeight: 600,
                            textTransform: 'uppercase',
                            background: dec.actor === 'human' ? '#EFF6FF' : '#F5F3FF',
                            color: dec.actor === 'human' ? '#1D4ED8' : '#7C3AED',
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{dec.actor === 'human' ? 'person' : 'smart_toy'}</span>
                            {dec.actor}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)', textTransform: 'capitalize' }}>
                            {dec.action.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-tertiary-container)' }}>
                            {dec.caseId}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>
                            {dec.model || 'System Engine'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link
                            to={`/cases/${dec.caseId}`}
                            onClick={e => e.stopPropagation()}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-tertiary-container)', textDecoration: 'none' }}
                          >
                            Case
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
                          </Link>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr style={{ background: 'var(--color-surface)' }}>
                          <td colSpan={7} style={{ padding: '1rem 1rem 1rem 3rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                              <div style={{ background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline)', borderRadius: '0.5rem', padding: '0.875rem' }}>
                                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-on-surface)', display: 'block', marginBottom: '0.375rem' }}>Supporting Evidence &amp; Rationale</span>
                                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.55 }}>
                                  {typeof dec.evidence === 'string' ? dec.evidence : JSON.stringify(dec.evidence, null, 2)}
                                </p>
                              </div>
                              <div style={{ background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline)', borderRadius: '0.5rem', padding: '0.875rem' }}>
                                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-on-surface)', display: 'block', marginBottom: '0.5rem' }}>Action Payload &amp; Model Metadata</span>
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: 'var(--color-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                  <div><strong style={{ color: 'var(--color-on-surface)' }}>Model Signature: </strong>{dec.model || 'Fintech-Engine-Core'}</div>
                                  <div><strong style={{ color: 'var(--color-on-surface)' }}>Audit ID: </strong>{dec.id}</div>
                                  {dec.payload && (
                                    <pre style={{ margin: '0.5rem 0 0', borderRadius: '0.375rem', background: '#0F172A', padding: '0.625rem', fontSize: '0.6875rem', color: '#34D399', overflowX: 'auto' }}>
                                      {JSON.stringify(dec.payload, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
