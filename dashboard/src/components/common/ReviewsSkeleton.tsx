import { SkeletonPage } from './SkeletonPrimitives';

export function ReviewCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-border p-5 rounded-2xl shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-1.5 flex-1">
                <div className="w-28 h-4 rounded ar-shimmer" />
                <div className="w-20 h-3 rounded ar-shimmer" />
              </div>
              <div className="w-16 h-3 rounded ar-shimmer" />
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, s) => (
                <div key={s} className="w-3.5 h-3.5 rounded-full ar-shimmer shrink-0" />
              ))}
            </div>
            <div className="space-y-2">
              <div className="w-full h-3.5 rounded ar-shimmer" />
              <div className="w-5/6 h-3.5 rounded ar-shimmer" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <div className="w-16 h-7 rounded ar-shimmer" />
            <div className="w-20 h-7 rounded ar-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReviewsSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Courier Reviews">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-2 rounded-xl border border-border shadow-xs">
        <div className="flex gap-1">
          <div className="w-32 h-8 rounded ar-shimmer" />
          <div className="w-32 h-8 rounded ar-shimmer" />
        </div>
        <div className="w-24 h-4 rounded ar-shimmer" />
      </div>
      <ReviewCardsSkeleton />
    </SkeletonPage>
  );
}
