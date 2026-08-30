// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubManagement } from './HubManagement';
import * as hubService from '../services/hubs/hubService';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../context/HubContext', () => ({
  useHub: () => ({
    refreshHubs: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../services/hubs/hubService', () => ({
  getHubManagementSnapshot: vi.fn(),
  createHub: vi.fn(),
  updateHub: vi.fn(),
  assignZoneToHub: vi.fn(),
}));

const mockConfiguredHub: hubService.HubManagementHub = {
  id: 'hub-configured-1',
  name: 'Talon-Talon Operations Hub',
  description: 'Primary south warehouse',
  active: true,
  latitude: 6.912345,
  longitude: 122.081234,
  attendanceRadiusM: 100,
  createdAt: '2026-08-01T08:00:00Z',
  updatedAt: '2026-08-20T10:00:00Z',
  zoneCount: 2,
  riderCount: 15,
  staffCount: 3,
};

const mockLegacyHub: hubService.HubManagementHub = {
  id: 'hub-legacy-2',
  name: 'Ayala Legacy Hub',
  description: 'Unconfigured legacy hub',
  active: true,
  latitude: null,
  longitude: null,
  attendanceRadiusM: null,
  createdAt: '2026-08-01T08:00:00Z',
  updatedAt: '2026-08-20T10:00:00Z',
  zoneCount: 1,
  riderCount: 8,
  staffCount: 1,
};

const mockSnapshot: hubService.HubManagementSnapshot = {
  hubs: [mockConfiguredHub, mockLegacyHub],
  zones: [
    {
      id: 'zone-1',
      name: 'Talon Zone',
      status: 'active',
      hubId: 'hub-configured-1',
      riderCount: 10,
    },
  ],
};

function changeInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('HubManagement — Geofence Configuration', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hubService.getHubManagementSnapshot).mockResolvedValue(mockSnapshot);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  it('renders hub directory and displays configured geofence in details tab', async () => {
    await act(async () => {
      root?.render(<HubManagement />);
    });

    expect(container?.textContent).toContain('Talon-Talon Operations Hub');
    expect(container?.textContent).toContain('Ayala Legacy Hub');

    // Switch to details tab
    const detailsTab = container?.querySelector('#hub-tab-details') as HTMLButtonElement | null;
    expect(detailsTab).not.toBeNull();

    await act(async () => {
      detailsTab?.click();
    });

    expect(container?.textContent).toContain('Geofence');
    expect(container?.textContent).toContain('6.91235, 122.08123 (100 m radius)');
  });

  it('shows Not configured for unconfigured legacy hub in details tab', async () => {
    await act(async () => {
      root?.render(<HubManagement />);
    });

    // Select legacy hub
    const hubButtons = container?.querySelectorAll('button');
    const legacyHubButton = Array.from(hubButtons || []).find((b) =>
      b.textContent?.includes('Ayala Legacy Hub'),
    );
    expect(legacyHubButton).toBeDefined();

    await act(async () => {
      legacyHubButton?.click();
    });

    // Switch to details tab
    const detailsTab = container?.querySelector('#hub-tab-details') as HTMLButtonElement | null;
    await act(async () => {
      detailsTab?.click();
    });

    expect(container?.textContent).toContain('Geofence');
    expect(container?.textContent).toContain('Not configured');
  });

  it('opens Create Hub drawer with geofence controls and enforces complete geofence before saving', async () => {
    vi.mocked(hubService.createHub).mockResolvedValue({
      id: 'hub-new',
      name: 'Guiwan Hub',
      description: 'East center',
      active: true,
      latitude: 6.93,
      longitude: 122.09,
      attendanceRadiusM: 150,
      createdAt: '2026-08-30T00:00:00Z',
      updatedAt: '2026-08-30T00:00:00Z',
    });

    await act(async () => {
      root?.render(<HubManagement />);
    });

    // Click Create hub button
    const createBtn = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Create hub'),
    );
    expect(createBtn).toBeDefined();

    await act(async () => {
      createBtn?.click();
    });

    expect(document.body.textContent).toContain('Create hub');
    expect(document.body.textContent).toContain('Attendance Geofence *');
    expect(document.body.textContent).toContain('Attendance Radius *');

    // Name input
    const nameInput = document.body.querySelector('input[placeholder*="Operations Hub"]') as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();

    // Radius input
    const radiusInput = document.body.querySelector('input[type="number"]') as HTMLInputElement | null;
    expect(radiusInput).not.toBeNull();

    // Submit button should be disabled initially
    const saveBtn = Array.from(document.body.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Save hub'),
    ) as HTMLButtonElement | undefined;
    expect(saveBtn?.disabled).toBe(true);

    // Fill name only -> still disabled because pin + radius are required for new hubs
    if (nameInput) changeInput(nameInput, 'Guiwan Hub');

    expect(saveBtn?.disabled).toBe(true);
  });

  it('opens Edit Hub drawer with existing coordinates and radius for a configured hub', async () => {
    await act(async () => {
      root?.render(<HubManagement />);
    });

    // Click Edit hub button
    const editBtn = Array.from(document.body.querySelectorAll('button') || []).find((b) =>
      b.getAttribute('aria-label')?.startsWith('Edit ') && !b.getAttribute('aria-label')?.includes('drawer'),
    );
    expect(editBtn).toBeDefined();

    await act(async () => {
      editBtn?.click();
    });

    expect(document.body.textContent).toContain('Edit hub');
    expect(document.body.textContent).toContain('Pin: 6.912345, 122.081234');

    const radiusInput = document.body.querySelector('input[type="number"]') as HTMLInputElement | null;
    expect(radiusInput?.value).toBe('100');
  });

  it('allows saving legacy unconfigured hub metadata without forcing geofence immediately', async () => {
    vi.mocked(hubService.updateHub).mockResolvedValue({
      ...mockLegacyHub,
      name: 'Ayala Renamed Hub',
    });

    await act(async () => {
      root?.render(<HubManagement />);
    });

    // Select legacy hub
    const legacyHubButton = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Ayala Legacy Hub'),
    );
    await act(async () => {
      legacyHubButton?.click();
    });

    // Click Edit hub button
    const editBtn = Array.from(document.body.querySelectorAll('button') || []).find((b) =>
      b.getAttribute('aria-label')?.startsWith('Edit ') && !b.getAttribute('aria-label')?.includes('drawer'),
    );
    await act(async () => {
      editBtn?.click();
    });

    expect(document.body.textContent).toContain('Legacy Hub:');
    expect(document.body.textContent).toContain('Attendance geofence is currently unconfigured');

    const nameInput = document.body.querySelector('input[placeholder*="Operations Hub"]') as HTMLInputElement | null;
    if (nameInput) changeInput(nameInput, 'Ayala Renamed Hub');

    const saveBtn = Array.from(document.body.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Save hub'),
    ) as HTMLButtonElement | undefined;
    expect(saveBtn?.disabled).toBe(false);

    const form = document.body.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(hubService.updateHub).toHaveBeenCalledWith('hub-legacy-2', {
      name: 'Ayala Renamed Hub',
      description: 'Unconfigured legacy hub',
    });
  });
});
