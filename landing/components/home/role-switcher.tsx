"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowUpRight,
  Check,
  ShieldCheck,
  Users,
  Wallet,
  Bike,
  FileText,
  CalendarCheck,
} from "lucide-react"
import gsap from "gsap"
import { Eyebrow } from "@/components/section-header"
import { getDashboardUrl } from "@/lib/data"

export const roleData = [
  {
    name: "Admin",
    icon: ShieldCheck,
    title: "The whole operation. A clear perspective.",
    description:
      "Manage system access, monitor rider activity, and review payroll submissions. The operational overview your responsibilities call for.",
    actions: [
      "Manage users and operational areas",
      "Monitor attendance across the workforce",
      "Review and approve submitted payroll",
    ],
    preview: ["Workforce overview", "Access & permissions", "Payroll approvals"],
    label: "OPERATIONS WORKSPACE",
  },
  {
    name: "HR",
    icon: Users,
    title: "The people behind every attendance record.",
    description:
      "Review attendance, understand verification states, and keep workforce records ready for the next step.",
    actions: [
      "Review rider attendance and exceptions",
      "Access workforce attendance records",
      "Review and approve submitted payroll",
    ],
    preview: ["Attendance records", "Verification review", "Payroll approvals"],
    label: "HR WORKSPACE",
  },
  {
    name: "Payroll Officer",
    icon: Wallet,
    title: "From checked records to prepared payroll.",
    description:
      "Work from attendance information, prepare the payroll period, and submit records for Admin or HR review.",
    actions: [
      "Review attendance for each payroll period",
      "Prepare and submit payroll records",
      "Track the review and approval status",
    ],
    preview: ["Attendance summary", "Payroll preparation", "Submission status"],
    label: "PAYROLL WORKSPACE",
  },
  {
    name: "Rider",
    icon: Bike,
    title: "Your workday, in one place.",
    description:
      "Record verified Time In and Time Out, check your own attendance history, and view approved payslip information.",
    actions: [
      "Record face-verified attendance",
      "View your personal attendance history",
      "Access approved payslip information",
    ],
    preview: ["My attendance", "Time In / Time Out", "My payslips"],
    label: "RIDER WORKSPACE",
  },
]

export function RoleSwitcher() {
  const [active, setActive] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const role = roleData[active]
  const dashboardUrl = getDashboardUrl()

  useEffect(() => {
    if (typeof window === "undefined") return
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced) return

    const tween = gsap.fromTo(panel.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3 })
    return () => {
      tween.kill()
    }
  }, [active])

  return (
    <div className="role-switcher" data-reveal>
      <div className="role-tabs" role="tablist" aria-label="Explore by role">
        {roleData.map((r, i) => (
          <button
            role="tab"
            id={`role-tab-${i}`}
            aria-controls="role-panel"
            aria-selected={active === i}
            tabIndex={active === i ? 0 : -1}
            key={r.name}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault()
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                    ? 3
                    : (i + (e.key === "ArrowRight" ? 1 : 3)) % 4
                setActive(next)
                document.getElementById(`role-tab-${next}`)?.focus()
              }
            }}
          >
            <r.icon size={18} />
            {r.name}
            <ArrowUpRight size={16} />
          </button>
        ))}
      </div>

      <div
        className="role-content"
        id="role-panel"
        role="tabpanel"
        aria-labelledby={`role-tab-${active}`}
        ref={panel}
      >
        <div className="role-copy">
          <Eyebrow>{role.name.toUpperCase()} EXPERIENCE</Eyebrow>
          <h3>{role.title}</h3>
          <p>{role.description}</p>
          <ul>
            {role.actions.map((a) => (
              <li key={a}>
                <Check size={16} />
                {a}
              </li>
            ))}
          </ul>
          <a
            href={dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
          >
            Find your workspace
            <ArrowUpRight size={17} />
          </a>
        </div>

        <div className="role-preview">
          <div className="role-preview-top">
            <span className="role-app-icon">
              <role.icon size={22} />
            </span>
            <span>
              {role.label}
              <small>MKB RiderTrack / Preview</small>
            </span>
            <span className="live-dot" />
          </div>
          <h4>
            {active === 3
              ? "Good morning, Miguel."
              : `Your ${
                  active === 0 ? "operations" : active === 1 ? "workforce" : "payroll"
                }, at a glance.`}
          </h4>
          <p>The right tools for your responsibilities.</p>
          {role.preview.map((item, i) => (
            <div className="role-preview-row" key={item}>
              {i === 0 ? (
                <Users size={17} />
              ) : i === 1 ? (
                <CalendarCheck size={17} />
              ) : (
                <FileText size={17} />
              )}
              <span>{item}</span>
              {i === 2 ? <span className="role-ready">Ready</span> : <ArrowUpRight size={15} />}
            </div>
          ))}
          <div className="role-preview-note">
            <ShieldCheck size={13} />
            Role-based access. Focused by design.
          </div>
        </div>
      </div>
    </div>
  )
}
