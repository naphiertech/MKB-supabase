import { SkeletonBlock, SkeletonPage, SkeletonTable } from '../common/SkeletonPrimitives';

export function FMSDailyImportSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Parcel Data Import">
      {/* Step Progress Bar */}
      <div className="bg-white border border-border rounded-xl p-3 shadow-xs">
        <div className="flex items-center justify-between gap-2 overflow-x-auto py-1">
          {['Upload File', 'Validate', 'Map Riders', 'Classify', 'Review', 'Confirm'].map((step, idx) => (
            <div key={step} className="flex items-center gap-2 shrink-0">
              <SkeletonBlock className="h-6 w-6 rounded-full" />
              <SkeletonBlock className="h-3 w-20 rounded" />
              {idx < 5 && <SkeletonBlock className="h-0.5 w-6 rounded bg-border" />}
            </div>
          ))}
        </div>
      </div>

      {/* Main Upload Workspace */}
      <div className="bg-white border border-border rounded-xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-4">
          <div className="space-y-1">
            <SkeletonBlock className="h-4 w-48 rounded" />
            <SkeletonBlock className="h-3 w-72 rounded" />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <SkeletonBlock className="h-9 w-full sm:w-36 rounded-lg" />
            <SkeletonBlock className="h-9 w-full sm:w-36 rounded-lg" />
          </div>
        </div>

        {/* Drag & Drop Shimmer Zone */}
        <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-3">
          <SkeletonBlock className="h-12 w-12 rounded-full" />
          <SkeletonBlock className="h-8 w-36 rounded-lg" />
          <SkeletonBlock className="h-3 w-48 rounded" />
        </div>

        {/* Privacy Note */}
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-border bg-panel-bg">
          <SkeletonBlock className="h-4 w-4 shrink-0 rounded" />
          <SkeletonBlock className="h-3 w-full max-w-lg rounded" />
        </div>
      </div>

      {/* Recent Import Batches Table */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-4 w-4 rounded" />
          <SkeletonBlock className="h-4 w-40 rounded" />
        </div>
        <SkeletonTable
          rows={4}
          columns={6}
          columnWeights={[1.5, 1.8, 1, 1.1, 1, 1]}
          minWidthClassName="w-full"
          showToolbar={false}
          showFooter={false}
          mobileCards={false}
        />
      </div>
    </SkeletonPage>
  );
}
