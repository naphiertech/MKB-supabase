import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { MapPin, Phone, Mail, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { SectionHeader } from "@/components/section-header"
import { ContactSection } from "@/components/contact/contact-section"
import { siteConfig, locations } from "@/lib/data"

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the AttenRider team. Request a demo, plan a deployment, or contact our support team.",
  openGraph: {
    title: `Contact | ${siteConfig.name}`,
    description:
      "Get in touch with the AttenRider team. Request a demo, plan a deployment, or reach out.",
    url: `${siteConfig.url}/contact`,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Contact | ${siteConfig.name}`,
    description:
      "Get in touch with the AttenRider team. Request a demo, plan a deployment, or reach out.",
  },
  alternates: { canonical: `${siteConfig.url}/contact` },
}

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[50vh] items-center overflow-hidden bg-primary">
        <div className="absolute inset-0">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover opacity-30"
          >
            <source src="https://www.pexels.com/download/video/4292902/" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/60 to-primary/30" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-24 lg:px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Contact Us
          </p>
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight tracking-tight text-primary-foreground md:text-6xl lg:text-7xl">
            Connect with AttenRider
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-primary-foreground/80">
            Whether you want to request a demo, inquire about enterprise deployment, or reach our technical support team, we are here to help.
          </p>
        </div>
      </section>

      <ContactSection />
    </>
  )
}
