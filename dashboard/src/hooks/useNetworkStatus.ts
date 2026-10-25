import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';

/**
 * Custom React hook that monitors network connectivity status.
 * Listens to Capacitor Network native events when running as native app,
 * or browser online/offline events on the web.
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    if (Capacitor.isNativePlatform()) {
      // Query initial status from native bridge
      Network.getStatus().then((status) => {
        setIsOnline(status.connected);
      }).catch(() => undefined);

      // Listen for native network status changes
      Network.addListener('networkStatusChange', (status) => {
        setIsOnline(status.connected);
      }).then((handle) => {
        unlisten = () => handle.remove();
      }).catch(() => undefined);
    } else {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      unlisten = () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return isOnline;
}
