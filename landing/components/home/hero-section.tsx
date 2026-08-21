"use client"

import { useRef } from "react"
import Link from "next/link"
import { ArrowRight, ShieldCheck, MapPin, Package, CreditCard, ArrowUpRight } from "lucide-react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"
import { siteConfig } from "@/lib/data"
import { Magnetic } from "@/components/animations/magnetic"

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  const buttonContainerRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (!titleRef.current || !textRef.current) return

      const tl = gsap.timeline({
        defaults: { ease: "power4.out" },
      })

      // Background video subtle scale
      tl.to(bgRef.current, {
        scale: 1,
        duration: 2.5,
        ease: "power2.out",
      })

      // Badge reveal
      tl.fromTo(
        badgeRef.current,
        { y: -15, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8 },
        "-=2.2"
      )

      // Title animation - clean upward fade
      tl.to(titleRef.current, { opacity: 1, duration: 0.1 }, "-=2.0").fromTo(
        gsap.utils.toArray(titleRef.current.children),
        {
          y: 40,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          stagger: 0.1,
          duration: 1.0,
        },
        "-=1.9"
      )

      // Subtitle animation
      tl.fromTo(
        textRef.current,
        {
          y: 20,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
        },
        "-=1.2"
      )

      // Buttons animation
      tl.fromTo(
        buttonContainerRef.current,
        {
          y: 15,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
        },
        "-=0.9"
      )

      // Subtle parallax on scroll
      gsap.to(bgRef.current, {
        yPercent: 20,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      })
    },
    { scope: containerRef }
  )

  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:5173"

  return (
    <section
      ref={containerRef}
      className="relative flex min-h-[88vh] items-center overflow-hidden border-b border-border bg-background"
    >
      {/* Background Video in Natural Color with Subtle Overlay & Halftone Dissolution */}
      <div ref={bgRef} className="absolute inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="h-full w-full object-cover opacity-25 dark:opacity-30"
        >
          <source
            src="https://www.pexels.com/download/video/4281405/"
            type="video/mp4"
          />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/85 to-background" />
        <div className="absolute inset-0 bg-halftone-radial opacity-50 pointer-events-none" />
      </div>

      {/* Hero Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 lg:px-8 flex justify-center text-center">
        <div className="max-w-3xl flex flex-col items-center">
          {/* Micro Tag Status Badge */}
          <div
            ref={badgeRef}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1 shadow-xs backdrop-blur-md"
          >
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              [ 01 // FLEET WORKFORCE INTELLIGENCE ]
            </p>
          </div>

          {/* Title */}
          <h1
            ref={titleRef}
            className="font-sans text-4xl font-bold leading-[1.1] tracking-tight text-foreground opacity-0 sm:text-5xl md:text-6xl text-center"
          >
            <span className="block">Biometric Verification,</span>
            <span className="block text-muted-foreground font-normal">Spatial Fleet Geofencing &</span>
            <span className="block">Automated Logistics Payroll</span>
          </h1>

          {/* Subtitle */}
          <p
            ref={textRef}
            className="mt-6 mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground opacity-0 md:text-base text-center"
          >
            Enterprise workforce intelligence engineered for last-mile courier logistics. Sub-second 3D biometric verification, polygon geofence tracking, daily parcel rate matrices, and server-authoritative cutoff payroll.
          </p>

          {/* Action Buttons */}
          <div
            ref={buttonContainerRef}
            className="mt-8 flex flex-col gap-3 sm:flex-row justify-center items-center opacity-0"
          >
            <Magnetic>
              <Button
                asChild
                size="sm"
                className="h-10 bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-xs rounded-md px-5 shadow-sm cursor-pointer"
              >
                <Link href="/modules">
                  <span>Explore Capabilities</span>
                  <ArrowRight className="size-3.5 ml-1.5" />
                </Link>
              </Button>
            </Magnetic>
            <Magnetic>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-10 border-border bg-background/80 hover:bg-secondary text-foreground font-medium text-xs rounded-md px-5 cursor-pointer"
              >
                <Link href={dashboardUrl}>
                  <span>Access Portal</span>
                  <ArrowUpRight className="size-3.5 ml-1" />
                </Link>
              </Button>
            </Magnetic>
          </div>

          {/* System Highlights 4-Pillar Grid */}
          <div className="mt-12 grid grid-cols-2 gap-2.5 sm:grid-cols-4 max-w-3xl w-full border-t border-border pt-8 text-left">
            <div className="rounded-xl border border-border bg-card/70 p-3.5 shadow-bryl">
              <div className="flex items-center gap-2 text-accent mb-1">
                <ShieldCheck className="size-3.5 shrink-0 text-accent" />
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-accent">Biometrics</p>
              </div>
              <p className="text-xs font-semibold text-foreground">128-D + 3D Liveness</p>
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5">Sub-second match</p>
            </div>

            <div className="rounded-xl border border-border bg-card/70 p-3.5 shadow-bryl">
              <div className="flex items-center gap-2 text-accent mb-1">
                <MapPin className="size-3.5 shrink-0 text-accent" />
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-accent">Geofencing</p>
              </div>
              <p className="text-xs font-semibold text-foreground">Polygon Perimeter</p>
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5">Real-time alerts</p>
            </div>

            <div className="rounded-xl border border-border bg-card/70 p-3.5 shadow-bryl">
              <div className="flex items-center gap-2 text-accent mb-1">
                <Package className="size-3.5 shrink-0 text-accent" />
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-accent">Parcel Rates</p>
              </div>
              <p className="text-xs font-semibold text-foreground">Daily Rate Matrix</p>
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5">&gt;4kg Surcharges</p>
            </div>

            <div className="rounded-xl border border-border bg-card/70 p-3.5 shadow-bryl">
              <div className="flex items-center gap-2 text-accent mb-1">
                <CreditCard className="size-3.5 shrink-0 text-accent" />
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-accent">Payroll</p>
              </div>
              <p className="text-xs font-semibold text-foreground">Cutoff Readiness</p>
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5">Server-validated</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
