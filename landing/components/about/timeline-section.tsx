"use client"

import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SectionHeader } from "@/components/section-header"
import { storyTimeline } from "@/lib/data"

export function TimelineSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger)

      // Animate the vertical line
      gsap.fromTo(
        lineRef.current,
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top 60%",
            end: "bottom 60%",
            scrub: 1,
          },
        }
      )

      // Animate each timeline entry
      const items = gsap.utils.toArray(".timeline-item")
      items.forEach((item: any, i: number) => {
        const content = item.querySelector(".timeline-content")
        const dot = item.querySelector(".timeline-dot")
        const isEven = i % 2 === 0

        gsap.fromTo(
          content,
          {
            opacity: 0,
            x: isEven ? -30 : 30,
          },
          {
            opacity: 1,
            x: 0,
            duration: 0.8,
            ease: "power2.out",
            scrollTrigger: {
              trigger: item,
              start: "top 85%",
              toggleActions: "play none none reverse",
            },
          }
        )

        gsap.fromTo(
          dot,
          { scale: 0, opacity: 0 },
          {
            scale: 1,
            opacity: 1,
            duration: 0.5,
            ease: "back.out(1.7)",
            scrollTrigger: {
              trigger: item,
              start: "top 85%",
              toggleActions: "play none none reverse",
            },
          }
        )
      })
    },
    { scope: containerRef }
  )

  return (
    <section className="overflow-hidden border-b border-border bg-background py-20 lg:py-28" ref={containerRef}>
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeader
          label="03 // IMPLEMENTATION ROADMAP"
          title="Milestones of the MKB Project"
          description="Five distinct engineering iterations delivering end-to-end workforce transparency."
        />
        <div className="relative mt-14 max-w-4xl mx-auto">
          {/* Center line (Animated) */}
          <div
            ref={lineRef}
            className="absolute left-4 top-0 hidden h-full w-px origin-top bg-accent md:left-1/2 md:block"
          />
          {/* Static gray track */}
          <div className="absolute left-4 top-0 hidden h-full w-px bg-border md:left-1/2 md:block" />

          <div className="flex flex-col gap-10">
            {storyTimeline.map((event, index) => (
              <div
                key={event.year}
                className={`timeline-item relative flex flex-col gap-4 md:flex-row md:gap-10 ${
                  index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                }`}
              >
                {/* Content */}
                <div
                  className={`timeline-content flex-1 rounded-2xl border border-border bg-card p-5 shadow-bryl ${
                    index % 2 === 0 ? "md:text-right" : "md:text-left"
                  }`}
                >
                  <span className="inline-block rounded-md border border-accent/30 bg-accent/15 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-accent">
                    {event.year}
                  </span>
                  <h3 className="mt-2.5 font-sans text-base font-bold text-foreground">{event.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{event.description}</p>
                </div>

                {/* Dot */}
                <div className="timeline-dot z-10 absolute left-4 top-5 hidden size-2.5 -translate-x-1/2 rounded-full border-2 border-background bg-accent md:left-1/2 md:block shadow-xs" />

                {/* Spacer */}
                <div className="hidden flex-1 md:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
