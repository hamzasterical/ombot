import React from 'react'
import type { CaseReport } from '../../api/types'
import { FileText, Lightbulb, Scale, Table, CheckSquare } from 'lucide-react'

interface ReportViewProps {
  report: CaseReport
}

export const ReportView: React.FC<ReportViewProps> = ({ report }) => {
  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <FileText size={18} className="text-blue-600" />
        <h3 className="font-semibold text-slate-900 text-base">AI Prepared Triage Report</h3>
        <span className="ml-auto text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
          Automated Synthesis
        </span>
      </div>

      {/* Summary on top */}
      <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
          Executive Summary
        </span>
        <p className="text-sm text-slate-800 leading-relaxed font-medium">{report.summary}</p>
      </div>

      {/* Likely Causes */}
      {report.likelyCauses && report.likelyCauses.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            <Lightbulb size={14} className="text-amber-500" />
            <span>Likely Causes & Root Factors</span>
          </div>
          <ul className="space-y-1.5">
            {report.likelyCauses.map((cause, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-slate-700">
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
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            <Scale size={14} className="text-indigo-500" />
            <span>Applicable Policy & Regulatory Directives</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {report.policyRefs.map((ref, idx) => (
              <span
                key={idx}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100/80 px-2.5 py-1 text-xs text-slate-700 font-mono"
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
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            <Table size={14} className="text-blue-500" />
            <span>Synthesized Evidence</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3.5 w-1/3">Metric / Parameter</th>
                  <th className="py-2 px-3.5">Verified Finding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {report.evidence.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-2 px-3.5 font-medium text-slate-600">{item.label}</td>
                    <td className="py-2 px-3.5 font-mono text-slate-900">{item.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recommended Next Step */}
      {report.recommendedNextStep && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-900 mb-1">
            <CheckSquare size={14} className="text-blue-600" />
            <span>Recommended Human Action</span>
          </div>
          <p className="text-xs text-blue-950 font-medium leading-relaxed">{report.recommendedNextStep}</p>
        </div>
      )}
    </div>
  )
}
