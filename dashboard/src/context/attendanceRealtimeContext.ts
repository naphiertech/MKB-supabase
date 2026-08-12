import { createContext, useContext } from 'react';

export const AttendanceRealtimeContext = createContext(0);

export function useAttendanceRealtimeVersion(): number {
  return useContext(AttendanceRealtimeContext);
}
