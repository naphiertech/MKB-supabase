import { SkeletonBlock, SkeletonMap, SkeletonPage, SkeletonStatCard } from '../common/SkeletonPrimitives';

export function GeofenceSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Geofence and Zones">
      {/* 1. Summary Cards (4 tiles) */}
      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* 2. Map + Zone List Panel (3:2 ratio on desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: Map Preview */}
        <div className="lg:col-span-3">
          <SkeletonMap className="h-[420px] lg:h-[500px]" />
        </div>

        {/* Right: Zone List Panel */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-border rounded-xl shadow-xs flex flex-col h-[420px] lg:h-[500px] overflow-hidden">
            {/* Panel Header */}
            <div className="px-4 py-3 border-b border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <SkeletonBlock className="w-24 h-4 rounded" />
                  <SkeletonBlock className="w-28 h-3 rounded" />
                </div>
                <SkeletonBlock className="w-20 h-8 rounded-lg" />
              </div>
              {/* Search Bar */}
              <SkeletonBlock className="w-full h-9 rounded-lg" />
            </div>

            {/* Zone List Items */}
            <div className="p-2 space-y-2 overflow-hidden flex-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-3 rounded-lg border border-border bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <SkeletonBlock className="w-2.5 h-2.5 rounded-full shrink-0" />
                      <SkeletonBlock className="w-28 h-4 rounded" />
                      <SkeletonBlock className="w-14 h-4 rounded-full" />
                    </div>
                    <SkeletonBlock className="w-6 h-6 rounded-md" />
                  </div>
                  <div className="flex items-center gap-2 pl-5">
                    <SkeletonBlock className="w-20 h-3 rounded" />
                    <SkeletonBlock className="w-16 h-3 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Assigned Riders Grouped by Zone */}
      <div className="bg-white border border-border rounded-xl shadow-xs overflow-hidden">
        {/* Section Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="space-y-1">
            <SkeletonBlock className="w-44 h-4 rounded" />
            <SkeletonBlock className="w-64 h-3 rounded" />
          </div>
        </div>

        {/* Grouped Zone Accordions */}
        <div className="divide-y divide-border">
          {/* First group (expanded appearance) */}
          <div>
            <div className="w-full flex items-center justify-between px-4 py-3.5 bg-panel-bg/50 border-l-4 border-primary/40">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="w-2.5 h-2.5 rounded-full shrink-0" />
                <SkeletonBlock className="w-32 h-4 rounded" />
                <SkeletonBlock className="w-16 h-5 rounded-full" />
              </div>
              <SkeletonBlock className="w-4 h-4 rounded" />
            </div>
            {/* Nested rider table/card rows */}
            <div className="p-3 space-y-2 bg-white">
              {Array.from({ length: 2 }).map((_, rIdx) => (
                <div key={rIdx} className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-panel-bg/30">
                  <div className="flex items-center gap-3">
                    <SkeletonBlock className="w-8 h-8 rounded-full shrink-0" />
                    <div className="space-y-1">
                      <SkeletonBlock className="w-28 h-3.5 rounded" />
                      <SkeletonBlock className="w-20 h-2.5 rounded" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <SkeletonBlock className="w-16 h-5 rounded-full" />
                    <SkeletonBlock className="w-20 h-4 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Collapsed groups */}
          {Array.from({ length: 3 }).map((_, gIdx) => (
            <div key={gIdx} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-panel-bg/30 border-l-4 border-border">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="w-2.5 h-2.5 rounded-full shrink-0" />
                <SkeletonBlock className="w-32 h-4 rounded" />
                <SkeletonBlock className="w-16 h-5 rounded-full" />
              </div>
              <SkeletonBlock className="w-4 h-4 rounded" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
