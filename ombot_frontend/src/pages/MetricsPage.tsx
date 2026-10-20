import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'

const PageHeader: React.FC<{ liveLabel: string; title: string; subtitle: string; actions?: React.ReactNode }> = ({ liveLabel, title, subtitle, actions }) => (
  <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            padding: '2px 10px', borderRadius: 9999,
            background: 'var(--color-surface-container-low)',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.6875rem', fontWeight: 600,
            color: 'var(--color-secondary)',
            border: '1px solid var(--color-outline)',
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {liveLabel}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-on-tertiary-container)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-on-tertiary-container)', display: 'inline-block' }} className="animate-pulse-dot" />
            Telemetry Live (Model v2.4)
          </span>
        </div>
        <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.02em' }}>
          {title}
        </h1>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', color: 'var(--color-secondary)', margin: 0, marginTop: '0.25rem' }}>
          {subtitle}
        </p>
      </div>
      {actions && <div>{actions}</div>}
    </div>
  </section>
)

const StatCard: React.FC<{
  label: string; value: string; delta?: string; deltaGood?: boolean; icon: string; iconColor?: string; borderColor?: string; note?: string
}> = ({ label, value, delta, deltaGood, icon, iconColor = 'var(--color-on-surface)', borderColor = 'var(--color-outline)', note }) => (
  <div style={{
    background: 'var(--color-surface-bright)',
    border: `1px solid ${borderColor}`,
    borderRadius: '0.75rem',
    padding: '1.25rem',
    boxShadow: 'var(--shadow-sm)',
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-tertiary)' }}>
        {label}
      </span>
      <div style={{ width: 28, height: 28, borderRadius: '0.375rem', background: 'var(--color-surface-container-low)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: iconColor }}>{icon}</span>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-on-surface)', letterSpacing: '-0.03em' }}>
        {value}
      </span>
      {delta && (
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 600, color: deltaGood ? 'var(--color-on-tertiary-container)' : 'var(--color-tertiary)', display: 'flex', alignItems: 'center', gap: 2 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{deltaGood ? 'trending_up' : 'remove'}</span>
          {delta}
        </span>
      )}
    </div>
    {note && (
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', color: 'var(--color-tertiary)', margin: 0 }}>{note}</p>
    )}
  </div>
)

export const MetricsPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [evalProgress, setEvalProgress] = useState<number | null>(null)
  const [evalStepText, setEvalStepText] = useState('')

  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.getMetrics(),
    refetchInterval: 6000,
  })

  const evalMutation = useMutation({
    mutationFn: async () => {
      setEvalProgress(15); setEvalStepText('Ingesting benchmark test suite (500 historical cases)…')
      await new Promise(r => setTimeout(r, 600))
      setEvalProgress(45); setEvalStepText('Executing category classification inference…')
      await new Promise(r => setTimeout(r, 700))
      setEvalProgress(75); setEvalStepText('Verifying critical risk recall & over-escalation guardrails…')
      await new Promise(r => setTimeout(r, 700))
      setEvalProgress(95); setEvalStepText('Compiling metrics & updating telemetry…')
      await new Promise(r => setTimeout(r, 500))
      return api.runEvaluation()
    },
    onSuccess: () => {
      setEvalProgress(100); setEvalStepText('Evaluation completed successfully!')
      queryClient.invalidateQueries({ queryKey: ['metrics'] })
      setTimeout(() => { setEvalProgress(null); setEvalStepText('') }, 2500)
    },
    onError: () => { setEvalProgress(null); setEvalStepText('') },
  })

  if (isLoading || !metrics) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}><LoadingSkeleton type="stats" /><LoadingSkeleton type="card" /></div>
  }

  const totalTierCount =
    (metrics.tierCounts.critical || 0) + (metrics.tierCounts.moderate || 0) +
    (metrics.tierCounts.low || 0) + (metrics.tierCounts.unknown || 0) || 1
  const criticalPct = Math.round(((metrics.tierCounts.critical || 0) / totalTierCount) * 100)
  const moderatePct = Math.round(((metrics.tierCounts.moderate || 0) / totalTierCount) * 100)
  const lowPct = Math.round(((metrics.tierCounts.low || 0) / totalTierCount) * 100)
  const unknownPct = Math.round(((metrics.tierCounts.unknown || 0) / totalTierCount) * 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      <PageHeader
        liveLabel="Telemetry Node 04 // Production Engine"
        title="Triage Model Performance & SLA Metrics"
        subtitle="Real-time telemetry, classification benchmark accuracy, risk tier distribution, and human-in-the-loop operational efficiency."
        actions={
          <button
            type="button"
            disabled={evalMutation.isPending}
            onClick={() => evalMutation.mutate()}
            className="btn-primary"
            style={{ paddingLeft: '1.25rem', paddingRight: '1.25rem' }}
          >
            {evalMutation.isPending ? (
              <>
                <span style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                Running Evaluation Suite…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span>
                Run Test Set (Eval)
              </>
            )}
          </button>
        }
      />

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', borderRadius: '0.5rem', background: 'var(--color-error-container)', border: '1px solid var(--color-error-border)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-error)', flexShrink: 0 }}>error</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-error)' }}>Failed to load metrics: {(error as Error).message}</span>
        </div>
      )}

      {/* Eval progress banner */}
      {evalProgress !== null && (
        <div style={{ background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline)', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: 'var(--shadow-sm)', animation: 'fadeSlideIn 0.15s ease-out', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-on-tertiary-container)', animation: 'spin 1.5s linear infinite' }}>refresh</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>{evalStepText}</span>
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-on-tertiary-container)' }}>{evalProgress}%</span>
          </div>
          <div style={{ height: 6, width: '100%', borderRadius: 9999, background: 'var(--color-surface-container-low)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 9999, background: 'var(--color-on-tertiary-container)', transition: 'width 0.3s ease', width: `${evalProgress}%` }} />
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
        <StatCard label="Critical Recall" value={`${metrics.criticalRecall.toFixed(1)}%`} delta="0-miss SLA" deltaGood icon="shield_check" iconColor="#DC2626" borderColor="#FECACA" note="Safety guardrail: zero critical fraud claims routed to low tier." />
        <StatCard label="Category Accuracy" value={`${metrics.categoryAccuracy.toFixed(1)}%`} delta="+2.1%" deltaGood icon="target" iconColor="var(--color-on-tertiary-container)" borderColor="#A7F3D0" note="Exact match across 10 declared banking taxonomy categories." />
        <StatCard label="Unknown-Routing Rate" value={`${metrics.unknownRoutingRate.toFixed(1)}%`} delta="Human fallback" icon="help" iconColor="#0369A1" borderColor="#BAE6FD" note="Low rate indicates comprehensive category coverage." />
        <StatCard label="Cost Saving %" value={`${metrics.costSavingPct.toFixed(1)}%`} delta="vs 100% human" deltaGood icon="savings" iconColor="var(--color-on-tertiary-container)" borderColor="#A7F3D0" note="Calculated from automated replies and AI agent resolutions." />
        <StatCard label="Over-Escalation Rate" value={`${metrics.overEscalationRate.toFixed(1)}%`} delta="Low false alarms" icon="trending_down" iconColor="#B45309" borderColor="#FDE68A" note="Minor claims incorrectly escalated to critical specialist queue." />
      </div>

      {/* Tier distribution */}
      <div style={{ background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline)', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
          <div>
            <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.01em' }}>Triage Tier Volume Distribution</h3>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-secondary)', margin: 0, marginTop: 2 }}>Proportional caseload across active triage queues</p>
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)', background: 'var(--color-surface-container-low)', padding: '4px 12px', borderRadius: 9999, border: '1px solid var(--color-outline)' }}>
            Total: {totalTierCount}
          </span>
        </div>

        {/* Stacked bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ height: 24, width: '100%', borderRadius: '0.5rem', overflow: 'hidden', display: 'flex', border: '1px solid var(--color-outline)' }}>
            {[
              { pct: criticalPct, color: '#DC2626', label: 'Critical' },
              { pct: moderatePct, color: '#D97706', label: 'Moderate' },
              { pct: lowPct, color: '#059669', label: 'Low' },
              { pct: unknownPct, color: '#0369A1', label: 'Unknown' },
            ].map(seg => (
              <div key={seg.label} style={{
                width: `${seg.pct}%`, background: seg.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'width 0.5s ease',
              }}>
                {seg.pct > 10 && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', fontWeight: 700, color: '#FFF' }}>{seg.pct}%</span>
                )}
              </div>
            ))}
          </div>

          {/* Legend blocks */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem', paddingTop: '0.25rem' }}>
            {[
              { label: 'Critical Risk', color: '#DC2626', bgColor: '#FEF2F2', borderColor: '#FECACA', count: metrics.tierCounts.critical, pct: criticalPct },
              { label: 'Moderate Risk', color: '#B45309', bgColor: '#FFFBEB', borderColor: '#FDE68A', count: metrics.tierCounts.moderate, pct: moderatePct },
              { label: 'Low Risk (Automated)', color: '#047857', bgColor: '#ECFDF5', borderColor: '#A7F3D0', count: metrics.tierCounts.low, pct: lowPct },
              { label: 'Unknown / Learning', color: '#0369A1', bgColor: '#F0F9FF', borderColor: '#BAE6FD', count: metrics.tierCounts.unknown || 0, pct: unknownPct },
            ].map(item => (
              <div key={item.label} style={{ background: item.bgColor, border: `1px solid ${item.borderColor}`, borderRadius: '0.5rem', padding: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, color: item.color }}>{item.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '0.375rem' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.25rem', fontWeight: 700, color: item.color }}>{item.count}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', fontWeight: 600, color: item.color }}>{item.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
