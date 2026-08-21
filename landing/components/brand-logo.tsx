import Link from "next/link"
import Image from "next/image"
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
      {/* Official Dashboard Favicon / Emblem */}
      <div className={cn("relative size-7 shrink-0 transition-transform group-hover:scale-105", badgeClassName)}>
        <Image
          src="/favicon.svg"
          alt="MKBRiderTrack Emblem"
          width={28}
          height={28}
          className="size-7 object-contain drop-shadow-xs"
          priority
        />
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
