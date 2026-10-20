import type Lenis from 'lenis'

/**
 * Tiny registry so any component can command the smooth-scroll instance
 * (nav links, CTA buttons) without prop-drilling or a React context.
 */
let instance: Lenis | null = null

export const setLenis = (l: Lenis | null) => {
  instance = l
}

export const getLenis = () => instance

export const scrollToTarget = (selector: string) => {
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) return
  if (instance) {
    instance.scrollTo(el, { offset: -64, duration: 1.15 })
  } else {
    el.scrollIntoView({ behavior: 'auto', block: 'start' })
  }
}
