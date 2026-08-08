export function RiderProfileSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="w-28 h-4 rounded ar-shimmer" />

      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-accent/30 via-white to-white p-5 sm:p-6 flex items-center gap-4 shadow-sm overflow-hidden">
        <div className="w-20 h-20 rounded-2xl bg-white border border-border ar-shimmer shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="w-32 h-3 rounded ar-shimmer" />
          <div className="w-48 h-6 rounded ar-shimmer" />
          <div className="flex gap-2">
            <div className="w-12 h-4.5 rounded ar-shimmer" />
            <div className="w-20 h-3 rounded ar-shimmer" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white border border-border">
            <div className="w-9 h-9 rounded-lg bg-panel-bg ar-shimmer shrink-0" />
            <div className="space-y-1.5 flex-1 mt-0.5">
              <div className="w-16 h-2.5 rounded ar-shimmer" />
              <div className="w-32 h-4 rounded ar-shimmer" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-white p-5 space-y-3 shadow-sm">
        <div className="w-32 h-4.5 rounded ar-shimmer" />
        <div className="w-full h-3 rounded ar-shimmer" />
        <div className="w-3/4 h-3 rounded ar-shimmer" />
        <div className="flex gap-2 pt-1">
          <div className="w-16 h-5 rounded ar-shimmer" />
          <div className="w-36 h-3.5 rounded ar-shimmer" />
        </div>
      </div>
    </div>
  );
}
