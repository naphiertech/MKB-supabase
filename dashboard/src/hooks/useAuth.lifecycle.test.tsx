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
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signInWithOAuth: mocks.signInWithOAuth,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));
vi.mock('./useToast', () => ({ pushToast: vi.fn() }));
vi.mock('../lib/apiService', () => ({ fetchIpLocation: vi.fn().mockResolvedValue(null), logActivity: vi.fn() }));
vi.mock('../lib/deviceFingerprint', () => ({ getDeviceIdentifier: vi.fn() }));
vi.mock('../services/notifications/notificationService', () => ({ dispatchNotificationSafe: vi.fn() }));
vi.mock('../lib/offlineRiderTrust', () => ({
  clearOfflineRiderTrust: vi.fn(),
  createOfflineRiderTrustRecord: vi.fn(),
  getOfflineRiderTrust: vi.fn(),
  saveOfflineRiderTrust: vi.fn(),
  validateOfflineRiderTrust: vi.fn(),
}));
vi.mock('../services/auth/authSecurity', () => ({ logoutCurrentSessionLocally: vi.fn() }));
vi.mock('../services/riders/riderCacheService', () => ({ clearRiderSensitiveCache: vi.fn() }));
vi.mock('../services/users/userService', () => ({ getStaffAvatarSignedUrl: vi.fn().mockResolvedValue(null) }));

const storedSession = {
  id: 'staff-1',
  email: 'legacy@mkb.ph',
  fullName: 'Legacy Admin',
  role: 'admin',
  accountStatus: 'active',
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
    mocks.signInWithOAuth.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
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

  it('allows restricted Riders to log in while archived Riders and suspended staff remain blocked', async () => {
    const { isProfileLoginBlocked } = await import('./useAuth');
    expect(isProfileLoginBlocked({ role: 'rider', status: 'suspended', employment_status: 'active' })).toBe(false);
    expect(isProfileLoginBlocked({ role: 'rider', status: 'suspended', employment_status: 'archived' })).toBe(true);
    expect(isProfileLoginBlocked({ role: 'payroll', status: 'suspended', employment_status: 'active' })).toBe(true);
  });

  it('initiates Google OAuth sign in with correct parameters', async () => {
    const { useAuth } = await import('./useAuth');
    let authHook: ReturnType<typeof useAuth> | undefined;
    function Probe() {
      authHook = useAuth();
      return null;
    }

    await act(async () => {
      root.render(<Probe />);
      await flushAsyncWork();
    });

    await act(async () => {
      const res = await authHook?.signInWithGoogle();
      expect(res).toEqual({ ok: true });
    });

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({
          redirectTo: expect.any(String),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }),
      })
    );
  });

  it('blocks unregistered Google OAuth logins, logs unauthorized attempt, and calls signOut', async () => {
    localStorage.clear();
    mocks.from.mockClear();
    mocks.rpc.mockClear();
    mocks.signOut.mockClear();

    const strangerSession = {
      user: {
        id: 'unregistered-google-uid',
        email: 'unregistered@gmail.com',
        app_metadata: { provider: 'google' },
      },
    };

    mocks.getSession.mockResolvedValue({ data: { session: strangerSession } });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Row not found' } }),
    };
    mocks.from.mockReturnValue(query);

    const { useAuth } = await import('./useAuth');
    let sessionResult: unknown = 'init';
    function Probe() {
      const { session } = useAuth();
      sessionResult = session;
      return <span>{session?.email ?? 'no-session'}</span>;
    }

    await act(async () => {
      root.render(<Probe />);
      await flushAsyncWork();
    });

    expect(mocks.rpc).toHaveBeenCalledWith('log_unauthorized_auth_attempt', {
      p_email: 'unregistered@gmail.com',
      p_provider: 'google',
      p_reason: 'Account not found in company registry',
      p_metadata: { auth_user_id: 'unregistered-google-uid' },
    });
    expect(mocks.signOut).toHaveBeenCalled();
    expect(sessionResult).toBeNull();
    expect(container.textContent).toBe('no-session');
  });

  it('does not blink or re-emit duplicate sessions when signing in as admin/hr/payroll with multiple useAuth consumers', async () => {
    localStorage.clear();
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    const staffUser = { id: 'staff-1', email: 'hr@mkb.ph' };
    mocks.signInWithPassword.mockImplementation(async () => {
      // Supabase fires SIGNED_IN to all onAuthStateChange listeners before signIn() fetches the user profile
      for (const cb of [...mocks.authCallbacks]) {
        void cb('SIGNED_IN', { user: staffUser });
      }
      await new Promise((r) => setTimeout(r, 5));
      return { data: { user: staffUser, session: { user: staffUser } }, error: null };
    });

    let callIndex = 0;
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(async () => {
        callIndex += 1;
        await new Promise((r) => setTimeout(r, callIndex * 5));
        return { data: { ...profile, role: 'hr', hub_access_scope: 'global' }, error: null };
      }),
    };
    mocks.from.mockReturnValue(query);

    const { useAuth } = await import('./useAuth');
    let authApi!: ReturnType<typeof useAuth>;
    const emittedSessions: unknown[] = [];

    function Consumer({ id }: { id: string }) {
      const auth = useAuth();
      if (id === 'main') {
        authApi = auth;
        if (auth.session && emittedSessions[emittedSessions.length - 1] !== auth.session) {
          emittedSessions.push(auth.session);
        }
      }
      return <div data-id={id}>{auth.session?.role ?? 'logged-out'}</div>;
    }

    await act(async () => {
      root.render(
        <>
          <Consumer id="hub" />
          <Consumer id="rider-zone" />
          <Consumer id="notifications" />
          <Consumer id="app" />
          <Consumer id="main" />
        </>
      );
      await flushAsyncWork();
    });

    expect(emittedSessions).toHaveLength(0);

    await act(async () => {
      void authApi.signIn('hr@mkb.ph', 'password123');
    });
    for (let i = 0; i < 8; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 6));
      });
    }

    // Should emit_once for the login, not 6 duplicate references causing UI blinks
    expect(emittedSessions).toHaveLength(1);
    expect(query.single).toHaveBeenCalledTimes(1);
  });
});
