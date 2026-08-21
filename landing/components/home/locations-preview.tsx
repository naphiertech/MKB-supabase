"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, MapPin, Building2, Compass } from "lucide-react"
import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/section-header"
import { AnimateIn } from "@/components/animations/animate-in"
import { Magnetic } from "@/components/animations/magnetic"
import { locations } from "@/lib/data"

export function LocationsPreview() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const cards = gsap.utils.toArray(".location-card")
      if (!cards.length) return

      gsap.fromTo(
        cards,
        {
          opacity: 0,
          y: 40,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          stagger: 0.12,
          ease: "power3.out",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top 80%",
            toggleActions: "play none none none",
          },
        }
      )
    },
    { scope: containerRef }
  )

  return (
    <section ref={containerRef} className="bg-background pt-24 pb-20 lg:pt-32 lg:pb-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeader
          label="MKB Operations Network"
          title="Four Operational Hubs"
          description="MKBRiderTrack coordinates last-mile fleet logistics through four dedicated fulfillment hubs, each managing calibrated geofence zones across Zamboanga City."
        />

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {locations.map((hub) => (
            <Link
              key={hub.slug}
              href={`/locations/${hub.slug}`}
              className="location-card group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border/80 bg-card transition-all duration-300 hover:border-accent/50 hover:shadow-xl hover:-translate-y-1"
            >
              <div>
                <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                  <Image
                    src={hub.image}
                    alt={hub.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 1024px) 100vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <div className="p-5">
                  <div className="mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                      {hub.tagline}
                    </p>
                    <h3 className="mt-1 font-serif text-xl font-bold text-foreground group-hover:text-accent transition-colors">
                      {hub.shortName}
                    </h3>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                    {hub.description}
                  </p>
                  <div className="mt-4 flex flex-col gap-1.5 border-t border-border/50 pt-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0 text-accent" />
                      <span>{hub.district}, {hub.city}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Compass className="size-3.5 shrink-0 text-accent" />
                      <span>{hub.zones.length} Assigned Geofence Zones</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 pt-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-accent transition-colors group-hover:text-accent/80">
                  <span>View Hub Details</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <AnimateIn delay={0.4} className="mt-14 text-center flex justify-center">
          <Magnetic>
            <Button asChild variant="outline" size="lg" className="border-border hover:border-accent/40">
              <Link href="/locations">
                <span>View All Operational Hubs</span>
                <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>
          </Magnetic>
        </AnimateIn>
      </div>
    </section>
  )
}
