import type { Metadata } from "next"
import { ArrowUpRight } from "lucide-react"
import { Eyebrow } from "@/components/section-header"
import { TeamGrid } from "@/components/team/team-grid"
import { JoinBanner } from "@/components/team/join-banner"
import { CtaSection } from "@/components/home/cta-section"
import { siteConfig, getDashboardUrl } from "@/lib/data"

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
  const dashboardUrl = getDashboardUrl()

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
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              Access Portal <ArrowUpRight size={18} />
            </a>
          </div>
        </div>
      </section>

      <TeamGrid />
      <JoinBanner />
      <CtaSection />
    </>
  )
}
