import { useEffect, useState } from 'react';
import { getSyncEngine, type SyncQueueStatus } from '../lib/sync/SyncEngine';

const EMPTY_STATUS: SyncQueueStatus = {
  pending: 0,
  processing: 0,
  failed: 0,
  syncing: false
};

export function useSyncQueueStatus(): SyncQueueStatus {
  const [status, setStatus] = useState<SyncQueueStatus>(EMPTY_STATUS);

  useEffect(() => getSyncEngine().subscribe(setStatus), []);

  return status;
}
