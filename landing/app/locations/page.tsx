import type { Metadata } from "next"
import { LocationsList } from "@/components/locations/locations-list"
import { siteConfig } from "@/lib/data"
import { getPublicHubs } from "@/lib/supabase/operations"

export const revalidate = 60 // Revalidate cache every 60 seconds

export const metadata: Metadata = {
  title: "Operations & Geofence Zones",
  description:
    "Explore the 4 physical logistics hubs and their calibrated geofence zones across Zamboanga City — Talon-Talon, Cabaluay, Baliwasan, and Ayala.",
  openGraph: {
    title: `Operations & Geofence Zones | ${siteConfig.name}`,
    description:
      "Explore the 4 physical logistics hubs and their calibrated geofence zones across Zamboanga City.",
    url: `${siteConfig.url}/locations`,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Operations & Geofence Zones | ${siteConfig.name}`,
    description:
      "Explore the 4 physical logistics hubs and their calibrated geofence zones across Zamboanga City.",
  },
  alternates: { canonical: `${siteConfig.url}/locations` },
}

export default async function LocationsPage() {
  const hubs = await getPublicHubs()

  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[42vh] items-center overflow-hidden border-b border-border bg-background">
        <div className="absolute inset-0 z-0">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover opacity-25"
          >
            <source src="https://www.pexels.com/download/video/4438865/" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/85 to-background" />
          <div className="absolute inset-0 bg-halftone-radial opacity-50 pointer-events-none" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1 mb-4 shadow-xs backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              [ 03 // OPERATIONS & GEOFENCES ]
            </p>
          </div>
          <h1 className="max-w-3xl font-sans text-3xl font-bold leading-tight tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Four Operations Hubs & Active Geofences
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            MKBRiderTrack oversees last-mile parcel distribution across Zamboanga City through four operational hubs, each enforcing calibrated polygon boundary geofences.
          </p>
        </div>
      </section>

      {/* Hubs & Zones List */}
      <LocationsList hubs={hubs} />
    </>
  )
}
