import Link from "next/link"
import { Brand } from "@/components/brand-logo"
import { navigation } from "@/lib/data"

export function SiteFooter() {
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
            {navigation.filter((item) => item.name !== "Contact").map((item) => (
              <Link key={item.name} href={item.href}>
                {item.name}
              </Link>
            ))}
            <Link href="/contact">
              Contact
            </Link>
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
