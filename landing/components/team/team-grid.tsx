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
    <section className="container section-space" ref={containerRef}>
      <SectionHeader
        label="CORE TALENT"
        title={<>Our Engineering & Operations Team</>}
        description="From backend architects to on-the-ground fleet supervisors, each member brings a unique specialization to ensure comprehensive tracking and transparency."
      />

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {teamMembers.map((member) => (
          <div
            key={member.name}
            className="team-card group overflow-hidden rounded-md border border-[#e7e8e2] bg-[#ffffff] transition-all duration-300 hover:border-[#f3682c]/40 hover:-translate-y-1 shadow-[0_2px_12px_rgba(40,43,38,0.04)]"
          >
            <div className="relative aspect-[4/5] overflow-hidden bg-[#f5f5ef]">
              <Image
                src={member.image}
                alt={`${member.name}, ${member.role}`}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-heading text-lg font-bold text-[#282b26] transition-colors group-hover:text-[var(--orange)]">
                    {member.name}
                  </h3>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--orange)] mt-0.5">
                    {member.role}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[#70766a]">
                {member.bio}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
