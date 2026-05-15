import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/section-header"
import { TimelineSection } from "@/components/about/timeline-section"
import { siteConfig, storyTimeline } from "@/lib/data"

export const metadata: Metadata = {
  title: "About System",
  description:
    "Learn about the evolution of the AttenRider Attendance Monitoring System and the philosophy driving our innovation.",
  openGraph: {
    title: `About System | ${siteConfig.name}`,
    description:
      "Learn about the evolution of the AttenRider Attendance Monitoring System.",
    url: `${siteConfig.url}/about`,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `About System | ${siteConfig.name}`,
    description:
      "Learn about the evolution of the AttenRider Attendance Monitoring System.",
  },
  alternates: { canonical: `${siteConfig.url}/about` },
}

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[50vh] items-center overflow-hidden bg-primary">
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
            A Legacy Built on Transparency and Intelligence
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-primary-foreground/80">
            Every great enterprise system stems from a critical operational bottleneck. Ours began with the fundamental need for visibility and accountability in rider workforce operations.
          </p>
        </div>
      </section>

      {/* The Origin */}
      <section className="bg-background py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <div className="relative">
              <div className="relative aspect-[4/5] overflow-hidden rounded-lg">
                <Image
                  src="https://images.pexels.com/photos/6169169/pexels-photo-6169169.jpeg?auto=compress&cs=tinysrgb&w=1200"
                  alt="HR team monitoring the first iteration of the AttenRider dashboard"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
              <div className="absolute -bottom-6 -right-6 rounded-lg bg-accent px-6 py-4">
                <p className="font-serif text-3xl font-bold text-accent-foreground">
                  Phase 1
                </p>
                <p className="text-xs font-medium text-accent-foreground/80">
                  Conception
                </p>
              </div>
            </div>
            <div>
              <SectionHeader
                label="Where It Began"
                title="From Buddy Punching to Biometric AI"
                align="left"
              />
              <div className="mt-6 space-y-4 text-base leading-relaxed text-muted-foreground">
                <p>
                  Traditional third-party logistics operations frequently struggle with buddy punching, inaccurate attendance, and inconsistent field visibility. The development of AttenRider was initiated to bridge this gap between manual record-keeping and digital accountability.
                </p>
                <p>
                  We started with a single node: eliminating time-theft. By outfitting our checkpoints with facial recognition software, we proved that biometric transparency could eliminate 100% of buddy punching disputes regarding rider attendance.
                </p>
                <p>
                  As the system scaled, we integrated advanced geofencing frameworks to ensure workforce integrity in the field. Today, AttenRider stands as a holistic ecosystem, seamlessly merging biometric verification, real-time boundary detection, and secure user management into one robust dashboard.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="bg-secondary py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <SectionHeader
            label="Our Philosophy"
            title="Core Engineering Principles"
            description="Three primary directives guide our architectural decisions and feature rollouts."
          />
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              {
                title: "Absolute Transparency",
                description:
                  "From the time-in terminal to the final shift hour, every movement is tracked, validated against geofences, and accessible in real-time by HR administrators.",
                image: "https://images.pexels.com/photos/6169584/pexels-photo-6169584.jpeg?auto=compress&cs=tinysrgb&w=800",
              },
              {
                title: "Geofence Compliance",
                description:
                  "We don't just log data; we actively validate it. Our system automatically checks rider coordinates against assigned operational zones and flags violations immediately.",
                image: "https://images.pexels.com/photos/6994156/pexels-photo-6994156.jpeg?auto=compress&cs=tinysrgb&w=800",
              },
              {
                title: "Workforce Security",
                description:
                  "Through biometric checkpoints and geofencing, we protect our operational integrity and ensure that the right people are managing the right assets.",
                image: "https://images.pexels.com/photos/8978630/pexels-photo-8978630.jpeg?auto=compress&cs=tinysrgb&w=800",
              },
            ].map((item) => (
              <div key={item.title} className="group">
                <div className="relative aspect-[3/2] overflow-hidden rounded-lg">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <h3 className="mt-6 font-serif text-xl font-bold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <TimelineSection />

      {/* CTA */}
      <section className="bg-primary py-20 text-center lg:py-28">
        <div className="mx-auto max-w-2xl px-4 lg:px-8">
          <h2 className="font-serif text-3xl font-bold text-primary-foreground md:text-4xl">
            Experience the AttenRider Difference
          </h2>
          <p className="mt-4 text-base leading-relaxed text-primary-foreground/70">
            Ready to upgrade your workforce intelligence infrastructure? Schedule a demonstration to see our attendance modules in action.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Link href="/locations">
                Request a Demo
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <Link href="/team">Meet the Core Team</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
