import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportXLSXFile } from './excelHelper';
import { exportOfficialPayslipXLSX } from './officialPayslipTemplateAdapter';
import {
  applyBusinessDocumentFooters,
  businessTableStyles,
  createBusinessPdf,
  drawBusinessDocumentHeader,
  drawMetricStrip,
  drawSectionHeading,
  formatPdfCurrency,
  PDF_DOCUMENT_THEME,
  pdfThemeRgb,
} from './pdfDocumentTheme';
import {
  buildExportFilename,
  downloadBlob,
  downloadCsv,
  formatManilaDate,
  formatManilaDateTime,
  printPdfBlob,
} from './exportUtils';

interface JsPDFWithAutoTable extends jsPDF {
  lastAutoTable: { finalY: number };
}

export interface PayslipDay {
  date: string;
  standardParcels: number;
  heavyParcels: number;
  failedParcels: number;
  returnedParcels: number;
  standardRate: number;
  heavyRate: number;
  standardEarnings: number;
  heavyEarnings: number;
  grossDeliveryPay: number;
  rateConfigurationId: string | null;
  calculationVersion: number;
}

export interface PayslipSnapshotContext {
  source: 'live' | 'snapshot' | 'legacy';
  calculationVersion: number;
  standardParcels: number;
  heavyParcels: number;
  failedParcels: number;
  returnedParcels: number;
  standardEarnings: number;
  heavyEarnings: number;
  grossDeliveryPay: number;
}

export interface PayslipAdjustments {
  otherEarnings?: number;
  fmPickupCount?: number;
  deductions?: number;
  lateOnhold?: number;
  lateRemittance?: number;
}

export interface PayrollAdjustmentRecord {
  other_earnings?: number | string | null;
  fm_pickup_count?: number | string | null;
  deductions?: number | string | null;
  late_onhold?: number | string | null;
  late_remittance?: number | string | null;
}

export function payslipAdjustmentsFromRecord(record: PayrollAdjustmentRecord): Required<PayslipAdjustments> {
  return {
    otherEarnings: Number(record.other_earnings ?? 0),
    fmPickupCount: Number(record.fm_pickup_count ?? 0),
    deductions: Number(record.deductions ?? 0),
    lateOnhold: Number(record.late_onhold ?? 0),
    lateRemittance: Number(record.late_remittance ?? 0),
  };
}

function normalizedAdjustments(adjustments: PayslipAdjustments): Required<PayslipAdjustments> {
  return {
    otherEarnings: Number(adjustments.otherEarnings ?? 0),
    fmPickupCount: Number(adjustments.fmPickupCount ?? 0),
    deductions: Number(adjustments.deductions ?? 0),
    lateOnhold: Number(adjustments.lateOnhold ?? 0),
    lateRemittance: Number(adjustments.lateRemittance ?? 0),
  };
}

export function calculatePayslipNetPay(grossPay: number, adjustments: PayslipAdjustments): number {
  const values = normalizedAdjustments(adjustments);
  return Number(grossPay) + values.otherEarnings + values.fmPickupCount * 3
    - values.deductions - values.lateOnhold - values.lateRemittance;
}

export interface PayslipDocumentData {
  rider: { name: string; mkbId: string; zoneName: string };
  cutoff: { from: string; to: string };
  days: PayslipDay[];
  snapshot: PayslipSnapshotContext;
  adjustments: Required<PayslipAdjustments>;
  totals: { totalEarnings: number; totalDeductions: number; netPay: number };
}

export function buildPayslipDocumentData(input: {
  riderName: string;
  mkbId: string;
  zoneName: string;
  cutoffFrom: string;
  cutoffTo: string;
  dayEntries: PayslipDay[];
  snapshot: PayslipSnapshotContext;
  adjustments?: PayslipAdjustments;
}): PayslipDocumentData {
  const adjustments = normalizedAdjustments(input.adjustments ?? {});
  const totalEarnings = input.snapshot.grossDeliveryPay + adjustments.otherEarnings + adjustments.fmPickupCount * 3;
  const totalDeductions = adjustments.deductions + adjustments.lateOnhold + adjustments.lateRemittance;
  return {
    rider: { name: input.riderName, mkbId: input.mkbId, zoneName: input.zoneName },
    cutoff: { from: input.cutoffFrom, to: input.cutoffTo },
    days: input.dayEntries,
    snapshot: input.snapshot,
    adjustments,
    totals: { totalEarnings, totalDeductions, netPay: totalEarnings - totalDeductions },
  };
}

export function parcelLogsToPayslipDays(entries: Array<{
  date: string; parcels: number; heavyParcels: number; failedParcels: number; returnedParcels: number;
  rate: number; heavyRate: number; standardEarnings: number; heavyEarnings: number; dailyGross: number;
  rateConfigurationId: string | null; calculationVersion: number;
}>): PayslipDay[] {
  return entries.map(entry => ({
    date: entry.date, standardParcels: entry.parcels, heavyParcels: entry.heavyParcels,
    failedParcels: entry.failedParcels, returnedParcels: entry.returnedParcels,
    standardRate: entry.rate, heavyRate: entry.heavyRate, standardEarnings: entry.standardEarnings,
    heavyEarnings: entry.heavyEarnings, grossDeliveryPay: entry.dailyGross,
    rateConfigurationId: entry.rateConfigurationId, calculationVersion: entry.calculationVersion,
  }));
}

function validateSnapshotExport(dayEntries: PayslipDay[], snapshot: PayslipSnapshotContext): void {
  if (snapshot.source === 'legacy') return;
  for (const entry of dayEntries) {
    if (!entry.rateConfigurationId || !Number.isFinite(entry.standardRate) || !Number.isFinite(entry.heavyRate)) {
      throw new Error(`Cannot export payroll: required rate snapshot is missing for ${entry.date}.`);
    }
  }
}

export const exportParcelPayslipPDF = (
  riderName: string,
  mkbId: string,
  zoneName: string,
  cutoffFrom: string,
  cutoffTo: string,
  dayEntries: PayslipDay[],
  snapshot: PayslipSnapshotContext,
  adjustments: PayslipAdjustments = {}
) => {
  validateSnapshotExport(dayEntries, snapshot);
  renderParcelPayslipPDF(buildPayslipDocumentData({
    riderName, mkbId, zoneName, cutoffFrom, cutoffTo, dayEntries, snapshot, adjustments,
  }));
};

export function createParcelPayslipPdf(data: PayslipDocumentData): jsPDF {
  const { rider, cutoff, days, snapshot, adjustments } = data;
  const doc = createBusinessPdf({ orientation: 'portrait', format: 'a4' });
  const generatedAt = formatManilaDateTime(new Date());
  const totalParcels = snapshot.standardParcels + snapshot.heavyParcels;
  const adjustmentTotal = adjustments.otherEarnings + adjustments.fmPickupCount * 3;

  autoTable(doc, {
    ...businessTableStyles(),
    startY: 210,
    margin: {
      left: PDF_DOCUMENT_THEME.page.margin,
      right: PDF_DOCUMENT_THEME.page.margin,
      top: 100,
      bottom: PDF_DOCUMENT_THEME.page.footerHeight + 18,
    },
    head: [['Date', 'Standard', 'Heavy', 'Failed', 'Returned', 'Std Rate', 'Heavy Rate', 'Gross']],
    body: days.length ? days.map(entry => [
      formatManilaDate(entry.date, 'short'),
      entry.standardParcels,
      entry.heavyParcels,
      entry.failedParcels,
      entry.returnedParcels,
      formatPdfCurrency(entry.standardRate),
      formatPdfCurrency(entry.heavyRate),
      formatPdfCurrency(entry.grossDeliveryPay),
    ]) : [['No delivery entries recorded for this cutoff.', '', '', '', '', '', '', '']],
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    columnStyles: {
      0: { cellWidth: 68 },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
    },
    willDrawPage: () => {
      const pageNumber = doc.getCurrentPageInfo().pageNumber;
      drawBusinessDocumentHeader(doc, {
        title: 'Rider Payslip',
        descriptor: 'Delivery earnings and payroll adjustment statement',
        classification: 'Payroll Document',
        metadata: pageNumber === 1 ? [
          { label: 'Rider', value: rider.name },
          { label: 'MKB ID', value: rider.mkbId },
          { label: 'Cutoff', value: `${formatManilaDate(cutoff.from, 'short')} to ${formatManilaDate(cutoff.to, 'short')}` },
          { label: 'Zone', value: rider.zoneName || 'Not assigned' },
        ] : undefined,
        compact: pageNumber > 1,
      });
      if (pageNumber === 1) {
        drawMetricStrip(doc, [
          { label: 'Delivered Parcels', value: totalParcels.toLocaleString('en-PH') },
          { label: 'Gross Delivery Pay', value: formatPdfCurrency(snapshot.grossDeliveryPay) },
          { label: 'Adjustments', value: formatPdfCurrency(adjustmentTotal) },
          { label: 'Net Pay', value: formatPdfCurrency(data.totals.netPay) },
        ], 144);
        drawSectionHeading(doc, 'Daily Delivery Breakdown', 200);
      }
    },
  });

  const dailyTableBottom = (doc as JsPDFWithAutoTable).lastAutoTable.finalY;
  const pageHeight = doc.internal.pageSize.getHeight();
  let summaryStart = dailyTableBottom + 24;
  if (summaryStart > pageHeight - 245) {
    doc.addPage();
    drawBusinessDocumentHeader(doc, {
      title: 'Rider Payslip',
      classification: 'Payroll Document',
      compact: true,
    });
    summaryStart = 112;
  }

  const tableStart = drawSectionHeading(doc, 'Payroll Reconciliation', summaryStart);
  const reconciliationRows: Array<[string, string]> = [
    ['Gross Delivery Pay', formatPdfCurrency(snapshot.grossDeliveryPay)],
    ['Other Earnings', formatPdfCurrency(adjustments.otherEarnings)],
    [`FM Pickup Bonus (${adjustments.fmPickupCount} pcs x PHP 3)`, formatPdfCurrency(adjustments.fmPickupCount * 3)],
    ['TOTAL EARNINGS', formatPdfCurrency(data.totals.totalEarnings)],
    ['General Deductions', formatPdfCurrency(adjustments.deductions)],
    ['Late Onhold', formatPdfCurrency(adjustments.lateOnhold)],
    ['Late Remittance', formatPdfCurrency(adjustments.lateRemittance)],
    ['TOTAL DEDUCTIONS', formatPdfCurrency(data.totals.totalDeductions)],
    ['NET TAKE-HOME PAY', formatPdfCurrency(data.totals.netPay)],
  ];
  autoTable(doc, {
    ...businessTableStyles(),
    startY: tableStart,
    margin: {
      left: PDF_DOCUMENT_THEME.page.margin,
      right: PDF_DOCUMENT_THEME.page.margin,
      bottom: PDF_DOCUMENT_THEME.page.footerHeight + 18,
    },
    head: [['Payroll Component', 'Amount']],
    body: reconciliationRows,
    columnStyles: { 1: { halign: 'right', cellWidth: 150 } },
    didParseCell: hook => {
      if (hook.section !== 'body') return;
      const rawRow = hook.row.raw;
      const label = String(Array.isArray(rawRow) ? rawRow[0] ?? '' : '');
      if (label.startsWith('TOTAL')) hook.cell.styles.fontStyle = 'bold';
      if (label === 'NET TAKE-HOME PAY') {
        hook.cell.styles.fontStyle = 'bold';
        hook.cell.styles.fillColor = pdfThemeRgb('accentSoft');
        hook.cell.styles.textColor = pdfThemeRgb('ink');
        hook.cell.styles.lineWidth = { top: 1 };
        hook.cell.styles.lineColor = pdfThemeRgb('accent');
      }
    },
  });

  const noteY = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...pdfThemeRgb('muted'));
  doc.text(
    snapshot.source === 'legacy'
      ? 'Payroll basis: immutable legacy snapshot.'
      : `Payroll basis: calculation version ${snapshot.calculationVersion} with snapshotted delivery rates.`,
    PDF_DOCUMENT_THEME.page.margin,
    noteY,
  );

  applyBusinessDocumentFooters(doc, generatedAt);
  return doc;
}

export function renderParcelPayslipPDF(data: PayslipDocumentData): void {
  downloadBlob(createParcelPayslipPdf(data).output('blob'), buildExportFilename({
    prefix: 'payslip',
    identifier: data.rider.mkbId,
    from: data.cutoff.from,
    to: data.cutoff.to,
    extension: 'pdf',
  }));
}

export function printParcelPayslipDocument(data: PayslipDocumentData): void {
  printPdfBlob(createParcelPayslipPdf(data).output('blob'));
}

export const exportParcelCSV = (
  riderName: string,
  mkbId: string,
  cutoffFrom: string,
  cutoffTo: string,
  dayEntries: PayslipDay[],
  snapshot: PayslipSnapshotContext,
  adjustments: PayslipAdjustments = {}
) => {
  validateSnapshotExport(dayEntries, snapshot);
  renderParcelPayslipCsv(buildPayslipDocumentData({
    riderName, mkbId, zoneName: '', cutoffFrom, cutoffTo, dayEntries, snapshot, adjustments,
  }));
};

export function renderParcelPayslipCsv(data: PayslipDocumentData): void {
  const { rider, cutoff, days: dayEntries, snapshot, adjustments: values } = data;
  const totalParcels = snapshot.standardParcels + snapshot.heavyParcels;
  const grossPay = snapshot.grossDeliveryPay;

  const otherEarnings = values.otherEarnings;
  const fmPickupCount = values.fmPickupCount;
  const fmPickupPay = fmPickupCount * 3;
  const totalEarnings = data.totals.totalEarnings;
  const generalDeductions = values.deductions;
  const lateOnhold = values.lateOnhold;
  const lateRemittance = values.lateRemittance;
  const totalDeductions = data.totals.totalDeductions;
  const netTakeHome = data.totals.netPay;

  const metadata = [
    ['Rider Payslip — MKB Corporation'],
    ['Rider Name', rider.name],
    ['Rider ID', rider.mkbId],
    ['Cutoff Period', `${cutoff.from} to ${cutoff.to}`],
    []
  ];

  const headers = ['Date', 'Standard', 'Heavy', 'Failed', 'Returned', 'Standard Rate', 'Heavy Rate', 'Standard Earnings', 'Heavy Earnings', 'Gross Delivery Pay', 'Calculation Version'];
  const rows = dayEntries.map(e => [
    e.date, e.standardParcels, e.heavyParcels, e.failedParcels, e.returnedParcels,
    `₱${e.standardRate.toFixed(2)}`, `₱${e.heavyRate.toFixed(2)}`,
    `₱${e.standardEarnings.toFixed(2)}`, `₱${e.heavyEarnings.toFixed(2)}`,
    `₱${e.grossDeliveryPay.toFixed(2)}`, e.calculationVersion,
  ]);

  const lines = [
    ...metadata,
    headers,
    ...rows,
    [],
    ['TOTALS & ADJUSTMENTS'],
    ['Total Parcels Delivered', totalParcels],
    ['Standard Delivered', snapshot.standardParcels],
    ['Heavy Delivered', snapshot.heavyParcels],
    ['Failed', snapshot.failedParcels],
    ['Returned', snapshot.returnedParcels],
    ['Standard Earnings', `₱${snapshot.standardEarnings.toFixed(2)}`],
    ['Heavy Earnings', `₱${snapshot.heavyEarnings.toFixed(2)}`],
    ['Gross Delivery Pay', `₱${grossPay.toFixed(2)}`],
    ['Other Earnings', `₱${otherEarnings.toFixed(2)}`],
    [`FM Pick Up (${fmPickupCount} pcs)`, `₱${fmPickupPay.toFixed(2)}`],
    ['TOTAL EARNINGS', `₱${totalEarnings.toFixed(2)}`],
    [],
    ['Deductions'],
    ['General Deductions', `₱${generalDeductions.toFixed(2)}`],
    ['Late Onhold', `₱${lateOnhold.toFixed(2)}`],
    ['Late Remittance', `₱${lateRemittance.toFixed(2)}`],
    ['TOTAL DEDUCTIONS', `₱${totalDeductions.toFixed(2)}`],
    [],
    ['NET TAKE-HOME PAY', `₱${netTakeHome.toFixed(2)}`]
  ];

  downloadCsv(lines, buildExportFilename({
    prefix: 'payslip', identifier: rider.mkbId, from: cutoff.from, to: cutoff.to, extension: 'csv',
  }));
}

export interface CutoffSummaryRow {
  riderName: string;
  riderId?: string;
  zone: string;
  totalParcels: number;
  standardParcels?: number;
  heavyParcels?: number;
  standardEarnings?: number;
  heavyEarnings?: number;
  failedParcels?: number;
  returnedParcels?: number;
  calculationVersion?: number;
  flagged?: string;
  grossPay: number;
}

export interface CutoffSummaryPeriod {
  label: string;
  from?: string;
  to?: string;
}

export interface CutoffSummaryDocumentData {
  period: CutoffSummaryPeriod;
  rows: CutoffSummaryRow[];
  totals: { parcels: number; grossPay: number };
}

function normalizeCutoffPeriod(period: string | CutoffSummaryPeriod): CutoffSummaryPeriod {
  if (typeof period !== 'string') return period;
  const dates = period.match(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/);
  return { label: period, from: dates?.[1], to: dates?.[2] };
}

export function buildCutoffSummaryDocumentData(
  rows: CutoffSummaryRow[],
  period: string | CutoffSummaryPeriod,
): CutoffSummaryDocumentData {
  return {
    period: normalizeCutoffPeriod(period),
    rows,
    totals: {
      parcels: rows.reduce((sum, row) => sum + row.totalParcels, 0),
      grossPay: rows.reduce((sum, row) => sum + row.grossPay, 0),
    },
  };
}

export function buildCutoffSummarySpreadsheetData(rows: CutoffSummaryRow[]) {
  return {
    columns: ['Rider', 'Rider ID', 'Zone', 'Total Parcels', 'Flagged', 'Total Gross Pay'],
    rows: rows.map(row => [
      row.riderName,
      row.riderId ?? '—',
      row.zone,
      row.totalParcels,
      row.flagged ?? 'NO',
      row.grossPay,
    ]),
  };
}

function cutoffFilename(data: CutoffSummaryDocumentData, extension: 'csv' | 'pdf' | 'xlsx'): string {
  return buildExportFilename({
    prefix: 'payroll_cutoff',
    identifier: data.period.from && data.period.to ? undefined : data.period.label,
    from: data.period.from,
    to: data.period.to,
    extension,
  });
}

export async function exportCutoffSummaryXLSX(
  rows: CutoffSummaryRow[],
  period: string | CutoffSummaryPeriod,
): Promise<void> {
  const documentData = buildCutoffSummaryDocumentData(rows, period);
  const data = buildCutoffSummarySpreadsheetData(rows);
  await exportXLSXFile(
    'Cutoff Summary', data.columns, data.rows,
    cutoffFilename(documentData, 'xlsx').replace(/\.xlsx$/, ''),
    'cutoffSummary',
  );
}

export function exportCutoffSummaryPDF(
  rows: CutoffSummaryRow[],
  period: string | CutoffSummaryPeriod,
): void {
  renderCutoffSummaryPdf(buildCutoffSummaryDocumentData(rows, period));
}

export function renderCutoffSummaryPdf(data: CutoffSummaryDocumentData): void {
  downloadBlob(createCutoffSummaryPdf(data).output('blob'), cutoffFilename(data, 'pdf'));
}

export function createCutoffSummaryPdf(data: CutoffSummaryDocumentData): jsPDF {
  const doc = createBusinessPdf({ orientation: 'landscape', format: 'a4' });
  const generatedAt = formatManilaDateTime(new Date());
  const flaggedCount = data.rows.filter(row => row.flagged === 'YES').length;
  autoTable(doc, {
    ...businessTableStyles(),
    startY: 208,
    margin: {
      left: PDF_DOCUMENT_THEME.page.margin,
      right: PDF_DOCUMENT_THEME.page.margin,
      top: 100,
      bottom: PDF_DOCUMENT_THEME.page.footerHeight + 18,
    },
    head: [['Rider', 'Zone', 'Standard', 'Heavy', 'Failed', 'Returned', 'Gross Pay', 'Version']],
    body: data.rows.length ? data.rows.map(row => [
      row.riderName,
      row.zone,
      row.standardParcels ?? row.totalParcels,
      row.heavyParcels ?? 0,
      row.failedParcels ?? 0,
      row.returnedParcels ?? 0,
      formatPdfCurrency(row.grossPay),
      `v${row.calculationVersion ?? 1}`,
    ]) : [['No payroll records match this cutoff.', '', '', '', '', '', '', '']],
    foot: data.rows.length ? [[
      'FLEET TOTAL', '', '', '', '', '', formatPdfCurrency(data.totals.grossPay), '',
    ]] : undefined,
    showHead: 'everyPage',
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 115 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', cellWidth: 105, fontStyle: 'bold' },
      7: { halign: 'center', cellWidth: 55 },
    },
    footStyles: {
      fillColor: pdfThemeRgb('accentSoft'),
      textColor: pdfThemeRgb('ink'),
      fontStyle: 'bold',
      lineColor: pdfThemeRgb('accent'),
      lineWidth: { top: 1 },
    },
    willDrawPage: () => {
      const pageNumber = doc.getCurrentPageInfo().pageNumber;
      drawBusinessDocumentHeader(doc, {
        title: 'Payroll Cutoff Summary',
        descriptor: 'Fleet delivery volume and gross payroll review',
        classification: 'Financial Report',
        metadata: pageNumber === 1 ? [
          { label: 'Cutoff', value: data.period.label.replace(/[–—]/g, '-') },
          { label: 'Riders', value: data.rows.length.toLocaleString('en-PH') },
          { label: 'Generated At', value: generatedAt },
        ] : undefined,
        compact: pageNumber > 1,
      });
      if (pageNumber === 1) {
        drawMetricStrip(doc, [
          { label: 'Riders', value: data.rows.length.toLocaleString('en-PH') },
          { label: 'Delivered Parcels', value: data.totals.parcels.toLocaleString('en-PH') },
          { label: 'Flagged Records', value: flaggedCount.toLocaleString('en-PH') },
          { label: 'Gross Payroll', value: formatPdfCurrency(data.totals.grossPay) },
        ], 144);
        drawSectionHeading(doc, 'Rider Payroll Register', 198);
      }
    },
    didParseCell: hook => {
      if (hook.section === 'body' && hook.column.index === 0 && String(hook.cell.raw).length > 36) {
        hook.cell.styles.fontSize = 7.5;
      }
    },
  });
  applyBusinessDocumentFooters(doc, generatedAt);
  return doc;
}

export const exportCutoffSummaryCSV = (
  rows: CutoffSummaryRow[],
  period: string | CutoffSummaryPeriod,
) => {
  renderCutoffSummaryCsv(buildCutoffSummaryDocumentData(rows, period));
};

export function renderCutoffSummaryCsv(data: CutoffSummaryDocumentData): void {
  const header = ['Rider', 'Zone', 'Standard', 'Heavy', 'Failed', 'Returned', 'Total Delivered', 'Standard Earnings', 'Heavy Earnings', 'Gross Delivery Pay', 'Calculation Version'];

  const lines = [
    ['MKBRiderTrack Cutoff Summary'],
    [`Cutoff: ${data.period.label}`],
    [],
    header,
    ...data.rows.map(r => [
      r.riderName,
      r.zone,
      r.standardParcels ?? r.totalParcels,
      r.heavyParcels ?? 0,
      r.failedParcels ?? 0,
      r.returnedParcels ?? 0,
      r.totalParcels,
      `₱${Number(r.standardEarnings ?? r.grossPay).toFixed(2)}`,
      `₱${Number(r.heavyEarnings ?? 0).toFixed(2)}`,
      `₱${r.grossPay.toFixed(2)}`,
      r.calculationVersion ?? 1,
    ])
  ];

  downloadCsv(lines, cutoffFilename(data, 'csv'));
}

export const exportParcelPayslipXLSX = async (
  riderName: string,
  mkbId: string,
  cutoffFrom: string,
  cutoffTo: string,
  dayEntries: PayslipDay[],
  snapshot: PayslipSnapshotContext,
  atmNumber = 'N/A',
  adjustments: PayslipAdjustments = {}
): Promise<void> => {
  validateSnapshotExport(dayEntries, snapshot);
  return exportOfficialPayslipXLSX(buildPayslipDocumentData({
    riderName,
    mkbId,
    zoneName: '',
    cutoffFrom,
    cutoffTo,
    dayEntries,
    snapshot,
    adjustments,
  }), atmNumber);
};
