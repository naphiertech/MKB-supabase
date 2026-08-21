import Link from "next/link"
import { siteConfig } from "@/lib/data"
import { cn } from "@/lib/utils"

interface BrandLogoProps {
  className?: string
  badgeClassName?: string
  textClassName?: string
  showVersion?: boolean
  href?: string
}

export function BrandLogo({
  className,
  badgeClassName,
  textClassName,
  showVersion = false,
  href = "/",
}: BrandLogoProps) {
  const content = (
    <div className={cn("inline-flex items-center gap-2.5 group select-none", className)}>
      {/* Amber Monogram Badge */}
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground font-mono font-bold text-xs tracking-tight shadow-xs transition-transform group-hover:scale-105",
          badgeClassName
        )}
        aria-hidden="true"
      >
        M
      </div>

      {/* Neutral Wordmark */}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "font-sans text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-foreground",
            textClassName
          )}
        >
          {siteConfig.name}
        </span>
        {showVersion && (
          <span className="hidden sm:inline-block font-mono text-[10px] uppercase tracking-wider text-accent border border-accent/30 bg-accent/10 px-1.5 py-0.5 rounded">
            v2.5
          </span>
        )}
      </div>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}
