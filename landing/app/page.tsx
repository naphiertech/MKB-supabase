import Link from "next/link"
import { Fingerprint, ArrowRight } from "lucide-react"
import { HeroSection } from "@/components/home/hero-section"
import { CoreCapabilities } from "@/components/home/core-capabilities"
import { StoryPreview } from "@/components/home/story-preview"
import { SectionHeader } from "@/components/section-header"
import { RoleSwitcher } from "@/components/home/role-switcher"
import { LocationsPreview } from "@/components/home/locations-preview"
import { TestimonialsSection } from "@/components/home/testimonials-section"
import { CtaSection } from "@/components/home/cta-section"

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <CoreCapabilities />
      <StoryPreview />

      <section className="roles-section container">
        <SectionHeader
          label="ONE PLATFORM. THE RIGHT PERSPECTIVE."
          title={
            <>
              Built for your role.
              <br />
              Connected to the team.
            </>
          }
          description="Focused workspaces for the people managing operations—and the riders making them happen."
        />
        <RoleSwitcher />
      </section>

      <section className="principle-strip container" data-reveal>
        <Fingerprint size={24} />
        <p>
          The right person. The right place.
          <br />
          <strong>A record you can work with.</strong>
        </p>
        <Link href="/modules" className="text-link">
          See how attendance works
          <ArrowRight size={18} />
        </Link>
      </section>

      <LocationsPreview />
      <TestimonialsSection />
      <CtaSection />
    </>
  )
}
