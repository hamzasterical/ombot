import { useScrollReveal } from '../lib/useScrollReveal'
import { CountUp } from './ui/CountUp'
import { SplitHeading } from './ui/SplitHeading'

type Stat = {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  label: string
  detail: string
  bars: number[]
}

const STATS: Stat[] = [
  {
    value: 1800,
    label: 'Complaints per month',
    detail: 'Arriving across email, app, web form and branch counters.',
    bars: [18, 26, 31, 29, 38, 44, 41, 52, 58, 63, 71, 82],
  },
  {
    value: 640,
    label: 'Manual triage hours',
    detail: 'Spent reading, tagging, forwarding and re-reading the same thread.',
    bars: [72, 74, 70, 68, 64, 61, 58, 54, 51, 47, 44, 40],
  },
  {
    value: 12,
    suffix: '%',
    label: 'Deadlines missed',
    detail: 'Escalated after the regulator’s response window had already closed.',
    bars: [8, 7, 9, 8, 11, 10, 13, 12, 15, 14, 16, 18],
  },
]

function MiniBars({ bars }: { bars: number[] }) {
  return (
    <div aria-hidden="true" className="flex h-10 items-end gap-[3px]">
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-full rounded-[1px] bg-ink/25"
          style={{ height: `${h}%`, opacity: 0.25 + (i / bars.length) * 0.45 }}
        />
      ))}
    </div>
  )
}

export function Problem() {
  const ref = useScrollReveal<HTMLDivElement>({ selector: '.problem-card', stagger: 0.09 })

  return (
    <section id="problem" className="on-light relative bg-gray-light py-24 text-ink md:py-32">
      <div className="shell">
        <div className="max-w-[46rem]">
          <p className="eyebrow text-ink/55">01 — The problem</p>
          <SplitHeading className="display-lg mt-5 text-ink">
            Inbox triage is where SLA time dies.
          </SplitHeading>
          <p className="mt-6 max-w-[38rem] text-[1.0625rem] leading-relaxed text-[#3a3527]">
            Every complaint is read by a human who has to decide, alone, whether it is a 900-rupee
            fee query or a 45,000-rupee theft. Most queues decide it wrong, and the deadline does
            the deciding for them.
          </p>
        </div>

        <div ref={ref} className="mt-14 grid gap-4 md:mt-20 md:grid-cols-3 md:gap-5">
          {STATS.map((stat) => (
            <article
              key={stat.label}
              className="problem-card flex flex-col justify-between gap-8 rounded-2xl border border-ink/12 bg-white/55 p-7 md:p-8"
            >
              <div>
                <p className="mono text-[4rem] font-medium leading-[0.9] tracking-[-0.04em] text-ink md:text-[4.6rem]">
                  <CountUp
                    value={stat.value}
                    decimals={stat.decimals ?? 0}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                  />
                </p>
                <h3 className="mt-5 font-display text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
                  {stat.label}
                </h3>
                <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-[#3a3527]">{stat.detail}</p>
              </div>
              <MiniBars bars={stat.bars} />
            </article>
          ))}
        </div>

        <p className="mono mt-8 text-[11px] uppercase tracking-[0.14em] text-ink/45">
          Illustrative figures for a mid-size retail bank · per branch, per month
        </p>
      </div>
    </section>
  )
}
