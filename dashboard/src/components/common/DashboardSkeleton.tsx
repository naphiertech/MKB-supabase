import { type PageKey } from './Sidebar';
import { type RiderPageKey } from '../rider/RiderTopNav';

/**
 * Premium Login Page Form Skeleton
 */
export function LoginSkeleton() {
  return (
    <div className="w-full max-w-md space-y-6">
      {/* Back to website link */}
      <div className="w-28 h-3.5 rounded ar-shimmer" />

      {/* Header title and description */}
      <div className="space-y-2 mt-2">
        <div className="w-48 h-8 rounded ar-shimmer" />
        <div className="w-64 h-3.5 rounded ar-shimmer" />
      </div>

      {/* Form Fields container */}
      <div className="space-y-4 pt-2">
        {/* Email input field */}
        <div className="space-y-1.5">
          <div className="w-16 h-3 rounded ar-shimmer" />
          <div className="w-full h-11 rounded-lg border border-border ar-shimmer opacity-40" />
        </div>

        {/* Password input field */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <div className="w-20 h-3 rounded ar-shimmer" />
            <div className="w-12 h-3 rounded ar-shimmer" />
          </div>
          <div className="w-full h-11 rounded-lg border border-border ar-shimmer opacity-40" />
        </div>

        {/* Submit CTA button */}
        <div className="w-full h-11 rounded-lg ar-shimmer mt-2" />
      </div>

      {/* Demo Accounts shortcuts section */}
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

interface DashboardSkeletonProps {
  page: PageKey | RiderPageKey;
  role: 'admin' | 'hr' | 'payroll' | 'rider';
}

/**
 * Premium Stat Card Skeleton Component
 */
export function StatCardSkeleton() {
  return (
    <div className="relative bg-white border border-border rounded-xl p-4 sm:p-5 overflow-hidden shadow-sm h-36">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-border" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2 flex-1">
          {/* Label */}
          <div className="w-24 h-3.5 rounded ar-shimmer" />
          {/* Value */}
          <div className="w-16 h-7 rounded ar-shimmer mt-2" />
          {/* Subtitle */}
          <div className="w-28 h-3 rounded ar-shimmer mt-2" />
        </div>
        {/* Icon */}
        <div className="w-9 h-9 rounded-lg ar-shimmer shrink-0" />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        {/* Trend */}
        <div className="w-16 h-3.5 rounded ar-shimmer" />
        {/* Sparkline */}
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

/**
 * Premium Map Skeleton Component (Geofence & Live Monitoring)
 */
export function MapSkeleton() {
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

/**
 * Premium Online Riders List Skeleton
 */
export function OnlineRidersSkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl flex flex-col h-full min-h-[400px] lg:h-[512px] shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg ar-shimmer shrink-0" />
          <div className="space-y-1">
            <div className="w-24 h-3.5 rounded ar-shimmer" />
            <div className="w-16 h-3 rounded ar-shimmer" />
          </div>
        </div>
        <div className="w-16 h-8 rounded-md ar-shimmer" />
      </div>
      {/* List Container */}
      <div className="p-2 space-y-1.5 flex-1 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-panel-bg border border-transparent"
          >
            <div className="w-9 h-9 rounded-full bg-white ring-2 ring-border ring-offset-2 ring-offset-white ar-shimmer shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="w-24 h-3.5 rounded ar-shimmer" />
              <div className="flex items-center gap-2">
                <div className="w-12 h-3.5 rounded ar-shimmer" />
                <div className="w-10 h-3 rounded ar-shimmer" />
              </div>
            </div>
            <div className="w-4 h-4 rounded ar-shimmer shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Premium Violation Feed Skeleton
 */
export function ViolationFeedSkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl flex flex-col h-full min-h-[360px] shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg ar-shimmer shrink-0" />
          <div className="space-y-1">
            <div className="w-28 h-3.5 rounded ar-shimmer" />
            <div className="w-20 h-3 rounded ar-shimmer" />
          </div>
        </div>
        <div className="w-20 h-3.5 rounded ar-shimmer" />
      </div>
      {/* List */}
      <div className="p-3 space-y-2 flex-1 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-3 p-3 rounded-lg border border-border bg-panel-bg/50"
          >
            <div className="w-8 h-8 rounded-md ar-shimmer shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="w-24 h-3.5 rounded ar-shimmer" />
              <div className="w-32 h-3 rounded ar-shimmer" />
              <div className="w-16 h-2.5 rounded ar-shimmer" />
            </div>
            <div className="w-12 h-7 rounded-md bg-primary/10 ar-shimmer shrink-0 self-center" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Premium Attendance Table Skeleton
 */
export function AttendanceTableSkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl flex flex-col shadow-sm">
      {/* Header */}
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
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border bg-panel-bg">
              <th className="py-2.5 px-4"><div className="w-12 h-3 rounded ar-shimmer" /></th>
              <th className="py-2.5 px-4"><div className="w-16 h-3 rounded ar-shimmer" /></th>
              <th className="py-2.5 px-4"><div className="w-16 h-3 rounded ar-shimmer" /></th>
              <th className="py-2.5 px-4"><div className="w-12 h-3 rounded ar-shimmer" /></th>
              <th className="py-2.5 px-4"><div className="w-12 h-3 rounded ar-shimmer" /></th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, idx) => (
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
                <td className="py-2.5 px-4"><div className="w-10 h-3 rounded ar-shimmer" /></td>
                <td className="py-2.5 px-4"><div className="w-10 h-3 rounded ar-shimmer" /></td>
                <td className="py-2.5 px-4"><div className="w-14 h-3.5 rounded ar-shimmer" /></td>
                <td className="py-2.5 px-4"><div className="w-16 h-5 rounded-full ar-shimmer" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Premium HR Attendance Overview Table Skeleton
 */
export function HRAttendanceOverviewSkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl flex flex-col shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg ar-shimmer shrink-0" />
          <div className="space-y-1">
            <div className="text-sm font-semibold text-foreground">
              <div className="w-32 h-3.5 rounded ar-shimmer" />
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              <div className="w-16 h-3 rounded ar-shimmer" />
            </div>
          </div>
        </div>
        <div className="w-24 h-8 rounded-md ar-shimmer shrink-0" />
      </div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border bg-panel-bg">
        <div className="w-36 h-8 rounded-md border border-border bg-white ar-shimmer opacity-50" />
        <div className="w-24 h-8 rounded-md border border-border bg-white ar-shimmer opacity-50" />
        <div className="w-28 h-8 rounded-md border border-border bg-white ar-shimmer opacity-50" />
      </div>
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border">
              <th className="font-semibold py-2.5 px-4"><div className="w-12 h-3 rounded ar-shimmer" /></th>
              <th className="font-semibold py-2.5 px-4"><div className="w-12 h-3 rounded ar-shimmer" /></th>
              <th className="font-semibold py-2.5 px-4"><div className="w-12 h-3 rounded ar-shimmer" /></th>
              <th className="font-semibold py-2.5 px-4"><div className="w-12 h-3 rounded ar-shimmer" /></th>
              <th className="font-semibold py-2.5 px-4"><div className="w-10 h-3 rounded ar-shimmer" /></th>
              <th className="font-semibold py-2.5 px-4"><div className="w-12 h-3 rounded ar-shimmer" /></th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, idx) => (
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
                <td className="py-2.5 px-4"><div className="w-14 h-4 rounded ar-shimmer" /></td>
                <td className="py-2.5 px-4"><div className="w-10 h-3.5 rounded ar-shimmer" /></td>
                <td className="py-2.5 px-4"><div className="w-10 h-3.5 rounded ar-shimmer" /></td>
                <td className="py-2.5 px-4"><div className="w-8 h-3.5 rounded ar-shimmer" /></td>
                <td className="py-2.5 px-4"><div className="w-16 h-5 rounded-full ar-shimmer" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Premium Rider Status Grid Skeleton
 */
export function RiderStatusGridSkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl shadow-sm">
      <div className="flex flex-wrap items-center gap-3 justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/25 flex items-center justify-center shrink-0" />
          <div className="space-y-1">
            <div className="w-24 h-3.5 rounded ar-shimmer" />
            <div className="w-16 h-3 rounded ar-shimmer" />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-56 h-8 rounded-md border border-border ar-shimmer opacity-50" />
          <div className="w-32 h-8 rounded-md border border-border ar-shimmer opacity-50" />
        </div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="relative text-left bg-white border border-border rounded-xl p-3.5 flex flex-col gap-3 overflow-hidden before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-border"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-panel-bg ring-2 ring-border ring-offset-2 ring-offset-white ar-shimmer shrink-0" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="w-20 h-3.5 rounded ar-shimmer" />
                  <div className="w-12 h-2.5 rounded ar-shimmer" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="w-12 h-4 rounded ar-shimmer" />
                <div className="w-14 h-4 rounded ar-shimmer" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="w-10 h-3 rounded ar-shimmer" />
                <div className="w-8 h-3.5 rounded ar-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Premium HR Violation Summary Skeleton
 */
export function HRViolationSummarySkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl flex flex-col h-full shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-50 ring-1 ring-red-500/25 flex items-center justify-center shrink-0" />
          <div className="space-y-1">
            <div className="w-28 h-3.5 rounded ar-shimmer" />
            <div className="w-20 h-3 rounded ar-shimmer" />
          </div>
        </div>
        <div className="w-16 h-3 rounded ar-shimmer" />
      </div>
      <div className="flex gap-1.5 px-4 py-2 bg-panel-bg/50 border-b border-border shrink-0">
        <div className="w-12 h-5 rounded-md ar-shimmer" />
        <div className="w-24 h-5 rounded-md ar-shimmer" />
        <div className="w-16 h-5 rounded-md ar-shimmer" />
      </div>
      <div className="p-3 space-y-2 flex-1 overflow-hidden">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-3 p-3 rounded-lg border border-border bg-panel-bg/50"
          >
            <div className="w-8 h-8 rounded-md ar-shimmer shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="w-24 h-3.5 rounded ar-shimmer" />
              <div className="w-32 h-3 rounded ar-shimmer" />
              <div className="w-16 h-2.5 rounded ar-shimmer" />
            </div>
            <div className="w-12 h-7 rounded-md bg-primary/10 ar-shimmer shrink-0 self-center" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Premium Charts Grid Skeleton (Reports)
 */
export function ChartsGridSkeleton() {
  return (
    <div className="space-y-5">
      {/* Top 4 Report Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-border rounded-xl p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg ar-shimmer shrink-0" />
              <div className="space-y-1 flex-1">
                <div className="w-24 h-3.5 rounded ar-shimmer" />
                <div className="w-12 h-3 rounded ar-shimmer" />
              </div>
            </div>
            <div className="w-full h-8 rounded ar-shimmer" />
          </div>
        ))}
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="bg-white border border-border rounded-xl p-4 space-y-4 shadow-sm">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <div className="w-36 h-4 rounded ar-shimmer" />
                <div className="w-48 h-3 rounded ar-shimmer" />
              </div>
              <div className="w-20 h-8 rounded ar-shimmer" />
            </div>
            <div className="h-[280px] rounded ar-shimmer opacity-40" />
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 space-y-4 shadow-sm">
          <div className="space-y-1">
            <div className="w-24 h-4 rounded ar-shimmer" />
            <div className="w-36 h-3 rounded ar-shimmer" />
          </div>
          <div className="h-[280px] rounded ar-shimmer opacity-40" />
        </div>
      </div>
    </div>
  );
}

/**
 * Premium Profile Form Page Skeleton
 */
export function ProfileSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Back button */}
      <div className="w-28 h-4 rounded ar-shimmer" />

      {/* Header card */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-accent/30 via-white to-white p-5 sm:p-6 flex items-center gap-4 shadow-sm overflow-hidden">
        <div className="w-20 h-20 rounded-2xl bg-white border border-border ar-shimmer shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="w-32 h-3 rounded ar-shimmer" />
          <div className="w-48 h-6 rounded ar-shimmer" />
          <div className="flex gap-2">
            <div className="w-12 h-4.5 rounded ar-shimmer" />
            <div className="w-20 h-3 rounded ar-shimmer" />
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white border border-border">
            <div className="w-9 h-9 rounded-lg bg-panel-bg ar-shimmer shrink-0" />
            <div className="space-y-1.5 flex-1 mt-0.5">
              <div className="w-16 h-2.5 rounded ar-shimmer" />
              <div className="w-32 h-4 rounded ar-shimmer" />
            </div>
          </div>
        ))}
      </div>

      {/* Face enrollment section */}
      <div className="rounded-2xl border border-border bg-white p-5 space-y-3 shadow-sm">
        <div className="w-32 h-4.5 rounded ar-shimmer" />
        <div className="w-full h-3 rounded ar-shimmer" />
        <div className="w-3/4 h-3 rounded ar-shimmer" />
        <div className="flex gap-2 pt-1">
          <div className="w-16 h-5 rounded ar-shimmer" />
          <div className="w-36 h-3.5 rounded ar-shimmer" />
        </div>
      </div>
    </div>
  );
}

/**
 * Premium Live Monitoring Page Skeleton
 */
export function LiveMonitoringSkeleton() {
  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden">
      {/* Sidebar Skeleton */}
      <aside className="w-80 shrink-0 bg-white border-r border-border flex flex-col">
        {/* Sidebar Header */}
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="w-20 h-4 rounded ar-shimmer" />
          <div className="w-6 h-6 rounded ar-shimmer" />
        </div>
        {/* Sidebar Content */}
        <div className="p-3 space-y-4 border-b border-border">
          <div className="space-y-1">
            <div className="w-10 h-3 rounded ar-shimmer" />
            <div className="w-full h-8 rounded bg-panel-bg border border-border ar-shimmer opacity-50" />
          </div>
          <div className="space-y-1">
            <div className="w-12 h-3 rounded ar-shimmer" />
            <div className="w-full h-8 rounded bg-panel-bg border border-border ar-shimmer opacity-50" />
          </div>
        </div>
        {/* Event Ticker Skeleton */}
        <div className="p-3 flex-1 overflow-hidden space-y-3">
          <div className="w-24 h-4 rounded ar-shimmer border-b border-border pb-2" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-2 p-2 rounded bg-panel-bg border border-transparent">
              <div className="w-7 h-7 rounded-full ar-shimmer shrink-0" />
              <div className="space-y-1.5 flex-1 mt-0.5">
                <div className="w-24 h-3 rounded ar-shimmer" />
                <div className="w-16 h-2.5 rounded ar-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </aside>
      {/* Map Skeleton */}
      <div className="flex-1 ar-shimmer opacity-40 h-full" />
    </div>
  );
}

/**
 * Premium Geofence Page Skeleton
 */
export function GeofenceSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Map + List Split */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <MapSkeleton />
        </div>
        <div className="lg:col-span-2">
          <OnlineRidersSkeleton />
        </div>
      </div>

      {/* Bottom Table */}
      <AttendanceTableSkeleton />
    </div>
  );
}

/**
 * Premium Payroll Dashboard Overview Skeleton (Recent Activity + Quick Actions)
 */
export function PayrollDashboardOverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Recent Activity */}
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

      {/* Quick Actions */}
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

/**
 * Premium Payroll Reports Page Skeleton
 */
export function PayrollReportsSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      {/* 3 cards at the top */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white border border-border rounded-xl p-5 space-y-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-lg ar-shimmer shrink-0" />
            <div className="w-24 h-3.5 rounded ar-shimmer" />
            <div className="w-full h-8 rounded ar-shimmer" />
          </div>
        ))}
      </div>
      {/* Split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Form */}
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
        {/* Right Summary */}
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm space-y-4 h-fit">
          <div className="w-24 h-4 rounded ar-shimmer border-b border-border pb-3" />
          <div className="space-y-3">
            <div className="w-full h-12 rounded-lg ar-shimmer" />
            <div className="w-full h-12 rounded-lg ar-shimmer" />
            <div className="w-full h-12 rounded-lg ar-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Premium Reviews Moderation Page Skeleton
 */
export function ReviewsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white border border-border p-5 rounded-2xl shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            {/* Header info */}
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-1.5 flex-1">
                <div className="w-28 h-4 rounded ar-shimmer" />
                <div className="w-20 h-3 rounded ar-shimmer" />
              </div>
              <div className="w-16 h-3 rounded ar-shimmer" />
            </div>
            {/* Rating stars */}
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, s) => (
                <div key={s} className="w-3.5 h-3.5 rounded-full ar-shimmer shrink-0" />
              ))}
            </div>
            {/* Comment text */}
            <div className="space-y-2">
              <div className="w-full h-3.5 rounded ar-shimmer" />
              <div className="w-5/6 h-3.5 rounded ar-shimmer" />
            </div>
          </div>
          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <div className="w-16 h-7 rounded ar-shimmer" />
            <div className="w-20 h-7 rounded ar-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Premium Settings Page Skeleton
 */
export function SettingsSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-6 max-w-4xl">
      {/* Header Tabs */}
      <div className="flex border-b border-border gap-6 pb-px">
        <div className="w-28 h-8 rounded ar-shimmer" />
        <div className="w-20 h-8 rounded ar-shimmer" />
        <div className="w-24 h-8 rounded ar-shimmer" />
      </div>

      {/* Main Settings Panel */}
      <div className="bg-white border border-border rounded-xl p-5 md:p-6 shadow-sm space-y-6">
        {/* Profile/Photo Upload Section */}
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

        {/* Input Fields Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="w-20 h-3 rounded ar-shimmer" />
              <div className="w-full h-10 rounded-lg border border-border ar-shimmer opacity-40" />
            </div>
          ))}
        </div>

        {/* Save button */}
        <div className="flex justify-end pt-4 border-t border-border">
          <div className="w-32 h-10 rounded-lg ar-shimmer" />
        </div>
      </div>
    </div>
  );
}

/**
 * Premium Audit Logs Page Skeleton
 */
export function AuditLogsSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-6">
      {/* Stats Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Filters row */}
      <div className="bg-white border border-border rounded-xl p-4 flex flex-wrap items-end gap-3 shadow-sm">
        <div className="w-48 h-10 rounded-lg border border-border ar-shimmer opacity-40" />
        <div className="w-36 h-10 rounded-lg border border-border ar-shimmer opacity-40" />
        <div className="w-36 h-10 rounded-lg border border-border ar-shimmer opacity-40" />
      </div>

      {/* Table */}
      <AttendanceTableSkeleton />
    </div>
  );
}

/**
 * Premium DashboardSkeleton Component
 */
export function DashboardSkeleton({ page, role }: DashboardSkeletonProps) {
  // If it's the main dashboard page, show role-specific structures
  if (page === 'dashboard') {
    if (role === 'admin') {
      return (
        <div className="p-4 md:p-6 lg:p-7 space-y-5">
          {/* Top 4 stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>

          {/* Map + Online List */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3">
              <MapSkeleton />
            </div>
            <div className="lg:col-span-2">
              <OnlineRidersSkeleton />
            </div>
          </div>

          {/* Bottom logs + feed */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3">
              <AttendanceTableSkeleton />
            </div>
            <div className="lg:col-span-2">
              <ViolationFeedSkeleton />
            </div>
          </div>
        </div>
      );
    }

    if (role === 'hr') {
      return (
        <div className="p-4 md:p-6 lg:p-7 space-y-5">
          {/* Today's KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-panel-bg ar-shimmer shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="w-32 h-3.5 rounded ar-shimmer" />
                  <div className="w-20 h-2.5 rounded ar-shimmer" />
                </div>
                <div className="w-4 h-4 ar-shimmer shrink-0" />
              </div>
            ))}
          </div>

          {/* Attendance Overview Card */}
          <HRAttendanceOverviewSkeleton />

          {/* Rider Status Cards Grid */}
          <RiderStatusGridSkeleton />

          {/* Violation Summary */}
          <HRViolationSummarySkeleton />
        </div>
      );
    }

    if (role === 'payroll') {
      return (
        <div className="p-4 md:p-6 lg:p-7 space-y-5">
          {/* Read-only warning banner */}
          <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg border border-primary/30 bg-accent ar-shimmer opacity-50">
            <div className="w-4 h-4 rounded ar-shimmer shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <div className="w-32 h-3 rounded ar-shimmer" />
              <div className="w-full h-3 rounded ar-shimmer" />
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>

          {/* Cutoff period selector */}
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

          {/* Detailed timeline + activity skeleton */}
          <PayrollDashboardOverviewSkeleton />
        </div>
      );
    }

    if (role === 'rider') {
      return (
        <div className="p-4 md:p-6 lg:p-7 max-w-6xl mx-auto space-y-5">
          {/* Identity banner skeleton */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/30 via-white to-white p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2 flex-1">
                <div className="w-24 h-3 rounded ar-shimmer" />
                <div className="w-48 h-8 rounded ar-shimmer animate-pulse" />
                <div className="w-36 h-3.5 rounded ar-shimmer" />
              </div>
              <div className="flex gap-2">
                <div className="w-28 h-8 rounded-full ar-shimmer" />
                <div className="w-24 h-8 rounded-full ar-shimmer" />
                <div className="w-24 h-8 rounded-full ar-shimmer" />
              </div>
            </div>
          </div>

          {/* Time-In/Out hero panel */}
          <div className="bg-white border border-border rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center space-y-4 shadow-sm">
            <div className="w-36 h-3.5 rounded ar-shimmer mx-auto" />
            <div className="w-32 h-32 rounded-full ar-shimmer" />
            <div className="w-48 h-10 rounded-lg ar-shimmer" />
          </div>

          {/* My Location & Geofence map */}
          <div className="bg-white border border-border rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <div className="w-24 h-4 rounded ar-shimmer" />
                <div className="w-36 h-3 rounded ar-shimmer" />
              </div>
              <div className="w-28 h-3 rounded ar-shimmer" />
            </div>
            <div className="h-[320px] rounded-xl ar-shimmer opacity-40" />
            <div className="w-full h-8 rounded-lg ar-shimmer" />
          </div>

          {/* Today's Activity */}
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <div className="w-32 h-4 rounded ar-shimmer" />
                <div className="w-48 h-3 rounded ar-shimmer" />
              </div>
              <div className="w-16 h-3 rounded ar-shimmer" />
            </div>
            <div className="pl-6 space-y-4 relative">
              <div className="absolute left-[10px] top-1 bottom-1 w-px bg-border" />
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex gap-3 relative">
                  <div className="absolute -left-6 mt-1 w-5 h-5 rounded-full border border-border bg-white ar-shimmer" />
                  <div className="w-14 h-3.5 rounded ar-shimmer shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="w-28 h-3.5 rounded ar-shimmer" />
                    <div className="w-40 h-3 rounded ar-shimmer" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Personal Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="relative overflow-hidden rounded-2xl border border-border bg-white p-5 shadow-sm">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-border" />
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2 flex-1">
                    <div className="w-24 h-3 rounded ar-shimmer" />
                    <div className="w-16 h-8 rounded ar-shimmer mt-1" />
                  </div>
                  <div className="w-9 h-9 rounded-lg ar-shimmer shrink-0" />
                </div>
                <div className="w-28 h-3 rounded ar-shimmer mt-2" />
              </div>
            ))}
          </div>

          {/* My Earnings & Payslips Portal */}
          <div className="rounded-2xl border border-border bg-white p-5 space-y-4 shadow-sm">
            <div className="flex justify-between items-center pb-3 border-b border-border">
              <div className="space-y-1">
                <div className="w-40 h-4.5 rounded ar-shimmer" />
                <div className="w-48 h-3 rounded ar-shimmer" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-border bg-panel-bg/50 flex flex-col justify-between space-y-3 h-44">
                <div className="space-y-2">
                  <div className="w-16 h-4 rounded ar-shimmer" />
                  <div className="w-28 h-4.5 rounded ar-shimmer" />
                  <div className="w-32 h-6 rounded ar-shimmer" />
                </div>
                <div className="w-24 h-4.5 rounded ar-shimmer" />
              </div>
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="p-3 rounded-lg border border-border bg-white flex items-center justify-between">
                    <div className="space-y-1.5 flex-1">
                      <div className="w-32 h-3.5 rounded ar-shimmer" />
                      <div className="w-24 h-2.5 rounded ar-shimmer" />
                    </div>
                    <div className="w-16 h-7 rounded-md bg-primary/10 ar-shimmer shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  // Page-specific layouts
  if (page === 'monitoring') {
    return <LiveMonitoringSkeleton />;
  }

  if (page === 'geofence') {
    return <GeofenceSkeleton />;
  }

  if (page === 'attendance') {
    return (
      <div className="p-4 md:p-6 lg:p-7 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        {/* Filter / Selector */}
        <div className="bg-white border border-border rounded-xl p-4 flex flex-wrap items-end gap-3 shadow-sm">
          <div className="w-32 h-8 rounded ar-shimmer" />
          <div className="w-24 h-8 rounded ar-shimmer" />
        </div>
        {/* Main Table */}
        <AttendanceTableSkeleton />
      </div>
    );
  }

  if (page === 'computation') {
    return (
      <div className="p-4 md:p-6 lg:p-7 space-y-5">
        {/* Header/Cutoff Selector Card */}
        <div className="bg-white border border-border rounded-xl p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg ar-shimmer shrink-0" />
            <div className="space-y-1.5">
              <div className="w-24 h-2.5 rounded ar-shimmer" />
              <div className="w-32 h-3.5 rounded ar-shimmer" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-28 h-9 rounded-md ar-shimmer" />
            <div className="w-20 h-9 rounded-md ar-shimmer" />
            <div className="w-28 h-9 rounded-md ar-shimmer" />
          </div>
        </div>
        {/* Main Table */}
        <AttendanceTableSkeleton />
      </div>
    );
  }

  if (page === 'payroll') {
    if (role === 'admin' || role === 'hr') {
      return (
        <div className="p-4 md:p-6 lg:p-7 space-y-5">
          {/* Banner */}
          <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg border border-primary/30 bg-accent ar-shimmer opacity-50">
            <div className="w-4 h-4 rounded ar-shimmer shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <div className="w-32 h-3 rounded ar-shimmer" />
              <div className="w-full h-3 rounded ar-shimmer" />
            </div>
          </div>

          {/* Stat cards (5 cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>

          {/* Date Pickers */}
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

          {/* Rider Payroll List Table */}
          <AttendanceTableSkeleton />
        </div>
      );
    }
  }

  if (page === 'users') {
    return (
      <div className="p-4 md:p-6 lg:p-7 space-y-5">
        {/* Header */}
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
        {/* Filters */}
        <div className="bg-white border border-border rounded-xl p-3 flex flex-wrap gap-2 items-center shadow-sm">
          <div className="w-48 h-8 rounded ar-shimmer" />
          <div className="w-32 h-8 rounded ar-shimmer" />
        </div>
        {/* Main Table */}
        <AttendanceTableSkeleton />
      </div>
    );
  }

  if (page === 'reports') {
    if (role === 'payroll') {
      return <PayrollReportsSkeleton />;
    }
    return (
      <div className="p-4 md:p-6 lg:p-7">
        <ChartsGridSkeleton />
      </div>
    );
  }

  if (page === 'reviews') {
    return (
      <div className="p-4 md:p-6 lg:p-7 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-1">
            <div className="w-48 h-5 rounded ar-shimmer" />
            <div className="w-64 h-3.5 rounded ar-shimmer" />
          </div>
        </div>
        {/* Tabs / Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-2 rounded-xl border border-border shadow-xs">
          <div className="flex gap-1">
            <div className="w-32 h-8 rounded ar-shimmer" />
            <div className="w-32 h-8 rounded ar-shimmer" />
          </div>
          <div className="w-24 h-4 rounded ar-shimmer" />
        </div>
        {/* Main Reviews Grid */}
        <ReviewsSkeleton />
      </div>
    );
  }

  if (page === 'settings') {
    return <SettingsSkeleton />;
  }

  if (page === 'audit_logs') {
    return <AuditLogsSkeleton />;
  }

  if (page === 'profile') {
    return (
      <div className="p-4 md:p-6 lg:p-7">
        <ProfileSkeleton />
      </div>
    );
  }

  // Fallback generic card grid skeleton
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white border border-border rounded-xl p-5 space-y-3 shadow-sm">
            <div className="w-1/2 h-4 rounded ar-shimmer" />
            <div className="w-3/4 h-3 rounded ar-shimmer" />
            <div className="w-full h-[120px] rounded ar-shimmer opacity-30 mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

