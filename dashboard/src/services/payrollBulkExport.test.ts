import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getPayrollDeliveryData: vi.fn() }));
vi.mock('./parcelService', () => ({ getPayrollDeliveryData: mocks.getPayrollDeliveryData }));

import { buildBulkPayrollExportRows } from './payrollBulkExport';

beforeEach(() => vi.clearAllMocks());

describe('selected payroll export', () => {
  it('exports selected records only and uses authoritative delivery data', async () => {
    mocks.getPayrollDeliveryData.mockResolvedValue({
      source: 'snapshot', calculationVersion: 2, lines: [],
      summary: { delivered: 25, standardDelivered: 20, heavyDelivered: 5, failed: 2, returned: 1, standardEarnings: 240, heavyEarnings: 85, grossDeliveryPay: 325 },
    });
    const records = [
      { id: 'selected', rider_id: 'rider-1', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', status: 'paid', riders: { name: 'Rider One', zones: { name: 'Zone One' } } },
      { id: 'not-selected', rider_id: 'rider-2', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', status: 'draft', riders: { name: 'Rider Two', zones: null } },
    ];
    const rows = await buildBulkPayrollExportRows(records, new Set(['selected']));
    expect(mocks.getPayrollDeliveryData).toHaveBeenCalledOnce();
    expect(rows).toEqual([expect.objectContaining({ riderName: 'Rider One', standardParcels: 20, heavyParcels: 5, grossPay: 325, calculationVersion: 2 })]);
  });
});
