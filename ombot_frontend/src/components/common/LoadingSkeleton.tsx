import React from 'react'

export const LoadingSkeleton: React.FC<{ type?: 'table' | 'card' | 'detail' | 'stats' }> = ({
  type = 'table',
}) => {
  if (type === 'stats') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-slate-200/70 p-4" />
        ))}
      </div>
    )
  }

  if (type === 'card') {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex justify-between">
              <div className="h-5 w-32 rounded bg-slate-200" />
              <div className="h-5 w-24 rounded-full bg-slate-200" />
            </div>
            <div className="h-4 w-3/4 rounded bg-slate-200" />
            <div className="h-4 w-1/2 rounded bg-slate-200" />
            <div className="flex gap-3 pt-2">
              <div className="h-9 w-32 rounded-lg bg-slate-200" />
              <div className="h-9 w-36 rounded-lg bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (type === 'detail') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="h-6 w-1/3 rounded bg-slate-200" />
          <div className="h-24 rounded bg-slate-100" />
          <div className="h-6 w-1/4 rounded bg-slate-200" />
          <div className="h-32 rounded bg-slate-100" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="h-6 w-1/3 rounded bg-slate-200" />
          <div className="h-48 rounded bg-slate-100" />
          <div className="h-24 rounded bg-slate-100" />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 animate-pulse">
      <div className="h-6 w-1/4 rounded bg-slate-200 mb-4" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100">
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="h-4 w-36 rounded bg-slate-200" />
          <div className="h-4 w-44 rounded bg-slate-200" />
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="h-6 w-20 rounded-full bg-slate-200" />
        </div>
      ))}
    </div>
  )
}
