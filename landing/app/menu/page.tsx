import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SectionHeader } from "@/components/section-header"
import { siteConfig, locations } from "@/lib/data"

export const metadata: Metadata = {
  title: "Core Modules",
  description:
    "Explore the capabilities and services at all MKB Hub locations. From express parcel delivery to predictive analytics.",
  openGraph: {
    title: "Core Modules | MKB System",
    description:
      "Explore the capabilities and services at all MKB Hub locations.",
    url: `${siteConfig.url}/menu`,
    images: [{ url: "/images/og-image.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Core Modules | MKB System",
    description: "Explore the capabilities and services at all MKB Hub locations.",
  },
  alternates: { canonical: `${siteConfig.url}/menu` },
}

export default function MenuPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[40vh] items-center overflow-hidden bg-primary">
        <div className="absolute inset-0">
          <Image
            src="/images/menu-hero.jpg"
            alt="Logistics data visualization"
            fill
            className="object-cover opacity-30"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/60 to-primary/30" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-24 lg:px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Core Modules
          </p>
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight tracking-tight text-primary-foreground md:text-6xl lg:text-7xl">
            Advanced Features, Scalable Operations
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-primary-foreground/80">
            Each MKB hub offers specialized services and predictive modules tailored for complex logistics workflows.
          </p>
        </div>
      </section>

      {/* Menus by Location */}
      {locations.map((location, locationIndex) => {
        const categories = [
          ...new Set(location.menu.map((item) => item.category)),
        ]

        return (
          <section
            key={location.slug}
            className={
              locationIndex % 2 === 0
                ? "bg-background py-20 lg:py-28"
                : "bg-secondary py-20 lg:py-28"
            }
          >
            <div className="mx-auto max-w-7xl px-4 lg:px-8">
              {/* Location Header */}
              <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4 text-accent" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                      {location.tagline}
                    </span>
                  </div>
                  <h2 className="mt-2 font-serif text-3xl font-bold text-foreground md:text-4xl">
                    {location.shortName} Capabilities
                  </h2>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    {location.address}, {location.city}
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link href={`/locations/${location.slug}`}>
                    View Hub
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>

              <Separator className="my-10" />

              {/* Menu Categories */}
              {categories.map((category) => {
                const items = location.menu.filter(
                  (item) => item.category === category
                )
                return (
                  <div key={category} className="mb-12 last:mb-0">
                    <h3 className="mb-6 font-serif text-2xl font-bold text-foreground">
                      {category}
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      {items.map((item) => (
                        <div
                          key={item.name}
                          className="flex gap-4 rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-sm"
                        >
                          {item.image && (
                            <div className="relative size-16 shrink-0 overflow-hidden rounded-md">
                              <Image
                                src={item.image}
                                alt={item.name}
                                fill
                                className="object-cover"
                                sizes="64px"
                              />
                            </div>
                          )}
                          <div className="flex flex-1 flex-col">
                            <div className="flex items-start justify-between gap-3">
                              <h4 className="font-serif text-base font-bold text-card-foreground">
                                {item.name}
                              </h4>
                              <span className="shrink-0 font-semibold text-accent text-sm">
                                {item.price}
                              </span>
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                              {item.description}
                            </p>
                            {item.tags && item.tags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {item.tags.map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {/* CTA */}
      <section className="bg-primary py-20 text-center lg:py-28">
        <div className="mx-auto max-w-2xl px-4 lg:px-8">
          <SectionHeader
            label="Integrate MKB"
            title="Ready to Transform Your Logistics?"
            description="Our modules are highly scalable. Request a demo to see how MKB can be deployed to your exact operational requirements."
          />
          <Button
            asChild
            size="lg"
            className="mt-8 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Link href="/locations">
              Request a Demo
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
