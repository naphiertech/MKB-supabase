"use client"

import { useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { MapPin, Phone, Mail, Clock } from "lucide-react"
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
        { opacity: 0, y: 30, filter: "blur(5px)" },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
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

      // Sidebar animation
      gsap.fromTo(
        sidebarItems,
        { opacity: 0, x: 50 },
        {
          opacity: 1,
          x: 0,
          duration: 0.8,
          stagger: 0.15,
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
        { opacity: 0, scale: 0.9, y: 40 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: "back.out(1.2)",
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
                <h2 className="font-serif text-2xl font-bold text-foreground">Send Us a Message</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Fill out the form below and we will get back to you within 24 hours.
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
                    <Input id="phone" type="tel" placeholder="(555) 123-4567" />
                  </div>
                </div>
                <div className="contact-form-item flex flex-col gap-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" placeholder="Demo request, API integration, technical support..." required />
                </div>
                <div className="contact-form-item flex flex-col gap-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" placeholder="Tell us how we can help..." className="min-h-[120px]" required />
                </div>
                <div className="contact-form-item">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90 md:w-auto"
                  >
                    Send Message
                  </Button>
                </div>
              </form>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-2">
              <div className="contact-sidebar-item rounded-lg border border-border bg-card p-6">
                <h3 className="font-serif text-lg font-bold text-card-foreground">General Inquiries</h3>
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
                {locations.map((loc) => (
                  <Link
                    key={loc.slug}
                    href={`/locations/${loc.slug}`}
                    className="contact-sidebar-item group block rounded-lg border border-border bg-card p-6 transition-shadow hover:shadow-md"
                  >
                    <h3 className="font-serif text-lg font-bold text-card-foreground group-hover:text-accent">
                      {loc.shortName}
                    </h3>
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                        <span className="text-sm text-muted-foreground">
                          {loc.address}, {loc.city}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="size-4 shrink-0 text-accent" />
                        <span className="text-sm text-muted-foreground">{loc.phone}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Clock className="mt-0.5 size-4 shrink-0 text-accent" />
                        <div className="flex flex-col gap-0.5">
                          {loc.hours.map((h) => (
                            <span key={h.days} className="text-xs text-muted-foreground">
                              {h.days}: {h.time}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Map Section */}
      <section className="contact-map-trigger bg-secondary py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <SectionHeader
            label="Find Us"
            title="Visit Any of Our Four Zones"
            description="Our strategic geofence zones are mapped across key operational boundaries."
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {locations.map((loc) => (
              <div key={loc.slug} className="contact-map-item relative overflow-hidden rounded-lg">
                <div className="relative aspect-video overflow-hidden rounded-lg">
                  <Image
                    src={loc.image}
                    alt={`Map area for ${loc.name}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-primary/60" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                    <MapPin className="mb-2 size-6 text-accent" />
                    <h3 className="font-serif text-lg font-bold text-primary-foreground">{loc.shortName}</h3>
                    <p className="mt-1 text-xs text-primary-foreground/70">{loc.address}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
