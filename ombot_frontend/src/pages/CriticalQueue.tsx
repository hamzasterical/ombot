import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { CaseTable } from '../components/case/CaseTable'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'

export const CriticalQueue: React.FC = () => {
  const { data: cases = [], isLoading, error } = useQuery({
    queryKey: ['cases', 'critical'],
    queryFn: () => api.getCases('critical'),
    refetchInterval: 5000,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Page header */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              padding: '2px 10px', borderRadius: 9999,
              background: 'var(--color-surface-container-low)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.6875rem', fontWeight: 600,
              color: 'var(--color-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              border: '1px solid var(--color-outline)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', display: 'inline-block' }} />
              SLA ≤ 15 Min
            </span>
          </div>
          <h1 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: '1.75rem', fontWeight: 700,
            color: 'var(--color-on-surface)',
            margin: 0, letterSpacing: '-0.02em',
          }}>
            Critical Risk Queue
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', color: 'var(--color-secondary)', margin: 0, marginTop: '0.25rem' }}>
            Cases involving financial crime, account takeovers, or unauthorized transactions. Staff must investigate manually; the AI only synthesizes the report.
          </p>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'var(--color-error-container)',
            border: '1px solid var(--color-error-border)',
            borderRadius: '0.5rem',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-error)' }}>crisis_alert</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-error)' }}>
              {cases.length} active critical {cases.length === 1 ? 'case' : 'cases'} awaiting review
            </span>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'var(--color-surface-bright)',
            border: '1px solid var(--color-outline)',
            borderRadius: '0.5rem',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-secondary)' }}>timer</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-on-surface)', fontWeight: 500 }}>
              SLA Target: <strong>Under 15 Minutes</strong>
            </span>
          </div>
        </div>
      </section>

      {/* Error state */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '1rem', borderRadius: '0.5rem',
          background: 'var(--color-error-container)',
          border: '1px solid var(--color-error-border)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-error)', flexShrink: 0 }}>error</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-error)' }}>
            Failed to load critical queue: {(error as Error).message}
          </span>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton type="table" />
      ) : (
        <CaseTable cases={cases} title="Assigned Critical Incidents" />
      )}
    </div>
  )
}
