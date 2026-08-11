// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authCallbacks: [] as Array<(event: string, session: unknown) => Promise<void> | void>,
  from: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: vi.fn(),
    },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));
vi.mock('./useToast', () => ({ pushToast: vi.fn() }));
vi.mock('../lib/apiService', () => ({ fetchIpLocation: vi.fn(), logActivity: vi.fn() }));
vi.mock('../lib/deviceFingerprint', () => ({ getDeviceIdentifier: vi.fn() }));
vi.mock('../services/notificationService', () => ({ dispatchNotificationSafe: vi.fn() }));
vi.mock('../lib/offlineRiderTrust', () => ({
  clearOfflineRiderTrust: vi.fn(),
  createOfflineRiderTrustRecord: vi.fn(),
  getOfflineRiderTrust: vi.fn(),
  saveOfflineRiderTrust: vi.fn(),
  validateOfflineRiderTrust: vi.fn(),
}));
vi.mock('../services/authSecurity', () => ({ logoutCurrentSessionLocally: vi.fn() }));
vi.mock('../services/riderCacheService', () => ({ clearRiderSensitiveCache: vi.fn() }));
vi.mock('../services/userService', () => ({ getStaffAvatarSignedUrl: vi.fn().mockResolvedValue(null) }));

const storedSession = {
  id: 'staff-1',
  email: 'legacy@mkb.ph',
  fullName: 'Legacy Admin',
  role: 'admin',
  employmentStatus: 'active',
};

const profile = {
  full_name: 'Legacy Admin',
  role: 'admin',
  status: 'active',
  rider_id: null,
  employment_status: 'active',
};

function authSession(email: string) {
  return { user: { id: 'staff-1', email } };
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('authenticated session reconciliation lifecycle', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.authCallbacks.length = 0;
    localStorage.setItem('attenrider.session.v1', JSON.stringify(storedSession));
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: profile, error: null }),
    };
    mocks.from.mockReturnValue(query);
    mocks.getSession.mockResolvedValue({ data: { session: authSession(storedSession.email) } });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.onAuthStateChange.mockImplementation((callback) => {
      mocks.authCallbacks.push(callback);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    localStorage.clear();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('ignores consumer INITIAL_SESSION events and emits only a materially changed confirmed session', async () => {
    const { useAuth } = await import('./useAuth');
    let renders = 0;
    function Probe({ label }: { label: string }) {
      const { session } = useAuth();
      renders += 1;
      return <span data-label={label}>{session?.email}</span>;
    }

    await act(async () => {
      root.render(<><Probe label="one" /><Probe label="two" /></>);
      await flushAsyncWork();
    });
    expect(mocks.authCallbacks).toHaveLength(2);

    mocks.from.mockClear();
    const rendersAfterMount = renders;
    await act(async () => {
      await Promise.all(mocks.authCallbacks.map((callback) => callback('INITIAL_SESSION', authSession(storedSession.email))));
      await flushAsyncWork();
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(renders).toBe(rendersAfterMount);

    await act(async () => {
      await Promise.all(mocks.authCallbacks.map((callback) => callback('USER_UPDATED', authSession(storedSession.email))));
      await flushAsyncWork();
    });
    expect(renders).toBe(rendersAfterMount);

    await act(async () => {
      await Promise.all(mocks.authCallbacks.map((callback) => callback('TOKEN_REFRESHED', authSession(storedSession.email))));
      await flushAsyncWork();
    });
    expect(renders).toBe(rendersAfterMount);

    await act(async () => {
      await Promise.all(mocks.authCallbacks.map((callback) => callback('USER_UPDATED', authSession('confirmed@gmail.com'))));
      await flushAsyncWork();
    });
    expect(container.textContent).toBe('confirmed@gmail.comconfirmed@gmail.com');
    expect(renders).toBe(rendersAfterMount + 2);
  });
});
