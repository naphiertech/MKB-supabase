import { SkeletonBlock, SkeletonPage, SkeletonTable } from '../common/SkeletonPrimitives';

export function PayrollAdjustmentsSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Rider Payroll Adjustments">
      {/* Top Actions & Toolbar */}
      <section className="ui-toolbar flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-4 w-4 rounded" />
            <SkeletonBlock className="h-5 w-56 rounded" />
          </div>
          <SkeletonBlock className="h-3 w-80 max-w-full rounded" />
        </div>
        <SkeletonBlock className="h-11 w-full sm:w-44 rounded-lg shrink-0" />
      </section>

      {/* Tabbed Card Workspace */}
      <section className="ui-card overflow-hidden">
        {/* Tab Headers */}
        <div className="flex overflow-x-auto border-b border-border px-4 pt-3 gap-6">
          <SkeletonBlock className="h-6 w-32 rounded-t" />
          <SkeletonBlock className="h-6 w-20 rounded-t" />
          <SkeletonBlock className="h-6 w-20 rounded-t" />
        </div>

        {/* Workspace Filter Bar */}
        <div className="grid gap-3 border-b border-border bg-panel-bg/40 p-4 sm:grid-cols-2">
          <SkeletonBlock className="h-9 w-full rounded-lg" />
          <SkeletonBlock className="h-9 w-full rounded-lg" />
        </div>

        {/* Adjustment Table */}
        <SkeletonTable
          rows={4}
          columns={7}
          columnWeights={[1.5, 1.2, 1, 1.4, 1, 1.8, 0.9]}
          minWidthClassName="data-table-wide"
          showToolbar={false}
          showFooter={false}
          mobileCards={false}
        />
      </section>
    </SkeletonPage>
  );
}
