"use client"

import { useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { ArrowRight } from "lucide-react"

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
    <section className="container section-space" ref={containerRef}>
      <div className="rounded-xl border border-[#e7e8e2] bg-[#f5f5ef] p-8 md:p-14 overflow-hidden">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="banner-content">
            <div className="eyebrow mb-3" style={{ fontSize: "8px", letterSpacing: "1.4px" }}>
              <span />
              CAREERS & EXPANSION
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-[#282b26] md:text-4xl">
              We Are Always Looking for Innovators
            </h2>
            <p className="mt-4 text-xs leading-relaxed text-[#70766a] md:text-sm">
              MKB Corporation is at the forefront of AI-driven logistics. If you share our passion for operational efficiency, computer vision, and spatial engineering, we&apos;d love to connect.
            </p>
            <div className="mt-8">
              <Link href="/contact" className="button button-orange text-xs">
                <span>Get in Touch</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <div className="banner-image relative aspect-[16/10] overflow-hidden rounded-md border border-[#e3e6da] bg-[#ffffff] shadow-sm">
            <Image
              src="https://images.pexels.com/photos/29267512/pexels-photo-29267512.jpeg?auto=compress&cs=tinysrgb&w=1200"
              alt="Engineers collaborating on a dashboard"
              fill
              className="object-cover transition-transform duration-500 hover:scale-[1.03]"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
