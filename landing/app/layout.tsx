import type { Metadata, Viewport } from "next"
import { DM_Sans, Manrope } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { GSAPProvider } from "@/components/animations/gsap-provider"
import { SmoothScroll } from "@/components/animations/smooth-scroll"
import { ScrollProgress } from "@/components/animations/scroll-progress"
import { siteConfig } from "@/lib/data"
import "./globals.css"

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} | ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
  keywords: [
    "MKBRiderTrack",
    "MKB Corporation",
    "geofencing",
    "biometric attendance",
    "fleet logistics",
    "workforce intelligence",
    "rider monitoring",
    "parcel operations",
    "automated payroll",
    "offline outbox",
  ],
  authors: [{ name: siteConfig.name }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} | ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: siteConfig.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} | ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
  },
  alternates: {
    canonical: siteConfig.url,
  },
  icons: {
    icon: [
      {
        url: "/favicon.svg",
        type: "image/svg+xml",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
}

export const viewport: Viewport = {
  themeColor: "#f3682c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased bg-white text-[#272923] selection:bg-[#f9d7c6] selection:text-[#252823]">
        <GSAPProvider>
          <SmoothScroll>
            <ScrollProgress />
            <SiteHeader />
            <main>{children}</main>
            <SiteFooter />
          </SmoothScroll>
        </GSAPProvider>
        <Analytics />
      </body>
    </html>
  )
}
