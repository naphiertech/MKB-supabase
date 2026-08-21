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
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }
      )
        .fromTo(
          ".hero-title",
          { opacity: 0, y: 25 },
          { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" },
          "-=0.3"
        )
        .fromTo(
          ".hero-subtitle",
          { opacity: 0, y: 15 },
          { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
          "-=0.3"
        )
    },
    { scope: containerRef }
  )

  return (
    <div ref={containerRef} className="relative z-10 mx-auto max-w-7xl px-4 py-20 lg:px-8">
      <div className="hero-label inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1 mb-4 shadow-xs backdrop-blur-md">
        <span className="size-1.5 rounded-full bg-accent animate-pulse" />
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
          {label}
        </p>
      </div>
      <h1 className="hero-title max-w-3xl font-sans text-3xl font-bold leading-tight tracking-tight text-foreground md:text-5xl lg:text-6xl">
        {title}
      </h1>
      <p className="hero-subtitle mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">{subtitle}</p>
    </div>
  )
}
