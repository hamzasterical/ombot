import React from 'react'
import type { CaseStatus } from '../../api/types'

interface StatusPillProps {
  status: CaseStatus
}

export const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  switch (status) {
    case 'processing':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-secondary">
          <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
          Processing
        </span>
      )
    case 'new':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-0.5 text-xs font-semibold text-on-surface">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          New
        </span>
      )
    case 'awaiting_human':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-error-container/60 px-2.5 py-0.5 text-xs font-semibold text-on-error-container">
          <span className="material-symbols-outlined text-[13px] text-error">timer</span>
          Awaiting Human
        </span>
      )
    case 'delegated':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container/60 px-2.5 py-0.5 text-xs font-semibold text-on-secondary-container">
          <span className="material-symbols-outlined text-[13px]">smart_toy</span>
          Delegated to AI
        </span>
      )
    case 'agent_running':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-fixed/40 px-2.5 py-0.5 text-xs font-semibold text-primary">
          <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>
          Agent Running
        </span>
      )
    case 'awaiting_approval':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 border border-amber-300">
          <span className="material-symbols-outlined text-[13px] text-amber-700">warning</span>
          Awaiting Approval
        </span>
      )
    case 'resolved':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-300">
          <span className="material-symbols-outlined text-[13px] text-emerald-600">check_circle</span>
          Resolved
        </span>
      )
    case 'auto_replied':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800 border border-teal-300">
          <span className="material-symbols-outlined text-[13px] text-teal-600">send</span>
          Auto-Replied
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-medium text-secondary">
          {status}
        </span>
      )
  }
}
