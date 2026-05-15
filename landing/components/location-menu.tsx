"use client"

import { useState } from "react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { MenuItem } from "@/lib/data"

interface LocationMenuProps {
  menu: MenuItem[]
  categories: string[]
}

export function LocationMenu({ menu, categories }: LocationMenuProps) {
  const [activeCategory, setActiveCategory] = useState(categories[0])

  const filteredItems = menu.filter(
    (item) => item.category === activeCategory
  )

  return (
    <div className="mt-12">
      {/* Category Tabs */}
      <div className="flex flex-wrap justify-center gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-medium transition-all",
              activeCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Menu Items */}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {filteredItems.map((item) => (
          <div
            key={item.name}
            className="group flex gap-4 rounded-lg border border-border bg-card p-5 transition-shadow hover:shadow-md"
          >
            {item.image && (
              <div className="relative size-20 shrink-0 overflow-hidden rounded-md md:size-24">
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  className="object-cover"
                  sizes="96px"
                />
              </div>
            )}
            <div className="flex flex-1 flex-col">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-serif text-lg font-bold text-card-foreground">
                  {item.name}
                </h3>
                <span className="shrink-0 text-lg font-semibold text-accent">
                  {item.price}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
              {item.tags && item.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-xs"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
