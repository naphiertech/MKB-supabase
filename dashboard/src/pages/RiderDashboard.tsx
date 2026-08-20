import { useEffect, useRef, useState } from 'react';
import {
  getRiderPayrollHistory,
  cacheRiderFaceDescriptor,
  getRiderViolationsForMonth
} from '../services/riderService';
import { setCachedDescriptor } from '../lib/descriptorCache';
import { preloadBiometrics, releaseBiometrics } from '../lib/faceAi';
import {
  BIOMETRIC_TIMING_NAMES,
  biometricTelemetry,
  observeBiometricPreloadLongTasks,
} from '../lib/biometricTelemetry';
import {
  biometricPreloadPriority,
  scheduleBiometricPreload,
  waitForBrowserIdle,
} from '../lib/biometricPreloadScheduler';
import { Modal } from '../components/common/Modal';
import { FaceScanner } from '../components/attendance/FaceScanner';
import { AttendanceButton } from '../components/attendance/AttendanceButton';
import { AttendanceStatus } from '../components/attendance/AttendanceStatus';
import { RiderMap } from '../components/maps/RiderMap';
import { IdentityBanner } from '../components/rider/IdentityBanner';
import { GeofenceStatus } from '../components/rider/GeofenceStatus';
import {
  ActivityTimeline,
  type ActivityEvent } from
'../components/rider/ActivityTimeline';
import { PersonalStats } from '../components/rider/PersonalStats';
import { DashboardSkeleton } from '../components/common/DashboardSkeleton';
import { PayrollDetailsModal } from '../components/payroll/PayrollDetailsModal';
import { AnimatePresence } from 'framer-motion';
import {
  buildWeeklyBreakdown,
  format12h,
  getLocalDateString,
  nowHHMM,
  toHHMM,
  type DashboardViolation,
} from './rider-dashboard/riderDashboardModel';
import { useRiderDashboardData } from './rider-dashboard/useRiderDashboardData';
import { useRiderShiftController } from './rider-dashboard/useRiderShiftController';

interface RiderDashboardProps {
  userId: string;
  riderId: string;
  restricted: boolean;
}

interface PayrollRecord {
  id: string;
  rider_id: string;
  cutoff_start: string;
  cutoff_end: string;
  total_parcels: number;
  rate_per_parcel: number | null;
  gross_pay: number | null;
  status: string;
  created_at?: string;
  riders: {
    id?: string;
    name: string;
    mkb_id: string;
    face_image_url?: string | null;
    avatar_url?: string | null;
    zones?: { name: string } | null;
    shift?: string | null;
  } | null;
}

export function RiderDashboard({ userId, riderId, restricted }: RiderDashboardProps) {
  const {
    actualRiderId,
    rider,
    zone,
    loading,
    attendance,
    activeViolation,
    stats,
    monthAttendanceLogs,
    reload: loadRiderAndZone,
    updateRiderFaceDescriptor,
  } = useRiderDashboardData({ userId, riderId });
  const { timeIn, timeOut } = attendance;
  const [violationsList, setViolationsList] = useState<DashboardViolation[]>([]);
  const [loadingViolations, setLoadingViolations] = useState(false);
  const [activeStatModal, setActiveStatModal] = useState<'days' | 'hours' | 'violations' | null>(null);
  const violationRequestRef = useRef(0);

  // Rider Payroll States
  const [myPayrollRecords, setMyPayrollRecords] = useState<PayrollRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [isPayslipOpen, setIsPayslipOpen] = useState(false);

  // Load Rider's Payroll Records
  useEffect(() => {
    if (!actualRiderId || restricted) {
      setMyPayrollRecords([]);
      setSelectedRecord(null);
      setIsPayslipOpen(false);
      return;
    }
    let active = true;
    const loadPayroll = async () => {
      try {
        const data = await getRiderPayrollHistory(actualRiderId);
        if (!active) return;
        setMyPayrollRecords(data as unknown as PayrollRecord[]);
      } catch (err) {
        if (!active) return;
        console.error('Failed to load payroll records:', err);
      }
    };
    loadPayroll();
    return () => {
      active = false;
    };
  }, [actualRiderId, restricted]);

  useEffect(() => () => {
    violationRequestRef.current += 1;
  }, [actualRiderId]);

  const handleViolationsClick = async () => {
    setActiveStatModal('violations');
    if (!actualRiderId) return;
    const requestId = ++violationRequestRef.current;
    const ownsRequest = () => violationRequestRef.current === requestId;
    try {
      setLoadingViolations(true);
      const todayDate = new Date();
      const firstDayOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
      const firstDayStr = getLocalDateString(firstDayOfMonth);
      const data = await getRiderViolationsForMonth(actualRiderId, firstDayStr);
      if (!ownsRequest()) return;
      setViolationsList(data);
    } catch (err) {
      if (!ownsRequest()) return;
      console.error('Failed to load violations:', err);
    } finally {
      if (ownsRequest()) setLoadingViolations(false);
    }
  };

  // Background Biometrics Pre-warming (decoupled from initial page render)
  useEffect(() => {
    if (loading) return;

    const observedAt = performance.now();
    biometricTelemetry.record(BIOMETRIC_TIMING_NAMES.dashboardInteractive, 0, observedAt);
    biometricTelemetry.record(BIOMETRIC_TIMING_NAMES.preloadScheduled, 0, observedAt);

    return scheduleBiometricPreload(async () => {
      if (!biometricPreloadPriority.canContinueBackground()) return;

      console.log('[RiderDashboard] Dashboard idle. Starting biometrics background pre-warming...');
      biometricTelemetry.record(BIOMETRIC_TIMING_NAMES.preloadStarted, 0);
      const stopLongTaskObserver = observeBiometricPreloadLongTasks();

      try {
        await preloadBiometrics({
          beforeStage: () => waitForBrowserIdle(),
          canContinue: biometricPreloadPriority.canContinueBackground,
        });
      } catch (err) {
        console.warn('[RiderDashboard] Background biometrics preloading exception:', err);
      } finally {
        stopLongTaskObserver();
        biometricTelemetry.record(BIOMETRIC_TIMING_NAMES.preloadComplete, 0);
      }
    });
  }, [loading]);

  // Tab Inactivity Geolocation/Biometrics Resource Cleanup
  useEffect(() => {
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is minimized or hidden. Release transient MediaPipe resources after 3 minutes.
        inactivityTimer = setTimeout(async () => {
          console.log('[RiderDashboard] Tab hidden for 3 minutes. Releasing transient biometric resources...');
          await releaseBiometrics();
        }, 180000);
      } else {
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
          inactivityTimer = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const [events, setEvents] = useState<ActivityEvent[]>([]);

  const {
    action,
    canTimeIn,
    onlineStatus,
    duration,
    location: {
      position,
      positionToUse,
      distance: distanceToUse,
      inZone: inZoneToUse,
      error: locationError,
      isLoading: locationLoading,
      hasVerifiedPosition,
      retry: retryLocation,
      zoneName,
      zoneRadius,
    },
    scanner: {
      open: scanOpen,
      setOpen: setScanOpen,
      pendingAction,
      openScan,
      phase,
      progress,
      result,
      start,
      reset,
      videoRef,
      canvasRef,
      livenessPrompt,
      debugInfo,
    },
  } = useRiderShiftController({
    userId,
    restricted,
    actualRiderId,
    rider,
    zone,
    attendance,
    activeViolation,
    loading,
    reload: loadRiderAndZone,
    onDescriptorCalculated: async (descriptor) => {
      if (!actualRiderId || restricted) return;
      console.debug('[RiderDashboard] Saving fallback face descriptor to database.');
      try {
        await cacheRiderFaceDescriptor(actualRiderId, descriptor);
        setCachedDescriptor(actualRiderId, descriptor, rider?.avatar);
        console.log('[RiderDashboard] Successfully cached face descriptor to Supabase.');
        updateRiderFaceDescriptor(descriptor);
      } catch (err) {
        console.error('[RiderDashboard] Exception while caching face descriptor:', err);
      }
    },
    setEvents,
  });

  if (loading || !rider || !zone) {
    return <DashboardSkeleton page="dashboard" role="rider" />;
  }

  const today = new Date();
  const monthDays = today.getDate();
  const daysPresent = stats.daysPresent;
  const hoursThisWeek = stats.hoursThisWeek;
  const violationsThisMonth = stats.violationsThisMonth;

  return (
    <div className="p-4 md:p-6 lg:p-7 max-w-6xl mx-auto space-y-5">
      {/* 1. Identity banner */}
      <IdentityBanner
        name={rider.name}
        zoneName={zoneName}
        date={today}
        onlineStatus={onlineStatus} />

      {restricted && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Restricted account.</span> You can sign in and review your profile, but attendance, operational GPS, workforce changes, offline replay, and payroll downloads are disabled until full access is restored.
        </div>
      )}

      {/* 2. Time-In/Out hero panel */}
      <section className="rounded-2xl border border-border bg-white p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-5">
          <div className="text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">
            Attendance · Face Verified
          </div>
          <h2 className="text-foreground font-semibold text-lg sm:text-xl tracking-tight mt-1">
            {action === 'closed' ?
              "Today's attendance has already been finalized." :
              action === 'time-in' ?
                'Ready to clock in?' :
                action === 'time-out' ?
                  "Wrapping up? Let's clock you out." :
                  'You are all done for today.'}
          </h2>
        </div>

        <AttendanceButton
          action={action}
          disabled={restricted || (action === 'time-in' && !canTimeIn)}
          onClick={() =>
            openScan(action === 'time-out' ? 'time-out' : 'time-in')
          } />

        {action === 'time-in' && locationLoading && !hasVerifiedPosition && (
          <p className="text-center text-xs text-primary animate-pulse mt-3 font-mono">
            Waiting for GPS coordinates lock...
          </p>
        )}

        {action === 'time-in' && locationError && !canTimeIn && (
          <div className="mx-auto mt-3 max-w-md rounded-lg border border-red-200 bg-red-50 p-3 text-center">
            <p className="text-xs font-medium text-red-700">
              Real GPS is unavailable. Enable precise location access before recording Time In.
            </p>
            <button
              type="button"
              onClick={retryLocation}
              className="mt-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Retry GPS
            </button>
          </div>
        )}

        <div className="mt-6">
          <AttendanceStatus
            timeIn={timeIn ? format12h(timeIn) : null}
            timeOut={timeOut ? format12h(timeOut) : null}
            duration={duration} />
        </div>
      </section>

      {/* 3. My Location & Geofence */}
      <section className="rounded-2xl border border-border bg-white p-5 space-y-4 shadow-sm">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-foreground font-semibold text-base">
              My Location
            </h2>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              Live GPS · {zoneName} geofence ({zoneRadius}m)
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-mono">
            {hasVerifiedPosition ? `Accuracy ±${Math.round(position.accuracy)}m` : 'GPS unavailable'}
          </span>
        </header>

        {locationLoading && !hasVerifiedPosition ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-accent/40 animate-pulse sm:h-[320px]">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-primary animate-bounce"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <span className="text-muted-foreground text-sm font-medium">Acquiring live GPS signal...</span>
          </div>
        ) : locationError && !hasVerifiedPosition ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 text-center sm:h-[320px] sm:px-6">
            <span className="text-sm font-semibold text-red-700">Live location unavailable</span>
            <span className="max-w-md text-xs text-red-600">
              No coordinates are being recorded. Enable location permission and precise GPS, then retry.
            </span>
            <button
              type="button"
              onClick={retryLocation}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Retry GPS
            </button>
          </div>
        ) : (
          <>
            <RiderMap
              position={positionToUse}
              zone={zone}
              inZone={inZoneToUse}
              height="320px" />

            {(!timeIn || timeOut) && !activeViolation ? null : (
              <GeofenceStatus
                inZone={inZoneToUse}
                zoneName={zoneName}
                distance={distanceToUse}
                radius={zoneRadius} />
            )}
          </>
        )}
      </section>

      {/* 4. Activity + 5. Stats */}
      <ActivityTimeline events={events} />

      <PersonalStats
        daysPresent={daysPresent}
        monthDays={monthDays}
        hoursThisWeek={hoursThisWeek}
        violationsThisMonth={violationsThisMonth}
        onDaysClick={() => setActiveStatModal('days')}
        onHoursClick={() => setActiveStatModal('hours')}
        onViolationsClick={handleViolationsClick} />

      {/* 5. My Earnings & Payslips Portal */}
      <section className="rounded-2xl border border-border bg-white p-5 space-y-4 shadow-sm">
        <header className="flex items-center justify-between pb-3 border-b border-border">
          <div>
            <h2 className="text-foreground font-semibold text-base flex items-center gap-2">
              <span className="p-1 rounded-md bg-accent text-primary shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M2.5 4A1.5 1.5 0 001 5.5V6h18v-.5A1.5 1.5 0 0017.5 4h-15zM19 8.5H1v6A1.5 1.5 0 002.5 16h15a1.5 1.5 0 001.5-1.5v-6zM3 11.25a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75zm3.75-1.5a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z" clipRule="evenodd" />
                </svg>
              </span>
              My Earnings & Payslips
            </h2>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              Cutoff earnings progress and historical payslips
            </p>
          </div>
        </header>

        {myPayrollRecords.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground italic">
            No payroll records generated yet. Once the payroll cutoff ends, your payslips will appear here.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Active/Latest Cutoff Progress Card */}
            {myPayrollRecords[0] && (
              <div className="p-4 rounded-xl border border-border bg-panel-bg/50 flex flex-col justify-between space-y-3">
                <div>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                    myPayrollRecords[0].status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                    myPayrollRecords[0].status === 'approved' ? 'bg-sky-50 text-sky-700' :
                    'bg-amber-50 text-amber-700'
                  }`}>
                    {myPayrollRecords[0].status === 'paid' ? 'Paid' :
                     myPayrollRecords[0].status === 'approved' ? 'Approved' : 'Pending Verification'}
                  </span>
                  
                  <div className="text-[11px] font-mono text-muted-foreground mt-1.5">
                    Current Period
                  </div>
                  <div className="text-sm font-bold text-foreground">
                    {new Date(myPayrollRecords[0].cutoff_start).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – {new Date(myPayrollRecords[0].cutoff_end).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>

                <div className="flex items-baseline justify-between border-t border-border pt-3">
                  <div>
                    <div className="text-[10.5px] text-muted-foreground font-mono">Delivered Parcels</div>
                    <div className="text-base font-bold text-foreground font-mono">{myPayrollRecords[0].total_parcels} pcs</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10.5px] text-muted-foreground font-mono">Estimated Wage</div>
                    <div className="text-xl font-bold text-primary font-mono">
                      {myPayrollRecords[0].gross_pay != null
                        ? `₱${myPayrollRecords[0].gross_pay.toLocaleString()}`
                        : myPayrollRecords[0].rate_per_parcel != null
                          ? `₱${(myPayrollRecords[0].total_parcels * myPayrollRecords[0].rate_per_parcel).toLocaleString()}`
                          : <span className="text-sm text-red-700">Rate requires review</span>}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedRecord(myPayrollRecords[0]);
                    setIsPayslipOpen(true);
                  }}
                  className="w-full h-8 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition shadow-sm cursor-pointer"
                >
                  View Cutoff Details
                </button>
              </div>
            )}

            {/* History of Payslips */}
            <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-bold font-mono">
                Past Payslips
              </div>
              {myPayrollRecords.slice(1).length === 0 ? (
                <div className="text-xs text-subtle-text italic py-8 text-center">
                  No previous payslips logged.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {myPayrollRecords.slice(1).map((rec) => (
                    <div
                      key={rec.id}
                      onClick={() => {
                        setSelectedRecord(rec);
                        setIsPayslipOpen(true);
                      }}
                      className="p-2.5 rounded-lg border border-border hover:bg-panel-bg transition cursor-pointer flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-foreground">
                          {new Date(rec.cutoff_start).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – {new Date(rec.cutoff_end).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {rec.total_parcels} pcs delivered
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold font-mono text-foreground">
                          {rec.gross_pay != null
                            ? `₱${rec.gross_pay.toLocaleString()}`
                            : rec.rate_per_parcel != null
                              ? `₱${(rec.total_parcels * rec.rate_per_parcel).toLocaleString()}`
                              : 'Rate requires review'}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          rec.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                          rec.status === 'approved' ? 'bg-sky-50 text-sky-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {rec.status === 'paid' ? 'Paid' :
                           rec.status === 'approved' ? 'Approved' : 'Verified'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <AnimatePresence>
        {isPayslipOpen && selectedRecord && (
          <PayrollDetailsModal
            isOpen={isPayslipOpen}
            onClose={() => setIsPayslipOpen(false)}
            record={selectedRecord}
            role="rider"
          />
        )}
      </AnimatePresence>

      {/* Face-scan modal */}
      <Modal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        title={
          pendingAction === 'time-in' ?
            'Face Scan · Time-In' :
            'Face Scan · Time-Out'
        }
        subtitle="Hold still — verifying against your enrolled template."
        dismissible={phase !== 'scanning' && phase !== 'initializing'}
        size="md">

        <FaceScanner
          phase={phase}
          progress={progress}
          riderName={rider.name}
          riderAvatar={rider.avatar}
          confidence={result?.confidence}
          videoRef={videoRef}
          canvasRef={canvasRef}
          livenessPrompt={livenessPrompt}
          debugInfo={debugInfo} />

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground font-mono">
            {nowHHMM()} · {zoneName}
          </span>
          {phase === 'failed' ?
            <div className="flex gap-2">
              <button
                onClick={() => setScanOpen(false)}
                className="px-4 h-9 rounded-md text-sm text-foreground bg-panel-bg border border-border hover:bg-white hover:border-primary/30 transition-colors cursor-pointer">
                Cancel
              </button>
              <button
                onClick={() => {
                  reset();
                  start();
                }}
                className="px-4 h-9 rounded-md text-sm text-white bg-primary hover:bg-primary-hover transition-colors shadow-sm cursor-pointer">
                Retry scan
              </button>
            </div> :
            phase === 'matched' ?
              <button
                onClick={() => setScanOpen(false)}
                className="px-4 h-9 rounded-md text-sm text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer">
                Done
              </button> :
              <button
                onClick={() => setScanOpen(false)}
                disabled={phase === 'scanning' || phase === 'initializing'}
                className="px-4 h-9 rounded-md text-sm text-foreground bg-panel-bg border border-border hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer">
                Cancel
              </button>
          }
        </div>
      </Modal>

      {/* Attendance Days Modal */}
      <Modal
        open={activeStatModal === 'days'}
        onClose={() => setActiveStatModal(null)}
        title="Attendance Records · This Month"
        subtitle="Detailed log of your clock-ins, clock-outs, and daily status."
        size="lg"
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {monthAttendanceLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No attendance logs found for this month.
            </p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-white">
              {monthAttendanceLogs.map((log, index) => {
                const isLate = log.status === 'late';
                const isPresent = log.status === 'present';
                const isAbsent = log.status === 'absent';
                const isLeave = log.status === 'on_leave';
                
                let badgeClass = 'bg-gray-50 text-gray-700 border-gray-200';
                let badgeText = log.status;
                if (isPresent) {
                  badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/50';
                  badgeText = 'Present';
                } else if (isLate) {
                  badgeClass = 'bg-amber-50 text-amber-700 border-amber-200/50';
                  badgeText = 'Late';
                } else if (isAbsent) {
                  badgeClass = 'bg-red-50 text-red-700 border-red-200/50';
                  badgeText = 'Absent';
                } else if (isLeave) {
                  badgeClass = 'bg-blue-50 text-blue-700 border-blue-200/50';
                  badgeText = 'On Leave';
                }

                const d = new Date(log.date);
                const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

                return (
                  <div key={log.id || index} className="p-3.5 flex items-center justify-between text-sm hover:bg-panel-bg transition-colors">
                    <div>
                      <div className="font-semibold text-foreground">{dateLabel}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        {log.time_in ? format12h(toHHMM(log.time_in) || '00:00') : '—'} – {log.time_out ? format12h(toHHMM(log.time_out) || '00:00') : '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-md border text-xs font-medium uppercase tracking-wider ${badgeClass}`}>
                        {badgeText}
                      </span>
                      <span className="font-semibold font-mono text-sm text-foreground">
                        {log.hours ? `${log.hours.toFixed(1)} hrs` : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Weekly Hours Modal */}
      <Modal
        open={activeStatModal === 'hours'}
        onClose={() => setActiveStatModal(null)}
        title="Weekly Work Hours Breakdown"
        subtitle="Clock-in hours recorded day-by-day for the current week."
        size="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-accent border border-primary/20 rounded-xl flex items-center justify-between">
            <span className="text-xs font-semibold text-accent-foreground uppercase tracking-wider">
              Total Hours This Week
            </span>
            <span className="text-xl font-bold font-mono text-primary">
              {stats.hoursThisWeek.toFixed(1)} hrs
            </span>
          </div>

          <div className="space-y-3.5">
            {buildWeeklyBreakdown(monthAttendanceLogs).map((day, idx) => {
              const isFutureOrEmpty = day.hours === 0 && day.status === 'no_log';
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-foreground">
                      {day.name} <span className="text-muted-foreground font-mono font-normal">({day.dateLabel})</span>
                    </span>
                    <span className="font-semibold font-mono text-foreground">
                      {day.hours.toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${
                        isFutureOrEmpty
                          ? 'from-gray-300 to-gray-300'
                          : 'from-primary/60 to-primary'
                      }`}
                      style={{ width: `${Math.min(100, (day.hours / 8) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* Violations Details Modal */}
      <Modal
        open={activeStatModal === 'violations'}
        onClose={() => setActiveStatModal(null)}
        title="Geofence Violations Details"
        subtitle="Review of your geofence warning logs for this month."
        size="lg"
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {loadingViolations ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              <span className="text-xs text-muted-foreground font-medium font-mono animate-pulse">
                Fetching geofence log...
              </span>
            </div>
          ) : violationsList.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
              </div>
              <h3 className="text-sm font-semibold text-foreground">Clean Record</h3>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Excellent! You have zero geofence violations recorded for this month. Keep up the great work!
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {violationsList.map((v, idx) => {
                const date = new Date(v.created_at);
                const dateLabel = date.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                });

                return (
                  <div key={v.id || idx} className="p-3.5 rounded-xl border border-border bg-white hover:border-primary/30 hover:shadow-sm transition flex items-start gap-3">
                    <span className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${
                      v.resolved ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600 animate-pulse'
                    }`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          {v.type === 'boundary_exit' ? 'Boundary Exit Alert' : v.type === 'idle_timeout' ? 'Location Timeout' : 'Manual Flag'}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                          v.resolved ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {v.resolved ? 'Resolved' : 'Active'}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-medium">
                        Zone: {v.zone_name || 'Talon-Talon'}
                      </div>
                      <div className="text-[11px] text-muted-foreground/80 font-mono mt-0.5 flex items-center justify-between">
                        <span>{dateLabel}</span>
                        {v.lat && v.lng && (
                          <span>GPS: {v.lat.toFixed(5)}, {v.lng.toFixed(5)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>);
}
