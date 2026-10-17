import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Category, Tier } from '../api/types'
import { TierBadge } from '../components/common/TierBadge'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'
import { EmptyState } from '../components/common/EmptyState'

export const CategoriesPage: React.FC = () => {
  const [tierFilter, setTierFilter] = useState<'all' | Tier>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const { data: categories = [], isLoading, error } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  })

  const seedCount = categories.filter(c => c.source === 'seed').length
  const humanAddedCount = categories.filter(c => c.source === 'human_added').length

  const filteredCategories = categories.filter((c: Category) => {
    if (tierFilter !== 'all' && c.tier !== tierFilter) return false
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return c.name.toLowerCase().includes(term) || c.id.toLowerCase().includes(term) || c.description.toLowerCase().includes(term)
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
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.02em' }}>
            Taxonomy &amp; Category Registry
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9375rem', color: 'var(--color-secondary)', margin: 0, marginTop: '0.375rem' }}>
            Read-only registry of the 10 fixed baseline seed categories plus dynamic categories learned through human operator feedback in the Unknown queue.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.375rem 0.875rem', background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline)', borderRadius: '0.5rem', boxShadow: 'var(--shadow-sm)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--color-tertiary)' }}>database</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>{seedCount} Seeded</span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.375rem 0.875rem', background: 'var(--color-info-container)', border: `1px solid var(--color-info-border)`, borderRadius: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--color-info)' }}>auto_awesome</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-info)' }}>{humanAddedCount} Learned (Human Added)</span>
          </div>
        </div>
      </section>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-tertiary)' }}>filter_list</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-secondary)' }}>Filter Tier:</span>
          {(['all', 'critical', 'moderate', 'low'] as const).map(t => (
            <button key={t} onClick={() => setTierFilter(t)} style={chipStyle(tierFilter === t)}>{t}</button>
          ))}
        </div>

        <div style={{ position: 'relative', minWidth: 280 }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--color-tertiary)' }}>search</span>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search category name, id, description…"
            className="form-input"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', borderRadius: '0.5rem', background: 'var(--color-error-container)', border: '1px solid var(--color-error-border)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-error)', flexShrink: 0 }}>error</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-error)' }}>Failed to load categories: {(error as Error).message}</span>
        </div>
      )}

      {isLoading ? (
        <LoadingSkeleton type="table" />
      ) : filteredCategories.length === 0 ? (
        <EmptyState title="No categories found" description="Try adjusting your filter or search criteria." />
      ) : (
        <div style={{ background: 'var(--color-surface-bright)', border: '1px solid var(--color-outline)', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category Name</th>
                  <th>Identifier (Key)</th>
                  <th>Risk Tier</th>
                  <th>Origin Source</th>
                  <th>Description &amp; Scope</th>
                </tr>
              </thead>
              <tbody>
                {filteredCategories.map((cat: Category) => {
                  const isHumanAdded = cat.source === 'human_added'
                  return (
                    <tr key={cat.id}>
                      <td>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)', whiteSpace: 'nowrap' }}>
                          {cat.name}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: 'var(--color-secondary)', whiteSpace: 'nowrap' }}>
                          {cat.id}
                        </span>
                      </td>
                      <td><TierBadge tier={cat.tier} size="sm" /></td>
                      <td>
                        {isHumanAdded ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 9999,
                            background: 'var(--color-info-container)',
                            border: '1px solid var(--color-info-border)',
                            fontFamily: "'DM Sans', sans-serif", fontSize: '0.6875rem', fontWeight: 700,
                            color: 'var(--color-info)',
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>auto_awesome</span>
                            human_added
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 9999,
                            background: 'var(--color-surface-container-low)',
                            border: '1px solid var(--color-outline)',
                            fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', fontWeight: 500,
                            color: 'var(--color-secondary)',
                          }}>
                            seed
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', display: 'block', maxWidth: 480, lineHeight: 1.5 }}>
                          {cat.description}
                        </span>
                      </td>
                    </tr>
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
