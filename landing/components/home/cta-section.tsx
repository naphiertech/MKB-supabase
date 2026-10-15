import { ArrowUpRight } from "lucide-react"
import { Eyebrow } from "@/components/section-header"
import { getDashboardUrl } from "@/lib/data"

export function CtaSection() {
  const dashboardUrl = getDashboardUrl()

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
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="button button-orange"
        >
          Access Portal <ArrowUpRight size={19} />
        </a>
        <span className="cta-watermark" aria-hidden="true">
          ↗
        </span>
      </div>
    </section>
  )
}
