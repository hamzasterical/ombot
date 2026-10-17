import React from 'react'
import type { Tier } from '../../api/types'
import { ShieldAlert, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react'

interface TierBadgeProps {
  tier: Tier | 'unknown'
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

export const TierBadge: React.FC<TierBadgeProps> = ({ tier, size = 'md', showIcon = true }) => {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-semibold',
  }

  const iconSize = size === 'sm' ? 12 : size === 'md' ? 14 : 16

  if (tier === 'critical') {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-red-200 bg-red-50 text-red-700 font-medium ${sizeClasses[size]}`}
      >
        {showIcon && <ShieldAlert size={iconSize} className="text-red-600 shrink-0" />}
        <span>Critical Risk</span>
      </span>
    )
  }

  if (tier === 'moderate') {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-amber-300 bg-amber-50 text-amber-800 font-medium ${sizeClasses[size]}`}
      >
        {showIcon && <AlertTriangle size={iconSize} className="text-amber-600 shrink-0" />}
        <span>Moderate Risk</span>
      </span>
    )
  }

  if (tier === 'low') {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 font-medium ${sizeClasses[size]}`}
      >
        {showIcon && <CheckCircle2 size={iconSize} className="text-emerald-600 shrink-0" />}
        <span>Low Risk</span>
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border border-purple-200 bg-purple-50 text-purple-800 font-medium ${sizeClasses[size]}`}
    >
      {showIcon && <HelpCircle size={iconSize} className="text-purple-600 shrink-0" />}
      <span>Unknown Tier</span>
    </span>
  )
}
