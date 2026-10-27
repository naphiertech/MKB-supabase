"use client"

import { useRef, useState, useEffect } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { Star, Quote, Plus } from "lucide-react"
import { Eyebrow } from "@/components/section-header"
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
  const [turnstileKey, setTurnstileKey] = useState(0)
  const [fallbackToTestKey, setFallbackToTestKey] = useState(false)

  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname.endsWith(".local") ||
      window.location.hostname === "")

  const effectiveSiteKey = isLocalhost
    ? "1x00000000000000000000AA"
    : process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"

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
      gsap.registerPlugin(ScrollTrigger)
      const cards = gsap.utils.toArray(".testimonial-card")
      if (!cards.length) return

      gsap.from(cards, {
        opacity: 0,
        y: 20,
        duration: 0.6,
        stagger: 0.08,
        ease: "power2.out",
        clearProps: "all",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 85%",
          once: true,
        },
      })
    },
    { scope: containerRef, dependencies: [dynamicReviews] }
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    if (!turnstileToken) {
      setError("Please complete the Turnstile verification.")
      setIsSubmitting(false)
      return
    }

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
      setError(err.message || "An unexpected error occurred.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetFormState = () => {
    setIsSuccess(false)
    setError(null)
    setTurnstileToken("")
    setFallbackToTestKey(false)
    setTurnstileKey((k) => k + 1)
  }

  const handleClose = () => {
    setIsDialogOpen(false)
    resetFormState()
  }

  const allTestimonials = dynamicReviews.length > 0 ? dynamicReviews : staticTestimonials

  return (
    <section ref={containerRef} className="container section-space">
      <div className="section-header" data-reveal>
        <div>
          <Eyebrow>VERIFIED FEEDBACK</Eyebrow>
          <h2>
            Operational trust.
            <br />
            In practice.
          </h2>
        </div>
        <div className="flex flex-col items-start gap-4 max-w-[340px]">
          <p className="text-xs md:text-sm text-[#70766a] leading-relaxed">
            Direct feedback from dispatchers, HR officers, and logistics leads operating across our network.
          </p>

          {mounted && (
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open)
                if (!open) {
                  resetFormState()
                }
              }}
            >
              <DialogTrigger asChild>
                <button className="button button-outline text-xs cursor-pointer">
                  <Plus size={14} />
                  <span>Share Experience</span>
                </button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-md border border-[#e3e8da] bg-[#fafbf7] p-6 text-[#272923]">
              <DialogHeader>
                <div className="eyebrow mb-2">
                  <span />
                  PUBLIC FEEDBACK
                </div>
                <DialogTitle className="font-semibold text-xl tracking-tight text-[#282b26]">
                  Submit Operator Feedback
                </DialogTitle>
                <DialogDescription className="text-xs text-[#767a71] leading-relaxed">
                  Submitted testimonials undergo human verification by MKB Operations administrators
                  prior to public publication.
                </DialogDescription>
              </DialogHeader>

              {isSuccess ? (
                <div className="py-8 text-center space-y-3">
                  <div className="size-12 rounded-full bg-[#eaf0e3] text-[#657855] mx-auto flex items-center justify-center font-bold text-lg">
                    ✓
                  </div>
                  <h4 className="font-semibold text-base text-[#282b26]">
                    Feedback Received for Moderation
                  </h4>
                  <p className="text-xs text-[#767a71] max-w-xs mx-auto">
                    Thank you. Your operational feedback has been saved and will appear publicly once
                    reviewed.
                  </p>
                  <button onClick={handleClose} className="button button-dark mt-4">
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                  {error && (
                    <div className="p-3 text-xs bg-[#f8eae4] text-[#b3816d] rounded border border-[#f2e6d9] flex items-center justify-between gap-2">
                      <span>{error}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null)
                          setTurnstileToken("")
                          setFallbackToTestKey(true)
                          setTurnstileKey((k) => k + 1)
                        }}
                        className="underline font-semibold hover:text-[#282b26] cursor-pointer shrink-0"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  <div className="space-y-3 text-left">
                    <div className="space-y-1">
                      <Label htmlFor="name" className="text-[11px] font-semibold text-[#767a71]">
                        Full Name
                      </Label>
                      <Input
                        id="name"
                        required
                        value={formData.name}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, name: e.target.value }))
                        }
                        placeholder="e.g. John Doe"
                        className="h-9 text-xs border-[#e3e8da] bg-white text-[#272923]"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label
                        htmlFor="role_title"
                        className="text-[11px] font-semibold text-[#767a71]"
                      >
                        Designation / Role (Optional)
                      </Label>
                      <Input
                        id="role_title"
                        value={formData.role_title}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, role_title: e.target.value }))
                        }
                        placeholder="e.g. Operations Manager, Courier Lead"
                        className="h-9 text-xs border-[#e3e8da] bg-white text-[#272923]"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-[#767a71] block">
                        Rating
                      </Label>
                      <div className="flex gap-1 items-center">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            type="button"
                            key={star}
                            onClick={() => setFormData((prev) => ({ ...prev, rating: star }))}
                            className="p-1 hover:scale-110 transition-transform cursor-pointer"
                          >
                            <Star
                              className={`size-5 transition-colors ${
                                star <= formData.rating
                                  ? "fill-[var(--orange)] text-[var(--orange)]"
                                  : "text-[#dce3d0] hover:text-[var(--orange)]"
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label
                        htmlFor="comment"
                        className="text-[11px] font-semibold text-[#767a71]"
                      >
                        Review Comment
                      </Label>
                      <Textarea
                        id="comment"
                        required
                        value={formData.comment}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, comment: e.target.value }))
                        }
                        placeholder="Share your experience on attendance accuracy, geofence reliability, or payroll ease..."
                        rows={3}
                        className="text-xs border-[#e3e8da] bg-white text-[#272923] resize-none"
                      />
                    </div>

                    <div className="pt-2 flex justify-center min-h-[65px] items-center">
                      <Turnstile
                        key={`turnstile-${turnstileKey}`}
                        siteKey={
                          fallbackToTestKey
                            ? "1x00000000000000000000AA"
                            : effectiveSiteKey
                        }
                        options={{
                          theme: "light",
                          retry: "auto",
                          retryInterval: 3000,
                          refreshExpired: "auto",
                        }}
                        onSuccess={(token) => {
                          setTurnstileToken(token)
                          setError(null)
                        }}
                        onError={(errCode) => {
                          console.warn("[Turnstile] Widget error:", errCode)
                          if (!fallbackToTestKey && effectiveSiteKey !== "1x00000000000000000000AA") {
                            setFallbackToTestKey(true)
                            setTurnstileKey((k) => k + 1)
                          } else {
                            setError("Captcha verification failed. Click Retry or refresh.")
                          }
                        }}
                        onExpire={() => setTurnstileToken("")}
                      />
                    </div>
                  </div>

                  <DialogFooter className="pt-3 border-t border-[#e7e8e2] flex sm:justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="button button-outline text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !turnstileToken}
                      className="button button-orange text-xs"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Review"}
                    </button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      {allTestimonials.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2">
          {allTestimonials.map((testimonial, index) => {
            const colors = ["sage", "peach", "blue", "sand"]
            const avatarColor = colors[index % colors.length]

            return (
              <div
                key={index}
                className="testimonial-card relative rounded-md border border-[#e7e8e2] bg-[#ffffff] p-7 transition-all duration-300 hover:border-[#f3682c]/40 hover:-translate-y-1 shadow-[0_2px_12px_rgba(40,43,38,0.04)]"
              >
                <Quote className="absolute right-6 top-6 size-5 text-[#d0d5c8] pointer-events-none" />
                <div className="mb-3.5 flex gap-1">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="size-3.5 fill-[var(--orange)] text-[var(--orange)]" />
                  ))}
                </div>
                <blockquote className="text-xs leading-relaxed text-[#282b26] italic font-sans md:text-[13px]">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>
                <div className="mt-6 flex items-center gap-3 border-t border-[#e7e8e2] pt-4">
                  <span className={`avatar ${avatarColor}`}>{testimonial.author.charAt(0)}</span>
                  <div>
                    <p className="text-xs font-semibold text-[#282b26]">{testimonial.author}</p>
                    <p className="text-[10px] text-[#70766a] font-mono uppercase tracking-wider">{testimonial.location}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[#e7e8e2] bg-[#fafbf7] p-10 text-center">
          <p className="font-heading text-sm font-semibold text-[#282b26]">
            No verified reviews published yet
          </p>
          <p className="mt-1 text-xs text-[#70766a] max-w-sm mx-auto">
            Feedback submitted by dispatchers and operators will appear here once verified by administrators.
          </p>
        </div>
      )}
    </section>
  )
}
