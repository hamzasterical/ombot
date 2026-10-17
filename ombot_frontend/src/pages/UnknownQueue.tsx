import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Tier } from '../api/types'
import { CreateCategoryModal } from '../components/category/CreateCategoryModal'
import { EmptyState } from '../components/common/EmptyState'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'

export const UnknownQueue: React.FC = () => {
  const queryClient = useQueryClient()
  const [selectedMapping, setSelectedMapping] = useState<Record<string, string>>({})
  const [modalCaseId, setModalCaseId] = useState<string | null>(null)

  const { data: cases = [], isLoading, error } = useQuery({
    queryKey: ['cases', 'unknown'],
    queryFn: () => api.getCases('unknown'),
    refetchInterval: 5000,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  })

  const mapMutation = useMutation({
    mutationFn: async ({ caseId, categoryId }: { caseId: string; categoryId: string }) =>
      api.recordDecision(caseId, { action: 'map_category', payload: { categoryId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
      queryClient.invalidateQueries({ queryKey: ['metrics'] })
    },
  })

  const createCategoryMutation = useMutation({
    mutationFn: async ({ caseId, category }: { caseId: string; category: { id: string; name: string; tier: Tier; description: string } }) =>
      api.recordDecision(caseId, { action: 'create_category', payload: { category } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
      queryClient.invalidateQueries({ queryKey: ['metrics'] })
    },
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
              background: 'var(--color-info-container)', border: '1px solid var(--color-info-border)',
              fontFamily: "'DM Sans', sans-serif", fontSize: '0.6875rem', fontWeight: 600,
              color: 'var(--color-info)', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-info)', display: 'inline-block' }} />
              Human-in-the-Loop Feedback
            </span>
          </div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.02em' }}>
            Unknown Category Queue
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', color: 'var(--color-secondary)', margin: 0, marginTop: '0.375rem' }}>
            Complaints that did not confidently match any declared taxonomy. Map to an existing category or create a new category to teach the AI triage model.
          </p>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1rem', background: 'var(--color-info-container)', border: '1px solid var(--color-info-border)', borderRadius: '0.5rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-info)' }}>book</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-info)' }}>Taxonomy refinement queue</span>
        </div>
      </section>

      {/* Learning loop banner */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
        padding: '1rem 1.25rem', borderRadius: '0.75rem',
        background: 'linear-gradient(to right, #F0F9FF, #FFFFFF, #F0F9FF)',
        border: '1px solid var(--color-info-border)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--color-info)', flexShrink: 0, marginTop: 1 }}>auto_awesome</span>
        <div>
          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-on-surface)', display: 'block', marginBottom: 4 }}>Continuous Learning System Active</span>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.55 }}>
            When you map an unclassified complaint or register a new category, Ombot feeds the exemplar back into the embedding index. Subsequent complaints with similar semantic intent are automatically recognized without human intervention.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', borderRadius: '0.5rem', background: 'var(--color-error-container)', border: '1px solid var(--color-error-border)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-error)', flexShrink: 0 }}>error</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-error)' }}>Failed to load unknown category queue: {(error as Error).message}</span>
        </div>
      )}

      {isLoading ? (
        <LoadingSkeleton type="card" />
      ) : cases.length === 0 ? (
        <EmptyState title="Unknown Category Queue is Empty" description="All incoming customer complaints have been mapped to established categories." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {cases.map(c => {
            const currentSelectedCat = selectedMapping[c.id] || categories[0]?.id || ''

            return (
              <div key={c.id} style={{
                background: 'var(--color-surface-bright)',
                border: '1px solid var(--color-outline)',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex', flexDirection: 'column', gap: '1rem',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', fontWeight: 700,
                      color: 'var(--color-info)',
                      background: 'var(--color-info-container)',
                      border: '1px solid var(--color-info-border)',
                      padding: '1px 8px', borderRadius: 4,
                    }}>{c.id}</span>
                    <span style={{ color: 'var(--color-outline)', fontSize: '0.75rem' }}>•</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-secondary)', fontWeight: 500 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>person</span>
                      {c.customerId}
                    </span>
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 10px', borderRadius: 9999,
                    fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 600,
                    color: 'var(--color-info)',
                    background: 'var(--color-info-container)',
                    border: '1px solid var(--color-info-border)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>help</span>
                    Unmatched Pattern
                  </span>
                </div>

                {/* Complaint text */}
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)', borderRadius: '0.5rem', padding: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-tertiary)', flexShrink: 0, marginTop: 2 }}>format_quote</span>
                  <div>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 4 }}>Customer Complaint</span>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
                      {c.complaintText}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-outline-variant)' }}>
                  {/* Map to existing */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.625rem', flex: 1 }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)', flexShrink: 0 }}>(a) Map to Existing:</span>
                    <select
                      value={currentSelectedCat}
                      onChange={e => setSelectedMapping(prev => ({ ...prev, [c.id]: e.target.value }))}
                      style={{
                        height: 36, padding: '0 0.75rem', borderRadius: '0.5rem',
                        border: '1px solid var(--color-outline)',
                        background: 'var(--color-surface)',
                        fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem',
                        color: 'var(--color-on-surface)', outline: 'none', minWidth: 200,
                      }}
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name} ({cat.tier.toUpperCase()})</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={mapMutation.isPending}
                      onClick={() => mapMutation.mutate({ caseId: c.id, categoryId: currentSelectedCat })}
                      className="btn-primary"
                    >
                      Assign
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
                    </button>
                  </div>

                  {/* Create new */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-tertiary)' }}>or</span>
                    <button
                      type="button"
                      onClick={() => setModalCaseId(c.id)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                        height: 36, padding: '0 1rem', borderRadius: '0.5rem',
                        background: 'var(--color-info-container)',
                        border: '1px solid var(--color-info-border)',
                        color: 'var(--color-info)',
                        fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600,
                        cursor: 'pointer', transition: 'background 0.15s',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span>
                      (b) Create New Category
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CreateCategoryModal
        isOpen={!!modalCaseId}
        caseId={modalCaseId || undefined}
        onClose={() => setModalCaseId(null)}
        onSubmit={(category) => {
          if (modalCaseId) createCategoryMutation.mutate({ caseId: modalCaseId, category })
        }}
      />
    </div>
  )
}
