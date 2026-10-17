import React, { useState } from 'react'
import type { CaseStatus, Workflow } from '../../api/types'

export const WORKFLOWS: Workflow[] = ['unchecked', 'investigating', 'solved']

const META: Record<Workflow, { label: string; icon: string; color: string; bg: string; border: string }> = {
  unchecked: { label: 'Unchecked', icon: 'mark_email_unread', color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  investigating: { label: 'Under investigation', icon: 'manage_search', color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  solved: { label: 'Solved', icon: 'check_circle', color: '#047857', bg: '#ECFDF5', border: '#A7F3D0' },
}

// Mock data has no workflow field, so fall back to the status
export function workflowOf(c: { workflow?: Workflow; status: CaseStatus }): Workflow {
  if (c.workflow) return c.workflow
  if (c.status === 'resolved' || c.status === 'auto_replied') return 'solved'
  if (c.status === 'processing' || c.status === 'new' || c.status === 'awaiting_human') return 'unchecked'
  return 'investigating'
}

export const WorkflowBadge: React.FC<{ workflow: Workflow; size?: 'sm' | 'md' }> = ({ workflow, size = 'sm' }) => {
  const m = META[workflow]
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
        padding: size === 'md' ? '3px 10px' : '2px 8px', borderRadius: 9999,
        background: m.bg, border: `1px solid ${m.border}`, color: m.color,
        fontFamily: "'DM Sans', sans-serif", fontSize: size === 'md' ? '0.8125rem' : '0.75rem', fontWeight: 700,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: size === 'md' ? 16 : 14 }}>{m.icon}</span>
      {m.label}
    </span>
  )
}

// Pick any combination of states; nothing picked means all of them
export function useWorkflowFilter<T>(items: T[], getWorkflow: (item: T) => Workflow) {
  const [selected, setSelected] = useState<Set<Workflow>>(new Set())
  const counts: Record<Workflow, number> = { unchecked: 0, investigating: 0, solved: 0 }
  for (const item of items) counts[getWorkflow(item)] += 1
  const toggle = (w: Workflow) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(w)) next.delete(w)
      else next.add(w)
      return next.size === WORKFLOWS.length ? new Set() : next // all three picked is the same as all
    })
  const clear = () => setSelected(new Set())
  const filtered = selected.size === 0 ? items : items.filter((i) => selected.has(getWorkflow(i)))
  return { selected, toggle, clear, filtered, counts }
}

interface WorkflowFilterProps {
  selected: Set<Workflow>
  counts: Record<Workflow, number>
  onToggle: (w: Workflow) => void
  onClear: () => void
}

export const WorkflowFilter: React.FC<WorkflowFilterProps> = ({ selected, counts, onToggle, onClear }) => {
  const total = counts.unchecked + counts.investigating + counts.solved
  const chip = (active: boolean, color?: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 0.875rem', borderRadius: 9999, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: active ? 700 : 500, transition: 'background 0.15s',
    border: `1px solid ${active ? (color ?? 'var(--color-primary)') : 'var(--color-outline)'}`,
    background: active ? (color ?? 'var(--color-primary)') : 'var(--color-surface-bright)',
    color: active ? '#FFF' : 'var(--color-secondary)',
  })
  return (
    <div role="group" aria-label="Filter by case state" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <button type="button" onClick={onClear} aria-pressed={selected.size === 0} style={chip(selected.size === 0)}>
        All <span style={{ opacity: 0.8 }}>({total})</span>
      </button>
      {WORKFLOWS.map((w) => (
        <button key={w} type="button" onClick={() => onToggle(w)} aria-pressed={selected.has(w)} style={chip(selected.has(w), META[w].color)}>
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{META[w].icon}</span>
          {META[w].label} <span style={{ opacity: 0.8 }}>({counts[w]})</span>
        </button>
      ))}
    </div>
  )
}
