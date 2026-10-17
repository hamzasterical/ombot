import React, { useState } from 'react'
import type { ToolTraceStep } from '../../api/types'

interface ToolTraceTimelineProps {
  trace: ToolTraceStep[]
  isStreaming?: boolean
  // Shown while the trace is empty, e.g. "Run agent automatically"
  action?: { label: string; icon?: string; onClick: () => void; disabled?: boolean }
}

const REVIEW_BADGE: Record<NonNullable<ToolTraceStep['review']>, { label: string; icon: string; cls: string }> = {
  approve: { label: 'Approved by reviewer', icon: 'how_to_reg', cls: 'text-emerald-700' },
  edited: { label: 'Edited by reviewer', icon: 'edit_note', cls: 'text-amber-700' },
  reject: { label: 'Rejected by reviewer', icon: 'block', cls: 'text-red-700' },
}

export const ToolTraceTimeline: React.FC<ToolTraceTimelineProps> = ({
  trace,
  isStreaming = false,
  action,
}) => {
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({ 1: true, 2: true })

  const toggleStep = (stepNum: number) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepNum]: !prev[stepNum],
    }))
  }

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-surface-container-low pb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-primary">terminal</span>
          <h3 className="font-headline-sm text-sm font-semibold text-on-surface">Agent Tool-Execution Trace</h3>
          <span className="text-[11px] bg-surface-container text-on-surface-variant px-2.5 py-0.5 rounded-full font-mono-data font-semibold">
            {trace.length} {trace.length === 1 ? 'step' : 'steps'}
          </span>
        </div>

        {isStreaming && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary-fixed/30 border border-primary/30 px-3 py-1 rounded-full animate-pulse">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span>SSE Streaming Active</span>
          </div>
        )}

        {!isStreaming && action && trace.length === 0 && (
          <button
            onClick={action.onClick}
            disabled={action.disabled}
            className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-high px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-primary hover:text-on-primary transition-all shadow-xs disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[15px]">{action.icon ?? 'play_arrow'}</span>
            <span>{action.label}</span>
          </button>
        )}
      </div>

      {trace.length === 0 && !isStreaming ? (
        <div className="py-8 text-center text-xs text-secondary bg-surface-container-low/40 rounded-xl border border-dashed border-outline-variant/40">
          <span className="material-symbols-outlined text-[28px] text-secondary/60 block mb-1">history</span>
          No tool calls executed yet. Agent has not been triggered on this case.
        </div>
      ) : (
        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-surface-container-high">
          {trace.map((step) => {
            const isExpanded = !!expandedSteps[step.step]
            return (
              <div key={step.step} className="relative group">
                {/* Step indicator dot */}
                <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface-container-lowest border-2 border-primary text-[10px] font-bold text-primary shadow-xs">
                  {step.step}
                </div>

                <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low/50 p-3.5 hover:border-outline-variant transition-colors">
                  <div
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => toggleStep(step.step)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono-data text-xs font-semibold text-primary bg-primary-fixed/30 px-2 py-0.5 rounded border border-primary/20">
                        {step.tool}
                      </span>
                      <span className="text-[11px] text-secondary font-mono-data">
                        {new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {step.review ? (
                        <span className={`${REVIEW_BADGE[step.review].cls} text-xs flex items-center gap-1 font-semibold`}>
                          <span className="material-symbols-outlined text-[15px]">{REVIEW_BADGE[step.review].icon}</span>
                          {REVIEW_BADGE[step.review].label}
                        </span>
                      ) : (
                        <span className="text-secondary text-xs flex items-center gap-1 font-semibold">
                          <span className="material-symbols-outlined text-[15px]">smart_toy</span>
                          Ran automatically
                        </span>
                      )}
                      <span className="material-symbols-outlined text-[16px] text-secondary">
                        {isExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 pt-2 border-t border-surface-container text-xs">
                      <div>
                        <span className="text-[11px] font-semibold text-secondary block mb-1">
                          Inputs / Arguments:
                        </span>
                        <pre className="rounded-lg bg-surface-container-lowest border border-outline-variant/30 p-2.5 text-[11px] font-mono-data text-on-surface overflow-x-auto">
                          {typeof step.args === 'string'
                            ? step.args
                            : JSON.stringify(step.args, null, 2)}
                        </pre>
                      </div>

                      <div>
                        <span className="text-[11px] font-semibold text-secondary block mb-1">
                          Output / Result:
                        </span>
                        <pre className="rounded-lg bg-surface-container-lowest border border-outline-variant/30 p-2.5 text-[11px] font-mono-data text-emerald-700 overflow-x-auto">
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
              <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-on-primary shadow-xs animate-ping">
                <span className="h-2 w-2 rounded-full bg-on-primary" />
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary-fixed/20 p-3 text-xs text-primary flex items-center gap-2 font-medium">
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                <span>Agent executing next step...</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
