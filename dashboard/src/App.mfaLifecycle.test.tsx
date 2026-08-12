// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authState: {
    session: null as null | {
      id: string;
      email: string;
      fullName: string;
      role: 'admin';
      employmentStatus: 'active';
    },
    isReady: false,
    user: null as null | {
      id: string;
      email: string;
      name: string;
      avatar: string;
      role: 'admin';
      zoneId: null;
      status: 'active';
      employmentStatus: 'active';
      lastLogin: number;
    },
    signOut: vi.fn(),
    signOutLocally: vi.fn(),
  },
  getMfaState: vi.fn(),
  authListener: null as null | ((event: string, session: { user: { id: string } } | null) => void),
  unsubscribeAuth: vi.fn(),
}));

vi.mock('./hooks/useAuth', () => ({ useAuth: () => mocks.authState }));
vi.mock('./services/authSecurity', () => ({
  getMfaState: mocks.getMfaState,
  getCurrentAuthSessionIdentity: vi.fn().mockResolvedValue({ userId: 'admin-1', sessionId: 'session-1' }),
  subscribeToOtherSessionLogout: vi.fn().mockResolvedValue(vi.fn()),
}));
vi.mock('./lib/supabaseClient', () => {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    presenceState: vi.fn().mockReturnValue({}),
    track: vi.fn().mockResolvedValue(undefined),
  };
  return {
    supabase: {
      auth: {
        onAuthStateChange: vi.fn((listener) => {
          mocks.authListener = listener;
          return { data: { subscription: { unsubscribe: mocks.unsubscribeAuth } } };
        }),
      },
      channel: vi.fn(() => channel),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    },
  };
});
vi.mock('./context/RiderZoneContext', () => ({ useRiderZone: () => ({ riders: [], zones: [] }) }));
vi.mock('./context/HubContext', () => ({ useHub: () => ({ isReady: true, workspaceKey: 'all' }) }));
vi.mock('./hooks/useNotifications', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, markAsRead: vi.fn(), markAllAsRead: vi.fn() }),
}));
vi.mock('./lib/sync/SyncEngine', () => ({ initSyncEngine: vi.fn(), startSyncEngine: vi.fn(), stopSyncEngine: vi.fn() }));
vi.mock('./components/common/Sidebar', () => ({ Sidebar: () => <div>Sidebar</div> }));
vi.mock('./components/common/Topbar', () => ({ Topbar: () => <div>Topbar</div> }));
vi.mock('./components/common/DashboardSkeleton', () => ({ DashboardSkeleton: () => <div>Loading page</div> }));
vi.mock('./components/common/HelpSupportModal', () => ({ HelpSupportModal: () => null }));
vi.mock('./components/auth/MfaChallenge', () => ({ MfaChallenge: () => <div>Authenticator verification</div> }));
vi.mock('./components/auth/PasswordRecovery', () => ({ PasswordRecovery: () => <div>Password recovery</div> }));
vi.mock('./pages/AdminDashboard', () => ({ AdminDashboard: () => <div>Admin dashboard</div> }));
vi.mock('./pages/HRDashboard', () => ({ HRDashboard: () => <div>HR dashboard</div> }));
vi.mock('./pages/Login', () => ({ Login: () => <div>Login</div> }));
vi.mock('./pages/RiderDashboard', () => ({ RiderDashboard: () => null }));
vi.mock('./pages/RiderAttendance', () => ({ RiderAttendance: () => null }));
vi.mock('./pages/RiderMonitoring', () => ({ RiderMonitoring: () => null }));
vi.mock('./pages/RiderProfile', () => ({ RiderProfile: () => null }));
vi.mock('./components/rider/RiderTopNav', () => ({ RiderTopNav: () => null }));
vi.mock('react-hot-toast', () => ({ Toaster: () => null }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, variants: _variants, initial: _initial, animate: _animate, exit: _exit, ...props }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props}>{children}</div>,
  },
}));

import { App } from './App';

const session = {
  id: 'admin-1',
  email: 'naphiera@gmail.com',
  fullName: 'Admin User',
  role: 'admin' as const,
  employmentStatus: 'active' as const,
};

function userFor(email: string) {
  return {
    id: 'admin-1',
    email,
    name: 'Admin User',
    avatar: '',
    role: 'admin' as const,
    zoneId: null,
    status: 'active' as const,
    employmentStatus: 'active' as const,
    lastLogin: 0,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('application MFA security-gate lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.authState.session = session;
    mocks.authState.user = userFor(session.email);
    mocks.authState.isReady = false;
    mocks.authListener = null;
    mocks.getMfaState.mockResolvedValue({
      enabled: false,
      requiresChallenge: false,
      factorId: null,
      currentLevel: 'aal1',
      nextLevel: 'aal1',
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('performs one blocking security check after hard-refresh auth initialization', async () => {
    await act(async () => root.render(<App />));
    expect(container.textContent).toContain('Verifying account security');

    mocks.authState.isReady = true;
    mocks.authState.session = { ...session };
    mocks.authState.user = userFor(session.email);
    await act(async () => root.render(<App />));
    await flush();

    expect(mocks.getMfaState).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Admin dashboard');
  });

  it('does not re-enter the blocking loader for equivalent profile or email reconciliation', async () => {
    mocks.authState.isReady = true;
    await act(async () => root.render(<App />));
    await flush();

    mocks.authState.session = { ...session, email: 'naphier.tech@gmail.com' };
    mocks.authState.user = userFor('naphier.tech@gmail.com');
    await act(async () => root.render(<App />));
    await flush();

    expect(mocks.getMfaState).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('Verifying account security');
  });

  it.each(['TOKEN_REFRESHED', 'USER_UPDATED'])('rechecks %s without flashing the blocking loader', async (event) => {
    mocks.authState.isReady = true;
    await act(async () => root.render(<App />));
    await flush();

    expect(mocks.authListener).not.toBeNull();
    await act(async () => mocks.authListener?.(event, { user: { id: session.id } }));
    await flush();

    expect(mocks.getMfaState).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain('Verifying account security');
    expect(container.textContent).toContain('Admin dashboard');
  });

  it('shows the MFA challenge when a genuine assurance-level change requires it', async () => {
    mocks.authState.isReady = true;
    await act(async () => root.render(<App />));
    await flush();
    mocks.getMfaState.mockResolvedValueOnce({
      enabled: true,
      requiresChallenge: true,
      factorId: 'factor-1',
      currentLevel: 'aal1',
      nextLevel: 'aal2',
    });

    await act(async () => mocks.authListener?.('TOKEN_REFRESHED', { user: { id: session.id } }));
    await flush();

    expect(container.textContent).toContain('Authenticator verification');
  });

  it('settles the blocking loader when a token refresh supersedes the initial check', async () => {
    let resolveInitial!: (value: {
      enabled: boolean;
      requiresChallenge: boolean;
      factorId: null;
      currentLevel: string;
      nextLevel: string;
    }) => void;
    mocks.getMfaState
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveInitial = resolve;
      }))
      .mockResolvedValueOnce({
        enabled: false,
        requiresChallenge: false,
        factorId: null,
        currentLevel: 'aal1',
        nextLevel: 'aal1',
      });
    mocks.authState.isReady = true;
    await act(async () => root.render(<App />));
    expect(container.textContent).toContain('Verifying account security');

    await act(async () => mocks.authListener?.('TOKEN_REFRESHED', { user: { id: session.id } }));
    await flush();
    resolveInitial({ enabled: false, requiresChallenge: false, factorId: null, currentLevel: 'aal1', nextLevel: 'aal1' });
    await flush();

    expect(mocks.getMfaState).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain('Verifying account security');
    expect(container.textContent).toContain('Admin dashboard');
  });

  it('resets the gate across sign-out and performs one check for the next signed-in identity', async () => {
    mocks.authState.isReady = true;
    await act(async () => root.render(<App />));
    await flush();

    mocks.authState.session = null;
    mocks.authState.user = null;
    await act(async () => root.render(<App />));
    await flush();
    expect(container.textContent).toContain('Login');

    let resolveNextCheck!: (value: {
      enabled: boolean;
      requiresChallenge: boolean;
      factorId: null;
      currentLevel: string;
      nextLevel: string;
    }) => void;
    mocks.getMfaState.mockImplementationOnce(() => new Promise((resolve) => {
      resolveNextCheck = resolve;
    }));
    mocks.authState.session = { ...session, id: 'admin-2', email: 'next.admin@gmail.com' };
    mocks.authState.user = { ...userFor('next.admin@gmail.com'), id: 'admin-2' };
    await act(async () => root.render(<App />));
    expect(container.textContent).toContain('Verifying account security');
    resolveNextCheck({ enabled: false, requiresChallenge: false, factorId: null, currentLevel: 'aal1', nextLevel: 'aal1' });
    await flush();

    expect(mocks.getMfaState).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Admin dashboard');
  });
});
