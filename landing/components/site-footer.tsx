import Link from "next/link"
import { Brand } from "@/components/brand-logo"
import { getDashboardUrl, navigation } from "@/lib/data"

export function SiteFooter() {
  const dashboardUrl = getDashboardUrl()

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div>
            <Link href="/" aria-label="MKB RiderTrack home">
              <Brand />
            </Link>
            <p>Attendance. Monitoring. Payroll.</p>
          </div>
          <nav aria-label="Footer navigation">
            {navigation.map((item) => (
              <Link key={item.name} href={item.href}>
                {item.name}
              </Link>
            ))}
            <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
              Access Portal
            </a>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} MKB Corporation. All rights reserved.</span>
          <span>
            Built for the work behind every route.
            <span className="tiny-mark">&#x2197;</span>
          </span>
        </div>
      </div>
    </footer>
  )
}
