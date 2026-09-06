import { useCallback, useEffect, useRef, useState } from 'react';
import { useRiderZone } from '../../context/RiderZoneContext';
import { useAttendanceContextVersion } from '../../hooks/useAttendanceContextVersion';
import { setCachedDescriptor } from '../../lib/descriptorCache';
import {
  fetchRiderDashboardWithSWR,
  type CachedDashboardPayload,
} from '../../services/riders/riderCacheService';
import type { Zone } from '../../services/types';
import {
  getLocalDateString,
  mapCachedDashboardPayloadToState,
  type DashboardActiveViolation,
  type DashboardAttendanceLog,
  type DashboardAttendanceState,
  type DashboardRider,
  type DashboardStats,
} from './riderDashboardModel';

interface UseRiderDashboardDataInput {
  userId: string;
  riderId: string;
}

export interface RiderDashboardData {
  actualRiderId: string;
  rider: DashboardRider | null;
  zone: Zone | null;
  loading: boolean;
  attendance: DashboardAttendanceState;
  activeViolation: DashboardActiveViolation | null;
  stats: DashboardStats;
  monthAttendanceLogs: DashboardAttendanceLog[];
  reload: () => Promise<void>;
  updateRiderFaceDescriptor: (descriptor: number[]) => void;
}

export function useRiderDashboardData({
  userId,
  riderId,
}: UseRiderDashboardDataInput): RiderDashboardData {
  const { zones: allZones } = useRiderZone();
  const [actualRiderId, setActualRiderId] = useState<string>(riderId);
  const [rider, setRider] = useState<DashboardRider | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeViolation, setActiveViolation] = useState<DashboardActiveViolation | null>(null);
  const [attendance, setAttendance] = useState<DashboardAttendanceState>({
    id: null,
    timeIn: null,
    timeOut: null,
  });
  const [stats, setStats] = useState<DashboardStats>({
    daysPresent: 0,
    hoursThisWeek: 0,
    violationsThisMonth: 0,
  });
  const [monthAttendanceLogs, setMonthAttendanceLogs] = useState<DashboardAttendanceLog[]>([]);
  const attendanceRealtimeVersion = useAttendanceContextVersion();
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!mountedRef.current) return;
    const requestId = ++requestIdRef.current;
    const ownsRequest = () => mountedRef.current && requestIdRef.current === requestId;
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
        if (!ownsRequest()) return;
        const mapped = mapCachedDashboardPayloadToState(payload, firstDayOfWeekStr, todayStr);

        setActualRiderId(mapped.resolvedRiderId);

        if (mapped.rider) {
          setRider(mapped.rider);
          if (payload.dbRider?.face_descriptor && Array.isArray(payload.dbRider.face_descriptor) && payload.dbRider.face_descriptor.length === 128) {
            setCachedDescriptor(payload.dbRider.id, payload.dbRider.face_descriptor, mapped.rider.avatar);
          }
        }

        setAttendance(mapped.attendance);
        setActiveViolation(mapped.activeViolation);
        setMonthAttendanceLogs(mapped.monthAttendanceLogs);
        setStats(mapped.stats);
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
          },
        },
      );
    } catch (err) {
      if (!ownsRequest()) return;
      console.error('Error loading rider dashboard data:', err);
      setLoading(false);
    }
  }, [userId, riderId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload, attendanceRealtimeVersion]);

  useEffect(() => {
    const resolvedZone = rider?.zoneId
      ? allZones.find((candidate) => candidate.id === rider.zoneId) ?? null
      : null;
    setZone(resolvedZone);
  }, [allZones, rider?.zoneId]);

  const updateRiderFaceDescriptor = useCallback((descriptor: number[]) => {
    setRider((current) => current ? { ...current, faceDescriptor: descriptor } : null);
  }, []);

  return {
    actualRiderId,
    rider,
    zone,
    loading,
    attendance,
    activeViolation,
    stats,
    monthAttendanceLogs,
    reload,
    updateRiderFaceDescriptor,
  };
}
