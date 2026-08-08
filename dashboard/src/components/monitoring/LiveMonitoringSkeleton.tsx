export function LiveMonitoringSkeleton() {
  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden">
      <aside className="w-80 shrink-0 bg-white border-r border-border flex flex-col hidden sm:flex">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="w-20 h-4 rounded ar-shimmer" />
          <div className="w-6 h-6 rounded ar-shimmer" />
        </div>
        <div className="p-3 space-y-4 border-b border-border">
          <div className="space-y-1">
            <div className="w-10 h-3 rounded ar-shimmer" />
            <div className="w-full h-8 rounded bg-panel-bg border border-border ar-shimmer opacity-50" />
          </div>
          <div className="space-y-1">
            <div className="w-12 h-3 rounded ar-shimmer" />
            <div className="w-full h-8 rounded bg-panel-bg border border-border ar-shimmer opacity-50" />
          </div>
        </div>
        <div className="p-3 flex-1 overflow-hidden space-y-3">
          <div className="w-24 h-4 rounded ar-shimmer border-b border-border pb-2" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-2 p-2 rounded bg-panel-bg border border-transparent">
              <div className="w-7 h-7 rounded-full ar-shimmer shrink-0" />
              <div className="space-y-1.5 flex-1 mt-0.5">
                <div className="w-24 h-3 rounded ar-shimmer" />
                <div className="w-16 h-2.5 rounded ar-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </aside>
      <div className="flex-1 ar-shimmer opacity-40 h-full min-h-[400px]" />
    </div>
  );
}
