import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { BRANDING } from '../../config/branding';
import { type AttendanceLog, type Rider, type Zone, type ViolationEvent } from '../../services/types';
import { getAttendanceLogs } from '../../services/attendanceService';
import { getAllRiders } from '../../services/monitoringService';
import { getZones } from '../../services/geofenceService';
import { getViolations } from '../../services/monitoringService';

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
  violationsList: ViolationEvent[],
  ridersList: Rider[]
): ReportData {
  const fromTs = new Date(opts.from + 'T00:00:00').getTime();
  const toTs = new Date(opts.to + 'T23:59:59').getTime();
  const filtered = violationsList.filter((v) => {
    if (v.ts < fromTs || v.ts > toTs) return false;
    if (opts.zoneIds.length > 0) {
      const rider = ridersList.find((r) => r.id === v.riderId);
      if (!rider || !rider.zoneId || !opts.zoneIds.includes(rider.zoneId))
      return false;
    }
    return true;
  });
  const rows = filtered.map((v) => {
    const rider = ridersList.find((r) => r.id === v.riderId);
    const coords = rider ?
    `${rider.lat.toFixed(4)}, ${rider.lng.toFixed(4)}` :
    '—';
    const time = new Date(v.ts).toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    return [v.riderName, v.zoneName, time, coords, v.read ? 'Y' : 'N'];
  });
  return {
    title: TEMPLATE_TITLES.violation_summary,
    columns: ['Rider', 'Zone', 'Violation Time', 'Coordinates', 'Resolved'],
    rows
  };
}

export function buildZoneCoverage(
  opts: BuilderOptions,
  attendanceLogsList: AttendanceLog[],
  ridersList: Rider[],
  zonesList: Zone[],
  violationsList: ViolationEvent[]
): ReportData {
  const targetZones =
  opts.zoneIds.length > 0 ?
  zonesList.filter((z) => opts.zoneIds.includes(z.id)) :
  zonesList;
  const logs = filterAttendance({ ...opts, zoneIds: [] }, attendanceLogsList);
  const fromTs = new Date(opts.from + 'T00:00:00').getTime();
  const toTs = new Date(opts.to + 'T23:59:59').getTime();
  const rows = targetZones.map((zone) => {
    const ridersInZone = ridersList.filter((r) => r.zoneId === zone.id);
    const zoneLogs = logs.filter((l) => l.zoneId === zone.id);
    const totalHours = zoneLogs.reduce((sum, l) => sum + l.hours, 0);
    const avgHours =
    zoneLogs.length > 0 ?
    Math.round(totalHours / zoneLogs.length * 10) / 10 :
    0;
    const zoneViolations = violationsList.filter((v) => {
      if (v.ts < fromTs || v.ts > toTs) return false;
      const rider = ridersList.find((r) => r.id === v.riderId);
      return rider?.zoneId === zone.id;
    }).length;
    return [zone.name, ridersInZone.length, avgHours, zoneViolations];
  });
  return {
    title: TEMPLATE_TITLES.zone_coverage,
    columns: [
      'Zone',
      'Total Riders Assigned',
      'Avg Hours Covered',
      'Violations'
    ],
    rows
  };
}

export function buildRiderPerformance(
  opts: BuilderOptions,
  attendanceLogsList: AttendanceLog[],
  ridersList: Rider[],
  violationsList: ViolationEvent[]
): ReportData {
  const logs = filterAttendance(opts, attendanceLogsList);
  const targetRiders =
  opts.zoneIds.length > 0 ?
  ridersList.filter((r) => r.zoneId && opts.zoneIds.includes(r.zoneId)) :
  ridersList;
  const fromTs = new Date(opts.from + 'T00:00:00').getTime();
  const toTs = new Date(opts.to + 'T23:59:59').getTime();
  // Total days in range
  const daysInRange = Math.max(
    1,
    Math.ceil((toTs - fromTs) / (1000 * 60 * 60 * 24))
  );
  const rows = targetRiders.map((rider) => {
    const riderLogs = logs.filter((l) => l.riderId === rider.id);
    const daysPresent = riderLogs.filter(
      (l) => l.status === 'present' || l.status === 'late'
    ).length;
    const totalHours =
    Math.round(riderLogs.reduce((sum, l) => sum + l.hours, 0) * 10) / 10;
    const lateCount = riderLogs.filter((l) => l.status === 'late').length;
    const riderViolations = violationsList.filter(
      (v) => v.riderId === rider.id && v.ts >= fromTs && v.ts <= toTs
    ).length;
    const rate = Math.round(daysPresent / daysInRange * 100);
    return [
      rider.name,
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
  ridersList: Rider[],
  zonesList: Zone[],
  violationsList: ViolationEvent[]
): ReportData {
  switch (template) {
    case 'weekly_attendance':
      return buildWeeklyAttendance(opts, attendanceLogsList);
    case 'violation_summary':
      return buildViolationSummary(opts, violationsList, ridersList);
    case 'zone_coverage':
      return buildZoneCoverage(opts, attendanceLogsList, ridersList, zonesList, violationsList);
    case 'rider_performance':
      return buildRiderPerformance(opts, attendanceLogsList, ridersList, violationsList);
  }
}

// ------------ Writers ------------

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(cell: string | number): string {
  const s = String(cell ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportCSV(data: ReportData, filename: string) {
  const lines = [data.columns, ...data.rows].map((row) =>
    row.map(csvEscape).join(',')
  );
  const csv = '\uFEFF' + lines.join('\r\n'); // BOM for Excel compatibility
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

export async function exportXLSX(data: ReportData, filename: string, templateKey?: string) {
  if (templateKey) {
    try {
      const templatePath = '/files/MKB_Analytics_Reports_Template.xlsx';
      const response = await fetch(templatePath);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      // Map templateKey to worksheet name
      const sheetMap: Record<string, string> = {
        weekly_attendance: 'Rider Daily Summary',
        violation_summary: 'Geofence Violations',
        zone_coverage: 'Rider Roster',
        rider_performance: 'Weekly Efficiency'
      };

      const targetSheetName = sheetMap[templateKey];
      if (targetSheetName) {
        const worksheet = workbook.getWorksheet(targetSheetName);
        if (worksheet) {
          // 1. Overwrite Row 5 with data.columns (headers), and clear any excess cells in Row 5
          const headerRow = worksheet.getRow(5);
          const maxCols = Math.max(data.columns.length, headerRow.cellCount || 0);
          for (let cIdx = 0; cIdx < maxCols; cIdx++) {
            const cell = headerRow.getCell(1 + cIdx);
            if (cIdx < data.columns.length) {
              cell.value = data.columns[cIdx];
            } else {
              cell.value = null;
            }
          }
          headerRow.commit();

          // 2. Inject data rows starting from Row 6 (1-indexed in ExcelJS)
          data.rows.forEach((rowData, rIdx) => {
            const rowNum = 6 + rIdx;
            const excelRow = worksheet.getRow(rowNum);
            const rowMaxCols = Math.max(rowData.length, excelRow.cellCount || 0);
            for (let cIdx = 0; cIdx < rowMaxCols; cIdx++) {
              const cell = excelRow.getCell(1 + cIdx);
              if (cIdx < rowData.length) {
                cell.value = rowData[cIdx];
              } else {
                cell.value = null;
              }
            }
            excelRow.commit();
          });

          // 3. Clear any remaining template placeholder rows (up to row 40)
          const startClearRow = 6 + data.rows.length;
          for (let rowNum = startClearRow; rowNum <= 40; rowNum++) {
            const excelRow = worksheet.getRow(rowNum);
            const cellCount = excelRow.cellCount || 0;
            if (excelRow.hasValues) {
              for (let cIdx = 0; cIdx < Math.max(10, cellCount); cIdx++) {
                excelRow.getCell(1 + cIdx).value = null;
              }
              excelRow.commit();
            }
          }

          // 4. Remove all other worksheets from the workbook so only the active report sheet is exported
          workbook.worksheets.forEach((ws) => {
            if (ws.name !== targetSheetName) {
              workbook.removeWorksheet(ws.id);
            }
          });

          const buffer = await workbook.xlsx.writeBuffer();
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${filename}.xlsx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          return;
        }
      }
    } catch (err) {
      console.warn(`Failed to load Excel template at /files/MKB_Analytics_Reports_Template.xlsx. Falling back to default generation.`, err);
    }
  }

  const aoa = [data.columns, ...data.rows];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  // Bold header row
  const headerRange = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const cell = sheet[addr];
    if (cell) {
      cell.s = { font: { bold: true } };
    }
  }
  // Reasonable column widths
  sheet['!cols'] = data.columns.map((col, i) => {
    const maxLen = Math.max(
      col.length,
      ...data.rows.map((r) => String(r[i] ?? '').length)
    );
    return { wch: Math.min(40, Math.max(10, maxLen + 2)) };
  });
  const book = XLSX.utils.book_new();
  const sheetName = data.title.slice(0, 31);
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  XLSX.writeFile(book, `${filename}.xlsx`);
}

export function exportPDF(
  data: ReportData,
  filename: string,
  meta: {from: string; to: string;}
) {
  const doc = new jsPDF({
    unit: 'pt',
    format: 'letter',
    orientation: 'portrait'
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generatedDate = new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const marginX = 40;
  const headerHeight = 100;
  const footerHeight = 40;
  const rowHeight = 22;
  const headerRowHeight = 26;
  const usableWidth = pageWidth - marginX * 2;
  const colWidth = usableWidth / data.columns.length;

  function drawPageChrome(pageNum: number) {
    // Brand
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(219, 108, 0);
    doc.text(BRANDING.appName, marginX, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 98, 88);
    doc.text('MKB Corporation', marginX, 52);
    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(26, 20, 16);
    doc.text(data.title, marginX, 78);
    // Date range
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 98, 88);
    doc.text(`${meta.from}  →  ${meta.to}`, pageWidth - marginX, 78, {
      align: 'right'
    });
    // Divider
    doc.setDrawColor(239, 234, 226);
    doc.setLineWidth(0.5);
    doc.line(marginX, 92, pageWidth - marginX, 92);

    // Footer
    const footerY = pageHeight - 24;
    doc.line(marginX, footerY - 12, pageWidth - marginX, footerY - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 98, 88);
    doc.text(
      `Generated by ${BRANDING.appName} · MKB Corporation · ${generatedDate}`,
      pageWidth / 2,
      footerY,
      { align: 'center' }
    );
    doc.text(`Page ${pageNum}`, pageWidth - marginX, footerY, {
      align: 'right'
    });
  }

  function drawTableHeader(y: number): number {
    doc.setFillColor(217, 119, 6); // #D97706
    doc.rect(marginX, y, usableWidth, headerRowHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    data.columns.forEach((col, i) => {
      doc.text(col, marginX + i * colWidth + 6, y + 17);
    });
    return y + headerRowHeight;
  }

  function truncate(text: string, maxWidth: number): string {
    if (doc.getTextWidth(text) <= maxWidth) return text;
    let truncated = text;
    while (
      truncated.length > 1 &&
      doc.getTextWidth(truncated + '…') > maxWidth
    ) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + '…';
  }

  let pageNum = 1;
  drawPageChrome(pageNum);
  let y = headerHeight + 10;
  y = drawTableHeader(y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  data.rows.forEach((row, idx) => {
    // Page break
    if (y + rowHeight > pageHeight - footerHeight) {
      doc.addPage();
      pageNum += 1;
      drawPageChrome(pageNum);
      y = headerHeight + 10;
      y = drawTableHeader(y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
    }
    // Zebra stripe
    if (idx % 2 === 0) {
      doc.setFillColor(255, 248, 238); // #FFF8EE
      doc.rect(marginX, y, usableWidth, rowHeight, 'F');
    }
    // Cell text
    doc.setTextColor(26, 20, 16);
    row.forEach((cell, i) => {
      const text = truncate(String(cell ?? ''), colWidth - 12);
      doc.text(text, marginX + i * colWidth + 6, y + 15);
    });
    // Bottom border
    doc.setDrawColor(239, 234, 226);
    doc.setLineWidth(0.3);
    doc.line(marginX, y + rowHeight, pageWidth - marginX, y + rowHeight);
    y += rowHeight;
  });

  doc.save(`${filename}.pdf`);
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
  const [logsData, ridersData, zonesData, violationsData] = await Promise.all([
    getAttendanceLogs(),
    getAllRiders(),
    getZones(),
    getViolations()
  ]);

  const data = buildReport(opts.template, {
    from: opts.from,
    to: opts.to,
    zoneIds: opts.zoneIds
  }, logsData, ridersData, zonesData, violationsData);

  if (data.rows.length === 0) {
    throw new ReportError('NO_DATA', 'No data matches the selected filters');
  }

  const filename = `mkbridertrack_${opts.template}_${opts.from}_${opts.to}`;

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
