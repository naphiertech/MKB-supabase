import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Eyebrow({
  children,
  light = false,
  className,
}: {
  children: ReactNode
  light?: boolean
  className?: string
}) {
  return (
    <div className={cn("eyebrow", light && "light", className)}>
      <span />
      {children}
    </div>
  )
}

interface SectionHeaderProps {
  label?: string
  title: ReactNode
  description?: ReactNode
  className?: string
  titleClassName?: string
  descriptionClassName?: string
  align?: "left" | "center"
}

export function SectionHeader({
  label,
  title,
  description,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("section-header", className)} data-reveal>
      <div>
        {label && <Eyebrow>{label}</Eyebrow>}
        <h2>{title}</h2>
      </div>
      {description && <p>{description}</p>}
    </div>
  )
}
