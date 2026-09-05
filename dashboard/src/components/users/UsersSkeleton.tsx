import { SkeletonBlock, SkeletonPage, SkeletonTable } from '../common/SkeletonPrimitives';

export interface UsersSkeletonProps {
  role?: 'admin' | 'hr' | 'payroll';
  rows?: number;
  showFooter?: boolean;
}

export function UsersSkeleton({
  role = 'admin',
  rows = 4,
  showFooter = false,
}: UsersSkeletonProps) {
  const isHr = role === 'hr';

  return (
    <SkeletonPage className="space-y-5" label="Loading Users Registry">
      {/* Summary Area */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <SkeletonBlock className="h-7 w-10" />
          <SkeletonBlock className={`h-4 ${isHr ? 'w-24' : 'w-28'}`} />
          <div className="ml-0 hidden items-center gap-1.5 md:flex lg:ml-3" data-testid="users-skeleton-role-chips">
            {isHr ? (
              <SkeletonBlock className="h-6 w-20 rounded-full" />
            ) : (
              [72, 64, 72, 84].map((width, index) => (
                <SkeletonBlock key={`${width}-${index}`} className="h-6 rounded-full" style={{ width }} />
              ))
            )}
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <SkeletonBlock className="h-10 w-full sm:h-9 sm:w-28" />
          <SkeletonBlock className="h-10 w-full sm:h-9 sm:w-24" />
        </div>
      </div>

      {/* Filter Toolbar matching real Users.tsx */}
      <div className="ui-toolbar p-3" aria-label="Users filters placeholder">
        <div className="flex flex-col flex-wrap items-stretch gap-2.5 sm:flex-row sm:items-center lg:flex-nowrap">
          {/* Search Input */}
          <SkeletonBlock className="h-9 min-w-0 flex-1 rounded-lg" />

          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
            {/* Role select (Admin only) */}
            {!isHr && <SkeletonBlock className="h-9 w-full sm:w-36 rounded-lg" />}

            {/* Hub-aware zone dropdown */}
            <SkeletonBlock className="h-9 w-full sm:w-64 rounded-lg" />

            {/* Filters popover button */}
            <SkeletonBlock className="h-9 w-24 rounded-lg" />

            {/* Shown count badge */}
            <div className="ml-auto flex items-center justify-end px-1">
              <SkeletonBlock className="h-3.5 w-16 rounded" />
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <SkeletonTable
        rows={rows}
        columns={9}
        columnWeights={[1.6, 0.75, 1.55, 1.25, 1, 0.9, 0.9, 1, 0.35]}
        minWidthClassName="data-table-wide"
        showToolbar={false}
        showFooter={showFooter}
        mobileCards={false}
      />
    </SkeletonPage>
  );
}
