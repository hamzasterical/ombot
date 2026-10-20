import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DUR, EASE, MQ } from '../lib/animations'

gsap.registerPlugin(ScrollTrigger)

type Stage = {
  id: string
  step: string
  label: string
  title: string
  body: string
  meta: string
}

const STAGES: Stage[] = [
  {
    id: 'intake',
    step: '01',
    label: 'Intake',
    title: 'The complaint arrives',
    body: 'Gmail, app, web form or a branch counter. Ombot takes the thread exactly as it lands — no forms, no re-typing, no forwarding.',
    meta: 'CHANNEL GMAIL · RECEIVED 09:14:07',
  },
  {
    id: 'classify',
    step: '02',
    label: 'Classify',
    title: 'Ten categories, ranked',
    body: 'The model maps the complaint onto a declared category and shows the exact quote it based that on, with a confidence score you can argue with.',
    meta: 'UNAUTHORIZED TRANSACTION · CONFIDENCE 0.94',
  },
  {
    id: 'route',
    step: '03',
    label: 'Route',
    title: 'One lane, chosen by risk',
    body: 'Tier decides the queue. Critical cases surface first, low-risk cases never touch a person, and anything ambiguous lands in Unknown.',
    meta: 'TIER CRITICAL · RESPONSE SLA 4 HOURS',
  },
  {
    id: 'evidence',
    step: '04',
    label: 'Evidence',
    title: 'The case arrives pre-stacked',
    body: 'Transactions, device events and the matching policy clause are attached before a reviewer opens the ticket. Reading starts at the answer.',
    meta: '4 TRANSACTIONS · 2 DEVICE EVENTS · 1 POLICY',
  },
  {
    id: 'decide',
    step: '05',
    label: 'Decision',
    title: 'A human holds the money',
    body: 'Anything that moves funds stops at an approval gate. Ombot prepares the case and drafts the reply — a named reviewer signs it.',
    meta: 'APPROVAL REQUIRED · REVIEWER S. IQBAL',
  },
]

const LANES = [
  { id: 'critical', name: 'CRITICAL', sla: 'SLA 4H', note: '0.94 avg conf', count: '12' },
  { id: 'moderate', name: 'MODERATE', sla: 'SLA 24H', note: '0.88 avg conf', count: '48' },
  { id: 'low', name: 'LOW', sla: 'AUTO', note: '0.79 avg conf', count: '311' },
  { id: 'unknown', name: 'UNKNOWN', sla: 'SLA 48H', note: 'below threshold', count: '6' },
]

const EVIDENCE = [
  { time: '09:12:04', kind: 'TXN', text: 'CARD ••••4417 · PKR 45,000 OUT', tag: 'merchant NEST-8821', hot: true },
  { time: '09:12:09', kind: 'TXN', text: 'CARD ••••4417 · PKR 45,000 IN', tag: 'reversal pending', hot: false },
  { time: '09:11:58', kind: 'AUTH', text: 'New device login · Karachi, PK', tag: 'ip 103.125.x.x', hot: false },
  { time: '09:10:22', kind: 'POL', text: 'Policy §4.2 · unauthorized transfer', tag: 'matched', hot: false },
]

const SNAP = [0.2, 0.45, 0.65, 0.85, 1]

export function Pipeline() {
  const sectionRef = useRef<HTMLElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLElement>(null)
  const travel = useRef({ x: 0, y: 0, scale: 1 })
  const activeRef = useRef(0)
  const [active, setActive] = useState(0)

  useLayoutEffect(() => {
    const section = sectionRef.current
    const pin = pinRef.current
    const canvas = canvasRef.current
    const card = cardRef.current
    if (!section || !pin || !canvas || !card) return

    let tl: gsap.core.Timeline

    /* Measure where the card has to land inside the CRITICAL lane. */
    const measure = () => {
      const slot = canvas.querySelector<HTMLElement>('[data-slot="critical"]')
      const intake = canvas.querySelector<HTMLElement>('.slot-intake')
      if (!slot || !intake) return
      const slotRect = slot.getBoundingClientRect()
      const intakeRect = intake.getBoundingClientRect()
      travel.current = {
        x: slotRect.left + slotRect.width / 2 - (intakeRect.left + intakeRect.width / 2),
        y: slotRect.top + slotRect.height / 2 - (intakeRect.top + intakeRect.height / 2),
        scale: slotRect.width / intakeRect.width,
      }
      tl?.invalidate()
    }

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()

      mm.add(`${MQ.desktop}`, () => {
        measure()

        const copies = gsap.utils.toArray<HTMLElement>('.stage-copy')
        const chips = gsap.utils.toArray<HTMLElement>('.card-chip')
        const rows = gsap.utils.toArray<HTMLElement>('.evidence-row')
        const lanes = gsap.utils.toArray<HTMLElement>('.lane')
        const critical = canvas.querySelector<HTMLElement>('[data-lane="critical"]')
        const others = lanes.filter((l) => l !== critical)
        const laneSlot = canvas.querySelector<HTMLElement>('[data-slot="critical"]')

        tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: '+=300%',
            scrub: 1,
            pin,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            snap: {
              snapTo: SNAP,
              duration: { min: 0.2, max: 0.6 },
              delay: 0.05,
              ease: 'power2.inOut',
            },
            onRefresh: () => {
              measure()
              tl.invalidate()
            },
            onUpdate: (self) => {
              const p = self.progress
              const idx = p < 0.2 ? 0 : p < 0.45 ? 1 : p < 0.65 ? 2 : p < 0.85 ? 3 : 4
              if (idx !== activeRef.current) {
                activeRef.current = idx
                setActive(idx)
              }
            },
          },
        })

        /* ── Stage 01 · Intake ─────────────────────────────────── */
        tl.fromTo(
          card,
          { opacity: 0, y: 18, scale: 0.97 },
          { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: EASE.soft },
          0,
        )
        tl.set(copies.slice(1), { opacity: 0 }, 0)
        tl.set(copies[0], { opacity: 1 }, 0)
        tl.fromTo(
          '.rail-progress',
          { scaleY: 0 },
          { scaleY: 1, duration: 4, ease: 'none' },
          0,
        )

        /* ── Stage 02 · Classify ───────────────────────────────── */
        tl.to(copies[0], { opacity: 0, duration: 0.25 }, 1)
        tl.to(copies[1], { opacity: 1, duration: 0.25 }, 1)
        tl.from(
          chips,
          { y: 14, opacity: 0, duration: 0.45, ease: EASE.out, stagger: 0.06 },
          1.05,
        )
        tl.fromTo(
          '.card-confidence-fill',
          { scaleX: 0 },
          { scaleX: 1, duration: 0.6, ease: EASE.out },
          1.15,
        )
        tl.to('.card-quote', { color: '#CCFF00', duration: 0.5 }, 1.25)
        tl.fromTo(
          '.card-quote-bar',
          { scaleY: 0 },
          { scaleY: 1, duration: 0.5, ease: EASE.out },
          1.25,
        )

        /* ── Stage 03 · Route ──────────────────────────────────── */
        tl.to(copies[1], { opacity: 0, duration: 0.25 }, 1.8)
        tl.to(copies[2], { opacity: 1, duration: 0.25 }, 1.8)
        tl.fromTo(
          '.pipeline-lanes',
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.3, ease: EASE.out },
          1.8,
        )
        tl.to(
          card,
          {
            x: () => travel.current.x,
            y: () => travel.current.y,
            scale: () => travel.current.scale,
            duration: 0.6,
            ease: EASE.inOut,
          },
          1.95,
        )
        if (critical) {
          tl.to(
            critical,
            {
              borderColor: '#CCFF00',
              backgroundColor: 'rgba(204,255,0,0.07)',
              boxShadow:
                'inset 0 0 0 1px rgba(204,255,0,0.25), 0 0 40px -12px rgba(204,255,0,0.55)',
              duration: 0.4,
              ease: EASE.out,
            },
            2.15,
          )
        }
        if (laneSlot) {
          tl.to(laneSlot, { borderColor: 'rgba(204,255,0,0.45)', duration: 0.4 }, 2.15)
        }
        tl.to(others, { opacity: 0.38, duration: 0.4, ease: EASE.out }, 2.15)

        /* ── Stage 04 · Evidence ───────────────────────────────── */
        tl.to(copies[2], { opacity: 0, duration: 0.25 }, 2.6)
        tl.to(copies[3], { opacity: 1, duration: 0.25 }, 2.6)
        tl.fromTo(
          '.pipeline-evidence',
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.3, ease: EASE.out },
          2.6,
        )
        tl.from(
          rows,
          { x: 26, opacity: 0, duration: 0.5, ease: EASE.out, stagger: 0.07 },
          2.68,
        )

        /* ── Stage 05 · Human decision ─────────────────────────── */
        tl.to(copies[3], { opacity: 0, duration: 0.25 }, 3.4)
        tl.to(copies[4], { opacity: 1, duration: 0.25 }, 3.4)
        tl.to(
          '.pipeline-gate',
          {
            borderColor: '#CCFF00',
            boxShadow: 'inset 0 0 0 1px rgba(204,255,0,0.2), 0 0 46px -16px rgba(204,255,0,0.6)',
            duration: 0.5,
            ease: EASE.out,
          },
          3.45,
        )
        tl.fromTo(
          '.gate-shutter.left',
          { xPercent: -104 },
          { xPercent: 0, duration: 0.45, ease: EASE.inOut },
          3.45,
        )
        tl.fromTo(
          '.gate-shutter.right',
          { xPercent: 104 },
          { xPercent: 0, duration: 0.45, ease: EASE.inOut },
          3.45,
        )
        tl.fromTo(
          '.lock-badge',
          { scale: 0.6, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.5, ease: EASE.expo },
          3.7,
        )
      })

      /* Static layout (mobile / reduced motion): simple fade-ins only. */
      mm.add('(max-width: 767px), (prefers-reduced-motion: reduce)', () => {
        gsap.from('.stage-copy, .pipeline-lanes, .pipeline-evidence, .pipeline-gate', {
          opacity: 0,
          y: 18,
          duration: DUR.reveal,
          ease: EASE.out,
          stagger: 0.08,
          scrollTrigger: { trigger: section, start: 'top 78%', once: true },
        })
      })
    }, section)

    return () => ctx.revert()
  }, [])

  return (
    <section id="pipeline" ref={sectionRef} className="relative bg-ink">
      <div ref={pinRef} className="flex min-h-[100svh] items-center bg-ink">
        <div className="shell w-full py-20 md:py-14">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[42rem]">
              <p className="eyebrow">02 — The pipeline</p>
              <h2 className="display-md mt-4 text-white">
                One complaint. Five stages.
                <br />
                <span className="dim">Zero guesswork.</span>
              </h2>
            </div>
            <p className="mono hidden max-w-[15rem] text-[11px] uppercase leading-relaxed tracking-[0.14em] text-gray-dark lg:block">
              Scroll to move one live case through the system
            </p>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[172px_minmax(0,1fr)]">
            {/* ── Progress rail ── */}
            <ol className="relative hidden flex-col justify-between gap-5 py-1 lg:flex">
              <span aria-hidden="true" className="rail-track absolute left-0 top-2 bottom-2">
                <span className="rail-progress" />
              </span>
              {STAGES.map((stage, i) => (
                <li
                  key={stage.id}
                  className={`rail-item ${i === active ? 'is-active' : ''}`}
                  aria-current={i === active ? 'step' : undefined}
                >
                  <span className="mono block text-[10px] uppercase tracking-[0.16em]">
                    {stage.step}
                  </span>
                  <span className="mt-1 block text-[0.9375rem] font-medium tracking-[-0.01em]">
                    {stage.label}
                  </span>
                </li>
              ))}
            </ol>

            {/* ── Stage canvas ── */}
            <div ref={canvasRef} className="pipeline-canvas">
              {/* Stage copy */}
              <div className="pipeline-copy">
                {STAGES.map((stage) => (
                  <div key={stage.id} className="stage-copy absolute inset-0">
                    <p className="mono text-[10px] uppercase tracking-[0.16em] text-gray-dark">
                      Stage {stage.step} · {stage.label}
                    </p>
                    <h3 className="mt-3 font-display text-[1.65rem] font-semibold leading-tight tracking-[-0.03em] text-white md:text-[2rem]">
                      {stage.title}
                    </h3>
                    <p className="mt-3 max-w-[34rem] text-[0.9375rem] leading-relaxed text-gray-mid md:text-[1rem]">
                      {stage.body}
                    </p>
                    <p className="mono mt-5 text-[10px] uppercase tracking-[0.16em] text-neon">
                      {stage.meta}
                    </p>
                  </div>
                ))}
              </div>

              {/* The complaint card */}
              <div className="slot-intake">
                <article ref={cardRef} className="complaint-card">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="mono text-[10px] uppercase tracking-[0.16em] text-gray-dark">
                        Case C-4821
                      </p>
                      <p className="mono mt-1 text-[10px] uppercase tracking-[0.16em] text-gray-dark">
                        Gmail · 09:14:07
                      </p>
                    </div>
                    <span className="mono text-[12px] text-white">PKR 45,000</span>
                  </div>

                  <div className="relative pl-3">
                    <span className="card-quote-bar absolute left-0 top-0 h-full w-[2px] origin-top scale-y-0 rounded-full bg-neon" />
                    <p className="card-quote text-[0.9375rem] leading-snug text-gray-light">
                      “I see a transfer I never made — PKR 45,000”
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {['Unauthorized transaction', 'Card ••••4417', 'Karachi, PK'].map((chip) => (
                      <span
                        key={chip}
                        className="card-chip rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] text-gray-mid"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="mono text-[10px] uppercase tracking-[0.16em] text-gray-dark">
                        Confidence
                      </span>
                      <span className="mono text-[10px] text-gray-mid">0.94</span>
                    </div>
                    <div className="relative mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/10">
                      <span className="card-confidence-fill absolute inset-y-0 left-0 w-[94%] origin-left rounded-full bg-neon" />
                    </div>
                  </div>
                </article>
              </div>

              {/* Lanes */}
              <div className="pipeline-lanes grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
                {LANES.map((lane) => (
                  <div key={lane.id} className="lane" data-lane={lane.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono text-[10px] font-medium uppercase tracking-[0.16em] text-gray-mid">
                        {lane.name}
                      </span>
                      <span className="mono text-[10px] text-gray-dark">{lane.count}</span>
                    </div>
                    <span className="lane-slot" data-slot={lane.id} aria-hidden="true" />
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono text-[10px] text-gray-dark">{lane.sla}</span>
                      <span className="mono text-[10px] text-gray-dark">{lane.note}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Evidence */}
              <div className="pipeline-evidence panel overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
                  <span className="mono text-[10px] uppercase tracking-[0.16em] text-gray-dark">
                    Evidence bundle
                  </span>
                  <span className="mono text-[10px] text-gray-dark">6 objects</span>
                </div>
                <ul>
                  {EVIDENCE.map((row) => (
                    <li
                      key={row.time + row.kind}
                      className="evidence-row flex items-center gap-3 border-b border-white/6 px-4 py-2 last:border-b-0"
                    >
                      <span className="mono w-[52px] shrink-0 text-[10px] text-gray-dark">
                        {row.time}
                      </span>
                      <span
                        className={`mono w-[38px] shrink-0 text-[10px] tracking-[0.1em] ${
                          row.hot ? 'text-neon' : 'text-gray-dark'
                        }`}
                      >
                        {row.kind}
                      </span>
                      <span className="mono flex-1 truncate text-[11px] text-gray-mid">
                        {row.text}
                      </span>
                      <span className="mono hidden shrink-0 text-[10px] text-gray-dark sm:block">
                        {row.tag}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Approval gate */}
              <div className="pipeline-gate gate-panel p-5">
                <span className="gate-shutter left" aria-hidden="true" />
                <span className="gate-shutter right" aria-hidden="true" />
                <div className="relative z-10 flex h-full flex-col justify-between gap-4">
                  <div>
                    <p className="mono text-[10px] uppercase tracking-[0.16em] text-gray-dark">
                      Stage 05 · Decision
                    </p>
                    <h3 className="mt-2 font-display text-[1.25rem] font-semibold tracking-[-0.02em] text-white">
                      Approval required
                    </h3>
                    <p className="mt-2 max-w-[22rem] text-[0.8125rem] leading-relaxed text-gray-mid">
                      A refund of PKR 45,000 is held. Ombot prepared the evidence bundle and the
                      draft reply; a named reviewer signs it.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] tracking-[0.1em] text-gray-mid">
                      REVIEWER · S. IQBAL
                    </span>
                    <span className="mono rounded-full border border-white/12 px-2.5 py-1 text-[10px] tracking-[0.1em] text-gray-dark">
                      ESCALATE
                    </span>
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
                >
                  <span className="lock-badge grid h-11 w-11 place-items-center rounded-full border border-neon bg-ink text-neon shadow-[0_0_30px_-6px_rgba(204,255,0,0.8)]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect
                        x="4.5"
                        y="10.5"
                        width="15"
                        height="10"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                      <path
                        d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
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
