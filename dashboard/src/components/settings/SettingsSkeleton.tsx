export function SettingsSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-6 max-w-4xl">
      <div className="flex border-b border-border gap-6 pb-px">
        <div className="w-28 h-8 rounded ar-shimmer" />
        <div className="w-20 h-8 rounded ar-shimmer" />
        <div className="w-24 h-8 rounded ar-shimmer" />
      </div>

      <div className="bg-white border border-border rounded-xl p-5 md:p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-center gap-5 pb-6 border-b border-border">
          <div className="w-20 h-20 rounded-full ar-shimmer shrink-0" />
          <div className="space-y-2 flex-1 text-center sm:text-left">
            <div className="w-32 h-4.5 rounded ar-shimmer mx-auto sm:mx-0" />
            <div className="w-48 h-3 rounded ar-shimmer mx-auto sm:mx-0" />
            <div className="flex gap-2 justify-center sm:justify-start pt-1">
              <div className="w-24 h-8 rounded-lg ar-shimmer" />
              <div className="w-20 h-8 rounded-lg ar-shimmer" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="w-20 h-3 rounded ar-shimmer" />
              <div className="w-full h-10 rounded-lg border border-border ar-shimmer opacity-40" />
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
          <div className="w-32 h-10 rounded-lg ar-shimmer" />
        </div>
      </div>
    </div>
  );
}
