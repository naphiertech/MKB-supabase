import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  haversine,
  type Rider,
  type Zone } from
'../services/types';
import {
  getRiderPayrollHistory,
  cacheRiderFaceDescriptor,
  getRiderViolationsForMonth
} from '../services/riderService';
import { fetchRiderDashboardWithSWR, updateCachedAttendanceState, type CachedDashboardPayload } from '../services/riderCacheService';
import { recordTimeIn, recordTimeOut, isAttendanceFinalized } from '../services/attendanceService';
import { useRiderZone } from '../context/RiderZoneContext';
import { isPointInPolygon } from '../lib/geofenceUtils';
import { logRiderLocation, updateRiderStatus } from '../services/monitoringService';
import { useGeolocation } from '../hooks/useGeolocation';
import { setCachedDescriptor } from '../lib/descriptorCache';
import { useFaceRecognition } from '../hooks/useFaceRecognition';
import { preloadBiometrics, releaseBiometrics } from '../lib/faceAi';
import { Modal } from '../components/common/Modal';
import { FaceScanner } from '../components/attendance/FaceScanner';
import { AttendanceButton, type AttendanceAction } from '../components/attendance/AttendanceButton';
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
    id: string | null;
    timeIn: string | null;
    timeOut: string | null;
  }>({ id: null, timeIn: null, timeOut: null });
  const { timeIn, timeOut } = attendance;
  const attendanceRef = useRef(attendance);

  // Real Stats from Database
  const [stats, setStats] = useState({
    daysPresent: 0,
    hoursThisWeek: 0,
    violationsThisMonth: 0
  });

  interface DBAttendanceLog {
    id: string;
    rider_id: string;
    date: string;
    time_in: string | null;
    time_out: string | null;
    hours: number | null;
    status: string;
    source?: string | null;
  }

  interface DBViolation {
    id: string;
    rider_id: string;
    zone_name: string;
    type: string;
    lat: number;
    lng: number;
    created_at: string;
    read: boolean;
    resolved: boolean;
  }

  const [monthAttendanceLogs, setMonthAttendanceLogs] = useState<DBAttendanceLog[]>([]);
  const [violationsList, setViolationsList] = useState<DBViolation[]>([]);
  const [loadingViolations, setLoadingViolations] = useState(false);
  const [activeStatModal, setActiveStatModal] = useState<'days' | 'hours' | 'violations' | null>(null);

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

  const handleViolationsClick = async () => {
    setActiveStatModal('violations');
    if (!actualRiderId) return;
    try {
      setLoadingViolations(true);
      const todayDate = new Date();
      const firstDayOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
      const firstDayStr = getLocalDateString(firstDayOfMonth);
      const data = await getRiderViolationsForMonth(actualRiderId, firstDayStr);
      setViolationsList(data);
    } catch (err) {
      console.error('Failed to load violations:', err);
    } finally {
      setLoadingViolations(false);
    }
  };

  const getWeeklyBreakdown = () => {
    const todayDate = new Date();
    const dayOfWeek = todayDate.getDay();
    const diff = todayDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    
    // Create new Date objects to avoid mutating reference in loop
    const monday = new Date(todayDate.getFullYear(), todayDate.getMonth(), diff);
    
    const days = [];
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = getLocalDateString(d);
      const log = monthAttendanceLogs.find(l => l.date === dateStr);
      days.push({
        name: weekdays[i],
        dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        hours: log ? (log.hours || 0) : 0,
        status: log ? log.status : 'no_log'
      });
    }
    return days;
  };
  const [scanOpen, setScanOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'time-in' | 'time-out'>('time-in');

  const { phase, progress, result, start, reset, videoRef, canvasRef, livenessPrompt, debugInfo } = useFaceRecognition({
    riderId: actualRiderId,
    referenceAvatar: rider?.avatar,
    referenceDescriptor: rider?.faceDescriptor,
    onDescriptorCalculated: async (descriptor) => {
      if (!actualRiderId) return;
      console.log('[RiderDashboard] Fallback calculated face descriptor. Saving to database...', actualRiderId);
      try {
        await cacheRiderFaceDescriptor(actualRiderId, descriptor);
        setCachedDescriptor(actualRiderId, descriptor, rider?.avatar);
        console.log('[RiderDashboard] Successfully cached face descriptor to Supabase.');
        setRider(prev => prev ? { ...prev, faceDescriptor: descriptor } : null);
      } catch (err) {
        console.error('[RiderDashboard] Exception while caching face descriptor:', err);
      }
    }
  });

  const loadRiderAndZone = useCallback(async () => {
    try {
      const todayStr = getLocalDateString();
      const todayDate = new Date();
      const firstDayOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
      const firstDayStr = getLocalDateString(firstDayOfMonth);
      
      const dayOfWeek = todayDate.getDay();
      const diff = todayDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const firstDayOfWeek = new Date(todayDate.setDate(diff));
      const firstDayOfWeekStr = getLocalDateString(firstDayOfWeek);

      const applyPayload = (payload: CachedDashboardPayload) => {
        const {
          resolvedRiderId,
          dbRider,
          todayAttendance: attLog,
          latestViolation: violationData,
          monthAttendance: monthLogs,
          monthViolationCount: violationCount
        } = payload;

        setActualRiderId(resolvedRiderId);

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
          if (dbRider.face_descriptor && Array.isArray(dbRider.face_descriptor) && dbRider.face_descriptor.length === 128) {
            setCachedDescriptor(dbRider.id, dbRider.face_descriptor, mappedRider.avatar);
          }

          const resolvedZone = allZones.find(z => z.id === dbRider.zone_id) || allZones[0];
          if (resolvedZone) {
            setZone(resolvedZone);
          }
        }

        if (attLog) {
          setAttendance({
            id: attLog.id,
            timeIn: attLog.time_in ? toHHMM(attLog.time_in) : null,
            timeOut: attLog.time_out ? toHHMM(attLog.time_out) : null,
          });
        } else {
          setAttendance({ id: null, timeIn: null, timeOut: null });
        }

        if (violationData && !violationData.resolved && violationData.lat && violationData.lng) {
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

        setMonthAttendanceLogs(monthLogs || []);
        setStats({
          daysPresent: presentCount,
          hoursThisWeek: Number(weekHours.toFixed(1)),
          violationsThisMonth: violationCount || 0
        });

        setLoading(false);
      };

      await fetchRiderDashboardWithSWR(
        userId,
        riderId,
        todayStr,
        firstDayStr,
        firstDayOfMonth.toISOString(),
        {
          onCacheLoaded: (cachedData) => {
            applyPayload(cachedData);
          },
          onFreshDataLoaded: (freshData) => {
            applyPayload(freshData);
          }
        }
      );
    } catch (err) {
      console.error('Error loading rider dashboard data:', err);
      setLoading(false);
    }
  }, [userId, riderId, allZones]);

  useEffect(() => {
    loadRiderAndZone();
  }, [loadRiderAndZone]);

  // Background Biometrics Pre-warming (decoupled from initial page render)
  useEffect(() => {
    if (loading) return;

    // Delay compilation/preloading until 1.5s after the UI is fully loaded and interactive
    const preloadingTimeout = setTimeout(() => {
      console.log('[RiderDashboard] Dashboard interactive. Starting biometrics background pre-warming...');
      preloadBiometrics().catch(err => {
        console.warn('[RiderDashboard] Background biometrics preloading exception:', err);
      });
    }, 1500);

    return () => clearTimeout(preloadingTimeout);
  }, [loading]);

  // Tab Inactivity Geolocation/Biometrics Resource Cleanup
  useEffect(() => {
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is minimized or hidden. Trigger resource release after 3 minutes.
        inactivityTimer = setTimeout(async () => {
          console.log('[RiderDashboard] Tab hidden for 3 minutes. Releasing biometric resources to free RAM...');
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

  const isClosed = isAttendanceFinalized() && !timeIn;
  const action: AttendanceAction = isClosed
    ? 'closed'
    : timeIn && timeOut
      ? 'completed'
      : timeIn
        ? 'time-out'
        : 'time-in';

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
    attendanceRef.current = attendance;
  }, [attendance]);

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
        // The DB trigger processes coordinates and handles status changes, violations,
        // notifications, and activity logging automatically. We only insert the log here.
        await logRiderLocation(currentRiderId, currentPosition.lat, currentPosition.lng, status);
        console.log(`[RiderDashboard] Location synced to Supabase: Lat = ${currentPosition.lat}, Lng = ${currentPosition.lng}`);
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
      recordTimeIn(currentRiderId).then(async (newLog) => {
        if (!newLog) {
          pushToast({
            title: 'Time-In failed',
            description: 'Database clock-in failed. Please try again.',
            tone: 'error'
          });
          return;
        }

        // Immediately sync initial active status & location to DB
        try {
          await updateRiderStatus(currentRiderId, 'active', currentPosition.lat, currentPosition.lng);
          await logRiderLocation(currentRiderId, currentPosition.lat, currentPosition.lng, 'active');
        } catch (err) {
          console.error('[RiderDashboard] Failed to push initial time-in coordinates:', err);
        }

        if (!navigator.onLine) {
          await updateCachedAttendanceState(userId, {
            id: newLog.id,
            rider_id: currentRiderId,
            date: newLog.date,
            time_in: newLog.rawTimeIn || null,
            time_out: null,
            hours: 0,
            status: 'present'
          });
        }

        // Reconstruct attendance state directly from database single source of truth
        await loadRiderAndZone();

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
      const activeLogId = attendanceRef.current.id;
      if (!activeLogId) {
        console.error('[RiderDashboard] Cannot record time-out: No active attendance log ID.');
        pushToast({
          title: 'Time-Out failed',
          description: 'Active shift record not found. Please refresh and try again.',
          tone: 'error'
        });
        return;
      }

      recordTimeOut(activeLogId).then(async (success) => {
        if (!success) {
          pushToast({
            title: 'Time-Out failed',
            description: 'Database clock-out failed. Please try again.',
            tone: 'error'
          });
          return;
        }

        // Transition status to offline in DB while preserving last valid position
        try {
          await updateRiderStatus(currentRiderId, 'offline', currentPosition.lat, currentPosition.lng);
        } catch (err) {
          console.error('[RiderDashboard] Failed to update offline status:', err);
        }

        if (!navigator.onLine) {
          await updateCachedAttendanceState(userId, {
            id: activeLogId,
            rider_id: currentRiderId,
            date: getLocalDateString(),
            time_in: currentTimeIn,
            time_out: new Date().toISOString(),
            hours: 0,
            status: 'present'
          });
        }

        // Reconstruct attendance state directly from database single source of truth
        await loadRiderAndZone();

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
  }, [phase, result, loadRiderAndZone, userId]);

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
        onlineStatus={onlineStatus} />

      {/* 2. Time-In/Out hero panel */}
      <section className="rounded-2xl border border-[#EFEAE2] bg-white p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-5">
          <div className="text-center text-[10px] uppercase tracking-[0.2em] text-[#6B6258] font-mono">
            Attendance · Face Verified
          </div>
          <h2 className="text-[#1A1410] font-semibold text-lg sm:text-xl tracking-tight mt-1">
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
        violationsThisMonth={violationsThisMonth}
        onDaysClick={() => setActiveStatModal('days')}
        onHoursClick={() => setActiveStatModal('hours')}
        onViolationsClick={handleViolationsClick} />

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
                    {myPayrollRecords[0].status === 'paid' ? 'Paid' :
                     myPayrollRecords[0].status === 'approved' ? 'Approved' : 'Pending Verification'}
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
            <p className="text-sm text-[#6B6258] text-center py-6">
              No attendance logs found for this month.
            </p>
          ) : (
            <div className="divide-y divide-[#EFEAE2] border border-[#EFEAE2] rounded-xl overflow-hidden bg-white">
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
                  <div key={log.id || index} className="p-3.5 flex items-center justify-between text-sm hover:bg-[#FAFAF7] transition-colors">
                    <div>
                      <div className="font-semibold text-[#1A1410]">{dateLabel}</div>
                      <div className="text-xs text-[#6B6258] font-mono mt-0.5">
                        {log.time_in ? format12h(toHHMM(log.time_in) || '00:00') : '—'} – {log.time_out ? format12h(toHHMM(log.time_out) || '00:00') : '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-md border text-xs font-medium uppercase tracking-wider ${badgeClass}`}>
                        {badgeText}
                      </span>
                      <span className="font-semibold font-mono text-sm text-[#1A1410]">
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
          <div className="p-3.5 bg-[#FFF1E0] border border-[#db6c00]/20 rounded-xl flex items-center justify-between">
            <span className="text-xs font-semibold text-[#b85a00] uppercase tracking-wider">
              Total Hours This Week
            </span>
            <span className="text-xl font-bold font-mono text-[#db6c00]">
              {stats.hoursThisWeek.toFixed(1)} hrs
            </span>
          </div>

          <div className="space-y-3.5">
            {getWeeklyBreakdown().map((day, idx) => {
              const isFutureOrEmpty = day.hours === 0 && day.status === 'no_log';
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-[#1A1410]">
                      {day.name} <span className="text-[#6B6258] font-mono font-normal">({day.dateLabel})</span>
                    </span>
                    <span className="font-semibold font-mono text-[#1A1410]">
                      {day.hours.toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${
                        isFutureOrEmpty
                          ? 'from-gray-300 to-gray-300'
                          : 'from-[#db6c00]/60 to-[#db6c00]'
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
              <div className="w-8 h-8 rounded-full border-4 border-[#db6c00] border-t-transparent animate-spin" />
              <span className="text-xs text-[#6B6258] font-medium font-mono animate-pulse">
                Fetching geofence log...
              </span>
            </div>
          ) : violationsList.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
              </div>
              <h3 className="text-sm font-semibold text-[#1A1410]">Clean Record</h3>
              <p className="text-xs text-[#6B6258] max-w-xs mx-auto">
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
                  <div key={v.id || idx} className="p-3.5 rounded-xl border border-[#EFEAE2] bg-white hover:border-[#db6c00]/30 hover:shadow-sm transition flex items-start gap-3">
                    <span className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${
                      v.resolved ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600 animate-pulse'
                    }`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-[#1A1410]">
                          {v.type === 'boundary_exit' ? 'Boundary Exit Alert' : v.type === 'idle_excess' ? 'Excess Idle Warning' : 'Geofence Violation'}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                          v.resolved ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {v.resolved ? 'Resolved' : 'Active'}
                        </span>
                      </div>
                      <div className="text-xs text-[#6B6258] mt-1 font-medium">
                        Zone: {v.zone_name || 'Talon-Talon'}
                      </div>
                      <div className="text-[11px] text-[#6B6258]/80 font-mono mt-0.5 flex items-center justify-between">
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
