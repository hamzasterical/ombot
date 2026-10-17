import React, { useState } from 'react'
import type { ToolTraceStep } from '../../api/types'
import { Terminal, ChevronDown, ChevronRight, CheckCircle2, Clock, Sparkles } from 'lucide-react'

interface ToolTraceTimelineProps {
  trace: ToolTraceStep[]
  isStreaming?: boolean
  onTriggerSimulate?: () => void
}

export const ToolTraceTimeline: React.FC<ToolTraceTimelineProps> = ({
  trace,
  isStreaming = false,
  onTriggerSimulate,
}) => {
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({ 1: true, 2: true })

  const toggleStep = (stepNum: number) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepNum]: !prev[stepNum],
    }))
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-purple-600" />
          <h3 className="font-semibold text-slate-900 text-base">Agent Tool-Call Trace</h3>
          <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-mono">
            {trace.length} {trace.length === 1 ? 'step' : 'steps'}
          </span>
        </div>

        {isStreaming && (
          <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full animate-pulse">
            <span className="h-2 w-2 rounded-full bg-indigo-600" />
            <span>SSE Streaming Active</span>
          </div>
        )}

        {!isStreaming && onTriggerSimulate && trace.length === 0 && (
          <button
            onClick={onTriggerSimulate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition"
          >
            <Sparkles size={13} />
            <span>Simulate Agent Run</span>
          </button>
        )}
      </div>

      {trace.length === 0 && !isStreaming ? (
        <div className="py-8 text-center text-xs text-slate-500 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
          <Clock size={20} className="mx-auto mb-1.5 text-slate-400" />
          No tool calls executed yet. Agent has not been triggered on this case.
        </div>
      ) : (
        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
          {trace.map((step) => {
            const isExpanded = !!expandedSteps[step.step]
            return (
              <div key={step.step} className="relative group">
                {/* Step indicator dot */}
                <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white border-2 border-indigo-500 text-[10px] font-bold text-indigo-700 shadow-sm">
                  {step.step}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 hover:border-slate-300 transition">
                  <div
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => toggleStep(step.step)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded border border-indigo-200">
                        {step.tool}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600 text-xs flex items-center gap-1 font-medium">
                        <CheckCircle2 size={13} />
                        Success
                      </span>
                      {isExpanded ? (
                        <ChevronDown size={14} className="text-slate-400" />
                      ) : (
                        <ChevronRight size={14} className="text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 pt-2 border-t border-slate-200 text-xs">
                      <div>
                        <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                          Inputs / Arguments:
                        </span>
                        <pre className="rounded-lg bg-slate-900 p-2 text-[11px] font-mono text-emerald-400 overflow-x-auto">
                          {typeof step.args === 'string'
                            ? step.args
                            : JSON.stringify(step.args, null, 2)}
                        </pre>
                      </div>

                      <div>
                        <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                          Output / Result:
                        </span>
                        <pre className="rounded-lg bg-slate-900 p-2 text-[11px] font-mono text-cyan-300 overflow-x-auto">
                          {typeof step.result === 'string'
                            ? step.result
                            : JSON.stringify(step.result, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {isStreaming && (
            <div className="relative">
              <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm animate-ping">
                <span className="h-2 w-2 rounded-full bg-white" />
              </div>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 text-xs text-indigo-700 flex items-center gap-2">
                <span className="animate-spin h-3.5 w-3.5 border-2 border-indigo-600 border-t-transparent rounded-full" />
                <span>Agent executing next step...</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
