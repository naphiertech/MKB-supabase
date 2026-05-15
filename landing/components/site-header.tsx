"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X, MapPin, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { siteConfig, locations } from "@/lib/data"
import { cn } from "@/lib/utils"

const navigation = [
  { name: "About System", href: "/about" },
  { name: "Core Team", href: "/team" },
  { name: "Geofence Zones", href: "/locations" },
  { name: "Contact", href: "/contact" },
]

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="font-serif text-2xl font-bold tracking-tight text-foreground">
            {siteConfig.name}
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 lg:flex">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-accent",
                pathname === item.href
                  ? "text-accent"
                  : "text-muted-foreground"
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-3 lg:flex">
          <Button asChild variant="outline" size="sm">
            <Link href="/contact">
              <Phone className="size-4" />
              <span className="sr-only sm:not-sr-only">{siteConfig.phone}</span>
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/locations">Access Portal</Link>
          </Button>
        </div>

        {/* Mobile Menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="size-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full max-w-sm">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <div className="flex flex-col gap-6 pt-6">
              <Link
                href="/"
                className="font-serif text-2xl font-bold"
                onClick={() => setOpen(false)}
              >
                {siteConfig.name}
              </Link>
              <nav className="flex flex-col gap-1">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "rounded-md px-3 py-3 text-base font-medium transition-colors hover:bg-secondary",
                      pathname === item.href
                        ? "text-accent"
                        : "text-foreground"
                    )}
                  >
                    {item.name}
                  </Link>
                ))}
              </nav>
              <div className="border-t border-border pt-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Geofence Zones
                </p>
                {locations.map((loc) => (
                  <Link
                    key={loc.slug}
                    href={`/locations/${loc.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-secondary"
                  >
                    <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {loc.shortName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {loc.address}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
              <Button asChild className="mt-2">
                <Link href="/locations" onClick={() => setOpen(false)}>
                  Access Portal
                </Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
