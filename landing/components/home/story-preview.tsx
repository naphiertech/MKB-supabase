"use client"

import { useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/section-header"
import { AnimateIn } from "@/components/animations/animate-in"

export function StoryPreview() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger)

      // Column 1 Parallax (Moving Up)
      gsap.to(".parallax-col-1", {
        y: -50,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      })

      // Column 2 Parallax (Moving Down)
      gsap.to(".parallax-col-2", {
        y: 50,
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
    <section ref={containerRef} className="bg-background py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Image Grid */}
          <AnimateIn
            from={{ opacity: 0, scale: 0.95, y: 30 }}
            stagger={0.2}
            className="relative grid grid-cols-2 gap-4"
          >
            <div className="space-y-4">
              <div className="parallax-col-1 space-y-4">
                <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted">
                  <Image
                    src="https://images.pexels.com/photos/5860937/pexels-photo-5860937.jpeg?auto=compress&cs=tinysrgb&w=800"
                    alt="Biometric facial recognition attendance terminal"
                    fill
                    className="object-cover transition-transform duration-700 hover:scale-105"
                    sizes="(max-width: 1024px) 50vw, 25vw"
                  />
                </div>
                <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                  <Image
                    src="https://images.pexels.com/photos/10697106/pexels-photo-10697106.jpeg?auto=compress&cs=tinysrgb&w=800"
                    alt="Live workforce monitoring and geofencing map"
                    fill
                    className="object-cover transition-transform duration-700 hover:scale-105"
                    sizes="(max-width: 1024px) 50vw, 25vw"
                  />
                </div>
              </div>
            </div>
            <div className="mt-8 space-y-4">
              <div className="parallax-col-2 space-y-4">
                <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                  <Image
                    src="https://images.pexels.com/photos/5498230/pexels-photo-5498230.jpeg?auto=compress&cs=tinysrgb&w=800"
                    alt="Operations dashboard for rider attendance and payroll"
                    fill
                    className="object-cover transition-transform duration-700 hover:scale-105"
                    sizes="(max-width: 1024px) 50vw, 25vw"
                  />
                </div>
                <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted">
                  <Image
                    src="https://images.pexels.com/photos/35665496/pexels-photo-35665496.jpeg?auto=compress&cs=tinysrgb&w=800"
                    alt="Digital workforce intelligence dashboard"
                    fill
                    className="object-cover transition-transform duration-700 hover:scale-105"
                    sizes="(max-width: 1024px) 50vw, 25vw"
                  />
                </div>
              </div>
            </div>
            {/* Decorative accent */}
            <div className="absolute -bottom-4 -right-4 -z-10 h-32 w-32 rounded-full bg-accent/10" />
          </AnimateIn>

          {/* Text Content */}
          <AnimateIn delay={0.3}>
            <SectionHeader
              label="The Problem & Solution"
              title="Eliminating Inaccuracies Across Last-Mile Operations"
              description="Traditional logistics fleets encounter persistent challenges with buddy punching, unverified field locations, and complex manual parcel pay calculations. MKBRiderTrack resolves these operational bottlenecks through a single authoritative system integrating biometric verification, spatial geofencing, daily parcel rate tracking, and automated cutoff payroll."
              align="left"
            />
            <div className="mt-8 grid grid-cols-3 gap-4 border-t border-border pt-8">
              <div>
                <p className="font-serif text-2xl md:text-3xl font-bold text-accent">128-D</p>
                <p className="mt-1 text-xs md:text-sm text-muted-foreground">Biometric Vectors</p>
              </div>
              <div>
                <p className="font-serif text-2xl md:text-3xl font-bold text-accent">4 Hubs</p>
                <p className="mt-1 text-xs md:text-sm text-muted-foreground">Dispatch Centers</p>
              </div>
              <div>
                <p className="font-serif text-2xl md:text-3xl font-bold text-accent">Automated</p>
                <p className="mt-1 text-xs md:text-sm text-muted-foreground">Cutoff Payroll</p>
              </div>
            </div>
            <Button asChild variant="link" className="mt-8 px-0 text-accent font-semibold group">
              <Link href="/about">
                <span>Explore System Evolution</span>
                <ArrowRight className="size-4 ml-1 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </AnimateIn>
        </div>
      </div>
    </section>
  )
}
