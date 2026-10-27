import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  MapPin,
  ArrowLeft,
  ShieldCheck,
  Layers,
} from "lucide-react"
import { SectionHeader } from "@/components/section-header"
import { HubZoneMap } from "@/components/locations/hub-zone-map"
import { CtaSection } from "@/components/home/cta-section"
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

  return (
    <>
      {/* Hero Header */}
      <section className="container pt-12 pb-16">
        <Link
          href="/locations"
          className="text-link inline-flex items-center gap-1.5 mb-8 text-xs font-mono"
        >
          <ArrowLeft size={14} />
          <span>Back to Operations Hubs</span>
        </Link>

        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <div className="eyebrow mb-3" style={{ fontSize: "8px", letterSpacing: "1.4px" }}>
              <span />
              {hub.tagline.toUpperCase()}
            </div>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-[#282b26] md:text-5xl">
              {hub.name}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-xs text-[#70766a]">
              <div className="flex items-center gap-1.5">
                <MapPin size={14} className="text-[var(--orange)]" />
                <span>{hub.district}, {hub.city}</span>
              </div>
              <span>&middot;</span>
              <div className="flex items-center gap-1.5 text-[#282b26] font-semibold">
                <Layers size={14} className="text-[var(--orange)]" />
                <span>{hub.zones.length} Assigned {hub.zones.length === 1 ? "Geofence" : "Geofences"}</span>
              </div>
            </div>

            <p className="mt-4 text-xs md:text-sm leading-relaxed text-[#70766a]">
              {hub.marketingDescription}
            </p>

            {hub.description && hub.description !== hub.marketingDescription && (
              <div className="mt-5 rounded-md border border-[#e7e8e2] bg-[#f5f5ef] p-4 text-xs text-[#70766a] font-mono">
                <span className="text-[10px] uppercase font-bold text-[var(--orange)] block mb-1">
                  Database Hub Notes
                </span>
                {hub.description}
              </div>
            )}
          </div>

          <div className="relative aspect-[16/10] overflow-hidden rounded-md border border-[#e3e6da] bg-[#ffffff] shadow-sm">
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
      </section>

      {/* Interactive Geofence Map Section */}
      <section className="container section-space border-t border-[#e7e8e2]">
        <SectionHeader
          label="SPATIAL GEOFENCE MAP"
          title={<>Assigned Geofence Perimeters</>}
          description={`Explore the calibrated polygon boundaries assigned to ${hub.name}. Sourced live from the MKBRiderTrack Supabase operational database.`}
        />

        <div className="mt-10 overflow-hidden rounded-md border border-[#e7e8e2] bg-[#ffffff] p-2 shadow-sm">
          <HubZoneMap hub={hub} />
        </div>
      </section>

      {/* Hub Capabilities & Gallery */}
      <section className="container section-space border-t border-[#e7e8e2]">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Capabilities */}
          <div>
            <SectionHeader
              label="FACILITY CAPABILITIES"
              title={<>Operational Infrastructure</>}
              align="left"
            />
            <div className="mt-6 flex flex-col gap-3">
              {hub.hubCapabilities.map((cap) => (
                <div
                  key={cap.name}
                  className="flex items-start gap-3 rounded-md border border-[#e7e8e2] bg-[#ffffff] p-4 shadow-[0_2px_8px_rgba(40,43,38,0.03)]"
                >
                  <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--orange)]" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading text-sm font-bold text-[#282b26]">{cap.name}</h3>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--orange)] border border-[var(--orange)]/30 bg-[var(--orange)]/10 px-1.5 py-0.5 rounded">
                        {cap.category}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#70766a]">{cap.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Gallery */}
          <div>
            <SectionHeader
              label="FACILITY GALLERY"
              title={<>Inside the Hub</>}
              align="left"
            />
            <div className="mt-6 grid grid-cols-2 gap-3">
              {hub.gallery.map((img, i) => (
                <div
                  key={i}
                  className="relative aspect-square overflow-hidden rounded-md border border-[#e3e6da] bg-[#f5f5ef] shadow-sm"
                >
                  <Image
                    src={img}
                    alt={`${hub.name} facility photo ${i + 1}`}
                    fill
                    className="object-cover transition-transform duration-500 hover:scale-[1.03]"
                    sizes="(max-width: 1024px) 50vw, 25vw"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Other Hubs */}
      {otherHubs.length > 0 && (
        <section className="container section-space border-t border-[#e7e8e2]">
          <SectionHeader
            label="OPERATIONS NETWORK"
            title={<>Other Operational Hubs</>}
            description="Explore additional logistics fulfillment centers across Zamboanga City."
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {otherHubs.map((other) => (
              <Link
                key={other.slug}
                href={`/locations/${other.slug}`}
                className="group flex flex-col justify-between overflow-hidden rounded-md border border-[#e7e8e2] bg-[#ffffff] p-5 shadow-[0_2px_12px_rgba(40,43,38,0.04)] transition-all duration-300 hover:border-[#f3682c]/40 hover:-translate-y-1"
              >
                <div>
                  <div className="relative aspect-[16/10] overflow-hidden rounded-md bg-[#f5f5ef]">
                    <Image
                      src={other.image}
                      alt={other.name}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  </div>
                  <div className="mt-4">
                    <p className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--orange)]">
                      {other.district}
                    </p>
                    <h3 className="mt-0.5 font-heading text-base font-bold text-[#282b26] transition-colors group-hover:text-[var(--orange)]">
                      {other.name}
                    </h3>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#e7e8e2] pt-3 text-[11px] font-mono text-[#70766a]">
                  <span className="text-[var(--orange)]">{other.zones.length} Zones</span>
                  <span className="font-semibold text-[var(--orange)] group-hover:underline">
                    View Hub &rarr;
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Contact CTA */}
      <CtaSection />
    </>
  )
}
