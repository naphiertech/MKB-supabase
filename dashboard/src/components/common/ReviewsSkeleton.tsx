export function ReviewsSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1">
          <div className="w-48 h-5 rounded ar-shimmer" />
          <div className="w-64 h-3.5 rounded ar-shimmer" />
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-2 rounded-xl border border-border shadow-xs">
        <div className="flex gap-1">
          <div className="w-32 h-8 rounded ar-shimmer" />
          <div className="w-32 h-8 rounded ar-shimmer" />
        </div>
        <div className="w-24 h-4 rounded ar-shimmer" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-border p-5 rounded-2xl shadow-sm flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="w-28 h-4 rounded ar-shimmer" />
                  <div className="w-20 h-3 rounded ar-shimmer" />
                </div>
                <div className="w-16 h-3 rounded ar-shimmer" />
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, s) => (
                  <div key={s} className="w-3.5 h-3.5 rounded-full ar-shimmer shrink-0" />
                ))}
              </div>
              <div className="space-y-2">
                <div className="w-full h-3.5 rounded ar-shimmer" />
                <div className="w-5/6 h-3.5 rounded ar-shimmer" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <div className="w-16 h-7 rounded ar-shimmer" />
              <div className="w-20 h-7 rounded ar-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
