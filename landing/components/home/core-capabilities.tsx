"use client"

import { useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { ArrowRight, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SectionHeader } from "@/components/section-header"
import { AnimateIn } from "@/components/animations/animate-in"
import { Magnetic } from "@/components/animations/magnetic"
import { featuredCapabilities } from "@/lib/data"

export function CoreCapabilities() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger)

      gsap.to(".parallax-bg", {
        yPercent: 15,
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
          label="System Capabilities"
          title="Engineered for Operational Integrity"
          description="Discover the core capabilities powering courier attendance verification, live route geofencing, parcel delivery rates, and automated payroll."
        />

        <AnimateIn
          from={{ opacity: 0, y: 40 }}
          stagger={0.15}
          className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {featuredCapabilities.map((capability) => (
            <Link
              key={capability.id}
              href={capability.href}
              className="group flex flex-col justify-between overflow-hidden rounded-xl border border-border/80 bg-card p-6 transition-all duration-300 hover:border-accent/50 hover:shadow-lg hover:-translate-y-1"
            >
              <div>
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-border/60 bg-muted">
                  <Image
                    src={capability.image || "/placeholder.jpg"}
                    alt={capability.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent" />
                  <div className="absolute top-3 left-3">
                    <Badge variant="secondary" className="bg-background/90 text-foreground backdrop-blur-md text-[11px] font-semibold">
                      {capability.category}
                    </Badge>
                  </div>
                </div>

                <h3 className="mt-5 font-serif text-xl font-bold text-foreground group-hover:text-accent transition-colors">
                  {capability.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-3">
                  {capability.description}
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-accent">
                  {capability.status}
                </span>
                <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-accent transition-colors">
                  Explore module
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          ))}
        </AnimateIn>

        <AnimateIn delay={0.4} className="mt-14 text-center flex justify-center">
          <Magnetic>
            <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-md">
              <Link href="/modules">
                <span>View All System Modules</span>
                <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>
          </Magnetic>
        </AnimateIn>
      </div>
    </section>
  )
}
