import React from 'react'

export interface CaseTab {
  id: string
  label: string
  icon: string
  // A dot that asks for attention, e.g. the agent is waiting on a review
  attention?: boolean
  count?: number
}

interface CaseTabsProps {
  tabs: CaseTab[]
  active: string
  onChange: (id: string) => void
}

export const CaseTabs: React.FC<CaseTabsProps> = ({ tabs, active, onChange }) => (
  <div
    role="tablist"
    style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', borderBottom: '1px solid var(--color-outline-variant)' }}
  >
    {tabs.map((t) => {
      const isActive = t.id === active
      return (
        <button
          key={t.id}
          role="tab"
          aria-selected={isActive}
          type="button"
          onClick={() => onChange(t.id)}
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0.625rem 1rem',
            background: 'none',
            border: 'none',
            borderBottom: `2px solid ${isActive ? 'var(--color-info)' : 'transparent'}`,
            marginBottom: -1,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.875rem',
            fontWeight: isActive ? 700 : 500,
            color: isActive ? 'var(--color-on-surface)' : 'var(--color-secondary)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{t.icon}</span>
          {t.label}
          {t.count !== undefined && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', padding: '0 6px', borderRadius: 9999, background: 'var(--color-surface-container-low)', border: '1px solid var(--color-outline)' }}>
              {t.count}
            </span>
          )}
          {t.attention && (
            <span aria-label="needs attention" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-error)' }} />
          )}
        </button>
      )
    })}
  </div>
)
