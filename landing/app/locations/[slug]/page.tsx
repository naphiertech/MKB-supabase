import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, MapPin, Clock, Phone, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SectionHeader } from "@/components/section-header"
import { siteConfig, locations } from "@/lib/data"
import { LocationMenu } from "@/components/location-menu"

export function generateStaticParams() {
  return locations.map((loc) => ({ slug: loc.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const location = locations.find((l) => l.slug === slug)
  if (!location) return {}

  return {
    title: location.name,
    description: location.description,
    openGraph: {
      title: `${location.name} | The Hearth`,
      description: location.description,
      url: `${siteConfig.url}/locations/${location.slug}`,
      images: [{ url: "/images/og-image.jpg", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${location.name} | The Hearth`,
      description: location.description,
    },
    alternates: { canonical: `${siteConfig.url}/locations/${location.slug}` },
  }
}

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const location = locations.find((l) => l.slug === slug)
  if (!location) notFound()

  const categories = [...new Set(location.menu.map((item) => item.category))]

  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[50vh] items-center overflow-hidden bg-primary">
        <div className="absolute inset-0">
          <Image
            src={location.image}
            alt={location.name}
            fill
            className="object-cover opacity-30"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/60 to-primary/30" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-24 lg:px-8">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="mb-6 text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10"
          >
            <Link href="/locations">
              <ArrowLeft className="size-4" />
              All Locations
            </Link>
          </Button>
          <Badge className="mb-4 bg-accent/20 text-accent border-accent/30">
            {location.tagline}
          </Badge>
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight tracking-tight text-primary-foreground md:text-6xl lg:text-7xl">
            {location.name}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-primary-foreground/80">
            {location.description}
          </p>
        </div>
      </section>

      {/* Info Bar */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-medium text-card-foreground">
                {location.address}
              </p>
              <p className="text-sm text-muted-foreground">{location.city}</p>
            </div>
          </div>
          <Separator orientation="vertical" className="hidden h-8 md:block" />
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 size-5 shrink-0 text-accent" />
            <div className="flex flex-col gap-0.5">
              {location.hours.map((h) => (
                <p key={h.days} className="text-sm text-muted-foreground">
                  <span className="font-medium text-card-foreground">
                    {h.days}:
                  </span>{" "}
                  {h.time}
                </p>
              ))}
            </div>
          </div>
          <Separator orientation="vertical" className="hidden h-8 md:block" />
          <div className="flex items-center gap-3">
            <Phone className="size-5 shrink-0 text-accent" />
            <a
              href={`tel:${location.phone}`}
              className="text-sm font-medium text-card-foreground hover:text-accent"
            >
              {location.phone}
            </a>
          </div>
          <Button
            asChild
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Link href="/contact">Access Portal</Link>
          </Button>
        </div>
      </section>

      {/* Gallery */}
      <section className="bg-background py-12 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {location.gallery.map((img, i) => (
              <div
                key={i}
                className={`relative overflow-hidden rounded-lg ${
                  i === 0 ? "col-span-2 aspect-[16/9] md:col-span-1 md:aspect-[4/3]" : "aspect-[4/3]"
                }`}
              >
                <Image
                  src={img}
                  alt={`${location.name} gallery image ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 33vw"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-secondary py-12 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12">
            {location.features.map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-2 text-sm font-medium text-foreground"
              >
                <div className="size-2 rounded-full bg-accent" />
                {feature}
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* Other Locations */}
      <section className="bg-secondary py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <SectionHeader
            label="Explore More"
            title="Our Other Locations"
          />
          <div className="mt-14 grid gap-8 md:grid-cols-2">
            {locations
              .filter((l) => l.slug !== location.slug)
              .map((loc) => (
                <Link
                  key={loc.slug}
                  href={`/locations/${loc.slug}`}
                  className="group relative overflow-hidden rounded-lg"
                >
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <Image
                      src={loc.image}
                      alt={loc.name}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, 50vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent" />
                    <div className="absolute bottom-6 left-6 right-6">
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/60">
                        {loc.tagline}
                      </p>
                      <h3 className="font-serif text-2xl font-bold text-primary-foreground">
                        {loc.name}
                      </h3>
                      <div className="mt-2 flex items-center gap-2 text-sm text-primary-foreground/80">
                        View Location
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      </section>
    </>
  )
}
