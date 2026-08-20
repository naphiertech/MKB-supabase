// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRidersLookup: vi.fn(),
  getPayrollDeliveryData: vi.fn(),
  savePayrollRecord: vi.fn(),
  initializeCutoffPayrollForFleet: vi.fn(),
  resetDraftPayrollForCutoff: vi.fn(),
  getParcelRateContextForDate: vi.fn(),
  exportParcelPayslipPDF: vi.fn(),
  exportParcelCSV: vi.fn(),
  pushToast: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-payroll-user' } }),
}));

vi.mock('../hooks/useToast', () => ({
  pushToast: mocks.pushToast,
}));

vi.mock('../hooks/useParcelLogsRealtimeVersion', () => ({
  useParcelLogsRealtimeVersion: () => 0,
}));

vi.mock('../services/riderService', () => ({
  getRidersLookup: mocks.getRidersLookup,
}));

vi.mock('../services/attendanceService', () => ({
  getRiderAttendanceInDateRange: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/parcelService', () => ({
  getPayrollDeliveryData: mocks.getPayrollDeliveryData,
  savePayrollRecord: mocks.savePayrollRecord,
  initializeCutoffPayrollForFleet: mocks.initializeCutoffPayrollForFleet,
  resetDraftPayrollForCutoff: mocks.resetDraftPayrollForCutoff,
}));

vi.mock('../services/operationsService', () => ({
  getParcelRateContextForDate: mocks.getParcelRateContextForDate,
}));

vi.mock('../lib/exports/payrollExport', () => ({
  exportParcelPayslipPDF: mocks.exportParcelPayslipPDF,
  exportParcelCSV: mocks.exportParcelCSV,
  parcelLogsToPayslipDays: vi.fn().mockReturnValue([]),
  payslipAdjustmentsFromRecord: vi.fn().mockReturnValue({}),
}));

vi.mock('../components/payroll/RiderPayrollList', () => ({
  RiderPayrollList: ({ onComputeRider }: { onComputeRider: (record: any) => void }) => (
    <div data-testid="rider-payroll-list">
      <button
        type="button"
        onClick={() =>
          onComputeRider({
            id: 'rec-1',
            rider_id: 'rider-1',
            cutoff_start: '2026-08-01',
            cutoff_end: '2026-08-15',
            status: 'draft',
            total_parcels: 10,
            standard_parcels: 8,
            heavy_parcels: 2,
            calculation_version: 2,
            gross_pay: 130,
            riders: {
              id: 'rider-1',
              name: 'John Doe',
              mkb_id: 'MKB-001',
              zones: { name: 'Zone Central' },
            },
          })
        }
      >
        Select John Doe
      </button>
    </div>
  ),
}));

import { PayrollComputation } from './PayrollComputation';

describe('PayrollComputation Page UI Enhancements', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mocks.getRidersLookup.mockResolvedValue([
      { id: 'rider-1', name: 'John Doe', mkb_id: 'MKB-001', zones: { name: 'Zone Central' } },
    ]);

    mocks.getParcelRateContextForDate.mockResolvedValue({
      id: 'rate-cfg-aug',
      earlyStandardRate: 12,
      regularStandardRate: 11,
      lateStandardRate: 10,
      heavyParcelRate: 17,
      heavyThresholdKg: 3,
      effectiveFrom: '2026-08-01',
      effectiveUntil: null,
    });

    mocks.getPayrollDeliveryData.mockResolvedValue({
      source: 'live',
      calculationVersion: 2,
      summary: {
        standardDelivered: 8,
        heavyDelivered: 2,
        failed: 0,
        returned: 0,
        standardEarnings: 96,
        heavyEarnings: 34,
        grossDeliveryPay: 130,
      },
      lines: [
        {
          date: '2026-08-01',
          parcels: 8,
          heavyParcels: 2,
          failedParcels: 0,
          returnedParcels: 0,
          rate: 12,
          heavyRate: 17,
          standardEarnings: 96,
          heavyEarnings: 34,
          dailyGross: 130,
          timeIn: '2026-08-01T07:45:00.000Z',
        },
      ],
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('renders cleaned up Cutoff Period section with renamed Initialize Cutoff and overflow menu for reset drafts', async () => {
    await act(async () => {
      root.render(<PayrollComputation />);
    });

    // Check Cutoff Period title
    expect(container.textContent).toContain('Cutoff Period');

    // Check button renamed to "Initialize Cutoff"
    const initBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Initialize Cutoff')
    );
    expect(initBtn).toBeDefined();
    expect(container.textContent).not.toContain('Initialize Fleet Cutoff');

    // Check Search Rider button
    const searchBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Search Rider')
    );
    expect(searchBtn).toBeDefined();

    // Check overflow menu toggle button
    const overflowBtn = container.querySelector('button[aria-label="More cutoff options"]');
    expect(overflowBtn).not.toBeNull();

    // Click overflow menu to reveal Reset Unedited Drafts
    await act(async () => {
      (overflowBtn as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain('Reset Unedited Drafts');
  });

  it('loads and displays date-effective Dynamic Rate Rules and compact Export / Finalize actions in active rider view', async () => {
    await act(async () => {
      root.render(<PayrollComputation />);
    });

    // Click to compute rider
    const selectRiderBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Select John Doe'));
    await act(async () => {
      selectRiderBtn?.click();
    });

    // Verify getParcelRateContextForDate was called with cutoff date
    expect(mocks.getParcelRateContextForDate).toHaveBeenCalled();

    // Check Dynamic Rate Rules display live rates
    expect(container.textContent).toContain('Dynamic Rate Rules');
    expect(container.textContent).toContain('₱12.00 / pc');
    expect(container.textContent).toContain('₱11.00 / pc');
    expect(container.textContent).toContain('₱10.00 / pc');
    expect(container.textContent).toContain('₱17.00 / pc');

    // Check compact Export dropdown
    const exportBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Export'
    );
    expect(exportBtn).toBeDefined();

    // Open export menu
    await act(async () => {
      exportBtn?.click();
    });

    expect(container.textContent).toContain('PDF Payslip');
    expect(container.textContent).toContain('CSV Export');

    // Check Finalize & Save CTA
    const finalizeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Finalize & Save')
    );
    expect(finalizeBtn).toBeDefined();
  });
});
