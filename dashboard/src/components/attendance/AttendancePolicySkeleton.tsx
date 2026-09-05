import { SkeletonBlock, SkeletonPage, SkeletonTable } from '../common/SkeletonPrimitives';

export function AttendancePolicySkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Attendance Policy">
      {/* Policy Toolbar */}
      <div className="ui-toolbar flex flex-col gap-4 p-4 md:p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-4 w-4 rounded" />
            <SkeletonBlock className="h-4 w-52 rounded" />
          </div>
          <SkeletonBlock className="h-3 w-80 max-w-full rounded" />
        </div>
        <div className="grid w-full grid-cols-1 gap-2 min-[480px]:grid-cols-2 sm:flex sm:w-auto sm:items-center shrink-0">
          <SkeletonBlock className="h-10 w-full sm:w-28 rounded-lg" />
          <SkeletonBlock className="h-10 w-full sm:w-44 rounded-lg" />
        </div>
      </div>

      {/* Historical Protection Notice */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 shadow-xs">
        <SkeletonBlock className="mt-0.5 h-4 w-4 shrink-0 rounded bg-amber-300/60" />
        <SkeletonBlock className="h-3.5 w-full max-w-xl rounded bg-amber-200/50" />
      </div>

      {/* Current Policy Card */}
      <div className="ui-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="space-y-1">
            <SkeletonBlock className="h-4 w-40 rounded" />
            <SkeletonBlock className="h-3 w-60 rounded" />
          </div>
          <SkeletonBlock className="h-6 w-20 rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 p-3 rounded-lg bg-panel-bg/60 border border-border">
            <SkeletonBlock className="h-2.5 w-24 rounded" />
            <SkeletonBlock className="h-6 w-28 rounded" />
          </div>
          <div className="space-y-1.5 p-3 rounded-lg bg-panel-bg/60 border border-border">
            <SkeletonBlock className="h-2.5 w-24 rounded" />
            <SkeletonBlock className="h-4 w-36 rounded" />
          </div>
          <div className="space-y-1.5 p-3 rounded-lg bg-panel-bg/60 border border-border">
            <SkeletonBlock className="h-2.5 w-24 rounded" />
            <SkeletonBlock className="h-4 w-32 rounded" />
          </div>
        </div>
      </div>

      {/* Policy Configuration History */}
      <section className="ui-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <SkeletonBlock className="h-4 w-4 rounded" />
          <SkeletonBlock className="h-4 w-44 rounded" />
        </div>
        <SkeletonTable
          rows={4}
          columns={7}
          columnWeights={[1.5, 1.2, 0.9, 1.1, 1.1, 1.8, 0.8]}
          minWidthClassName="data-table-wide"
          showToolbar={false}
          showFooter={false}
          mobileCards={false}
        />
      </section>
    </SkeletonPage>
  );
}
