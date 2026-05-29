"use client"

import React, { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

interface MagneticProps {
  children: React.ReactElement
  range?: number
  actionArea?: number
}

export function Magnetic({ children, range = 0.35, actionArea = 60 }: MagneticProps) {
  const containerRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const el = containerRef.current
      if (!el) return

      const onMouseMove = (e: MouseEvent) => {
        const { clientX, clientY } = e
        const { left, top, width, height } = el.getBoundingClientRect()
        const centerX = left + width / 2
        const centerY = top + height / 2

        const deltaX = clientX - centerX
        const deltaY = clientY - centerY
        const distance = Math.hypot(deltaX, deltaY)

        if (distance < actionArea) {
          // Attract towards cursor
          gsap.to(el, {
            x: deltaX * range,
            y: deltaY * range,
            duration: 0.3,
            ease: "power2.out",
          })
        } else {
          // Snap back smoothly
          gsap.to(el, {
            x: 0,
            y: 0,
            duration: 0.5,
            ease: "power3.out",
          })
        }
      }

      const onMouseLeave = () => {
        gsap.to(el, {
          x: 0,
          y: 0,
          duration: 0.6,
          ease: "elastic.out(1, 0.3)",
        })
      }

      window.addEventListener("mousemove", onMouseMove)
      el.addEventListener("mouseleave", onMouseLeave)

      return () => {
        window.removeEventListener("mousemove", onMouseMove)
        el.removeEventListener("mouseleave", onMouseLeave)
      }
    },
    { scope: containerRef }
  )

  return React.cloneElement(children as React.ReactElement<any>, {
    ref: containerRef,
  })
}
