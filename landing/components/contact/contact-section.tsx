"use client"

import { useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { MapPin, Phone, Mail, Compass, Building2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { SectionHeader } from "@/components/section-header"
import { siteConfig, locations } from "@/lib/data"

export function ContactSection() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger)

      const formItems = gsap.utils.toArray(".contact-form-item")
      const sidebarItems = gsap.utils.toArray(".contact-sidebar-item")
      const mapItems = gsap.utils.toArray(".contact-map-item")

      // Form animation
      gsap.fromTo(
        formItems,
        { opacity: 0, y: 25 },
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
        },
      )

      // Sidebar animation
      gsap.fromTo(
        sidebarItems,
        { opacity: 0, x: 30 },
        {
          opacity: 1,
          x: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".contact-form-trigger",
            start: "top bottom",
            toggleActions: "play none none reverse",
          },
        },
      )

      // Map items animation
      gsap.fromTo(
        mapItems,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".contact-map-trigger",
            start: "top bottom",
            toggleActions: "play none none reverse",
          },
        },
      )
    },
    { scope: containerRef },
  )

  return (
    <div ref={containerRef}>
      {/* Main Content */}
      <section className="bg-background py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="contact-form-trigger grid gap-16 lg:grid-cols-5">
            {/* Contact Form */}
            <div className="lg:col-span-3">
              <div className="contact-form-item">
                <h2 className="font-serif text-2xl font-bold text-foreground md:text-3xl">Inquire About MKBRiderTrack</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Fill out the form below to request an operational demonstration, discuss multi-hub deployment, or consult with our engineering team.
                </p>
              </div>
              <form className="mt-8 flex flex-col gap-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="contact-form-item flex flex-col gap-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" placeholder="Alan" required />
                  </div>
                  <div className="contact-form-item flex flex-col gap-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" placeholder="Reyes" required />
                  </div>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="contact-form-item flex flex-col gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="alan@example.com" required />
                  </div>
                  <div className="contact-form-item flex flex-col gap-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" type="tel" placeholder="(062) 991-2345" />
                  </div>
                </div>
                <div className="contact-form-item flex flex-col gap-2">
                  <Label htmlFor="subject">Subject / Inquiry Type</Label>
                  <Input id="subject" placeholder="Enterprise demo request, hub deployment, API integration..." required />
                </div>
                <div className="contact-form-item flex flex-col gap-2">
                  <Label htmlFor="message">Message / Fleet Requirements</Label>
                  <Textarea id="message" placeholder="Describe your courier fleet size, operational sectors, and attendance or payroll requirements..." className="min-h-[130px]" required />
                </div>
                <div className="contact-form-item">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90 md:w-auto px-8 shadow-xs"
                  >
                    Submit Inquiry
                  </Button>
                </div>
              </form>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-2">
              <div className="contact-sidebar-item rounded-xl border border-border bg-card p-6 shadow-xs">
                <h3 className="font-serif text-lg font-bold text-card-foreground">Operations Dispatch</h3>
                <div className="mt-4 flex flex-col gap-3">
                  <a
                    href={`tel:${siteConfig.phone}`}
                    className="flex items-center gap-3 text-sm text-muted-foreground transition-colors hover:text-accent"
                  >
                    <Phone className="size-4 shrink-0 text-accent" />
                    {siteConfig.phone}
                  </a>
                  <a
                    href={`mailto:${siteConfig.email}`}
                    className="flex items-center gap-3 text-sm text-muted-foreground transition-colors hover:text-accent"
                  >
                    <Mail className="size-4 shrink-0 text-accent" />
                    {siteConfig.email}
                  </a>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-4">
                {locations.map((hub) => (
                  <Link
                    key={hub.slug}
                    href={`/locations/${hub.slug}`}
                    className="contact-sidebar-item group block rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-accent/40 hover:shadow-md"
                  >
                    <h3 className="font-serif text-base font-bold text-card-foreground group-hover:text-accent transition-colors">
                      {hub.shortName}
                    </h3>
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-accent" />
                        <span className="text-xs text-muted-foreground">
                          {hub.district}, {hub.city}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Compass className="size-3.5 shrink-0 text-accent" />
                        <span className="text-xs text-muted-foreground">
                          {hub.zones.length} Assigned Geofence Zones
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Map / Hubs Section */}
      <section className="contact-map-trigger bg-secondary py-20 lg:py-28 border-t border-border/40">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <SectionHeader
            label="MKB Operations Network"
            title="Four Operational Hubs"
            description="Our physical dispatch hubs manage assigned courier fleets and calibrated geofence perimeters across Zamboanga City."
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {locations.map((hub) => (
              <Link key={hub.slug} href={`/locations/${hub.slug}`} className="contact-map-item group relative overflow-hidden rounded-xl border border-border shadow-sm">
                <div className="relative aspect-video overflow-hidden">
                  <Image
                    src={hub.image}
                    alt={`Map area for ${hub.name}`}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-primary/70 group-hover:bg-primary/60 transition-colors" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                    <Building2 className="mb-2 size-5 text-accent" />
                    <h3 className="font-serif text-base font-bold text-primary-foreground">{hub.shortName}</h3>
                    <p className="mt-1 text-xs text-primary-foreground/75">{hub.district}</p>
                    <span className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                      View Hub details
                      <ArrowRight className="size-3" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
