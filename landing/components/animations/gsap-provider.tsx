"use client"

import { useEffect } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { ScrollToPlugin } from "gsap/ScrollToPlugin"
import { useGSAP } from "@gsap/react"

// Register plugins at the module level to ensure they are available immediately
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, useGSAP)
}

export function GSAPProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Global GSAP settings
    gsap.config({
      nullTargetWarn: false,
    })

    // Default ScrollTrigger settings
    ScrollTrigger.config({
      ignoreMobileResize: true,
    })
  }, [])

  return <>{children}</>
}
