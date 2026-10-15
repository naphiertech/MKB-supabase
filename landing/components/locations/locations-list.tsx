"use client"

import { useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { MapPin, ArrowRight, Layers, ShieldCheck } from "lucide-react"
import type { OperationalHub } from "@/lib/supabase/operations"

interface LocationsListProps {
  hubs: OperationalHub[]
}

export function LocationsList({ hubs }: LocationsListProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger)

      const items = gsap.utils.toArray(".location-row")
      items.forEach((item: any) => {
        const image = item.querySelector(".location-image")
        const content = item.querySelector(".location-content")

        gsap.fromTo(
          image,
          { opacity: 0, scale: 0.98, y: 20 },
          {
            opacity: 1,
            scale: 1,
            y: 0,
            duration: 0.8,
            ease: "power2.out",
            scrollTrigger: {
              trigger: item,
              start: "top 80%",
              toggleActions: "play none none reverse",
            },
          }
        )

        gsap.fromTo(
          content,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: "power2.out",
            scrollTrigger: {
              trigger: item,
              start: "top 80%",
              toggleActions: "play none none reverse",
            },
          }
        )
      })
    },
    { scope: containerRef }
  )

  return (
    <div ref={containerRef} className="container section-space">
      <div className="flex flex-col gap-20">
        {hubs.map((hub, index) => {
          const isEven = index % 2 === 0
          return (
            <article
              key={hub.id}
              id={hub.slug}
              className="location-row scroll-mt-24 border-b border-[#e7e8e2] pb-16 last:border-b-0 last:pb-0"
              data-reveal
            >
              <div
                className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-14 ${
                  isEven ? "" : "lg:grid-flow-dense"
                }`}
              >
                {/* Media */}
                <div className={`location-image ${isEven ? "" : "lg:col-start-2"}`}>
                  <div className="relative aspect-[16/10] overflow-hidden rounded-md border border-[#e3e6da] bg-[#f0f2e9] shadow-sm">
                    <Image
                      src={hub.image}
                      alt={hub.name}
                      fill
                      className="object-cover transition-transform duration-500 hover:scale-[1.03]"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                  </div>
                </div>

                {/* Content */}
                <div className={`location-content ${isEven ? "" : "lg:col-start-1"}`}>
                  <div className="eyebrow mb-2" style={{ fontSize: "8px", letterSpacing: "1.4px" }}>
                    <span />
                    {hub.tagline.toUpperCase()}
                  </div>
                  <h2 className="text-3xl font-semibold tracking-tight text-[#282b26]">
                    {hub.name}
                  </h2>
                  <p className="mt-3 text-xs leading-relaxed text-[#767a71] md:text-sm">
                    {hub.marketingDescription || hub.description}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-4 border-t border-[#e7e8e2] pt-5 text-xs text-[#5f6758]">
                    <div className="flex items-center gap-1.5">
                      <MapPin size={14} className="text-[var(--orange)]" />
                      <span>{hub.district}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Layers size={14} className="text-[#838777]" />
                      <span>{hub.zones.length} Active Zones</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-[#5b8a61]" />
                      <span>Geofence Enforced</span>
                    </div>
                  </div>

                  <div className="mt-7">
                    <Link
                      href={`/locations/${hub.slug}`}
                      className="button button-orange text-xs"
                    >
                      View Hub & Zone Map
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
