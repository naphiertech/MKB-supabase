import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ShieldCheck, MapPin, Package, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/section-header"
import { TimelineSection } from "@/components/about/timeline-section"
import { siteConfig, getDashboardUrl } from "@/lib/data"

export const metadata: Metadata = {
  title: "Platform Overview",
  description:
    "Learn about the architectural evolution of the MKBRiderTrack workforce platform — from biometric facial verification to spatial geofencing and automated cutoff payroll.",
  openGraph: {
    title: `Platform Overview | ${siteConfig.name}`,
    description:
      "Learn about the architectural evolution of the MKBRiderTrack workforce platform.",
    url: `${siteConfig.url}/about`,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Platform Overview | ${siteConfig.name}`,
    description:
      "Learn about the architectural evolution of the MKBRiderTrack workforce platform.",
  },
  alternates: { canonical: `${siteConfig.url}/about` },
}

export default function AboutPage() {
  const dashboardUrl = getDashboardUrl()

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
            <source src="https://www.pexels.com/download/video/32750417/" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/85 to-background" />
          <div className="absolute inset-0 bg-halftone-radial opacity-50 pointer-events-none" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1 mb-4 shadow-xs backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              [ 01 // PLATFORM OVERVIEW ]
            </p>
          </div>
          <h1 className="max-w-3xl font-sans text-3xl font-bold leading-tight tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Built on Operational Integrity & Intelligence
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Every critical platform evolves from a tangible operational bottleneck. MKBRiderTrack was built to solve last-mile courier visibility, eliminate attendance disputes, and automate complex parcel compensation.
          </p>
        </div>
      </section>

      {/* The Origin & Evolution */}
      <section className="border-b border-border bg-background py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="relative">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-secondary shadow-bryl">
                <Image
                  src="https://images.pexels.com/photos/6169169/pexels-photo-6169169.jpeg?auto=compress&cs=tinysrgb&w=1200"
                  alt="Operations team monitoring workforce dispatch metrics"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
              <div className="absolute -bottom-4 -right-4 rounded-xl border border-accent/30 bg-background p-4 shadow-bryl">
                <p className="font-mono text-xl font-bold text-accent">
                  Phased
                </p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Evolution Model
                </p>
              </div>
            </div>
            <div>
              <SectionHeader
                label="01 // THE PROGRESSION"
                title="From Biometric Attendance to Complete Logistics Oversight"
                align="left"
              />
              <div className="mt-6 space-y-4 text-xs md:text-sm leading-relaxed text-muted-foreground">
                <p>
                  Third-party courier fleets have traditionally struggled with proxy attendance, ghost shifts, and disjointed delivery logs. The inception of MKBRiderTrack began by deploying on-device facial landmark verification with 3D liveness detection to create an airtight, biometric-authenticated attendance record.
                </p>
                <p>
                  As field operations expanded, the need for spatial discipline became paramount. We engineered real-time polygon geofence mapping, tracking active couriers against assigned delivery perimeters and triggering automatic incident notifications during unauthorized exits or prolonged idle delays.
                </p>
                <p>
                  Today, MKBRiderTrack has matured into a complete logistics intelligence ecosystem. The platform seamlessly links biometric attendance records with daily parcel operations, heavy surcharge rate matrices, and server-authoritative cutoff salary calculations across multiple operational fulfillment hubs.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="border-b border-border bg-background py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <SectionHeader
            label="02 // CORE PHILOSOPHY"
            title="Guiding Architectural Principles"
            description="Four core pillars govern every feature, workflow, and safeguard engineered into MKBRiderTrack."
          />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Biometric Truth",
                description:
                  "Sub-second neural face matching with 3D liveness checks ensures that every shift timestamp represents verified physical presence.",
                image: "https://images.pexels.com/photos/6169584/pexels-photo-6169584.jpeg?auto=compress&cs=tinysrgb&w=800",
              },
              {
                title: "Spatial Discipline",
                description:
                  "Polygon boundary enforcement tracks couriers within authorized delivery corridors, automatically flagging detours and perimeter exits.",
                image: "https://images.pexels.com/photos/6994156/pexels-photo-6994156.jpeg?auto=compress&cs=tinysrgb&w=800",
              },
              {
                title: "Auditable Parcel Rates",
                description:
                  "Daily package logs, >4kg heavy surcharge matrices, and append-only supervisor audits ensure transparent delivery compensation.",
                image: "https://images.pexels.com/photos/8978630/pexels-photo-8978630.jpeg?auto=compress&cs=tinysrgb&w=800",
              },
              {
                title: "Authoritative Payroll",
                description:
                  "Coverage-based readiness algorithms sync attendance and parcel throughput into immutable, server-approved payslips.",
                image: "https://images.pexels.com/photos/5498230/pexels-photo-5498230.jpeg?auto=compress&cs=tinysrgb&w=800",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-4.5 shadow-bryl transition-all duration-300 hover:border-accent/50 hover:-translate-y-1"
              >
                <div>
                  <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-secondary">
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    />
                  </div>
                  <h3 className="mt-4 font-sans text-sm font-bold text-foreground transition-colors group-hover:text-accent">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <TimelineSection />

      {/* Access Portal CTA */}
      <section className="border-t border-border bg-background py-16 text-center">
        <div className="mx-auto max-w-xl px-4">
          <h2 className="font-sans text-2xl font-bold tracking-tight text-foreground">
            Explore the Live Workforce Portal
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Log in with authorized dispatch, HR, or payroll credentials.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild size="sm" className="h-9 bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-mono uppercase shadow-xs">
              <Link href={dashboardUrl}>Access Portal &rarr;</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 border-border hover:bg-secondary text-xs">
              <Link href="/contact">Request System Demo</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
