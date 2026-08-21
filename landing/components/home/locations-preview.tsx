"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, MapPin } from "lucide-react"
import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/section-header"
import { AnimateIn } from "@/components/animations/animate-in"
import { Magnetic } from "@/components/animations/magnetic"
import { staticHubsList, hubMarketingMeta } from "@/lib/data"

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
          y: 30,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.1,
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
    <section ref={containerRef} className="border-b border-border bg-background py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeader
          label="04 // OPERATIONS NETWORK"
          title="Four Operational Hubs"
          description="MKBRiderTrack coordinates last-mile fleet logistics through four dedicated fulfillment hubs, each managing calibrated geofence zones across Zamboanga City."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {staticHubsList.map((hub) => {
            const meta = hubMarketingMeta[hub.slug] || {
              tagline: "Operational Center",
              description: "Fulfillment and courier dispatch terminal in Zamboanga City.",
              image: "https://images.pexels.com/photos/7019213/pexels-photo-7019213.jpeg?auto=compress&cs=tinysrgb&w=1200",
              city: "Zamboanga City, 7000",
            }

            return (
              <Link
                key={hub.slug}
                href={`/locations/${hub.slug}`}
                className="location-card group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card shadow-bryl transition-all duration-300 hover:border-accent/50 hover:-translate-y-1"
              >
                <div>
                  <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
                    <Image
                      src={meta.image}
                      alt={hub.name}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      sizes="(max-width: 1024px) 100vw, 25vw"
                    />
                  </div>
                  <div className="p-4.5">
                    <div className="mb-2">
                      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">
                        {meta.tagline}
                      </p>
                      <h3 className="mt-0.5 font-sans text-base font-bold text-foreground transition-colors group-hover:text-accent">
                        {hub.shortName}
                      </h3>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                      {meta.description}
                    </p>
                    <div className="mt-3.5 flex items-center gap-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground font-mono">
                      <MapPin className="size-3 shrink-0 text-accent" />
                      <span className="truncate">{hub.district}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4.5 pt-0">
                  <div className="flex items-center gap-1 font-mono text-[11px] font-semibold text-accent transition-colors">
                    <span>View Hub</span>
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        <AnimateIn delay={0.3} className="mt-12 text-center flex justify-center">
          <Magnetic>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-10 border-border bg-background hover:bg-secondary hover:border-accent/40 text-foreground font-medium text-xs rounded-md px-5 shadow-xs"
            >
              <Link href="/locations">
                <span>View All Operational Hubs</span>
                <ArrowRight className="size-3.5 ml-1.5" />
              </Link>
            </Button>
          </Magnetic>
        </AnimateIn>
      </div>
    </section>
  )
}
