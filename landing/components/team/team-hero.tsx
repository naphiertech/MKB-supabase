"use client"

import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

export function TeamHero({ title, subtitle, label }: { title: string; subtitle: string; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const tl = gsap.timeline()
      tl.fromTo(
        ".hero-label",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
      )
        .fromTo(
          ".hero-title",
          { opacity: 0, y: 30, filter: "blur(10px)" },
          { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.8, ease: "power3.out" },
          "-=0.4",
        )
        .fromTo(
          ".hero-subtitle",
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
          "-=0.4",
        )
    },
    { scope: containerRef },
  )

  return (
    <div ref={containerRef} className="relative z-10 mx-auto max-w-7xl px-4 py-24 lg:px-8">
      <p className="hero-label mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">{label}</p>
      <h1 className="hero-title max-w-3xl font-serif text-4xl font-bold leading-tight tracking-tight text-primary-foreground md:text-6xl lg:text-7xl">
        {title}
      </h1>
      <p className="hero-subtitle mt-6 max-w-xl text-lg leading-relaxed text-primary-foreground/80">{subtitle}</p>
    </div>
  )
}
