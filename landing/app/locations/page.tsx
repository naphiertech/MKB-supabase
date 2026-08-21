import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/section-header"
import { LocationsList } from "@/components/locations/locations-list"
import { siteConfig } from "@/lib/data"

export const metadata: Metadata = {
  title: "Operations Hubs",
  description:
    "Explore MKBRiderTrack's operational hubs across Zamboanga City. Each physical dispatch hub manages dedicated courier fleet assignments and calibrated polygon geofence zones.",
  openGraph: {
    title: `Operations Hubs | ${siteConfig.name}`,
    description:
      "Explore MKBRiderTrack's operational dispatch hubs across Zamboanga City.",
    url: `${siteConfig.url}/locations`,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Operations Hubs | ${siteConfig.name}`,
    description:
      "Explore MKBRiderTrack's operational dispatch hubs across Zamboanga City.",
  },
  alternates: { canonical: `${siteConfig.url}/locations` },
}

export default function LocationsPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[46vh] items-center overflow-hidden bg-primary">
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
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1 mb-4 backdrop-blur-md">
            <Building2 className="size-3.5 text-accent" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              MKB Operations Network
            </p>
          </div>
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight tracking-tight text-primary-foreground md:text-6xl lg:text-7xl">
            Operational Hubs
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-primary-foreground/80 md:text-lg">
            Physical dispatch and fulfillment centers managing courier fleet assignments, parcel reconciliation, and precision polygon geofence zones across Zamboanga City.
          </p>
        </div>
      </section>

      {/* Hubs List */}
      <section className="bg-background py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <LocationsList />
        </div>
      </section>

      {/* CTA */}
      <section className="bg-secondary py-20 text-center lg:py-28 border-t border-border/40">
        <div className="mx-auto max-w-2xl px-4 lg:px-8">
          <SectionHeader
            label="Hub Deployment & Scaling"
            title="Expand Your Fleet Operations"
            description="Need a new fulfillment hub or custom geofence perimeter configured for your logistics network? Our operations engineering team can calibrate your dispatch sectors."
          />
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-md px-7">
              <Link href="/contact">
                <span>Inquire About Hub Deployment</span>
                <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
