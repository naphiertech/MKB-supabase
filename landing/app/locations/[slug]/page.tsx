import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  MapPin,
  ArrowLeft,
  ShieldCheck,
  Layers,
  ArrowUpRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/section-header"
import { HubZoneMap } from "@/components/locations/hub-zone-map"
import { siteConfig } from "@/lib/data"
import { getPublicHubs, getPublicHubBySlug } from "@/lib/supabase/operations"

export const revalidate = 60 // Revalidate cache every 60 seconds

interface HubPageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const hubs = await getPublicHubs()
  return hubs.map((hub) => ({
    slug: hub.slug,
  }))
}

export async function generateMetadata({ params }: HubPageProps): Promise<Metadata> {
  const { slug } = await params
  const hub = await getPublicHubBySlug(slug)

  if (!hub) {
    return {
      title: "Hub Not Found",
    }
  }

  return {
    title: `${hub.name} - Hub Operations & Geofences`,
    description: `Inspect active geofence perimeters and logistics operations for ${hub.name} in ${hub.district}, Zamboanga City.`,
    openGraph: {
      title: `${hub.name} - Hub Operations & Geofences | ${siteConfig.name}`,
      description: `Inspect active geofence perimeters and logistics operations for ${hub.name} in ${hub.district}, Zamboanga City.`,
      url: `${siteConfig.url}/locations/${hub.slug}`,
      images: [{ url: hub.image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${hub.name} - Hub Operations & Geofences | ${siteConfig.name}`,
      description: `Inspect active geofence perimeters and logistics operations for ${hub.name} in ${hub.district}, Zamboanga City.`,
    },
    alternates: { canonical: `${siteConfig.url}/locations/${hub.slug}` },
  }
}

export default async function HubDetailPage({ params }: HubPageProps) {
  const { slug } = await params
  const hub = await getPublicHubBySlug(slug)

  if (!hub) {
    notFound()
  }

  const allHubs = await getPublicHubs()
  const otherHubs = allHubs.filter((h) => h.slug !== hub.slug)
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:5173"

  return (
    <>
      {/* Hero Header */}
      <section className="border-b border-border bg-background py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <Link
            href="/locations"
            className="group mb-6 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-accent"
          >
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-1" />
            <span>Back to Operations Hubs</span>
          </Link>

          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-1 mb-3">
                <span className="size-1.5 rounded-full bg-accent animate-pulse" />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                  {hub.tagline}
                </span>
              </div>
              <h1 className="font-sans text-3xl font-bold tracking-tight text-foreground md:text-5xl">
                {hub.name}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-accent" />
                  <span>{hub.district}, {hub.city}</span>
                </div>
                <span>&middot;</span>
                <div className="flex items-center gap-1.5 text-foreground font-semibold">
                  <Layers className="size-3.5 text-accent" />
                  <span>{hub.zones.length} Assigned {hub.zones.length === 1 ? "Geofence" : "Geofences"}</span>
                </div>
              </div>

              <p className="mt-4 text-xs md:text-sm leading-relaxed text-muted-foreground">
                {hub.marketingDescription}
              </p>

              {hub.description && hub.description !== hub.marketingDescription && (
                <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-3.5 text-xs text-muted-foreground font-mono">
                  <span className="text-[10px] uppercase font-bold text-accent block mb-1">
                    Database Hub Notes
                  </span>
                  {hub.description}
                </div>
              )}
            </div>

            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-secondary shadow-bryl">
              <Image
                src={hub.image}
                alt={hub.name}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Geofence Map Section */}
      <section className="border-b border-border bg-background py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <SectionHeader
            label="01 // SPATIAL GEOFENCE MAP"
            title="Assigned Geofence Perimeters"
            description={`Explore the calibrated polygon boundaries assigned to ${hub.name}. Sourced live from the MKBRiderTrack Supabase operational database.`}
          />

          <div className="mt-10">
            <HubZoneMap hub={hub} />
          </div>
        </div>
      </section>

      {/* Hub Capabilities & Gallery */}
      <section className="border-b border-border bg-background py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Capabilities */}
            <div>
              <SectionHeader
                label="02 // FACILITY CAPABILITIES"
                title="Operational Infrastructure"
                align="left"
              />
              <div className="mt-6 flex flex-col gap-3">
                {hub.hubCapabilities.map((cap) => (
                  <div
                    key={cap.name}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-bryl"
                  >
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-sans text-sm font-bold text-foreground">{cap.name}</h3>
                        <span className="font-mono text-[9px] uppercase tracking-wider text-accent border border-accent/30 bg-accent/10 px-1.5 py-0.5 rounded">
                          {cap.category}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{cap.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gallery */}
            <div>
              <SectionHeader
                label="03 // FACILITY GALLERY"
                title="Inside the Hub"
                align="left"
              />
              <div className="mt-6 grid grid-cols-2 gap-3">
                {hub.gallery.map((img, i) => (
                  <div
                    key={i}
                    className="relative aspect-square overflow-hidden rounded-xl border border-border bg-secondary shadow-bryl"
                  >
                    <Image
                      src={img}
                      alt={`${hub.name} facility photo ${i + 1}`}
                      fill
                      className="object-cover transition-transform duration-500 hover:scale-[1.04]"
                      sizes="(max-width: 1024px) 50vw, 25vw"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Other Hubs */}
      {otherHubs.length > 0 && (
        <section className="border-b border-border bg-background py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <SectionHeader
              label="04 // OPERATIONS NETWORK"
              title="Other Operational Hubs"
              description="Explore additional logistics fulfillment centers across Zamboanga City."
            />
            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {otherHubs.map((other) => (
                <Link
                  key={other.slug}
                  href={`/locations/${other.slug}`}
                  className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-bryl transition-all duration-300 hover:border-accent/50 hover:-translate-y-1"
                >
                  <div>
                    <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-secondary">
                      <Image
                        src={other.image}
                        alt={other.name}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                    </div>
                    <div className="mt-3">
                      <p className="font-mono text-[9px] font-semibold uppercase tracking-wider text-accent">
                        {other.district}
                      </p>
                      <h3 className="mt-0.5 font-sans text-sm font-bold text-foreground transition-colors group-hover:text-accent">
                        {other.name}
                      </h3>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[11px] font-mono text-muted-foreground">
                    <span className="text-accent">{other.zones.length} Zones</span>
                    <span className="font-semibold text-accent group-hover:underline">
                      View Hub &rarr;
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Access Portal CTA */}
      <section className="bg-background py-16 text-center">
        <div className="mx-auto max-w-xl px-4">
          <h2 className="font-sans text-2xl font-bold tracking-tight text-foreground">
            Connect to {hub.name} Dispatch Portal
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Authorized supervisors can manage live rider rosters, check geofence breach alerts, and verify parcel cutoff logs.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild size="sm" className="h-9 bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-mono uppercase shadow-xs">
              <Link href={dashboardUrl}>
                <span>Launch Hub Dashboard</span>
                <ArrowUpRight className="size-3.5 ml-1" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 border-border hover:bg-secondary text-xs">
              <Link href="/contact">Request Hub Dispatch Access</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
