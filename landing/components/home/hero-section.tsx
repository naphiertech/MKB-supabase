"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, MapPin, Package, CreditCard } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/data";
import { Magnetic } from "@/components/animations/magnetic";

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!titleRef.current || !textRef.current) return;

      const tl = gsap.timeline({
        defaults: { ease: "power4.out" },
      });

      // Background scale entry
      tl.to(bgRef.current, {
        scale: 1,
        duration: 3,
        ease: "power2.out",
      });

      // Badge reveal
      tl.fromTo(
        badgeRef.current,
        { y: -20, opacity: 0 },
        { y: 0, opacity: 1, duration: 1 },
        "-=2.8"
      );

      // Title animation - animate the words in and reveal container
      tl.to(titleRef.current, { opacity: 1, duration: 0.1 }, "-=2.6").fromTo(
        gsap.utils.toArray(titleRef.current.children),
        {
          y: 80,
          opacity: 0,
          rotateX: -15,
        },
        {
          y: 0,
          opacity: 1,
          rotateX: 0,
          stagger: 0.12,
          duration: 1.3,
        },
        "-=2.4",
      );

      // Text animation
      tl.fromTo(
        textRef.current,
        {
          y: 30,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          duration: 1.1,
        },
        "-=1.4",
      );

      // Button container animation
      tl.fromTo(
        buttonContainerRef.current,
        {
          y: 20,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          duration: 1.1,
        },
        "-=1.0",
      );

      // Parallax effect on scroll
      gsap.to(bgRef.current, {
        yPercent: 25,
        scale: 1.15,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    },
    { scope: containerRef },
  );

  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:5173";

  return (
    <section
      ref={containerRef}
      className="relative flex min-h-[92vh] items-center overflow-hidden bg-primary"
    >
      {/* Background Video */}
      <div ref={bgRef} className="absolute inset-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="h-full w-full object-cover opacity-35"
        >
          <source
            src="https://www.pexels.com/download/video/4281405/"
            type="video/mp4"
          />
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/60 to-primary/20" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 lg:px-8 flex justify-center text-center">
        <div className="max-w-4xl flex flex-col items-center">
          <div ref={badgeRef} className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 backdrop-blur-md">
            <span className="flex size-2 rounded-full bg-accent animate-pulse" />
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
              Biometric Attendance &middot; Spatial Geofencing &middot; Automated Payroll
            </p>
          </div>

          <h1
            ref={titleRef}
            className="font-serif text-5xl font-bold leading-[1.08] tracking-tight text-primary-foreground opacity-0 md:text-7xl lg:text-8xl text-center"
          >
            {siteConfig.name.split(" ").map((word, i) => (
              <span key={i} className="block overflow-hidden">
                <span className="block text-center">
                  {word.startsWith("MKB") ? (
                    <span>
                      <span className="italic text-accent">{word.slice(0, 3)}</span>
                      {word.slice(3)}
                    </span>
                  ) : (
                    word
                  )}
                </span>
              </span>
            ))}
          </h1>

          <p
            ref={textRef}
            className="mt-6 mx-auto max-w-2xl text-base leading-relaxed text-primary-foreground/85 opacity-0 md:text-lg text-center"
          >
            Enterprise workforce intelligence engineered for last-mile courier logistics. Sub-second 3D biometric verification, polygon geofence tracking, daily parcel rate calculations, and server-authoritative cutoff payroll.
          </p>

          <div
            ref={buttonContainerRef}
            className="mt-9 flex flex-col gap-4 sm:flex-row justify-center items-center opacity-0"
          >
            <Magnetic>
              <Button
                asChild
                size="lg"
                className="bg-accent text-accent-foreground hover:bg-accent/90 cursor-pointer shadow-lg px-7"
              >
                <Link href="/modules">
                  <span>Explore Capabilities</span>
                  <ArrowRight className="size-4 ml-1" />
                </Link>
              </Button>
            </Magnetic>
            <Magnetic>
              <Button
                asChild
                size="lg"
                className="border border-primary-foreground/25 !bg-transparent text-primary-foreground hover:!bg-primary-foreground hover:!text-primary transition-all duration-300 cursor-pointer px-7"
              >
                <Link href={dashboardUrl}>
                  Access Portal
                </Link>
              </Button>
            </Magnetic>
          </div>

          {/* System Capability Highlight Badges */}
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4 max-w-3xl w-full border-t border-primary-foreground/15 pt-8 text-left">
            <div className="flex items-center gap-2.5 rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 p-3 backdrop-blur-sm">
              <ShieldCheck className="size-4 shrink-0 text-accent" />
              <div>
                <p className="text-xs font-semibold text-primary-foreground">Biometric Engine</p>
                <p className="text-[11px] text-primary-foreground/60">128-D + 3D Liveness</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 p-3 backdrop-blur-sm">
              <MapPin className="size-4 shrink-0 text-accent" />
              <div>
                <p className="text-xs font-semibold text-primary-foreground">Spatial Geofence</p>
                <p className="text-[11px] text-primary-foreground/60">Polygon Boundary Sync</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 p-3 backdrop-blur-sm">
              <Package className="size-4 shrink-0 text-accent" />
              <div>
                <p className="text-xs font-semibold text-primary-foreground">Parcel Rates</p>
                <p className="text-[11px] text-primary-foreground/60">Heavy Matrix & Surcharges</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 p-3 backdrop-blur-sm">
              <CreditCard className="size-4 shrink-0 text-accent" />
              <div>
                <p className="text-xs font-semibold text-primary-foreground">Cutoff Payroll</p>
                <p className="text-[11px] text-primary-foreground/60">Coverage-Based Readiness</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-primary-foreground/40">
            Scroll
          </span>
          <div className="h-8 w-px bg-gradient-to-b from-primary-foreground/40 to-transparent" />
        </div>
      </div>
    </section>
  );
}
