"use client"

import { useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { ArrowRight, MapPin, Building2, ShieldCheck, Compass } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { locations } from "@/lib/data"

export function LocationsList() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger)

      const rows = gsap.utils.toArray(".location-row")

      rows.forEach((row: any, i: number) => {
        const image = row.querySelector(".location-image")
        const info = row.querySelector(".location-info")
        const isEven = i % 2 === 0

        if (image && info) {
          gsap.fromTo(
            image,
            {
              opacity: 0,
              x: isEven ? -40 : 40,
            },
            {
              opacity: 1,
              x: 0,
              duration: 0.9,
              ease: "power3.out",
              scrollTrigger: {
                trigger: row,
                start: i === 0 ? "top bottom" : "top 80%",
                toggleActions: "play none none reverse",
              },
            },
          )

          gsap.fromTo(
            info,
            {
              opacity: 0,
              x: isEven ? 40 : -40,
            },
            {
              opacity: 1,
              x: 0,
              duration: 0.9,
              delay: 0.15,
              ease: "power2.out",
              scrollTrigger: {
                trigger: row,
                start: i === 0 ? "top bottom" : "top 80%",
                toggleActions: "play none none reverse",
              },
            },
          )
        }
      })
    },
    { scope: containerRef },
  )

  return (
    <div ref={containerRef} className="flex flex-col gap-16 lg:gap-24">
      {locations.map((hub, index) => (
        <div
          key={hub.slug}
          className={`location-row grid items-center gap-10 lg:grid-cols-12 lg:gap-16 ${
            index % 2 !== 0 ? "lg:[direction:rtl]" : ""
          }`}
        >
          {/* Hub Image */}
          <div className="location-image lg:col-span-6 lg:[direction:ltr]">
            <Link
              href={`/locations/${hub.slug}`}
              className="group relative block aspect-[16/11] overflow-hidden rounded-2xl border border-border/80 bg-card shadow-lg"
            >
              <Image
                src={hub.image}
                alt={hub.name}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/70 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4">
                <Badge className="bg-background/95 text-foreground border-border/60 backdrop-blur-md text-xs font-semibold px-3 py-1">
                  {hub.tagline}
                </Badge>
              </div>
            </Link>
          </div>

          {/* Hub Info */}
          <div className="location-info lg:col-span-6 lg:[direction:ltr] flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-accent" />
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-accent">
                {hub.tagline}
              </span>
            </div>

            <h2 className="mt-2 font-serif text-2xl font-bold text-foreground md:text-3xl lg:text-4xl">
              {hub.name}
            </h2>

            <p className="mt-4 text-sm md:text-base leading-relaxed text-muted-foreground">
              {hub.description}
            </p>

            <div className="mt-5 flex items-center gap-3 text-xs md:text-sm text-muted-foreground border-y border-border/60 py-3.5">
              <div className="flex items-center gap-1.5">
                <MapPin className="size-4 text-accent shrink-0" />
                <span>{hub.district}, {hub.city}</span>
              </div>
              <span>&middot;</span>
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Compass className="size-4 text-accent shrink-0" />
                <span>{hub.zones.length} Assigned Geofence Zones</span>
              </div>
            </div>

            {/* Managed Geofence Zones Preview */}
            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Assigned Geofence Perimeters:
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {hub.zones.map((zone) => (
                  <div
                    key={zone.id}
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-card/60 p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <ShieldCheck className="size-3.5 text-accent shrink-0" />
                      <span className="font-semibold text-foreground truncate">{zone.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground ml-2 shrink-0">
                      {zone.boundaryType}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-7 flex items-center gap-4">
              <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-xs">
                <Link href={`/locations/${hub.slug}`}>
                  <span>View Hub Details</span>
                  <ArrowRight className="size-4 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
