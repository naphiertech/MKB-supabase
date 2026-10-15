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

      const items = gsap.utils.toArray(".timeline-item")
      items.forEach((item: any, i: number) => {
        const content = item.querySelector(".timeline-content")
        const dot = item.querySelector(".timeline-dot")
        const isEven = i % 2 === 0

        gsap.fromTo(
          content,
          {
            opacity: 0,
            x: isEven ? -25 : 25,
          },
          {
            opacity: 1,
            x: 0,
            duration: 0.7,
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
    <section className="container section-space" ref={containerRef}>
      <SectionHeader
        label="IMPLEMENTATION ROADMAP"
        title={
          <>
            Milestones of the
            <br />
            MKB project.
          </>
        }
        description="Five distinct engineering iterations delivering end-to-end workforce transparency."
      />
      <div className="relative mt-14 max-w-4xl mx-auto">
        {/* Center line (Animated) */}
        <div
          ref={lineRef}
          className="absolute left-4 top-0 hidden h-full w-px origin-top bg-[var(--orange)] md:left-1/2 md:block z-0"
        />
        {/* Static track */}
        <div className="absolute left-4 top-0 hidden h-full w-px bg-[#e7e8e2] md:left-1/2 md:block" />

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
                className={`timeline-content flex-1 rounded-md border border-[#e3e8da] bg-[#fafbf7] p-6 shadow-sm transition-all duration-200 hover:border-[#b5c39f] ${
                  index % 2 === 0 ? "md:text-right" : "md:text-left"
                }`}
              >
                <div
                  className={`eyebrow mb-2 ${
                    index % 2 === 0 ? "md:justify-end" : "md:justify-start"
                  }`}
                  style={{ fontSize: "8px", letterSpacing: "1.4px" }}
                >
                  <span />
                  {event.year.toUpperCase()}
                </div>
                <h3 className="text-base font-semibold text-[#282b26]">{event.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-[#767a71]">{event.description}</p>
              </div>

              {/* Dot */}
              <div className="timeline-dot z-10 absolute left-4 top-6 hidden size-2.5 -translate-x-1/2 rounded-full border-2 border-white bg-[var(--orange)] md:left-1/2 md:block shadow-xs" />

              {/* Spacer */}
              <div className="hidden flex-1 md:block" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
