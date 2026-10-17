import React from 'react'

interface EmptyStateProps {
  title?: string
  description?: string
  icon?: React.ReactNode
  action?: {
    label: string
    onClick: () => void
  }
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No complaints in this queue',
  description = 'All cases for this triage tier have been handled or reassigned.',
  icon,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/50 bg-surface-container-lowest p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container-low text-secondary mb-3">
        {icon || <span className="material-symbols-outlined text-[28px]">inbox</span>}
      </div>
      <h3 className="font-headline-sm text-sm font-semibold text-on-surface">{title}</h3>
      <p className="mt-1 max-w-sm font-body-sm text-xs text-secondary leading-relaxed">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-lg bg-primary px-4 py-2 font-label-md text-xs font-semibold text-on-primary hover:opacity-90 transition-opacity shadow-xs"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
