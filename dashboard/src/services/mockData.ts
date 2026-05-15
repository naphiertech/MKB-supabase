// Mock data for AttenRider admin module
// TODO: Replace with Supabase queries when wiring to production backend

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
  events: {ts: string;type: 'enter' | 'exit' | 'idle';zone: string;}[];
}

export interface ViolationEvent {
  id: string;
  riderId: string;
  riderName: string;
  zoneName: string;
  ts: number;
  type: 'boundary_exit' | 'boundary_enter' | 'idle_excess';
  read: boolean;
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

// 5 zones around Zamboanga City (~6.92, 122.07)
export const zones: Zone[] = [
{
  id: 'z-talon',
  name: 'Talon-Talon',
  center: [6.9214, 122.079],
  radius: 1200,
  color: '#db6c00',
  status: 'active'
},
{
  id: 'z-calarian',
  name: 'Calarian',
  center: [6.9105, 122.061],
  radius: 1100,
  color: '#f59e0b',
  status: 'active'
},
{
  id: 'z-tetuan',
  name: 'Tetuan',
  center: [6.918, 122.073],
  radius: 950,
  color: '#b85a00',
  status: 'active'
},
{
  id: 'z-tumaga',
  name: 'Tumaga',
  center: [6.932, 122.086],
  radius: 1050,
  color: '#d97706',
  status: 'active'
},
{
  id: 'z-guiwan',
  name: 'Guiwan',
  center: [6.945, 122.099],
  radius: 1300,
  color: '#ea580c',
  status: 'inactive'
}];


const FILIPINO_NAMES = [
'Juan dela Cruz',
'Maria Santos',
'Jose Rizal',
'Andres Bonifacio',
'Emilio Aguinaldo',
'Gabriela Silang',
'Apolinario Mabini',
'Melchora Aquino',
'Diego Silang',
'Lapu-Lapu Mendoza',
'Carlos Garcia',
'Rosa Villanueva',
'Felipe Reyes',
'Teresa Magbanua',
'Antonio Luna',
'Marcelo del Pilar',
'Leona Florentino',
'Pedro Paterno',
'Sultan Kudarat',
'Trinidad Tecson'];


const avatarFor = (seed: string) =>
`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=1a1d27`;

const now = Date.now();

// 20 riders distributed across zones with slight scatter
export const riders: Rider[] = FILIPINO_NAMES.map((name, i) => {
  const zone = zones[i % zones.length];
  // small jitter so they're inside their zone
  const jLat = (Math.random() - 0.5) * 0.012;
  const jLng = (Math.random() - 0.5) * 0.012;
  // Mostly active, some idle, a couple in violation, a couple offline
  let status: RiderStatus = 'active';
  if (i === 3 || i === 11) status = 'violation';else
  if (i === 6 || i === 14 || i === 17) status = 'idle';else
  if (i === 18 || i === 19) status = 'offline';

  // Violation riders: push them out of zone
  let lat = zone.center[0] + jLat;
  let lng = zone.center[1] + jLng;
  if (status === 'violation') {
    lat = zone.center[0] + 0.018 * (Math.random() > 0.5 ? 1 : -1);
    lng = zone.center[1] + 0.018 * (Math.random() > 0.5 ? 1 : -1);
  }

  const shifts: Rider['shift'][] = ['morning', 'afternoon', 'evening'];

  return {
    id: `r-${i + 1}`,
    name,
    avatar: avatarFor(name),
    zoneId: zone.id,
    status,
    lat,
    lng,
    speed: status === 'idle' ? 0 : Math.round(Math.random() * 35 + 5),
    shift: shifts[i % 3],
    lastPing: now - Math.floor(Math.random() * 120_000),
    phone: `+63 9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
    riderCode: `MKB-${String(1000 + i)}`
  };
});

// Attendance logs — last 7 days for each rider
const STATUS_POOL: AttendanceStatus[] = [
'present',
'present',
'present',
'late',
'on_leave',
'absent'];


function dateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export const attendanceLogs: AttendanceLog[] = [];
riders.forEach((rider) => {
  for (let d = 0; d < 7; d++) {
    const status =
    d === 0 && rider.status === 'offline' ?
    'absent' :
    STATUS_POOL[Math.floor(Math.random() * STATUS_POOL.length)];
    const zone = zones.find((z) => z.id === rider.zoneId)!;
    const baseHour =
    rider.shift === 'morning' ? 6 : rider.shift === 'afternoon' ? 13 : 18;
    const lateOffset =
    status === 'late' ? Math.floor(Math.random() * 50) + 15 : 0;
    const inH = baseHour;
    const inM = lateOffset;
    const outH = baseHour + 8;
    const timeIn =
    status === 'on_leave' || status === 'absent' ?
    null :
    `${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}`;
    const timeOut =
    status === 'on_leave' || status === 'absent' || d === 0 ?
    null :
    `${String(outH).padStart(2, '0')}:${String(Math.floor(Math.random() * 30)).padStart(2, '0')}`;
    const hours = timeIn && timeOut ? 8 - lateOffset / 60 : 0;

    attendanceLogs.push({
      id: `att-${rider.id}-${d}`,
      riderId: rider.id,
      riderName: rider.name,
      riderAvatar: rider.avatar,
      date: dateOffset(d),
      timeIn,
      timeOut,
      hours: Math.round(hours * 10) / 10,
      zoneId: zone.id,
      zoneName: zone.name,
      status,
      source: Math.random() > 0.15 ? 'face-scan' : 'manual',
      faceScanUrl: avatarFor(rider.name + '-scan'),
      events: timeIn ?
      [
      { ts: `${timeIn}:12`, type: 'enter', zone: zone.name },
      {
        ts: `${String(baseHour + 2).padStart(2, '0')}:14:08`,
        type: 'exit',
        zone: zone.name
      },
      {
        ts: `${String(baseHour + 2).padStart(2, '0')}:38:51`,
        type: 'enter',
        zone: zone.name
      },
      ...(timeOut ?
      [
      {
        ts: `${timeOut}:00`,
        type: 'exit' as const,
        zone: zone.name
      }] :

      [])] :

      []
    });
  }
});

// Initial violations
export const violations: ViolationEvent[] = [
{
  id: 'v-1',
  riderId: riders[3].id,
  riderName: riders[3].name,
  zoneName: zones.find((z) => z.id === riders[3].zoneId)!.name,
  ts: now - 45_000,
  type: 'boundary_exit',
  read: false
},
{
  id: 'v-2',
  riderId: riders[11].id,
  riderName: riders[11].name,
  zoneName: zones.find((z) => z.id === riders[11].zoneId)!.name,
  ts: now - 5 * 60_000,
  type: 'boundary_exit',
  read: false
},
{
  id: 'v-3',
  riderId: riders[6].id,
  riderName: riders[6].name,
  zoneName: zones.find((z) => z.id === riders[6].zoneId)!.name,
  ts: now - 12 * 60_000,
  type: 'idle_excess',
  read: true
},
{
  id: 'v-4',
  riderId: riders[14].id,
  riderName: riders[14].name,
  zoneName: zones.find((z) => z.id === riders[14].zoneId)!.name,
  ts: now - 28 * 60_000,
  type: 'boundary_exit',
  read: true
}];


// Users
export const users: AppUser[] = [
{
  id: 'u-1',
  name: 'Renata Cruz',
  avatar: avatarFor('Renata Cruz'),
  email: 'admin@mkb.ph',
  role: 'admin',
  zoneId: null,
  status: 'active',
  lastLogin: now - 60_000 * 3
},
{
  id: 'u-hr-1',
  name: 'Patricia Domingo',
  avatar: avatarFor('Patricia Domingo'),
  email: 'hr@mkb.ph',
  role: 'hr',
  zoneId: null,
  status: 'active',
  lastLogin: now - 60_000 * 7
},
{
  id: 'u-payroll-1',
  name: 'Sofia Reyes',
  avatar: avatarFor('Sofia Reyes'),
  email: 'payroll@mkb.ph',
  role: 'payroll',
  zoneId: null,
  status: 'active',
  lastLogin: now - 60_000 * 5
},
{
  id: 'u-2',
  name: 'Marco Velasco',
  avatar: avatarFor('Marco Velasco'),
  email: 'marco.velasco@mkb.ph',
  role: 'dispatcher',
  zoneId: 'z-talon',
  status: 'active',
  lastLogin: now - 60_000 * 12
},
{
  id: 'u-3',
  name: 'Liza Mercado',
  avatar: avatarFor('Liza Mercado'),
  email: 'liza.mercado@mkb.ph',
  role: 'dispatcher',
  zoneId: 'z-calarian',
  status: 'active',
  lastLogin: now - 60_000 * 38
},
...riders.map((r, i) => ({
  id: `u-rider-${r.id}`,
  name: r.name,
  avatar: r.avatar,
  email: r.name.toLowerCase().replace(/\s+/g, '.') + '@riders.mkb.ph',
  role: 'rider' as const,
  zoneId: r.zoneId,
  status: (i === 18 || i === 19 ? 'suspended' : 'active') as UserStatus,
  lastLogin: now - 60_000 * (Math.floor(Math.random() * 240) + 1)
}))];


// Daily attendance rate for last 30 days (for reports chart)
export const dailyAttendanceRate = Array.from({ length: 30 }, (_, i) => ({
  day: dateOffset(29 - i),
  rate: Math.round((Math.random() * 20 + 75) * 10) / 10
}));

export const violationsByZone = zones.map((z) => ({
  zone: z.name,
  violations: Math.floor(Math.random() * 14) + 2
}));

export const statusMix = [
{
  name: 'Active',
  value: riders.filter((r) => r.status === 'active').length,
  color: '#10B981'
},
{
  name: 'Idle',
  value: riders.filter((r) => r.status === 'idle').length,
  color: '#F59E0B'
},
{
  name: 'Violation',
  value: riders.filter((r) => r.status === 'violation').length,
  color: '#EF4444'
},
{
  name: 'Offline',
  value: riders.filter((r) => r.status === 'offline').length,
  color: '#6B7280'
}];


// Utility: distance in meters between two lat/lng
export function haversine(
lat1: number,
lng1: number,
lat2: number,
lng2: number)
: number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
  Math.sin(dLat / 2) ** 2 +
  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}