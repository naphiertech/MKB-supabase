import { type PageKey } from './Sidebar';
import { type RiderPageKey } from '../rider/RiderTopNav';

// Shared Primitives
import {
  SkeletonBlock,
  SkeletonPage,
  SkeletonText,
  SkeletonStatCard,
  SkeletonTable,
  SkeletonMap
} from './SkeletonPrimitives';

// Common Skeletons
import { LoginSkeleton } from './LoginSkeleton';
import { AuditLogsSkeleton } from './AuditLogsSkeleton';
import { ReviewsSkeleton } from './ReviewsSkeleton';

// Domain Skeletons
import { AdminDashboardSkeleton, OnlineRidersSkeleton, ViolationFeedSkeleton } from '../dashboard/AdminDashboardSkeleton';
import { HRDashboardSkeleton, RiderStatusGridSkeleton, HRViolationSummarySkeleton } from '../hr/HRDashboardSkeleton';
import { AttendanceSkeleton } from '../attendance/AttendanceSkeleton';
import { GeofenceSkeleton } from '../geofence/GeofenceSkeleton';
import { LiveMonitoringSkeleton } from '../monitoring/LiveMonitoringSkeleton';
import {
  PayrollDashboardSkeleton,
  PayrollDashboardOverviewSkeleton,
  SalaryComputationSkeleton,
  PayrollReportsSkeleton,
  PayrollChecklistSkeleton,
  DailyParcelEntrySkeleton,
  ParcelHistorySkeleton,
  PayrollHistorySkeleton
} from '../payroll/PayrollDashboardSkeleton';
import { ReportsSkeleton, ChartsGridSkeleton } from '../reports/ReportsSkeleton';
import { RiderDashboardSkeleton } from '../rider/RiderDashboardSkeleton';
import { RiderProfileSkeleton } from '../rider/RiderProfileSkeleton';
import { SettingsSkeleton } from '../settings/SettingsSkeleton';
import { UsersSkeleton } from '../users/UsersSkeleton';
import { HubManagementSkeleton } from '../hubs/HubManagementSkeleton';
import { RiderAssignmentsSkeleton } from '../assignments/RiderAssignmentsSkeleton';
import { RiderAttendanceSkeleton, RiderMonitoringSkeleton } from '../rider/RiderRouteSkeletons';

// Re-export all skeletons for public API compatibility
export {
  LoginSkeleton,
  AuditLogsSkeleton,
  ReviewsSkeleton,
  AdminDashboardSkeleton,
  OnlineRidersSkeleton,
  ViolationFeedSkeleton,
  HRDashboardSkeleton,
  RiderStatusGridSkeleton,
  HRViolationSummarySkeleton,
  AttendanceSkeleton,
  GeofenceSkeleton,
  LiveMonitoringSkeleton,
  PayrollDashboardSkeleton,
  PayrollDashboardOverviewSkeleton,
  SalaryComputationSkeleton,
  PayrollReportsSkeleton,
  PayrollChecklistSkeleton,
  DailyParcelEntrySkeleton,
  ParcelHistorySkeleton,
  PayrollHistorySkeleton,
  ReportsSkeleton,
  ChartsGridSkeleton,
  RiderDashboardSkeleton,
  RiderProfileSkeleton,
  RiderProfileSkeleton as ProfileSkeleton,
  SettingsSkeleton,
  UsersSkeleton,
  HubManagementSkeleton,
  RiderAssignmentsSkeleton,
  RiderAttendanceSkeleton,
  RiderMonitoringSkeleton,
  SkeletonStatCard as StatCardSkeleton,
  SkeletonMap as MapSkeleton,
  SkeletonTable as AttendanceTableSkeleton,
  SkeletonBlock,
  SkeletonPage,
  SkeletonText,
  SkeletonStatCard,
  SkeletonTable,
  SkeletonMap
};

export interface DashboardSkeletonProps {
  page: PageKey | RiderPageKey;
  role: 'admin' | 'hr' | 'payroll' | 'rider';
}

/**
 * Public Coordinator & Dispatcher for Loading Skeletons
 */
export function DashboardSkeleton({ page, role }: DashboardSkeletonProps) {
  // Main Dashboard route dispatcher
  if (page === 'dashboard') {
    if (role === 'admin') return <AdminDashboardSkeleton />;
    if (role === 'hr') return <HRDashboardSkeleton />;
    if (role === 'payroll') return <PayrollDashboardSkeleton />;
    if (role === 'rider') return <RiderDashboardSkeleton />;
  }

  // Feature page dispatchers
  switch (page) {
    case 'monitoring':
      return role === 'rider' ? <RiderMonitoringSkeleton /> : <LiveMonitoringSkeleton />;

    case 'geofence':
      return <GeofenceSkeleton />;

    case 'attendance':
      return role === 'rider' ? <RiderAttendanceSkeleton /> : <AttendanceSkeleton />;

    case 'computation':
      return <SalaryComputationSkeleton />;

    case 'payroll':
      return role === 'payroll' ? <PayrollDashboardSkeleton /> : <PayrollChecklistSkeleton />;

    case 'daily_parcels':
      return <DailyParcelEntrySkeleton />;

    case 'parcel_history':
      return <ParcelHistorySkeleton />;

    case 'payroll_history':
      return <PayrollHistorySkeleton />;

    case 'users':
      return <UsersSkeleton />;

    case 'hubs':
      return <HubManagementSkeleton />;

    case 'rider_assignments':
      return <RiderAssignmentsSkeleton />;

    case 'reports':
      return role === 'payroll' ? <PayrollReportsSkeleton /> : <ReportsSkeleton />;

    case 'reviews':
      return <ReviewsSkeleton />;

    case 'settings':
      return <SettingsSkeleton />;

    case 'audit_logs':
      return <AuditLogsSkeleton />;

    case 'profile':
      return <RiderProfileSkeleton />;

    default:
      return (
        <SkeletonPage className="space-y-5" label="Loading dashboard module">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-border rounded-xl p-5 space-y-3 shadow-sm">
                <div className="w-1/2 h-4 rounded ar-shimmer" />
                <div className="w-3/4 h-3 rounded ar-shimmer" />
                <div className="w-full h-[120px] rounded ar-shimmer opacity-30 mt-2" />
              </div>
            ))}
          </div>
        </SkeletonPage>
      );
  }
}
