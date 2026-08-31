// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubSelector } from './HubSelector';
import * as hubContext from '../../context/HubContext';
import type { Hub } from '../../services/hubs/hubService';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../context/HubContext', () => ({
  useHub: vi.fn(),
}));

const mockHubs: Hub[] = [
  {
    id: 'hub-1',
    name: 'Talon-Talon Hub',
    description: null,
    active: true,
    latitude: 6.91,
    longitude: 122.08,
    attendanceRadiusM: 100,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 'hub-2',
    name: 'Ayala Hub',
    description: null,
    active: true,
    latitude: 6.95,
    longitude: 122.02,
    attendanceRadiusM: 150,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  },
];

describe('HubSelector', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
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

  it('renders disabled with cursor-wait when isReady is false (loading state)', async () => {
    vi.mocked(hubContext.useHub).mockReturnValue({
      hubs: [],
      selectedHubId: null,
      selectedHub: null,
      canSelectAll: true,
      isReady: false,
      workspaceKey: 'all',
      selectHub: vi.fn(),
      refreshHubs: vi.fn(),
    });

    await act(async () => {
      root?.render(<HubSelector />);
    });

    const select = container?.querySelector('select') as HTMLSelectElement | null;
    const label = container?.querySelector('label') as HTMLLabelElement | null;

    expect(select?.disabled).toBe(true);
    expect(select?.className).toContain('cursor-wait');
    expect(label?.className).toContain('cursor-wait');
  });

  it('renders enabled with cursor-pointer for Admin when hubs are available', async () => {
    vi.mocked(hubContext.useHub).mockReturnValue({
      hubs: mockHubs,
      selectedHubId: null,
      selectedHub: null,
      canSelectAll: true,
      isReady: true,
      workspaceKey: 'all',
      selectHub: vi.fn(),
      refreshHubs: vi.fn(),
    });

    await act(async () => {
      root?.render(<HubSelector />);
    });

    const select = container?.querySelector('select') as HTMLSelectElement | null;
    const label = container?.querySelector('label') as HTMLLabelElement | null;

    expect(select?.disabled).toBe(false);
    expect(select?.className).toContain('cursor-pointer');
    expect(label?.className).toContain('cursor-pointer');
  });

  it('renders disabled with cursor-not-allowed for Admin when zero hubs exist', async () => {
    vi.mocked(hubContext.useHub).mockReturnValue({
      hubs: [],
      selectedHubId: null,
      selectedHub: null,
      canSelectAll: true,
      isReady: true,
      workspaceKey: 'all',
      selectHub: vi.fn(),
      refreshHubs: vi.fn(),
    });

    await act(async () => {
      root?.render(<HubSelector />);
    });

    const select = container?.querySelector('select') as HTMLSelectElement | null;
    const label = container?.querySelector('label') as HTMLLabelElement | null;

    expect(select?.disabled).toBe(true);
    expect(select?.className).toContain('cursor-not-allowed');
    expect(label?.className).toContain('cursor-not-allowed');
  });

  it('renders disabled with cursor-not-allowed for assigned staff with only 1 assigned hub', async () => {
    vi.mocked(hubContext.useHub).mockReturnValue({
      hubs: [mockHubs[0]],
      selectedHubId: 'hub-1',
      selectedHub: mockHubs[0],
      canSelectAll: false,
      isReady: true,
      workspaceKey: 'hub-1',
      selectHub: vi.fn(),
      refreshHubs: vi.fn(),
    });

    await act(async () => {
      root?.render(<HubSelector />);
    });

    const select = container?.querySelector('select') as HTMLSelectElement | null;
    const label = container?.querySelector('label') as HTMLLabelElement | null;

    expect(select?.disabled).toBe(true);
    expect(select?.className).toContain('cursor-not-allowed');
    expect(label?.className).toContain('cursor-not-allowed');
  });

  it('renders clear button when canSelectAll is true and a hub is selected, and clicking it calls selectHub(null)', async () => {
    const selectHub = vi.fn();
    vi.mocked(hubContext.useHub).mockReturnValue({
      hubs: mockHubs,
      selectedHubId: 'hub-1',
      selectedHub: mockHubs[0],
      canSelectAll: true,
      isReady: true,
      workspaceKey: 'hub-1',
      selectHub,
      refreshHubs: vi.fn(),
    });

    await act(async () => {
      root?.render(<HubSelector />);
    });

    const clearButton = container?.querySelector('button[aria-label="Show all hubs"]') as HTMLButtonElement | null;
    expect(clearButton).not.toBeNull();
    expect(clearButton?.title).toBe('Show all hubs');

    await act(async () => {
      clearButton?.click();
    });

    expect(selectHub).toHaveBeenCalledWith(null);
  });

  it('does NOT render clear button when selectedHubId is null', async () => {
    const selectHub = vi.fn();
    vi.mocked(hubContext.useHub).mockReturnValue({
      hubs: mockHubs,
      selectedHubId: null,
      selectedHub: null,
      canSelectAll: true,
      isReady: true,
      workspaceKey: 'all',
      selectHub,
      refreshHubs: vi.fn(),
    });

    await act(async () => {
      root?.render(<HubSelector />);
    });

    const clearButton = container?.querySelector('button[aria-label="Show all hubs"]');
    expect(clearButton).toBeNull();
  });

  it('does NOT render clear button when canSelectAll is false even if a hub is selected', async () => {
    const selectHub = vi.fn();
    vi.mocked(hubContext.useHub).mockReturnValue({
      hubs: mockHubs,
      selectedHubId: 'hub-1',
      selectedHub: mockHubs[0],
      canSelectAll: false,
      isReady: true,
      workspaceKey: 'hub-1',
      selectHub,
      refreshHubs: vi.fn(),
    });

    await act(async () => {
      root?.render(<HubSelector />);
    });

    const clearButton = container?.querySelector('button[aria-label="Show all hubs"]');
    expect(clearButton).toBeNull();
  });

  it('retains the "All Hubs" option in the dropdown when canSelectAll is true', async () => {
    const selectHub = vi.fn();
    vi.mocked(hubContext.useHub).mockReturnValue({
      hubs: mockHubs,
      selectedHubId: 'hub-1',
      selectedHub: mockHubs[0],
      canSelectAll: true,
      isReady: true,
      workspaceKey: 'hub-1',
      selectHub,
      refreshHubs: vi.fn(),
    });

    await act(async () => {
      root?.render(<HubSelector />);
    });

    const select = container?.querySelector('select') as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    const options = Array.from(container?.querySelectorAll('option') || []).map((opt) => ({
      value: opt.value,
      text: opt.textContent,
    }));

    expect(options).toEqual([
      { value: 'all', text: 'All Hubs' },
      { value: 'hub-1', text: 'Talon-Talon Hub' },
      { value: 'hub-2', text: 'Ayala Hub' },
    ]);

    // Selecting All Hubs calls selectHub(null)
    await act(async () => {
      if (select) {
        select.value = 'all';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    expect(selectHub).toHaveBeenCalledWith(null);
  });

  it('allows selecting another hub from the dropdown', async () => {
    const selectHub = vi.fn();
    vi.mocked(hubContext.useHub).mockReturnValue({
      hubs: mockHubs,
      selectedHubId: 'hub-1',
      selectedHub: mockHubs[0],
      canSelectAll: true,
      isReady: true,
      workspaceKey: 'hub-1',
      selectHub,
      refreshHubs: vi.fn(),
    });

    await act(async () => {
      root?.render(<HubSelector />);
    });

    const select = container?.querySelector('select') as HTMLSelectElement | null;

    await act(async () => {
      if (select) {
        select.value = 'hub-2';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    expect(selectHub).toHaveBeenCalledWith('hub-2');
  });
});
