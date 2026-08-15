import type { AttendanceLog } from '../../services/types';
import { buildExportFilename, downloadCsv } from './exportUtils';
import { exportPDF, type ReportData } from './reportExport';

export interface AttendanceDocumentRow {
  riderName: string;
  date: string;
  timeIn: string | null;
  timeOut: string | null;
  hours: number;
  zoneName: string;
  status: AttendanceLog['status'];
  source: AttendanceLog['source'];
}

export interface AttendanceDocumentData {
  period: { from: string; to: string };
  rows: AttendanceDocumentRow[];
}

export function buildAttendanceDocumentData(
  logs: AttendanceLog[],
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
  const headers = ['Rider Name', 'Date', 'Time In', 'Time Out', 'Hours', 'Zone', 'Status', 'Source'];
  const rows = data.rows.map(row => [
    row.riderName,
    row.date,
    row.timeIn ?? '',
    row.timeOut ?? '',
    row.hours ? row.hours.toFixed(2) : '0.00',
    row.zoneName,
    row.status,
    row.source,
  ]);
  downloadCsv([headers, ...rows], attendanceFilename(data, 'csv'));
}

export function renderAttendancePdf(data: AttendanceDocumentData): void {
  const report: ReportData = {
    title: 'Attendance Records Report',
    columns: ['Rider', 'Date', 'Time-In', 'Time-Out', 'Hours', 'Zone', 'Status', 'Source'],
    rows: data.rows.map(row => [
      row.riderName,
      row.date,
      row.timeIn ?? '—',
      row.timeOut ?? '—',
      `${row.hours.toFixed(1)}h`,
      row.zoneName,
      row.status.toUpperCase(),
      row.source === 'face-scan' ? 'Face Scan' : 'Manual',
    ]),
  };
  exportPDF(report, attendanceFilename(data, 'pdf').replace(/\.pdf$/, ''), data.period);
}

export function exportAttendanceCsv(logs: AttendanceLog[], period: { from: string; to: string }): void {
  renderAttendanceCsv(buildAttendanceDocumentData(logs, period));
}

export function exportAttendancePdf(logs: AttendanceLog[], period: { from: string; to: string }): void {
  renderAttendancePdf(buildAttendanceDocumentData(logs, period));
}
