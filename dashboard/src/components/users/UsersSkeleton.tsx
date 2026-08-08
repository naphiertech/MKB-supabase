import { SkeletonTable } from '../common/SkeletonPrimitives';

export function UsersSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded ar-shimmer shrink-0" />
          <div className="w-20 h-4 rounded ar-shimmer" />
          <div className="hidden md:flex gap-2">
            <div className="w-16 h-6 rounded-full ar-shimmer" />
            <div className="w-16 h-6 rounded-full ar-shimmer" />
            <div className="w-16 h-6 rounded-full ar-shimmer" />
          </div>
        </div>
        <div className="w-28 h-9 rounded-md ar-shimmer" />
      </div>
      <div className="bg-white border border-border rounded-xl p-3 flex flex-wrap gap-2 items-center shadow-sm">
        <div className="w-48 h-8 rounded ar-shimmer" />
        <div className="w-32 h-8 rounded ar-shimmer" />
      </div>
      <SkeletonTable rows={6} columns={6} />
    </div>
  );
}
