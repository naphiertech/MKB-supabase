// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayrollParcelRatesSettings } from './PayrollParcelRatesSettings';
import * as parcelRateService from '../../services/parcels/parcelRateConfigurationService';

vi.mock('../../services/parcels/parcelRateConfigurationService', async (importOriginal) => {
  const actual = await importOriginal<typeof parcelRateService>();
  return {
    ...actual,
    listParcelRateConfigurations: vi.fn(),
    listParcelRateAudit: vi.fn(),
    saveParcelRateConfiguration: vi.fn(),
    deactivateFutureParcelRateConfiguration: vi.fn(),
  };
});

const mockConfigurations: parcelRateService.ParcelRateConfiguration[] = [
  {
    id: 'active-conf-1',
    effective_from: '2026-01-01',
    effective_until: null,
    early_standard_rate: 12,
    regular_standard_rate: 11,
    late_standard_rate: 10,
    heavy_parcel_rate: 17,
    regular_heavy_rate: 16,
    late_heavy_rate: 15,
    heavy_threshold_kg: 4,
    active: true,
    change_reason: 'Initial confirmed schedule',
    created_at: '2026-01-01T00:00:00Z',
    created_by: 'admin-1',
    updated_at: '2026-01-01T00:00:00Z',
    updated_by: null,
  },
];

describe('PayrollParcelRatesSettings component', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(parcelRateService.listParcelRateConfigurations).mockResolvedValue(mockConfigurations);
    vi.mocked(parcelRateService.listParcelRateAudit).mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    vi.clearAllMocks();
  });

  it('renders the 6-rate schedule matrix for the active configuration', async () => {
    await act(async () => {
      root.render(<PayrollParcelRatesSettings role="admin" />);
    });

    const text = container.textContent || '';
    expect(text).toContain('Current Active Rates');
    expect(text).toContain('Parcel Rate Schedule');
    expect(text).toContain('≤ 8:00 AM (Early)');
    expect(text).toContain('8:01–9:00 AM (Regular)');
    expect(text).toContain('> 9:00 AM (Late)');

    // Small rates
    expect(text).toContain('₱12.00');
    expect(text).toContain('₱11.00');
    expect(text).toContain('₱10.00');

    // Bulky rates
    expect(text).toContain('₱17.00');
    expect(text).toContain('₱16.00');
    expect(text).toContain('₱15.00');
  });

  it('validates progression in real time and guards save button', async () => {
    await act(async () => {
      root.render(<PayrollParcelRatesSettings role="admin" />);
    });

    // Open new configuration drawer
    const newConfigBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Future Rates')
    );
    expect(newConfigBtn).toBeDefined();

    await act(async () => {
      newConfigBtn?.click();
    });

    expect(document.body.textContent).toContain('Create Future Rate Configuration');

    function setInputValue(input: HTMLInputElement, value: string) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const earlySmallInput = document.body.querySelector('#earlyStandardRate') as HTMLInputElement;
    const saveButton = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save Configuration')
    );

    // Initial prefill: 12, 11, 10 and 17, 16, 15 -> valid
    expect(document.body.textContent).not.toContain('Small parcel rates must follow progression');
    expect(saveButton?.disabled).toBe(false);

    // Violate Small progression: Early (10) < Regular (11)
    await act(async () => {
      setInputValue(earlySmallInput, '10');
    });

    expect(document.body.textContent).toContain('The 8:01–9:00 AM rate cannot exceed the ≤8:00 AM rate');
    expect(saveButton?.disabled).toBe(true);

    // Fix Small progression, violate Bulky progression: Regular Bulky (14) < Late Bulky (15)
    await act(async () => {
      setInputValue(earlySmallInput, '12');
    });
    expect(document.body.textContent).not.toContain('The 8:01–9:00 AM rate cannot exceed the ≤8:00 AM rate');

    const regularHeavyInput = document.body.querySelector('#regularHeavyRate') as HTMLInputElement;
    await act(async () => {
      setInputValue(regularHeavyInput, '14');
    });

    expect(document.body.textContent).toContain('The >9:00 AM bulky rate cannot exceed the 8:01–9:00 AM rate');
    expect(saveButton?.disabled).toBe(true);

    // Set valid steep drop: 20 -> 16 -> 12
    const earlyHeavyInput = document.body.querySelector('#earlyHeavyRate') as HTMLInputElement;
    const lateHeavyInput = document.body.querySelector('#lateHeavyRate') as HTMLInputElement;
    await act(async () => {
      setInputValue(earlyHeavyInput, '20');
      setInputValue(regularHeavyInput, '16');
      setInputValue(lateHeavyInput, '12');
    });

    expect(document.body.textContent).not.toContain('Bulky parcel rates must follow progression');
    expect(saveButton?.disabled).toBe(false);
  });
});
