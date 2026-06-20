export type RiderStatus = 'active' | 'idle' | 'violation' | 'offline';
export type AttendanceStatus = 'present' | 'late' | 'on_leave' | 'absent';
export type UserRole = 'admin' | 'hr' | 'dispatcher' | 'rider' | 'payroll';
export type UserStatus = 'active' | 'suspended';
export type ZoneStatus = 'active' | 'inactive';

export interface Zone {
  id: string;
  name: string;
  center: [number, number]; // [lat, lng]
  radius: number; // meters
  color: string;
  status?: ZoneStatus;
}

export interface Rider {
  id: string;
  name: string;
  avatar: string;
  zoneId: string | null;
  status: RiderStatus;
  lat: number;
  lng: number;
  speed: number; // km/h
  shift: 'morning' | 'afternoon' | 'evening';
  lastPing: number; // ms timestamp
  phone: string;
  riderCode: string;
}

export interface AttendanceLog {
  id: string;
  riderId: string;
  riderName: string;
  riderAvatar: string;
  date: string; // ISO date
  timeIn: string | null; // HH:MM
  timeOut: string | null;
  hours: number;
  zoneId: string;
  zoneName: string;
  status: AttendanceStatus;
  source: 'face-scan' | 'manual';
  faceScanUrl?: string;
  events: {ts: string; type: 'enter' | 'exit' | 'idle'; zone: string;}[];
}

export interface ViolationEvent {
  id: string;
  riderId: string;
  riderName: string;
  zoneName: string;
  ts: number;
  type: 'boundary_exit' | 'boundary_enter' | 'idle_excess';
  read: boolean;
  lat?: number;
  lng?: number;
}

export interface AppUser {
  id: string;
  name: string;
  avatar: string;
  email: string;
  role: UserRole;
  zoneId: string | null;
  status: UserStatus;
  lastLogin: number;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  timestamp: string;
  speed: number;
}

export interface ShiftRoute {
  riderId: string;
  date: string;
  points: RoutePoint[];
}

export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
