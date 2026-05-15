"use client"

import { useEffect, useRef } from "react"
import Lenis from "lenis"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    // Initialize Lenis
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
      infinite: false,
    })

    lenisRef.current = lenis

    // Sync Lenis with ScrollTrigger
    function update(time: number) {
      lenis.raf(time * 1000)
    }

    gsap.ticker.add(update)
    lenis.on("scroll", ScrollTrigger.update)
    gsap.ticker.lagSmoothing(0)

    // Ensure layout changes are tracked
    const resizeObserver = new ResizeObserver(() => {
      lenis.resize()
      ScrollTrigger.refresh()
    })
    resizeObserver.observe(document.body)

    // Handle anchor links
    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest("a")
      if (anchor && anchor.hash && anchor.origin === window.location.origin) {
        e.preventDefault()
        const targetElement = document.querySelector(anchor.hash)
        if (targetElement) {
          lenis.scrollTo(targetElement as HTMLElement)
        }
      }
    }

    document.addEventListener("click", handleAnchorClick)

    return () => {
      gsap.ticker.remove(update)
      lenis.destroy()
      resizeObserver.disconnect()
      document.removeEventListener("click", handleAnchorClick)
    }
  }, [])

  return <>{children}</>
}
