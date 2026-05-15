import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, MapPin, Clock, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SectionHeader } from "@/components/section-header"
import { LocationsList } from "@/components/locations/locations-list"
import { siteConfig, locations } from "@/lib/data"

export const metadata: Metadata = {
  title: "Geofence Zones",
  description:
    "Explore AttenRider's strategic geofence zones across the city, serving as the physical boundaries for our workforce monitoring systems.",
  openGraph: {
    title: `Geofence Zones | ${siteConfig.name}`,
    description:
      "Explore AttenRider's strategic geofence zones across the city.",
    url: `${siteConfig.url}/locations`,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Geofence Zones | ${siteConfig.name}`,
    description:
      "Explore AttenRider's strategic geofence zones across the city.",
  },
  alternates: { canonical: `${siteConfig.url}/locations` },
}

export default function LocationsPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[50vh] items-center overflow-hidden bg-primary">
        <div className="absolute inset-0">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover opacity-30"
          >
            <source src="https://www.pexels.com/download/video/4477603/" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/60 to-primary/30" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-24 lg:px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Geofence Zones
          </p>
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight tracking-tight text-primary-foreground md:text-6xl lg:text-7xl">
            Four Zones, One System
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-primary-foreground/80">
            Each strategic zone serves a unique monitoring purpose, combining
            strict boundary rules with our advanced AI and biometric architecture.
          </p>
        </div>
      </section>

      {/* Locations */}
      <section className="bg-background py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <LocationsList />
        </div>
      </section>

      {/* CTA */}
      <section className="bg-secondary py-20 text-center lg:py-28">
        <div className="mx-auto max-w-2xl px-4 lg:px-8">
          <SectionHeader
            label="Enterprise Solutions"
            title="Deploy AttenRider"
            description="Interested in deploying our biometric attendance modules or setting up your own operational zones? Contact our enterprise team to learn more."
          />
          <Button
            asChild
            size="lg"
            className="mt-8 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Link href="/contact">
              Contact Enterprise Team
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
