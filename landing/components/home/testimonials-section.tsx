"use client"

import { useRef, useState, useEffect } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Star, Quote } from "lucide-react"
import { SectionHeader } from "@/components/section-header"
import { AnimateIn } from "@/components/animations/animate-in"
import { testimonials as staticTestimonials, type Testimonial } from "@/lib/data"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Turnstile } from "@marsidev/react-turnstile"

export function TestimonialsSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dynamicReviews, setDynamicReviews] = useState<Testimonial[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: "",
    role_title: "",
    rating: 5,
    comment: "",
  })
  const [turnstileToken, setTurnstileToken] = useState<string>("")

  // Fetch approved reviews from API
  const fetchReviews = async () => {
    try {
      const res = await fetch("/api/reviews")
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        const mapped: Testimonial[] = data.data.map((r: any) => ({
          quote: r.comment,
          author: r.name,
          location: r.role_title || "Verified Customer",
          rating: r.rating,
        }))
        setDynamicReviews(mapped)
      }
    } catch (err) {
      console.error("Failed to fetch reviews:", err)
    }
  }

  useEffect(() => {
    setMounted(true)
    fetchReviews()
  }, [])

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
    { scope: containerRef, dependencies: [dynamicReviews] }
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.comment || !turnstileToken) {
      setError("Please fill in all fields and complete the captcha check.")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          turnstileToken,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit review")
      }

      setIsSuccess(true)
      setFormData({ name: "", role_title: "", rating: 5, comment: "" })
      setTurnstileToken("")
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setIsDialogOpen(false)
    setIsSuccess(false)
    setError(null)
  }

  // Combine static and dynamically fetched approved reviews
  const allTestimonials = [...dynamicReviews, ...staticTestimonials]

  return (
    <section ref={containerRef} className="bg-primary py-20 lg:py-28 text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeader
          label="System Impact"
          title="Workforce Transparency Achieved"
          description="Driving attendance accuracy, geofence compliance, and operational transparency across the workforce."
          className="text-primary-foreground"
          titleClassName="text-white"
          descriptionClassName="text-white/70"
        />

        {/* Write a Review Button and Modal */}
        <div className="mt-8 flex justify-center">
          {mounted && (
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              if (!open) handleClose()
              else setIsDialogOpen(true)
            }}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 px-6 py-5 rounded-full font-semibold shadow-md transition-all duration-300 transform hover:scale-105 cursor-pointer flex items-center gap-2">
                <Star className="size-4 fill-accent-foreground text-accent-foreground" />
                Write a Review
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-background text-foreground border-border shadow-2xl rounded-xl">
              {isSuccess ? (
                <div className="flex flex-col items-center text-center p-6 space-y-4">
                  <div className="flex size-14 items-center justify-center rounded-full bg-accent/20 text-accent">
                    <Star className="size-8 fill-accent" />
                  </div>
                  <DialogTitle className="text-2xl font-bold font-serif text-accent">Review Submitted!</DialogTitle>
                  <DialogDescription className="text-muted-foreground text-sm max-w-sm">
                    Thank you! Your feedback has been received. To prevent spam, new reviews must be approved by our administration before they appear publicly on the page.
                  </DialogDescription>
                  <Button onClick={() => handleClose()} className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90 rounded-full px-6 cursor-pointer">
                    Close
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold font-serif text-accent flex items-center gap-2">
                      <Star className="size-5 fill-accent text-accent" />
                      Write a Review
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground text-sm">
                      Share your experience with our biometric and geofencing systems. No sign-in required.
                    </DialogDescription>
                  </DialogHeader>
                  {error && (
                    <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md border border-destructive/20 font-medium">
                      {error}
                    </div>
                  )}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Name</Label>
                      <Input
                        id="name"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. John Doe"
                        className="border-input bg-transparent text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="role_title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Designation / Role (Optional)</Label>
                      <Input
                        id="role_title"
                        value={formData.role_title}
                        onChange={(e) => setFormData(prev => ({ ...prev, role_title: e.target.value }))}
                        placeholder="e.g. Operations Manager, Courier Partner"
                        className="border-input bg-transparent text-foreground"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Rating</Label>
                      <div className="flex gap-1.5 items-center">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            type="button"
                            key={star}
                            onClick={() => setFormData(prev => ({ ...prev, rating: star }))}
                            className="p-1 hover:scale-110 transition-transform focus:outline-hidden cursor-pointer"
                          >
                            <Star
                              className={`size-7 transition-all ${
                                star <= formData.rating
                                  ? "fill-accent text-accent"
                                  : "text-muted-foreground/30 hover:text-accent/50"
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="comment" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review Comment</Label>
                      <Textarea
                        id="comment"
                        required
                        value={formData.comment}
                        onChange={(e) => setFormData(prev => ({ ...prev, comment: e.target.value }))}
                        placeholder="Tell us what you think..."
                        rows={4}
                        className="border-input bg-transparent text-foreground resize-none"
                      />
                    </div>
                    
                    {/* Captcha Integration */}
                    <div className="pt-2 flex justify-center">
                      <Turnstile
                        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                        onSuccess={(token) => setTurnstileToken(token)}
                        onError={() => setError('Captcha validation failed to load. Please refresh.')}
                        onExpire={() => setTurnstileToken('')}
                      />
                    </div>
                  </div>
                  <DialogFooter className="pt-3 border-t border-border flex sm:justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleClose()}
                      className="rounded-full border-muted-foreground/20 text-muted-foreground hover:bg-muted/10 cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting || !turnstileToken}
                      className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full px-6 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Review"}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
          )}
        </div>

        {allTestimonials.length === 0 ? (
          <div className="mt-14 grid gap-8 md:grid-cols-3 max-w-5xl mx-auto items-stretch">
            {/* 1. Rating Summary Bento Card */}
            <div className="md:col-span-1 relative overflow-hidden rounded-2xl border border-primary-foreground/10 bg-primary-foreground/5 p-6 backdrop-blur-sm shadow-xl flex flex-col justify-between">
              {/* Glowing Background Radial */}
              <div className="absolute -top-12 -left-12 w-28 h-28 bg-accent/10 rounded-full blur-2xl pointer-events-none" />
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-widest text-primary-foreground/40">Rating Summary</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[10px] text-accent font-semibold uppercase tracking-wider">
                    <span className="relative flex w-1.5 h-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 animate-ping" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
                    </span>
                    Live
                  </span>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-bold font-serif tracking-tight text-primary-foreground">0.0</span>
                    <span className="text-sm text-primary-foreground/40 font-medium">/ 5.0</span>
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="size-4 text-primary-foreground/15" />
                    ))}
                  </div>
                  <p className="text-xs text-primary-foreground/50 font-medium">0 verified submissions</p>
                </div>
                
                {/* Visual Empty Progress Bars */}
                <div className="space-y-2 pt-2">
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <div key={rating} className="flex items-center gap-2 text-xs">
                      <span className="w-3 text-primary-foreground/45 font-medium">{rating}</span>
                      <div className="flex-1 h-1.5 bg-primary-foreground/5 rounded-full overflow-hidden border border-primary-foreground/5">
                        <div className="h-full w-0 bg-accent transition-all duration-500" />
                      </div>
                      <span className="w-6 text-right text-primary-foreground/30 font-mono">0%</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="pt-6 border-t border-primary-foreground/5 text-xs text-primary-foreground/45 flex items-center gap-1.5">
                <Quote className="size-3.5 text-accent/40" />
                Moderation queue is active and empty.
              </div>
            </div>

            {/* 2. Interactive CTA Bento Card */}
            <div className="md:col-span-2 relative overflow-hidden rounded-2xl border border-primary-foreground/10 bg-primary-foreground/5 p-6 backdrop-blur-sm shadow-xl flex flex-col justify-between min-h-[300px]">
              <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-accent/15 rounded-full blur-3xl pointer-events-none" />
              
              <div className="space-y-4">
                <span className="text-xs font-mono uppercase tracking-widest text-primary-foreground/40">Feed Overview</span>
                <div className="space-y-2 max-w-md">
                  <h3 className="text-2xl font-bold font-serif text-primary-foreground tracking-tight leading-tight">
                    Share Your Journey on the Road
                  </h3>
                  <p className="text-sm text-primary-foreground/65 leading-relaxed">
                    How has our geofencing and facial verification system impacted your operations? Whether you are a dispatch controller, payroll manager, or rider partner, your feedback shapes our workforce security.
                  </p>
                </div>
              </div>

              {/* Decorative Mock Overlay Card */}
              <button 
                type="button"
                onClick={() => setIsDialogOpen(true)}
                className="relative mt-6 p-4 rounded-xl border border-dashed border-primary-foreground/15 bg-primary-foreground/2 flex items-center gap-4 group hover:border-accent/40 hover:bg-primary-foreground/5 transition-all duration-300 cursor-pointer text-left w-full"
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-primary-foreground/5 border border-primary-foreground/10 text-primary-foreground/30 font-serif font-bold text-sm shrink-0">
                  ?
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="h-3 bg-primary-foreground/10 rounded w-24 animate-pulse opacity-40" />
                  <div className="h-2.5 bg-primary-foreground/5 rounded w-full animate-pulse opacity-30" />
                  <div className="h-2.5 bg-primary-foreground/5 rounded w-2/3 animate-pulse opacity-30" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/30 to-transparent flex items-center justify-center rounded-xl">
                  <span className="text-xs font-semibold text-accent bg-accent/10 border border-accent/25 px-4 py-2 rounded-full flex items-center gap-1.5 shadow-sm group-hover:scale-105 transition-transform duration-300">
                    <Star className="size-3 fill-accent text-accent animate-pulse" />
                    Write the first review
                  </span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-14 grid gap-8 md:grid-cols-2">
            {allTestimonials.map((testimonial, index) => (
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
        )}
      </div>
    </section>
  )
}
