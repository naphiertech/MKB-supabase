import { ScanFace, MapPin, LayoutDashboard, FileCheck2 } from "lucide-react"

export function CoreCapabilities() {
  return (
    <section className="capability-strip">
      <div className="container">
        <span className="strip-intro">
          THE WORK BEHIND
          <br />
          <strong>EVERY ROUTE.</strong>
        </span>
        <span>
          <ScanFace />
          Face verification
        </span>
        <span>
          <MapPin />
          Location validation
        </span>
        <span>
          <LayoutDashboard />
          Workforce monitoring
        </span>
        <span>
          <FileCheck2 />
          Payroll-ready records
        </span>
      </div>
    </section>
  )
}
