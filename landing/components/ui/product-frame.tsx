import type { ReactNode } from "react"
import { ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

export function ProductFrame({
  children,
  label = "INTERACTIVE PRODUCT PREVIEW",
  index = "MKB / 01",
  className = "",
}: {
  children: ReactNode
  label?: string
  index?: string
  className?: string
}) {
  return (
    <div className={cn("product-stage", className)}>
      <div className="stage-label">
        <span className="live-dot" />
        {label}
        <span className="stage-index">{index}</span>
      </div>
      {children}
      <div className="stage-foot">
        <ShieldCheck size={13} />
        <span>Purpose-built for MKB rider operations</span>
        <span>Illustrative demo</span>
      </div>
    </div>
  )
}
