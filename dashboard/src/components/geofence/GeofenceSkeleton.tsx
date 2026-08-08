import { SkeletonStatCard, SkeletonMap, SkeletonTable } from '../common/SkeletonPrimitives';
import { OnlineRidersSkeleton } from '../dashboard/AdminDashboardSkeleton';

export function GeofenceSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <SkeletonMap />
        </div>
        <div className="lg:col-span-2">
          <OnlineRidersSkeleton />
        </div>
      </div>

      <SkeletonTable rows={5} columns={5} />
    </div>
  );
}
