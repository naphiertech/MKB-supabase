import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Eyebrow } from "@/components/section-header"
import { LocationsList } from "@/components/locations/locations-list"
import { CtaSection } from "@/components/home/cta-section"
import { getPublicHubs } from "@/lib/supabase/operations"

export const revalidate = 60

export const metadata: Metadata = {
  title: "Operations & Geofence Zones",
  description:
    "Explore the 4 physical logistics hubs and their calibrated geofence zones across Zamboanga City — Talon-Talon, Cabaluay, Baliwasan, and Ayala.",
}

export default async function LocationsPage() {
  const hubs = await getPublicHubs()

  return (
    <>
      <section className="page-hero container">
        <div data-enter>
          <Eyebrow>OPERATIONS & GEOFENCES</Eyebrow>
        </div>
        <div className="page-hero-grid">
          <h1 data-enter>
            Four operations hubs &<br />
            <span>active geofences.</span>
          </h1>
          <div data-enter>
            <p className="lead">
              MKBRiderTrack oversees last-mile parcel distribution across Zamboanga City through four
              operational hubs, each enforcing calibrated polygon boundary geofences.
            </p>
            <Link
              href="/contact"
              className="text-link"
            >
              Contact <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <LocationsList hubs={hubs} />
      <CtaSection />
    </>
  )
}
