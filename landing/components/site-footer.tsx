import Link from "next/link"
import { MapPin, Phone, Mail, ArrowUpRight } from "lucide-react"
import { siteConfig, staticHubsList } from "@/lib/data"
import { BrandLogo } from "@/components/brand-logo"
import { AnimateIn } from "@/components/animations/animate-in"

export function SiteFooter() {
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:5173"

  return (
    <footer className="border-t border-border bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-20">
        <AnimateIn
          from={{ opacity: 0, y: 20 }}
          stagger={0.08}
          threshold={0}
          className="grid gap-12 md:grid-cols-2 lg:grid-cols-4"
        >
          {/* Brand & Logo Hierarchy: [ AMBER M ] MKBRiderTrack */}
          <div className="lg:col-span-1 flex flex-col justify-between">
            <div>
              <BrandLogo />
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Enterprise workforce intelligence and fleet telemetry for last-mile logistics courier networks.
              </p>
              <p className="mt-2 font-mono text-[10px] text-accent uppercase tracking-wider">
                MKB Corporation &middot; Systems Division
              </p>
            </div>

            <div className="mt-6 flex items-center gap-3 font-mono text-xs text-muted-foreground">
              <Link
                href={dashboardUrl}
                className="inline-flex items-center gap-1 text-foreground hover:text-accent hover:underline"
              >
                <span>Portal Access</span>
                <ArrowUpRight className="size-3 text-accent" />
              </Link>
              <span>&middot;</span>
              <Link href="/contact" className="hover:text-accent hover:underline">
                Contact Ops
              </Link>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              // Platform
            </h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              {[
                { name: "Platform Overview", href: "/about", index: "01" },
                { name: "Core Capabilities", href: "/modules", index: "02" },
                { name: "Operational Hubs", href: "/locations", index: "03" },
                { name: "Engineering Team", href: "/team", index: "04" },
                { name: "Contact & Demo", href: "/contact", index: "05" },
              ].map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="group inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="font-mono text-[10px] text-muted-foreground/50 group-hover:text-accent">{item.index}</span>
                    <span className="underline decoration-border/60 underline-offset-4 group-hover:decoration-accent group-hover:text-accent">
                      {item.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Hubs */}
          <div>
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              // Operational Hubs
            </h3>
            <ul className="mt-4 flex flex-col gap-3">
              {staticHubsList.map((hub) => (
                <li key={hub.slug}>
                  <Link
                    href={`/locations/${hub.slug}`}
                    className="group flex items-start gap-2 text-xs"
                  >
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-accent transition-transform group-hover:scale-110" />
                    <div>
                      <p className="font-medium text-foreground underline decoration-border/60 underline-offset-4 group-hover:decoration-accent group-hover:text-accent">
                        {hub.shortName}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground/70">{hub.district}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              // Inquiries
            </h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              <li>
                <a
                  href={`tel:${siteConfig.phone}`}
                  className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-accent transition-colors"
                >
                  <Phone className="size-3.5 shrink-0 text-accent" />
                  <span className="font-mono">{siteConfig.phone}</span>
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${siteConfig.email}`}
                  className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-accent transition-colors"
                >
                  <Mail className="size-3.5 shrink-0 text-accent" />
                  <span className="font-mono">{siteConfig.email}</span>
                </a>
              </li>
            </ul>
            <div className="mt-5 rounded-xl border border-border bg-secondary/50 p-3.5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">
                Enterprise Dispatch
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                Centralized biometric DTR, spatial polygon boundaries, and automated payroll operations.
              </p>
            </div>
          </div>
        </AnimateIn>

        <div className="mt-12 border-t border-border pt-6 flex flex-col items-center justify-between gap-4 md:flex-row text-xs text-muted-foreground font-mono">
          <p className="text-[11px]">
            &copy; {new Date().getFullYear()} {siteConfig.name} &middot; MKB Corporation. All rights reserved.
          </p>
          <div className="flex gap-5 text-[11px]">
            <Link href="/contact" className="hover:text-accent transition-colors">
              Privacy
            </Link>
            <Link href="/contact" className="hover:text-accent transition-colors">
              Terms
            </Link>
            <Link href="/contact" className="hover:text-accent transition-colors">
              Security
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
