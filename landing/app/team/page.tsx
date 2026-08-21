import type { Metadata } from "next"
import { TeamGrid } from "@/components/team/team-grid"
import { JoinBanner } from "@/components/team/join-banner"
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
            <source src="https://www.pexels.com/download/video/3196568/" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/85 to-background" />
          <div className="absolute inset-0 bg-halftone-radial opacity-50 pointer-events-none" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1 mb-4 shadow-xs backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              [ 04 // ENGINEERING & OPERATIONS ]
            </p>
          </div>
          <h1 className="max-w-3xl font-sans text-3xl font-bold leading-tight tracking-tight text-foreground md:text-5xl lg:text-6xl">
            The Team Behind the Architecture
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Engineers, spatial architects, and fleet supervisors working together to establish transparency and automation across last-mile courier operations.
          </p>
        </div>
      </section>

      <TeamGrid />
      <JoinBanner />
    </>
  )
}
