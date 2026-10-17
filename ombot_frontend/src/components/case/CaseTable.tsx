import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Case } from '../../api/types'
import { StatusPill } from '../common/StatusPill'
import { TierBadge } from '../common/TierBadge'
import { EmptyState } from '../common/EmptyState'
import { ArrowUpRight, Search, Clock, User } from 'lucide-react'

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

  const filteredCases = cases.filter((c) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      c.id.toLowerCase().includes(term) ||
      c.customerId.toLowerCase().includes(term) ||
      c.complaintText.toLowerCase().includes(term) ||
      c.categories.some((cat) => cat.categoryName?.toLowerCase().includes(term))
    )
  })

  if (!isLoading && cases.length === 0) {
    return <EmptyState title="No complaints in this queue" />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {title && <h3 className="font-bold text-slate-800 text-lg">{title}</h3>}
        <div className="relative flex-1 sm:max-w-xs ml-auto">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter by case, customer, category..."
            className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Case ID</th>
                <th className="py-3 px-4">Customer</th>
                {showTier && <th className="py-3 px-4">Tier</th>}
                <th className="py-3 px-4">Primary Category</th>
                <th className="py-3 px-4">Received</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCases.map((c) => {
                const primaryCat = c.categories[0]
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/cases/${c.id}`)}
                    className="cursor-pointer hover:bg-slate-50/80 transition group"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-600 group-hover:underline">
                      {c.id}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-medium text-slate-800">
                        <User size={13} className="text-slate-400" />
                        <span>{c.customerId}</span>
                      </div>
                    </td>
                    {showTier && (
                      <td className="py-3.5 px-4">
                        <TierBadge tier={c.unknownCategory ? 'unknown' : c.tier} size="sm" />
                      </td>
                    )}
                    <td className="py-3.5 px-4">
                      <span className="font-medium text-slate-700">
                        {primaryCat?.categoryName || primaryCat?.categoryId || 'Unknown Category'}
                      </span>
                      {primaryCat?.confidence && (
                        <span className="ml-1.5 text-[10px] text-slate-400 font-mono">
                          ({(primaryCat.confidence * 100).toFixed(0)}%)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Clock size={12} className="text-slate-400" />
                        <span>{new Date(c.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusPill status={c.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex items-center gap-1 font-semibold text-blue-600 group-hover:text-blue-700 text-xs">
                        Open
                        <ArrowUpRight size={13} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filteredCases.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-500">
            No complaints matching &quot;{searchTerm}&quot;
          </div>
        )}
      </div>
    </div>
  )
}
