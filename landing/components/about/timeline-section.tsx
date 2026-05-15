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

      // Animate the vertical line as we scroll
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
        },
      )

      // Animate each timeline entry
      const items = gsap.utils.toArray(".timeline-item")
      items.forEach((item: any, i: number) => {
        const content = item.querySelector(".timeline-content")
        const dot = item.querySelector(".timeline-dot")
        const isEven = i % 2 === 0

        // Content slide in
        gsap.fromTo(
          content,
          {
            opacity: 0,
            x: isEven ? -50 : 50,
            filter: "blur(8px)",
          },
          {
            opacity: 1,
            x: 0,
            filter: "blur(0px)",
            duration: 1,
            ease: "power2.out",
            scrollTrigger: {
              trigger: item,
              start: "top 85%",
              toggleActions: "play none none reverse",
            },
          },
        )

        // Dot pop in
        gsap.fromTo(
          dot,
          { scale: 0, opacity: 0 },
          {
            scale: 1,
            opacity: 1,
            duration: 0.6,
            ease: "back.out(1.7)",
            scrollTrigger: {
              trigger: item,
              start: "top 85%",
              toggleActions: "play none none reverse",
            },
          },
        )
      })
    },
    { scope: containerRef },
  )

  return (
    <section className="overflow-hidden bg-background py-20 lg:py-28" ref={containerRef}>
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeader label="Implementation Journey" title="Milestones of the MKB Project" />
        <div className="relative mt-14">
          {/* Center line (Animated) */}
          <div
            ref={lineRef}
            className="absolute left-4 top-0 hidden h-full w-px origin-top bg-accent md:left-1/2 md:block"
          />
          {/* Static gray track for the line */}
          <div className="absolute left-4 top-0 hidden h-full w-px bg-border md:left-1/2 md:block" />

          <div className="flex flex-col gap-12">
            {storyTimeline.map((event, index) => (
              <div
                key={event.year}
                className={`timeline-item relative flex flex-col gap-4 md:flex-row md:gap-12 ${
                  index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                }`}
              >
                {/* Content */}
                <div
                  className={`timeline-content flex-1 ${
                    index % 2 === 0 ? "md:pr-12 md:text-right" : "md:pl-12 md:text-left"
                  }`}
                >
                  <span className="inline-block rounded-full bg-accent/10 px-3 py-1 font-serif text-sm font-bold text-accent">
                    {event.year}
                  </span>
                  <h3 className="mt-3 font-serif text-xl font-bold text-foreground">{event.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{event.description}</p>
                </div>

                {/* Dot (Animated) */}
                <div className="timeline-dot z-10 absolute left-4 top-1 hidden size-3 -translate-x-1/2 rounded-full border-2 border-accent bg-background md:left-1/2 md:block" />

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
