"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { ArrowUpRight, ArrowRight, ShieldCheck } from "lucide-react"
import gsap from "gsap"
import { Eyebrow } from "@/components/section-header"
import { ProductFrame } from "@/components/ui/product-frame"
import { DashboardPreview } from "@/components/home/dashboard-preview"
import { getDashboardUrl } from "@/lib/data"

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const dashboardUrl = getDashboardUrl()

  useEffect(() => {
    if (typeof window === "undefined") return
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced) return

    const ctx = gsap.context(() => {
      gsap.from("[data-enter]", {
        y: 24,
        opacity: 0,
        duration: 0.65,
        stagger: 0.085,
        ease: "power3.out",
        clearProps: "all",
      })
    }, containerRef)

    return () => ctx.revert()
  }, [])

  return (
    <section className="home-hero container" ref={containerRef}>
      <div className="hero-copy">
        <div data-enter>
          <Eyebrow>ONE WORKFORCE. ONE CLEAR VIEW.</Eyebrow>
        </div>
        <h1 data-enter>
          Know who’s <br />
          on the road.
          <br />
          <span>
            Know who’s <br />
            on time.
          </span>
        </h1>
        <p data-enter>
          MKB RiderTrack brings rider attendance, location validation, and payroll-ready records into
          one connected system.
        </p>
        <div className="hero-actions" data-enter>
          <a
            href={dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button button-orange"
          >
            Access Portal
            <ArrowUpRight size={18} />
          </a>
          <Link href="/about" className="button button-outline">
            Explore RiderTrack
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="hero-note" data-enter>
          <ShieldCheck size={14} />
          Built for MKB Corporation’s courier workforce.
        </div>
      </div>

      <div className="hero-product" data-enter>
        <ProductFrame label="YOUR OPERATIONS. IN FOCUS." className="hero-product-stage">
          <div className="hero-product-caption">
            <span>
              Less guesswork.
              <br />
              <strong>More clarity.</strong>
            </span>
            <span className="framing-arrow" aria-hidden="true">
              <ArrowUpRight size={30} strokeWidth={1.5} />
            </span>
          </div>
          <DashboardPreview compact />
          <div className="product-caption">
            <span>
              <span className="live-dot" />
              Verified attendance. Visible operations.
            </span>
            <span>01 — WORKFORCE OVERVIEW</span>
          </div>
        </ProductFrame>
      </div>
    </section>
  )
}
