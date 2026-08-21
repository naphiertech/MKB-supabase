import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building2, CheckCircle2, MapPin, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SectionHeader } from "@/components/section-header"
import { HubZoneMap } from "@/components/locations/hub-zone-map"
import { siteConfig, locations } from "@/lib/data"

export function generateStaticParams() {
  return locations.map((loc) => ({ slug: loc.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const hub = locations.find((l) => l.slug === slug)
  if (!hub) return {}

  return {
    title: hub.name,
    description: `Operational dispatch center, courier management, and assigned geofence perimeters for ${hub.name}.`,
    openGraph: {
      title: `${hub.name} | ${siteConfig.name}`,
      description: `Operational dispatch center and assigned geofence perimeters for ${hub.name}.`,
      url: `${siteConfig.url}/locations/${hub.slug}`,
      images: [{ url: "/images/og-image.jpg", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${hub.name} | ${siteConfig.name}`,
      description: `Operational dispatch center and assigned geofence perimeters for ${hub.name}.`,
    },
    alternates: { canonical: `${siteConfig.url}/locations/${hub.slug}` },
  }
}

export default async function HubDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const hub = locations.find((l) => l.slug === slug)
  if (!hub) notFound()

  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:5173"

  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[48vh] items-center overflow-hidden bg-primary">
        <div className="absolute inset-0">
          <Image
            src={hub.image}
            alt={hub.name}
            fill
            className="object-cover opacity-30"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/60 to-primary/30" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-24 lg:px-8">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="mb-6 text-primary-foreground/75 hover:text-primary-foreground hover:bg-primary-foreground/10"
          >
            <Link href="/locations">
              <ArrowLeft className="size-4 mr-1" />
              All Operational Hubs
            </Link>
          </Button>
          <div className="mb-4">
            <Badge className="bg-accent/20 text-accent border-accent/40 text-xs px-3 py-1 font-semibold">
              {hub.tagline}
            </Badge>
          </div>
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight tracking-tight text-primary-foreground md:text-6xl lg:text-7xl">
            {hub.name}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-primary-foreground/85 md:text-lg">
            {hub.description}
          </p>
        </div>
      </section>

      {/* Hub Status & Meta Bar */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <MapPin className="size-5 shrink-0 text-accent" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</p>
              <p className="text-sm font-semibold text-card-foreground">
                {hub.district}, {hub.city}
              </p>
            </div>
          </div>
          <Separator orientation="vertical" className="hidden h-8 md:block" />
          <div className="flex items-center gap-3">
            <Building2 className="size-5 shrink-0 text-accent" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Facility Scope</p>
              <p className="text-sm font-semibold text-card-foreground">
                Dispatch, Sorting & Fleet Oversight
              </p>
            </div>
          </div>
          <Separator orientation="vertical" className="hidden h-8 md:block" />
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 shrink-0 text-accent" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Operational Status</p>
              <p className="text-sm font-semibold text-emerald-500">
                Active Operational Hub
              </p>
            </div>
          </div>
          <Button
            asChild
            className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-xs"
          >
            <Link href={dashboardUrl}>Access Portal</Link>
          </Button>
        </div>
      </section>

      {/* Hub Coverage: Interactive Geofence Map */}
      <section className="bg-background py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <SectionHeader
            label="Hub Coverage"
            title="Assigned Geofence Zones"
            description={`Interactive spatial map visualizing calibrated geofence perimeters managed under ${hub.shortName}. Click any zone on the map or legend to focus its spatial boundary.`}
          />

          <div className="mt-12">
            <HubZoneMap hub={hub} />
          </div>
        </div>
      </section>

      {/* Hub Operations & Capabilities */}
      <section className="bg-secondary/60 py-16 lg:py-24 border-y border-border/40">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <SectionHeader
                label="Hub Management"
                title="Operational Infrastructure"
                description={`Centralized fleet logistics coordination, parcel drop intake, and spatial compliance workflows active at ${hub.shortName}.`}
                align="left"
              />
              <div className="mt-8 space-y-4">
                {hub.hubCapabilities.map((cap) => (
                  <div key={cap.name} className="flex items-start gap-3.5 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                    <CheckCircle2 className="mt-0.5 size-4 text-accent shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-foreground">{cap.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{cap.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border shadow-xl">
              <Image
                src={hub.image}
                alt={`${hub.name} operations facility`}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-transparent to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">Facility Deployment</p>
                <h4 className="mt-1 font-serif text-xl font-bold text-primary-foreground">{hub.name}</h4>
                <p className="text-xs text-primary-foreground/75 mt-1">{hub.district}, {hub.city}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sector Gallery */}
      <section className="bg-background py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <SectionHeader
            label="Field Perspective"
            title="Operational Territory Views"
            description={`Visual perspective of logistics corridors and fulfillment zones managed under ${hub.shortName}.`}
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {hub.gallery.map((img, i) => (
              <div key={i} className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border shadow-md">
                <Image
                  src={img}
                  alt={`${hub.name} perspective ${i + 1}`}
                  fill
                  className="object-cover transition-transform duration-700 hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
            ))}
          </div>

          <div className="mt-14 text-center">
            <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 px-7 shadow-md">
              <Link href="/locations">
                <ArrowLeft className="size-4 mr-1" />
                <span>Explore Other Hubs</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
