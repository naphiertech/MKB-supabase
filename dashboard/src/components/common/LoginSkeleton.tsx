export function LoginSkeleton() {
  return (
    <div className="w-full max-w-md space-y-6">
      <div className="w-28 h-3.5 rounded ar-shimmer" />

      <div className="space-y-2 mt-2">
        <div className="w-48 h-8 rounded ar-shimmer" />
        <div className="w-64 h-3.5 rounded ar-shimmer" />
      </div>

      <div className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <div className="w-16 h-3 rounded ar-shimmer" />
          <div className="w-full h-11 rounded-lg border border-border ar-shimmer opacity-40" />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <div className="w-20 h-3 rounded ar-shimmer" />
            <div className="w-12 h-3 rounded ar-shimmer" />
          </div>
          <div className="w-full h-11 rounded-lg border border-border ar-shimmer opacity-40" />
        </div>

        <div className="w-full h-11 rounded-lg ar-shimmer mt-2" />
      </div>

      <div className="pt-6 border-t border-border space-y-3">
        <div className="flex justify-between items-center">
          <div className="w-28 h-3 rounded ar-shimmer" />
          <div className="w-24 h-3 rounded ar-shimmer" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg border border-border p-3 space-y-1.5 bg-white">
              <div className="flex justify-between items-center">
                <div className="w-10 h-2.5 rounded ar-shimmer" />
                <div className="w-4 h-2.5 rounded ar-shimmer" />
              </div>
              <div className="w-20 h-3.5 rounded ar-shimmer" />
              <div className="w-28 h-2.5 rounded ar-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
