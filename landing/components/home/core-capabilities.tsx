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
import { Magnetic } from "@/components/animations/magnetic"
import { featuredCapabilities } from "@/lib/data"

export function CoreCapabilities() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger)

      gsap.to(".parallax-bg", {
        yPercent: 10,
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
    <section ref={containerRef} className="relative border-b border-border bg-background py-20 lg:py-28 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeader
          label="03 // SYSTEM CAPABILITIES"
          title="Engineered for Operational Integrity"
          description="Discover the core architectural pillars powering courier attendance verification, live route geofencing, parcel delivery rates, and automated payroll."
        />

        <AnimateIn
          from={{ opacity: 0, y: 30 }}
          stagger={0.12}
          className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {featuredCapabilities.map((capability) => (
            <Link
              key={capability.id}
              href={capability.href}
              className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-bryl transition-all duration-300 hover:border-accent/50 hover:-translate-y-1"
            >
              <div>
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-border bg-secondary">
                  <Image
                    src={capability.image || "/placeholder.jpg"}
                    alt={capability.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                  <div className="absolute top-2.5 left-2.5">
                    <span className="inline-block rounded-md border border-accent/30 bg-background/90 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-accent backdrop-blur-md">
                      {capability.category}
                    </span>
                  </div>
                </div>

                <h3 className="mt-4 font-sans text-base font-bold text-foreground transition-colors group-hover:text-accent">
                  {capability.name}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                  {capability.description}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-border pt-3.5">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">
                  {capability.status}
                </span>
                <span className="flex items-center gap-1 font-mono text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-accent">
                  <span>Explore</span>
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          ))}
        </AnimateIn>

        <AnimateIn delay={0.3} className="mt-12 text-center flex justify-center">
          <Magnetic>
            <Button
              asChild
              size="sm"
              className="h-10 bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-xs rounded-md px-5 shadow-xs cursor-pointer"
            >
              <Link href="/modules">
                <span>View All 7 Capabilities</span>
                <ArrowRight className="size-3.5 ml-1.5" />
              </Link>
            </Button>
          </Magnetic>
        </AnimateIn>
      </div>
    </section>
  )
}
