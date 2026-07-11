import { useEffect, useMemo, useState, useRef } from 'react';
import {
  haversine,
  type Rider,
  type Zone } from
'../services/types';
import {
  getRiderPayrollHistory,
  cacheRiderFaceDescriptor,
  getRiderUserMapping,
  getRiderFullProfile,
  getRiderDashboardStats
} from '../services/riderService';
import { recordTimeIn, recordTimeOut } from '../services/attendanceService';
import { useRiderZone } from '../context/RiderZoneContext';
import { isPointInPolygon } from '../lib/geofenceUtils';
import { logRiderLocation, updateRiderStatus } from '../services/monitoringService';
import { useGeolocation } from '../hooks/useGeolocation';
import { useFaceRecognition } from '../hooks/useFaceRecognition';
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
import { pushToast } from '../hooks/useToast';
import { DashboardSkeleton } from '../components/common/DashboardSkeleton';
import { PayrollDetailsModal } from '../components/payroll/PayrollDetailsModal';
import { AnimatePresence } from 'framer-motion';

interface RiderDashboardProps {
  userId: string;
}

function nowHHMM(d: Date = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toHHMM(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const formatted = dateStr.includes(' ') && !dateStr.includes('T')
      ? dateStr.replace(' ', 'T')
      : dateStr;
    const d = new Date(formatted);
    if (isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

function format12h(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = (h + 11) % 12 + 1;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function diffPretty(fromHHMM: string, to: Date = new Date()) {
  const [h, m] = fromHHMM.split(':').map(Number);
  const start = new Date();
  start.setHours(h, m, 0, 0);
  let diff = Math.max(0, to.getTime() - start.getTime());
  const hours = Math.floor(diff / 3600000);
  diff -= hours * 3600000;
  const mins = Math.floor(diff / 60000);
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

function getLocalDateString(d: Date = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export function RiderDashboard({ userId }: RiderDashboardProps) {
  const { zones: allZones } = useRiderZone();
  const riderId = userId.replace(/^u-rider-/, '');
  const [actualRiderId, setActualRiderId] = useState<string>(riderId);
  const [rider, setRider] = useState<(Rider & { faceDescriptor?: number[] | null }) | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeViolation, setActiveViolation] = useState<{
    lat: number;
    lng: number;
    zoneName: string;
  } | null>(null);

  const [attendance, setAttendance] = useState<{
    timeIn: string | null;
    timeOut: string | null;
  }>({ timeIn: null, timeOut: null });
  const { timeIn, timeOut } = attendance;

  // Real Stats from Database
  const [stats, setStats] = useState({
    daysPresent: 0,
    hoursThisWeek: 0,
    violationsThisMonth: 0
  });

  // Rider Payroll States
  const [myPayrollRecords, setMyPayrollRecords] = useState<PayrollRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [isPayslipOpen, setIsPayslipOpen] = useState(false);

  // Load Rider's Payroll Records
  useEffect(() => {
    if (!actualRiderId) return;
    const loadPayroll = async () => {
      try {
        const data = await getRiderPayrollHistory(actualRiderId);
        setMyPayrollRecords(data as unknown as PayrollRecord[]);
      } catch (err) {
        console.error('Failed to load payroll records:', err);
      }
    };
    loadPayroll();
  }, [actualRiderId]);
  const [scanOpen, setScanOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'time-in' | 'time-out'>('time-in');

  const { phase, progress, result, start, reset, videoRef, canvasRef, livenessPrompt, debugInfo } = useFaceRecognition({
    referenceAvatar: rider?.avatar,
    referenceDescriptor: rider?.faceDescriptor,
    onDescriptorCalculated: async (descriptor) => {
      if (!actualRiderId) return;
      console.log('[RiderDashboard] Fallback calculated face descriptor. Saving to database...', actualRiderId);
      try {
        await cacheRiderFaceDescriptor(actualRiderId, descriptor);
        console.log('[RiderDashboard] Successfully cached face descriptor to Supabase.');
        setRider(prev => prev ? { ...prev, faceDescriptor: descriptor } : null);
      } catch (err) {
        console.error('[RiderDashboard] Exception while caching face descriptor:', err);
      }
    }
  });

  useEffect(() => {
    async function loadRiderAndZone() {
      try {
        setLoading(true);

        // Retrieve the linked rider_id using the logged-in Auth UUID
        const dbUser = await getRiderUserMapping(userId);

        const resolvedRiderId = dbUser?.rider_id || riderId;
        setActualRiderId(resolvedRiderId);

        const dbRider = await getRiderFullProfile(resolvedRiderId);

        if (dbRider) {
          const mappedRider: Rider & { faceDescriptor?: number[] | null } = {
            id: dbRider.id,
            name: dbRider.name,
            avatar: dbRider.face_image_url || dbRider.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(dbRider.name)}`,
            zoneId: dbRider.zone_id,
            status: dbRider.status,
            lat: dbRider.lat || 0,
            lng: dbRider.lng || 0,
            speed: dbRider.speed || 0,
            shift: (dbRider.shift || 'Morning').toLowerCase() as 'morning' | 'afternoon' | 'evening',
            lastPing: dbRider.last_ping ? new Date(dbRider.last_ping).getTime() : 0,
            phone: dbRider.contact || '',
            riderCode: dbRider.mkb_id,
            faceDescriptor: dbRider.face_descriptor || null
          };
          setRider(mappedRider);

          const resolvedZone = allZones.find(z => z.id === dbRider.zone_id) || allZones[0];
          if (resolvedZone) {
            setZone(resolvedZone);
          }

          // Fetch attendance logs for today using the resolved Rider UUID
          const todayStr = getLocalDateString();

          // Load real stats for the current month
          const todayDate = new Date();
          const firstDayOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
          const firstDayStr = getLocalDateString(firstDayOfMonth);
          
          const dayOfWeek = todayDate.getDay();
          const diff = todayDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday is start of week
          const firstDayOfWeek = new Date(todayDate.setDate(diff));
          const firstDayOfWeekStr = getLocalDateString(firstDayOfWeek);

          const {
            todayAttendance: attLog,
            latestViolation: violationData,
            monthAttendance: monthLogs,
            monthViolationCount: violationCount
          } = await getRiderDashboardStats(
            resolvedRiderId,
            todayStr,
            firstDayStr,
            firstDayOfMonth.toISOString()
          );

          if (attLog) {
            setAttendance({
              timeIn: attLog.time_in ? toHHMM(attLog.time_in) : null,
              timeOut: attLog.time_out ? toHHMM(attLog.time_out) : null,
            });
          }

          if (violationData && violationData.lat && violationData.lng) {
            setActiveViolation({
              lat: violationData.lat,
              lng: violationData.lng,
              zoneName: violationData.zone_name || 'Talon-Talon'
            });
          } else {
            setActiveViolation(null);
          }

          let presentCount = 0;
          let weekHours = 0;
          
          if (monthLogs) {
             const typedLogs = monthLogs as { status: string; date: string; hours: number | null }[];
             for (const log of typedLogs) {
               if (log.status === 'present' || log.status === 'late') {
                 presentCount++;
               }
               if (log.date >= firstDayOfWeekStr) {
                 weekHours += (log.hours || 0);
               }
             }
          }

          setStats({
            daysPresent: presentCount,
            hoursThisWeek: Number(weekHours.toFixed(1)),
            violationsThisMonth: violationCount || 0
          });
        }
      } catch (err) {
        console.error('Error loading rider dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadRiderAndZone();
  }, [userId, riderId, allZones]);

  const zoneCenterLat = zone?.center[0] ?? 6.9214;
  const zoneCenterLng = zone?.center[1] ?? 122.0790;
  const zoneRadius = zone?.radius ?? 1000;
  const zoneName = zone?.name ?? 'Talon-Talon';

  const anchor = useMemo(
    () => ({
      lat: zoneCenterLat + 0.0006,
      lng: zoneCenterLng + 0.0004
    }),
    [zoneCenterLat, zoneCenterLng]
  );

  const { position, isLoading: locationLoading } = useGeolocation({
    initial: anchor,
    jitter: 0.00018,
    enabled: true
  });

  const isOnline = !!timeIn && !timeOut;

  const positionToUse = useMemo(() => {
    if (activeViolation && !isOnline) {
      return {
        lat: activeViolation.lat,
        lng: activeViolation.lng,
        accuracy: 8,
        ts: Date.now()
      };
    }
    return position;
  }, [isOnline, position, activeViolation]);

  const distanceToUse = useMemo(() => {
    if (activeViolation && !isOnline) {
      return haversine(zoneCenterLat, zoneCenterLng, activeViolation.lat, activeViolation.lng);
    }
    return haversine(zoneCenterLat, zoneCenterLng, position.lat, position.lng);
  }, [isOnline, position, activeViolation, zoneCenterLat, zoneCenterLng]);

  const inZoneToUse = useMemo(() => {
    if (activeViolation && !isOnline) {
      return false;
    }
    if (zone?.zone_type === 'polygon' && zone.polygon_coordinates && zone.polygon_coordinates.length > 0) {
      const lat = activeViolation && !isOnline ? activeViolation.lat : position.lat;
      const lng = activeViolation && !isOnline ? activeViolation.lng : position.lng;
      return isPointInPolygon([lat, lng], zone.polygon_coordinates);
    }
    return distanceToUse <= zoneRadius;
  }, [isOnline, distanceToUse, zoneRadius, activeViolation, zone, position]);

  const distance = distanceToUse;
  const inZone = inZoneToUse;

  const action: 'time-in' | 'time-out' | 'completed' =
    timeIn && timeOut ? 'completed' : timeIn ? 'time-out' : 'time-in';

  const [events, setEvents] = useState<ActivityEvent[]>([]);

  // Seed events once rider is loaded
  useEffect(() => {
    if (rider && zone) {
      setEvents([
        {
          id: 'seed-1',
          ts: '06:58',
          kind: 'note',
          label: 'Zone assignment received',
          detail: `Assigned Zone · ${zoneName}`
        }
      ]);
    }
  }, [rider, zone, zoneName]);

  useEffect(() => {
    if (!timeIn || timeOut || !zone) return;
    const id = window.setInterval(() => {
      setEvents((prev) => [
        {
          id: `geo-${Date.now()}`,
          ts: nowHHMM(),
          kind: inZone ? 'geofence_ok' : 'geofence_alert',
          label: inZone ? 'Geofence check passed' : 'Boundary alert triggered',
          detail: inZone ?
            `Within ${zoneName} · ${Math.round(distance)}m from center` :
            `Outside ${zoneName} by ${Math.round(distance - zoneRadius)}m`
        },
        ...prev
      ]);
    }, 90000);
    return () => window.clearInterval(id);
  }, [timeIn, timeOut, inZone, zoneName, zoneRadius, distance, zone]);

  // Keep refs up-to-date to prevent GPS jitter re-triggering the sync useEffect and stale closures
  const positionRef = useRef(position);
  const inZoneRef = useRef(inZone);
  const actualRiderIdRef = useRef(actualRiderId);
  const pendingActionRef = useRef(pendingAction);
  const timeInRef = useRef(timeIn);
  const riderRef = useRef(rider);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    inZoneRef.current = inZone;
  }, [inZone]);

  useEffect(() => {
    actualRiderIdRef.current = actualRiderId;
  }, [actualRiderId]);

  useEffect(() => {
    pendingActionRef.current = pendingAction;
  }, [pendingAction]);

  useEffect(() => {
    timeInRef.current = timeIn;
  }, [timeIn]);

  useEffect(() => {
    riderRef.current = rider;
  }, [rider]);

  // Background Geolocation Synchronization Loop
  useEffect(() => {
    // loading check acts as a gate to prevent race conditions during initial database load
    // locationLoading check prevents logging mock initial anchor coordinates to database
    if (loading || locationLoading || !timeIn || timeOut || !actualRiderId) return;

    const syncLocation = async () => {
      const currentRiderId = actualRiderIdRef.current;
      const currentPosition = positionRef.current;
      const currentInZone = inZoneRef.current;
      if (!currentRiderId) return;

      const status: 'active' | 'violation' = currentInZone ? 'active' : 'violation';
      try {
        await updateRiderStatus(currentRiderId, status, currentPosition.lat, currentPosition.lng);
        await logRiderLocation(currentRiderId, currentPosition.lat, currentPosition.lng, status);
        console.log(`[RiderDashboard] Location synced to Supabase: Status = ${status}, Lat = ${currentPosition.lat}, Lng = ${currentPosition.lng}`);
      } catch (err) {
        console.error('[RiderDashboard] Failed to sync location to database:', err);
      }
    };

    // Initial sync
    syncLocation();

    // Setup stable 30s interval
    const id = setInterval(syncLocation, 30000);
    return () => clearInterval(id);
  }, [timeIn, timeOut, loading, locationLoading, actualRiderId]);

  const onlineStatus =
    timeIn && !timeOut ? 'online' : 'offline';
  const shiftStatus =
    timeIn && !timeOut ?
      'on_duty' :
      timeIn && timeOut ?
        'completed' :
        'not_started';

  function openScan(next: 'time-in' | 'time-out') {
    setPendingAction(next);
    reset();
    setScanOpen(true);
    window.setTimeout(start, 220);
  }

  useEffect(() => {
    if (phase !== 'matched' || !result?.matched) return;
    const currentRider = riderRef.current;
    const currentRiderId = actualRiderIdRef.current;
    const currentPendingAction = pendingActionRef.current;
    const currentTimeIn = timeInRef.current;
    const currentPosition = positionRef.current;

    if (!currentRider || !currentRiderId) return;

    const stamp = nowHHMM(new Date(result.capturedAt));
    if (currentPendingAction === 'time-in') {
      recordTimeIn(currentRiderId).then(async () => {
        setAttendance(prev => ({ ...prev, timeIn: stamp }));
        
        // Immediately sync initial active status & location to DB
        try {
          await updateRiderStatus(currentRiderId, 'active', currentPosition.lat, currentPosition.lng);
          await logRiderLocation(currentRiderId, currentPosition.lat, currentPosition.lng, 'active');
        } catch (err) {
          console.error('[RiderDashboard] Failed to push initial time-in coordinates:', err);
        }

        setEvents((prev) => [
          {
            id: `ti-${Date.now()}`,
            ts: stamp,
            kind: 'time_in',
            label: 'Time-In recorded (Facial Recognition)',
            detail: `Confidence ${result.confidence.toFixed(2)} · CAM-01`
          },
          ...prev
        ]);
        pushToast({
          title: 'Time-In recorded',
          description: `Welcome on duty, ${currentRider.name.split(' ')[0]}.`,
          tone: 'success'
        });
      }).catch((err) => {
        console.error('Error ticking in:', err);
        pushToast({
          title: 'Time-In failed',
          description: 'Database clock-in failed. Please try again.',
          tone: 'error'
        });
      });
    } else {
      recordTimeOut(currentRiderId).then(async () => {
        setAttendance(prev => ({ ...prev, timeOut: stamp }));

        // Transition status to offline in DB
        try {
          await updateRiderStatus(currentRiderId, 'offline', 0, 0); // resets coords
        } catch (err) {
          console.error('[RiderDashboard] Failed to reset offline status:', err);
        }

        setEvents((prev) => [
          {
            id: `to-${Date.now()}`,
            ts: stamp,
            kind: 'time_out',
            label: 'Time-Out recorded (Facial Recognition)',
            detail: `Active duration · ${currentTimeIn ? diffPretty(currentTimeIn, new Date(result.capturedAt)) : '—'}`
          },
          ...prev
        ]);
        pushToast({
          title: 'Time-Out recorded',
          description: 'Great work today. Drive safe.',
          tone: 'success'
        });
      }).catch((err) => {
        console.error('Error ticking out:', err);
        pushToast({
          title: 'Time-Out failed',
          description: 'Database clock-out failed. Please try again.',
          tone: 'error'
        });
      });
    }
    const t = window.setTimeout(() => setScanOpen(false), 1200);
    return () => window.clearTimeout(t);
  }, [phase, result]);

  const duration =
    timeIn && !timeOut ?
      diffPretty(timeIn) :
      timeIn && timeOut ?
        diffPretty(timeIn, parseTime(timeOut)) :
        null;

  function parseTime(hhmm: string) {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }

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
        onlineStatus={onlineStatus}
        shiftStatus={shiftStatus} />

      {/* 2. Time-In/Out hero panel */}
      <section className="rounded-2xl border border-[#EFEAE2] bg-white p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-5">
          <div className="text-center text-[10px] uppercase tracking-[0.2em] text-[#6B6258] font-mono">
            Attendance · Face Verified
          </div>
          <h2 className="text-[#1A1410] font-semibold text-lg sm:text-xl tracking-tight mt-1">
            {action === 'time-in' ?
              'Ready to clock in?' :
              action === 'time-out' ?
                "Wrapping up? Let's clock you out." :
                'You are all done for today.'}
          </h2>
        </div>

        <AttendanceButton
          action={action}
          disabled={locationLoading}
          onClick={() =>
            openScan(action === 'time-out' ? 'time-out' : 'time-in')
          } />

        {locationLoading && (
          <p className="text-center text-xs text-[#db6c00] animate-pulse mt-3 font-mono">
            Waiting for GPS coordinates lock...
          </p>
        )}

        <div className="mt-6">
          <AttendanceStatus
            timeIn={timeIn ? format12h(timeIn) : null}
            timeOut={timeOut ? format12h(timeOut) : null}
            duration={duration} />
        </div>
      </section>

      {/* 3. My Location & Geofence */}
      <section className="rounded-2xl border border-[#EFEAE2] bg-white p-5 space-y-4 shadow-sm">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-[#1A1410] font-semibold text-base">
              My Location
            </h2>
            <p className="text-[11px] text-[#6B6258] font-mono mt-0.5">
              Live GPS · {zoneName} geofence ({zoneRadius}m)
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-[0.16em] text-[#6B6258] font-mono">
            Accuracy ±{Math.round(position.accuracy)}m
          </span>
        </header>

        {locationLoading ? (
          <div className="h-[320px] bg-[#F5F0E8] rounded-xl border border-[#EFEAE2] animate-pulse flex flex-col items-center justify-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-[#db6c00] animate-bounce"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <span className="text-[#6B6258] text-sm font-medium">Acquiring live GPS signal...</span>
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
        violationsThisMonth={violationsThisMonth} />

      {/* 5. My Earnings & Payslips Portal */}
      <section className="rounded-2xl border border-[#EFEAE2] bg-white p-5 space-y-4 shadow-sm">
        <header className="flex items-center justify-between pb-3 border-b border-[#EFEAE2]">
          <div>
            <h2 className="text-[#1A1410] font-semibold text-base flex items-center gap-2">
              <span className="p-1 rounded-md bg-[#FFF1E0] text-[#db6c00] shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M2.5 4A1.5 1.5 0 001 5.5V6h18v-.5A1.5 1.5 0 0017.5 4h-15zM19 8.5H1v6A1.5 1.5 0 002.5 16h15a1.5 1.5 0 001.5-1.5v-6zM3 11.25a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75zm3.75-1.5a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z" clipRule="evenodd" />
                </svg>
              </span>
              My Earnings & Payslips
            </h2>
            <p className="text-[11px] text-[#6B6258] font-mono mt-0.5">
              Cutoff earnings progress and historical payslips
            </p>
          </div>
        </header>

        {myPayrollRecords.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#6B6258] italic">
            No payroll records generated yet. Once the payroll cutoff ends, your payslips will appear here.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Active/Latest Cutoff Progress Card */}
            {myPayrollRecords[0] && (
              <div className="p-4 rounded-xl border border-[#EFEAE2] bg-[#FAFAF7]/50 flex flex-col justify-between space-y-3">
                <div>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                    myPayrollRecords[0].status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                    myPayrollRecords[0].status === 'approved' ? 'bg-sky-50 text-sky-700' :
                    'bg-amber-50 text-amber-700'
                  }`}>
                    {myPayrollRecords[0].status === 'paid' ? 'Paid' : 'Pending Verification'}
                  </span>
                  
                  <div className="text-[11px] font-mono text-[#6B6258] mt-1.5">
                    Current Period
                  </div>
                  <div className="text-sm font-bold text-[#1A1410]">
                    {new Date(myPayrollRecords[0].cutoff_start).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – {new Date(myPayrollRecords[0].cutoff_end).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>

                <div className="flex items-baseline justify-between border-t border-[#EFEAE2] pt-3">
                  <div>
                    <div className="text-[10.5px] text-[#6B6258] font-mono">Delivered Parcels</div>
                    <div className="text-base font-bold text-[#1A1410] font-mono">{myPayrollRecords[0].total_parcels} pcs</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10.5px] text-[#6B6258] font-mono">Estimated Wage</div>
                    <div className="text-xl font-bold text-[#db6c00] font-mono">₱{(myPayrollRecords[0].gross_pay || (myPayrollRecords[0].total_parcels * (myPayrollRecords[0].rate_per_parcel || 50))).toLocaleString()}</div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedRecord(myPayrollRecords[0]);
                    setIsPayslipOpen(true);
                  }}
                  className="w-full h-8 bg-[#db6c00] hover:bg-[#b85a00] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition shadow-sm"
                >
                  View Cutoff Details
                </button>
              </div>
            )}

            {/* History of Payslips */}
            <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
              <div className="text-[10.5px] uppercase tracking-wider text-[#6B6258] font-bold font-mono">
                Past Payslips
              </div>
              {myPayrollRecords.slice(1).length === 0 ? (
                <div className="text-xs text-[#A39988] italic py-8 text-center">
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
                      className="p-2.5 rounded-lg border border-[#EFEAE2] hover:bg-[#FAFAF7] transition cursor-pointer flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[#1A1410]">
                          {new Date(rec.cutoff_start).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – {new Date(rec.cutoff_end).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-[10px] text-[#6B6258] font-mono">
                          {rec.total_parcels} pcs delivered
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold font-mono text-[#1A1410]">
                          ₱{(rec.gross_pay || (rec.total_parcels * (rec.rate_per_parcel || 50))).toLocaleString()}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          rec.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {rec.status === 'paid' ? 'Paid' : 'Verified'}
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
          <span className="text-[11px] text-[#6B6258] font-mono">
            {nowHHMM()} · {zoneName}
          </span>
          {phase === 'failed' ?
            <div className="flex gap-2">
              <button
                onClick={() => setScanOpen(false)}
                className="px-4 h-9 rounded-md text-sm text-[#1A1410] bg-[#FAFAF7] border border-[#EFEAE2] hover:bg-white hover:border-[#db6c00]/30 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  reset();
                  start();
                }}
                className="px-4 h-9 rounded-md text-sm text-white bg-[#db6c00] hover:bg-[#b85a00] transition-colors shadow-sm">
                Retry scan
              </button>
            </div> :
            phase === 'matched' ?
              <button
                onClick={() => setScanOpen(false)}
                className="px-4 h-9 rounded-md text-sm text-white bg-[#16A34A] hover:bg-[#15803D] transition-colors shadow-sm">
                Done
              </button> :
              <button
                onClick={() => setScanOpen(false)}
                disabled={phase === 'scanning' || phase === 'initializing'}
                className="px-4 h-9 rounded-md text-sm text-[#1A1410] bg-[#FAFAF7] border border-[#EFEAE2] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                Cancel
              </button>
          }
        </div>
      </Modal>
    </div>);
}
