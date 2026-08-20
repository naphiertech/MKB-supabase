import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AttendanceAction } from '../../components/attendance/AttendanceButton';
import type { ActivityEvent } from '../../components/rider/ActivityTimeline';
import { useFaceRecognition } from '../../hooks/useFaceRecognition';
import { useGeolocation } from '../../hooks/useGeolocation';
import { pushToast } from '../../hooks/useToast';
import { biometricTelemetry, BIOMETRIC_TIMING_NAMES } from '../../lib/biometricTelemetry';
import { isPointInPolygon } from '../../lib/geofenceUtils';
import { canStartRiderAttendance, isRecentRiderPosition } from '../../lib/riderGeolocation';
import { updateCachedAttendanceState } from '../../services/riderCacheService';
import { isAttendanceFinalized, recordTimeIn, recordTimeOut } from '../../services/attendanceService';
import { logRiderLocation, updateRiderStatus } from '../../services/monitoringService';
import { haversine, type Zone } from '../../services/types';
import {
  deriveAttendanceAction,
  diffPretty,
  getLocalDateString,
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
  const [scanOpen, setScanOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'time-in' | 'time-out'>('time-in');
  const finishUserPerceivedTimingRef = useRef<(() => number) | null>(null);
  const setEventsRef = useRef(setEvents);
  setEventsRef.current = setEvents;

  const zoneCenterLat = zone?.center[0] ?? 6.9214;
  const zoneCenterLng = zone?.center[1] ?? 122.0790;
  const zoneRadius = zone?.radius ?? 1000;
  const zoneName = zone?.name ?? 'Talon-Talon';

  const anchor = useMemo(
    () => ({
      lat: zoneCenterLat + 0.0006,
      lng: zoneCenterLng + 0.0004,
    }),
    [zoneCenterLat, zoneCenterLng],
  );

  // GPS/geolocation effects register first inside the controller.
  const {
    position,
    error: locationError,
    isLoading: locationLoading,
    hasVerifiedPosition,
    retry: retryLocation,
  } = useGeolocation({
    initial: anchor,
    enabled: !restricted,
  });

  const verifiedPosition = hasVerifiedPosition ? position : null;
  const canTimeIn = !restricted && canStartRiderAttendance('time-in', verifiedPosition);
  const isOnline = !!timeIn && !timeOut;

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

  // Activity-timeline effects preserve their original dependency behavior and order.
  useEffect(() => {
    if (rider && zone) {
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
    if (!timeIn || timeOut || !zone || !hasVerifiedPosition) return;
    const id = window.setInterval(() => {
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
  }, [timeIn, timeOut, inZone, zoneName, zoneRadius, distance, zone, hasVerifiedPosition]);

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

    const syncLocation = async () => {
      const currentRiderId = actualRiderIdRef.current;
      const currentPosition = positionRef.current;
      const currentInZone = inZoneRef.current;
      if (!currentRiderId || !hasVerifiedPositionRef.current || !isRecentRiderPosition(currentPosition)) return;

      const status: 'active' | 'violation' = currentInZone ? 'active' : 'violation';
      try {
        await logRiderLocation(currentRiderId, currentPosition.lat, currentPosition.lng, status);
        console.log(`[RiderDashboard] Location synced to Supabase: Lat = ${currentPosition.lat}, Lng = ${currentPosition.lng}`);
      } catch (err) {
        console.error('[RiderDashboard] Failed to sync location to database:', err);
      }
    };

    syncLocation();
    const id = setInterval(syncLocation, 30000);
    return () => clearInterval(id);
  }, [timeIn, timeOut, loading, locationLoading, hasVerifiedPosition, actualRiderId, restricted]);

  function openScan(next: 'time-in' | 'time-out') {
    if (restricted) {
      pushToast({
        title: 'Account restricted',
        description: 'Attendance and operational location actions are disabled until full access is restored.',
        tone: 'error',
      });
      return;
    }
    const currentPosition = hasVerifiedPositionRef.current ? positionRef.current : null;
    if (!canStartRiderAttendance(next, currentPosition)) {
      pushToast({
        title: 'Real GPS required',
        description: 'Enable precise location and wait for a current GPS reading before recording Time In.',
        tone: 'error',
      });
      retryLocation();
      return;
    }
    setPendingAction(next);
    reset();
    const telemetryAction = next === 'time-in' ? 'time_in' : 'time_out';
    finishUserPerceivedTimingRef.current = biometricTelemetry.start(
      BIOMETRIC_TIMING_NAMES.userPerceivedTotal(telemetryAction),
    );
    setScanOpen(true);
    window.setTimeout(start, 220);
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

  // Face-match attendance orchestration remains last in the controller effect order.
  useEffect(() => {
    if (phase !== 'matched' || !result?.matched) return;
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

    const stamp = nowHHMM(new Date(result.capturedAt));
    if (currentPendingAction === 'time-in') {
      if (!currentVerifiedPosition) {
        pushToast({
          title: 'Time-In paused',
          description: 'The GPS reading expired during verification. Acquire a new location and try again.',
          tone: 'error',
        });
        setScanOpen(false);
        retryLocation();
        return;
      }
      const finishAttendancePersistence = biometricTelemetry.start(
        BIOMETRIC_TIMING_NAMES.attendancePersistence('time_in'),
      );
      recordTimeIn(currentRiderId).then(async (newLog) => {
        finishAttendancePersistence();
        if (!newLog) {
          pushToast({
            title: 'Time-In failed',
            description: 'Database clock-in failed. Please try again.',
            tone: 'error',
          });
          return;
        }

        const finishStatusPersistence = biometricTelemetry.start(
          BIOMETRIC_TIMING_NAMES.riderStatusPersistence('time_in'),
        );
        try {
          await updateRiderStatus(currentRiderId, 'active', currentVerifiedPosition.lat, currentVerifiedPosition.lng);
          await logRiderLocation(currentRiderId, currentVerifiedPosition.lat, currentVerifiedPosition.lng, 'active');
        } catch (err) {
          console.error('[RiderDashboard] Failed to push initial time-in coordinates:', err);
        } finally {
          finishStatusPersistence();
        }

        if (!navigator.onLine) {
          await updateCachedAttendanceState(userId, currentRiderId, {
            id: newLog.id,
            rider_id: currentRiderId,
            date: newLog.date,
            time_in: newLog.rawTimeIn || null,
            time_out: null,
            hours: 0,
            status: 'present',
          });
        }

        const finishDashboardRefresh = biometricTelemetry.start(
          BIOMETRIC_TIMING_NAMES.dashboardRefresh('time_in'),
        );
        try {
          await reload();
        } finally {
          finishDashboardRefresh();
        }
        finishUserPerceivedTimingRef.current?.();
        finishUserPerceivedTimingRef.current = null;

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
      }).catch((err) => {
        finishAttendancePersistence();
        console.error('Error ticking in:', err);
        pushToast({
          title: 'Time-In failed',
          description: 'Database clock-in failed. Please try again.',
          tone: 'error',
        });
      });
    } else {
      const activeLogId = attendanceRef.current.id;
      if (!activeLogId) {
        console.error('[RiderDashboard] Cannot record time-out: No active attendance log ID.');
        pushToast({
          title: 'Time-Out failed',
          description: 'Active shift record not found. Please refresh and try again.',
          tone: 'error',
        });
        return;
      }

      const finishAttendancePersistence = biometricTelemetry.start(
        BIOMETRIC_TIMING_NAMES.attendancePersistence('time_out'),
      );
      recordTimeOut(activeLogId, {
        riderId: currentRiderId,
        date: getLocalDateString(),
        ...(currentVerifiedPosition
          ? { lat: currentVerifiedPosition.lat, lng: currentVerifiedPosition.lng }
          : {}),
      }).then(async (success) => {
        finishAttendancePersistence();
        if (!success) {
          pushToast({
            title: 'Time-Out failed',
            description: 'Database clock-out failed. Please try again.',
            tone: 'error',
          });
          return;
        }

        const finishStatusPersistence = biometricTelemetry.start(
          BIOMETRIC_TIMING_NAMES.riderStatusPersistence('time_out'),
        );
        try {
          await updateRiderStatus(
            currentRiderId,
            'offline',
            currentVerifiedPosition?.lat,
            currentVerifiedPosition?.lng,
          );
        } catch (err) {
          console.error('[RiderDashboard] Failed to update offline status:', err);
        } finally {
          finishStatusPersistence();
        }

        if (!navigator.onLine) {
          await updateCachedAttendanceState(userId, currentRiderId, {
            id: activeLogId,
            rider_id: currentRiderId,
            date: getLocalDateString(),
            time_in: currentTimeIn,
            time_out: new Date().toISOString(),
            hours: 0,
            status: 'present',
          });
        }

        const finishDashboardRefresh = biometricTelemetry.start(
          BIOMETRIC_TIMING_NAMES.dashboardRefresh('time_out'),
        );
        try {
          await reload();
        } finally {
          finishDashboardRefresh();
        }
        finishUserPerceivedTimingRef.current?.();
        finishUserPerceivedTimingRef.current = null;

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
      }).catch((err) => {
        finishAttendancePersistence();
        console.error('Error ticking out:', err);
        pushToast({
          title: 'Time-Out failed',
          description: 'Database clock-out failed. Please try again.',
          tone: 'error',
        });
      });
    }
    const t = window.setTimeout(() => setScanOpen(false), 1200);
    return () => window.clearTimeout(t);
  }, [phase, result, reload, retryLocation, restricted, userId]);

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
    isOnline,
    onlineStatus: onlineStatus as 'online' | 'offline',
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
  };
}
