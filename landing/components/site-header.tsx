"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowUpRight, Menu, X } from "lucide-react"
import gsap from "gsap"
import { Brand } from "@/components/brand-logo"
import { getDashboardUrl, navigation } from "@/lib/data"

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 20)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (open && menu.current) {
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (!prefersReduced) {
        const tween = gsap.fromTo(
          menu.current,
          { opacity: 0, y: -8 },
          { opacity: 1, y: 0, duration: 0.22 }
        )
        return () => {
          tween.kill()
        }
      }
    }
  }, [open])

  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        document.querySelector<HTMLButtonElement>(".menu-toggle")?.focus()
      }
    }
    if (open) window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [open])

  const dashboardUrl = getDashboardUrl()

  return (
    <header className={`site-header ${scrolled ? "scrolled" : ""}`}>
      <div className="container nav-inner">
        <Link href="/" aria-label="MKB RiderTrack home">
          <Brand />
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
              >
                {item.name}
              </Link>
            )
          })}
        </nav>
        <a
          className="button button-dark nav-access"
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Access Portal <ArrowUpRight size={16} />
        </a>
        <button
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="mobile-menu" id="mobile-navigation" ref={menu}>
          <nav aria-label="Mobile navigation">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={pathname === item.href ? "page" : undefined}
                className={pathname === item.href ? "active" : ""}
              >
                {item.name}
                <ArrowUpRight size={16} />
              </Link>
            ))}
            <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
              Access Portal
              <ArrowUpRight size={16} />
            </a>
          </nav>
        </div>
      )}
    </header>
  )
}
