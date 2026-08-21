import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, CheckCircle2, ShieldCheck, MapPin, Package, CreditCard, WifiOff, Lock, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SectionHeader } from "@/components/section-header"
import { siteConfig, systemModules } from "@/lib/data"

export const metadata: Metadata = {
  title: "Core Modules",
  description:
    "Explore the architectural modules of the MKBRiderTrack enterprise platform. From biometric facial verification and spatial geofencing to daily parcel tracking and automated cutoff payroll.",
  openGraph: {
    title: `Core Modules | ${siteConfig.name}`,
    description:
      "Explore the architectural modules of the MKBRiderTrack enterprise platform.",
    url: `${siteConfig.url}/modules`,
    images: [{ url: "/images/og-image.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Core Modules | ${siteConfig.name}`,
    description:
      "Explore the architectural modules of the MKBRiderTrack enterprise platform.",
  },
  alternates: { canonical: `${siteConfig.url}/modules` },
}

export default function ModulesPage() {
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:5173"

  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[44vh] items-center overflow-hidden bg-primary">
        <div className="absolute inset-0">
          <Image
            src="https://images.pexels.com/photos/6169123/pexels-photo-6169123.jpeg?auto=compress&cs=tinysrgb&w=1200"
            alt="Logistics data visualization"
            fill
            className="object-cover opacity-30"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/60 to-primary/30" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-24 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1 mb-4 backdrop-blur-md">
            <span className="flex size-2 rounded-full bg-accent animate-pulse" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Architecture & Capabilities
            </p>
          </div>
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight tracking-tight text-primary-foreground md:text-6xl lg:text-7xl">
            Enterprise Logistics Modules
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-primary-foreground/80 md:text-lg">
            MKBRiderTrack combines biometric verification, spatial geofencing telemetry, daily parcel rate calculations, and server-authoritative payroll workflows into one unified platform.
          </p>
        </div>
      </section>

      {/* System Modules List */}
      <section className="bg-background py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <SectionHeader
            label="System Architecture"
            title="Core Functional Pillars"
            description="Explore the complete operational capabilities engineered for couriers, dispatchers, HR administrators, and payroll controllers."
          />

          <div className="mt-16 flex flex-col gap-16 lg:gap-24">
            {systemModules.map((module, index) => {
              const isEven = index % 2 === 0
              return (
                <div
                  id={module.id}
                  key={module.id}
                  className={`grid items-center gap-10 lg:grid-cols-12 lg:gap-16 scroll-mt-24 ${
                    !isEven ? "lg:[direction:rtl]" : ""
                  }`}
                >
                  {/* Module Image */}
                  <div className="lg:col-span-6 lg:[direction:ltr]">
                    <div className="relative aspect-[16/11] overflow-hidden rounded-2xl border border-border/80 bg-card shadow-lg group">
                      <Image
                        src={module.image}
                        alt={module.title}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                        sizes="(max-width: 1024px) 100vw, 50vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent" />
                      <div className="absolute top-4 left-4">
                        <Badge className="bg-background/95 text-foreground border-border/60 backdrop-blur-md text-xs font-semibold px-3 py-1">
                          {module.badge}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Module Details */}
                  <div className="lg:col-span-6 lg:[direction:ltr] flex flex-col justify-center">
                    <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-accent">
                      <span>{module.category}</span>
                      <span>&middot;</span>
                      <span className="text-muted-foreground">{module.tagline}</span>
                    </div>

                    <h2 className="mt-3 font-serif text-2xl font-bold text-foreground md:text-3xl lg:text-4xl">
                      {module.title}
                    </h2>

                    <p className="mt-4 text-sm md:text-base leading-relaxed text-muted-foreground">
                      {module.description}
                    </p>

                    {/* Features List */}
                    <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                      {module.features.map((feature) => (
                        <div key={feature} className="flex items-start gap-2.5">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                          <span className="text-xs md:text-sm font-medium text-foreground">
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-8 flex items-center gap-4">
                      <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-xs">
                        <Link href="/contact">
                          <span>Request Implementation</span>
                          <ArrowRight className="size-4 ml-1" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="border-border hover:border-accent/40">
                        <Link href={dashboardUrl}>
                          Access Portal
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-secondary py-20 lg:py-28 border-t border-border/40 text-center">
        <div className="mx-auto max-w-4xl px-4 lg:px-8">
          <SectionHeader
            label="Integration & Deployment"
            title="Deploy MKBRiderTrack Across Your Fleet"
            description="Our modular architecture is ready to integrate with your existing dispatch hubs and courier rosters."
          />
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 px-7 shadow-md">
              <Link href="/contact">
                <span>Schedule a Demo</span>
                <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-border hover:border-accent/40 px-7">
              <Link href="/locations">View Operational Hubs</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
