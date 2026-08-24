import { SkeletonPage, SkeletonStatCard, SkeletonMap, SkeletonTable } from '../common/SkeletonPrimitives';
import { OnlineRidersSkeleton } from '../dashboard/AdminDashboardSkeleton';

export function GeofenceSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Geofence and Zones">
      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
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
    </SkeletonPage>
  );
}
