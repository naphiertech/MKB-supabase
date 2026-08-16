import { SkeletonBlock, SkeletonPage, SkeletonTable } from '../common/SkeletonPrimitives';

export function UsersSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Users Registry">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <SkeletonBlock className="h-7 w-10" />
          <SkeletonBlock className="h-4 w-28" />
          <div className="ml-0 hidden items-center gap-1.5 md:flex lg:ml-3">
            {[72, 64, 72, 84].map((width, index) => (
              <SkeletonBlock key={`${width}-${index}`} className="h-6 rounded-full" style={{ width }} />
            ))}
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <SkeletonBlock className="h-10 w-full sm:h-9 sm:w-28" />
          <SkeletonBlock className="h-10 w-full sm:h-9 sm:w-24" />
        </div>
      </div>

      <div className="ui-toolbar p-3">
        <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-nowrap">
          <SkeletonBlock className="h-9 min-w-0 flex-1 rounded-lg" />
          <div className="flex min-w-0 flex-wrap gap-2 lg:flex-nowrap">
            <SkeletonBlock className="h-9 w-32 rounded-lg" />
            <SkeletonBlock className="h-9 w-52 max-w-full rounded-lg" />
            <SkeletonBlock className="h-9 w-24 rounded-lg" />
            <SkeletonBlock className="h-9 w-16 rounded-lg" />
          </div>
        </div>
      </div>

      <SkeletonTable
        rows={8}
        columns={9}
        columnWeights={[1.6, 0.75, 1.55, 1.25, 1, 0.9, 0.9, 1, 0.35]}
        minWidthClassName="data-table-wide"
        showToolbar={false}
        showFooter
        mobileCards={false}
      />
    </SkeletonPage>
  );
}
