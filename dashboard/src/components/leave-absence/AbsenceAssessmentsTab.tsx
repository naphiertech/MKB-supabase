import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, RefreshCw, ShieldCheck } from 'lucide-react';
import { StatePanel, StatusBadge } from '../common/DashboardPrimitives';
import { useHub } from '../../context/HubContext';
import { useAttendanceContextVersion } from '../../hooks/useAttendanceContextVersion';
import { ATTENDANCE_CONTEXT_INVALIDATED } from '../../services/attendance/attendanceContextInvalidation';
import { supabase } from '../../lib/supabaseClient';
import {
  listAbsenceAssessments,
  getAssessmentReasonLabel,
  getAssessmentStatusLabel,
  type AbsenceAssessmentRow,
  type AbsenceAssessmentStatus,
} from '../../services/attendance/absenceAssessmentService';

export interface AbsenceAssessmentsTabProps {
  startDate?: string;
  endDate?: string;
  hubId?: string | null;
  riderId?: string | null;
  riderNames?: Record<string, string>;
}

type AssessmentFilter = 'all' | 'excused' | 'unexcused' | 'pending_review';

const FILTER_OPTIONS: Array<{ key: AssessmentFilter; label: string; status: AbsenceAssessmentStatus | null }> = [
  { key: 'all', label: 'All', status: null },
  { key: 'excused', label: 'Excused', status: 'excused' },
  { key: 'unexcused', label: 'Unexcused', status: 'unexcused' },
  { key: 'pending_review', label: 'Pending Review', status: 'pending_review' },
];

const DAY_FORMATTER = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatBusinessDate(dateStr: string): string {
  try {
    return DAY_FORMATTER.format(new Date(`${dateStr}T00:00:00Z`));
  } catch {
    return dateStr;
  }
}

function assessmentTone(status: AbsenceAssessmentStatus): 'success' | 'danger' | 'warning' | 'neutral' | 'info' {
  switch (status) {
    case 'excused':
      return 'success';
    case 'unexcused':
      return 'danger';
    case 'pending_review':
      return 'warning';
    case 'not_absent':
      return 'info';
    case 'not_applicable':
      return 'neutral';
    default:
      return 'neutral';
  }
}

function attendanceStatusLabel(status: string | null): string {
  if (!status || status === 'not_finalized') return '—';
  switch (status) {
    case 'present':
      return 'Present';
    case 'late':
      return 'Late';
    case 'on_leave':
      return 'On Leave';
    case 'absent':
      return 'Absent';
    case 'day_off':
      return 'Day Off';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function attendanceStatusTone(status: string | null): 'success' | 'danger' | 'warning' | 'neutral' | 'info' {
  switch (status) {
    case 'present':
      return 'success';
    case 'late':
      return 'warning';
    case 'on_leave':
      return 'info';
    case 'absent':
      return 'danger';
    case 'day_off':
      return 'neutral';
    default:
      return 'neutral';
  }
}

function getTodayManilaDate(): string {
  const now = new Date();
  const manilaDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  return manilaDateStr;
}

export function AbsenceAssessmentsTab({
  startDate: propStartDate,
  endDate: propEndDate,
  hubId: propHubId,
  riderId: propRiderId,
  riderNames: propRiderNames,
}: AbsenceAssessmentsTabProps) {
  const { selectedHubId } = useHub();
  const contextVersion = useAttendanceContextVersion();

  const effectiveHubId = propHubId !== undefined ? propHubId : selectedHubId;
  const defaultDate = useMemo(() => getTodayManilaDate(), []);
  const startDate = propStartDate || defaultDate;
  const endDate = propEndDate || defaultDate;

  const [activeFilter, setActiveFilter] = useState<AssessmentFilter>('all');
  const [rows, setRows] = useState<AbsenceAssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [riderInfoMap, setRiderInfoMap] = useState<Record<string, { name: string; mkbId?: string }>>({});

  const loadSequence = useRef(0);

  // Fetch rider names from database if not supplied via props
  useEffect(() => {
    if (propRiderNames) {
      const map: Record<string, { name: string; mkbId?: string }> = {};
      for (const [id, name] of Object.entries(propRiderNames)) {
        map[id] = { name };
      }
      setRiderInfoMap(map);
      return;
    }

    let isMounted = true;
    async function loadRiderDirectory() {
      try {
        const { data } = await supabase.from('riders').select('id, name, mkb_id');
        if (isMounted && data) {
          const map: Record<string, { name: string; mkbId?: string }> = {};
          for (const r of data) {
            map[r.id] = { name: r.name, mkbId: r.mkb_id ?? undefined };
          }
          setRiderInfoMap(map);
        }
      } catch {
        // Fallback silently if riders table query encounters an issue
      }
    }
    void loadRiderDirectory();

    return () => {
      isMounted = false;
    };
  }, [propRiderNames]);

  const loadAssessments = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);

    const selectedFilterOption = FILTER_OPTIONS.find((opt) => opt.key === activeFilter);
    const assessmentStatus = selectedFilterOption?.status ?? null;

    try {
      const freshRows = await listAbsenceAssessments({
        startDate,
        endDate,
        hubId: effectiveHubId,
        riderId: propRiderId ?? null,
        assessmentStatus,
      });

      if (sequence === loadSequence.current) {
        setRows(freshRows);
      }
    } catch (err) {
      if (sequence === loadSequence.current) {
        setError(err instanceof Error ? err.message : 'Unable to load absence assessments.');
      }
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false);
      }
    }
  }, [activeFilter, effectiveHubId, endDate, propRiderId, startDate]);

  // Reload when filters, date range, hub, or invalidation version changes
  useEffect(() => {
    void loadAssessments();
  }, [loadAssessments, contextVersion]);

  // Listen directly for review invalidation events
  useEffect(() => {
    const handleInvalidate = () => {
      void loadAssessments();
    };
    window.addEventListener(ATTENDANCE_CONTEXT_INVALIDATED, handleInvalidate);
    return () => {
      window.removeEventListener(ATTENDANCE_CONTEXT_INVALIDATED, handleInvalidate);
    };
  }, [loadAssessments]);

  return (
    <div className="space-y-4">
      {/* Header and Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Absence Assessments</h2>
            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
              V1 · Provisional
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Authoritative absence classifications derived from Attendance Context and versioned policy rules.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAssessments()}
          disabled={loading}
          className="ui-button-secondary inline-flex items-center gap-1.5 self-start sm:self-auto"
          aria-label="Refresh absence assessments"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-2.5" role="tablist" aria-label="Assessment status filters">
        {FILTER_OPTIONS.map((opt) => {
          const isActive = activeFilter === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveFilter(opt.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-panel-bg hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Error alert */}
      {error && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadAssessments()}
            className="ui-button-secondary inline-flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      {/* Table or Empty State */}
      {loading && rows.length === 0 ? (
        <StatePanel compact loading title="Loading absence assessments" />
      ) : rows.length === 0 ? (
        <StatePanel
          compact
          icon={activeFilter === 'all' ? ShieldCheck : History}
          title="No absence assessments found"
          description={
            activeFilter === 'all'
              ? 'No attendance records require absence assessment in this period.'
              : `No assessments found with status "${FILTER_OPTIONS.find((o) => o.key === activeFilter)?.label}".`
          }
        />
      ) : (
        <div
          className="overflow-x-auto rounded-xl border border-border"
          role="region"
          aria-label="Absence assessment list"
          tabIndex={0}
        >
          <table className="min-w-[45rem] w-full text-sm">
            <thead className="bg-panel-bg text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Rider</th>
                <th className="px-4 py-3 text-left font-semibold">Attendance</th>
                <th className="px-4 py-3 text-left font-semibold">Assessment</th>
                <th className="px-4 py-3 text-left font-semibold">Reason</th>
                <th className="px-4 py-3 text-left font-semibold">Policy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const riderInfo = riderInfoMap[row.riderId];
                const riderDisplayName = riderInfo?.name || row.riderId;
                const policyLabel = `V${row.policyVersionNumber} · ${
                  row.policyType.charAt(0).toUpperCase() + row.policyType.slice(1)
                }`;

                return (
                  <tr key={`${row.riderId}:${row.businessDate}`} className="hover:bg-panel-bg/50">
                    {/* Date */}
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-foreground">
                      {formatBusinessDate(row.businessDate)}
                    </td>

                    {/* Rider */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{riderDisplayName}</p>
                      {riderInfo?.mkbId && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{riderInfo.mkbId}</p>
                      )}
                    </td>

                    {/* Attendance Effective Status */}
                    <td className="px-4 py-3">
                      <StatusBadge tone={attendanceStatusTone(row.effectiveStatus)} dot>
                        {attendanceStatusLabel(row.effectiveStatus)}
                      </StatusBadge>
                    </td>

                    {/* Assessment Status */}
                    <td className="px-4 py-3">
                      <StatusBadge tone={assessmentTone(row.assessmentStatus)} dot>
                        {getAssessmentStatusLabel(row.assessmentStatus)}
                      </StatusBadge>
                    </td>

                    {/* Reason */}
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-foreground">
                      {getAssessmentReasonLabel(row.assessmentReason)}
                    </td>

                    {/* Policy Version */}
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {policyLabel}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
