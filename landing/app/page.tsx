import { HeroSection } from "@/components/home/hero-section"
import { StoryPreview } from "@/components/home/story-preview"
import { CoreCapabilities } from "@/components/home/core-capabilities"
import { LocationsPreview } from "@/components/home/locations-preview"
import { TestimonialsSection } from "@/components/home/testimonials-section"
import { CtaSection } from "@/components/home/cta-section"

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <StoryPreview />
      <CoreCapabilities />
      <LocationsPreview />
      <TestimonialsSection />
      <CtaSection />
    </>
  )
}
