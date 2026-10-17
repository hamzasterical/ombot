import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { SubmitComplaintResponse } from '../api/types'
import { TierBadge } from '../components/common/TierBadge'

const DEMO_PRESETS = [
  {
    label: 'Critical: Unauthorized Transaction',
    customerId: 'CUST-88102',
    text: 'URGENT: Someone stole my debit card credentials and charged $3,200 to an offshore gaming site in Malta. I was asleep! Freeze this immediately!',
  },
  {
    label: 'Moderate: Failed Terminal Debit',
    customerId: 'CUST-49120',
    text: 'My $85.50 payment at the train station ticket machine failed with a "Network Timeout" error, but the funds were deducted from my checking account.',
  },
  {
    label: 'Low: ATM Fee Inquiry',
    customerId: 'CUST-31092',
    text: 'Why was I charged a $2.50 fee at the grocery store ATM yesterday? I believed my tier included free domestic ATM withdrawals.',
  },
  {
    label: 'Unknown: Algorithmic Vault Deficit',
    customerId: 'CUST-77401',
    text: 'Your AI smart budget feature auto-transferred $120 into a savings vault without my consent because it miscalculated my grocery average.',
  },
]

/* ── Inline styles for this page ─────────────────────── */
const S = {
  section: {
    background: 'var(--color-surface-bright)',
    border: '1px solid var(--color-outline)',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    boxShadow: 'var(--shadow-sm)',
  } as React.CSSProperties,
  label: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-on-surface)',
    display: 'block',
    marginBottom: '0.375rem',
  } as React.CSSProperties,
}

export const SubmitComplaint: React.FC = () => {
  const [customerId, setCustomerId] = useState('CUST-49210')
  const [complaintText, setComplaintText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<SubmitComplaintResponse | null>(null)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!complaintText.trim()) return
    setIsLoading(true)
    setError('')
    try {
      const response = await api.submitComplaint({
        customerId: customerId.trim() || 'CUST-GUEST',
        complaintText: complaintText.trim(),
      })
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit complaint')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => { setComplaintText(''); setResult(null) }
  const loadPreset = (p: (typeof DEMO_PRESETS)[0]) => { setCustomerId(p.customerId); setComplaintText(p.text); setResult(null) }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Page header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            padding: '2px 10px', borderRadius: 9999,
            background: 'var(--color-surface-container-low)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6875rem', fontWeight: 500,
            color: 'var(--color-secondary)',
            border: '1px solid var(--color-outline)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-on-tertiary-container)', display: 'inline-block', animation: 'pulse-dot 1.5s ease-in-out infinite' }} />
            INGESTION ENGINE V2.41
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: 'var(--color-secondary)' }}>
            LATENCY: 142ms
          </span>
        </div>
        <h1 style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: '1.75rem', fontWeight: 700,
          color: 'var(--color-on-surface)',
          margin: 0, letterSpacing: '-0.02em',
        }}>
          Submit Customer Complaint
        </h1>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', color: 'var(--color-secondary)', margin: 0, marginTop: '0.375rem' }}>
          Intake console with instantaneous AI classification, risk tier determination, and deterministic regulatory routing analysis.
        </p>
      </div>

      {/* Demo presets */}
      <div style={{
        ...S.section,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-outline)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-on-tertiary-container)' }}>bolt</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-on-surface)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Quick Test Presets
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {DEMO_PRESETS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => loadPreset(p)}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.8125rem', fontWeight: 500,
                color: 'var(--color-on-surface)',
                background: 'var(--color-surface-bright)',
                border: '1px solid var(--color-outline)',
                borderRadius: '0.5rem',
                padding: '0.375rem 0.875rem',
                cursor: 'pointer',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.borderColor = '#94A3B8' }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--color-outline)' }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Submission form */}
      <div style={S.section}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Customer ID */}
          <div>
            <label style={S.label}>Customer ID</label>
            <div style={{ position: 'relative', maxWidth: 320 }}>
              <span className="material-symbols-outlined" style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 16, color: 'var(--color-tertiary)',
              }}>person</span>
              <input
                type="text"
                required
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
                placeholder="e.g. CUST-90142"
                className="form-input"
                style={{ paddingLeft: '2.25rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem' }}
              />
            </div>
          </div>

          {/* Complaint text */}
          <div>
            <label style={S.label}>Customer Complaint Message <span style={{ color: 'var(--color-error)' }}>*</span></label>
            <textarea
              required
              rows={5}
              value={complaintText}
              onChange={e => setComplaintText(e.target.value)}
              placeholder="Paste raw incoming customer complaint text here…"
              style={{
                width: '100%', borderRadius: '0.5rem',
                border: '1px solid var(--color-outline)',
                background: 'var(--color-surface)',
                padding: '0.75rem',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.9375rem',
                color: 'var(--color-on-surface)',
                resize: 'vertical', outline: 'none',
                transition: 'border-color 0.15s',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--color-on-tertiary-container)'; e.target.style.boxShadow = '0 0 0 2px rgba(5,150,105,0.15)' }}
              onBlur={e => { e.target.style.borderColor = 'var(--color-outline)'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.75rem', borderRadius: '0.5rem',
              background: 'var(--color-error-container)',
              border: '1px solid var(--color-error-border)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-error)', flexShrink: 0 }}>error</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-error)' }}>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '0.25rem' }}>
            <button
              type="submit"
              disabled={isLoading || !complaintText.trim()}
              className="btn-primary"
              style={{ paddingLeft: '1.25rem', paddingRight: '1.25rem' }}
            >
              {isLoading ? (
                <>
                  <span style={{ width: 14, height: 14, border: '2px solid #FFFFFF', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                  Classifying with AI Model…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span>
                  Classify &amp; Route Complaint
                </>
              )}
            </button>

            {(complaintText || result) && (
              <button
                type="button"
                onClick={handleReset}
                className="btn-secondary"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                Reset Form
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Classification result */}
      {result && (
        <div style={{
          ...S.section,
          border: '2px solid var(--color-on-tertiary-container)',
          animation: 'fadeSlideIn 0.2s ease-out',
          display: 'flex', flexDirection: 'column', gap: '1.25rem',
        }}>
          {/* Result header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingBottom: '1rem', borderBottom: '1px solid var(--color-outline-variant)',
            flexWrap: 'wrap', gap: '0.75rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--color-tertiary-container)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--color-on-tertiary-container)' }}>task_alt</span>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
                    Triage Classification Complete
                  </span>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.75rem', fontWeight: 700,
                    color: 'var(--color-on-tertiary-container)',
                    background: 'var(--color-tertiary-container)',
                    border: '1px solid #A7F3D0',
                    padding: '1px 8px', borderRadius: 4,
                  }}>
                    {result.case.id}
                  </span>
                </div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', color: 'var(--color-secondary)', margin: 0 }}>
                  Evaluated in 450ms • Risk &amp; Taxonomy Engine v3
                </p>
              </div>
            </div>
            <TierBadge tier={result.unknownCategory ? 'unknown' : result.tier} size="lg" />
          </div>

          {/* Matched categories */}
          <div>
            <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-tertiary)', margin: 0, marginBottom: '0.75rem' }}>
              Matched Categories &amp; Confidence Score
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {result.matchedCategories.map((cat, idx) => (
                <div key={idx} style={{
                  borderRadius: '0.5rem',
                  border: '1px solid var(--color-outline)',
                  background: 'var(--color-surface)',
                  padding: '1rem',
                  display: 'flex', flexDirection: 'column', gap: '0.5rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
                      {cat.categoryName || cat.categoryId}
                    </span>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.75rem', fontWeight: 700,
                      color: 'var(--color-on-tertiary-container)',
                      background: 'var(--color-tertiary-container)',
                      padding: '2px 8px', borderRadius: 4,
                    }}>
                      {(cat.confidence * 100).toFixed(1)}% Confidence
                    </span>
                  </div>
                  <div style={{ height: 6, width: '100%', borderRadius: 9999, background: 'var(--color-outline)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 9999,
                      transition: 'width 0.5s ease',
                      background: result.tier === 'critical' ? '#DC2626' : result.tier === 'moderate' ? '#B45309' : 'var(--color-on-tertiary-container)',
                      width: `${Math.min(100, cat.confidence * 100)}%`,
                    }} />
                  </div>
                  {cat.supportingQuote && (
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                      padding: '0.625rem 0.75rem',
                      background: 'var(--color-surface-bright)',
                      border: '1px solid var(--color-outline-variant)',
                      borderRadius: '0.375rem',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--color-tertiary)', flexShrink: 0, marginTop: 2 }}>format_quote</span>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, fontStyle: 'italic' }}>
                        <strong style={{ fontStyle: 'normal', color: 'var(--color-on-surface)', fontWeight: 600 }}>Evidence: </strong>
                        &ldquo;{cat.supportingQuote}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Queue routing */}
          <div style={{
            padding: '1rem 1.25rem',
            borderRadius: '0.5rem',
            background: 'var(--color-tertiary-container)',
            border: '1px solid #A7F3D0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem',
          }}>
            <div>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#065F46', display: 'block' }}>
                Assigned Queue Destination
              </span>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: 0, marginTop: 2 }}>
                {result.queue}
              </p>
            </div>
            <Link
              to={`/cases/${result.case.id}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 1rem', borderRadius: '0.5rem',
                background: 'var(--color-on-tertiary-container)',
                color: '#FFFFFF',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.8125rem', fontWeight: 600,
                textDecoration: 'none',
                transition: 'background 0.15s',
              }}
            >
              View Full Case Details
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
            </Link>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
