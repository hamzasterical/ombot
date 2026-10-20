import { useRef, type RefObject } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DUR, EASE } from './motion'

gsap.registerPlugin(ScrollTrigger)

type CountOptions = {
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
}

/**
 * Rolls a number up when the element scrolls into view.
 * Writes straight to the DOM (never through React state) so the scroll
 * thread never waits on a re-render.
 */
export function useCountUp(
  ref: RefObject<HTMLElement | null>,
  end: number,
  { duration = DUR.count, decimals = 0, prefix = '', suffix = '' }: CountOptions = {},
) {
  useGSAP(
    () => {
      const el = ref.current
      if (!el) return

      const format = (value: number) => {
        const fixed = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString('en-US')
        return `${prefix}${fixed}${suffix}`
      }

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const state = { value: 0 }
        gsap.to(state, {
          value: end,
          duration,
          ease: EASE.soft,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          onUpdate: () => {
            el.textContent = format(state.value)
          },
        })
      })

      // reduced motion: land on the final value immediately
      el.textContent = format(end)

      return () => mm.revert()
    },
    { scope: ref },
  )

  return ref
}
