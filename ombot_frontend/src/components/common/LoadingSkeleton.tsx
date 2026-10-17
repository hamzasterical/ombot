import React from 'react'

export const LoadingSkeleton: React.FC<{ type?: 'table' | 'card' | 'detail' | 'stats' }> = ({
  type = 'table',
}) => {
  if (type === 'stats') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-surface-container p-4" />
        ))}
      </div>
    )
  }

  if (type === 'card') {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-3">
            <div className="flex justify-between">
              <div className="h-5 w-32 rounded bg-surface-container" />
              <div className="h-5 w-24 rounded-full bg-surface-container" />
            </div>
            <div className="h-4 w-3/4 rounded bg-surface-container" />
            <div className="h-4 w-1/2 rounded bg-surface-container" />
            <div className="flex gap-3 pt-2">
              <div className="h-9 w-32 rounded-lg bg-surface-container" />
              <div className="h-9 w-36 rounded-lg bg-surface-container" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (type === 'detail') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6 space-y-4">
          <div className="h-6 w-1/3 rounded bg-surface-container" />
          <div className="h-24 rounded bg-surface-container-low" />
          <div className="h-6 w-1/4 rounded bg-surface-container" />
          <div className="h-32 rounded bg-surface-container-low" />
        </div>
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6 space-y-4">
          <div className="h-6 w-1/3 rounded bg-surface-container" />
          <div className="h-48 rounded bg-surface-container-low" />
          <div className="h-24 rounded bg-surface-container-low" />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 space-y-3 animate-pulse">
      <div className="h-6 w-1/4 rounded bg-surface-container mb-4" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center justify-between py-2 border-b border-surface-container-low">
          <div className="h-4 w-24 rounded bg-surface-container" />
          <div className="h-4 w-32 rounded bg-surface-container" />
          <div className="h-4 w-20 rounded bg-surface-container" />
          <div className="h-4 w-16 rounded bg-surface-container" />
        </div>
      ))}
    </div>
  )
}
