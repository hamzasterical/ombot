import { useLayoutEffect, useRef } from 'react'
import type { ElementType, ReactNode } from 'react'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { DUR, EASE, MQ } from '../../lib/animations'

gsap.registerPlugin(SplitText)

type Props = {
  as?: ElementType
  className?: string
  children: ReactNode
  delay?: number
  id?: string
}

/**
 * Section heading that reveals line-by-line from behind a mask.
 * Reduced motion: the text is simply there.
 */
export function SplitHeading({ as: Tag = 'h2', className, children, delay = 0, id }: Props) {
  const ref = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add(MQ.motion, () => {
        SplitText.create(el, {
          type: 'lines',
          mask: 'lines',
          autoSplit: true,
          linesClass: 'split-line',
          onSplit: (self) =>
            gsap.from(self.lines, {
              yPercent: 108,
              opacity: 0,
              duration: DUR.hero,
              ease: EASE.expo,
              stagger: 0.09,
              delay,
            }),
        })
      })
    }, el)

    return () => ctx.revert()
  }, [delay])

  return (
    <Tag ref={ref} className={className} id={id}>
      {children}
    </Tag>
  )
}
