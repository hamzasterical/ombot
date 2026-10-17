import React from 'react'
import type { CaseStatus } from '../../api/types'
import { Clock, Bot, AlertCircle, CheckCircle, Send, Play } from 'lucide-react'

interface StatusPillProps {
  status: CaseStatus
}

export const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  switch (status) {
    case 'new':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          New
        </span>
      )
    case 'awaiting_human':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-800 border border-orange-200">
          <Clock size={12} className="text-orange-600" />
          Awaiting Human
        </span>
      )
    case 'delegated':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700 border border-purple-200">
          <Bot size={12} className="text-purple-600" />
          Delegated to AI
        </span>
      )
    case 'agent_running':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 border border-indigo-200">
          <Play size={12} className="text-indigo-600 animate-spin" />
          Agent Running
        </span>
      )
    case 'awaiting_approval':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-800 border border-rose-200">
          <AlertCircle size={12} className="text-rose-600" />
          Awaiting Approval
        </span>
      )
    case 'resolved':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200">
          <CheckCircle size={12} className="text-emerald-600" />
          Resolved
        </span>
      )
    case 'auto_replied':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800 border border-teal-200">
          <Send size={12} className="text-teal-600" />
          Auto-Replied
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
          {status}
        </span>
      )
  }
}
