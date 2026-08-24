// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createEmployeeProfilePdf } from './employeeExport';
import { exportXLSXFile } from './excelHelper';
import {
  createCutoffSummaryPdf,
  createParcelPayslipPdf,
  type CutoffSummaryDocumentData,
  type PayslipDocumentData,
} from './payrollExport';
import { createReportPdf } from './reportExport';

const qaDirectory = process.env.EXPORT_VISUAL_QA_DIR;
let downloadedBlob: Blob | undefined;

async function savePdf(name: string, bytes: ArrayBuffer): Promise<void> {
  if (!qaDirectory) return;
  const directory = resolve(qaDirectory, 'pdfs');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, `${name}.pdf`), Buffer.from(bytes));
}

async function saveWorkbook(name: string): Promise<void> {
  expect(downloadedBlob).toBeDefined();
  if (!qaDirectory) return;
  const directory = resolve(qaDirectory, 'spreadsheets');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, `${name}.xlsx`), Buffer.from(await downloadedBlob!.arrayBuffer()));
}

beforeAll(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('fetch', vi.fn(async (path: string) => ({
    ok: true,
    arrayBuffer: async () => readFile(resolve(process.cwd(), `public${path}`)),
  })));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob: Blob) => {
    downloadedBlob = blob;
    return 'blob:visual-qa';
  }) });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

describe('representative export rendering', () => {
  it('renders five distinct document layouts with stable pagination', async () => {
    const payslip: PayslipDocumentData = {
      rider: { name: 'Juan Dela Cruz With A Long Operational Name', mkbId: 'MKB-2009', zoneName: 'Zamboanga North Operations Zone' },
      cutoff: { from: '2026-08-01', to: '2026-08-15' },
      days: Array.from({ length: 15 }, (_, index) => ({
        date: `2026-08-${String(index + 1).padStart(2, '0')}`,
        standardParcels: 20 + index, heavyParcels: 3, failedParcels: index % 3, returnedParcels: index % 2,
        standardRate: 12, heavyRate: 17, standardEarnings: (20 + index) * 12, heavyEarnings: 51,
        grossDeliveryPay: (20 + index) * 12 + 51, rateConfigurationId: 'rates-1', calculationVersion: 2,
      })),
      snapshot: {
        source: 'snapshot', calculationVersion: 2, standardParcels: 405, heavyParcels: 45,
        failedParcels: 15, returnedParcels: 7, standardEarnings: 4860, heavyEarnings: 765,
        grossDeliveryPay: 5625,
      },
      adjustments: { otherEarnings: 250, fmPickupAmount: 36, deductions: 100, lateOnhold: 50, lateRemittance: 25 },
      totals: { totalEarnings: 5911, totalDeductions: 175, netPay: 5736 },
    };
    const payslipDoc = createParcelPayslipPdf(payslip);
    expect(payslipDoc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    await savePdf('payslip', payslipDoc.output('arraybuffer'));

    const cutoff: CutoffSummaryDocumentData = {
      period: { label: 'August 1-15, 2026', from: '2026-08-01', to: '2026-08-15' },
      rows: Array.from({ length: 42 }, (_, index) => ({
        riderName: `Rider ${index + 1} With Extended Family Name`, riderId: `MKB-${2000 + index}`,
        zone: index % 2 ? 'North Operations Zone' : 'South Logistics Assignment',
        totalParcels: 100 + index, standardParcels: 90 + index, heavyParcels: 10,
        failedParcels: index % 4, returnedParcels: index % 3, calculationVersion: 2,
        flagged: index % 11 === 0 ? 'YES' : 'NO', grossPay: 1500 + index * 17,
      })),
      totals: { parcels: 5061, grossPay: 77637 },
    };
    const cutoffDoc = createCutoffSummaryPdf(cutoff);
    expect(cutoffDoc.getNumberOfPages()).toBeGreaterThan(1);
    await savePdf('cutoff-summary', cutoffDoc.output('arraybuffer'));

    const profileDoc = createEmployeeProfilePdf({
      employee: { name: 'Ana Maria Employee With Extended Name', role: 'HR ADMINISTRATOR', zoneName: 'MKB Head Office' },
      generatedOn: 'August 15, 2026',
      sections: {
        basic: [['Full Name', 'Ana Maria Employee With Extended Name'], ['Role / Title', 'HR ADMINISTRATOR'], ['Employee ID', 'MKB-HR-001'], ['Employment Type', 'Regular']],
        contact: [['Primary Email', 'ana.employee.with.long.address@example.com'], ['Phone Number', '0917 000 0000'], ['Street Address', 'A deliberately long residential address used to verify wrapping without clipping or overlap.']],
        operations: [['Operational Assignment', 'MKB Head Office'], ['Emergency Contact Person', 'Maria Employee'], ['Onboarding Notes / Remarks', 'No remarks recorded']],
      },
    });
    expect(profileDoc.getNumberOfPages()).toBe(1);
    await savePdf('employee-profile', profileDoc.output('arraybuffer'));

    const attendanceRows = Array.from({ length: 85 }, (_, index) => [`Rider ${index + 1}`, 'North Operations Zone', '2026-08-01', '08:00', '17:00', 9, index % 7 === 0 ? 'late' : 'present']);
    const attendanceDoc = createReportPdf({ title: 'Weekly Attendance', columns: ['Rider', 'Zone', 'Date', 'Time-In', 'Time-Out', 'Hours', 'Status'], rows: attendanceRows }, { from: '2026-08-01', to: '2026-08-15' });
    expect(attendanceDoc.getNumberOfPages()).toBeGreaterThan(1);
    await savePdf('weekly-attendance', attendanceDoc.output('arraybuffer'));

    const violationRows = Array.from({ length: 35 }, (_, index) => [`Rider ${index + 1}`, 'Historical North Zone', 'Aug 15, 2026, 10:30 AM', '7.1234, 122.5432', index % 3 ? 'N' : 'Y', 'boundary exit']);
    const violationDoc = createReportPdf({ title: 'Violation Summary', columns: ['Rider', 'Historical Zone', 'Event Time', 'Coordinates', 'Resolved', 'Violation Type'], rows: violationRows }, { from: '2026-08-01', to: '2026-08-15' });
    expect(violationDoc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    await savePdf('violation-summary', violationDoc.output('arraybuffer'));
  });

  it('renders two controlled workbooks with practical spreadsheet presentation', async () => {
    downloadedBlob = undefined;
    await exportXLSXFile('Cutoff Summary', ['Rider', 'Rider ID', 'Zone', 'Total Parcels', 'Flagged', 'Total Gross Pay'], [
      ['Juan Rider', 'MKB-2009', 'North', 125, 'NO', 1725],
      ['Ana Rider With Extended Name', 'MKB-2010', 'South Operations Zone', 98, 'YES', 1320],
    ], 'visual-cutoff', 'cutoffSummary');
    await saveWorkbook('cutoff-summary');

    downloadedBlob = undefined;
    await exportXLSXFile('Rider Performance', ['Rider', 'Days Present', 'Total Hours', 'Late Count', 'Violations', 'Attendance Rate %'], [
      ['Juan Rider', 14, 118.5, 1, 0, '93%'],
      ['Ana Rider With Extended Name', 13, 110, 2, 1, '87%'],
    ], 'visual-performance', 'riderPerformance');
    await saveWorkbook('rider-performance');
  });
});
