import { cn } from "@/lib/utils"
import { AnimateIn } from "@/components/animations/animate-in"

interface SectionHeaderProps {
  label?: string
  title: string
  description?: string
  align?: "left" | "center"
  className?: string
}

export function SectionHeader({
  label,
  title,
  description,
  align = "center",
  className,
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
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-accent">
          {label}
        </p>
      )}
      <h2 className="text-balance font-serif text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
        {title}
      </h2>
      {description && (
        <p className="mt-6 text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
          {description}
        </p>
      )}
    </AnimateIn>
  )
}
