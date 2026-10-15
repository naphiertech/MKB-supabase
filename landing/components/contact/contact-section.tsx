"use client"

import { useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { MapPin, Phone, Mail, ArrowRight } from "lucide-react"
import { SectionHeader } from "@/components/section-header"
import { siteConfig, staticHubsList, hubMarketingMeta } from "@/lib/data"

export function ContactSection() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger)

      const formItems = gsap.utils.toArray(".contact-form-item")
      const sidebarItems = gsap.utils.toArray(".contact-sidebar-item")
      const mapItems = gsap.utils.toArray(".contact-map-item")

      gsap.fromTo(
        formItems,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.08,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".contact-form-trigger",
            start: "top bottom",
            toggleActions: "play none none reverse",
          },
        }
      )

      gsap.fromTo(
        sidebarItems,
        { opacity: 0, x: 20 },
        {
          opacity: 1,
          x: 0,
          duration: 0.8,
          stagger: 0.08,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".contact-form-trigger",
            start: "top bottom",
            toggleActions: "play none none reverse",
          },
        }
      )

      gsap.fromTo(
        mapItems,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.08,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".contact-map-trigger",
            start: "top bottom",
            toggleActions: "play none none reverse",
          },
        }
      )
    },
    { scope: containerRef }
  )

  return (
    <div ref={containerRef}>
      {/* Main Content */}
      <section className="container section-space">
        <div className="contact-form-trigger grid gap-12 lg:grid-cols-5 lg:gap-14">
          {/* Contact Form */}
          <div className="lg:col-span-3 rounded-xl border border-[#e7e8e2] bg-[#ffffff] p-8 md:p-10 shadow-[0_2px_12px_rgba(40,43,38,0.04)]">
            <div className="contact-form-item">
              <div className="eyebrow mb-2" style={{ fontSize: "8px", letterSpacing: "1.4px" }}>
                <span />
                DIRECT DISPATCH INQUIRY
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-[#282b26] md:text-3xl font-heading">
                Inquire About MKBRiderTrack
              </h2>
              <p className="mt-2 text-xs md:text-sm text-[#70766a] leading-relaxed">
                Fill out the form below to request an operational demonstration, discuss multi-hub deployment, or consult with our engineering team.
              </p>
            </div>
            <form className="mt-8 flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="contact-form-item flex flex-col gap-1.5">
                  <label htmlFor="firstName" className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#70766a]">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    placeholder="Alan"
                    required
                    className="h-10 text-xs border border-[#e7e8e2] bg-[#f5f5ef] focus:bg-[#ffffff] focus:border-[var(--orange)] rounded-md px-3 text-[#282b26] transition-colors outline-none"
                  />
                </div>
                <div className="contact-form-item flex flex-col gap-1.5">
                  <label htmlFor="lastName" className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#70766a]">
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    placeholder="Reyes"
                    required
                    className="h-10 text-xs border border-[#e7e8e2] bg-[#f5f5ef] focus:bg-[#ffffff] focus:border-[var(--orange)] rounded-md px-3 text-[#282b26] transition-colors outline-none"
                  />
                </div>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="contact-form-item flex flex-col gap-1.5">
                  <label htmlFor="email" className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#70766a]">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="alan@example.com"
                    required
                    className="h-10 text-xs border border-[#e7e8e2] bg-[#f5f5ef] focus:bg-[#ffffff] focus:border-[var(--orange)] rounded-md px-3 text-[#282b26] transition-colors outline-none"
                  />
                </div>
                <div className="contact-form-item flex flex-col gap-1.5">
                  <label htmlFor="phone" className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#70766a]">
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="(062) 991-2345"
                    className="h-10 text-xs border border-[#e7e8e2] bg-[#f5f5ef] focus:bg-[#ffffff] focus:border-[var(--orange)] rounded-md px-3 text-[#282b26] transition-colors outline-none"
                  />
                </div>
              </div>
              <div className="contact-form-item flex flex-col gap-1.5">
                <label htmlFor="subject" className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#70766a]">
                  Subject / Inquiry Type
                </label>
                <input
                  id="subject"
                  placeholder="Enterprise demo request, hub deployment, API integration..."
                  required
                  className="h-10 text-xs border border-[#e7e8e2] bg-[#f5f5ef] focus:bg-[#ffffff] focus:border-[var(--orange)] rounded-md px-3 text-[#282b26] transition-colors outline-none"
                />
              </div>
              <div className="contact-form-item flex flex-col gap-1.5">
                <label htmlFor="message" className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#70766a]">
                  Message / Fleet Requirements
                </label>
                <textarea
                  id="message"
                  placeholder="Describe your courier fleet size, operational sectors, and attendance or payroll requirements..."
                  rows={4}
                  className="text-xs border border-[#e7e8e2] bg-[#f5f5ef] focus:bg-[#ffffff] focus:border-[var(--orange)] rounded-md p-3 text-[#282b26] transition-colors outline-none resize-none"
                  required
                />
              </div>
              <div className="contact-form-item mt-2">
                <button
                  type="submit"
                  className="button button-orange text-xs cursor-pointer"
                >
                  <span>Submit Inquiry</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="contact-sidebar-item rounded-xl border border-[#e7e8e2] bg-[#f5f5ef] p-6">
              <h3 className="font-heading text-base font-bold text-[#282b26]">Operations Dispatch</h3>
              <p className="mt-1 text-xs text-[#70766a]">Direct contact channels for enterprise logistics support.</p>
              <div className="mt-4 flex flex-col gap-3 border-t border-[#e7e8e2] pt-4">
                <a
                  href={`tel:${siteConfig.phone}`}
                  className="inline-flex items-center gap-3 font-mono text-xs text-[#282b26] transition-colors hover:text-[var(--orange)]"
                >
                  <Phone size={15} className="shrink-0 text-[var(--orange)]" />
                  <span>{siteConfig.phone}</span>
                </a>
                <a
                  href={`mailto:${siteConfig.email}`}
                  className="inline-flex items-center gap-3 font-mono text-xs text-[#282b26] transition-colors hover:text-[var(--orange)]"
                >
                  <Mail size={15} className="shrink-0 text-[var(--orange)]" />
                  <span>{siteConfig.email}</span>
                </a>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="eyebrow" style={{ fontSize: "8px", letterSpacing: "1.2px" }}>
                <span></span>
                OPERATIONS HUBS
              </div>
              {staticHubsList.map((hub) => {
                const meta = hubMarketingMeta[hub.slug] || {
                  city: "Zamboanga City, 7000",
                  image: "https://images.pexels.com/photos/7019213/pexels-photo-7019213.jpeg?auto=compress&cs=tinysrgb&w=1200",
                }
                return (
                  <Link
                    key={hub.slug}
                    href={`/locations/${hub.slug}`}
                    className="contact-sidebar-item group block rounded-md border border-[#e7e8e2] bg-[#ffffff] p-4 transition-all duration-300 hover:border-[#f3682c]/40 hover:-translate-y-0.5 shadow-[0_2px_8px_rgba(40,43,38,0.03)]"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-heading text-sm font-bold text-[#282b26] group-hover:text-[var(--orange)] transition-colors">
                        {hub.shortName}
                      </h4>
                      <ArrowRight size={13} className="text-[#a4a99d] group-hover:text-[var(--orange)] group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <MapPin size={12} className="shrink-0 text-[var(--orange)]" />
                      <span className="font-mono text-[11px] text-[#70766a]">
                        {hub.district}, {meta.city}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Map / Hubs Section */}
      <section className="contact-map-trigger container section-space border-t border-[#e7e8e2]">
        <SectionHeader
          label="OPERATIONS NETWORK"
          title={<>Four Operational Hubs</>}
          description="Our physical dispatch hubs manage assigned courier fleets and calibrated geofence perimeters across Zamboanga City."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {staticHubsList.map((hub) => {
            const meta = hubMarketingMeta[hub.slug] || {
              tagline: "Operational Center",
              description: "Fulfillment and courier dispatch terminal in Zamboanga City.",
              image: "https://images.pexels.com/photos/7019213/pexels-photo-7019213.jpeg?auto=compress&cs=tinysrgb&w=1200",
            }
            return (
              <Link
                key={hub.slug}
                href={`/locations/${hub.slug}`}
                className="contact-map-item group flex flex-col justify-between overflow-hidden rounded-md border border-[#e7e8e2] bg-[#ffffff] shadow-[0_2px_12px_rgba(40,43,38,0.04)] transition-all duration-300 hover:border-[#f3682c]/40 hover:-translate-y-1"
              >
                <div>
                  <div className="relative aspect-[16/10] overflow-hidden bg-[#f5f5ef]">
                    <Image
                      src={meta.image}
                      alt={hub.name}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      sizes="(max-width: 768px) 100vw, 25vw"
                    />
                  </div>
                  <div className="p-5">
                    <div className="mb-2">
                      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--orange)]">
                        {meta.tagline || "Operational Hub"}
                      </p>
                      <h3 className="mt-0.5 font-heading text-base font-bold text-[#282b26] transition-colors group-hover:text-[var(--orange)]">
                        {hub.shortName}
                      </h3>
                    </div>
                    <p className="text-xs leading-relaxed text-[#70766a] line-clamp-2">
                      {meta.description || hub.district}
                    </p>
                    <div className="mt-4 flex items-center gap-1.5 border-t border-[#e7e8e2] pt-3 text-[11px] text-[#70766a] font-mono">
                      <MapPin size={12} className="shrink-0 text-[var(--orange)]" />
                      <span className="truncate">{hub.district}</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 pt-0">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[var(--orange)]">
                    <span>View Hub</span>
                    <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
