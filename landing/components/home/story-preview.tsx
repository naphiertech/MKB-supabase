"use client"

import Link from "next/link"
import {
  ScanFace,
  MapPin,
  LayoutDashboard,
  FileCheck2,
  ArrowRight,
  Route,
} from "lucide-react"
import { Eyebrow, SectionHeader } from "@/components/section-header"

const steps = [
  {
    number: "01",
    icon: ScanFace,
    title: "Verify the rider.",
    text: "Start with the right person. Face-based verification establishes who is recording attendance.",
    to: "/modules",
    link: "Identity & attendance",
  },
  {
    number: "02",
    icon: MapPin,
    title: "Validate the location.",
    text: "Check that attendance is recorded within the approved operational area. Not just anywhere.",
    to: "/locations",
    link: "Location validation",
  },
  {
    number: "03",
    icon: LayoutDashboard,
    title: "See the workforce.",
    text: "Give Admin and HR teams a shared view of rider attendance, activity, and exceptions.",
    to: "/about",
    link: "Workforce monitoring",
  },
  {
    number: "04",
    icon: FileCheck2,
    title: "Prepare payroll.",
    text: "Bring verified attendance into a clear preparation, review, and approval workflow.",
    to: "/modules",
    link: "Payroll workflow",
  },
]

export function StoryPreview() {
  return (
    <>
      <section className="workflow-section container">
        <SectionHeader
          label="CONNECTED FROM THE FIRST CHECK-IN"
          title={
            <>
              One system.
              <br />
              Every part of the workday.
            </>
          }
          description="From the moment a rider checks in to the records your team relies on. Each step connected. Nothing left in between."
        />
        <div className="workflow-grid">
          {steps.map(({ number, icon: Icon, title, text, to, link }) => (
            <article className="workflow-step" data-reveal key={number}>
              <div className="step-top">
                <span>{number}</span>
                <Icon size={25} strokeWidth={1.5} />
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
              <Link href={to} className="text-link">
                {link}
                <ArrowRight size={18} />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="purpose-band">
        <div className="container purpose-inner">
          <div data-reveal>
            <Eyebrow>BUILT FOR ATTENDANCE. NOT PARCELS.</Eyebrow>
            <h2>
              A clearer view of people.
              <br />
              Not packages.
            </h2>
          </div>
          <div data-reveal>
            <p>
              Behind every delivery is a rider—and a team making sure the workday runs as it
              should. RiderTrack connects those people with records they can rely on.
            </p>
            <Link href="/about" className="text-link">
              Meet MKB RiderTrack
              <ArrowRight size={18} />
            </Link>
          </div>
          <Route className="purpose-icon" size={150} strokeWidth={0.65} aria-hidden="true" />
        </div>
      </section>
    </>
  )
}
