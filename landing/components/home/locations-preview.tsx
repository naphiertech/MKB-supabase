"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, MapPin, Clock } from "lucide-react"
import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/section-header"
import { AnimateIn } from "@/components/animations/animate-in"
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
          y: 50,
          clipPath: "inset(0 0 100% 0)",
        },
        {
          opacity: 1,
          y: 0,
          clipPath: "inset(0 0 0% 0)",
          duration: 1.2,
          stagger: 0.15,
          ease: "power4.out",
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
          label="Operational Zones"
          title="Assigned Geofence Zones"
          description="AttenRider monitors four distinct operational zones, ensuring strict geographical boundary validation for all active riders."
        />

        <div className="mt-16 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {locations.map((location) => (
            <Link
              key={location.slug}
              href={`/locations/${location.slug}`}
              className="location-card group relative overflow-hidden rounded-lg border border-border bg-card transition-all hover:shadow-xl hover:-translate-y-1"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src={location.image}
                  alt={location.name}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                  sizes="(max-width: 1024px) 100vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="p-6">
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                    {location.tagline}
                  </p>
                  <h3 className="mt-1 font-serif text-2xl font-bold text-foreground">
                    {location.shortName}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">
                  {location.description}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="size-4 shrink-0 text-accent" />
                    <span>
                      {location.address}, {location.city}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="size-4 shrink-0 text-accent" />
                    <span>{location.hours[0].time}</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm font-medium text-accent transition-colors group-hover:text-accent/80">
                  View Zone Details
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <AnimateIn delay={0.6} className="mt-12 text-center">
          <Button asChild>
            <Link href="/locations">
              View All Zones
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </AnimateIn>
      </div>
    </section>
  )
}
