import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { setSelectedHubId as setWorkspaceHubId } from '../lib/hubWorkspaceState';
import { listAccessibleHubs, type Hub } from '../services/hubs/hubService';

interface HubContextValue {
  hubs: Hub[];
  selectedHubId: string | null;
  selectedHub: Hub | null;
  canSelectAll: boolean;
  isReady: boolean;
  workspaceKey: string;
  selectHub: (hubId: string | null) => void;
  refreshHubs: () => Promise<void>;
}

const HubContext = createContext<HubContextValue | null>(null);

export function HubProvider({ children }: { children: ReactNode }) {
  const { session, isReady: authReady } = useAuth();
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [selectedHubId, setSelectedHubId] = useState<string | null>(null);
  const [readyUserId, setReadyUserId] = useState<string | null | undefined>(undefined);
  const sessionId = session?.id ?? null;
  const sessionRole = session?.role ?? null;
  const canSelectAll = sessionRole === 'admin' || session?.hubAccessScope === 'global';
  const isReady = authReady && readyUserId === sessionId;

  const selectHub = useCallback((hubId: string | null) => {
    if (!sessionId || sessionRole === 'rider') return;
    if (hubId === null && !canSelectAll) return;
    if (hubId !== null && !hubs.some((hub) => hub.id === hubId)) return;
    setWorkspaceHubId(hubId);
    setSelectedHubId(hubId);
    window.localStorage.setItem(`mkb.hub-workspace.${sessionId}`, hubId ?? 'all');
  }, [canSelectAll, hubs, sessionId, sessionRole]);

  const refreshHubs = useCallback(async () => {
    if (!sessionId || sessionRole === 'rider') {
      setHubs([]);
      setWorkspaceHubId(null);
      setSelectedHubId(null);
      setReadyUserId(sessionId);
      return;
    }
    setReadyUserId((prev) => (prev === sessionId ? prev : undefined));
    try {
      const accessible = await listAccessibleHubs({ activeOnly: false });
      setHubs(accessible);
      const stored = window.localStorage.getItem(`mkb.hub-workspace.${sessionId}`);
      const storedHubId = stored && stored !== 'all' && accessible.some((hub) => hub.id === stored) ? stored : null;
      const next = storedHubId ?? (canSelectAll ? null : accessible[0]?.id ?? null);
      setWorkspaceHubId(next);
      setSelectedHubId(next);
    } finally {
      setReadyUserId(sessionId);
    }
  }, [canSelectAll, sessionId, sessionRole]);

  useEffect(() => {
    if (!authReady) return;
    void refreshHubs();
  }, [authReady, refreshHubs]);

  const value = useMemo<HubContextValue>(() => ({
    hubs,
    selectedHubId,
    selectedHub: hubs.find((hub) => hub.id === selectedHubId) ?? null,
    canSelectAll,
    isReady,
    workspaceKey: selectedHubId ?? 'all',
    selectHub,
    refreshHubs,
  }), [canSelectAll, hubs, isReady, refreshHubs, selectHub, selectedHubId]);

  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}

export function useHub() {
  const value = useContext(HubContext);
  if (!value) throw new Error('useHub must be used within HubProvider');
  return value;
}
