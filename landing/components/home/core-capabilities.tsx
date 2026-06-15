"use client"

import { useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SectionHeader } from "@/components/section-header"
import { AnimateIn } from "@/components/animations/animate-in"
import { Magnetic } from "@/components/animations/magnetic"
import { locations } from "@/lib/data"

// Pull one featured module from each zone
const featuredCapabilities = [
  { ...locations[0].capabilities.find((m) => m.name === "Biometric Time-In")!, locationSlug: locations[0].slug, locationName: locations[0].shortName },
  { ...locations[1].capabilities.find((m) => m.name === "Boundary Detection")!, locationSlug: locations[1].slug, locationName: locations[1].shortName },
  { ...locations[2].capabilities.find((m) => m.name === "Live Rider Map")!, locationSlug: locations[2].slug, locationName: locations[2].shortName },
]

export function CoreCapabilities() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger)

      gsap.to(".parallax-bg", {
        yPercent: 20,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      })
    },
    { scope: containerRef }
  )

  return (
    <section ref={containerRef} className="relative bg-secondary py-20 lg:py-28 overflow-hidden">
      {/* Parallax Background Decoration */}
      <div 
        className="parallax-bg absolute inset-0 pointer-events-none opacity-[0.03] grayscale invert dark:invert-0"
      >
        <div className="absolute inset-0 bg-[url('/images/hero-bg.jpg')] bg-cover bg-center" />
      </div>
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeader
          label="System Modules"
          title="Core Monitoring Capabilities"
          description="Discover the AI-driven features powering workforce intelligence and attendance monitoring."
        />

        <AnimateIn
          from={{ opacity: 0, y: 50 }}
          stagger={0.2}
          className="mt-14 grid gap-8 md:grid-cols-3"
        >
          {featuredCapabilities.map((capability) => (
            <Link
              key={capability.name}
              href={`/locations/${capability.locationSlug}`}
              className="group"
            >
              <div className="relative aspect-[4/5] overflow-hidden rounded-lg">
                <Image
                  src={capability.image || "/placeholder.jpg"}
                  alt={capability.name}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <Badge variant="secondary" className="mb-3 text-xs">
                    {capability.locationName}
                  </Badge>
                  <h3 className="font-serif text-2xl font-bold text-primary-foreground">
                    {capability.name}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-primary-foreground/70">
                    {capability.description}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-accent">
                    {capability.status}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </AnimateIn>

        <AnimateIn delay={0.6} className="mt-12 text-center flex justify-center">
          <Magnetic>
            <Button asChild variant="outline">
              <Link href="/locations">
                Explore All Zones
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </Magnetic>
        </AnimateIn>
      </div>
    </section>
  )
}
