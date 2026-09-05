import { SkeletonBlock, SkeletonPage, SkeletonStatCard } from '../common/SkeletonPrimitives';

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

export function RiderScheduleSkeleton() {
  return (
    <SkeletonPage className="mx-auto max-w-4xl space-y-5" label="Loading My Schedule">
      {/* 1. Header Card + Today Schedule Highlight */}
      <section className="ui-card overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <SkeletonBlock className="h-3 w-24 rounded" />
            <SkeletonBlock className="h-6 w-36 rounded" />
            <SkeletonBlock className="h-3.5 w-64 max-w-full rounded" />
          </div>
          <SkeletonBlock className="h-4 w-28 rounded" />
        </div>

        {/* Today Schedule Highlight Box */}
        <div className="mt-5 rounded-xl border border-primary/20 bg-accent/40 p-4 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <SkeletonBlock className="h-3.5 w-32 rounded" />
              <SkeletonBlock className="h-6 w-48 rounded" />
              <SkeletonBlock className="h-3 w-28 rounded" />
            </div>
            <SkeletonBlock className="h-6 w-20 rounded-full" />
          </div>
        </div>
      </section>

      {/* 2. Week Agenda / List */}
      <section className="ui-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
          <SkeletonBlock className="h-5 w-40 rounded" />
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-8 w-20 rounded-lg" />
            <SkeletonBlock className="h-8 w-20 rounded-lg" />
          </div>
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between py-3 gap-3">
              <div className="space-y-1">
                <SkeletonBlock className="h-4 w-28 rounded" />
                <SkeletonBlock className="h-3 w-20 rounded" />
              </div>
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-4 w-36 rounded" />
                <SkeletonBlock className="h-6 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Upcoming entries */}
      <section className="ui-card space-y-3 p-4 sm:p-5">
        <SkeletonBlock className="h-4 w-32 rounded border-b border-border pb-2" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="p-3 rounded-lg border border-border bg-panel-bg/40 flex justify-between items-center">
              <div className="space-y-1">
                <SkeletonBlock className="h-3.5 w-32 rounded" />
                <SkeletonBlock className="h-2.5 w-24 rounded" />
              </div>
              <SkeletonBlock className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </SkeletonPage>
  );
}

export function RiderLeaveAbsenceSkeleton() {
  return (
    <SkeletonPage className="mx-auto max-w-4xl space-y-5" label="Loading Leave & Absence">
      {/* 1. Summary Cards (3 items) */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SkeletonStatCard compact />
        <SkeletonStatCard compact />
        <SkeletonStatCard compact />
      </section>

      {/* 2. Main Section */}
      <section className="ui-card space-y-4 p-4 sm:p-5">
        {/* Header */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <SkeletonBlock className="h-3 w-28 rounded" />
            <SkeletonBlock className="h-6 w-40 rounded" />
            <SkeletonBlock className="h-3.5 w-72 sm:w-96 max-w-full rounded" />
          </div>
          <SkeletonBlock className="h-6 w-20 rounded-full" />
        </div>

        {/* Range Banner */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2">
          <SkeletonBlock className="h-3.5 w-44 rounded" />
          <div className="flex items-center gap-1.5">
            <SkeletonBlock className="h-7 w-16 rounded-md" />
            <SkeletonBlock className="h-7 w-16 rounded-md" />
          </div>
        </div>

        {/* Tabs Controls */}
        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          <SkeletonBlock className="h-8 w-28 rounded-lg" />
          <SkeletonBlock className="h-8 w-28 rounded-lg" />
          <SkeletonBlock className="h-8 w-28 rounded-lg" />
          <SkeletonBlock className="h-8 w-20 rounded-lg" />
        </div>

        {/* Requests List */}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="p-4 rounded-xl border border-border bg-white space-y-2 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <SkeletonBlock className="h-5 w-24 rounded-full" />
                  <SkeletonBlock className="h-3.5 w-32 rounded" />
                </div>
                <SkeletonBlock className="h-5 w-16 rounded-full" />
              </div>
              <SkeletonBlock className="h-3 w-full rounded" />
              <div className="flex justify-end pt-1">
                <SkeletonBlock className="h-7 w-20 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </SkeletonPage>
  );
}
