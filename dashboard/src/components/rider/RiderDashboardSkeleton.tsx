export function RiderDashboardSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 max-w-6xl mx-auto space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/30 via-white to-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2 flex-1">
            <div className="w-24 h-3 rounded ar-shimmer" />
            <div className="w-48 h-8 rounded ar-shimmer animate-pulse" />
            <div className="w-36 h-3.5 rounded ar-shimmer" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="w-28 h-8 rounded-full ar-shimmer" />
            <div className="w-24 h-8 rounded-full ar-shimmer" />
            <div className="w-24 h-8 rounded-full ar-shimmer" />
          </div>
        </div>
      </div>

      <div className="bg-white border border-border rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center space-y-4 shadow-sm">
        <div className="w-36 h-3.5 rounded ar-shimmer mx-auto" />
        <div className="w-32 h-32 rounded-full ar-shimmer" />
        <div className="w-48 h-10 rounded-lg ar-shimmer" />
      </div>

      <div className="bg-white border border-border rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <div className="w-24 h-4 rounded ar-shimmer" />
            <div className="w-36 h-3 rounded ar-shimmer" />
          </div>
          <div className="w-28 h-3 rounded ar-shimmer" />
        </div>
        <div className="h-[320px] rounded-xl ar-shimmer opacity-40" />
        <div className="w-full h-8 rounded-lg ar-shimmer" />
      </div>

      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <div className="w-32 h-4 rounded ar-shimmer" />
            <div className="w-48 h-3 rounded ar-shimmer" />
          </div>
          <div className="w-16 h-3 rounded ar-shimmer" />
        </div>
        <div className="pl-6 space-y-4 relative">
          <div className="absolute left-[10px] top-1 bottom-1 w-px bg-border" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-3 relative">
              <div className="absolute -left-6 mt-1 w-5 h-5 rounded-full border border-border bg-white ar-shimmer" />
              <div className="w-14 h-3.5 rounded ar-shimmer shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="w-28 h-3.5 rounded ar-shimmer" />
                <div className="w-40 h-3 rounded ar-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="relative overflow-hidden rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-border" />
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <div className="w-24 h-3 rounded ar-shimmer" />
                <div className="w-16 h-8 rounded ar-shimmer mt-1" />
              </div>
              <div className="w-9 h-9 rounded-lg ar-shimmer shrink-0" />
            </div>
            <div className="w-28 h-3 rounded ar-shimmer mt-2" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-white p-5 space-y-4 shadow-sm">
        <div className="flex justify-between items-center pb-3 border-b border-border">
          <div className="space-y-1">
            <div className="w-40 h-4.5 rounded ar-shimmer" />
            <div className="w-48 h-3 rounded ar-shimmer" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-border bg-panel-bg/50 flex flex-col justify-between space-y-3 h-44">
            <div className="space-y-2">
              <div className="w-16 h-4 rounded ar-shimmer" />
              <div className="w-28 h-4.5 rounded ar-shimmer" />
              <div className="w-32 h-6 rounded ar-shimmer" />
            </div>
            <div className="w-24 h-4.5 rounded ar-shimmer" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="p-3 rounded-lg border border-border bg-white flex items-center justify-between">
                <div className="space-y-1.5 flex-1">
                  <div className="w-32 h-3.5 rounded ar-shimmer" />
                  <div className="w-24 h-2.5 rounded ar-shimmer" />
                </div>
                <div className="w-16 h-7 rounded-md bg-primary/10 ar-shimmer shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
