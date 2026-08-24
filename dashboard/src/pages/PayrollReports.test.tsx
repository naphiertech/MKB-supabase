// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAllRiders: vi.fn(),
  getZones: vi.fn(),
  getArchivedPayrollCutoffsSummary: vi.fn(),
  getParcelLogsSummary: vi.fn(),
  getPayrollRecordsSummary: vi.fn(),
  getParcelLogsDetails: vi.fn(),
  getPayrollRecords: vi.fn(),
  pushToast: vi.fn(),
  useHub: vi.fn(),
}));

vi.mock('../context/HubContext', () => ({
  useHub: () => mocks.useHub(),
}));

vi.mock('../hooks/useToast', () => ({
  pushToast: mocks.pushToast,
}));

vi.mock('../hooks/useExportJob', () => ({
  useExportJob: () => ({
    running: false,
    message: null,
    run: vi.fn().mockImplementation((_, fn) => fn(vi.fn())),
  }),
}));

vi.mock('../services/monitoring/monitoringService', () => ({
  getAllRiders: mocks.getAllRiders,
}));

vi.mock('../services/geofencing/geofenceService', () => ({
  getZones: mocks.getZones,
}));

vi.mock('../services/parcelService', () => ({
  getArchivedPayrollCutoffsSummary: mocks.getArchivedPayrollCutoffsSummary,
  getParcelLogsSummary: mocks.getParcelLogsSummary,
  getPayrollRecordsSummary: mocks.getPayrollRecordsSummary,
  getParcelLogsDetails: mocks.getParcelLogsDetails,
  getPayrollRecords: mocks.getPayrollRecords,
  getPayrollDeliveryData: vi.fn().mockResolvedValue({
    source: 'live',
    calculationVersion: 2,
    summary: {
      standardDelivered: 10,
      heavyDelivered: 2,
      failed: 0,
      returned: 0,
      standardEarnings: 110,
      heavyEarnings: 34,
      grossDeliveryPay: 144,
    },
    lines: [],
  }),
}));

vi.mock('../lib/exports/payrollExport', () => ({
  buildPayslipDocumentData: vi.fn(),
  exportCutoffSummaryCSV: vi.fn(),
  exportCutoffSummaryPDF: vi.fn(),
  exportCutoffSummaryXLSX: vi.fn(),
  payslipAdjustmentsFromRecord: vi.fn().mockReturnValue({}),
  parcelLogsToPayslipDays: vi.fn().mockReturnValue([]),
}));

vi.mock('../lib/exports/excelHelper', () => ({
  exportXLSXFile: vi.fn(),
}));

vi.mock('../lib/exports/exportUtils', () => ({
  buildExportFilename: vi.fn().mockReturnValue('test-export.pdf'),
  downloadCsv: vi.fn(),
}));

vi.mock('../lib/exports/bulkPayslipExport', () => ({
  downloadPayslipPackage: vi.fn().mockResolvedValue({
    filename: 'payslips.zip',
    archive: true,
    generatedCount: 1,
    failures: [],
  }),
}));

import { PayrollReports } from './PayrollReports';

describe('PayrollReports Component', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mocks.useHub.mockReturnValue({
      selectedHubId: null,
      selectedHub: null,
      isReady: true,
      workspaceKey: 'all',
    });

    mocks.getAllRiders.mockResolvedValue([
      { id: 'rider-1', name: 'Rider One', riderCode: 'MKB-001', zoneId: 'zone-1' },
    ]);

    mocks.getZones.mockResolvedValue([
      { id: 'zone-1', name: 'Zone Central' },
    ]);

    mocks.getParcelLogsSummary.mockResolvedValue([]);
    mocks.getPayrollRecordsSummary.mockResolvedValue([]);
    mocks.getArchivedPayrollCutoffsSummary.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('renders clean compact report-type selector matching Admin Reports design', async () => {
    await act(async () => {
      root.render(<PayrollReports />);
    });

    expect(container.textContent).toContain('Cutoff Summary');
    expect(container.textContent).toContain('Individual Payslips');
    expect(container.textContent).toContain('Parcel Log');

    // Click on Individual Payslips
    const payslipsTab = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Individual Payslips')
    );
    await act(async () => {
      payslipsTab?.click();
    });

    expect(container.textContent).toContain('Single rider');
    expect(container.textContent).toContain('All riders');
  });

  it('shows empty archive state when no historical records exist in Supabase and no fake mock rows', async () => {
    mocks.getArchivedPayrollCutoffsSummary.mockResolvedValue([]);

    await act(async () => {
      root.render(<PayrollReports />);
    });

    expect(container.textContent).toContain('Payroll History & Archives');
    expect(container.textContent).toContain('No historical payroll cutoffs found.');
    expect(container.textContent).not.toContain('Jul 1–15, 2026');
    expect(container.textContent).not.toContain('Jun 16–30, 2026');
    expect(container.textContent).not.toContain('May 16–31, 2026');
    expect(container.textContent).not.toContain('flagged for unusual delivery counts');
  });

  it('renders real historical cutoff records and handles Load button accurately', async () => {
    mocks.getArchivedPayrollCutoffsSummary.mockResolvedValue([
      {
        cutoffStart: '2026-08-01',
        cutoffEnd: '2026-08-15',
        label: 'Aug 1–15, 2026',
        riderCount: 5,
        totalGross: 6500,
        status: 'paid',
      },
    ]);

    await act(async () => {
      root.render(<PayrollReports />);
    });

    expect(container.textContent).toContain('Aug 1–15, 2026');
    expect(container.textContent).toContain('5');
    expect(container.textContent).toContain('₱6,500');
    expect(container.textContent?.toLowerCase()).toContain('paid');

    // Click Load
    const loadBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Load'
    );
    expect(loadBtn).toBeDefined();

    await act(async () => {
      loadBtn?.click();
    });

    expect(mocks.pushToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Cutoff Loaded',
        tone: 'success',
      })
    );
  });

  it('respects selected Hub in scope and queries hub-scoped archives', async () => {
    mocks.useHub.mockReturnValue({
      selectedHubId: 'hub-talon',
      selectedHub: { id: 'hub-talon', name: 'Talon-Talon Hub' },
      isReady: true,
      workspaceKey: 'hub-talon',
    });

    await act(async () => {
      root.render(<PayrollReports />);
    });

    expect(container.textContent).toContain('Talon-Talon Hub');
    expect(mocks.getArchivedPayrollCutoffsSummary).toHaveBeenCalledWith('hub-talon');
  });
});
