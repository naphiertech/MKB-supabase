import type { Metadata } from "next"
import { TeamHero } from "@/components/team/team-hero"
import { TeamGrid } from "@/components/team/team-grid"
import { JoinBanner } from "@/components/team/join-banner"
import { siteConfig } from "@/lib/data"

export const metadata: Metadata = {
  title: "Core Team",
  description:
    "Meet the developers, engineers, and AI experts who built the AttenRider Attendance Monitoring System.",
  openGraph: {
    title: `Core Team | ${siteConfig.name}`,
    description:
      "Meet the developers, engineers, and AI experts who built the AttenRider Attendance Monitoring System.",
    url: `${siteConfig.url}/team`,
    images: [{ url: "/images/og-image.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Core Team | ${siteConfig.name}`,
    description:
      "Meet the developers, engineers, and AI experts who built the AttenRider Attendance Monitoring System.",
  },
  alternates: { canonical: `${siteConfig.url}/team` },
}

export default function TeamPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[40vh] items-center overflow-hidden bg-primary">
        <div className="absolute inset-0">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover opacity-30"
          >
            <source src="https://www.pexels.com/download/video/4293549/" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/60 to-primary/30" />
        </div>
        <TeamHero
          label="Core Team"
          title="The Architects of Modern Monitoring"
          subtitle="Passionate, innovative, and deeply technical. Meet the individuals driving the AttenRider ecosystem forward."
        />
      </section>

      {/* Team Grid */}
      <TeamGrid />

      {/* Join Banner */}
      <JoinBanner />
    </>
  )
}
