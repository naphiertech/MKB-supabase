"use client"

import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Star, Quote } from "lucide-react"
import { SectionHeader } from "@/components/section-header"
import { AnimateIn } from "@/components/animations/animate-in"
import { testimonials } from "@/lib/data"

export function TestimonialsSection() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const cards = gsap.utils.toArray(".testimonial-card")
      if (!cards.length) return

      gsap.fromTo(
        cards,
        {
          opacity: 0,
          scale: 0.9,
          clipPath: "inset(100% 0 0 0)",
        },
        {
          opacity: 1,
          scale: 1,
          clipPath: "inset(0% 0 0 0)",
          duration: 1.5,
          stagger: 0.2,
          ease: "expo.out",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top 80%",
            toggleActions: "play none none none",
          },
        }
      )
    },
    { scope: containerRef }
  )

  return (
    <section ref={containerRef} className="bg-primary py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeader
          label="System Impact"
          title="Workforce Transparency Achieved"
          description="Driving attendance accuracy, geofence compliance, and operational transparency across the workforce."
        />

        <div className="mt-14 grid gap-8 md:grid-cols-2">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="testimonial-card relative rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 p-8"
            >
              <Quote className="absolute right-6 top-6 size-8 text-accent/20" />
              <div className="mb-4 flex gap-1">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star key={i} className="size-4 fill-accent text-accent" />
                ))}
              </div>
              <blockquote className="text-base leading-relaxed text-primary-foreground/90">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>
              <div className="mt-6 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-accent/20 font-serif text-sm font-bold text-accent">
                  {testimonial.author.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary-foreground">
                    {testimonial.author}
                  </p>
                  <p className="text-xs text-primary-foreground/60">
                    {testimonial.location}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
