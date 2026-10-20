import { useEffect } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Smooth scrolling for the whole landing page.
 *
 * - Lenis drives the scroll position, GSAP's ticker drives Lenis, so the
 *   scrubbed timelines and the smooth scroll never drift apart.
 * - Disabled entirely under `prefers-reduced-motion` (native scrolling stays).
 * - Cleaned up on unmount: the ticker callback, the anchor handler and the
 *   Lenis instance are all released.
 */
export function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.4,
    })

    const onScroll = () => ScrollTrigger.update()
    lenis.on('scroll', onScroll)

    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)

    // in-page anchors go through Lenis so they keep the same easing
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      const target = event.target as HTMLElement | null
      const anchor = target?.closest?.('a[href^="#"]') as HTMLAnchorElement | null
      if (!anchor) return
      const hash = anchor.getAttribute('href')
      if (!hash || hash.length < 2) return
      const node = document.querySelector(hash)
      if (!node) return
      event.preventDefault()
      lenis.scrollTo(node as HTMLElement, { offset: -72, duration: 1.1 })
    }
    document.addEventListener('click', onClick)

    // fonts change metrics -> re-measure every trigger
    const fontsReady = document.fonts?.ready
    fontsReady?.then(() => ScrollTrigger.refresh())

    const onResize = () => ScrollTrigger.refresh()
    window.addEventListener('resize', onResize)

    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('resize', onResize)
      gsap.ticker.remove(raf)
      lenis.destroy()
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill())
    }
  }, [])
}
