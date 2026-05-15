import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-0">
      {/* Hero Skeleton */}
      <section className="relative flex min-h-[90vh] items-center overflow-hidden bg-primary/5">
        <div className="mx-auto w-full max-w-7xl px-4 py-24 lg:px-8">
          <div className="max-w-3xl">
            <Skeleton className="h-4 w-48 mb-4" />
            <Skeleton className="h-16 w-full mb-2 md:h-24" />
            <Skeleton className="h-16 w-3/4 mb-6 md:h-24" />
            <Skeleton className="h-6 w-full max-w-lg mb-2" />
            <Skeleton className="h-6 w-2/3 max-w-lg mb-10" />
            <div className="flex flex-col gap-4 sm:flex-row">
              <Skeleton className="h-12 w-40" />
              <Skeleton className="h-12 w-40" />
            </div>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-10 w-px" />
        </div>
      </section>

      {/* Story Preview Skeleton */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <Skeleton className="h-4 w-32 mb-4" />
              <Skeleton className="h-10 w-full mb-4" />
              <Skeleton className="h-6 w-full mb-2" />
              <Skeleton className="h-6 w-full mb-2" />
              <Skeleton className="h-6 w-2/3 mb-8" />
              <div className="grid grid-cols-2 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i}>
                    <Skeleton className="h-8 w-8 mb-2 rounded-full" />
                    <Skeleton className="h-4 w-20 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            </div>
            <Skeleton className="aspect-square w-full rounded-lg" />
          </div>
        </div>
      </section>

      {/* Core Capabilities Skeleton */}
      <section className="bg-secondary/50 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="text-center mb-14">
            <Skeleton className="h-4 w-32 mx-auto mb-4" />
            <Skeleton className="h-10 w-64 mx-auto mb-4" />
            <Skeleton className="h-6 w-96 mx-auto" />
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-4">
                <Skeleton className="aspect-[4/5] w-full rounded-lg" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Hub Locations Skeleton */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="text-center mb-14">
            <Skeleton className="h-4 w-32 mx-auto mb-4" />
            <Skeleton className="h-10 w-64 mx-auto mb-4" />
            <Skeleton className="h-6 w-96 mx-auto" />
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col gap-4">
                <Skeleton className="aspect-[16/10] w-full rounded-lg" />
                <div className="p-4 flex flex-col gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-full mt-2" />
                  <div className="flex items-center gap-2 mt-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
