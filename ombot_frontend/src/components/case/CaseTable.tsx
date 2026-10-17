import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Case } from '../../api/types'
import { StatusPill } from '../common/StatusPill'
import { TierBadge } from '../common/TierBadge'
import { EmptyState } from '../common/EmptyState'
import { WorkflowBadge, WorkflowFilter, useWorkflowFilter, workflowOf } from '../common/WorkflowBadge'

interface CaseTableProps {
  cases: Case[]
  isLoading?: boolean
  showTier?: boolean
  title?: string
}

export const CaseTable: React.FC<CaseTableProps> = ({
  cases,
  isLoading = false,
  showTier = false,
  title,
}) => {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  // Get unique categories for quick filter chips
  const categoriesList = Array.from(
    new Set(
      cases
        .map((c) => c.categories[0]?.categoryName || c.categories[0]?.categoryId)
        .filter(Boolean) as string[]
    )
  )

  const wf = useWorkflowFilter(cases, workflowOf)

  const filteredCases = wf.filtered.filter((c) => {
    const matchesSearch =
      !searchTerm ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.customerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.complaintText.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.categories.some((cat) => cat.categoryName?.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesCategory =
      categoryFilter === 'all' ||
      c.categories.some(
        (cat) =>
          cat.categoryName === categoryFilter || cat.categoryId === categoryFilter
      )

    return matchesSearch && matchesCategory
  })

  if (!isLoading && cases.length === 0) {
    return <EmptyState title="No complaints in this queue" />
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
      {/* Optional Title */}
      {title && (
        <div className="px-4 pt-3.5 pb-1 border-b border-surface-container-low">
          <h2 className="font-headline-sm text-sm font-bold text-on-surface">{title}</h2>
        </div>
      )}

      {/* Filter & Search Toolbar */}
      <div className="p-4 bg-surface-container-lowest flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-surface-container-low">
        {/* Search Input */}
        <div className="relative w-full xl:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
            <span className="material-symbols-outlined text-[20px]">search</span>
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Case ID, Customer ID, or keyword..."
            className="w-full h-[40px] pl-10 pr-4 rounded-lg bg-surface-container-low text-on-surface font-body-md text-sm placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest border border-transparent focus:border-primary transition-all shadow-xs"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-secondary hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

        {/* Filter Chips & Total count */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`h-8 px-3.5 rounded-full font-label-sm text-xs flex items-center gap-1.5 transition-all shadow-xs ${
              categoryFilter === 'all'
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span>All ({cases.length})</span>
          </button>

          {categoriesList.slice(0, 3).map((cat) => {
            const count = cases.filter(
              (c) =>
                c.categories[0]?.categoryName === cat ||
                c.categories[0]?.categoryId === cat
            ).length
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)}
                className={`h-8 px-3.5 rounded-full font-label-sm text-xs flex items-center gap-1.5 transition-all ${
                  categoryFilter === cat
                    ? 'bg-primary text-on-primary font-semibold'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                <span className="capitalize">{cat.replace(/_/g, ' ')}</span>
                <span className="text-[11px] opacity-75">({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Case state filter: any combination, none selected = all */}
      <div className="px-4 py-3 border-b border-surface-container-low">
        <WorkflowFilter selected={wf.selected} counts={wf.counts} onToggle={wf.toggle} onClear={wf.clear} />
      </div>

      {/* Row Context Banner */}
      <div className="px-4 py-2 bg-surface-container-low/60 flex items-center justify-between text-secondary border-b border-surface-container-low">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[17px] text-surface-tint">info</span>
          <span className="font-body-sm text-xs text-on-surface-variant">
            Clicking any row opens the dual-column Case Detail view with regulatory traces & tool timeline.
          </span>
        </div>
        <span className="font-mono-data-sm text-[11px] text-secondary">
          Showing {filteredCases.length} of {cases.length} entries
        </span>
      </div>

      {/* High Precision Data Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="h-11 bg-surface-container-low font-label-sm text-[11px] uppercase tracking-wider text-secondary select-none border-b border-outline-variant/20">
              <th className="py-2.5 px-4 font-semibold" scope="col">Case ID</th>
              <th className="py-2.5 px-4 font-semibold" scope="col">Customer</th>
              {showTier && <th className="py-2.5 px-4 font-semibold" scope="col">Risk Tier</th>}
              <th className="py-2.5 px-4 font-semibold" scope="col">Category</th>
              <th className="py-2.5 px-4 font-semibold text-center" scope="col">AI Confidence</th>
              <th className="py-2.5 px-4 font-semibold" scope="col">Received</th>
              <th className="py-2.5 px-4 font-semibold" scope="col">State</th>
              <th className="py-2.5 px-4 font-semibold" scope="col">Status</th>
              <th className="py-2.5 px-4 font-semibold text-right" scope="col">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container-low font-body-md text-sm text-on-surface">
            {filteredCases.map((c) => {
              const primaryCat = c.categories[0]
              const confidence = primaryCat?.confidence ? Math.round(primaryCat.confidence * 100) : null
              const isUrgent = c.tier === 'critical'

              return (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="h-14 hover:bg-surface-container-low/70 transition-colors cursor-pointer group"
                >
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isUrgent ? 'bg-error animate-pulse' : 'bg-surface-tint'
                        }`}
                      />
                      <span className="font-mono-data text-xs font-bold text-primary group-hover:underline">
                        #{c.id}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-on-surface">
                        {c.customerId}
                      </span>
                      <span className="font-mono-data-sm text-[11px] text-secondary">
                        Account Holder
                      </span>
                    </div>
                  </td>
                  {showTier && (
                    <td className="py-3 px-4 whitespace-nowrap">
                      <TierBadge tier={c.unknownCategory ? 'unknown' : c.tier} size="sm" />
                    </td>
                  )}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-mono-data-sm text-[11px] px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">
                      {primaryCat?.categoryName || primaryCat?.categoryId || 'Unknown Category'}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-center">
                    {confidence !== null ? (
                      <div className="inline-flex items-center gap-1.5">
                        <div className="w-14 bg-surface-container-high rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${
                              confidence >= 80
                                ? 'bg-emerald-500'
                                : confidence >= 60
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${confidence}%` }}
                          />
                        </div>
                        <span className="font-mono-data text-xs font-medium text-secondary">
                          {confidence}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-secondary text-xs">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap font-mono-data-sm text-xs text-secondary">
                    {new Date(c.receivedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <WorkflowBadge workflow={workflowOf(c)} />
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-right">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-low group-hover:bg-primary group-hover:text-on-primary transition-all text-xs font-semibold text-primary shadow-2xs">
                      Investigate
                      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filteredCases.length === 0 && (
        <div className="p-8 text-center text-xs text-secondary">
          No complaints matching filter criteria.
        </div>
      )}
    </div>
  )
}
