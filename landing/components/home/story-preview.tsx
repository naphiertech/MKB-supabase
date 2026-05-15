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
        y: -60,
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
        y: 60,
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
              from={{ opacity: 0, scale: 0.9, y: 30 }}
              stagger={0.2}
              className="relative grid grid-cols-2 gap-4"
            >
              <div className="space-y-4">
                <div className="parallax-col-1 space-y-4">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-lg">
                    <Image
                      src="https://images.pexels.com/photos/5860937/pexels-photo-5860937.jpeg?auto=compress&cs=tinysrgb&w=800"
                      alt="Biometric facial recognition attendance terminal"
                      fill
                      className="object-cover transition-transform duration-700 hover:scale-110"
                      sizes="(max-width: 1024px) 50vw, 25vw"
                    />
                  </div>
                  <div className="relative aspect-square overflow-hidden rounded-lg">
                    <Image
                      src="https://images.pexels.com/photos/10697106/pexels-photo-10697106.jpeg?auto=compress&cs=tinysrgb&w=800"
                      alt="Live workforce monitoring and geofencing map"
                      fill
                      className="object-cover transition-transform duration-700 hover:scale-110"
                      sizes="(max-width: 1024px) 50vw, 25vw"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-8 space-y-4">
                <div className="parallax-col-2 space-y-4">
                  <div className="relative aspect-square overflow-hidden rounded-lg">
                    <Image
                      src="https://images.pexels.com/photos/5498230/pexels-photo-5498230.jpeg?auto=compress&cs=tinysrgb&w=800"
                      alt="HR dashboard for rider attendance and payroll"
                      fill
                      className="object-cover transition-transform duration-700 hover:scale-110"
                      sizes="(max-width: 1024px) 50vw, 25vw"
                    />
                  </div>
                  <div className="relative aspect-[3/4] overflow-hidden rounded-lg">
                    <Image
                      src="https://images.pexels.com/photos/35665496/pexels-photo-35665496.jpeg?auto=compress&cs=tinysrgb&w=800"
                      alt="Digital workforce intelligence dashboard"
                      fill
                      className="object-cover transition-transform duration-700 hover:scale-110"
                      sizes="(max-width: 1024px) 50vw, 25vw"
                    />
                  </div>
                </div>
              </div>
              {/* Decorative accent */}
              <div className="absolute -bottom-4 -right-4 -z-10 h-32 w-32 rounded-full bg-accent/10" />
            </AnimateIn>

            {/* Text Content */}
            <AnimateIn delay={0.4}>
              <SectionHeader
                label="The Problem & Solution"
                title="Eliminating Buddy Punching"
                description="Traditional third-party logistics operations commonly encounter issues related to buddy punching, inaccurate attendance, and a lack of field visibility. AttenRider provides an integrated workforce management platform combining biometric facial recognition and geofencing boundary validation to ensure operational transparency and rider accountability."
                align="left"
              />
              <div className="mt-8 grid grid-cols-3 gap-6 border-t border-border pt-8">
                <div>
                  <p className="font-serif text-3xl font-bold text-accent">FaceNet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Recognition</p>
                </div>
                <div>
                  <p className="font-serif text-3xl font-bold text-accent">4</p>
                  <p className="mt-1 text-sm text-muted-foreground">Geofence Zones</p>
                </div>
                <div>
                  <p className="font-serif text-3xl font-bold text-accent">Live</p>
                  <p className="mt-1 text-sm text-muted-foreground">Rider Tracking</p>
                </div>
              </div>
              <Button asChild variant="link" className="mt-8 px-0 text-accent">
                <Link href="/about">
                  Read Full Documentation
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </AnimateIn>
          </div>
      </div>
    </section>
  )
}
