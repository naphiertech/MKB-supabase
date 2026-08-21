import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ShieldCheck, MapPin, Package, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/section-header"
import { TimelineSection } from "@/components/about/timeline-section"
import { siteConfig } from "@/lib/data"

export const metadata: Metadata = {
  title: "About System",
  description:
    "Learn about the architectural evolution of the MKBRiderTrack workforce platform — from biometric facial verification to spatial geofencing and automated cutoff payroll.",
  openGraph: {
    title: `About System | ${siteConfig.name}`,
    description:
      "Learn about the architectural evolution of the MKBRiderTrack workforce platform.",
    url: `${siteConfig.url}/about`,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `About System | ${siteConfig.name}`,
    description:
      "Learn about the architectural evolution of the MKBRiderTrack workforce platform.",
  },
  alternates: { canonical: `${siteConfig.url}/about` },
}

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[46vh] items-center overflow-hidden bg-primary">
        <div className="absolute inset-0">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover opacity-30"
          >
            <source src="https://www.pexels.com/download/video/32750417/" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/60 to-primary/30" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-24 lg:px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            System Overview
          </p>
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight tracking-tight text-primary-foreground md:text-6xl lg:text-7xl">
            Built on Operational Integrity & Intelligence
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-primary-foreground/80 md:text-lg">
            Every critical platform evolves from a tangible operational bottleneck. MKBRiderTrack was built to solve last-mile courier visibility, eliminate attendance disputes, and automate complex parcel compensation.
          </p>
        </div>
      </section>

      {/* The Origin & Evolution */}
      <section className="bg-background py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <div className="relative">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-muted shadow-xl">
                <Image
                  src="https://images.pexels.com/photos/6169169/pexels-photo-6169169.jpeg?auto=compress&cs=tinysrgb&w=1200"
                  alt="Operations team monitoring workforce dispatch metrics"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
              <div className="absolute -bottom-6 -right-6 rounded-xl bg-accent px-6 py-4 shadow-lg">
                <p className="font-serif text-3xl font-bold text-accent-foreground">
                  Phased
                </p>
                <p className="text-xs font-medium text-accent-foreground/90 uppercase tracking-wider">
                  Evolution
                </p>
              </div>
            </div>
            <div>
              <SectionHeader
                label="The Progression"
                title="From Biometric Attendance to Complete Logistics Oversight"
                align="left"
              />
              <div className="mt-6 space-y-4 text-sm md:text-base leading-relaxed text-muted-foreground">
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
      <section className="bg-secondary py-20 lg:py-28 border-y border-border/40">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <SectionHeader
            label="Core Philosophy"
            title="Guiding Architectural Principles"
            description="Four core pillars govern every feature, workflow, and safeguard engineered into MKBRiderTrack."
          />
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
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
              <div key={item.title} className="group flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-accent/40 hover:shadow-lg hover:-translate-y-1">
                <div>
                  <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-muted">
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    />
                  </div>
                  <h3 className="mt-5 font-serif text-lg font-bold text-foreground group-hover:text-accent transition-colors">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-xs md:text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <TimelineSection />

      {/* CTA */}
      <section className="bg-primary py-20 text-center lg:py-28 text-primary-foreground border-t border-border/20">
        <div className="mx-auto max-w-2xl px-4 lg:px-8">
          <h2 className="font-serif text-3xl font-bold text-primary-foreground md:text-4xl">
            Experience the MKBRiderTrack Platform
          </h2>
          <p className="mt-4 text-sm md:text-base leading-relaxed text-primary-foreground/75">
            Ready to upgrade your logistics workforce and payroll infrastructure? Schedule a demonstration with our engineering team.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-md px-7"
            >
              <Link href="/contact">
                <span>Request a Demo</span>
                <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground px-7"
            >
              <Link href="/team">Meet the Team</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
