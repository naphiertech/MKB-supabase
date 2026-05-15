"use client"
import { useRef } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"
import { siteConfig } from "@/lib/data"

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      // Ensure elements are available
      if (!titleRef.current || !textRef.current) return

      const tl = gsap.timeline({ 
        defaults: { ease: "power4.out" },
      })

      // Background scale entry
      tl.to(bgRef.current, {
        scale: 1,
        duration: 3,
        ease: "power2.out",
      })

      // Title animation - animate the words in and reveal container
      tl.to(titleRef.current, { opacity: 1, duration: 0.1 }, "-=2.8")
        .fromTo(
          gsap.utils.toArray(titleRef.current.children),
          {
            y: 100,
            opacity: 0,
            rotateX: -20,
          },
          {
            y: 0,
            opacity: 1,
            rotateX: 0,
            stagger: 0.15,
            duration: 1.5,
          },
          "-=2.5"
        )

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
          duration: 1.2,
        },
        "-=1.5"
      )



      // Parallax effect on scroll
      gsap.to(bgRef.current, {
        yPercent: 30,
        scale: 1.2,
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

  return (
    <section
      ref={containerRef}
      className="relative flex min-h-[90vh] items-center overflow-hidden bg-primary"
    >
      {/* Background Video */}
      <div ref={bgRef} className="absolute inset-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="h-full w-full object-cover opacity-40"
        >
          <source src="https://www.pexels.com/download/video/4281405/" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/50 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-24 lg:px-8">
        <div className="max-w-3xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            Biometric Attendance &middot; Geofencing &middot; Workforce Monitoring
          </p>
          <h1
            ref={titleRef}
            className="font-serif text-5xl font-bold leading-[1.1] tracking-tight text-primary-foreground opacity-0 md:text-7xl lg:text-8xl"
          >
            {siteConfig.name.split(" ").map((word, i) => (
              <span key={i} className="block overflow-hidden">
                <span className="block">
                  {word === "MKB" ? <span className="italic text-accent">{word}</span> : word}
                </span>
              </span>
            ))}
          </h1>
          <p
            ref={textRef}
            className="mt-6 max-w-lg text-lg leading-relaxed text-primary-foreground/80 opacity-0 md:text-xl"
          >
            {siteConfig.tagline}. {siteConfig.description.split(",")[0]}.
          </p>

        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-primary-foreground/40">
            Scroll
          </span>
          <div className="h-10 w-px bg-gradient-to-b from-primary-foreground/40 to-transparent" />
        </div>
      </div>
    </section>
  )
}
