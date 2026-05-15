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
          y: 60,
          scale: 0.95,
          filter: "blur(10px)",
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration: 1,
          stagger: 0.1,
          ease: "power4.out",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top 80%",
            toggleActions: "play none none reverse",
          },
        },
      )
    },
    { scope: containerRef },
  )

  return (
    <section className="bg-background py-20 lg:py-28" ref={containerRef}>
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeader
          label="Meet the Talent"
          title="Our Engineering & Operations Team"
          description="From backend architects to on-the-ground fleet supervisors, each member brings a unique specialization to ensure comprehensive tracking and transparency."
        />

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {teamMembers.map((member) => (
            <div
              key={member.name}
              className="team-card group overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-lg"
            >
              <div className="relative aspect-[4/5] overflow-hidden">
                <Image
                  src={member.image}
                  alt={`${member.name}, ${member.role}`}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </div>
              <div className="p-6">
                <h3 className="font-serif text-xl font-bold text-card-foreground">{member.name}</h3>
                <p className="mt-1 text-sm font-medium text-accent">{member.role}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{member.bio}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
