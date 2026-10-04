import { useState, useEffect } from 'react';
import {
  History,
  X,
  User,
  ShieldCheck,
  Cpu,
  Layers,
  AlertCircle,
  Loader2,
  FileText,
  Calendar,
} from 'lucide-react';
import { RightDrawer } from '../common/RightDrawer';
import {
  getAttendanceAuditHistory,
  type AttendanceAuditLog,
} from '../../services/attendance/attendanceCorrectionService';

export interface AttendanceAuditHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  attendanceLogId?: string | null;
  riderId?: string | null;
  date?: string | null;
  riderName?: string | null;
}

export function AttendanceAuditHistoryDrawer({
  isOpen,
  onClose,
  attendanceLogId,
  riderId,
  date,
  riderName,
}: AttendanceAuditHistoryDrawerProps) {
  const [history, setHistory] = useState<AttendanceAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    setFetchError(null);

    getAttendanceAuditHistory({
      attendanceLogId: attendanceLogId || undefined,
      riderId: riderId || undefined,
      date: date || undefined,
    })
      .then(({ data, error }) => {
        if (error) {
          setFetchError(error.message);
        } else {
          setHistory(data);
        }
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, attendanceLogId, riderId, date]);

  function formatTimestamp(tsStr: string): string {
    if (!tsStr) return '—';
    try {
      const d = new Date(tsStr);
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(d);
    } catch {
      return tsStr;
    }
  }

  function formatClockTime(isoStr: string | null): string {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(d);
    } catch {
      return isoStr;
    }
  }

  function getSourceBadge(source: string | null) {
    switch (source) {
      case 'attendance_correction':
        return {
          label: 'HR / Admin Correction',
          color: 'bg-purple-50 text-purple-700 border-purple-200',
          icon: ShieldCheck,
        };
      case 'face_scan_rpc':
        return {
          label: 'Rider Biometric Face Scan',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: User,
        };
      case 'daily_finalizer':
        return {
          label: 'System Cutoff Finalizer',
          color: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: Cpu,
        };
      default:
        return {
          label: source || 'Unclassified Write',
          color: 'bg-gray-100 text-gray-700 border-gray-200',
          icon: Layers,
        };
    }
  }

  return (
    <RightDrawer
      open={isOpen}
      onClose={onClose}
      ariaLabel="Attendance audit history drawer"
      widthClassName="max-w-xl"
      backdropClassName="bg-black/60"
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Attendance Audit Trail</h2>
              <p className="text-xs text-muted-foreground">
                Immutable chronological event log of all lifecycle mutations.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-panel-bg transition"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Summary Card */}
        {(riderName || date) && (
          <div className="mx-5 mt-4 p-3 bg-panel-bg border border-border rounded-xl flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold text-foreground">{riderName || 'Rider Record'}</span>
            </div>
            {date && (
              <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span>{date}</span>
              </div>
            )}
          </div>
        )}

        {/* Scrollable Audit Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span>Loading audit logs...</span>
            </div>
          )}

          {fetchError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{fetchError}</span>
            </div>
          )}

          {!isLoading && !fetchError && history.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-xs space-y-1">
              <History className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
              <div className="font-semibold text-foreground">No audit entries found</div>
              <p className="text-[11px]">No audit events recorded for this attendance record yet.</p>
            </div>
          )}

          {!isLoading && history.length > 0 && (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
              {history.map((item, idx) => {
                const sourceBadge = getSourceBadge(item.change_source);
                const SourceIcon = sourceBadge.icon;

                return (
                  <div key={item.id || idx} className="relative space-y-2">
                    {/* Timeline Node Dot */}
                    <div
                      className={`absolute -left-[25px] top-1.5 w-3 h-3 rounded-full border-2 border-white shadow-xs ${
                        item.change_source === 'attendance_correction'
                          ? 'bg-purple-600 ring-2 ring-purple-200'
                          : item.change_source === 'face_scan_rpc'
                          ? 'bg-emerald-600 ring-2 ring-emerald-200'
                          : 'bg-amber-500 ring-2 ring-amber-200'
                      }`}
                    />

                    {/* Action Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-md ${
                            item.change_source === 'attendance_correction'
                              ? 'bg-purple-600 text-white'
                              : item.action === 'INSERT'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          {item.action}
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-foreground">
                          {formatTimestamp(item.recorded_at)}
                        </span>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${sourceBadge.color}`}
                      >
                        <SourceIcon className="w-3 h-3" />
                        <span>{sourceBadge.label}</span>
                      </span>
                    </div>

                    {/* Card container for audit details */}
                    <div className="bg-panel-bg/70 border border-border rounded-xl p-3.5 space-y-2.5">
                      {/* Actor Information */}
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border/50 pb-2">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>Actor:</span>
                          <strong className="text-foreground">{item.actor_name || 'System'}</strong>
                          <span className="text-[10px] uppercase font-mono px-1 bg-white border border-border rounded">
                            {item.actor_type}
                          </span>
                        </div>
                        {item.correction_type && (
                          <div className="text-[10px] font-mono text-primary font-bold">
                            Type: {item.correction_type}
                          </div>
                        )}
                      </div>

                      {/* State transitions */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                            Status
                          </span>
                          <div className="font-mono flex items-center gap-1.5 mt-0.5">
                            {item.old_status ? (
                              <>
                                <span className="text-muted-foreground line-through capitalize">
                                  {item.old_status}
                                </span>
                                <span>→</span>
                              </>
                            ) : null}
                            <span className="text-foreground font-bold capitalize">
                              {item.new_status || '—'}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                            Clocks (In → Out)
                          </span>
                          <div className="font-mono flex items-center gap-1.5 mt-0.5">
                            <span className="text-foreground font-semibold">
                              {formatClockTime(item.new_time_in)} → {formatClockTime(item.new_time_out)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Reason & Evidence */}
                      {item.reason && (
                        <div className="text-[11px] bg-white border border-border/70 rounded-lg p-2 space-y-1">
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1">
                            <FileText className="w-3 h-3 text-muted-foreground" />
                            <span>Reason / Notes:</span>
                          </div>
                          <p className="text-foreground font-mono leading-relaxed">{item.reason}</p>
                        </div>
                      )}

                      {item.evidence_reference && (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                          <span className="font-bold text-foreground">Evidence Ref:</span>
                          <span className="bg-white border border-border px-1.5 py-0.5 rounded text-foreground font-semibold">
                            {item.evidence_reference}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky Drawer Footer */}
        <div className="border-t border-border px-5 py-4 bg-white/95 backdrop-blur-xs flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-foreground bg-panel-bg hover:bg-white border border-border rounded-lg transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </RightDrawer>
  );
}

// Backward compatibility alias
export const AttendanceAuditHistoryModal = AttendanceAuditHistoryDrawer;
