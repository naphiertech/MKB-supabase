// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { Blob as NodeBlob } from 'node:buffer';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayslipDocumentData } from './payrollExport';

type BulkModule = {
  createPayslipPackage?: (
    documents: PayslipDocumentData[],
    options: { format: 'pdf' | 'xlsx'; from: string; to: string; onProgress?: (message: string) => void; forceArchive?: boolean },
  ) => Promise<{
    blob: Blob;
    filename: string;
    archive: boolean;
    generatedCount: number;
    failures: Array<{ riderName: string; message: string }>;
  }>;
  downloadPayslipPackage?: BulkModule['createPayslipPackage'];
};

async function loadBulkModule(): Promise<BulkModule> {
  try {
    const modulePath = './bulkPayslipExport';
    return await import(/* @vite-ignore */ modulePath) as BulkModule;
  } catch {
    return {};
  }
}

function payslip(mkbId: string, standardRate = 12): PayslipDocumentData {
  const gross = standardRate * 3 + 17 * 2;
  return {
    rider: { name: `Rider ${mkbId}`, mkbId, zoneName: 'North' },
    cutoff: { from: '2026-08-01', to: '2026-08-15' },
    days: [{
      date: '2026-08-01', standardParcels: 3, heavyParcels: 2, failedParcels: 0, returnedParcels: 0,
      standardRate, heavyRate: 17, standardEarnings: standardRate * 3, heavyEarnings: 34,
      grossDeliveryPay: gross, rateConfigurationId: 'rate-1', calculationVersion: 2,
    }],
    snapshot: {
      source: 'snapshot', calculationVersion: 2, standardParcels: 3, heavyParcels: 2,
      failedParcels: 0, returnedParcels: 0, standardEarnings: standardRate * 3,
      heavyEarnings: 34, grossDeliveryPay: gross,
    },
    adjustments: { otherEarnings: 0, fmPickupCount: 0, deductions: 0, lateOnhold: 0, lateRemittance: 0 },
    totals: { totalEarnings: gross, totalDeductions: 0, netPay: gross },
  };
}

beforeEach(async () => {
  vi.stubGlobal('Blob', NodeBlob);
  const template = await readFile(resolve(process.cwd(), 'public/files/MKB_PAYSLIP_Template.xlsx'));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => template }));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:payslips') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

describe('controlled payslip packaging', () => {
  it('keeps a single payslip as one direct file download', async () => {
    const module = await loadBulkModule();
    expect(typeof module.createPayslipPackage).toBe('function');
    const result = await module.createPayslipPackage!([payslip('MKB-0001')], {
      format: 'pdf', from: '2026-08-01', to: '2026-08-15',
    });
    expect(result.archive).toBe(false);
    expect(result.filename).toBe('payslip_MKB-0001_2026-08-01_to_2026-08-15.pdf');
    expect(result.generatedCount).toBe(1);
  });

  it('creates one ZIP containing every Rider PDF with its individual filename', async () => {
    const module = await loadBulkModule();
    expect(typeof module.createPayslipPackage).toBe('function');
    const progress: string[] = [];
    const result = await module.createPayslipPackage!([payslip('MKB-0001'), payslip('MKB-0002')], {
      format: 'pdf', from: '2026-08-01', to: '2026-08-15', onProgress: message => progress.push(message),
    });
    expect(result.archive).toBe(true);
    expect(result.filename).toBe('payslips_2026-08-01_to_2026-08-15.zip');
    const zip = await JSZip.loadAsync(new Uint8Array(await result.blob.arrayBuffer()));
    expect(Object.keys(zip.files).sort()).toEqual([
      'payslip_MKB-0001_2026-08-01_to_2026-08-15.pdf',
      'payslip_MKB-0002_2026-08-01_to_2026-08-15.pdf',
    ]);
    expect(progress).toContain('Generating 1 of 2 payslips…');
    expect(progress).toContain('Creating ZIP package…');
  });

  it('rejects an empty selection without creating a meaningless archive', async () => {
    const module = await loadBulkModule();
    expect(typeof module.createPayslipPackage).toBe('function');
    await expect(module.createPayslipPackage!([], {
      format: 'pdf', from: '2026-08-01', to: '2026-08-15',
    })).rejects.toThrow('No payslips are available to export.');
  });

  it('preserves required finalized rate-snapshot validation inside ZIP generation', async () => {
    const module = await loadBulkModule();
    const missingSnapshot = payslip('MKB-MISSING');
    missingSnapshot.days[0].rateConfigurationId = null;
    await expect(module.createPayslipPackage!([missingSnapshot], {
      format: 'pdf', from: '2026-08-01', to: '2026-08-15',
    })).rejects.toThrow('required rate snapshot is missing');
  });

  it('can preserve a multi-Rider ZIP outcome when only one prepared document remains', async () => {
    const module = await loadBulkModule();
    const result = await module.createPayslipPackage!([payslip('MKB-ONLY')], {
      format: 'pdf', from: '2026-08-01', to: '2026-08-15', forceArchive: true,
    });
    expect(result.archive).toBe(true);
    const zip = await JSZip.loadAsync(new Uint8Array(await result.blob.arrayBuffer()));
    expect(Object.keys(zip.files)).toEqual(['payslip_MKB-ONLY_2026-08-01_to_2026-08-15.pdf']);
  });

  it('packages successful official workbooks and reports individual failures', async () => {
    const module = await loadBulkModule();
    expect(typeof module.createPayslipPackage).toBe('function');
    const result = await module.createPayslipPackage!([payslip('MKB-GOOD'), payslip('MKB-BAD', 99)], {
      format: 'xlsx', from: '2026-08-01', to: '2026-08-15',
    });
    expect(result.generatedCount).toBe(1);
    expect(result.failures).toEqual([
      expect.objectContaining({ riderName: 'Rider MKB-BAD', message: expect.stringContaining('unsupported snapshotted standard rate') }),
    ]);
    const zip = await JSZip.loadAsync(new Uint8Array(await result.blob.arrayBuffer()));
    const filename = 'payslip_MKB-GOOD_2026-08-01_to_2026-08-15.xlsx';
    expect(Object.keys(zip.files)).toEqual([filename]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await zip.file(filename)!.async('arraybuffer')) as never);
    expect(workbook.worksheets[0].getCell('C4').value).toBe('Rider MKB-GOOD');
    expect(workbook.worksheets[0].actualColumnCount).toBeLessThanOrEqual(16);
  });

  it('downloads a multi-Rider package through exactly one browser download', async () => {
    const module = await loadBulkModule();
    expect(typeof module.downloadPayslipPackage).toBe('function');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const result = await module.downloadPayslipPackage!([payslip('MKB-0001'), payslip('MKB-0002')], {
      format: 'pdf', from: '2026-08-01', to: '2026-08-15',
    });
    expect(result.archive).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });
});
