import React from 'react'
import type { CaseReport } from '../../api/types'

interface ReportViewProps {
  report: CaseReport
}

export const ReportView: React.FC<ReportViewProps> = ({ report }) => {
  return (
    <div className="space-y-5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm">
      <div className="flex items-center gap-2 border-b border-surface-container-low pb-3">
        <span className="material-symbols-outlined text-[20px] text-primary">description</span>
        <h3 className="font-headline-sm text-sm font-semibold text-on-surface">AI Synthesized Triage Dossier</h3>
        <span className="ml-auto text-[11px] font-mono-data bg-primary-fixed/30 text-primary px-2.5 py-0.5 rounded-full font-semibold border border-primary/20">
          Automated Synthesis
        </span>
      </div>

      {/* Summary on top */}
      <div className="rounded-lg bg-surface-container-low p-4 border border-outline-variant/20">
        <span className="text-[11px] font-bold uppercase tracking-wider text-secondary block mb-1">
          Executive Summary
        </span>
        <p className="text-sm text-on-surface leading-relaxed font-medium">{report.summary}</p>
      </div>

      {/* Likely Causes */}
      {report.likelyCauses && report.likelyCauses.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-secondary mb-2">
            <span className="material-symbols-outlined text-[16px] text-amber-600">lightbulb</span>
            <span>Likely Causes & Root Factors</span>
          </div>
          <ul className="space-y-1.5">
            {report.likelyCauses.map((cause, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-on-surface">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>{cause}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Policy References */}
      {report.policyRefs && report.policyRefs.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-secondary mb-2">
            <span className="material-symbols-outlined text-[16px] text-primary">gavel</span>
            <span>Applicable Regulatory & Compliance Directives</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {report.policyRefs.map((ref, idx) => (
              <span
                key={idx}
                className="inline-flex items-center rounded-md border border-outline-variant/40 bg-surface-container-low px-2.5 py-1 text-xs text-on-surface font-mono-data"
              >
                {ref}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Evidence Table */}
      {report.evidence && report.evidence.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-secondary mb-2">
            <span className="material-symbols-outlined text-[16px] text-primary">analytics</span>
            <span>Synthesized Audit Evidence</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-outline-variant/30">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-secondary font-semibold border-b border-surface-container">
                <tr>
                  <th className="py-2 px-3.5 w-1/3">Metric / Parameter</th>
                  <th className="py-2 px-3.5">Verified Finding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low font-body-sm text-on-surface">
                {report.evidence.map((ev, idx) => (
                  <tr key={idx} className="hover:bg-surface-container-low/40">
                    <td className="py-2 px-3.5 font-medium text-secondary">{ev.label}</td>
                    <td className="py-2 px-3.5 font-mono-data text-xs">{ev.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Suggested Next Step */}
      {report.recommendedNextStep && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-secondary mb-2">
            <span className="material-symbols-outlined text-[16px] text-emerald-600">check_box</span>
            <span>Recommended Next Action</span>
          </div>
          <div className="rounded-lg bg-emerald-50/60 border border-emerald-200/60 p-3 text-xs text-emerald-900 flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] text-emerald-600 mt-0.5 shrink-0">arrow_forward</span>
            <span className="font-medium leading-relaxed">{report.recommendedNextStep}</span>
          </div>
        </div>
      )}
    </div>
  )
}
