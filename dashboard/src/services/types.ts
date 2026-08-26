export type RiderStatus = 'active' | 'idle' | 'violation' | 'offline';
export type AttendanceStatus = 'present' | 'late' | 'on_leave' | 'absent';
export type AttendancePresence = 'present' | 'absent' | 'on_leave';
export type PunctualityStatus = 'on_time' | 'late' | 'none';
export type UserRole = 'admin' | 'hr' | 'dispatcher' | 'rider' | 'payroll';
export type UserStatus = 'active' | 'suspended';
export type EmploymentStatus = 'active' | 'archived';
export type ZoneStatus = 'active' | 'inactive';

export interface Zone {
  id: string;
  hubId?: string | null;
  name: string;
  center: [number, number]; // [lat, lng]
  radius: number; // meters
  color: string;
  status?: ZoneStatus;
  zone_type?: 'circle' | 'polygon';
  polygon_coordinates?: [number, number][];
  /** False when Supabase did not provide usable operational geometry. */
  hasValidGeometry?: boolean;
}

export interface Rider {
  id: string;
  hubId?: string | null;
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
  hubId?: string | null;
  riderId: string;
  riderName: string;
  riderAvatar: string;
  date: string; // ISO date
  timeIn: string | null; // HH:MM
  timeOut: string | null;
  rawTimeIn?: string | null;
  rawTimeOut?: string | null;
  hours: number;
  zoneId: string;
  zoneName: string;
  zoneContext?: 'assignment_history' | 'current_assignment';
  status: AttendanceStatus;
  presence: AttendancePresence;
  punctuality: PunctualityStatus;
  completionStatus?: AttendanceCompletionStatus;
  source: 'face-scan' | 'manual' | 'system';
  faceScanUrl?: string;
  lat?: number;
  lng?: number;
  notes?: string | null;
  events: {ts: string; type: 'enter' | 'exit' | 'idle'; zone: string;}[];
}

export type AttendanceCompletionStatus = 'complete' | 'active' | 'missing_time_out' | 'absent';

export interface ViolationEvent {
  id: string;
  hubId?: string | null;
  riderId: string;
  riderName: string;
  zoneId?: string;
  zoneName: string;
  ts: number;
  type: 'boundary_exit' | 'idle_timeout' | 'manual_flag';
  read: boolean;
  lat?: number;
  lng?: number;
  resolved?: boolean;
  resolvedAt?: number;
}

export interface AppUser {
  id: string;
  name: string;
  avatar: string;
  email: string;
  role: UserRole;
  zoneId: string | null;
  hubId?: string | null;
  hubAccessScope?: 'global' | 'assigned';
  authorizedHubIds?: string[];
  status: UserStatus;
  employmentStatus: EmploymentStatus;
  operationalStatus?: RiderStatus | null;
  archiveEffectiveDate?: string | null;
  archiveReason?: string | null;
  archiveRemarks?: string | null;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archivedByName?: string | null;
  restoredAt?: string | null;
  restoredBy?: string | null;
  restoreReason?: string | null;
  lastLogin: number;
  contact?: string | null;
  mkbRiderId?: string | null;
  riderId?: string | null;
  shift?: string | null;
  faceImage?: string | null;
  faceDescriptor?: number[] | null;
  province?: string | null;
  city?: string | null;
  barangay?: string | null;
  zipCode?: string | null;
  streetAddress?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  employmentType?: string | null;
  dateOfHire?: string | null;
  vehicleType?: string | null;
  vehiclePlateNumber?: string | null;
  notes?: string | null;
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
