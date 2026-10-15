import type { Metadata } from "next"
import Link from "next/link"
import {
  ScanFace,
  MapPin,
  Users,
  FileCheck2,
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  ListChecks,
  Focus,
} from "lucide-react"
import { SectionHeader, Eyebrow } from "@/components/section-header"
import { TimelineSection } from "@/components/about/timeline-section"
import { RoleSwitcher } from "@/components/home/role-switcher"
import { CtaSection } from "@/components/home/cta-section"
import { siteConfig, getDashboardUrl } from "@/lib/data"

export const metadata: Metadata = {
  title: "About",
  description:
    "A workforce attendance and monitoring system built for MKB Corporation’s third-party logistics courier riders—and the teams supporting them.",
}

export default function AboutPage() {
  const dashboardUrl = getDashboardUrl()

  return (
    <>
      <section className="page-hero container">
        <div data-enter>
          <Eyebrow>ABOUT MKB RIDERTRACK</Eyebrow>
        </div>
        <div className="page-hero-grid">
          <h1 data-enter>
            Built around the work
            <br />
            <span>behind the routes.</span>
          </h1>
          <div data-enter>
            <p className="lead">
              A workforce attendance and monitoring system built for MKB Corporation’s third-party
              logistics courier riders—and the teams supporting them.
            </p>
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              Access Portal <ArrowUpRight size={18} />
            </a>
          </div>
        </div>
      </section>

      <section className="about-statement container" data-enter>
        <div className="statement-label">
          <span className="brand-symbol">
            <i />
            <i />
            <i />
          </span>
          <span>
            THE WORKFORCE,
            <br />
            CONNECTED.
          </span>
        </div>
        <div>
          <h2>
            The work is connected.
            <br />
            The records should be, too.
          </h2>
          <p>
            When rider verification, attendance, location information, and payroll preparation live
            separately, even a straightforward workday becomes difficult to piece together.
          </p>
          <p>
            RiderTrack brings these workflows into one centralized system. It gives teams a clearer
            understanding of who recorded attendance, where it happened, and how that record moves
            forward.
          </p>
        </div>
        <span className="statement-corner" aria-hidden="true">
          ↗
        </span>
      </section>

      <section className="container section-space">
        <SectionHeader
          label="WHAT RIDERTRACK IS"
          title={
            <>
              Operational clarity.
              <br />
              From check-in to payslip.
            </>
          }
          description="Not a parcel tracking tool. Not a delivery dispatch system. A focused platform for the people and records behind daily rider operations."
        />
        <div className="editorial-process">
          {[
            {
              icon: ScanFace,
              title: "A verified start",
              text: "Riders use face-based verification when recording Time In and Time Out.",
            },
            {
              icon: MapPin,
              title: "A location with context",
              text: "Geofence checks validate attendance against an approved operational area.",
            },
            {
              icon: Users,
              title: "A shared operational view",
              text: "Admin and HR review workforce attendance, activity, and records.",
            },
            {
              icon: FileCheck2,
              title: "A clear path to payroll",
              text: "Payroll Officers prepare records for review, approval, and rider payslip access.",
            },
          ].map(({ icon: Icon, title, text }, i) => (
            <div className="editorial-process-row" data-reveal key={title}>
              <span className="process-number">0{i + 1}</span>
              <Icon size={26} strokeWidth={1.4} />
              <h3>{title}</h3>
              <p>{text}</p>
              <ArrowRight size={19} />
            </div>
          ))}
        </div>
      </section>

      <section className="principles-section">
        <div className="container">
          <SectionHeader
            label="SYSTEM PRINCIPLES"
            title={<>Clarity is a working principle.</>}
          />
          <div className="principles-grid">
            {[
              {
                icon: ShieldCheck,
                title: "Verification before records.",
                text: "Connect identity and attendance location to the check-in—not as an afterthought.",
              },
              {
                icon: Focus,
                title: "Access with a purpose.",
                text: "Each role has a focused workspace, aligned with its operational responsibilities.",
              },
              {
                icon: ListChecks,
                title: "A workflow you can follow.",
                text: "Keep preparation, submission, review, and approval as distinct, understandable steps.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title} data-reveal>
                <Icon size={25} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <TimelineSection />

      <section className="container section-space">
        <SectionHeader
          label="WHO USES RIDERTRACK"
          title={
            <>
              Different responsibilities.
              <br />
              One connected workforce.
            </>
          }
          description="Four supported roles. A shared system with the right perspective for each person."
        />
        <RoleSwitcher />
      </section>

      <div className="container about-bottom" data-reveal>
        <Eyebrow>SEE IT IN PRACTICE</Eyebrow>
        <Link href="/modules" className="text-link">
          Explore core capabilities
          <ArrowRight size={18} />
        </Link>
      </div>

      <CtaSection />
    </>
  )
}
