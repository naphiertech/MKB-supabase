"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, MapPin, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { BrandLogo } from "@/components/brand-logo"
import { staticHubsList } from "@/lib/data"
import { cn } from "@/lib/utils"

export const navigation = [
  { name: "Platform", href: "/about", index: "01" },
  { name: "Capabilities", href: "/modules", index: "02" },
  { name: "Operations", href: "/locations", index: "03" },
  { name: "Team", href: "/team", index: "04" },
  { name: "Contact", href: "/contact", index: "05" },
]

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:5173"

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-md transition-colors">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-8">
        {/* Logo & Brand Hierarchy: [ AMBER M ] MKBRiderTrack */}
        <BrandLogo showVersion={true} />

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main Navigation">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200",
                  isActive
                    ? "text-accent bg-accent/10 font-semibold border border-accent/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                <span className={cn("font-mono text-[9px]", isActive ? "text-accent" : "text-muted-foreground/70")}>
                  {item.index}
                </span>
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-2.5 lg:flex">
          {/* Secondary Neutral Action */}
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary px-3"
          >
            <Link href="/contact">
              <span>Request Demo</span>
            </Link>
          </Button>

          {/* Primary Amber Action */}
          <Button
            asChild
            size="sm"
            className="h-8 px-3.5 group cursor-pointer"
          >
            <Link href={dashboardUrl}>
              <span>Access Portal</span>
              <ArrowUpRight className="size-3.5 ml-0.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </Button>
        </div>

        {/* Mobile Menu */}
        {mounted && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 lg:hidden hover:bg-secondary">
                <Menu className="size-4" />
                <span className="sr-only">Open navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-sm border-l border-border bg-background/95 backdrop-blur-xl p-6">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <SheetDescription className="sr-only">Site navigation links and operational zones</SheetDescription>
              <div className="flex flex-col gap-6 pt-2">
                <div onClick={() => setOpen(false)}>
                  <BrandLogo />
                </div>
                <nav className="flex flex-col gap-1" aria-label="Mobile Navigation">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary",
                        pathname === item.href
                          ? "text-accent bg-accent/10 font-semibold"
                          : "text-muted-foreground"
                      )}
                    >
                      <span>{item.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground/60">{item.index}</span>
                    </Link>
                  ))}
                </nav>
                <div className="border-t border-border pt-4">
                  <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">
                    // Operational Hubs
                  </p>
                  <div className="flex flex-col gap-1">
                    {staticHubsList.map((hub) => (
                      <Link
                        key={hub.slug}
                        href={`/locations/${hub.slug}`}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-2.5 rounded-md px-3 py-2 transition-colors hover:bg-secondary"
                      >
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-accent" />
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {hub.shortName}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {hub.district}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="border-t border-border pt-4 flex flex-col gap-2">
                  <Button asChild variant="outline" className="w-full h-9 text-xs">
                    <Link href="/contact" onClick={() => setOpen(false)}>
                      <span>Request Demo</span>
                    </Link>
                  </Button>
                  <Button asChild className="w-full h-9 text-xs flex items-center justify-center gap-1.5">
                    <Link href={dashboardUrl} onClick={() => setOpen(false)}>
                      <span>Access Portal</span>
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </header>
  )
}
