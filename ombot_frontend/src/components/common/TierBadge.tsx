import React from 'react'
import type { Tier } from '../../api/types'

interface TierBadgeProps {
  tier: Tier | 'unknown'
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

export const TierBadge: React.FC<TierBadgeProps> = ({ tier, size = 'md', showIcon = true }) => {
  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-semibold',
  }

  const iconSize = size === 'sm' ? 'text-[13px]' : size === 'md' ? 'text-[15px]' : 'text-[18px]'

  if (tier === 'critical') {
    return (
      <span
        className={`inline-flex items-center rounded-lg bg-error-container text-on-error-container font-semibold shadow-xs ${sizeClasses[size]}`}
      >
        {showIcon && <span className={`material-symbols-outlined ${iconSize} text-error`}>crisis_alert</span>}
        <span>Critical Risk</span>
      </span>
    )
  }

  if (tier === 'moderate') {
    return (
      <span
        className={`inline-flex items-center rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-semibold ${sizeClasses[size]}`}
      >
        {showIcon && <span className={`material-symbols-outlined ${iconSize} text-amber-700`}>priority_high</span>}
        <span>Moderate Risk</span>
      </span>
    )
  }

  if (tier === 'low') {
    return (
      <span
        className={`inline-flex items-center rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold ${sizeClasses[size]}`}
      >
        {showIcon && <span className={`material-symbols-outlined ${iconSize} text-emerald-600`}>verified</span>}
        <span>Low Risk</span>
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center rounded-lg bg-purple-100 text-purple-900 border border-purple-200 font-semibold ${sizeClasses[size]}`}
    >
      {showIcon && <span className={`material-symbols-outlined ${iconSize} text-purple-600`}>help_outline</span>}
      <span>Unknown Tier</span>
    </span>
  )
}
