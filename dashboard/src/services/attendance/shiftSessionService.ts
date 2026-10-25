import { biometricTelemetry, BIOMETRIC_TIMING_NAMES } from '../../lib/biometricTelemetry';
import { notifyAttendanceEvent } from '../../lib/nativeNotifications';
import { startForegroundDutyTracking, stopForegroundDutyTracking } from '../../lib/foregroundTracking';
import { updateCachedAttendanceState } from '../riders/riderCacheService';
import { recordTimeIn, recordTimeOut } from './attendanceService';
import { logRiderLocation, updateRiderStatus } from '../monitoring/monitoringService';
import { getLocalDateString, nowHHMM } from '../../pages/rider-dashboard/riderDashboardModel';

export interface ShiftPositionInput {
  lat: number;
  lng: number;
  accuracy?: number;
  ts: number | string;
}

export interface ExecuteShiftTransitionInput {
  riderId: string;
  userId: string;
  action: 'time-in' | 'time-out';
  activeLogId?: string | null;
  currentTimeIn?: string | null;
  hubName?: string;
  position: ShiftPositionInput;
  inZone: boolean | null;
  capturedAt?: string | number | Date;
  reload: () => Promise<void>;
}

export interface ShiftTransitionResult {
  newLogId?: string;
  stamp: string;
  action: 'time-in' | 'time-out';
}

/**
 * Executes the complete post-verification Shift Session sequence:
 * 1. Attendance persistence (RPC with biometric timing)
 * 2. Realtime rider status & GPS telemetry update
 * 3. Offline cache patching (if disconnected)
 * 4. Dashboard SWR revalidation
 * 5. Native push notifications & foreground duty tracking
 */
export async function executeShiftTransition(
  input: ExecuteShiftTransitionInput,
): Promise<ShiftTransitionResult> {
  const {
    riderId,
    userId,
    action,
    activeLogId,
    currentTimeIn,
    hubName,
    position,
    inZone,
    capturedAt,
    reload,
  } = input;

  const stamp = nowHHMM(capturedAt ? new Date(capturedAt) : new Date());

  if (action === 'time-in') {
    const finishAttendancePersistence = biometricTelemetry.start(
      BIOMETRIC_TIMING_NAMES.attendancePersistence('time_in'),
    );

    let newLog;
    try {
      newLog = await recordTimeIn(riderId, {
        lat: position.lat,
        lng: position.lng,
        accuracy: position.accuracy,
        positionTimestamp: position.ts,
      });
    } finally {
      finishAttendancePersistence();
    }

    if (!newLog) {
      throw new Error('Database clock-in failed. Please try again.');
    }

    const finishStatusPersistence = biometricTelemetry.start(
      BIOMETRIC_TIMING_NAMES.riderStatusPersistence('time_in'),
    );
    try {
      await updateRiderStatus(riderId, 'active', position.lat, position.lng);
      if (inZone === null) {
        await logRiderLocation(riderId, position.lat, position.lng);
      } else {
        await logRiderLocation(riderId, position.lat, position.lng, 'active');
      }
    } catch (err) {
      console.error('[ShiftSession] Failed to push initial time-in coordinates:', err);
    } finally {
      finishStatusPersistence();
    }

    if (!navigator.onLine) {
      await updateCachedAttendanceState(userId, riderId, {
        id: newLog.id,
        rider_id: riderId,
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

    void notifyAttendanceEvent({ type: 'time-in', timestamp: stamp });
    void startForegroundDutyTracking({
      riderId,
      hubName: hubName || 'Assigned Hub',
    });

    return {
      newLogId: newLog.id ?? undefined,
      stamp,
      action: 'time-in',
    };
  } else {
    if (!activeLogId) {
      throw new Error('Active shift record not found. Please refresh and try again.');
    }

    const finishAttendancePersistence = biometricTelemetry.start(
      BIOMETRIC_TIMING_NAMES.attendancePersistence('time_out'),
    );

    let success = false;
    try {
      success = await recordTimeOut(activeLogId, {
        riderId,
        date: getLocalDateString(),
        lat: position.lat,
        lng: position.lng,
        accuracy: position.accuracy,
        positionTimestamp: position.ts,
      });
    } finally {
      finishAttendancePersistence();
    }

    if (!success) {
      throw new Error('Database clock-out failed. Please try again.');
    }

    const finishStatusPersistence = biometricTelemetry.start(
      BIOMETRIC_TIMING_NAMES.riderStatusPersistence('time_out'),
    );
    try {
      await updateRiderStatus(riderId, 'offline', position.lat, position.lng);
    } catch (err) {
      console.error('[ShiftSession] Failed to update offline status:', err);
    } finally {
      finishStatusPersistence();
    }

    if (!navigator.onLine) {
      await updateCachedAttendanceState(userId, riderId, {
        id: activeLogId,
        rider_id: riderId,
        date: getLocalDateString(),
        time_in: currentTimeIn || null,
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

    void notifyAttendanceEvent({ type: 'time-out', timestamp: stamp });
    void stopForegroundDutyTracking();

    return {
      stamp,
      action: 'time-out',
    };
  }
}
