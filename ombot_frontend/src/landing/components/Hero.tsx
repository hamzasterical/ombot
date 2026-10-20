import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import { DUR, EASE, MQ, STAGGER } from '../lib/animations'
import { Cta } from './ui/Button'

gsap.registerPlugin(ScrollTrigger, SplitText, MotionPathPlugin)

const CHART_PATH =
  'M 0 300 L 40 292 L 80 306 L 120 281 L 160 289 L 200 258 L 240 269 L 280 241 L 320 253 L 360 225 L 400 237 L 440 211 L 480 225 L 520 197 L 560 209 L 600 183 L 640 197 L 680 169 L 720 183 L 760 159 L 800 171 L 840 147 L 880 159 L 920 133 L 960 147 L 1000 119 L 1040 133 L 1080 109 L 1120 119 L 1160 101 L 1200 93'

const FEED = [
  {
    id: 'C-4821',
    amount: 'PKR 45,000',
    channel: 'Gmail',
    category: 'Unauthorized transaction',
    confidence: '0.94',
    tier: 'CRITICAL',
    accent: true,
  },
  {
    id: 'C-4818',
    amount: 'PKR 12,200',
    channel: 'Web form',
    category: 'Wrong recipient transfer',
    confidence: '0.88',
    tier: 'MODERATE',
    accent: false,
  },
  {
    id: 'C-4815',
    amount: 'PKR 900',
    channel: 'Mobile app',
    category: 'ATM fee query',
    confidence: '0.79',
    tier: 'LOW',
    accent: false,
  },
]

export function Hero() {
  const root = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()

      mm.add(MQ.motion, () => {
        /* Headline — word-by-word rise from behind a mask */
        SplitText.create(el.querySelector('.hero-title') as Element, {
          type: 'words,lines',
          mask: 'lines',
          autoSplit: true,
          linesClass: 'split-line',
          onSplit: (self) =>
            gsap.from(self.words, {
              yPercent: 112,
              opacity: 0,
              duration: DUR.hero,
              ease: EASE.expo,
              stagger: STAGGER.word,
              delay: 0.12,
            }),
        })

        /* Supporting content */
        gsap.from('[data-hero-fade]', {
          y: 22,
          opacity: 0,
          duration: DUR.reveal,
          ease: EASE.out,
          stagger: 0.07,
          delay: 0.45,
        })

        /* The console preview lifts in */
        gsap.from('.hero-console', {
          y: 64,
          opacity: 0,
          duration: 1.4,
          ease: EASE.out,
          delay: 0.65,
        })

        /* Background chart draws itself, like a live market feed */
        const path = el.querySelector<SVGPathElement>('#hero-chart-path')
        if (path) {
          const length = path.getTotalLength()
          gsap.fromTo(
            path,
            { strokeDasharray: length, strokeDashoffset: length },
            { strokeDashoffset: 0, duration: 2.6, ease: EASE.inOut, delay: 0.25 },
          )
        }

        const dot = el.querySelector<SVGCircleElement>('#hero-chart-dot')
        if (dot && path) {
          gsap.to(dot, {
            motionPath: { path, align: path, alignOrigin: [0.5, 0.5] },
            duration: 9,
            repeat: -1,
            ease: 'none',
          })
        }
      })
    }, el)

    return () => ctx.revert()
  }, [])

  return (
    <section id="top" ref={root} className="relative isolate overflow-hidden bg-ink pt-28 md:pt-36">
      {/* ── Background: sculpted neon light + hairline grid + film grain ── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="grid-lines absolute inset-0 opacity-70" />
        <div
          className="absolute left-1/2 top-[-22%] h-[560px] w-[900px] -translate-x-1/2 rounded-[999px] bg-neon/20 blur-[120px]"
          style={{ animation: 'ob-drift 22s ease-in-out infinite alternate' }}
        />
        <div
          className="absolute left-1/2 top-[-30%] h-[470px] w-[780px] -translate-x-1/2 rounded-[999px] bg-ink blur-[90px]"
          style={{ zIndex: 1 }}
        />
        <div className="absolute bottom-[6%] left-1/2 h-[220px] w-[260px] -translate-x-1/2 rounded-[999px] bg-neon/35 blur-[90px]" />
        <div className="noise absolute inset-0" />
      </div>

      {/* ── Live chart ── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[46%] overflow-hidden">
        <svg
          viewBox="0 0 1200 400"
          className="absolute bottom-0 left-1/2 h-auto w-[1400px] max-w-none -translate-x-1/2 opacity-70"
        >
          <g stroke="rgba(212,208,201,0.09)" strokeWidth="1">
            {[60, 140, 220, 300, 380].map((y) => (
              <line key={y} x1="0" y1={y} x2="1200" y2={y} />
            ))}
          </g>
          <path
            d="M 0 340 C 120 330, 200 352, 300 330 S 520 352, 640 322 S 880 340, 1000 316 S 1140 326, 1200 312"
            fill="none"
            stroke="rgba(212,208,201,0.28)"
            strokeWidth="1.25"
          />
          <path
            id="hero-chart-path"
            d={CHART_PATH}
            fill="none"
            stroke="var(--color-neon)"
            strokeWidth="1.75"
            strokeLinecap="round"
            className="neon-stroke"
          />
          <circle id="hero-chart-dot" r="4.5" fill="var(--color-neon)" className="neon-stroke" />
        </svg>
      </div>

      <div className="shell relative">
        <div className="max-w-[64rem]">
          <p
            data-hero-fade
            className="inline-flex items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-gray-mid backdrop-blur-md"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-neon" />
            </span>
            Human-in-the-loop triage
          </p>

          <h1 className="hero-title display-xl mt-7 text-white">
            Every complaint,
            <br />
            routed by risk.
            <br />
            <span className="dim">Not by guesswork.</span>
          </h1>

          <p data-hero-fade className="mt-7 max-w-[36rem] text-[1.0625rem] leading-relaxed text-gray-light md:text-[1.15rem]">
            Ombot classifies bank complaints, gathers evidence, and keeps humans in control of
            every decision that moves money.
          </p>

          <div data-hero-fade className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Cta href="#pipeline">See it work</Cta>
            <Cta href="#architecture" variant="outline">
              Read the architecture
            </Cta>
          </div>

          <p
            data-hero-fade
            className="mono mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-gray-dark"
          >
            <span>10 declared categories</span>
            <span aria-hidden="true" className="text-gray-dark/50">
              /
            </span>
            <span>4 risk tiers</span>
            <span aria-hidden="true" className="text-gray-dark/50">
              /
            </span>
            <span>Every action audited</span>
          </p>
        </div>

        {/* ── Product: the console, live ── */}
        <div className="hero-console mt-16 md:mt-20">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#211c10] shadow-[0_50px_120px_-60px_rgba(0,0,0,0.95)]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="mono text-[11px] uppercase tracking-[0.18em] text-gray-mid">
                  Ombot / live queue
                </span>
                <span className="hidden h-3 w-px bg-white/10 sm:block" />
                <span className="mono hidden text-[11px] text-gray-dark sm:block">
                  intake → classify → route → approve
                </span>
              </div>
              <span className="mono flex items-center gap-2 text-[11px] text-gray-dark">
                <span className="h-1.5 w-1.5 rounded-full bg-neon" />
                09:14:07 PKT
              </span>
            </div>

            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="mono text-[10px] uppercase tracking-[0.16em] text-gray-dark">
                  <th className="px-5 py-3 font-medium">Case</th>
                  <th className="hidden px-5 py-3 font-medium md:table-cell">Channel</th>
                  <th className="px-5 py-3 font-medium">Classification</th>
                  <th className="px-5 py-3 text-right font-medium">Tier</th>
                </tr>
              </thead>
              <tbody>
                {FEED.map((row) => (
                  <tr key={row.id} className="border-t border-white/8">
                    <td className="px-5 py-4 align-top">
                      <span className="mono block text-[13px] text-white">{row.id}</span>
                      <span className="mono block text-[11px] text-gray-dark">{row.amount}</span>
                    </td>
                    <td className="mono hidden px-5 py-4 align-top text-[12px] text-gray-mid md:table-cell">
                      {row.channel}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <span className="block text-[13px] text-gray-light">{row.category}</span>
                      <span className="mt-2 flex items-center gap-2">
                        <span className="relative h-[3px] w-24 overflow-hidden rounded-full bg-white/10">
                          <span
                            className="absolute inset-y-0 left-0 rounded-full bg-neon"
                            style={{ width: `${Math.round(Number(row.confidence) * 100)}%` }}
                          />
                        </span>
                        <span className="mono text-[11px] text-gray-dark">{row.confidence} conf</span>
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right align-top">
                      {row.accent ? (
                        <span className="mono inline-flex items-center rounded-full bg-neon px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-ink">
                          {row.tier}
                        </span>
                      ) : (
                        <span className="mono inline-flex items-center rounded-full border border-white/15 px-2.5 py-1 text-[10px] tracking-[0.12em] text-gray-mid">
                          {row.tier}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mono overflow-hidden border-t border-white/10 px-5 py-3 text-[11px] text-gray-dark">
              <div className="marquee">
                <div className="marquee-track">
                  <span className="px-4">
                    09:14:07 classify.model v4.2 → tier=critical · 09:14:09 evidence.pull 4 txns · 09:14:11
                    policy.match "unauthorised transfer" · 09:14:12 approval.requested human:required ·
                  </span>
                  <span className="px-4" aria-hidden="true">
                    09:14:07 classify.model v4.2 → tier=critical · 09:14:09 evidence.pull 4 txns · 09:14:11
                    policy.match "unauthorised transfer" · 09:14:12 approval.requested human:required ·
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
