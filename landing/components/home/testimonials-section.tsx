"use client"

import { useRef, useState, useEffect } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Star, Quote } from "lucide-react"
import { SectionHeader } from "@/components/section-header"
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

  const fetchReviews = async () => {
    try {
      const res = await fetch("/api/reviews")
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        const mapped: Testimonial[] = data.data.map((r: any) => ({
          quote: r.comment,
          author: r.name,
          location: r.role_title || "Verified Partner",
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
          y: 25,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: "power3.out",
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
      setError("Please fill in all required fields and complete the captcha check.")
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

  const allTestimonials = [...dynamicReviews, ...staticTestimonials]

  return (
    <section ref={containerRef} className="border-b border-border bg-background py-20 lg:py-28 text-foreground">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeader
          label="05 // SYSTEM IMPACT"
          title="Workforce Transparency Achieved"
          description="Driving attendance accuracy, geofence compliance, and operational transparency across logistics operations."
        />

        {/* Write a Review Button and Modal */}
        <div className="mt-8 flex justify-center">
          {mounted && (
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                if (!open) handleClose()
                else setIsDialogOpen(true)
              }}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="h-9 bg-accent text-accent-foreground hover:bg-accent/90 px-4 rounded-full font-mono text-xs uppercase tracking-wider shadow-sm transition-transform hover:scale-105 cursor-pointer flex items-center gap-1.5"
                >
                  <Star className="size-3.5 fill-accent-foreground text-accent-foreground" />
                  Write a Review
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[460px] bg-background text-foreground border-border shadow-bryl rounded-2xl p-6">
                {isSuccess ? (
                  <div className="flex flex-col items-center text-center p-4 space-y-3">
                    <div className="flex size-12 items-center justify-center rounded-full bg-accent/20 text-accent">
                      <Star className="size-6 fill-accent text-accent" />
                    </div>
                    <DialogTitle className="text-xl font-bold font-sans text-foreground">Review Submitted</DialogTitle>
                    <DialogDescription className="text-muted-foreground text-xs max-w-sm leading-relaxed">
                      Thank you. Your feedback has been received. To maintain integrity, submissions undergo administrator approval before displaying.
                    </DialogDescription>
                    <Button
                      onClick={() => handleClose()}
                      className="mt-3 bg-accent text-accent-foreground hover:bg-accent/90 rounded-md px-5 text-xs font-mono uppercase"
                    >
                      Close
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <DialogHeader>
                      <DialogTitle className="text-lg font-bold font-sans text-foreground flex items-center gap-2">
                        <Star className="size-4 fill-amber-400 text-amber-400" />
                        Write a System Review
                      </DialogTitle>
                      <DialogDescription className="text-muted-foreground text-xs">
                        Share your field experience with MKBRiderTrack&apos;s biometric attendance, geofencing, or payroll platform.
                      </DialogDescription>
                    </DialogHeader>

                    {error && (
                      <div className="bg-destructive/10 text-destructive text-xs p-2.5 rounded-md border border-destructive/20 font-mono">
                        {error}
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label htmlFor="name" className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                          Full Name
                        </Label>
                        <Input
                          id="name"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g. John Doe"
                          className="h-9 text-xs border-border bg-secondary/40 text-foreground"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="role_title" className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                          Designation / Role (Optional)
                        </Label>
                        <Input
                          id="role_title"
                          value={formData.role_title}
                          onChange={(e) => setFormData((prev) => ({ ...prev, role_title: e.target.value }))}
                          placeholder="e.g. Operations Manager, Courier Partner"
                          className="h-9 text-xs border-border bg-secondary/40 text-foreground"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground block">
                          Rating
                        </Label>
                        <div className="flex gap-1 items-center">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              type="button"
                              key={star}
                              onClick={() => setFormData((prev) => ({ ...prev, rating: star }))}
                              className="p-1 hover:scale-110 transition-transform focus:outline-hidden cursor-pointer"
                            >
                              <Star
                                className={`size-5 transition-colors ${
                                  star <= formData.rating
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-muted-foreground/30 hover:text-amber-400/50"
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="comment" className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                          Review Comment
                        </Label>
                        <Textarea
                          id="comment"
                          required
                          value={formData.comment}
                          onChange={(e) => setFormData((prev) => ({ ...prev, comment: e.target.value }))}
                          placeholder="Provide detailed feedback on system reliability, attendance accuracy, or payroll clarity..."
                          rows={3}
                          className="text-xs border-border bg-secondary/40 text-foreground resize-none"
                        />
                      </div>

                      <div className="pt-2 flex justify-center">
                        <Turnstile
                          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"}
                          onSuccess={(token) => setTurnstileToken(token)}
                          onError={() => setError("Captcha validation failed to load. Please refresh.")}
                          onExpire={() => setTurnstileToken("")}
                        />
                      </div>
                    </div>

                    <DialogFooter className="pt-3 border-t border-border flex sm:justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleClose()}
                        className="text-xs text-muted-foreground hover:bg-secondary cursor-pointer"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={isSubmitting || !turnstileToken}
                        className="bg-accent text-accent-foreground hover:bg-accent/90 px-4 text-xs font-mono uppercase tracking-wider cursor-pointer disabled:opacity-50"
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
          <div className="mt-14 grid gap-6 md:grid-cols-3 max-w-4xl mx-auto items-stretch">
            {/* Rating Summary Bento Card */}
            <div className="md:col-span-1 rounded-2xl border border-border bg-card p-5 shadow-bryl flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Rating Summary</span>
                  <span className="font-mono text-[9px] uppercase tracking-wider border border-accent/30 bg-accent/10 px-1.5 py-0.5 rounded text-accent">
                    Live
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-4xl font-bold tracking-tight text-foreground">0.0</span>
                    <span className="font-mono text-xs text-muted-foreground">/ 5.0</span>
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="size-3.5 text-muted-foreground/30" />
                    ))}
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">0 verified submissions</p>
                </div>
              </div>

              <div className="pt-4 border-t border-border font-mono text-[10px] text-muted-foreground flex items-center gap-1.5">
                <Quote className="size-3 text-accent/50" />
                Moderation queue is active and empty.
              </div>
            </div>

            {/* Feed Overview Card */}
            <div className="md:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-bryl flex flex-col justify-between min-h-[220px]">
              <div className="space-y-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-accent">// Feed Overview</span>
                <h3 className="text-lg font-bold font-sans text-foreground tracking-tight">
                  Share Your Experience
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  How has MKBRiderTrack impacted your workforce operations? Feedback from dispatchers, HR specialists, payroll controllers, and courier partners drives continuous platform refinement.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsDialogOpen(true)}
                className="mt-4 p-3 rounded-xl border border-dashed border-border bg-secondary/30 flex items-center justify-between group hover:border-accent/50 transition-colors cursor-pointer text-left w-full"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-md bg-accent/15 text-accent font-mono text-xs font-bold">
                    ★
                  </div>
                  <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground">
                    Submit first verified review...
                  </span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-accent underline decoration-accent/40 group-hover:decoration-accent">
                  Open Form &rarr;
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {allTestimonials.map((testimonial, index) => (
              <div
                key={index}
                className="testimonial-card relative rounded-2xl border border-border bg-card p-6 shadow-bryl"
              >
                <Quote className="absolute right-5 top-5 size-5 text-accent/25" />
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="size-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <blockquote className="text-xs leading-relaxed text-foreground">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>
                <div className="mt-5 flex items-center gap-2.5 border-t border-border pt-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground font-mono text-xs font-bold shadow-xs">
                    {testimonial.author.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      {testimonial.author}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">
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
