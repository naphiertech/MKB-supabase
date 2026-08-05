import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface ParcelLogChangeRow {
  rider_id?: string;
  date?: string;
}

export function useParcelLogsRealtimeVersion(
  riderId: string | null | undefined,
  cutoffFrom: string | null | undefined,
  cutoffTo: string | null | undefined,
  enabled = true
): number {
  const [version, setVersion] = useState(0);
  const channelSuffix = useRef(Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!enabled || !riderId || !cutoffFrom || !cutoffTo) return;

    const channel = supabase
      .channel(`payroll-parcel-context-${channelSuffix.current}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parcel_logs',
          filter: `rider_id=eq.${riderId}`,
        },
        (payload) => {
          const changedRow = {
            ...(payload.old as ParcelLogChangeRow),
            ...(payload.new as ParcelLogChangeRow),
          };
          if (!changedRow.date || (changedRow.date >= cutoffFrom && changedRow.date <= cutoffTo)) {
            setVersion((current) => current + 1);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cutoffFrom, cutoffTo, enabled, riderId]);

  return version;
}
