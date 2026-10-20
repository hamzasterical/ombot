import type { ReactNode } from 'react'
import { scrollToTarget } from '../../lib/scroll'

type Variant = 'neon' | 'outline'

type Props = {
  href: string
  children: ReactNode
  variant?: Variant
  className?: string
  onNavigate?: () => void
}

/**
 * Anchor styled as a button. Behaves like a link without JavaScript and
 * scrolls through Lenis when it is available.
 */
export function Cta({ href, children, variant = 'neon', className = '', onNavigate }: Props) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!href.startsWith('#')) return
    event.preventDefault()
    scrollToTarget(href)
    onNavigate?.()
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      className={`btn ${variant === 'neon' ? 'btn-neon' : 'btn-outline'} ${className}`}
    >
      {children}
    </a>
  )
}
