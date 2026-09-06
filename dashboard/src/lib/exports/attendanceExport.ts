import type { AttendanceLog } from '../../services/types';
import type { AttendanceContextLog } from '../../services/attendance/attendanceContextService';
import { getAttendanceContextLabel } from '../../services/attendance/attendanceContextService';
import { buildExportFilename, downloadCsv } from './exportUtils';
import { exportPDF, type ReportData } from './reportExport';

export interface AttendanceDocumentRow {
  riderName: string;
  date: string;
  timeIn: string | null;
  timeOut: string | null;
  hours: number;
  zoneName: string;
  status: string;
  context: string | null;
  source: string | null;
}

export interface AttendanceDocumentData {
  period: { from: string; to: string };
  rows: AttendanceDocumentRow[];
}

export function buildAttendanceDocumentData(
  logs: Array<AttendanceLog | AttendanceContextLog>,
  period: { from: string; to: string },
): AttendanceDocumentData {
  return {
    period,
    rows: logs.map(log => ({
      riderName: log.riderName,
      date: log.date,
      timeIn: log.timeIn,
      timeOut: log.timeOut,
      hours: log.hours,
      zoneName: log.zoneName,
      status: log.status,
      context: 'contextCode' in log ? getAttendanceContextLabel(log.contextCode) : null,
      source: log.source,
    })),
  };
}

function attendanceFilename(data: AttendanceDocumentData, extension: 'csv' | 'pdf'): string {
  return buildExportFilename({
    prefix: 'attendance',
    from: data.period.from,
    to: data.period.to,
    extension,
  });
}

export function renderAttendanceCsv(data: AttendanceDocumentData): void {
  const headers = ['Rider Name', 'Date', 'Time In', 'Time Out', 'Hours', 'Zone', 'Status', 'Context', 'Source'];
  const rows = data.rows.map(row => [
    row.riderName,
    row.date,
    row.timeIn ?? '',
    row.timeOut ?? '',
    row.hours ? row.hours.toFixed(2) : '0.00',
    row.zoneName,
    row.status,
    row.context ?? '',
    row.source ?? '',
  ]);
  downloadCsv([headers, ...rows], attendanceFilename(data, 'csv'));
}

export function renderAttendancePdf(data: AttendanceDocumentData): void {
  const report: ReportData = {
    title: 'Attendance Records Report',
    columns: ['Rider', 'Date', 'Time-In', 'Time-Out', 'Hours', 'Zone', 'Status', 'Context', 'Source'],
    rows: data.rows.map(row => [
      row.riderName,
      row.date,
      row.timeIn ?? '—',
      row.timeOut ?? '—',
      `${row.hours.toFixed(1)}h`,
      row.zoneName,
      row.status.toUpperCase(),
      row.context ?? '—',
      row.source === 'face-scan' ? 'Face Scan' : row.source === 'manual' ? 'Manual' : row.source === 'system' ? 'System' : '—',
    ]),
  };
  exportPDF(report, attendanceFilename(data, 'pdf').replace(/\.pdf$/, ''), data.period);
}

export function exportAttendanceCsv(logs: Array<AttendanceLog | AttendanceContextLog>, period: { from: string; to: string }): void {
  renderAttendanceCsv(buildAttendanceDocumentData(logs, period));
}

export function exportAttendancePdf(logs: Array<AttendanceLog | AttendanceContextLog>, period: { from: string; to: string }): void {
  renderAttendancePdf(buildAttendanceDocumentData(logs, period));
}
