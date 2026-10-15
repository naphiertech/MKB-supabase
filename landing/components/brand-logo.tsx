import Link from "next/link"
import { cn } from "@/lib/utils"

interface BrandProps {
  small?: boolean
  className?: string
  href?: string
}

export function Brand({ small = false, className }: { small?: boolean; className?: string }) {
  return (
    <span className={cn("brand", small && "brand-small", className)}>
      <span className="brand-symbol" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        <strong>MKB</strong>
        <span className="brand-divider" />
        RiderTrack
      </span>
    </span>
  )
}

export function BrandLogo({
  small = false,
  className,
  href = "/",
}: BrandProps) {
  if (href) {
    return (
      <Link href={href} aria-label="MKB RiderTrack home">
        <Brand small={small} className={className} />
      </Link>
    )
  }

  return <Brand small={small} className={className} />
}
