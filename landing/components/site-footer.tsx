import Link from "next/link"
import { MapPin, Phone, Mail, ArrowUpRight } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { siteConfig, locations } from "@/lib/data"
import { AnimateIn } from "@/components/animations/animate-in"

export function SiteFooter() {
  return (
    <footer className="bg-primary text-primary-foreground border-t border-border/20">
      <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-20">
        <AnimateIn
          from={{ opacity: 0, y: 30 }}
          stagger={0.1}
          threshold={0}
          className="grid gap-12 md:grid-cols-2 lg:grid-cols-4"
        >
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground font-serif font-black text-sm tracking-tight">
                M
              </div>
              <span className="font-serif text-2xl font-bold tracking-tight">
                {siteConfig.name}
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-primary-foreground/80">
              {siteConfig.description}
            </p>
            <p className="mt-3 text-xs text-primary-foreground/60">
              Enterprise logistics intelligence powered by MKB Corporation.
            </p>
            <div className="mt-6 flex gap-4">
              <a
                href={siteConfig.socials.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-70 transition-opacity hover:opacity-100"
                aria-label="Instagram"
              >
                <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
              <a
                href={siteConfig.socials.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-70 transition-opacity hover:opacity-100"
                aria-label="Facebook"
              >
                <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>
              <a
                href={siteConfig.socials.twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-70 transition-opacity hover:opacity-100"
                aria-label="Twitter"
              >
                <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-accent">
              Platform Navigation
            </h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              {[
                { name: "Platform", href: "/about" },
                { name: "Capabilities", href: "/modules" },
                { name: "Operations", href: "/locations" },
                { name: "Team", href: "/team" },
                { name: "Contact", href: "/contact" },
              ].map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm opacity-70 transition-opacity hover:opacity-100 hover:text-accent"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Hubs */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-accent">
              Operational Hubs
            </h3>
            <ul className="mt-4 flex flex-col gap-3">
              {locations.map((hub) => (
                <li key={hub.slug}>
                  <Link
                    href={`/locations/${hub.slug}`}
                    className="group flex items-start gap-2"
                  >
                    <MapPin className="mt-0.5 size-4 shrink-0 text-accent opacity-75 transition-opacity group-hover:opacity-100" />
                    <div>
                      <p className="text-sm font-medium opacity-90 transition-opacity group-hover:opacity-100 group-hover:text-accent">
                        {hub.shortName}
                      </p>
                      <p className="text-xs opacity-60">{hub.district}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-accent">
              Operations & Inquiries
            </h3>
            <ul className="mt-4 flex flex-col gap-3">
              <li>
                <a
                  href={`tel:${siteConfig.phone}`}
                  className="flex items-center gap-2 text-sm opacity-75 transition-opacity hover:opacity-100 hover:text-accent"
                >
                  <Phone className="size-4 shrink-0 text-accent" />
                  {siteConfig.phone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${siteConfig.email}`}
                  className="flex items-center gap-2 text-sm opacity-75 transition-opacity hover:opacity-100 hover:text-accent"
                >
                  <Mail className="size-4 shrink-0 text-accent" />
                  {siteConfig.email}
                </a>
              </li>
            </ul>
            <div className="mt-6 rounded-lg bg-primary-foreground/5 p-3.5 border border-primary-foreground/10">
              <p className="text-xs font-medium uppercase tracking-wider text-accent">
                Enterprise Dispatch
              </p>
              <p className="mt-1 text-xs opacity-75 leading-relaxed">
                Centralized fleet coordination, biometric attendance, and automated payroll operations.
              </p>
            </div>
          </div>
        </AnimateIn>

        <Separator className="my-10 bg-primary-foreground/15" />

        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-xs opacity-60">
            &copy; {new Date().getFullYear()} {siteConfig.name} · MKB Corporation. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link
              href="/contact"
              className="text-xs opacity-60 transition-opacity hover:opacity-100 hover:text-accent"
            >
              Privacy Policy
            </Link>
            <Link
              href="/contact"
              className="text-xs opacity-60 transition-opacity hover:opacity-100 hover:text-accent"
            >
              Terms of Service
            </Link>
            <Link
              href="/contact"
              className="text-xs opacity-60 transition-opacity hover:opacity-100 hover:text-accent"
            >
              Security Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
