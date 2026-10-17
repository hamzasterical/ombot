import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { AgentProposal, ReviewMode, ToolTraceStep } from '../../api/types'

interface SupervisedReviewProps {
  caseId: string
  tier: string
  status: string
  trace: ToolTraceStep[]
  onOpenTrace: () => void
}

const TOOL_INFO: Record<string, { label: string; what: string; writes?: boolean }> = {
  get_transaction: { label: 'Look up transaction', what: 'Reads one transaction from the ledger.' },
  get_sender: { label: 'Look up sender', what: 'Reads the sender account and its customer.' },
  get_receiver: { label: 'Look up receiver', what: 'Reads the receiver account and its customer.' },
  get_customer_history: { label: 'Customer history', what: 'Reads profile, accounts, cards, recent transactions and security events.' },
  get_security_events: { label: 'Security events', what: 'Reads logins, new devices, SIM swaps and new beneficiaries.' },
  check_merchant: { label: 'Check merchant', what: 'Reads merchant info and its complaint count.' },
  search_policy: { label: 'Search policy', what: 'Searches the bank policies.' },
  draft_reply: { label: 'Draft customer reply', what: 'Saves the message the customer would receive.', writes: true },
  freeze_payment: { label: 'Propose freeze', what: 'Only creates a proposal. Nothing is frozen until you authorise it in the Resolution tab.', writes: true },
  issue_refund: { label: 'Propose refund', what: 'Only creates a proposal. No money moves until you authorise it in the Resolution tab.', writes: true },
}

const MODE_OPTIONS: { mode: Exclude<ReviewMode, 'auto'>; title: string; text: string; icon: string }[] = [
  { mode: 'all', title: 'Review every step', text: 'The agent pauses before each tool call. Best for a new type of case or when you want to check its reasoning.', icon: 'fact_check' },
  { mode: 'risky', title: 'Review only risky steps', text: 'Lookups run on their own. The agent pauses before it drafts a reply or proposes a freeze or refund.', icon: 'shield_person' },
]

const card: React.CSSProperties = {
  background: 'var(--color-surface-bright)',
  border: '1px solid var(--color-outline)',
  borderRadius: '0.75rem',
  padding: '1.25rem',
  boxShadow: 'var(--shadow-sm)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
}
const label: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '0.6875rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--color-tertiary)',
}
const body: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.5 }
const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }

function PendingStep({ caseId, proposal }: { caseId: string; proposal: AgentProposal }) {
  const queryClient = useQueryClient()
  const info = TOOL_INFO[proposal.tool]
  const original = JSON.stringify(proposal.args, null, 2)
  const [editing, setEditing] = useState(false)
  const [argsText, setArgsText] = useState(original)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')

  // A new step arrived: start from a clean card
  useEffect(() => {
    setEditing(false)
    setRejecting(false)
    setNote('')
    setArgsText(JSON.stringify(proposal.args, null, 2))
  }, [proposal.call_no]) // args are stable per call; depending on them would reset an edit on every poll

  let parsed: Record<string, unknown> | null = null
  let parseError: string | null = null
  if (editing) {
    try {
      const v = JSON.parse(argsText)
      if (v && typeof v === 'object' && !Array.isArray(v)) parsed = v
      else parseError = 'Arguments must be a JSON object'
    } catch (e) {
      parseError = (e as Error).message
    }
  }

  const review = useMutation({
    mutationFn: (p: Parameters<typeof api.reviewAgentStep>[1]) => api.reviewAgentStep(caseId, { callNo: proposal.call_no, ...p }),
    onSuccess: (state) => {
      queryClient.setQueryData(['agent-review', caseId], state)
      queryClient.invalidateQueries({ queryKey: ['agent-review', caseId] })
    },
  })
  const busy = review.isPending

  return (
    <div style={{ ...card, border: '2px solid var(--color-info)', background: 'var(--color-surface-bright)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-info)' }}>pause_circle</span>
          <span style={label}>Waiting for your review • step {proposal.call_no}</span>
        </div>
        <span style={{ ...mono, fontSize: '0.75rem', fontWeight: 700, padding: '2px 10px', borderRadius: 9999, background: 'var(--color-surface-container-low)', border: '1px solid var(--color-outline)' }}>
          {proposal.tool}
        </span>
      </div>

      <div>
        <p style={{ ...body, fontWeight: 700, color: 'var(--color-on-surface)', fontSize: '1rem' }}>{info?.label ?? proposal.tool}</p>
        <p style={{ ...body, marginTop: 2 }}>{info?.what ?? 'The agent wants to run this tool.'}</p>
      </div>

      {info?.writes && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit_note</span>
          This step writes something, not just a lookup.
        </div>
      )}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={label}>Arguments</span>
          <button type="button" onClick={() => { setEditing(!editing); setArgsText(original) }} disabled={busy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-info)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700 }}>
            {editing ? 'Cancel edit' : 'Edit arguments'}
          </button>
        </div>
        {editing ? (
          <>
            <textarea value={argsText} onChange={(e) => setArgsText(e.target.value)} rows={Math.min(10, argsText.split('\n').length + 1)} spellCheck={false}
              style={{ ...mono, width: '100%', boxSizing: 'border-box', fontSize: '0.8125rem', padding: '0.625rem', borderRadius: '0.5rem', border: `1px solid ${parseError ? 'var(--color-error)' : 'var(--color-outline)'}`, background: 'var(--color-surface)', color: 'var(--color-on-surface)' }} />
            {parseError && <p style={{ ...body, color: 'var(--color-error)', fontSize: '0.75rem' }}>{parseError}</p>}
          </>
        ) : (
          <pre style={{ ...mono, margin: 0, fontSize: '0.8125rem', padding: '0.625rem', borderRadius: '0.5rem', border: '1px solid var(--color-outline-variant)', background: 'var(--color-surface)', color: 'var(--color-on-surface)', overflowX: 'auto' }}>{original}</pre>
        )}
      </div>

      {rejecting && (
        <div>
          <span style={label}>Tell the agent why (it sees this)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} autoFocus placeholder="e.g. Check the receiver account before the sender"
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', padding: '0.625rem', borderRadius: '0.5rem', border: '1px solid var(--color-outline)', background: 'var(--color-surface)', color: 'var(--color-on-surface)' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
        {rejecting ? (
          <>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => review.mutate({ verdict: 'reject', note: note.trim() || undefined })}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-error)' }}>block</span> Send rejection
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setRejecting(false)}>Back</button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy || (editing && !!parseError)}
              onClick={() => review.mutate({ verdict: 'approve', args: editing && parsed ? parsed : undefined })}
              style={{ flex: 1, minWidth: 160, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: '0.5rem', border: 'none', cursor: 'pointer', background: 'var(--color-on-tertiary-container)', color: '#FFF', fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 700, opacity: busy ? 0.5 : 1 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
              {editing ? 'Approve with my edits' : 'Approve step'}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setRejecting(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-error)' }}>block</span> Reject…
            </button>
            <button type="button" className="btn-secondary" disabled={busy} title="Stop the agent and take the case back"
              onClick={() => { if (window.confirm('Stop the agent run? The case goes back to you.')) review.mutate({ verdict: 'abort' }) }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>stop_circle</span> Stop run
            </button>
          </>
        )}
      </div>
      {review.error && <p style={{ ...body, color: 'var(--color-error)', fontSize: '0.8125rem' }}>{(review.error as Error).message}</p>}
    </div>
  )
}

export const SupervisedReview: React.FC<SupervisedReviewProps> = ({ caseId, tier, status, trace, onOpenTrace }) => {
  const queryClient = useQueryClient()
  const [startMode, setStartMode] = useState<Exclude<ReviewMode, 'auto'>>('all')
  const running = status === 'agent_running'
  const canStart = tier === 'moderate' && status === 'awaiting_human'

  const { data: review } = useQuery({
    queryKey: ['agent-review', caseId],
    queryFn: () => api.getAgentReview(caseId),
    enabled: running,
    refetchInterval: running ? 1500 : false,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['case', caseId] })
    queryClient.invalidateQueries({ queryKey: ['cases'] })
    queryClient.invalidateQueries({ queryKey: ['audit'] })
  }

  const start = useMutation({
    mutationFn: () => api.recordDecision(caseId, { action: 'delegate', payload: { mode: startMode } }),
    onSuccess: refresh,
  })

  const changeMode = useMutation({
    mutationFn: (mode: ReviewMode) => api.reviewAgentStep(caseId, { mode }),
    onSuccess: (state) => {
      queryClient.setQueryData(['agent-review', caseId], state)
      queryClient.invalidateQueries({ queryKey: ['agent-review', caseId] })
    },
  })

  const reviewed = trace.filter((s) => s.review)

  if (tier !== 'moderate') {
    return (
      <div style={card}>
        <span style={label}>Supervised agent run</span>
        <p style={body}>Only moderate-risk cases can be given to the agent. Critical cases are always handled by a person.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {canStart && (
        <div style={card}>
          <div>
            <span style={label}>Run the agent with you in the loop</span>
            <p style={{ ...body, marginTop: 6 }}>
              You know how banking works, so you steer. The agent proposes each step and you approve, reject with a reason, or edit it.
              If you would rather not watch it, use <strong>Let the agent handle it</strong> on the Moderate queue or the Agent Trace tab.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {MODE_OPTIONS.map((o) => {
              const active = startMode === o.mode
              return (
                <button key={o.mode} type="button" onClick={() => setStartMode(o.mode)} aria-pressed={active}
                  style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, padding: '0.875rem', borderRadius: '0.625rem', background: active ? 'var(--color-surface-container-low)' : 'var(--color-surface)', border: `2px solid ${active ? 'var(--color-info)' : 'var(--color-outline)'}` }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-info)' }}>{o.icon}</span>{o.title}
                  </span>
                  <span style={{ ...body, fontSize: '0.8125rem' }}>{o.text}</span>
                </button>
              )
            })}
          </div>
          <div>
            <button type="button" onClick={() => start.mutate()} disabled={start.isPending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 1.25rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', background: '#4F46E5', color: '#FFF', fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 700, opacity: start.isPending ? 0.5 : 1 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span>
              Start supervised run
            </button>
            {start.error && <p style={{ ...body, color: 'var(--color-error)', marginTop: 8 }}>{(start.error as Error).message}</p>}
          </div>
        </div>
      )}

      {running && review?.mode == null && review !== undefined && (
        <div style={card}>
          <span style={label}>Agent is running on its own</span>
          <p style={body}>This run was started without review, so there is nothing to approve. Follow its tool calls on the Agent Trace tab.</p>
          <div><button type="button" className="btn-secondary" onClick={onOpenTrace}>Open Agent Trace</button></div>
        </div>
      )}

      {running && review?.mode != null && (
        <>
          <div style={{ ...card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <span style={label}>Pause level</span>
              <p style={{ ...body, fontSize: '0.8125rem', marginTop: 2 }}>Change it at any time. Switching to “Let it finish” approves the step now waiting.</p>
            </div>
            <div role="group" aria-label="Pause level" style={{ display: 'inline-flex', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--color-outline)' }}>
              {([['all', 'Every step'], ['risky', 'Risky only'], ['auto', 'Let it finish']] as const).map(([m, text]) => (
                <button key={m} type="button" disabled={changeMode.isPending} onClick={() => changeMode.mutate(m)} aria-pressed={review.mode === m}
                  style={{ padding: '0.5rem 0.875rem', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600, background: review.mode === m ? 'var(--color-info)' : 'var(--color-surface-bright)', color: review.mode === m ? '#FFF' : 'var(--color-on-surface)' }}>
                  {text}
                </button>
              ))}
            </div>
          </div>

          {review.pending ? (
            <PendingStep caseId={caseId} proposal={review.pending} />
          ) : (
            <div style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: '0.75rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-info)', animation: 'spin 1.5s linear infinite' }}>progress_activity</span>
              <span style={body}>The agent is working. It will stop here when it needs your review.</span>
            </div>
          )}
        </>
      )}

      {!canStart && !running && (
        <div style={card}>
          <span style={label}>Supervised agent run</span>
          <p style={body}>
            {reviewed.length > 0
              ? 'The agent is not running. The steps you reviewed are listed below.'
              : status === 'awaiting_approval' || status === 'resolved'
                ? 'The agent has finished on this case. Open the Agent Trace tab to see everything it did.'
                : 'This case is not waiting on a person right now, so the agent cannot be started.'}
          </p>
        </div>
      )}

      {reviewed.length > 0 && (
        <div style={card}>
          <span style={label}>Steps you reviewed ({reviewed.length})</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reviewed.map((s) => (
              <div key={s.step} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
                <span style={{ ...mono, fontSize: '0.8125rem', color: 'var(--color-on-surface)' }}>{s.step}. {s.tool}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, color: s.review === 'reject' ? 'var(--color-error)' : s.review === 'edited' ? '#B45309' : '#047857' }}>
                  {s.review === 'reject' ? 'Rejected' : s.review === 'edited' ? 'Edited' : 'Approved'}
                </span>
              </div>
            ))}
          </div>
          <div><button type="button" className="btn-secondary" onClick={onOpenTrace}>See full trace</button></div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
