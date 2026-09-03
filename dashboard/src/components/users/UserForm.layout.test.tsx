// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserForm } from './UserForm';
import type { Hub } from '../../services/hubs/hubService';
import type { Zone } from '../../services/types';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { id: 'admin-1', role: 'admin' },
  }),
}));

vi.mock('../../context/HubContext', () => ({
  useHub: () => ({
    selectedHubId: null,
    canSelectAll: true,
  }),
}));

vi.mock('../../services/users/userService', () => ({
  checkEmployeeDuplicates: vi.fn().mockResolvedValue({ hasDuplicate: false }),
}));

vi.mock('../../lib/faceAi', () => ({
  ensureScriptsLoaded: vi.fn().mockResolvedValue(false),
  loadFaceModels: vi.fn().mockResolvedValue(undefined),
  getFaceDescriptor: vi.fn().mockResolvedValue(null),
  getDescriptorFromUrl: vi.fn().mockResolvedValue(null),
}));

const mockHubs: Hub[] = [
  { id: 'hub-1', name: 'Talon-Talon Hub', active: true, description: null, latitude: null, longitude: null, attendanceRadiusM: null, createdAt: '', updatedAt: '' },
  { id: 'hub-2', name: 'Ayala Hub', active: true, description: null, latitude: null, longitude: null, attendanceRadiusM: null, createdAt: '', updatedAt: '' },
];

const mockZones: Zone[] = [
  { id: 'zone-1', name: 'Zone 1 - Talon-Talon', hubId: 'hub-1', active: true, color: '#ff6600' } as unknown as Zone,
];

describe('UserForm layout refinement', () => {
  let container: HTMLDivElement;
  let root: Root;
  const noop = () => undefined;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('renders Add New User occupying the shared full-width dashboard workspace without artificial max-width constraints', () => {
    act(() => {
      root.render(
        <UserForm
          zones={mockZones}
          hubs={mockHubs}
          onClose={noop}
        />,
      );
    });

    const pageWrapper = container.querySelector('.dashboard-page');
    expect(pageWrapper).not.toBeNull();

    // Verify there are no artificial width-capping classes (such as max-w-3xl, max-w-5xl, max-w-6xl)
    const cappedContainer = pageWrapper?.querySelector('[class*="max-w-"]');
    expect(cappedContainer).toBeNull();

    // Grid and cards are direct children of dashboard-page, occupying full available content width
    const formGrid = pageWrapper?.querySelector(':scope > .grid');
    expect(formGrid).not.toBeNull();
  });

  it('renders Personal Information with responsive 3-column name grid and 2-column detail rows', () => {
    act(() => {
      root.render(
        <UserForm
          zones={mockZones}
          hubs={mockHubs}
          onClose={noop}
        />,
      );
    });

    const personalSection = container.querySelector('#personal');
    expect(personalSection).not.toBeNull();

    // Name grid: First Name | Middle Name | Last Name
    const nameGrid = personalSection?.querySelector('.sm\\:grid-cols-3');
    expect(nameGrid).not.toBeNull();
    expect(nameGrid?.querySelectorAll('input').length).toBe(3);

    // Email & Contact row: 2 columns
    const twoColGrids = personalSection?.querySelectorAll('.sm\\:grid-cols-2');
    expect(twoColGrids?.length).toBe(2);
  });

  it('renders Account Configuration in a responsive 2-column desktop layout', () => {
    act(() => {
      root.render(
        <UserForm
          zones={mockZones}
          hubs={mockHubs}
          onClose={noop}
        />,
      );
    });

    // In default admin role (non-rider), the account configuration card is visible
    const accountConfigGrid = container.querySelector('.lg\\:grid-cols-2.items-start');
    expect(accountConfigGrid).not.toBeNull();

    // Left column contains Account Status and System Role
    expect(accountConfigGrid?.textContent).toContain('Account Status');
    expect(accountConfigGrid?.textContent).toContain('System Role');
    expect(accountConfigGrid?.textContent).toContain('Hub access');

    // Right column contains Temporary Password and Credential Security Policy
    expect(accountConfigGrid?.textContent).toContain('Temporary Password');
    expect(accountConfigGrid?.textContent).toContain('Credential Security Policy');
  });

  it('renders HR Onboarding Notes with full-width textarea and bounded row height', () => {
    act(() => {
      root.render(
        <UserForm
          zones={mockZones}
          hubs={mockHubs}
          onClose={noop}
        />,
      );
    });

    const notesSection = container.querySelector('#notes');
    expect(notesSection).not.toBeNull();

    const textarea = notesSection?.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(textarea?.getAttribute('rows')).toBe('4');
    expect(textarea?.classList.contains('ar-textarea')).toBe(true);
  });
});
