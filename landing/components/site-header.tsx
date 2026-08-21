"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, MapPin, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { siteConfig, locations } from "@/lib/data"
import { cn } from "@/lib/utils"

export const navigation = [
  { name: "Platform", href: "/about" },
  { name: "Capabilities", href: "/modules" },
  { name: "Operations", href: "/locations" },
  { name: "Team", href: "/team" },
  { name: "Contact", href: "/contact" },
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
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur-xl transition-colors">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
        {/* Logo & Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex size-7.5 items-center justify-center rounded-lg bg-accent text-accent-foreground font-serif font-black text-sm tracking-tight shadow-xs group-hover:scale-105 transition-transform">
            M
          </div>
          <div className="flex flex-col">
            <span className="font-serif text-xl font-bold tracking-tight text-foreground group-hover:text-accent transition-colors">
              {siteConfig.name}
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main Navigation">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "rounded-md px-3.5 py-2 text-sm font-medium transition-all duration-200 hover:text-accent hover:bg-secondary/60",
                pathname === item.href
                  ? "text-accent bg-secondary/80 font-semibold"
                  : "text-muted-foreground"
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-3 lg:flex">
          <Button asChild variant="outline" size="sm" className="border-border/70 hover:border-accent/40 transition-colors">
            <Link href="/contact">
              <span>Request Demo</span>
            </Link>
          </Button>
          <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-xs group">
            <Link href={dashboardUrl}>
              <span>Access Portal</span>
              <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </Button>
        </div>

        {/* Mobile Menu */}
        {mounted && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden hover:bg-secondary">
                <Menu className="size-5" />
                <span className="sr-only">Open navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-sm border-l border-border bg-background/95 backdrop-blur-xl">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <SheetDescription className="sr-only">Site navigation links and operational zones</SheetDescription>
              <div className="flex flex-col gap-6 pt-4">
                <Link
                  href="/"
                  className="flex items-center gap-2.5"
                  onClick={() => setOpen(false)}
                >
                  <div className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground font-serif font-bold text-sm">
                    M
                  </div>
                  <span className="font-serif text-xl font-bold">{siteConfig.name}</span>
                </Link>
                <nav className="flex flex-col gap-1" aria-label="Mobile Navigation">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "rounded-md px-3 py-2.5 text-base font-medium transition-colors hover:bg-secondary",
                        pathname === item.href
                          ? "text-accent bg-secondary/80 font-semibold"
                          : "text-foreground"
                      )}
                    >
                      {item.name}
                    </Link>
                  ))}
                </nav>
                <div className="border-t border-border pt-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Operational Hubs
                  </p>
                  <div className="flex flex-col gap-1">
                    {locations.map((hub) => (
                      <Link
                        key={hub.slug}
                        href={`/locations/${hub.slug}`}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 rounded-md px-3 py-2 transition-colors hover:bg-secondary"
                      >
                        <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {hub.shortName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {hub.district}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="border-t border-border pt-4 flex flex-col gap-2.5">
                  <Button asChild variant="outline" className="w-full border-border hover:border-accent/40">
                    <Link href="/contact" onClick={() => setOpen(false)}>
                      <span>Request Demo</span>
                    </Link>
                  </Button>
                  <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90 flex items-center justify-center gap-1.5">
                    <Link href={dashboardUrl} onClick={() => setOpen(false)}>
                      <span>Access Portal</span>
                      <ArrowUpRight className="size-4" />
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
