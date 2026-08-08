export function ChartsGridSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-border rounded-xl p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg ar-shimmer shrink-0" />
              <div className="space-y-1 flex-1">
                <div className="w-24 h-3.5 rounded ar-shimmer" />
                <div className="w-12 h-3 rounded ar-shimmer" />
              </div>
            </div>
            <div className="w-full h-8 rounded ar-shimmer" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="bg-white border border-border rounded-xl p-4 space-y-4 shadow-sm">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <div className="w-36 h-4 rounded ar-shimmer" />
                <div className="w-48 h-3 rounded ar-shimmer" />
              </div>
              <div className="w-20 h-8 rounded ar-shimmer" />
            </div>
            <div className="h-[280px] rounded ar-shimmer opacity-40" />
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 space-y-4 shadow-sm">
          <div className="space-y-1">
            <div className="w-24 h-4 rounded ar-shimmer" />
            <div className="w-36 h-3 rounded ar-shimmer" />
          </div>
          <div className="h-[280px] rounded ar-shimmer opacity-40" />
        </div>
      </div>
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7">
      <ChartsGridSkeleton />
    </div>
  );
}
