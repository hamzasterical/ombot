import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DUR, EASE, MQ } from '../../lib/animations'

gsap.registerPlugin(ScrollTrigger)

type Props = {
  /** Target value. */
  value: number
  /** Decimal places. */
  decimals?: number
  prefix?: string
  suffix?: string
  duration?: number
  className?: string
}

/**
 * Counter that rolls up when it enters the viewport.
 * Writes straight to the DOM node — never through React state — so the
 * scroll handler stays allocation-free.
 */
export function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = DUR.slow,
  className,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add(MQ.motion, () => {
        const state = { v: 0 }
        const format = (n: number) =>
          `${prefix}${n.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })}${suffix}`

        el.textContent = format(0)

        gsap.to(state, {
          v: value,
          duration,
          ease: EASE.out,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          onUpdate: () => {
            el.textContent = format(state.v)
          },
        })
      })
    }, el)

    return () => ctx.revert()
  }, [value, decimals, prefix, suffix, duration])

  return <span ref={ref} className={className}>{`${prefix}0${suffix}`}</span>
}
