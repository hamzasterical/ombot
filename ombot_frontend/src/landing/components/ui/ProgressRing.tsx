import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DUR, EASE, MQ } from '../../lib/animations'

gsap.registerPlugin(ScrollTrigger)

type Props = {
  /** 0 → 1 */
  value: number
  size?: number
  stroke?: number
  label: string
  caption?: string
  delay?: number
}

/**
 * Circular progress ring. Fills to its value the first time it scrolls
 * into view, and re-fills whenever the value changes (time-range switch).
 */
export function ProgressRing({
  value,
  size = 132,
  stroke = 8,
  label,
  caption,
  delay = 0,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const circleRef = useRef<SVGCircleElement>(null)

  useLayoutEffect(() => {
    const wrap = ref.current
    const circle = circleRef.current
    if (!wrap || !circle) return

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add(MQ.motion, () => {
        const radius = (size - stroke) / 2
        const circumference = 2 * Math.PI * radius

        gsap.set(circle, {
          strokeDasharray: circumference,
          strokeDashoffset: circumference,
        })

        const fill = () => {
          gsap.to(circle, {
            strokeDashoffset: circumference * (1 - value),
            duration: DUR.slow,
            ease: EASE.expo,
            delay,
          })
        }

        ScrollTrigger.create({
          trigger: wrap,
          start: 'top 90%',
          once: true,
          onEnter: fill,
        })

        if (ScrollTrigger.isInViewport(wrap)) fill()
      })
    }, wrap)

    return () => ctx.revert()
  }, [value, size, stroke, delay])

  return (
    <div ref={ref} className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            className="ring-track"
            cx={size / 2}
            cy={size / 2}
            r={(size - stroke) / 2}
            fill="none"
            strokeWidth={stroke}
          />
          <circle
            ref={circleRef}
            className="ring-value neon-stroke"
            cx={size / 2}
            cy={size / 2}
            r={(size - stroke) / 2}
            fill="none"
            strokeWidth={stroke}
          />
        </svg>
        <span
          className="mono absolute inset-0 flex items-center justify-center text-[1.35rem] font-medium tracking-tight text-white"
          aria-hidden="true"
        >
          {label}
        </span>
      </div>
      {caption ? (
        <p className="mono text-[11px] uppercase tracking-[0.12em] text-gray-dark">{caption}</p>
      ) : null}
    </div>
  )
}
