import { SkeletonPage, SkeletonStatCard, SkeletonTable } from './SkeletonPrimitives';

export function AuditLogsSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Audit Logs">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div className="bg-white border border-border rounded-xl p-4 flex flex-wrap items-end gap-3 shadow-sm">
        <div className="w-48 h-10 rounded-lg border border-border ar-shimmer opacity-40" />
        <div className="w-36 h-10 rounded-lg border border-border ar-shimmer opacity-40" />
        <div className="w-36 h-10 rounded-lg border border-border ar-shimmer opacity-40" />
      </div>

      <SkeletonTable rows={6} columns={5} />
    </SkeletonPage>
  );
}
