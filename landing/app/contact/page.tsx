import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Eyebrow } from "@/components/section-header"
import { ContactSection } from "@/components/contact/contact-section"
import { CtaSection } from "@/components/home/cta-section"
import { siteConfig } from "@/lib/data"

export const metadata: Metadata = {
  title: "Contact & Inquiries",
  description:
    "Get in touch with the MKBRiderTrack team. Request an operational demo, discuss multi-hub deployment, or contact technical support.",
  openGraph: {
    title: `Contact & Inquiries | ${siteConfig.name}`,
    description:
      "Get in touch with the MKBRiderTrack team. Request a demo or reach out.",
    url: `${siteConfig.url}/contact`,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Contact & Inquiries | ${siteConfig.name}`,
    description:
      "Get in touch with the MKBRiderTrack team. Request a demo or reach out.",
  },
  alternates: { canonical: `${siteConfig.url}/contact` },
}

export default function ContactPage() {
  return (
    <>
      <section className="page-hero container">
        <div data-enter>
          <Eyebrow>CONTACT & INQUIRIES</Eyebrow>
        </div>
        <div className="page-hero-grid">
          <h1 data-enter>
            Connect with our<br />
            <span>operations team.</span>
          </h1>
          <div data-enter>
            <p className="lead">
              Whether you want to request an enterprise demo, plan a multi-hub deployment, or
              consult with our operations specialists, we are ready to assist.
            </p>
            <Link
              href="#contact-form"
              className="text-link"
            >
              Contact <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <ContactSection />
      <CtaSection />
    </>
  )
}
