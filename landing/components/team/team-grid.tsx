"use client"

import { useRef } from "react"
import Image from "next/image"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SectionHeader } from "@/components/section-header"
import { teamMembers } from "@/lib/data"

export function TeamGrid() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger)

      const cards = gsap.utils.toArray(".team-card")

      gsap.fromTo(
        cards,
        {
          opacity: 0,
          y: 30,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top 80%",
            toggleActions: "play none none reverse",
          },
        }
      )
    },
    { scope: containerRef }
  )

  return (
    <section className="border-b border-border bg-background py-20 lg:py-28" ref={containerRef}>
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeader
          label="01 // CORE TALENT"
          title="Our Engineering & Operations Team"
          description="From backend architects to on-the-ground fleet supervisors, each member brings a unique specialization to ensure comprehensive tracking and transparency."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {teamMembers.map((member) => (
            <div
              key={member.name}
              className="team-card group overflow-hidden rounded-2xl border border-border bg-card shadow-bryl transition-all duration-300 hover:border-accent/50 hover:-translate-y-1"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-secondary">
                <Image
                  src={member.image}
                  alt={`${member.name}, ${member.role}`}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-sans text-base font-bold text-foreground transition-colors group-hover:text-accent">{member.name}</h3>
                  <span className="inline-block rounded border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-accent">
                    {member.role}
                  </span>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{member.bio}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
