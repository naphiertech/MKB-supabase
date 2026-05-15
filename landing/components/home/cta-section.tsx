import Link from "next/link"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

import { AnimateIn } from "@/components/animations/animate-in"

export function CtaSection() {
  return (
    <section className="relative overflow-hidden bg-background py-20 lg:py-28">
      <div className="absolute inset-0">
        <Image
          src="https://images.pexels.com/photos/1427541/pexels-photo-1427541.jpeg?auto=compress&cs=tinysrgb&w=1200"
          alt=""
          fill
          className="object-cover opacity-10"
          sizes="100vw"
        />
      </div>
      <AnimateIn className="relative z-10 mx-auto max-w-3xl px-4 text-center lg:px-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Ready to Optimize?
        </p>
        <h2 className="font-serif text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
          Ready to Deploy AttenRider?
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
          Integrate our biometric attendance and geofencing system to
          eliminate buddy punching and enhance operational transparency.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
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
          <Button asChild size="lg" variant="outline">
            <Link href="/contact">Contact Us</Link>
          </Button>
        </div>
      </AnimateIn>
    </section>
  )
}
