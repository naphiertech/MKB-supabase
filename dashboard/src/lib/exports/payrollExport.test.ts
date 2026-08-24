// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { Blob as NodeBlob } from 'node:buffer';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as payrollExport from './payrollExport';

const templatePath = resolve(process.cwd(), 'public/files/MKB_PAYSLIP_Template.xlsx');
let downloadedBlob: Blob | undefined;

async function loadWorkbook(blob: Blob): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await blob.arrayBuffer()) as never);
  return workbook;
}

beforeEach(async () => {
  downloadedBlob = undefined;
  vi.stubGlobal('Blob', NodeBlob);
  const template = await readFile(templatePath);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => template,
  }));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob: Blob) => {
    downloadedBlob = blob as Blob;
    return 'blob:test';
  }) });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

describe('official payslip workbook', () => {
  it('preserves the approved layout and maps rates, adjustments, deductions, and net correctly', async () => {
    const days: payrollExport.PayslipDay[] = [
      {
        date: '2026-08-01', standardParcels: 3, heavyParcels: 2, failedParcels: 1, returnedParcels: 0,
        standardRate: 12, heavyRate: 17, standardEarnings: 36, heavyEarnings: 34,
        grossDeliveryPay: 70, rateConfigurationId: 'rates-1', calculationVersion: 2,
      },
      {
        date: '2026-08-02', standardParcels: 4, heavyParcels: 1, failedParcels: 0, returnedParcels: 1,
        standardRate: 11, heavyRate: 17, standardEarnings: 44, heavyEarnings: 17,
        grossDeliveryPay: 61, rateConfigurationId: 'rates-1', calculationVersion: 2,
      },
    ];
    const snapshot: payrollExport.PayslipSnapshotContext = {
      source: 'snapshot', calculationVersion: 2, standardParcels: 7, heavyParcels: 3,
      failedParcels: 1, returnedParcels: 1, standardEarnings: 80, heavyEarnings: 51,
      grossDeliveryPay: 131,
    };

    await payrollExport.exportParcelPayslipXLSX(
      'Juan Rider', 'MKB-001', '2026-08-01', '2026-08-15', days, snapshot, 'ATM-123',
      { otherEarnings: 25, fmPickupAmount: 6, deductions: 10, lateOnhold: 5, lateRemittance: 7, snapshotVersion: 1, legacyFmPickupCount: 2 },
    );

    expect(downloadedBlob).toBeDefined();
    const output = await loadWorkbook(downloadedBlob!);
    const source = new ExcelJS.Workbook();
    await source.xlsx.readFile(templatePath);
    const sheet = output.worksheets[0];
    const sourceSheet = source.worksheets[0];

    expect(sheet.getCell('C4').value).toBe('Juan Rider');
    expect(sheet.getCell('C6').value).toBe('ATM-123');
    expect(sheet.getCell('L5').value).toMatchObject({ formula: 'C9' });
    expect(sheet.getCell('L6').value).toMatchObject({ formula: 'C10' });

    expect(['D8', 'E8', 'F8', 'G8', 'H8', 'I8', 'J8', 'K8', 'L8', 'M8', 'N8', 'O8'].map(address => sheet.getCell(address).value))
      .toEqual(['B', 17, 'S', 12, 'B', 16, 'S', 11, 'B', 15, 'S', 10]);
    expect(sheet.getCell('D9').value).toBe(2);
    expect(sheet.getCell('F9').value).toBe(3);
    expect(sheet.getCell('D10').value).toBe(1);
    expect(sheet.getCell('J10').value).toBe(4);
    expect(sheet.getCell('E9').value).toMatchObject({ formula: 'D9*E8' });
    expect(sheet.getCell('G9').value).toMatchObject({ formula: 'F9*G8' });
    expect(sheet.getCell('K10').value).toMatchObject({ formula: 'J10*K8' });

    expect(sheet.getCell('C20').value).toBe(5);
    expect(sheet.getCell('C21').value).toBe(7);
    expect(sheet.getCell('N19').value).toBe(10);
    expect(sheet.getCell('C18').value).toBe(2);
    expect(sheet.getCell('N18').value).toBe(6);
    expect(sheet.getCell('N20').value).toMatchObject({ formula: 'C20+C21+K20+K21' });
    expect(sheet.getCell('N21').master.address).toBe('N20');
    expect(sheet.getCell('D16').value).toMatchObject({ formula: 'SUM(E9:E15)' });
    expect(sheet.getCell('N22').value).toBe(0);
    expect(sheet.getCell('N23').value).toMatchObject({ formula: 'SUM(D16:N18)-SUM(N19:P22)', result: 140 });

    expect([...(sheet.model.merges ?? [])].sort()).toEqual([...(sourceSheet.model.merges ?? [])].sort());
    expect(sheet.actualColumnCount).toBeLessThanOrEqual(16);
    for (let column = 17; column <= 22; column += 1) {
      expect(sheet.getColumn(column).values.filter(Boolean)).toEqual([]);
    }
  });

  it('writes new FM Pick Up as a manual peso amount without a quantity formula', async () => {
    const snapshot: payrollExport.PayslipSnapshotContext = {
      source: 'snapshot', calculationVersion: 2, standardParcels: 0, heavyParcels: 0,
      failedParcels: 0, returnedParcels: 0, standardEarnings: 0, heavyEarnings: 0,
      grossDeliveryPay: 0,
    };
    await payrollExport.exportParcelPayslipXLSX(
      'Manual FM Rider', 'MKB-MANUAL', '2026-08-01', '2026-08-15', [], snapshot, 'ATM-456',
      { otherEarnings: 0, fmPickupAmount: 7, deductions: 0, lateOnhold: 0, lateRemittance: 0, snapshotVersion: 2 },
    );

    const output = await loadWorkbook(downloadedBlob!);
    const sheet = output.worksheets[0];
    expect(sheet.getCell('C18').value).toBeNull();
    expect(sheet.getCell('N18').value).toBe(7);
  });
});

describe('shared payroll export data', () => {
  it('uses immutable submitted total snapshots without recalculating them', () => {
    const data = payrollExport.buildPayslipDocumentData({
      riderName: 'Historical Rider',
      mkbId: 'MKB-HISTORY',
      zoneName: 'Historical Zone',
      cutoffFrom: '2026-08-01',
      cutoffTo: '2026-08-15',
      dayEntries: [],
      snapshot: {
        source: 'snapshot', calculationVersion: 2, standardParcels: 0, heavyParcels: 0,
        failedParcels: 0, returnedParcels: 0, standardEarnings: 100, heavyEarnings: 0,
        grossDeliveryPay: 100,
      },
      adjustments: {
        otherEarnings: 999,
        fmPickupAmount: 999,
        deductions: 999,
        lateOnhold: 999,
        lateRemittance: 999,
        totalsSnapshot: { totalEarnings: 117, totalDeductions: 9, netPay: 108 },
      },
    });

    expect(data.totals).toEqual({ totalEarnings: 117, totalDeductions: 9, netPay: 108 });
  });

  it('maps every stored adjustment once and calculates the authoritative net', () => {
    const module = payrollExport as typeof payrollExport & {
      payslipAdjustmentsFromRecord?: (record: Record<string, unknown>) => payrollExport.PayslipAdjustments;
      calculatePayslipNetPay?: (gross: number, adjustments: payrollExport.PayslipAdjustments) => number;
    };
    expect(typeof module.payslipAdjustmentsFromRecord).toBe('function');
    expect(typeof module.calculatePayslipNetPay).toBe('function');
    const adjustments = module.payslipAdjustmentsFromRecord?.({
      other_earnings: '25', fm_pickup_count: 2, deductions: '10', late_onhold: 5, late_remittance: 7,
    });
    expect(adjustments).toEqual({ otherEarnings: 25, fmPickupAmount: 6, deductions: 10, lateOnhold: 5, lateRemittance: 7 });
    expect(module.calculatePayslipNetPay?.(131, adjustments!)).toBe(140);
  });

  it('builds a cutoff spreadsheet containing every selected rider', () => {
    const module = payrollExport as typeof payrollExport & {
      buildCutoffSummarySpreadsheetData?: (rows: payrollExport.CutoffSummaryRow[]) => { columns: string[]; rows: (string | number)[][] };
    };
    expect(typeof module.buildCutoffSummarySpreadsheetData).toBe('function');
    const data = module.buildCutoffSummarySpreadsheetData?.([
      { riderName: 'A', riderId: 'MKB-A', zone: 'North', totalParcels: 10, flagged: 'NO', grossPay: 120 },
      { riderName: 'B', riderId: 'MKB-B', zone: 'South', totalParcels: 20, flagged: 'YES', grossPay: 240 },
    ]);
    expect(data?.rows).toHaveLength(2);
    expect(data?.rows.map(row => row[0])).toEqual(['A', 'B']);
  });
});
