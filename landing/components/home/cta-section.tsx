import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Eyebrow } from "@/components/section-header"

export function CtaSection() {
  return (
    <section className="cta-section" data-reveal>
      <div className="container cta-inner">
        <div>
          <Eyebrow light>THE WORKFORCE, CONNECTED</Eyebrow>
          <h2>
            A clearer way to manage
            <br />
            rider attendance.
          </h2>
          <p>
            Bring verification, attendance, location validation, monitoring,
            <br className="desktop-only" /> and payroll workflows into one operational system.
          </p>
        </div>
        <Link
          href="/contact"
          className="button button-orange"
        >
          Contact <ArrowUpRight size={19} />
        </Link>
        <span className="cta-watermark" aria-hidden="true">
          ↗
        </span>
      </div>
    </section>
  )
}
