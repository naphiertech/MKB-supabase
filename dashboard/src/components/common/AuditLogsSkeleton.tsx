import { SkeletonBlock, SkeletonPage, SkeletonStatCard, SkeletonTable } from './SkeletonPrimitives';

export function AuditLogsSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Audit Logs">
      {/* 4 Audit Metric Stat Cards */}
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4 xl:gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Single Control Panel (Search, Filters, Actions) */}
      <div className="ui-toolbar space-y-4 p-4" aria-label="Audit logs filter placeholder">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <SkeletonBlock className="h-9 w-full max-w-lg rounded-lg" />
          <div className="flex gap-2 self-end lg:self-auto">
            <SkeletonBlock className="h-9 w-24 rounded-lg" />
            <SkeletonBlock className="h-9 w-28 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 lg:flex lg:flex-wrap">
          <SkeletonBlock className="h-9 w-32 rounded-lg" />
          <SkeletonBlock className="h-9 w-48 rounded-lg" />
          <SkeletonBlock className="h-9 w-36 rounded-lg" />
        </div>
      </div>

      {/* Main Table Grid: 6 Columns */}
      <div className="ui-card overflow-hidden">
        <SkeletonTable
          rows={4}
          columns={6}
          columnWeights={[1.2, 1.6, 0.8, 1.3, 1.8, 1.2]}
          className="rounded-none border-0 shadow-none"
          minWidthClassName="min-w-[64rem]"
          showToolbar={false}
          showFooter={false}
          mobileCards
          mobileBreakpoint="lg"
        />
      </div>
    </SkeletonPage>
  );
}
