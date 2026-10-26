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

const faceAiMocks = vi.hoisted(() => ({
  ensureScriptsLoaded: vi.fn().mockResolvedValue(true),
  loadFaceModels: vi.fn().mockResolvedValue(undefined),
  getFaceDescriptor: vi.fn().mockResolvedValue(null),
  getDescriptorFromUrl: vi.fn().mockResolvedValue(null),
  extractEnrollmentFaceDescriptor: vi.fn().mockResolvedValue({ status: 'no_face', descriptor: null }),
  preloadBiometrics: vi.fn().mockResolvedValue(undefined),
}));

const schedulerMocks = vi.hoisted(() => ({
  scheduleBiometricPreload: vi.fn((task: () => void) => {
    void task();
    return () => undefined;
  }),
  waitForBrowserIdle: vi.fn().mockResolvedValue(undefined),
  biometricPreloadPriority: {
    requestForeground: vi.fn(),
    canContinueBackground: vi.fn(() => true),
  },
}));

vi.mock('../../lib/faceAi', () => faceAiMocks);
vi.mock('../../lib/biometricPreloadScheduler', () => schedulerMocks);

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

  it('renders Staff Account Configuration in a responsive balanced sidebar hierarchy', () => {
    act(() => {
      root.render(
        <UserForm
          zones={mockZones}
          hubs={mockHubs}
          onClose={noop}
        />,
      );
    });

    // In default admin role (non-rider), staff permissions and security cards are in the sidebar
    const staffRoleAccess = container.querySelector('#staff-role-access');
    const staffSecurity = container.querySelector('#staff-security');
    expect(staffRoleAccess).not.toBeNull();
    expect(staffSecurity).not.toBeNull();

    expect(staffRoleAccess?.textContent).toContain('System Role');
    expect(staffRoleAccess?.textContent).toContain('Hub access');
    expect(staffSecurity?.textContent).toContain('Account Status');
    expect(staffSecurity?.textContent).toContain('Temporary Password');
    expect(staffSecurity?.textContent).toContain('Credential Security Policy');
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

  it('includes Contractual option for admin/staff user creation, but excludes Contractual for rider creation', () => {
    act(() => {
      root.render(
        <UserForm
          key="admin"
          defaultRole="admin"
          zones={mockZones}
          hubs={mockHubs}
          onClose={noop}
        />,
      );
    });

    const adminSelect = container.querySelector('select:has(option[value="full-time"])') as HTMLSelectElement | null;
    expect(adminSelect).not.toBeNull();
    const adminOptions = Array.from(adminSelect?.options || []).map((opt) => opt.value);
    expect(adminOptions).toContain('full-time');
    expect(adminOptions).toContain('part-time');
    expect(adminOptions).toContain('contractual');

    act(() => {
      root.render(
        <UserForm
          key="rider"
          defaultRole="rider"
          zones={mockZones}
          hubs={mockHubs}
          onClose={noop}
        />,
      );
    });

    const riderSelect = container.querySelector('select:has(option[value="full-time"])') as HTMLSelectElement | null;
    expect(riderSelect).not.toBeNull();
    const riderOptions = Array.from(riderSelect?.options || []).map((opt) => opt.value);
    expect(riderOptions).toContain('full-time');
    expect(riderOptions).toContain('part-time');
    expect(riderOptions).not.toContain('contractual');
  });

  it('preloads biometric models in background when role is rider', () => {
    faceAiMocks.preloadBiometrics.mockClear();
    schedulerMocks.scheduleBiometricPreload.mockClear();

    act(() => {
      root.render(
        <UserForm
          defaultRole="rider"
          zones={mockZones}
          hubs={mockHubs}
          onClose={noop}
        />,
      );
    });

    expect(schedulerMocks.scheduleBiometricPreload).toHaveBeenCalledTimes(1);
    expect(faceAiMocks.preloadBiometrics).toHaveBeenCalledTimes(1);
  });

  it('shows Biometric Processing Modal on image upload and rejects photos with no face or multiple faces without setting faceImage', async () => {
    vi.useFakeTimers();
    const origFileReader = globalThis.FileReader;
    const origImage = globalThis.Image;

    class MockFileReader {
      result: string | null = 'data:image/jpeg;base64,fakeimage';
      onload: (() => void) | null = null;
      readAsDataURL() {
        this.onload?.();
      }
    }

    class MockImage {
      width = 100;
      height = 100;
      onload: (() => void) | null = null;
      set src(_v: string) {
        this.onload?.();
      }
    }

    globalThis.FileReader = MockFileReader as unknown as typeof FileReader;
    globalThis.Image = MockImage as unknown as typeof Image;
    const getCtxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    try {
      let resolveExtraction!: (val: { status: string; descriptor: Float32Array | null }) => void;
      faceAiMocks.extractEnrollmentFaceDescriptor.mockImplementationOnce(
        () => new Promise((r) => { resolveExtraction = r; }),
      );

      act(() => {
        root.render(
          <UserForm
            defaultRole="rider"
            zones={mockZones}
            hubs={mockHubs}
            onClose={noop}
          />,
        );
      });

      const fileInput = container.querySelector('#face-registration-file') as HTMLInputElement;
      expect(fileInput).not.toBeNull();

      await act(async () => {
        const file = new File(['dummy'], 'rider.jpg', { type: 'image/jpeg' });
        Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Immediately shows Biometric Processing Modal
      expect(document.body.textContent).toContain('Processing Face Biometrics...');
      expect(document.body.textContent).toContain('Decrypting & validating facial vector...');

      // Advance frame yield timer
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Resolve with multiple_faces
      await act(async () => {
        resolveExtraction({ status: 'multiple_faces', descriptor: null });
      });

      // Modal dismissed, error displayed, not marked verified
      expect(document.body.textContent).not.toContain('Processing Face Biometrics...');
      expect(container.textContent).not.toContain('Face Verified & Registered');
      expect(container.textContent).toContain('Multiple faces found');
    } finally {
      getCtxSpy.mockRestore();
      globalThis.FileReader = origFileReader;
      globalThis.Image = origImage;
      vi.useRealTimers();
    }
  });
});
