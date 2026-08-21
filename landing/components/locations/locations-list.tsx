"use client"

import { useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { MapPin, ArrowRight, Layers, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
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
    <div ref={containerRef} className="border-b border-border bg-background py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="flex flex-col gap-20">
          {hubs.map((hub, index) => {
            const isEven = index % 2 === 0
            return (
              <article
                key={hub.id}
                id={hub.slug}
                className="location-row scroll-mt-24 border-b border-border/60 pb-16 last:border-b-0 last:pb-0"
              >
                <div
                  className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-14 ${
                    isEven ? "" : "lg:grid-flow-dense"
                  }`}
                >
                  {/* Media */}
                  <div className={`location-image ${isEven ? "" : "lg:col-start-2"}`}>
                    <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-secondary shadow-bryl">
                      <Image
                        src={hub.image}
                        alt={hub.name}
                        fill
                        className="object-cover transition-transform duration-500 hover:scale-[1.04]"
                        sizes="(max-width: 1024px) 100vw, 50vw"
                      />
                      <div className="absolute top-3 left-3">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-background/90 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent backdrop-blur-md">
                          <Layers className="size-3 text-accent" />
                          {hub.zones.length} Assigned {hub.zones.length === 1 ? "Zone" : "Zones"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className={`location-content ${isEven ? "" : "lg:col-start-1"}`}>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                      {hub.tagline}
                    </p>
                    <h2 className="mt-1 font-sans text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                      {hub.name}
                    </h2>

                    <div className="mt-2.5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0 text-accent" />
                      <span>{hub.district}, {hub.city}</span>
                    </div>

                    <p className="mt-3.5 text-xs md:text-sm leading-relaxed text-muted-foreground">
                      {hub.marketingDescription}
                    </p>

                    {/* Geofence Zones Tags */}
                    {hub.zones.length > 0 && (
                      <div className="mt-5">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-accent mb-2">
                          Assigned Geofence Perimeters (Supabase Data)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {hub.zones.map((zone) => (
                            <span
                              key={zone.id}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 font-mono text-[11px] text-foreground shadow-2xs"
                            >
                              <span
                                className="size-2 rounded-full shrink-0"
                                style={{ backgroundColor: zone.color || "#2563eb" }}
                              />
                              <span>{zone.name}</span>
                              <span className="text-[9px] uppercase text-muted-foreground">
                                ({zone.zoneType})
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Hub Capabilities */}
                    {hub.hubCapabilities.length > 0 && (
                      <div className="mt-5 border-t border-border pt-4">
                        <div className="grid gap-2 sm:grid-cols-2">
                          {hub.hubCapabilities.map((cap) => (
                            <div key={cap.name} className="flex items-start gap-1.5 text-xs">
                              <ShieldCheck className="size-3.5 shrink-0 text-accent mt-0.5" />
                              <div>
                                <span className="font-semibold text-foreground">{cap.name}</span>
                                <span className="text-muted-foreground block text-[11px]">{cap.description}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-7">
                      <Button asChild size="sm" className="h-9 bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-mono uppercase shadow-xs">
                        <Link href={`/locations/${hub.slug}`}>
                          <span>Inspect Geofences & Details</span>
                          <ArrowRight className="size-3.5 ml-1.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
