/**
 * Core Skeleton Visual Primitives
 * Reusable shimmer elements for building synchronized page skeletons.
 */

export interface SkeletonBlockProps {
  className?: string;
  style?: React.CSSProperties;
}

export function SkeletonBlock({ className = '', style }: SkeletonBlockProps) {
  return <div className={`rounded ar-shimmer ${className}`} style={style} />;
}

export interface SkeletonTextProps {
  className?: string;
  width?: string;
  height?: string;
}

export function SkeletonText({ className = '', width, height }: SkeletonTextProps) {
  return (
    <div
      className={`rounded ar-shimmer ${className}`}
      style={{
        width: width ?? undefined,
        height: height ?? undefined,
      }}
    />
  );
}

export interface SkeletonStatCardProps {
  height?: string;
}

export function SkeletonStatCard({ height = 'h-36' }: SkeletonStatCardProps) {
  return (
    <div className={`relative bg-white border border-border rounded-xl p-4 sm:p-5 overflow-hidden shadow-sm ${height}`}>
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-border" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2 flex-1">
          <div className="w-24 h-3.5 rounded ar-shimmer" />
          <div className="w-16 h-7 rounded ar-shimmer mt-2" />
          <div className="w-28 h-3 rounded ar-shimmer mt-2" />
        </div>
        <div className="w-9 h-9 rounded-lg ar-shimmer shrink-0" />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="w-16 h-3.5 rounded ar-shimmer" />
        <div className="flex items-end gap-[3px] h-7">
          {[40, 60, 50, 70, 80, 60, 90].map((h, i) => (
            <div
              key={i}
              className="w-[3px] rounded-sm bg-border/60"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export interface SkeletonTableProps {
  rows?: number;
  columns?: number;
}

export function SkeletonTable({ rows = 5, columns = 5 }: SkeletonTableProps) {
  return (
    <div className="bg-white border border-border rounded-xl flex flex-col shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg ar-shimmer shrink-0" />
          <div className="space-y-1">
            <div className="w-32 h-3.5 rounded ar-shimmer" />
            <div className="w-16 h-3 rounded ar-shimmer" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-36 h-8 rounded-md bg-panel-bg border border-border ar-shimmer opacity-50" />
          <div className="w-16 h-7 rounded ar-shimmer" />
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border bg-panel-bg">
              {Array.from({ length: columns }).map((_, c) => (
                <th key={c} className="py-2.5 px-4">
                  <div className="w-12 h-3 rounded ar-shimmer" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, idx) => (
              <tr key={idx} className="border-b border-border/70 last:border-0 bg-white">
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-panel-bg border border-border ar-shimmer shrink-0" />
                    <div className="min-w-0 space-y-1">
                      <div className="w-20 h-3.5 rounded ar-shimmer" />
                      <div className="w-12 h-2.5 rounded ar-shimmer" />
                    </div>
                  </div>
                </td>
                {Array.from({ length: columns - 1 }).map((_, c) => (
                  <td key={c} className="py-2.5 px-4">
                    <div className="w-12 h-3.5 rounded ar-shimmer" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked Card View */}
      <div className="sm:hidden p-3 space-y-3 bg-panel-bg/30">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="bg-white border border-border rounded-lg p-3 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full ar-shimmer" />
                <div className="w-24 h-3.5 rounded ar-shimmer" />
              </div>
              <div className="w-14 h-4 rounded-full ar-shimmer" />
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border/60">
              <div className="w-16 h-3 rounded ar-shimmer" />
              <div className="w-12 h-3 rounded ar-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonMap() {
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="space-y-1.5 flex-1">
          <div className="w-32 h-3.5 rounded ar-shimmer" />
          <div className="w-48 h-3 rounded ar-shimmer" />
        </div>
        <div className="w-24 h-4 rounded ar-shimmer" />
      </div>
      <div className="h-[460px] ar-shimmer opacity-40" />
    </div>
  );
}
