"use client"

import { useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { MapPin, Phone, Mail, Building2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
      <section className="border-b border-border bg-background py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="contact-form-trigger grid gap-14 lg:grid-cols-5">
            {/* Contact Form */}
            <div className="lg:col-span-3">
              <div className="contact-form-item">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">
                  // Direct Dispatch Inquiry
                </p>
                <h2 className="mt-1 font-sans text-2xl font-bold text-foreground md:text-3xl">Inquire About MKBRiderTrack</h2>
                <p className="mt-2 text-xs md:text-sm text-muted-foreground leading-relaxed">
                  Fill out the form below to request an operational demonstration, discuss multi-hub deployment, or consult with our engineering team.
                </p>
              </div>
              <form className="mt-8 flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="contact-form-item flex flex-col gap-1.5">
                    <Label htmlFor="firstName" className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      First Name
                    </Label>
                    <Input id="firstName" placeholder="Alan" required className="h-9 text-xs border-border bg-secondary/40 text-foreground focus-visible:ring-accent" />
                  </div>
                  <div className="contact-form-item flex flex-col gap-1.5">
                    <Label htmlFor="lastName" className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Last Name
                    </Label>
                    <Input id="lastName" placeholder="Reyes" required className="h-9 text-xs border-border bg-secondary/40 text-foreground focus-visible:ring-accent" />
                  </div>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="contact-form-item flex flex-col gap-1.5">
                    <Label htmlFor="email" className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Email Address
                    </Label>
                    <Input id="email" type="email" placeholder="alan@example.com" required className="h-9 text-xs border-border bg-secondary/40 text-foreground focus-visible:ring-accent" />
                  </div>
                  <div className="contact-form-item flex flex-col gap-1.5">
                    <Label htmlFor="phone" className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Phone Number
                    </Label>
                    <Input id="phone" type="tel" placeholder="(062) 991-2345" className="h-9 text-xs border-border bg-secondary/40 text-foreground focus-visible:ring-accent" />
                  </div>
                </div>
                <div className="contact-form-item flex flex-col gap-1.5">
                  <Label htmlFor="subject" className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Subject / Inquiry Type
                  </Label>
                  <Input id="subject" placeholder="Enterprise demo request, hub deployment, API integration..." required className="h-9 text-xs border-border bg-secondary/40 text-foreground focus-visible:ring-accent" />
                </div>
                <div className="contact-form-item flex flex-col gap-1.5">
                  <Label htmlFor="message" className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Message / Fleet Requirements
                  </Label>
                  <Textarea id="message" placeholder="Describe your courier fleet size, operational sectors, and attendance or payroll requirements..." className="min-h-[120px] text-xs border-border bg-secondary/40 text-foreground resize-none focus-visible:ring-accent" required />
                </div>
                <div className="contact-form-item">
                  <Button
                    type="submit"
                    size="sm"
                    className="h-10 bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-xs rounded-md px-6 shadow-sm cursor-pointer"
                  >
                    Submit Inquiry
                  </Button>
                </div>
              </form>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-2">
              <div className="contact-sidebar-item rounded-2xl border border-border bg-card p-5 shadow-bryl">
                <h3 className="font-sans text-sm font-bold text-foreground">Operations Dispatch</h3>
                <div className="mt-3 flex flex-col gap-2.5">
                  <a
                    href={`tel:${siteConfig.phone}`}
                    className="inline-flex items-center gap-2.5 font-mono text-xs text-muted-foreground transition-colors hover:text-accent"
                  >
                    <Phone className="size-3.5 shrink-0 text-accent" />
                    <span>{siteConfig.phone}</span>
                  </a>
                  <a
                    href={`mailto:${siteConfig.email}`}
                    className="inline-flex items-center gap-2.5 font-mono text-xs text-muted-foreground transition-colors hover:text-accent"
                  >
                    <Mail className="size-3.5 shrink-0 text-accent" />
                    <span>{siteConfig.email}</span>
                  </a>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3">
                {staticHubsList.map((hub) => {
                  const meta = hubMarketingMeta[hub.slug] || {
                    city: "Zamboanga City, 7000",
                    image: "https://images.pexels.com/photos/7019213/pexels-photo-7019213.jpeg?auto=compress&cs=tinysrgb&w=1200",
                  }
                  return (
                    <Link
                      key={hub.slug}
                      href={`/locations/${hub.slug}`}
                      className="contact-sidebar-item group block rounded-2xl border border-border bg-card p-4 shadow-bryl transition-all duration-300 hover:border-accent/50 hover:-translate-y-0.5"
                    >
                      <h3 className="font-sans text-sm font-bold text-foreground group-hover:text-accent transition-colors">
                        {hub.shortName}
                      </h3>
                      <div className="mt-2 flex items-center gap-2">
                        <MapPin className="size-3 shrink-0 text-accent" />
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {hub.district}, {meta.city}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Map / Hubs Section */}
      <section className="contact-map-trigger bg-background py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <SectionHeader
            label="02 // OPERATIONS NETWORK"
            title="Four Operational Hubs"
            description="Our physical dispatch hubs manage assigned courier fleets and calibrated geofence perimeters across Zamboanga City."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
                  className="contact-map-item group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card shadow-bryl transition-all duration-300 hover:border-accent/50 hover:-translate-y-1"
                >
                  <div>
                    <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
                      <Image
                        src={meta.image}
                        alt={hub.name}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        sizes="(max-width: 768px) 100vw, 25vw"
                      />
                    </div>
                    <div className="p-4">
                      <div className="mb-2">
                        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">
                          {meta.tagline || "Operational Hub"}
                        </p>
                        <h3 className="mt-0.5 font-sans text-base font-bold text-foreground transition-colors group-hover:text-accent">
                          {hub.shortName}
                        </h3>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                        {meta.description || hub.district}
                      </p>
                      <div className="mt-3.5 flex items-center gap-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground font-mono">
                        <MapPin className="size-3 shrink-0 text-accent" />
                        <span className="truncate">{hub.district}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 pt-0">
                    <div className="flex items-center gap-1 font-mono text-[11px] font-semibold text-accent transition-colors">
                      <span>View Hub</span>
                      <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
