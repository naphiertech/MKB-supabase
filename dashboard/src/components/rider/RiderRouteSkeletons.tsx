import { SkeletonBlock, SkeletonPage } from '../common/SkeletonPrimitives';

export function RiderAttendanceSkeleton() {
  return (
    <SkeletonPage className="mx-auto max-w-4xl space-y-6" label="Loading Rider Attendance">
      <div className="flex items-center justify-between"><SkeletonBlock className="h-4 w-32" /><SkeletonBlock className="h-3 w-28" /></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3.5 rounded-2xl border border-border bg-white p-4 shadow-sm">
            <SkeletonBlock className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="space-y-2"><SkeletonBlock className="h-2.5 w-24" /><SkeletonBlock className="h-5 w-16" /></div>
          </div>
        ))}
      </div>
      <section className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2"><SkeletonBlock className="h-4 w-40" /><SkeletonBlock className="h-3 w-64 max-w-full" /></div>
          <div className="flex flex-wrap gap-2">{Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-8 w-28 rounded-lg" />)}</div>
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="grid gap-3 p-4 sm:grid-cols-[1fr_repeat(3,0.8fr)]">
              <div className="space-y-1.5"><SkeletonBlock className="h-3.5 w-28" /><SkeletonBlock className="h-2.5 w-20" /></div>
              {Array.from({ length: 3 }).map((__, cell) => <SkeletonBlock key={cell} className="h-3 w-20 max-w-full" />)}
            </div>
          ))}
        </div>
      </section>
    </SkeletonPage>
  );
}

export function RiderMonitoringSkeleton() {
  return (
    <SkeletonPage className="mx-auto max-w-5xl space-y-4" label="Loading Rider Live Map">
      <SkeletonBlock className="h-4 w-32" />
      <div className="flex items-center gap-2"><SkeletonBlock className="h-4 w-4" /><SkeletonBlock className="h-5 w-28" /></div>
      <SkeletonBlock className="h-[clamp(400px,105vw,460px)] w-full rounded-xl opacity-60 sm:h-[500px]" />
      <div className="grid gap-3 rounded-xl border border-border bg-white p-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-2 rounded-lg bg-panel-bg p-3"><SkeletonBlock className="h-2.5 w-20" /><SkeletonBlock className="h-4 w-28 max-w-full" /></div>
        ))}
      </div>
      <section className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div className="space-y-2"><SkeletonBlock className="h-3.5 w-28" /><SkeletonBlock className="h-2.5 w-48" /></div><SkeletonBlock className="h-6 w-24" /></div>
        <div className="p-4"><SkeletonBlock className="h-[280px] w-full rounded-xl opacity-60 sm:h-[340px]" /></div>
      </section>
    </SkeletonPage>
  );
}
