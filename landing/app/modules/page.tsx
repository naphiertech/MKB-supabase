import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { CheckCircle2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/section-header"
import { systemModules, type SystemModule, siteConfig, getDashboardUrl } from "@/lib/data"

export const metadata: Metadata = {
  title: "Core Capabilities",
  description:
    "Explore the core capabilities of the MKBRiderTrack enterprise platform — biometric attendance, facial recognition, geofencing, parcel rates, payroll, multi-hub dispatch, and audit trails.",
  openGraph: {
    title: `Core Capabilities | ${siteConfig.name}`,
    description:
      "Explore the core capabilities of the MKBRiderTrack enterprise platform.",
    url: `${siteConfig.url}/modules`,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Core Capabilities | ${siteConfig.name}`,
    description:
      "Explore the core capabilities of the MKBRiderTrack enterprise platform.",
  },
  alternates: { canonical: `${siteConfig.url}/modules` },
}

export default function ModulesPage() {
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
            <source src="https://www.pexels.com/download/video/3045163/" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/85 to-background" />
          <div className="absolute inset-0 bg-halftone-radial opacity-50 pointer-events-none" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1 mb-4 shadow-xs backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              [ 02 // SYSTEM CAPABILITIES ]
            </p>
          </div>
          <h1 className="max-w-3xl font-sans text-3xl font-bold leading-tight tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Integrated Pillars of Last-Mile Intelligence
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Every module in MKBRiderTrack is engineered to operate as a coordinated system — ensuring end-to-end transparency from rider check-in to finalized salary disbursement.
          </p>
        </div>
      </section>

      {/* Modules List */}
      <section className="border-b border-border bg-background py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="flex flex-col gap-20">
            {systemModules.map((mod: SystemModule, index: number) => {
              const isEven = index % 2 === 0
              return (
                <article
                  key={mod.id}
                  id={mod.id}
                  className="scroll-mt-24 border-b border-border/60 pb-16 last:border-b-0 last:pb-0"
                >
                  <div
                    className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-14 ${
                      isEven ? "" : "lg:grid-flow-dense"
                    }`}
                  >
                    {/* Media */}
                    <div className={isEven ? "" : "lg:col-start-2"}>
                      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-card shadow-bryl">
                        <Image
                          src={mod.image}
                          alt={mod.title}
                          fill
                          className="object-cover transition-transform duration-500 hover:scale-[1.04]"
                          sizes="(max-width: 1024px) 100vw, 50vw"
                        />
                      </div>
                    </div>

                    {/* Content */}
                    <div className={isEven ? "" : "lg:col-start-1"}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-accent border border-accent/30 bg-accent/15 px-2 py-0.5 rounded">
                          {mod.category}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          MOD-0{index + 1}
                        </span>
                      </div>
                      <h2 className="font-sans text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                        {mod.title}
                      </h2>
                      <p className="mt-3 text-xs md:text-sm leading-relaxed text-muted-foreground">
                        {mod.description}
                      </p>

                      {/* Feature Checklist */}
                      {mod.features && mod.features.length > 0 && (
                        <div className="mt-6">
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-accent mb-2.5">
                            Key Architectural Specifications
                          </p>
                          <ul className="grid gap-2 sm:grid-cols-2">
                            {mod.features.map((feature: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-accent" />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="mt-7 flex items-center gap-3">
                        <Button asChild size="sm" className="h-9 bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-mono uppercase shadow-xs">
                          <Link href={dashboardUrl}>
                            <span>Launch Module</span>
                            <ArrowRight className="size-3.5 ml-1.5" />
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="h-9 border-border text-xs">
                          <Link href="/contact">Request Spec Sheet</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-background py-16 text-center border-t border-border">
        <div className="mx-auto max-w-xl px-4">
          <SectionHeader
            label="03 // DEPLOYMENT INQUIRY"
            title="Integrate MKBRiderTrack Today"
            description="Our operations team can set up biometric terminal enrollment and polygon zone calibration for your courier fleet within 48 hours."
          />
          <div className="mt-7 flex justify-center gap-3">
            <Button asChild size="sm" className="h-9 bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-mono uppercase shadow-xs">
              <Link href="/contact">Schedule Technical Consultation &rarr;</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
