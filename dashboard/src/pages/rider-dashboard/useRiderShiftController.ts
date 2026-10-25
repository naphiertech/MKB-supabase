import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AttendanceAction } from '../../components/attendance/AttendanceButton';
import type { ActivityEvent } from '../../components/rider/ActivityTimeline';
import { useFaceRecognition } from '../../hooks/useFaceRecognition';
import { useGeolocation } from '../../hooks/useGeolocation';
import { pushToast } from '../../hooks/useToast';
import { biometricTelemetry, BIOMETRIC_TIMING_NAMES } from '../../lib/biometricTelemetry';
import { isPointInPolygon } from '../../lib/geofenceUtils';
import { canStartRiderAttendance, isRecentRiderPosition } from '../../lib/riderGeolocation';
import { notifyGeofenceWarning } from '../../lib/nativeNotifications';
import { startForegroundDutyTracking, stopForegroundDutyTracking } from '../../lib/foregroundTracking';
import {
  getMyHubAttendanceGeofence,
  isAttendanceFinalized,
  type HubAttendanceGeofence,
} from '../../services/attendance/attendanceService';
import { executeShiftTransition } from '../../services/attendance/shiftSessionService';
import { logRiderLocation } from '../../services/monitoring/monitoringService';
import { haversine, type Zone } from '../../services/types';
import {
  deriveAttendanceAction,
  diffPretty,
  nowHHMM,
  parseTime,
  type DashboardActiveViolation,
  type DashboardAttendanceState,
  type DashboardRider,
} from './riderDashboardModel';

interface UseRiderShiftControllerInput {
  userId: string;
  restricted: boolean;
  actualRiderId: string;
  rider: DashboardRider | null;
  zone: Zone | null;
  attendance: DashboardAttendanceState;
  activeViolation: DashboardActiveViolation | null;
  loading: boolean;
  reload: () => Promise<void>;
  onDescriptorCalculated: (descriptor: number[]) => Promise<void> | void;
  setEvents: Dispatch<SetStateAction<ActivityEvent[]>>;
}

const NEUTRAL_LOCATION_ANCHOR = { lat: 0, lng: 0 };

function hasOperationalZoneGeometry(zone: Zone | null): zone is Zone {
  if (!zone || zone.hasValidGeometry === false) return false;
  if (zone.zone_type === 'polygon') {
    return Boolean(
      zone.polygon_coordinates
      && zone.polygon_coordinates.length >= 3
      && zone.polygon_coordinates.every((coordinate) => coordinate.every(Number.isFinite))
    );
  }
  return zone.center.every(Number.isFinite) && Number.isFinite(zone.radius) && zone.radius > 0;
}

export function useRiderShiftController({
  userId,
  restricted,
  actualRiderId,
  rider,
  zone,
  attendance,
  activeViolation,
  loading,
  reload,
  onDescriptorCalculated,
  setEvents,
}: UseRiderShiftControllerInput) {
  const { timeIn, timeOut } = attendance;
  const [scanOpen, setScanOpenState] = useState(false);
  const [pendingAction, setPendingAction] = useState<'time-in' | 'time-out'>('time-in');
  const finishUserPerceivedTimingRef = useRef<(() => number) | null>(null);
  const scannerStartTimeoutRef = useRef<number | null>(null);
  const scanSessionRef = useRef(0);
  const handledScanSessionRef = useRef<number | null>(null);
  const attendanceWriteInFlightRef = useRef(false);
  const setEventsRef = useRef(setEvents);
  setEventsRef.current = setEvents;

  const cancelScannerStart = useCallback(() => {
    if (scannerStartTimeoutRef.current === null) return;
    window.clearTimeout(scannerStartTimeoutRef.current);
    scannerStartTimeoutRef.current = null;
  }, []);

  const setScanOpen = useCallback((open: boolean) => {
    if (!open) cancelScannerStart();
    setScanOpenState(open);
  }, [cancelScannerStart]);

  const geofenceResolved = hasOperationalZoneGeometry(zone);
  const zoneName = geofenceResolved ? zone.name : null;
  const zoneRadius = geofenceResolved ? zone.radius : null;
  const initialLocationAnchor = useMemo(
    () => (
      rider && Number.isFinite(rider.lat) && Number.isFinite(rider.lng)
        ? { lat: rider.lat, lng: rider.lng }
        : NEUTRAL_LOCATION_ANCHOR
    ),
    [rider],
  );

  // GPS/geolocation effects register first inside the controller.
  const {
    position,
    error: locationError,
    isLoading: locationLoading,
    hasVerifiedPosition,
    retry: retryLocation,
  } = useGeolocation({
    initial: initialLocationAnchor,
    enabled: !restricted,
  });

  const verifiedPosition = hasVerifiedPosition ? position : null;
  const canTimeIn = !restricted && canStartRiderAttendance('time-in', verifiedPosition);
  const canTimeOut = !restricted && canStartRiderAttendance('time-out', verifiedPosition);
  const isOnline = !!timeIn && !timeOut;

  const [hubGeofence, setHubGeofence] = useState<HubAttendanceGeofence | null>(null);
  const [hubGeofenceLoading, setHubGeofenceLoading] = useState(false);
  const hubGeofenceRef = useRef<HubAttendanceGeofence | null>(null);

  useEffect(() => {
    hubGeofenceRef.current = hubGeofence;
  }, [hubGeofence]);

  useEffect(() => {
    if (!actualRiderId || restricted) {
      setHubGeofence(null);
      hubGeofenceRef.current = null;
      return;
    }
    let active = true;
    setHubGeofenceLoading(true);
    getMyHubAttendanceGeofence()
      .then((fence) => {
        if (!active) return;
        setHubGeofence(fence);
        hubGeofenceRef.current = fence;
      })
      .catch((err) => {
        console.warn('[RiderDashboard] Failed to fetch hub attendance geofence:', err);
      })
      .finally(() => {
        if (active) setHubGeofenceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [actualRiderId, restricted]);

  const hubDistance = useMemo(() => {
    if (
      !hubGeofence?.is_configured
      || hubGeofence.latitude == null
      || hubGeofence.longitude == null
      || !hasVerifiedPosition
    ) {
      return null;
    }
    return haversine(
      hubGeofence.latitude,
      hubGeofence.longitude,
      position.lat,
      position.lng,
    );
  }, [hubGeofence, hasVerifiedPosition, position]);

  const inHubGeofence = useMemo(() => {
    if (hubDistance === null || hubGeofence?.attendance_radius_m == null) return null;
    return hubDistance <= hubGeofence.attendance_radius_m;
  }, [hubDistance, hubGeofence]);

  const [outsideAttempts, setOutsideAttempts] = useState(0);
  const [cooldownSecondsRemaining, setCooldownSecondsRemaining] = useState(0);
  const outsideAttemptsRef = useRef(0);
  const cooldownActiveRef = useRef(false);

  useEffect(() => {
    if (cooldownSecondsRemaining <= 0) {
      cooldownActiveRef.current = false;
      return;
    }
    cooldownActiveRef.current = true;
    const timer = window.setInterval(() => {
      setCooldownSecondsRemaining((prev) => {
        if (prev <= 1) {
          outsideAttemptsRef.current = 0;
          setOutsideAttempts(0);
          cooldownActiveRef.current = false;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSecondsRemaining]);

  // Instant override when Rider enters Hub
  useEffect(() => {
    if (inHubGeofence === true) {
      outsideAttemptsRef.current = 0;
      setOutsideAttempts(0);
      cooldownActiveRef.current = false;
      setCooldownSecondsRemaining(0);
    }
  }, [inHubGeofence]);

  // Reset attempt count & cooldown on rider or hub assignment change
  useEffect(() => {
    outsideAttemptsRef.current = 0;
    setOutsideAttempts(0);
    cooldownActiveRef.current = false;
    setCooldownSecondsRemaining(0);
  }, [actualRiderId, hubGeofence?.hub_id]);

  const positionToUse = useMemo(() => {
    if (activeViolation && !isOnline) {
      return {
        lat: activeViolation.lat,
        lng: activeViolation.lng,
        accuracy: 8,
        ts: Date.now(),
      };
    }
    return position;
  }, [isOnline, position, activeViolation]);

  const distanceToUse = useMemo(() => {
    if (!geofenceResolved) return null;
    if (activeViolation && !isOnline) {
      return haversine(zone.center[0], zone.center[1], activeViolation.lat, activeViolation.lng);
    }
    return haversine(zone.center[0], zone.center[1], position.lat, position.lng);
  }, [isOnline, position, activeViolation, geofenceResolved, zone]);

  const inZoneToUse = useMemo(() => {
    if (!geofenceResolved || distanceToUse === null) return null;
    if (activeViolation && !isOnline) {
      return false;
    }
    if (zone?.zone_type === 'polygon' && zone.polygon_coordinates && zone.polygon_coordinates.length > 0) {
      const lat = activeViolation && !isOnline ? activeViolation.lat : position.lat;
      const lng = activeViolation && !isOnline ? activeViolation.lng : position.lng;
      return isPointInPolygon([lat, lng], zone.polygon_coordinates);
    }
    if (zoneRadius === null) return null;
    return distanceToUse <= zoneRadius;
  }, [isOnline, distanceToUse, zoneRadius, activeViolation, zone, position, geofenceResolved]);

  const distance = distanceToUse;
  const inZone = inZoneToUse;

  // Activity-timeline effects preserve their original dependency behavior and order.
  useEffect(() => {
    if (rider && zone && zoneName) {
      setEventsRef.current([
        {
          id: 'seed-1',
          ts: '06:58',
          kind: 'note',
          label: 'Zone assignment received',
          detail: `Assigned Zone · ${zoneName}`,
        },
      ]);
    }
  }, [rider, zone, zoneName]);

  useEffect(() => {
    if (
      !timeIn || timeOut || !zone || !hasVerifiedPosition || !geofenceResolved
      || inZone === null || distance === null || zoneRadius === null || !zoneName
    ) return;
    const id = window.setInterval(() => {
      if (!inZone) {
        void notifyGeofenceWarning({
          zoneName: zoneName || 'Assigned Zone',
          distanceMeters: Math.round(distance - zoneRadius),
        });
      }
      setEventsRef.current((prev) => [
        {
          id: `geo-${Date.now()}`,
          ts: nowHHMM(),
          kind: inZone ? 'geofence_ok' : 'geofence_alert',
          label: inZone ? 'Geofence check passed' : 'Boundary alert triggered',
          detail: inZone
            ? `Within ${zoneName} · ${Math.round(distance)}m from center`
            : `Outside ${zoneName} by ${Math.round(distance - zoneRadius)}m`,
        },
        ...prev,
      ]);
    }, 90000);
    return () => window.clearInterval(id);
  }, [timeIn, timeOut, inZone, zoneName, zoneRadius, distance, zone, hasVerifiedPosition, geofenceResolved]);

  // Mirrored refs preserve latest values without restarting the location interval.
  const positionRef = useRef(position);
  const hasVerifiedPositionRef = useRef(hasVerifiedPosition);
  const inZoneRef = useRef(inZone);
  const actualRiderIdRef = useRef(actualRiderId);
  const pendingActionRef = useRef(pendingAction);
  const timeInRef = useRef(timeIn);
  const attendanceRef = useRef(attendance);
  const riderRef = useRef(rider);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    hasVerifiedPositionRef.current = hasVerifiedPosition;
  }, [hasVerifiedPosition]);

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
    if (restricted || loading || locationLoading || !hasVerifiedPosition || !timeIn || timeOut || !actualRiderId) return;
    let active = true;

    const syncLocation = async () => {
      const currentRiderId = actualRiderIdRef.current;
      const currentPosition = positionRef.current;
      const currentInZone = inZoneRef.current;
      if (!currentRiderId || !hasVerifiedPositionRef.current || !isRecentRiderPosition(currentPosition)) return;

      try {
        if (currentInZone === null) {
          await logRiderLocation(currentRiderId, currentPosition.lat, currentPosition.lng);
        } else {
          const status: 'active' | 'violation' = currentInZone ? 'active' : 'violation';
          await logRiderLocation(currentRiderId, currentPosition.lat, currentPosition.lng, status);
        }
        if (!active) return;
        console.log(`[RiderDashboard] Location synced to Supabase: Lat = ${currentPosition.lat}, Lng = ${currentPosition.lng}`);
      } catch (err) {
        if (!active) return;
        console.error('[RiderDashboard] Failed to sync location to database:', err);
      }
    };

    syncLocation();
    const id = setInterval(syncLocation, 30000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [timeIn, timeOut, loading, locationLoading, hasVerifiedPosition, actualRiderId, restricted]);

  // Android Native Foreground Service: Keep GPS tracking active when phone screen is locked
  useEffect(() => {
    if (timeIn && !timeOut && actualRiderId) {
      void startForegroundDutyTracking({
        riderId: actualRiderId,
        hubName: hubGeofence?.hub_name || zoneName || "Assigned Hub",
      });
    } else if (timeOut) {
      void stopForegroundDutyTracking();
    }
  }, [timeIn, timeOut, actualRiderId, hubGeofence?.hub_name, zoneName]);

  async function openScan(next: 'time-in' | 'time-out') {
    if (attendanceWriteInFlightRef.current || cooldownActiveRef.current || cooldownSecondsRemaining > 0) return;
    if (restricted) {
      pushToast({
        title: 'Account restricted',
        description: 'Attendance and operational location actions are disabled until full access is restored.',
        tone: 'error',
      });
      return;
    }
    const currentPosition = hasVerifiedPositionRef.current ? positionRef.current : null;
    if (!canStartRiderAttendance(next, currentPosition) || !currentPosition) {
      pushToast({
        title: 'Real GPS required',
        description: `Enable precise location and wait for a current GPS reading before recording ${next === 'time-in' ? 'Time In' : 'Time Out'}.`,
        tone: 'error',
      });
      retryLocation();
      return;
    }

    let fence = hubGeofenceRef.current;
    if (!fence) {
      try {
        fence = await getMyHubAttendanceGeofence();
        setHubGeofence(fence);
        hubGeofenceRef.current = fence;
      } catch (err: any) {
        console.warn('[RiderDashboard] Hub geofence pre-check lookup failed:', err);
      }
    }

    if (fence) {
      if (!fence.hub_id) {
        pushToast({
          title: 'Hub assignment required',
          description: 'You are not assigned to an operational Hub. Contact your Dispatcher or HR.',
          tone: 'error',
        });
        return;
      }
      if (!fence.is_configured || fence.latitude == null || fence.longitude == null || fence.attendance_radius_m == null) {
        pushToast({
          title: 'Hub geofence unconfigured',
          description: `The attendance geofence for ${fence.hub_name || 'your assigned Hub'} has not been configured by an Administrator. Contact your Hub supervisor.`,
          tone: 'error',
        });
        return;
      }

      const dist = haversine(
        fence.latitude,
        fence.longitude,
        currentPosition.lat,
        currentPosition.lng,
      );

      if (dist > fence.attendance_radius_m) {
        const nextAttempts = outsideAttemptsRef.current + 1;
        outsideAttemptsRef.current = nextAttempts;
        setOutsideAttempts(nextAttempts);

        const distM = Math.round(dist);
        const radiusM = Math.round(fence.attendance_radius_m);
        const hubName = fence.hub_name || 'Hub';

        if (nextAttempts >= 3) {
          cooldownActiveRef.current = true;
          setCooldownSecondsRemaining(30);
          pushToast({
            id: 'outside-hub-attendance-warning',
            title: 'Outside Hub attendance area',
            description: `You're outside the ${hubName} attendance area. You are ${distM} m away. Move within ${radiusM} m of the Hub to continue. Attendance paused for 30s.`,
            tone: 'error',
          });
        } else {
          pushToast({
            id: 'outside-hub-attendance-warning',
            title: 'Outside Hub attendance area',
            description: `You're outside the ${hubName} attendance area. You are ${distM} m away. Move within ${radiusM} m of the Hub to continue.`,
            tone: 'error',
          });
        }
        return;
      }
    }

    scanSessionRef.current += 1;
    setPendingAction(next);
    reset();
    const telemetryAction = next === 'time-in' ? 'time_in' : 'time_out';
    finishUserPerceivedTimingRef.current = biometricTelemetry.start(
      BIOMETRIC_TIMING_NAMES.userPerceivedTotal(telemetryAction),
    );
    setScanOpen(true);
    cancelScannerStart();
    scannerStartTimeoutRef.current = window.setTimeout(() => {
      scannerStartTimeoutRef.current = null;
      start();
    }, 220);
  }

  const {
    phase,
    progress,
    result,
    start,
    reset,
    videoRef,
    canvasRef,
    livenessPrompt,
    debugInfo,
  } = useFaceRecognition({
    riderId: actualRiderId,
    referenceAvatar: rider?.avatar,
    referenceDescriptor: rider?.faceDescriptor,
    onDescriptorCalculated,
  });

  useEffect(() => () => cancelScannerStart(), [cancelScannerStart]);

  // Face-match attendance orchestration remains last in the controller effect order.
  useEffect(() => {
    if (phase !== 'matched' || !result?.matched) return;
    const scanSession = scanSessionRef.current;
    if (
      scanSession === 0
      || handledScanSessionRef.current === scanSession
      || attendanceWriteInFlightRef.current
    ) return;
    handledScanSessionRef.current = scanSession;
    if (restricted) {
      setScanOpen(false);
      return;
    }
    const currentRider = riderRef.current;
    const currentRiderId = actualRiderIdRef.current;
    const currentPendingAction = pendingActionRef.current;
    const currentTimeIn = timeInRef.current;
    const currentPosition = positionRef.current;
    const currentVerifiedPosition = hasVerifiedPositionRef.current && isRecentRiderPosition(currentPosition)
      ? currentPosition
      : null;

    if (!currentRider || !currentRiderId) return;

    const actionLabel = currentPendingAction === 'time-in' ? 'Time-In' : 'Time-Out';
    if (currentPendingAction === 'time-out' && !attendanceRef.current.id) {
      console.error('[RiderDashboard] Cannot record time-out: No active attendance log ID.');
      pushToast({
        title: 'Time-Out failed',
        description: 'Active shift record not found. Please refresh and try again.',
        tone: 'error',
      });
      return;
    }

    if (!currentVerifiedPosition) {
      pushToast({
        title: `${actionLabel} paused`,
        description: 'The GPS reading expired during verification. Acquire a new location and try again.',
        tone: 'error',
      });
      setScanOpen(false);
      retryLocation();
      return;
    }

    attendanceWriteInFlightRef.current = true;
    executeShiftTransition({
      riderId: currentRiderId,
      userId,
      action: currentPendingAction,
      activeLogId: attendanceRef.current.id,
      currentTimeIn,
      hubName: hubGeofence?.hub_name || zoneName || 'Assigned Hub',
      position: currentVerifiedPosition,
      inZone: inZoneRef.current,
      capturedAt: result.capturedAt,
      reload,
    }).then(({ stamp }) => {
      finishUserPerceivedTimingRef.current?.();
      finishUserPerceivedTimingRef.current = null;

      if (currentPendingAction === 'time-in') {
        setEventsRef.current((prev) => [
          {
            id: `ti-${Date.now()}`,
            ts: stamp,
            kind: 'time_in',
            label: 'Time-In recorded (Facial Recognition)',
            detail: `Confidence ${result.confidence.toFixed(2)} · CAM-01`,
          },
          ...prev,
        ]);
        pushToast({
          title: 'Time-In recorded',
          description: `Welcome on duty, ${currentRider.name.split(' ')[0]}.`,
          tone: 'success',
        });
      } else {
        setEventsRef.current((prev) => [
          {
            id: `to-${Date.now()}`,
            ts: stamp,
            kind: 'time_out',
            label: 'Time-Out recorded (Facial Recognition)',
            detail: `Active duration · ${currentTimeIn ? diffPretty(currentTimeIn, new Date(result.capturedAt)) : '—'}`,
          },
          ...prev,
        ]);
        pushToast({
          title: 'Time-Out recorded',
          description: 'Great work today. Drive safe.',
          tone: 'success',
        });
      }

      outsideAttemptsRef.current = 0;
      setOutsideAttempts(0);
      cooldownActiveRef.current = false;
      setCooldownSecondsRemaining(0);
    }).catch((err) => {
      console.error(`Error ticking ${currentPendingAction === 'time-in' ? 'in' : 'out'}:`, err);
      pushToast({
        title: `${actionLabel} failed`,
        description: err?.message || `Database clock-${currentPendingAction === 'time-in' ? 'in' : 'out'} failed. Please try again.`,
        tone: 'error',
      });
    }).finally(() => {
      attendanceWriteInFlightRef.current = false;
    });
    const t = window.setTimeout(() => setScanOpen(false), 1200);
    return () => window.clearTimeout(t);
  }, [phase, result, reload, retryLocation, restricted, setScanOpen, userId]);

  const isClosed = isAttendanceFinalized() && !timeIn;
  const action: AttendanceAction = deriveAttendanceAction(isClosed, timeIn, timeOut);
  const onlineStatus = timeIn && !timeOut ? 'online' : 'offline';
  const duration = timeIn && !timeOut
    ? diffPretty(timeIn)
    : timeIn && timeOut
      ? diffPretty(timeIn, parseTime(timeOut))
      : null;

  return {
    action,
    canTimeIn,
    canTimeOut,
    isOnline,
    onlineStatus: onlineStatus as 'online' | 'offline',
    duration,
    cooldown: {
      isActive: cooldownSecondsRemaining > 0,
      secondsRemaining: cooldownSecondsRemaining,
      outsideAttempts,
      resetCooldown: () => {
        outsideAttemptsRef.current = 0;
        setOutsideAttempts(0);
        cooldownActiveRef.current = false;
        setCooldownSecondsRemaining(0);
      },
    },
    hubAttendance: {
      geofence: hubGeofence,
      distance: hubDistance,
      inGeofence: inHubGeofence,
      isInside: inHubGeofence,
      isLoading: hubGeofenceLoading,
    },
    location: {
      position,
      positionToUse,
      distance: distanceToUse,
      inZone: inZoneToUse,
      geofenceResolved,
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
  };
}
