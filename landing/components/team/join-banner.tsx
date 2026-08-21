"use client"

import { useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/section-header"

export function JoinBanner() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger)

      const content = containerRef.current?.querySelector(".banner-content")
      const image = containerRef.current?.querySelector(".banner-image")

      if (content && image) {
        gsap.fromTo(
          content,
          { opacity: 0, x: -30 },
          {
            opacity: 1,
            x: 0,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: {
              trigger: containerRef.current,
              start: "top 80%",
              toggleActions: "play none none reverse",
            },
          }
        )

        gsap.fromTo(
          image,
          { opacity: 0, x: 30 },
          {
            opacity: 1,
            x: 0,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: {
              trigger: containerRef.current,
              start: "top 80%",
              toggleActions: "play none none reverse",
            },
          }
        )
      }
    },
    { scope: containerRef }
  )

  return (
    <section className="bg-background py-20 lg:py-28 overflow-hidden" ref={containerRef}>
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="banner-content">
            <SectionHeader
              label="02 // CAREERS & EXPANSION"
              title="We Are Always Looking for Innovators"
              description="MKB Corporation is at the forefront of AI-driven logistics. If you share our passion for operational efficiency, computer vision, and spatial engineering, we'd love to connect."
              align="left"
            />
            <Button asChild size="sm" className="mt-7 h-10 bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-xs rounded-md px-5 shadow-xs cursor-pointer">
              <Link href="/contact">
                <span>Get in Touch</span>
                <ArrowRight className="size-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>
          <div className="banner-image relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-card shadow-bryl">
            <Image
              src="https://images.pexels.com/photos/29267512/pexels-photo-29267512.jpeg?auto=compress&cs=tinysrgb&w=1200"
              alt="Engineers collaborating on a dashboard"
              fill
              className="object-cover transition-transform duration-500 hover:scale-[1.04]"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
