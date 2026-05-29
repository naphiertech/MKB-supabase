"use client"

import { useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { ArrowRight, MapPin, Clock, Phone } from "lucide-react"
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
          // Image slide + reveal effect
          gsap.fromTo(
            image,
            {
              opacity: 0,
              x: isEven ? -100 : 100,
              clipPath: isEven ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)",
            },
            {
              opacity: 1,
              x: 0,
              clipPath: "inset(0 0% 0 0%)",
              duration: 1.2,
              ease: "power3.out",
              scrollTrigger: {
                trigger: row,
                start: i === 0 ? "top bottom" : "top 75%",
                toggleActions: "play none none reverse",
              },
            },
          )

          // Info slide + fade effect
          gsap.fromTo(
            info,
            {
              opacity: 0,
              x: isEven ? 80 : -80,
              filter: "blur(10px)",
            },
            {
              opacity: 1,
              x: 0,
              filter: "blur(0px)",
              duration: 1,
              delay: 0.3,
              ease: "power2.out",
              scrollTrigger: {
                trigger: row,
                start: i === 0 ? "top bottom" : "top 75%",
                toggleActions: "play none none reverse",
              },
            },
          )

          // Subtle parallax on the image content itself
          const imgContent = image.querySelector("img")
          if (imgContent) {
            gsap.to(imgContent, {
              yPercent: 10,
              ease: "none",
              scrollTrigger: {
                trigger: row,
                start: "top bottom",
                end: "bottom top",
                scrub: true,
              },
            })
          }
        }
      })
    },
    { scope: containerRef },
  )

  return (
    <div ref={containerRef} className="flex flex-col gap-20 lg:gap-32">
      {locations.map((location, index) => (
        <div
          key={location.slug}
          className={`location-row grid items-center gap-12 lg:grid-cols-2 lg:gap-20 ${
            index % 2 !== 0 ? "lg:[direction:rtl]" : ""
          }`}
        >
          {/* Image */}
          <div className="location-image lg:[direction:ltr]">
            <Link
              href={`/locations/${location.slug}`}
              className="group relative block aspect-[4/3] overflow-hidden rounded-lg"
            >
              <Image
                src={location.image}
                alt={location.name}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </div>

          {/* Info */}
          <div className="location-info lg:[direction:ltr]">
            <Badge variant="outline" className="mb-4">
              {location.tagline}
            </Badge>
            <h2 className="font-serif text-3xl font-bold text-foreground md:text-4xl">{location.name}</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">{location.description}</p>

            <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                <span className="text-sm text-muted-foreground">
                  {location.address}, {location.city}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 size-4 shrink-0 text-accent" />
                <span className="text-sm text-muted-foreground">{location.phone}</span>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 size-4 shrink-0 text-accent" />
                <div className="flex flex-col gap-1">
                  {location.hours.map((h) => (
                    <span key={h.days} className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{h.days}:</span> {h.time}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="mt-6 flex flex-wrap gap-2">
              {location.features.map((feature) => (
                <Badge key={feature} variant="secondary">
                  {feature}
                </Badge>
              ))}
            </div>

            <Button asChild className="mt-8" size="lg">
              <Link href={`/locations/${location.slug}`}>
                View Zone Details
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
