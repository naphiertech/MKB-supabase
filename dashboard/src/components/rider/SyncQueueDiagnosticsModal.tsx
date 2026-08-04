import { useCallback, useEffect, useState } from 'react';
import { Clock3, MapPin, RefreshCw, TriangleAlert } from 'lucide-react';
import { Modal } from '../common/Modal';
import { getSyncEngine } from '../../lib/sync/SyncEngine';
import type { QueueItem } from '../../lib/storage';
import { pushToast } from '../../hooks/useToast';

interface SyncQueueDiagnosticsModalProps {
  open: boolean;
  failedCount: number;
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  TIME_IN: 'Time In',
  TIME_OUT: 'Time Out',
  LOCATION_PING: 'Location update'
};

function formatEventTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila'
  });
}

export function SyncQueueDiagnosticsModal({
  open,
  failedCount,
  onClose
}: SyncQueueDiagnosticsModalProps) {
  const [operations, setOperations] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadOperations = useCallback(async () => {
    setLoading(true);
    try {
      setOperations(await getSyncEngine().getFailedOperations());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadOperations();
  }, [open, failedCount, loadOperations]);

  const retryOperation = useCallback(async (operation: QueueItem) => {
    setRetryingId(operation.id);
    try {
      const accepted = await getSyncEngine().retryFailedOperation(operation.id);
      if (!accepted) {
        pushToast({
          title: 'Retry unavailable',
          description: 'This operation is no longer available or belongs to a different rider session.',
          tone: 'error'
        });
        return;
      }

      await loadOperations();
      pushToast({
        title: 'Retry scheduled',
        description: navigator.onLine
          ? 'The operation was safely submitted for synchronization.'
          : 'The operation is pending and will synchronize when the connection returns.',
        tone: 'success'
      });
    } catch (error) {
      console.error('[SyncDiagnostics] Failed to retry operation:', error);
      pushToast({
        title: 'Retry failed',
        description: 'The operation remains stored. Please try again later.',
        tone: 'error'
      });
    } finally {
      setRetryingId(null);
    }
  }, [loadOperations]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Offline synchronization"
      subtitle="Permanently failed records remain stored until they are retried successfully."
      size="lg"
    >
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading synchronization details...
          </div>
        ) : operations.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
            No permanently failed operations remain.
          </div>
        ) : (
          operations.map((operation) => {
            const isLocation = operation.action === 'LOCATION_PING';
            const retrying = retryingId === operation.id;
            return (
              <article
                key={operation.id}
                className="rounded-xl border border-red-200 bg-red-50/60 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
                      {isLocation
                        ? <MapPin className="h-4 w-4 shrink-0" />
                        : <TriangleAlert className="h-4 w-4 shrink-0" />}
                      {ACTION_LABELS[operation.action] || operation.action}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      Original event: {formatEventTimestamp(operation.eventTimestamp)}
                    </div>
                    <p className="break-words text-xs leading-relaxed text-red-700">
                      {operation.lastError || 'Synchronization failed without an error description.'}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      Reference: {operation.idempotencyKey}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void retryOperation(operation)}
                    disabled={retryingId !== null}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
                    {retrying ? 'Retrying' : 'Retry'}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </Modal>
  );
}
