import { SkeletonBlock, SkeletonPage, SkeletonStatCard, SkeletonTable } from '../common/SkeletonPrimitives';

export function PayrollDashboardOverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 bg-white border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="w-44 h-4 rounded ar-shimmer" />
          <div className="w-12 h-3.5 rounded ar-shimmer" />
        </div>
        <div className="relative border-l border-border ml-3 pl-5 space-y-5 py-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="relative group space-y-2">
              <span className="absolute -left-[31px] top-0 flex items-center justify-center w-5 h-5 rounded-full border border-border bg-panel-bg ar-shimmer shrink-0" />
              <div className="w-2/3 h-4 rounded ar-shimmer" />
              <div className="w-1/3 h-3 rounded ar-shimmer" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl p-5 shadow-sm space-y-4 h-fit">
        <div className="w-24 h-4 rounded ar-shimmer border-b border-border pb-3" />
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="p-3.5 rounded-xl border border-border flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg ar-shimmer shrink-0" />
              <div className="space-y-2 flex-1 mt-0.5">
                <div className="w-32 h-3.5 rounded ar-shimmer" />
                <div className="w-48 h-3 rounded ar-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PayrollDashboardSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Payroll Dashboard">
      <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg border border-primary/30 bg-accent ar-shimmer opacity-50">
        <div className="w-4 h-4 rounded ar-shimmer shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1.5">
          <div className="w-32 h-3 rounded ar-shimmer" />
          <div className="w-full h-3 rounded ar-shimmer" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div className="bg-white border border-border rounded-xl p-4 sm:p-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg ar-shimmer shrink-0" />
          <div className="space-y-1.5">
            <div className="w-24 h-2.5 rounded ar-shimmer" />
            <div className="w-32 h-3.5 rounded ar-shimmer" />
          </div>
        </div>
        <div className="w-32 h-9 rounded-md ar-shimmer" />
      </div>

      <PayrollDashboardOverviewSkeleton />
    </SkeletonPage>
  );
}

export function SalaryComputationSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Salary Computation">
      <div className="bg-white border border-border rounded-xl p-4 sm:p-5 flex items-center justify-between flex-wrap gap-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <SkeletonBlock className="w-9 h-9 rounded-lg shrink-0" />
          <div className="space-y-1.5">
            <SkeletonBlock className="w-24 h-2.5 rounded" />
            <SkeletonBlock className="w-32 h-3.5 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="w-28 h-9 rounded-lg" />
          <SkeletonBlock className="w-20 h-9 rounded-lg" />
          <SkeletonBlock className="w-28 h-9 rounded-lg" />
        </div>
      </div>
      <div className="ui-card overflow-hidden">
        <SkeletonTable
          rows={4}
          columns={10}
          columnWeights={[0.5, 1.8, 1, 0.8, 0.8, 1.1, 1.1, 0.9, 0.9, 0.7]}
          minWidthClassName="data-table-extra-wide"
          showToolbar={false}
          showFooter={false}
          mobileCards={false}
        />
      </div>
    </SkeletonPage>
  );
}

export function PayrollReportsSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Payroll Reports">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white border border-border rounded-xl p-5 space-y-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-lg ar-shimmer shrink-0" />
            <div className="w-24 h-3.5 rounded ar-shimmer" />
            <div className="w-full h-8 rounded ar-shimmer" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-border rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <div className="w-8 h-8 rounded-lg ar-shimmer shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="w-32 h-4 rounded ar-shimmer" />
              <div className="w-24 h-3 rounded ar-shimmer" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="w-12 h-3 rounded ar-shimmer" />
                <div className="w-full h-10 rounded-lg border border-border ar-shimmer opacity-40" />
              </div>
              <div className="space-y-1.5">
                <div className="w-12 h-3 rounded ar-shimmer" />
                <div className="w-full h-10 rounded-lg border border-border ar-shimmer opacity-40" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="w-20 h-3 rounded ar-shimmer" />
              <div className="w-full h-8 rounded ar-shimmer" />
            </div>
            <div className="space-y-1.5">
              <div className="w-24 h-3 rounded ar-shimmer" />
              <div className="w-full h-10 rounded-lg border border-border ar-shimmer opacity-40" />
            </div>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm space-y-4 h-fit">
          <div className="w-24 h-4 rounded ar-shimmer border-b border-border pb-3" />
          <div className="space-y-3">
            <div className="w-full h-12 rounded-lg ar-shimmer" />
            <div className="w-full h-12 rounded-lg ar-shimmer" />
            <div className="w-full h-12 rounded-lg ar-shimmer" />
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}

export function PayrollChecklistSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Payroll Checklist">
      <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg border border-primary/30 bg-accent ar-shimmer opacity-50">
        <div className="w-4 h-4 rounded ar-shimmer shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1.5">
          <div className="w-32 h-3 rounded ar-shimmer" />
          <div className="w-full h-3 rounded ar-shimmer" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div className="bg-white border border-border rounded-xl p-4 sm:p-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg ar-shimmer shrink-0" />
          <div className="space-y-1.5">
            <div className="w-24 h-2.5 rounded ar-shimmer" />
            <div className="w-32 h-3.5 rounded ar-shimmer" />
          </div>
        </div>
        <div className="w-32 h-9 rounded-md ar-shimmer" />
      </div>

      <SkeletonTable rows={4} columns={6} showToolbar={false} />
    </SkeletonPage>
  );
}

export function DailyParcelEntrySkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Daily Parcel Entry">
      {/* 1. Informational header banner + action */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <SkeletonBlock className="w-10 h-10 rounded-xl shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <SkeletonBlock className="w-48 h-4 rounded" />
              <SkeletonBlock className="w-24 h-4 rounded-full" />
            </div>
            <SkeletonBlock className="w-72 sm:w-96 h-3 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
          <SkeletonBlock className="w-32 h-9 rounded-lg" />
        </div>
      </div>

      {/* 2. Filter & Input Toolbar */}
      <div className="bg-white border border-border rounded-xl p-4 space-y-3 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <SkeletonBlock className="w-20 h-2.5 rounded" />
              <SkeletonBlock className="w-full h-9 rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      {/* 3. Three Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* 4. Parcel Entry Table */}
      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 bg-panel-bg border-b border-border flex items-center justify-between">
          <SkeletonBlock className="w-44 h-4 rounded" />
          <SkeletonBlock className="w-36 h-3 rounded" />
        </div>
        <SkeletonTable
          rows={4}
          columns={10}
          columnWeights={[1.45, 1.1, 0.95, 0.75, 0.7, 0.65, 0.65, 0.7, 0.9, 0.55]}
          showToolbar={false}
          showFooter={false}
          className="rounded-none border-0 shadow-none"
        />
      </div>
    </SkeletonPage>
  );
}

export function ParcelHistorySkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Parcel History">
      {/* 1. Informational header banner + action */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <SkeletonBlock className="w-10 h-10 rounded-xl shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <SkeletonBlock className="w-56 h-4 rounded" />
              <SkeletonBlock className="w-20 h-4 rounded-full" />
            </div>
            <SkeletonBlock className="w-72 sm:w-96 h-3 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <SkeletonBlock className="w-28 h-9 rounded-lg" />
        </div>
      </div>

      {/* 2. Filter Toolbar (5 inputs) */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <SkeletonBlock className="w-20 h-2.5 rounded" />
              <SkeletonBlock className="w-full h-9 rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      {/* 3. Main Data Table (10 columns, no stat cards above) */}
      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-xs">
        <SkeletonTable
          rows={4}
          columns={10}
          columnWeights={[1, 1.6, 1.2, 0.75, 0.65, 0.65, 0.75, 0.8, 1, 0.45]}
          showToolbar={false}
          showFooter={false}
          className="rounded-none border-0 shadow-none"
        />
      </div>
    </SkeletonPage>
  );
}

export function PayrollHistorySkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Payroll History">
      <div className="ui-toolbar flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2"><SkeletonBlock className="h-6 w-32 rounded-md" /><SkeletonBlock className="h-6 w-44 rounded-md" /></div>
        <SkeletonBlock className="h-8 w-32 rounded-lg" />
      </div>

      <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 divide-y divide-border sm:grid-cols-2 md:grid-cols-4 md:divide-x md:divide-y-0">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 pt-3 first:pt-0 md:pl-4 md:pt-0 md:first:pl-0"><SkeletonBlock className="h-2.5 w-28" /><SkeletonBlock className="h-5 w-36 max-w-full" /></div>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 overflow-hidden rounded-lg border border-border bg-panel-bg p-0.5">{[144, 172, 126].map((width) => <SkeletonBlock key={width} className="h-8 shrink-0 rounded-md" style={{ width }} />)}</div>
          <SkeletonBlock className="h-9 w-full rounded-lg lg:w-72" />
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border pt-3"><SkeletonBlock className="h-8 w-24" /><SkeletonBlock className="h-8 w-44" /><SkeletonBlock className="h-8 w-28" /><SkeletonBlock className="h-8 w-32" /></div>
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3"><SkeletonBlock className="h-9 w-9 shrink-0 rounded-lg" /><div className="space-y-2"><SkeletonBlock className="h-3.5 w-40" /><SkeletonBlock className="h-2.5 w-64 max-w-full" /></div></div>
              <div className="flex gap-2"><SkeletonBlock className="h-8 w-32 rounded-lg" /><SkeletonBlock className="h-8 w-24 rounded-lg" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((__, cell) => <SkeletonBlock key={cell} className="h-14 rounded-lg" />)}</div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
