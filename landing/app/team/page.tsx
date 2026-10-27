import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Eyebrow } from "@/components/section-header"
import { TeamGrid } from "@/components/team/team-grid"
import { JoinBanner } from "@/components/team/join-banner"
import { CtaSection } from "@/components/home/cta-section"
import { siteConfig } from "@/lib/data"

export const metadata: Metadata = {
  title: "Team & Engineering",
  description:
    "Meet the engineering architects, computer vision specialists, and operations leads behind MKBRiderTrack.",
  openGraph: {
    title: `Team & Engineering | ${siteConfig.name}`,
    description:
      "Meet the engineering architects, computer vision specialists, and operations leads behind MKBRiderTrack.",
    url: `${siteConfig.url}/team`,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Team & Engineering | ${siteConfig.name}`,
    description:
      "Meet the engineering architects, computer vision specialists, and operations leads behind MKBRiderTrack.",
  },
  alternates: { canonical: `${siteConfig.url}/team` },
}

export default function TeamPage() {
  return (
    <>
      <section className="page-hero container">
        <div data-enter>
          <Eyebrow>ENGINEERING & OPERATIONS</Eyebrow>
        </div>
        <div className="page-hero-grid">
          <h1 data-enter>
            The team behind the<br />
            <span>architecture.</span>
          </h1>
          <div data-enter>
            <p className="lead">
              Engineers, spatial architects, and fleet supervisors working together to establish
              transparency and automation across last-mile courier operations.
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

      <TeamGrid />
      <JoinBanner />
      <CtaSection />
    </>
  )
}
