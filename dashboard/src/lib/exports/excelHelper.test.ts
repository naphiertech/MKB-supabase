// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { Blob as NodeBlob } from 'node:buffer';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportXLSXFile } from './excelHelper';

let downloadedBlob: Blob | undefined;

beforeEach(() => {
  downloadedBlob = undefined;
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    const bytes = await readFile(resolve(process.cwd(), `public${path}`));
    return { ok: true, arrayBuffer: async () => bytes };
  }));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob: Blob) => {
    downloadedBlob = blob as Blob;
    return 'blob:test';
  }) });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

async function exportedSheet(): Promise<ExcelJS.Worksheet> {
  expect(downloadedBlob).toBeDefined();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await downloadedBlob!.arrayBuffer()) as never);
  return workbook.worksheets[0];
}

describe('template-safe workbook population', () => {
  it('preserves cutoff total formulas and the template note', async () => {
    await exportXLSXFile('Cutoff Summary', ['Rider', 'Rider ID', 'Zone', 'Total Parcels', 'Flagged', 'Total Gross Pay'],
      [['Juan', 'MKB-1', 'North', 10, 'NO', 120]], 'cutoff', '/files/MKB_Cutoff_Summary_Payroll_Template.xlsx');
    const sheet = await exportedSheet();
    expect(sheet.getCell('D31').value).toMatchObject({ formula: 'SUM(D6:D30)' });
    expect(sheet.getCell('E31').value).toMatchObject({ formula: 'COUNTIF(E6:E30,"YES")' });
    expect(sheet.getCell('F31').value).toMatchObject({ formula: 'SUM(F6:F30)' });
    expect(String(sheet.getCell('A33').value)).toContain('Note');
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 5, showGridLines: false });
    expect(sheet.getColumn(4).numFmt).toBe('#,##0');
    expect(sheet.getColumn(6).numFmt).toContain('₱');
    expect(sheet.autoFilter).toBeTruthy();
    expect(sheet.getCell('A1').value).toBe('MKBRiderTrack | MKB CORPORATION');
    expect(sheet.getCell('A3').value).toBe('Fleet delivery volume and gross payroll review');
    expect(sheet.getCell('A1').font.color?.argb).toBe('FFDB6C00');
  });

  it('preserves raw-log total formulas and the template note', async () => {
    await exportXLSXFile('Parcel Log', ['Date', 'Rider', 'Zone', 'Parcels', 'Rate', 'Heavy', 'Daily Gross'],
      [['2026-08-01', 'Juan', 'North', 10, 12, 1, 137]], 'raw', '/files/MKB_Raw_Parcel_Delivery_Logs.xlsx');
    const sheet = await exportedSheet();
    expect(sheet.getCell('E26').value).toMatchObject({ formula: 'SUM(E6:E25)' });
    expect(sheet.getCell('G26').value).toMatchObject({ formula: 'SUM(G6:G25)' });
    expect(String(sheet.getCell('A28').value)).toContain('Note');
    expect(sheet.getColumn(1).numFmt).toBe('yyyy-mm-dd');
    expect(sheet.getColumn(7).numFmt).toContain('₱');
  });

  it('preserves the employee-registry template note', async () => {
    await exportXLSXFile('Employee Registry', ['Employee ID', 'Name', 'Role', 'Zone', 'Status', 'Contact'],
      [['MKB-1', 'Juan', 'Rider', 'North', 'Active', '0917']], 'employees', '/files/MKB_Employee_Registry_Template.xlsx');
    const sheet = await exportedSheet();
    expect(String(sheet.getCell('A37').value)).toContain('Note');
  });
});
