import { SkeletonBlock, SkeletonPage } from '../common/SkeletonPrimitives';

export function RiderProfileSkeleton() {
  return (
    <SkeletonPage className="mx-auto max-w-5xl space-y-6" label="Loading Rider Profile">
      <SkeletonBlock className="h-4 w-32" />

      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-accent/30 via-white to-white p-5 sm:p-6 flex items-center gap-4 shadow-sm overflow-hidden">
        <SkeletonBlock className="h-20 w-20 shrink-0 rounded-2xl border border-border bg-white" />
        <div className="space-y-2 flex-1">
          <SkeletonBlock className="h-3 w-32" />
          <SkeletonBlock className="h-6 w-48 max-w-full" />
          <div className="flex gap-2">
            <SkeletonBlock className="h-4 w-12" />
            <SkeletonBlock className="h-3 w-20" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <section className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm">
            <SkeletonBlock className="h-4 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <SkeletonBlock className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="mt-0.5 min-w-0 flex-1 space-y-1.5"><SkeletonBlock className="h-2.5 w-20" /><SkeletonBlock className="h-4 w-40 max-w-full" /></div>
              </div>
            ))}
          </section>
          <section className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm">
            <SkeletonBlock className="h-4 w-36" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-border p-3"><SkeletonBlock className="h-2.5 w-20" /><SkeletonBlock className="h-4 w-32 max-w-full" /></div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <section className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-32 w-full rounded-xl opacity-60" />
            <SkeletonBlock className="h-10 w-full rounded-lg" />
          </section>
          <section className="space-y-3 rounded-2xl border border-border bg-white p-5 shadow-sm">
            <SkeletonBlock className="h-4 w-36" />
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-3 w-3/4" />
            <SkeletonBlock className="h-8 w-36 rounded-lg" />
          </section>
        </div>
      </div>
    </SkeletonPage>
  );
}
