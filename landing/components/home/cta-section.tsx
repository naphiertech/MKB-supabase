import Link from "next/link"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimateIn } from "@/components/animations/animate-in"
import { Magnetic } from "@/components/animations/magnetic"

export function CtaSection() {
  return (
    <section className="relative overflow-hidden bg-background py-20 lg:py-28 border-t border-border/40">
      <div className="absolute inset-0">
        <Image
          src="https://images.pexels.com/photos/1427541/pexels-photo-1427541.jpeg?auto=compress&cs=tinysrgb&w=1200"
          alt=""
          fill
          className="object-cover opacity-5"
          sizes="100vw"
        />
      </div>
      <AnimateIn className="relative z-10 mx-auto max-w-3xl px-4 text-center lg:px-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
          Enterprise Fleet Deployment
        </p>
        <h2 className="font-serif text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
          Ready to Deploy MKBRiderTrack?
        </h2>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground md:text-lg">
          Empower your operations, HR, and payroll teams with biometric integrity, real-time geofence tracking, and automated parcel delivery reconciliation.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Magnetic>
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
          </Magnetic>
          <Magnetic>
            <Button asChild size="lg" variant="outline" className="border-border hover:border-accent/40 px-7">
              <Link href="/modules">Explore Modules</Link>
            </Button>
          </Magnetic>
        </div>
      </AnimateIn>
    </section>
  )
}
