import { useId, useLayoutEffect, useMemo, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DUR, EASE, MQ } from '../../lib/animations'

gsap.registerPlugin(ScrollTrigger)

type Props = {
  data: number[]
  /** Change this value to re-draw the series (e.g. when the range changes). */
  drawKey?: string | number
  area?: boolean
  grid?: boolean
  className?: string
  strokeWidth?: number
}

const W = 600
const H = 160
const PAD = 10

/** Thin neon chart on black — the core visual language of the dashboard. */
export function LineChart({
  data,
  drawKey,
  area = false,
  grid = true,
  className,
  strokeWidth = 1.75,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const gradientId = `neon-area-${useId().replace(/:/g, '')}`

  const { line, fill } = useMemo(() => {
    if (!data.length) return { line: '', fill: '' }
    const min = Math.min(...data)
    const max = Math.max(...data)
    const span = max - min || 1
    const step = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : 0

    const pts = data.map((v, i) => {
      const x = PAD + i * step
      const y = H - PAD - ((v - min) / span) * (H - PAD * 2)
      return [x, y] as const
    })

    const d = pts
      .map(([x, y], i) => {
        if (i === 0) return `M ${x.toFixed(2)} ${y.toFixed(2)}`
        const [px, py] = pts[i - 1]
        const cx = (px + x) / 2
        return `C ${cx.toFixed(2)} ${py.toFixed(2)}, ${cx.toFixed(2)} ${y.toFixed(2)}, ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')

    const areaD = `${d} L ${(W - PAD).toFixed(2)} ${H} L ${PAD.toFixed(2)} ${H} Z`
    return { line: d, fill: areaD }
  }, [data])

  useLayoutEffect(() => {
    const root = rootRef.current
    const path = pathRef.current
    if (!root || !path || !line) return

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add(MQ.motion, () => {
        const length = path.getTotalLength()

        const draw = () => {
          gsap.fromTo(
            path,
            { strokeDasharray: length, strokeDashoffset: length },
            { strokeDashoffset: 0, duration: DUR.slow, ease: EASE.inOut },
          )
        }

        ScrollTrigger.create({ trigger: root, start: 'top 92%', onEnter: draw })
        if (ScrollTrigger.isInViewport(root)) draw()
      })
    }, root)

    return () => ctx.revert()
  }, [line, drawKey])

  return (
    <div ref={rootRef} className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Trend chart"
      >
        {grid ? (
          <g stroke="rgba(212,208,201,0.10)" strokeWidth="1">
            <line x1="0" y1={H * 0.25} x2={W} y2={H * 0.25} />
            <line x1="0" y1={H * 0.5} x2={W} y2={H * 0.5} />
            <line x1="0" y1={H * 0.75} x2={W} y2={H * 0.75} />
          </g>
        ) : null}
        {area ? <path d={fill} fill={`url(#${gradientId})`} opacity="0.55" /> : null}
        <path
          ref={pathRef}
          d={line}
          fill="none"
          stroke="var(--color-neon)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="neon-stroke"
        />
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-neon)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-neon)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}
