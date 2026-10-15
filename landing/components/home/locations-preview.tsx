"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, MapPin } from "lucide-react"
import { SectionHeader } from "@/components/section-header"
import { staticHubsList, hubMarketingMeta } from "@/lib/data"

export function LocationsPreview() {
  return (
    <section className="container section-space">
      <SectionHeader
        label="OPERATIONS NETWORK"
        title={
          <>
            Four operational hubs.
            <br />
            Calibrated coverage.
          </>
        }
        description="MKBRiderTrack coordinates last-mile fleet logistics through four dedicated fulfillment hubs, each managing calibrated geofence zones across Zamboanga City."
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mt-12" data-reveal>
        {staticHubsList.map((hub) => {
          const meta = hubMarketingMeta[hub.slug] || {
            tagline: "Operational Center",
            description: "Fulfillment and courier dispatch terminal in Zamboanga City.",
            image:
              "https://images.pexels.com/photos/7019213/pexels-photo-7019213.jpeg?auto=compress&cs=tinysrgb&w=1200",
            city: "Zamboanga City, 7000",
          }

          return (
            <Link
              key={hub.slug}
              href={`/locations/${hub.slug}`}
              className="group flex flex-col justify-between overflow-hidden rounded-md border border-[#e3e6da] bg-[#fafbf7] p-4 transition-all duration-200 hover:border-[#b5c39f] hover:-translate-y-0.5"
            >
              <div>
                <div className="relative aspect-[16/10] overflow-hidden rounded-sm bg-[#f0f2e9] border border-[#e8eae1]">
                  <Image
                    src={meta.image}
                    alt={hub.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 1024px) 100vw, 25vw"
                  />
                </div>
                <div className="pt-4">
                  <div className="eyebrow" style={{ fontSize: "8px", letterSpacing: "1.4px" }}>
                    <span />
                    {meta.tagline.toUpperCase()}
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-[#3b4234] group-hover:text-[var(--orange-dark)] transition-colors">
                    {hub.shortName}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-[#767a71] line-clamp-2">
                    {meta.description}
                  </p>
                  <div className="mt-4 flex items-center gap-1.5 border-t border-[#e7e8e2] pt-3 text-[11px] text-[#7d8374]">
                    <MapPin size={13} className="text-[var(--orange)] shrink-0" />
                    <span className="truncate">{hub.district}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <span className="text-link" style={{ fontSize: "11px" }}>
                  View Hub
                  <ArrowRight size={14} />
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      <div className="mt-10 flex justify-center" data-reveal>
        <Link href="/locations" className="button button-outline">
          View All Operational Hubs
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  )
}
