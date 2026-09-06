import type { AppUser } from '../../services/types';
import { getAttendanceContextLabel, type AttendanceContextCode } from '../../services/attendance/attendanceContextService';
import { formatManilaDate } from './exportUtils';

export interface EmployeeProfileDocumentInput {
  user: AppUser;
  zoneName: string;
  formattedHireDate: string;
  formattedLastLogin: string;
  generatedAt?: string | number | Date;
}

export interface EmployeeProfileDocumentData {
  employee: { name: string; role: string; zoneName: string };
  generatedOn: string;
  sections: { basic: string[][]; contact: string[][]; operations: string[][] };
}

export function buildEmployeeProfileDocumentData({
  user, zoneName, formattedHireDate, formattedLastLogin, generatedAt = new Date(),
}: EmployeeProfileDocumentInput): EmployeeProfileDocumentData {
  const isRider = user.role === 'rider';
  return {
    employee: {
      name: user.name || '—', role: (user.role || '—').toUpperCase(), zoneName,
    },
    generatedOn: formatManilaDate(generatedAt, 'long'),
    sections: {
      basic: [
        ['Full Name', user.name || '—'],
        ['Role / Title', (user.role || '—').toUpperCase()],
        ['Employee ID (MKB ID)', user.mkbRiderId || '—'],
        ['Employment Type', user.employmentType || '—'],
        ['Date Joined / Hire', formattedHireDate],
        ['Assigned Operational Zone', zoneName],
        ['Account Registry Status', user.status || '—'],
      ],
      contact: [
        ['Primary Email', user.email || '—'],
        ['Phone Number', user.contact || '—'],
        ['Last Active Time', formattedLastLogin],
        ['Street Address', user.streetAddress || '—'],
        ['Barangay', user.barangay || '—'],
        ['City', user.city || '—'],
        ['Province', user.province || '—'],
        ['Zip Code', user.zipCode || '—'],
      ],
      operations: [
        ['Vehicle Type / Class', isRider ? (user.vehicleType || '—') : 'Not applicable'],
        ['Vehicle License Plate', isRider ? (user.vehiclePlateNumber || '—') : 'Not applicable'],
        ['Emergency Contact Person', user.emergencyContactName || '—'],
        ['Emergency Contact Phone', user.emergencyContactPhone || '—'],
        ['Biometric Scan Enrolled', user.faceImage ? 'Yes (Enrolled)' : 'No (Pending)'],
        ['Onboarding Notes / Remarks', user.notes || 'No remarks recorded'],
      ],
    },
  };
}

export interface DtrAttendanceLog {
  date: string;
  timeIn: string | null;
  timeOut: string | null;
  hours: number;
  status?: string;
  contextCode?: string | null;
}

export interface DtrDocumentInput {
  riderName: string;
  riderRole: string;
  zoneName: string;
  calendarDate: Date;
  logs: DtrAttendanceLog[];
}

export interface DtrDocumentRow {
  day: number | 'TOTAL';
  amIn: string;
  amOut: string;
  pmIn: string;
  pmOut: string;
  overtimeIn: string;
  overtimeOut: string;
  undertimeHours: string;
  undertimeMinutes: string;
  statusText?: string;
  contextText?: string;
}

export interface DtrDocumentData {
  employee: { name: string; role: string; zoneName: string };
  month: { year: number; monthName: string; daysInMonth: number };
  rows: DtrDocumentRow[];
  contextNotes: string[];
}

function formatDtrTimeString(value: string | null): string {
  if (!value) return '';
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export function buildDtrDocumentData(input: DtrDocumentInput): DtrDocumentData {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric',
  }).formatToParts(input.calendarDate);
  const year = Number(dateParts.find(part => part.type === 'year')?.value);
  const monthIndex = Number(dateParts.find(part => part.type === 'month')?.value) - 1;
  const referenceMonth = new Date(Date.UTC(year, monthIndex, 1));
  const monthName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'long',
  }).format(referenceMonth);
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  let totalMinutes = 0;
  const rows: DtrDocumentRow[] = [];
  const contextNotes: string[] = [];

  for (let day = 1; day <= 31; day += 1) {
    const row: DtrDocumentRow = {
      day, amIn: '', amOut: '', pmIn: '', pmOut: '', overtimeIn: '', overtimeOut: '',
      undertimeHours: '', undertimeMinutes: '',
    };
    if (day <= daysInMonth) {
      const date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const log = input.logs.find(item => item.date === date);
      if (log) {
        const statusText = log.status ? log.status.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : undefined;
        const contextText = getAttendanceContextLabel(log.contextCode as AttendanceContextCode | null | undefined) ?? undefined;
        row.statusText = statusText;
        row.contextText = contextText;
        const resolvedContext = contextText ?? (log.status === 'day_off' ? 'Published Day Off' : (log.status === 'on_leave' ? 'Approved Leave' : undefined));
        if (resolvedContext) {
          const detail = contextText && contextText !== statusText ? ` · ${contextText}` : (statusText && statusText !== resolvedContext ? ` · ${resolvedContext}` : '');
          contextNotes.push(`${date}: ${statusText || resolvedContext}${detail}`);
        }
        const timeIn = formatDtrTimeString(log.timeIn);
        const timeOut = formatDtrTimeString(log.timeOut);
        if (timeIn) (Number(timeIn.slice(0, 2)) < 12 ? row.amIn = timeIn : row.pmIn = timeIn);
        if (timeOut) (Number(timeOut.slice(0, 2)) < 12 ? row.amOut = timeOut : row.pmOut = timeOut);
        if (log.hours > 8) {
          row.overtimeIn = '17:00';
          row.overtimeOut = timeOut;
        }
        totalMinutes += Math.round(log.hours * 60);
      }
    }
    rows.push(row);
  }

  rows.push({
    day: 'TOTAL', amIn: '', amOut: '', pmIn: '', pmOut: '', overtimeIn: '', overtimeOut: '',
    undertimeHours: `${Math.floor(totalMinutes / 60)}h`, undertimeMinutes: `${totalMinutes % 60}m`,
  });

  return {
    employee: { name: input.riderName, role: input.riderRole, zoneName: input.zoneName },
    month: { year, monthName, daysInMonth },
    rows,
    contextNotes,
  };
}
