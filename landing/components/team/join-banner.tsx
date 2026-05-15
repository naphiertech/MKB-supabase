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
          { opacity: 0, x: -50 },
          {
            opacity: 1,
            x: 0,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: containerRef.current,
              start: "top 80%",
              toggleActions: "play none none reverse",
            },
          },
        )

        gsap.fromTo(
          image,
          { opacity: 0, x: 50, scale: 0.9 },
          {
            opacity: 1,
            x: 0,
            scale: 1,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: containerRef.current,
              start: "top 80%",
              toggleActions: "play none none reverse",
            },
          },
        )
      }
    },
    { scope: containerRef },
  )

  return (
    <section className="bg-secondary py-20 lg:py-28 overflow-hidden" ref={containerRef}>
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="banner-content">
            <SectionHeader
              label="Join Our Team"
              title="We Are Always Looking for Innovators"
              description="MKB is at the forefront of AI-driven logistics. If you share our passion for operational efficiency and cutting-edge software engineering, we'd love to hear from you."
              align="left"
            />
            <Button asChild className="mt-8 bg-accent text-accent-foreground hover:bg-accent/90">
              <Link href="/contact">
                Get in Touch
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="banner-image relative aspect-[16/10] overflow-hidden rounded-lg shadow-2xl">
            <Image
              src="https://images.pexels.com/photos/29267512/pexels-photo-29267512.jpeg?auto=compress&cs=tinysrgb&w=1200"
              alt="Engineers collaborating on a dashboard"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
