import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { type AttendanceLog, type Zone, type ViolationEvent } from '../../services/types';
import { getAttendanceLogs } from '../../services/attendance/attendanceService';
import { getViolationsForReport } from '../../services/monitoring/monitoringService';
import { getZones } from '../../services/geofencing/geofenceService';
import { enrichAttendanceWithHistoricalZones } from '../../services/attendance/historicalAttendanceContext';
import { exportXLSXFile } from './excelHelper';
import {
  buildExportFilename,
  downloadBlob,
  downloadCsv,
  formatManilaDateTime,
} from './exportUtils';
import type { XlsxTemplateKey } from './xlsxTemplateRegistry';
import {
  applyBusinessDocumentFooters,
  businessTableStyles,
  createBusinessPdf,
  drawBusinessDocumentHeader,
  drawMetricStrip,
  PDF_DOCUMENT_THEME,
  pdfThemeRgb,
} from './pdfDocumentTheme';

export type ReportTemplate =
'weekly_attendance' |
'violation_summary' |
'zone_coverage' |
'rider_performance';

export type ReportFormat = 'pdf' | 'csv' | 'xlsx';

export interface ReportData {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface BuilderOptions {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  zoneIds: string[]; // empty = all
}

export interface GenerateOptions extends BuilderOptions {
  template: ReportTemplate;
  format: ReportFormat;
}

export class ReportError extends Error {
  code: 'NO_DATA' | 'INVALID_RANGE';
  constructor(code: 'NO_DATA' | 'INVALID_RANGE', message: string) {
    super(message);
    this.code = code;
  }
}

const TEMPLATE_TITLES: Record<ReportTemplate, string> = {
  weekly_attendance: 'Weekly Attendance',
  violation_summary: 'Violation Summary',
  zone_coverage: 'Zone Coverage',
  rider_performance: 'Rider Performance'
};

// ------------ Builders ------------

function inDateRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function filterAttendance(opts: BuilderOptions, attendanceLogsList: AttendanceLog[]): AttendanceLog[] {
  return attendanceLogsList.filter((log) => {
    if (!inDateRange(log.date, opts.from, opts.to)) return false;
    if (opts.zoneIds.length > 0 && !opts.zoneIds.includes(log.zoneId))
    return false;
    return true;
  });
}

export function buildWeeklyAttendance(opts: BuilderOptions, attendanceLogsList: AttendanceLog[]): ReportData {
  const rows = filterAttendance(opts, attendanceLogsList).map((log) => [
    log.riderName,
    log.zoneName,
    log.date,
    log.timeIn ?? '—',
    log.timeOut ?? '—',
    log.hours,
    log.status
  ]);
  return {
    title: TEMPLATE_TITLES.weekly_attendance,
    columns: [
      'Rider',
      'Zone',
      'Date',
      'Time-In',
      'Time-Out',
      'Hours',
      'Status'
    ],
    rows
  };
}

export function buildViolationSummary(
  opts: BuilderOptions,
  violationsList: ViolationEvent[]
): ReportData {
  const fromTs = new Date(opts.from + 'T00:00:00+08:00').getTime();
  const toTs = new Date(opts.to + 'T23:59:59.999+08:00').getTime();
  const filtered = violationsList.filter((v) => {
    if (v.ts < fromTs || v.ts > toTs) return false;
    if (opts.zoneIds.length > 0 && (!v.zoneId || !opts.zoneIds.includes(v.zoneId))) return false;
    return true;
  });
  const rows = filtered.map((v) => {
    const coords = Number.isFinite(v.lat) && Number.isFinite(v.lng)
      ? `${v.lat!.toFixed(4)}, ${v.lng!.toFixed(4)}`
      : '—';
    const time = formatManilaDateTime(v.ts);
    return [
      v.riderName,
      v.zoneName,
      time,
      coords,
      v.resolved ? 'Y' : 'N',
      v.type.replace(/_/g, ' '),
    ];
  });
  return {
    title: TEMPLATE_TITLES.violation_summary,
    columns: ['Rider', 'Historical Zone', 'Event Time', 'Coordinates', 'Resolved', 'Violation Type'],
    rows
  };
}

export function buildZoneCoverage(
  opts: BuilderOptions,
  attendanceLogsList: AttendanceLog[],
  zonesList: Zone[],
  violationsList: ViolationEvent[]
): ReportData {
  const targetZones =
  opts.zoneIds.length > 0 ?
  zonesList.filter((z) => opts.zoneIds.includes(z.id)) :
  zonesList;
  const logs = filterAttendance({ ...opts, zoneIds: [] }, attendanceLogsList);
  const fromTs = new Date(opts.from + 'T00:00:00+08:00').getTime();
  const toTs = new Date(opts.to + 'T23:59:59.999+08:00').getTime();
  const rows = targetZones.map((zone) => {
    const zoneLogs = logs.filter((l) => l.zoneId === zone.id);
    const completedShifts = zoneLogs.filter(log => log.timeIn && log.timeOut);
    const totalHours = completedShifts.reduce((sum, l) => sum + l.hours, 0);
    const avgHours =
    completedShifts.length > 0 ?
    Math.round(totalHours / completedShifts.length * 10) / 10 :
    0;
    const zoneViolations = violationsList.filter((v) => {
      if (v.ts < fromTs || v.ts > toTs) return false;
      return v.zoneId === zone.id;
    }).length;
    return [zone.name, new Set(zoneLogs.map(log => log.riderId)).size, avgHours, zoneViolations];
  });
  return {
    title: TEMPLATE_TITLES.zone_coverage,
    columns: [
      'Zone',
      'Riders Reporting',
      'Avg Completed Shift Hours',
      'Violations'
    ],
    rows
  };
}

export function buildRiderPerformance(
  opts: BuilderOptions,
  attendanceLogsList: AttendanceLog[],
  violationsList: ViolationEvent[]
): ReportData {
  const logs = filterAttendance(opts, attendanceLogsList);
  const fromTs = new Date(opts.from + 'T00:00:00+08:00').getTime();
  const toTs = new Date(opts.to + 'T23:59:59.999+08:00').getTime();
  const logsByRider = new Map<string, AttendanceLog[]>();
  logs.forEach(log => logsByRider.set(log.riderId, [...(logsByRider.get(log.riderId) ?? []), log]));
  const rows = [...logsByRider.entries()].map(([riderId, riderLogs]) => {
    const daysPresent = riderLogs.filter(
      (l) => l.status === 'present' || l.status === 'late'
    ).length;
    const totalHours =
    Math.round(riderLogs.reduce((sum, l) => sum + l.hours, 0) * 10) / 10;
    const lateCount = riderLogs.filter((l) => l.status === 'late').length;
    const riderViolations = violationsList.filter(
      (v) => v.riderId === riderId && v.ts >= fromTs && v.ts <= toTs
    ).length;
    const rate = Math.round(daysPresent / riderLogs.length * 100);
    return [
      riderLogs[0].riderName,
      daysPresent,
      totalHours,
      lateCount,
      riderViolations,
      `${rate}%`
    ];
  });
  return {
    title: TEMPLATE_TITLES.rider_performance,
    columns: [
      'Rider',
      'Days Present',
      'Total Hours',
      'Late Count',
      'Violations',
      'Attendance Rate %'
    ],
    rows
  };
}

function buildReport(
  template: ReportTemplate,
  opts: BuilderOptions,
  attendanceLogsList: AttendanceLog[],
  zonesList: Zone[],
  violationsList: ViolationEvent[]
): ReportData {
  switch (template) {
    case 'weekly_attendance':
      return buildWeeklyAttendance(opts, attendanceLogsList);
    case 'violation_summary':
      return buildViolationSummary(opts, violationsList);
    case 'zone_coverage':
      return buildZoneCoverage(opts, attendanceLogsList, zonesList, violationsList);
    case 'rider_performance':
      return buildRiderPerformance(opts, attendanceLogsList, violationsList);
  }
}

// ------------ Writers ------------

export function exportCSV(data: ReportData, filename: string) {
  downloadCsv([data.columns, ...data.rows], `${filename}.csv`);
}

const REPORT_XLSX_TEMPLATES: Record<ReportTemplate, XlsxTemplateKey> = {
  weekly_attendance: 'weeklyAttendance',
  violation_summary: 'violationSummary',
  zone_coverage: 'zoneCoverage',
  rider_performance: 'riderPerformance',
};

export async function exportXLSX(data: ReportData, filename: string, template?: ReportTemplate) {
  await exportXLSXFile(
    data.title,
    data.columns,
    data.rows,
    filename,
    template ? REPORT_XLSX_TEMPLATES[template] : undefined,
  );
}

const REPORT_DESCRIPTORS: Record<string, string> = {
  'Attendance Records Report': 'Operational attendance register',
  'Weekly Attendance': 'Weekly workforce attendance and hours review',
  'Violation Summary': 'Geofence incident and resolution register',
  'Zone Coverage': 'Historical assignment Zone coverage overview',
  'Rider Performance': 'Rider attendance and compliance performance',
};

function reportMetrics(data: ReportData): Array<{ label: string; value: string }> {
  if (data.title === 'Violation Summary') {
    const resolved = data.rows.filter(row => row[4] === 'Y').length;
    return [
      { label: 'Incidents', value: String(data.rows.length) },
      { label: 'Open', value: String(data.rows.length - resolved) },
      { label: 'Resolved', value: String(resolved) },
    ];
  }
  if (data.title === 'Zone Coverage') {
    return [
      { label: 'Zones', value: String(data.rows.length) },
      { label: 'Riders Reporting', value: String(data.rows.reduce((sum, row) => sum + Number(row[1] || 0), 0)) },
      { label: 'Violations', value: String(data.rows.reduce((sum, row) => sum + Number(row[3] || 0), 0)) },
    ];
  }
  if (data.title === 'Rider Performance') {
    const rates = data.rows.map(row => Number(String(row[5] ?? '0').replace('%', '')) || 0);
    const averageRate = rates.length ? Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length) : 0;
    return [
      { label: 'Riders Reviewed', value: String(data.rows.length) },
      { label: 'Average Attendance', value: `${averageRate}%` },
      { label: 'Total Violations', value: String(data.rows.reduce((sum, row) => sum + Number(row[4] || 0), 0)) },
    ];
  }
  const statusIndex = data.columns.findIndex(column => column.toLowerCase() === 'status');
  const lateCount = statusIndex >= 0
    ? data.rows.filter(row => String(row[statusIndex]).toLowerCase() === 'late').length
    : 0;
  return [
    { label: 'Attendance Records', value: String(data.rows.length) },
    { label: 'Late Records', value: String(lateCount) },
    { label: 'Total Hours', value: data.rows.reduce((sum, row) => {
      const hoursIndex = data.columns.findIndex(column => column.toLowerCase().includes('hours'));
      return sum + (hoursIndex >= 0 ? Number(row[hoursIndex] || 0) : 0);
    }, 0).toLocaleString('en-PH', { maximumFractionDigits: 1 }) },
  ];
}

export function createReportPdf(
  data: ReportData,
  meta: { from: string; to: string },
): jsPDF {
  const landscape = data.columns.length >= 6;
  const doc = createBusinessPdf({ orientation: landscape ? 'landscape' : 'portrait', format: 'letter' });
  const generatedDate = formatManilaDateTime(new Date());
  const numericColumns: Record<number, { halign: 'right' }> = {};
  data.columns.forEach((column, index) => {
    if (/hours|count|riders|violations|rate|parcels|pay|earnings|deductions|total/i.test(column)) {
      numericColumns[index] = { halign: 'right' };
    }
  });

  const firstPageHeaderBottom = 144;
  const metricBottom = firstPageHeaderBottom + 50;
  const pdfRows = data.title === 'Violation Summary'
    ? data.rows.map(row => row.map((value, index) => index === 4 ? (value === 'Y' ? 'Resolved' : 'Open') : value))
    : data.rows;
  autoTable(doc, {
    ...businessTableStyles(),
    startY: metricBottom + 10,
    margin: {
      left: PDF_DOCUMENT_THEME.page.margin,
      right: PDF_DOCUMENT_THEME.page.margin,
      top: 101,
      bottom: PDF_DOCUMENT_THEME.page.footerHeight + 18,
    },
    head: [data.columns],
    body: pdfRows.length ? pdfRows : [['No records match the selected reporting period.']],
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    columnStyles: numericColumns,
    willDrawPage: () => {
      const pageNumber = doc.getCurrentPageInfo().pageNumber;
      drawBusinessDocumentHeader(doc, {
        title: data.title,
        descriptor: REPORT_DESCRIPTORS[data.title] ?? 'Operational business report',
        classification: data.title === 'Violation Summary' ? 'Incident Report' : 'Operations Report',
        metadata: pageNumber === 1 ? [
          { label: 'Reporting Period', value: `${meta.from} to ${meta.to}` },
          { label: 'Records', value: data.rows.length.toLocaleString('en-PH') },
          { label: 'Generated At', value: generatedDate },
        ] : undefined,
        compact: pageNumber > 1,
      });
      if (pageNumber === 1) drawMetricStrip(doc, reportMetrics(data), firstPageHeaderBottom);
    },
    didParseCell: (hook) => {
      if (hook.section !== 'body') return;
      const header = data.columns[hook.column.index]?.toLowerCase() ?? '';
      const value = String(hook.cell.raw ?? '').toLowerCase();
      if (header.includes('status') || header.includes('resolved')) {
        hook.cell.styles.fontStyle = 'bold';
        if (/open|late|violation|absent/.test(value)) hook.cell.styles.textColor = pdfThemeRgb('danger');
        if (/resolved|present|complete/.test(value)) hook.cell.styles.textColor = pdfThemeRgb('success');
      }
    },
  });

  applyBusinessDocumentFooters(doc, generatedDate);
  return doc;
}

export function exportPDF(
  data: ReportData,
  filename: string,
  meta: { from: string; to: string },
): void {
  downloadBlob(createReportPdf(data, meta).output('blob'), `${filename}.pdf`);
}

// ------------ Orchestrator ------------

export async function generateReport(
  opts: GenerateOptions
): Promise<{rowCount: number;}> {
  if (!opts.from || !opts.to) {
    throw new ReportError('INVALID_RANGE', 'Please select a date range');
  }
  if (opts.to < opts.from) {
    throw new ReportError(
      'INVALID_RANGE',
      'End date must be on or after start date'
    );
  }

  // Fetch live lists from database dynamically
  const [rawLogsData, zonesData, violationsData] = await Promise.all([
    getAttendanceLogs(
      { dateFrom: opts.from, dateTo: opts.to },
      { finalizeDaily: false, includeEvents: false }
    ),
    getZones(),
    getViolationsForReport({ from: opts.from, to: opts.to, zoneIds: opts.zoneIds })
  ]);
  const logsData = await enrichAttendanceWithHistoricalZones(rawLogsData);

  const data = buildReport(opts.template, {
    from: opts.from,
    to: opts.to,
    zoneIds: opts.zoneIds
  }, logsData, zonesData, violationsData);

  if (data.rows.length === 0) {
    throw new ReportError('NO_DATA', 'No data matches the selected filters');
  }

  const filename = buildExportFilename({
    prefix: `mkbridertrack_${opts.template}`,
    from: opts.from,
    to: opts.to,
    extension: opts.format,
  }).replace(/\.[^.]+$/, '');

  // Small async tick so the UI can render the loading state
  await new Promise((r) => setTimeout(r, 50));

  switch (opts.format) {
    case 'csv':
      exportCSV(data, filename);
      break;
    case 'xlsx':
      await exportXLSX(data, filename, opts.template);
      break;
    case 'pdf':
      exportPDF(data, filename, { from: opts.from, to: opts.to });
      break;
  }

  return { rowCount: data.rows.length };
}
