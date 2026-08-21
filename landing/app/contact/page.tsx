import type { Metadata } from "next"
import { ContactSection } from "@/components/contact/contact-section"
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
      {/* Hero */}
      <section className="relative flex min-h-[42vh] items-center overflow-hidden border-b border-border bg-background">
        <div className="absolute inset-0 z-0">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover opacity-25"
          >
            <source src="https://www.pexels.com/download/video/4292902/" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/85 to-background" />
          <div className="absolute inset-0 bg-halftone-radial opacity-50 pointer-events-none" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1 mb-4 shadow-xs backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              [ 05 // OPERATIONS & INQUIRIES ]
            </p>
          </div>
          <h1 className="max-w-3xl font-sans text-3xl font-bold leading-tight tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Connect with MKBRiderTrack
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Whether you want to request an enterprise demo, plan a multi-hub deployment, or consult with our operations specialists, we are ready to assist.
          </p>
        </div>
      </section>

      <ContactSection />
    </>
  )
}
