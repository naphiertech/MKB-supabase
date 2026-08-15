// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ExportUtilsModule = {
  formatManilaDate?: (value: string | number | Date, style?: 'long' | 'short' | 'iso') => string;
  formatManilaDateTime?: (value: string | number | Date) => string;
  formatDateRangeLabel?: (from: string, to: string, style?: 'long' | 'short' | 'iso') => string;
  formatCurrency?: (value: number) => string;
  formatPercentage?: (value: number, fractionDigits?: number) => string;
  safeFilenameFragment?: (value: string) => string;
  buildExportFilename?: (options: {
    prefix: string; identifier?: string; from?: string; to?: string; extension: string;
  }) => string;
  createCsvContent?: (rows: Array<Array<string | number | boolean | null | undefined>>, options?: { bom?: boolean }) => string;
  downloadBlob?: (blob: Blob, filename: string) => void;
  printCurrentDocument?: () => void;
};

async function loadExportUtils(): Promise<ExportUtilsModule> {
  const modulePath = './exportUtils';
  try {
    return await import(/* @vite-ignore */ modulePath) as ExportUtilsModule;
  } catch {
    return {};
  }
}

beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shared export formatting', () => {
  it('uses Manila business dates consistently across UTC boundaries', async () => {
    const utils = await loadExportUtils();
    expect(typeof utils.formatManilaDate).toBe('function');
    expect(typeof utils.formatManilaDateTime).toBe('function');
    expect(typeof utils.formatDateRangeLabel).toBe('function');

    expect(utils.formatManilaDate?.('2026-08-14T16:30:00.000Z', 'long')).toBe('August 15, 2026');
    expect(utils.formatManilaDate?.('2026-08-15', 'iso')).toBe('2026-08-15');
    expect(utils.formatManilaDateTime?.('2026-08-14T16:30:00.000Z')).toContain('Aug 15, 2026');
    expect(utils.formatDateRangeLabel?.('2026-08-01', '2026-08-15', 'long'))
      .toBe('August 01, 2026 – August 15, 2026');
  });

  it('normalizes money, percentages, and metadata-rich filenames', async () => {
    const utils = await loadExportUtils();
    expect(utils.formatCurrency?.(1234.5)).toBe('₱1,234.50');
    expect(utils.formatPercentage?.(0.875)).toBe('88%');
    expect(utils.safeFilenameFragment?.(' MKB/2009: Juan*Rider? ')).toBe('MKB-2009_Juan-Rider');
    expect(utils.buildExportFilename?.({
      prefix: 'payslip', identifier: 'MKB/2009', from: '2026-08-01', to: '2026-08-15', extension: '.xlsx',
    })).toBe('payslip_MKB-2009_2026-08-01_to_2026-08-15.xlsx');
  });

  it('creates BOM-prefixed RFC-style CSV with null, quote, comma, and newline handling', async () => {
    const utils = await loadExportUtils();
    expect(typeof utils.createCsvContent).toBe('function');
    expect(utils.createCsvContent?.([
      ['Plain', 'Comma', 'Quote', 'Newline', 'Null'],
      ['value', 'A,B', 'He said "Hi"', 'line 1\nline 2', null],
    ])).toBe('\uFEFFPlain,Comma,Quote,Newline,Null\r\nvalue,"A,B","He said ""Hi""","line 1\nline 2",');
  });
});

describe('shared browser export actions', () => {
  it('downloads through one object URL and reliably revokes it', async () => {
    vi.useFakeTimers();
    const utils = await loadExportUtils();
    expect(typeof utils.downloadBlob).toBe('function');
    const createObjectURL = vi.fn(() => 'blob:shared-export');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const blob = new Blob(['content'], { type: 'text/plain' });
    utils.downloadBlob?.(blob as Blob, 'report.csv');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download="report.csv"]')).toBeNull();
    await vi.runAllTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:shared-export');
  });

  it('provides a single print entry point', async () => {
    const utils = await loadExportUtils();
    expect(typeof utils.printCurrentDocument).toBe('function');
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    utils.printCurrentDocument?.();
    expect(print).toHaveBeenCalledTimes(1);
  });
});
