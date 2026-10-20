/**
 * Single source of truth for every animation value in the landing page.
 * Banking-grade motion: fast out-curve, tight stagger, nothing playful.
 */

export const EASE = {
  out: 'power3.out',
  expo: 'expo.out',
  inOut: 'power2.inOut',
  soft: 'power2.out',
  none: 'none',
} as const

export const DUR = {
  hover: 0.18,
  state: 0.35,
  reveal: 0.9,
  hero: 1.15,
  slow: 1.3,
} as const

export const STAGGER = {
  word: 0.055,
  card: 0.08,
  row: 0.05,
  chip: 0.06,
} as const

/** Media queries used by every gsap.matchMedia() in the project. */
export const MQ = {
  motion: '(prefers-reduced-motion: no-preference)',
  desktop: '(min-width: 768px)',
} as const

export const DESKTOP_MQ = '(min-width: 768px) and (prefers-reduced-motion: no-preference)'

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
