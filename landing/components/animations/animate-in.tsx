"use client"

import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

interface AnimateInProps {
  children: React.ReactNode
  from?: gsap.TweenVars
  to?: gsap.TweenVars
  duration?: number
  delay?: number
  stagger?: number
  threshold?: number
  className?: string
}

export function AnimateIn({
  children,
  from = { opacity: 0, y: 30, filter: "blur(10px)" },
  to = { opacity: 1, y: 0, filter: "blur(0px)" },
  duration = 1.2,
  delay = 0,
  stagger = 0.1,
  threshold = 0.1,
  className = "",
}: AnimateInProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const elements = containerRef.current?.children
      if (!elements) return

      gsap.fromTo(elements, from, {
        ...to,
        duration,
        delay,
        stagger,
        ease: "expo.out",
        scrollTrigger: {
          trigger: containerRef.current,
          start: `top bottom-=${threshold * 100}%`,
          toggleActions: "play none none none",
        },
      })
    },
    { scope: containerRef }
  )

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  )
}
