import type { CSSProperties, ReactNode } from 'react';

/**
 * Core Skeleton Visual Primitives
 * Reusable shimmer elements for building synchronized page skeletons.
 */

export interface SkeletonPageProps {
  children: ReactNode;
  className?: string;
  label?: string;
}

export function SkeletonPage({ children, className = '', label = 'Loading page content' }: SkeletonPageProps) {
  return (
    <div
      className={`dashboard-page w-full min-w-0 max-w-none ${className}`}
      role="status"
      aria-busy="true"
      aria-label={label}
      data-skeleton-page
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export interface SkeletonBlockProps {
  className?: string;
  style?: CSSProperties;
}

export function SkeletonBlock({ className = '', style }: SkeletonBlockProps) {
  return <div aria-hidden="true" className={`rounded ar-shimmer ${className}`} style={style} />;
}

export interface SkeletonTextProps {
  className?: string;
  width?: string;
  height?: string;
}

export function SkeletonText({ className = '', width, height }: SkeletonTextProps) {
  return (
    <div
      aria-hidden="true"
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
  compact?: boolean;
}

export function SkeletonStatCard({ height = 'h-36', compact = false }: SkeletonStatCardProps) {
  if (compact) {
    return (
      <div className="min-w-0 rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex min-w-0 items-center gap-3.5">
          <SkeletonBlock className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-2.5 w-24" />
            <SkeletonBlock className="h-6 w-14" />
            <SkeletonBlock className="h-2.5 w-28 max-w-full" />
          </div>
        </div>
      </div>
    );
  }

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
  columnWeights?: number[];
  className?: string;
  minWidthClassName?: string;
  showToolbar?: boolean;
  showFooter?: boolean;
  mobileCards?: boolean;
  mobileBreakpoint?: 'sm' | 'lg';
}

export function SkeletonTable({
  rows = 5,
  columns = 5,
  columnWeights,
  className = '',
  minWidthClassName = '',
  showToolbar = true,
  showFooter = false,
  mobileCards = true,
  mobileBreakpoint = 'sm',
}: SkeletonTableProps) {
  const weights = columnWeights?.length === columns
    ? columnWeights
    : Array.from({ length: columns }, (_, index) => index === 0 ? 1.7 : 1);
  const weightTotal = weights.reduce((total, weight) => total + weight, 0);
  const desktopVisibility = mobileCards
    ? mobileBreakpoint === 'lg' ? 'hidden lg:block' : 'hidden sm:block'
    : 'block';
  const mobileVisibility = mobileCards
    ? mobileBreakpoint === 'lg' ? 'lg:hidden' : 'sm:hidden'
    : 'hidden';
  const barWidths = ['w-24', 'w-16', 'w-28', 'w-20', 'w-14', 'w-24'];

  return (
    <div className={`min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-sm ${className}`} data-skeleton-table>
      {showToolbar && <div className="flex items-center justify-between p-4 border-b border-border gap-3 flex-wrap">
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
      </div>}

      {/* Desktop Table View */}
      <div className={`${desktopVisibility} table-scroll-region`}>
        <table className={`w-full text-sm ${minWidthClassName}`}>
          <colgroup>
            {weights.map((weight, index) => (
              <col key={index} style={{ width: `${(weight / weightTotal) * 100}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border bg-panel-bg">
              {Array.from({ length: columns }).map((_, c) => (
                <th key={c} className="py-2.5 px-4">
                  <SkeletonBlock className={`${barWidths[c % barWidths.length]} h-3 max-w-full`} />
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
                    <SkeletonBlock className={`${barWidths[(c + idx + 1) % barWidths.length]} h-3.5 max-w-full`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked Card View */}
      <div className={`${mobileVisibility} space-y-3 bg-panel-bg/30 p-3`}>
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

      {showFooter && (
        <div className="flex flex-col gap-3 border-t border-border bg-panel-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <SkeletonBlock className="h-3 w-52 max-w-full" />
          <div className="flex items-center gap-1.5">
            <SkeletonBlock className="h-7 w-7" />
            <SkeletonBlock className="h-7 w-24" />
            <SkeletonBlock className="h-7 w-7" />
          </div>
        </div>
      )}
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
