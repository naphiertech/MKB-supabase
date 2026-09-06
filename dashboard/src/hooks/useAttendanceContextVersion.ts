import { useEffect, useState } from 'react';
import { useAttendanceRealtimeVersion } from '../context/attendanceRealtimeContext';
import { ATTENDANCE_CONTEXT_INVALIDATED } from '../services/attendance/attendanceContextInvalidation';

export function useAttendanceContextVersion(): string {
  const realtime = useAttendanceRealtimeVersion();
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const invalidate = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) setRefresh(value => value + 1);
    };
    window.addEventListener(ATTENDANCE_CONTEXT_INVALIDATED, invalidate);
    window.addEventListener('focus', invalidate);
    window.addEventListener('online', invalidate);
    document.addEventListener('visibilitychange', invalidate);
    const timer = window.setInterval(invalidate, 60_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(ATTENDANCE_CONTEXT_INVALIDATED, invalidate);
      window.removeEventListener('focus', invalidate);
      window.removeEventListener('online', invalidate);
      document.removeEventListener('visibilitychange', invalidate);
    };
  }, []);
  return `${realtime}:${refresh}`;
}
