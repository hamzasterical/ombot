import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EASE, DUR } from './motion'

gsap.registerPlugin(ScrollTrigger)

type RevealOptions = {
  /** selector (scoped to the container) of the elements that should reveal */
  targets?: string
  /** reveal the direct children of the container instead of `targets` */
  children?: boolean
  /** distance in px the element travels */
  y?: number
  /** delay between siblings */
  stagger?: number
  duration?: number
  /** ScrollTrigger start string */
  start?: string
  delay?: number
}

/**
 * The shared reveal primitive.
 *
 * Every section uses it, so timing stays consistent across the page.
 * Under `prefers-reduced-motion` nothing is animated and the final state
 * (fully visible) stays on screen.
 */
export function useScrollReveal<T extends HTMLElement = HTMLElement>(options: RevealOptions = {}) {
  const scope = useRef<T>(null)
  const {
    targets = '[data-reveal]',
    children = false,
    y = 26,
    stagger = 0.08,
    duration = DUR.reveal,
    start = 'top 82%',
    delay = 0,
  } = options

  useGSAP(
    () => {
      const root = scope.current
      if (!root) return

      const els = children
        ? (Array.from(root.children) as HTMLElement[])
        : gsap.utils.toArray<HTMLElement>(targets, root)
      if (!els.length) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        els.forEach((el) => {
          const inner = el.hasAttribute('data-reveal-children')
            ? (Array.from(el.children) as HTMLElement[])
            : [el]
          gsap.from(inner, {
            y,
            autoAlpha: 0,
            duration,
            ease: EASE.out,
            stagger,
            delay,
            scrollTrigger: { trigger: el, start, once: true },
          })
        })
      })

      return () => mm.revert()
    },
    { scope },
  )

  return scope
}
