import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimateIn } from "@/components/animations/animate-in"
import { Magnetic } from "@/components/animations/magnetic"

export function CtaSection() {
  return (
    <section className="relative overflow-hidden border-t border-border bg-background py-20 lg:py-28">
      {/* Halftone Accent Texture */}
      <div className="absolute inset-0 bg-halftone opacity-40 pointer-events-none" />

      <AnimateIn className="relative z-10 mx-auto max-w-2xl px-4 text-center lg:px-8">
        <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          // ENTERPRISE DEPLOYMENT
        </p>
        <h2 className="font-sans text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
          Ready to Deploy MKBRiderTrack?
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
          Empower your operations, HR, and payroll teams with biometric integrity, real-time geofence tracking, and automated parcel delivery reconciliation.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Magnetic>
            <Button
              asChild
              size="sm"
              className="h-10 bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-xs rounded-md px-5 shadow-sm cursor-pointer"
            >
              <Link href="/contact">
                <span>Request a Demo</span>
                <ArrowRight className="size-3.5 ml-1.5" />
              </Link>
            </Button>
          </Magnetic>
          <Magnetic>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-10 border-border bg-background hover:bg-secondary text-foreground font-medium text-xs rounded-md px-5 shadow-xs cursor-pointer"
            >
              <Link href="/modules">Explore Capabilities</Link>
            </Button>
          </Magnetic>
        </div>
      </AnimateIn>
    </section>
  )
}
