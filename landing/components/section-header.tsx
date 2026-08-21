import { cn } from "@/lib/utils"
import { AnimateIn } from "@/components/animations/animate-in"

interface SectionHeaderProps {
  label?: string
  title: string
  description?: string
  align?: "left" | "center"
  className?: string
  titleClassName?: string
  descriptionClassName?: string
}

export function SectionHeader({
  label,
  title,
  description,
  align = "center",
  className,
  titleClassName,
  descriptionClassName,
}: SectionHeaderProps) {
  return (
    <AnimateIn
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className
      )}
    >
      {label && (
        <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          {label.startsWith("//") || label.startsWith("[") || label.includes("//") ? label : `// ${label}`}
        </p>
      )}
      <h2
        className={cn(
          "text-balance font-sans text-2xl font-bold tracking-tight text-foreground md:text-3xl lg:text-4xl",
          titleClassName
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            "mt-4 text-pretty text-sm leading-relaxed text-muted-foreground md:text-base",
            descriptionClassName
          )}
        >
          {description}
        </p>
      )}
    </AnimateIn>
  )
}
