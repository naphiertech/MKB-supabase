"use client"

import { useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { ArrowRight } from "lucide-react"
import { SectionHeader } from "@/components/section-header"
import { AnimateIn } from "@/components/animations/animate-in"

export function StoryPreview() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger)

      // Column 1 Parallax (Moving Up)
      gsap.to(".parallax-col-1", {
        y: -35,
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
        y: 35,
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
    <section ref={containerRef} className="border-b border-border bg-background py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Image Grid with Hairline Framing and Natural Color */}
          <AnimateIn
            from={{ opacity: 0, scale: 0.98, y: 20 }}
            stagger={0.15}
            className="relative grid grid-cols-2 gap-3"
          >
            <div className="space-y-3">
              <div className="parallax-col-1 space-y-3">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-secondary shadow-bryl">
                  <Image
                    src="https://images.pexels.com/photos/5860937/pexels-photo-5860937.jpeg?auto=compress&cs=tinysrgb&w=800"
                    alt="Biometric facial recognition attendance terminal"
                    fill
                    className="object-cover transition-transform duration-500 hover:scale-[1.04]"
                    sizes="(max-width: 1024px) 50vw, 25vw"
                  />
                </div>
                <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-secondary shadow-bryl">
                  <Image
                    src="https://images.pexels.com/photos/10697106/pexels-photo-10697106.jpeg?auto=compress&cs=tinysrgb&w=800"
                    alt="Live workforce monitoring and geofencing map"
                    fill
                    className="object-cover transition-transform duration-500 hover:scale-[1.04]"
                    sizes="(max-width: 1024px) 50vw, 25vw"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              <div className="parallax-col-2 space-y-3">
                <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-secondary shadow-bryl">
                  <Image
                    src="https://images.pexels.com/photos/5498230/pexels-photo-5498230.jpeg?auto=compress&cs=tinysrgb&w=800"
                    alt="Operations dashboard for rider attendance and payroll"
                    fill
                    className="object-cover transition-transform duration-500 hover:scale-[1.04]"
                    sizes="(max-width: 1024px) 50vw, 25vw"
                  />
                </div>
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-secondary shadow-bryl">
                  <Image
                    src="https://images.pexels.com/photos/35665496/pexels-photo-35665496.jpeg?auto=compress&cs=tinysrgb&w=800"
                    alt="Digital workforce intelligence dashboard"
                    fill
                    className="object-cover transition-transform duration-500 hover:scale-[1.04]"
                    sizes="(max-width: 1024px) 50vw, 25vw"
                  />
                </div>
              </div>
            </div>
          </AnimateIn>

          {/* Text Content */}
          <AnimateIn delay={0.2}>
            <SectionHeader
              label="02 // THE PROBLEM & ARCHITECTURE"
              title="Eliminating Inaccuracies Across Last-Mile Operations"
              description="Traditional courier fleets encounter persistent challenges with buddy punching, unverified field locations, and complex manual parcel pay calculations. MKBRiderTrack resolves these operational bottlenecks through a single authoritative system integrating biometric verification, spatial geofencing, daily parcel rate tracking, and automated cutoff payroll."
              align="left"
            />

            {/* Stat Row with Hairline Dividers & Amber Accents */}
            <div className="mt-8 grid grid-cols-3 divide-x divide-border border-y border-border py-4">
              <div className="pr-4">
                <p className="font-mono text-2xl font-bold tracking-tight text-accent">128-D</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Vectors</p>
              </div>
              <div className="px-4">
                <p className="font-mono text-2xl font-bold tracking-tight text-accent">4 Hubs</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Centers</p>
              </div>
              <div className="pl-4">
                <p className="font-mono text-2xl font-bold tracking-tight text-accent">Auto</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Payroll</p>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/about"
                className="group inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent hover:underline"
              >
                <span>Explore Platform Architecture</span>
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </AnimateIn>
        </div>
      </div>
    </section>
  )
}
