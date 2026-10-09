import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  RefreshCw, Search, ChevronDown, ChevronRight, X,
  ChevronsUpDown, User,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useAttendanceContextVersion } from '../../hooks/useAttendanceContextVersion';
import { appToast } from '../../hooks/useToast';
import { Modal } from '../common/Modal';
import { StatePanel, StatusBadge } from '../common/DashboardPrimitives';
import { createSyncOperationId } from '../../lib/storage';
import { getAssessmentReasonLabel, getAssessmentStatusLabel } from '../../services/attendance/absenceAssessmentService';
import {
  loadFinancialAbsencePage, confirmAbsenceFinancialDecision, waiveAbsenceFinancialDecision,
  sendAbsenceToPayroll, reverseAbsenceFinancialDecision, financialErrorMessage,
  FINANCIAL_PAGE_SIZE, FINANCIAL_REASON_LABELS, FINANCIAL_STATUS_LABELS,
  COMPENSATION_RECORDED_LABEL, formatFinancialAmount,
  type FinancialReviewRow, type WaiverCategory,
} from '../../services/attendance/absenceFinancialService';

interface Props {
  startDate: string;
  endDate: string;
  hubId?: string | null;
  riderId?: string | null;
  riderNames?: Record<string, string>;
  riderCodes?: Record<string, string>;
}

type Action = 'confirm' | 'waive' | 'send' | 'reverse';

const TITLES: Record<Action, string> = {
  confirm: 'Confirm Financial Decision',
  waive: 'Waive Penalty',
  send: 'Send to Payroll',
  reverse: 'Reverse Decision',
};

const SUCCESS: Record<Action, string> = {
  confirm: 'Financial Penalty Confirmed',
  waive: 'Penalty Waived',
  send: 'Payroll Obligation Created',
  reverse: 'Financial Penalty Reversed',
};

const rowKey = (row: FinancialReviewRow) => `${row.rider_id}:${row.business_date}`;

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'waived' | 'reversed';
type EligibilityFilter = 'all' | 'eligible' | 'not_eligible';

interface RiderGroup {
  riderId: string;
  riderName: string;
  riderCode: string;
  rows: FinancialReviewRow[];
  pendingCount: number;
  confirmedCount: number;
  waivedCount: number;
  reversedCount: number;
}

export function FinancialAbsencePanel(props: Props) {
  const { session } = useAuth();
  if (!session || (session.role !== 'admin' && session.role !== 'hr')) {
    return <StatePanel compact title="Financial review is available to Admin and HR." />;
  }
  return (
    <FinancialReview
      key={JSON.stringify([session.id, session.role, props.hubId, props.startDate, props.endDate, props.riderId])}
      {...props}
      role={session.role}
    />
  );
}

function FinancialReview({
  startDate,
  endDate,
  hubId,
  riderId,
  riderNames,
  riderCodes,
  role,
}: Props & { role: 'admin' | 'hr' }) {
  const online = useNetworkStatus();
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const contextVersion = useAttendanceContextVersion();

  const [rows, setRows] = useState<FinancialReviewRow[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Search & Filter Toolbar States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [eligibilityFilter, setEligibilityFilter] = useState<EligibilityFilter>('all');

  // Accordion Expand/Collapse States per Rider
  const [expandedRiders, setExpandedRiders] = useState<Set<string>>(() => new Set());
  const userManuallyToggled = useRef(false);

  // Action Dialog States
  const [selected, setSelected] = useState<{ kind: Action; key: string } | null>(null);
  const [supervisor, setSupervisor] = useState('');
  const [notes, setNotes] = useState('');
  const [evidence, setEvidence] = useState('');
  const [category, setCategory] = useState<WaiverCategory>('emergency');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [policyDenied, setPolicyDenied] = useState<Set<string>>(() => new Set());

  const alive = useRef(true);
  const sequence = useRef(0);
  const submitting = useRef(false);
  const attempt = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sequence.current++;
    };
  }, []);

  const load = useCallback(async () => {
    const request = ++sequence.current;
    if (!onlineRef.current) {
      setRows([]);
      setLoading(false);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const fresh = await loadFinancialAbsencePage({ startDate, endDate, hubId, riderId, page }, role);
      if (alive.current && request === sequence.current) {
        setRows(fresh);
      }
    } catch (error) {
      if (alive.current && request === sequence.current) {
        setLoadError(financialErrorMessage(error));
      }
    } finally {
      if (alive.current && request === sequence.current) {
        setLoading(false);
      }
    }
  }, [startDate, endDate, hubId, riderId, page, role, online]);

  useEffect(() => {
    void load();
  }, [load, contextVersion]);

  // Derived filtered rows
  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      const pending = Boolean(row.financial_eligibility_reason && row.requires_confirmation && !row.existing_consequence_id);
      const name = riderNames?.[row.rider_id] || row.financial?.rider_name || row.rider_id;
      const code = riderCodes?.[row.rider_id] || row.financial?.rider_code || row.rider_id;

      if (query) {
        const matchesName = name.toLowerCase().includes(query);
        const matchesCode = code.toLowerCase().includes(query);
        const matchesId = row.rider_id.toLowerCase().includes(query);
        const matchesDate = row.business_date.includes(query);
        if (!matchesName && !matchesCode && !matchesId && !matchesDate) return false;
      }

      if (statusFilter !== 'all') {
        if (statusFilter === 'pending' && !pending) return false;
        if (statusFilter === 'confirmed' && row.existing_consequence_status !== 'confirmed') return false;
        if (statusFilter === 'waived' && row.existing_consequence_status !== 'waived_emergency' && row.existing_consequence_status !== 'waived_excused') return false;
        if (statusFilter === 'reversed' && row.existing_consequence_status !== 'reversed') return false;
      }

      if (eligibilityFilter !== 'all') {
        if (eligibilityFilter === 'eligible' && !row.financial_eligibility_reason) return false;
        if (eligibilityFilter === 'not_eligible' && row.financial_eligibility_reason) return false;
      }

      return true;
    });
  }, [rows, searchQuery, statusFilter, eligibilityFilter, riderNames, riderCodes]);

  // Group filtered rows by rider
  const riderGroups = useMemo(() => {
    const map = new Map<string, RiderGroup>();

    for (const row of filteredRows) {
      const riderKey = row.rider_id;
      let group = map.get(riderKey);
      const name = riderNames?.[row.rider_id] || row.financial?.rider_name || row.rider_id;
      const code = riderCodes?.[row.rider_id] || row.financial?.rider_code || row.rider_id;
      if (!group) {
        group = {
          riderId: riderKey,
          riderName: name,
          riderCode: code,
          rows: [],
          pendingCount: 0,
          confirmedCount: 0,
          waivedCount: 0,
          reversedCount: 0,
        };
        map.set(riderKey, group);
      } else {
        if (group.riderName === group.riderId && name !== row.rider_id) group.riderName = name;
        if (group.riderCode === group.riderId && code !== row.rider_id) group.riderCode = code;
      }

      group.rows.push(row);
      const isPending = Boolean(row.financial_eligibility_reason && row.requires_confirmation && !row.existing_consequence_id);
      if (isPending) group.pendingCount++;
      if (row.existing_consequence_status === 'confirmed') group.confirmedCount++;
      if (row.existing_consequence_status === 'waived_emergency' || row.existing_consequence_status === 'waived_excused') group.waivedCount++;
      if (row.existing_consequence_status === 'reversed') group.reversedCount++;
    }

    return Array.from(map.values());
  }, [filteredRows, riderNames, riderCodes]);

  // Auto-expand riders on initial load or data change
  useEffect(() => {
    if (!userManuallyToggled.current && riderGroups.length > 0) {
      const defaultExpanded = new Set<string>();
      for (const group of riderGroups) {
        if (group.pendingCount > 0 || riderGroups.length <= 5) {
          defaultExpanded.add(group.riderId);
        }
      }
      setExpandedRiders(defaultExpanded);
    }
  }, [riderGroups]);

  const toggleRiderExpanded = (id: string) => {
    userManuallyToggled.current = true;
    setExpandedRiders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllExpanded = () => {
    userManuallyToggled.current = true;
    if (expandedRiders.size === riderGroups.length) {
      setExpandedRiders(new Set());
    } else {
      setExpandedRiders(new Set(riderGroups.map((g) => g.riderId)));
    }
  };

  const totalPendingInView = useMemo(
    () => rows.filter((r) => r.financial_eligibility_reason && r.requires_confirmation && !r.existing_consequence_id).length,
    [rows],
  );

  const disabled = !online || loading || saving || Boolean(loadError);
  const current = rows.find((row) => rowKey(row) === selected?.key);

  function actionable(row: FinancialReviewRow, kind: Action) {
    if (kind === 'confirm' || kind === 'waive') {
      return Boolean(
        row.financial_eligibility_reason &&
        row.requires_confirmation &&
        !row.existing_consequence_id &&
        row.policyApplicable &&
        !policyDenied.has(rowKey(row)),
      );
    }
    if (role !== 'admin' || row.existing_consequence_status !== 'confirmed' || !row.existing_consequence_id) {
      return false;
    }
    return kind === 'reverse' || Boolean(row.financial && row.financial.status === 'confirmed' && !row.financial.deduction_obligation_id);
  }

  function open(row: FinancialReviewRow, kind: Action) {
    if (disabled || !actionable(row, kind)) return;
    setSelected({ kind, key: rowKey(row) });
    setSupervisor('');
    setNotes('');
    setEvidence('');
    setCategory('emergency');
    setDialogError(null);
    attempt.current = null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || disabled || !selected || !current || !actionable(current, selected.kind)) return;
    const { kind } = selected;
    if ((kind === 'confirm' || kind === 'waive') && (!supervisor.trim() || !notes.trim())) {
      setDialogError('Supervisor name and decision notes are required.');
      return;
    }
    if (kind === 'reverse' && !notes.trim()) {
      setDialogError('A reversal reason is required.');
      return;
    }
    if (supervisor.trim().length > 120 || notes.trim().length > 500 || evidence.trim().length > 200) {
      setDialogError('One or more fields exceed the allowed length.');
      return;
    }
    submitting.current = true;
    setSaving(true);
    setDialogError(null);
    try {
      if (kind === 'confirm' || kind === 'waive') {
        const signature = JSON.stringify([selected.key, kind, supervisor.trim(), notes.trim(), evidence.trim(), kind === 'waive' ? category : null]);
        if (attempt.current?.signature !== signature) {
          attempt.current = { signature, key: createSyncOperationId() };
        }
        const input = {
          riderId: current.rider_id,
          businessDate: current.business_date,
          confirmationKey: attempt.current.key,
          supervisorName: supervisor.trim(),
          decisionNotes: notes.trim(),
          evidenceReference: evidence.trim(),
        };
        if (kind === 'confirm') await confirmAbsenceFinancialDecision(input);
        else await waiveAbsenceFinancialDecision({ ...input, category });
      } else if (kind === 'send') {
        await sendAbsenceToPayroll(current.existing_consequence_id!);
      } else {
        await reverseAbsenceFinancialDecision(current.existing_consequence_id!, notes.trim(), evidence.trim());
      }
      if (!alive.current) return;
      appToast.success(SUCCESS[kind]);
      setSelected(null);
      await load();
    } catch (error) {
      if (!alive.current) return;
      const message = financialErrorMessage(error);
      setDialogError(message);
      if (message === 'Financial Policy V2 is not active for this date.') {
        setPolicyDenied((previous) => new Set(previous).add(selected.key));
      }
      await load();
    } finally {
      submitting.current = false;
      if (alive.current) setSaving(false);
    }
  }

  const hasActiveFilters = searchQuery.trim() !== '' || statusFilter !== 'all' || eligibilityFilter !== 'all';
  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setEligibilityFilter('all');
  };

  return (
    <section className="space-y-4" aria-label="Absence financial review">
      {/* Top Header & Refresh */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-foreground">Financial review</h2>
            {totalPendingInView > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                {totalPendingInView} Pending Decision{totalPendingInView > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Attendance assessment, human decision, and Payroll processing are separate steps.
          </p>
        </div>
        <button
          type="button"
          className="ui-button-secondary inline-flex items-center gap-2"
          onClick={() => void load()}
          disabled={!online || loading || saving}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh financial review
        </button>
      </div>

      {/* Policy Notice Box */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="note">
        <strong>Eligibility preview.</strong> Preview does not record a financial decision. Confirm and Waive require an applicable official Policy V2; the server checks again when you submit.
      </div>

      {!online && (
        <p role="status" className="text-sm text-muted-foreground">
          Connect to the internet to record a financial decision.
        </p>
      )}

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <span>{loadError}</span>
          <button type="button" className="ui-button-secondary" onClick={() => void load()} disabled={loading}>
            Retry
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {!online ? (
        <StatePanel compact title="Financial review is unavailable offline" description="Connect to load current server records." />
      ) : loading && rows.length === 0 ? (
        <StatePanel compact loading title="Loading financial review" />
      ) : !rows.length && !loadError ? (
        <StatePanel compact title="No financial review rows" description="Try another date window or Hub." />
      ) : (
        <div className="space-y-4" aria-busy={loading}>
          {/* Sticky Search & Filter Toolbar */}
          <div className="sticky top-0 z-20 rounded-xl border border-border bg-card/95 p-3 shadow-xs backdrop-blur-md">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    type="search"
                    placeholder="Search by rider name, ID, or date..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="ui-control h-8 w-full pl-8 pr-7 text-xs"
                    aria-label="Filter records by rider name, ID, or date"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Clear search query"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Group Collapse/Expand Action */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleAllExpanded}
                    className="ui-button-secondary h-8 text-xs px-3 inline-flex items-center gap-1.5"
                    aria-label={expandedRiders.size === riderGroups.length ? 'Collapse all rider groups' : 'Expand all rider groups'}
                  >
                    <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{expandedRiders.size === riderGroups.length ? 'Collapse All' : 'Expand All'}</span>
                  </button>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="ui-button-secondary h-8 text-xs px-2.5 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                      title="Reset all filters"
                    >
                      <X className="h-3 w-3" /> Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Tabs / Pills */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border/60 pt-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">Status:</span>
                  <div className="inline-flex rounded-lg border border-border p-0.5 bg-secondary/30" role="group" aria-label="Filter by status">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'pending', label: 'Pending Action' },
                        { id: 'confirmed', label: 'Confirmed' },
                        { id: 'waived', label: 'Waived' },
                        { id: 'reversed', label: 'Reversed' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStatusFilter(tab.id)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          statusFilter === tab.id
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">Eligibility:</span>
                  <div className="inline-flex rounded-lg border border-border p-0.5 bg-secondary/30" role="group" aria-label="Filter by eligibility">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'eligible', label: 'Eligible Only' },
                        { id: 'not_eligible', label: 'Not Eligible' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setEligibilityFilter(tab.id)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          eligibilityFilter === tab.id
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Metrics Strip */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
              <span>
                Showing <strong className="font-semibold text-foreground">{riderGroups.length}</strong> rider{riderGroups.length === 1 ? '' : 's'} (
                <strong className="font-semibold text-foreground">{filteredRows.length}</strong> record{filteredRows.length === 1 ? '' : 's'})
              </span>
              {totalPendingInView > 0 && (
                <span className="text-amber-800 font-medium">
                  • {totalPendingInView} require human decision
                </span>
              )}
            </div>
          </div>

          {/* Empty Filter State */}
          {filteredRows.length === 0 ? (
            <div className="ui-card p-8 text-center text-xs text-muted-foreground">
              <p className="font-medium text-foreground">No records match your active filters.</p>
              <p className="mt-1">Try adjusting your search query, status, or eligibility filters.</p>
              <button type="button" onClick={resetFilters} className="ui-button-secondary mt-3 inline-flex items-center gap-1.5">
                Clear Filters
              </button>
            </div>
          ) : (
            /* Rider Groups Accordion */
            <div className="space-y-3">
              {riderGroups.map((group) => {
                const isExpanded = expandedRiders.has(group.riderId);
                return (
                  <section
                    key={group.riderId}
                    className="ui-card overflow-hidden border border-border shadow-xs"
                    aria-label={`Rider ${group.riderName}`}
                  >
                    {/* Rider Group Header */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleRiderExpanded(group.riderId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleRiderExpanded(group.riderId);
                        }
                      }}
                      className="flex cursor-pointer flex-wrap items-center justify-between gap-3 bg-secondary/40 px-4 py-3 transition-colors hover:bg-secondary/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-expanded={isExpanded}
                      aria-controls={`rider-content-${group.riderId}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-muted-foreground transition-transform duration-200">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          )}
                        </div>
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                          {group.riderName.slice(0, 2).toUpperCase() || <User className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-semibold text-foreground">
                              {group.riderName}
                            </h3>
                            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                              {group.riderCode}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Group Badges & Counters */}
                      <div className="flex flex-wrap items-center gap-2">
                        {group.pendingCount > 0 && (
                          <StatusBadge tone="warning">
                            {group.pendingCount} Pending Decision{group.pendingCount > 1 ? 's' : ''}
                          </StatusBadge>
                        )}
                        {group.confirmedCount > 0 && (
                          <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
                            {group.confirmedCount} Confirmed
                          </span>
                        )}
                        {group.waivedCount > 0 && (
                          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground ring-1 ring-inset ring-border">
                            {group.waivedCount} Waived
                          </span>
                        )}
                        <span className="rounded-md bg-secondary/80 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                          {group.rows.length} {group.rows.length === 1 ? 'absence' : 'absences'}
                        </span>
                      </div>
                    </div>

                    {/* Expandable Group Body */}
                    {isExpanded && (
                      <div
                        id={`rider-content-${group.riderId}`}
                        className="divide-y divide-border/60 border-t border-border/80"
                      >
                        {/* Desktop Table Header */}
                        <div className="hidden grid-cols-12 gap-3 bg-secondary/20 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
                          <div className="col-span-2">Business Date</div>
                          <div className="col-span-2">Attendance & Policy</div>
                          <div className="col-span-2">Notice Timing</div>
                          <div className="col-span-2">Eligibility</div>
                          <div className="col-span-2">Decision & Payroll</div>
                          <div className="col-span-2 text-right">Actions</div>
                        </div>

                        {/* Absence Records */}
                        {group.rows.map((row) => {
                          const pending = Boolean(
                            row.financial_eligibility_reason && row.requires_confirmation && !row.existing_consequence_id,
                          );
                          const name = riderNames?.[row.rider_id] || row.financial?.rider_name || row.rider_id;
                          const amount = row.financial ? Number(row.financial.applied_amount) : null;

                          // Dynamic Policy Version Label:
                          // Formats policy version and type dynamically from assessment policy metadata.
                          const policyTypeFormatted = row.assessmentPolicyType
                            ? row.assessmentPolicyType.charAt(0).toUpperCase() + row.assessmentPolicyType.slice(1)
                            : 'Official';
                          const dynamicPolicyLabel = row.assessmentPolicyVersionNumber
                            ? `V${row.assessmentPolicyVersionNumber} · ${policyTypeFormatted}`
                            : 'Attendance assessment';

                          return (
                            <article
                              key={rowKey(row)}
                              className="px-4 py-3 transition-colors hover:bg-panel-bg/50"
                              aria-label={`${name} · ${row.business_date}`}
                            >
                              {/* Responsive Grid for Desktop, Stacked for Mobile */}
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-center">
                                {/* Date Column */}
                                <div className="md:col-span-2 min-w-0">
                                  <div className="flex items-center gap-1.5 md:block">
                                    <span className="font-mono text-xs font-semibold text-foreground">
                                      {row.business_date}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground md:mt-0.5">
                                    {row.expected_to_work ? 'Scheduled' : 'Unscheduled'}
                                  </div>
                                </div>

                                {/* Attendance Assessment & Policy Column */}
                                <div className="md:col-span-2 min-w-0">
                                  <div className="text-xs font-medium text-foreground">
                                    {getAssessmentStatusLabel(row.assessment_status)}
                                  </div>
                                  <div className="truncate text-[11px] text-muted-foreground" title={getAssessmentReasonLabel(row.attendance_context_code)}>
                                    {getAssessmentReasonLabel(row.attendance_context_code)}
                                  </div>
                                  <div className="mt-1">
                                    <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                      {dynamicPolicyLabel}
                                    </span>
                                  </div>
                                </div>

                                {/* Notice Timing Column */}
                                <div className="md:col-span-2 min-w-0 text-xs">
                                  <span className="font-medium text-foreground">
                                    {row.notice_timeliness === 'no_notice'
                                      ? 'No notice'
                                      : row.notice_timeliness === 'timely'
                                        ? 'Timely'
                                        : 'Late'}
                                  </span>
                                  {row.notice_days !== null && (
                                    <span className="text-[11px] text-muted-foreground">
                                      {' · '}
                                      {row.notice_days} calendar days
                                    </span>
                                  )}
                                </div>

                                {/* Financial Eligibility Column */}
                                <div className="md:col-span-2 min-w-0">
                                  <div className="text-xs font-medium text-foreground">
                                    {row.financial_eligibility_reason
                                      ? FINANCIAL_REASON_LABELS[row.financial_eligibility_reason]
                                      : 'Not eligible for a financial decision'}
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {pending && <StatusBadge tone="warning">Pending Confirmation</StatusBadge>}
                                    {pending && !actionable(row, 'confirm') && (
                                      <StatusBadge tone="warning">Preview / Not active</StatusBadge>
                                    )}
                                  </div>
                                </div>

                                {/* Human Decision & Payroll Status Column */}
                                <div className="md:col-span-2 min-w-0 text-xs space-y-1">
                                  <div className="font-medium text-foreground">
                                    {row.existing_consequence_status
                                      ? FINANCIAL_STATUS_LABELS[row.existing_consequence_status]
                                      : 'No financial decision'}
                                  </div>
                                  {amount !== null && Number.isFinite(amount) && (
                                    <div className="text-[11px] text-foreground">
                                      Recorded amount:{' '}
                                      <span className="font-mono font-semibold">
                                        {formatFinancialAmount(amount, row.financial!.currency)}
                                      </span>
                                    </div>
                                  )}
                                  <div className="text-[11px] text-muted-foreground">
                                    {row.financial?.deduction_obligation_id ? (
                                      <span className="font-medium text-emerald-700">Payroll Obligation Created</span>
                                    ) : row.existing_consequence_id && !row.financial ? (
                                      'Payroll details are available to Admin'
                                    ) : (
                                      'No Payroll obligation recorded'
                                    )}
                                  </div>
                                  {row.financial?.has_compensation && (
                                    <div className="text-[11px] font-medium text-blue-700">
                                      {COMPENSATION_RECORDED_LABEL}
                                    </div>
                                  )}
                                </div>

                                {/* Actions Column */}
                                <div className="md:col-span-2 min-w-0 md:text-right">
                                  <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                                    {pending && (
                                      <>
                                        <button
                                          type="button"
                                          className="ui-button-primary text-xs py-1 px-2.5"
                                          disabled={disabled || !actionable(row, 'confirm')}
                                          onClick={() => open(row, 'confirm')}
                                        >
                                          Confirm
                                        </button>
                                        <button
                                          type="button"
                                          className="ui-button-secondary text-xs py-1 px-2.5"
                                          disabled={disabled || !actionable(row, 'waive')}
                                          onClick={() => open(row, 'waive')}
                                        >
                                          Waive
                                        </button>
                                      </>
                                    )}
                                    {actionable(row, 'send') && (
                                      <button
                                        type="button"
                                        className="ui-button-secondary text-xs py-1 px-2.5"
                                        disabled={disabled}
                                        onClick={() => open(row, 'send')}
                                      >
                                        Send to Payroll
                                      </button>
                                    )}
                                    {actionable(row, 'reverse') && (
                                      <button
                                        type="button"
                                        className="ui-button-danger text-xs py-1 px-2.5"
                                        disabled={disabled}
                                        onClick={() => open(row, 'reverse')}
                                      >
                                        Reverse Decision
                                      </button>
                                    )}
                                  </div>
                                  {pending && !actionable(row, 'confirm') && (
                                    <p className="mt-1 text-[11px] text-muted-foreground md:text-right">
                                      Financial Policy V2 is not active or could not be verified for this date.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pagination Controls */}
      <div className="flex items-center justify-between gap-3 text-xs border-t border-border pt-3">
        <button
          type="button"
          className="ui-button-secondary"
          disabled={disabled || page === 0}
          onClick={() => {
            setRows([]);
            setPage((p) => p - 1);
          }}
        >
          Previous
        </button>
        <span className="font-mono text-muted-foreground">Page {page + 1}</span>
        <button
          type="button"
          className="ui-button-secondary"
          disabled={disabled || rows.length < FINANCIAL_PAGE_SIZE || (page + 1) * FINANCIAL_PAGE_SIZE > 100000}
          onClick={() => {
            setRows([]);
            setPage((p) => p + 1);
          }}
        >
          Next
        </button>
      </div>

      {/* Decision / Action Modal */}
      <Modal
        open={Boolean(selected)}
        onClose={() => !submitting.current && setSelected(null)}
        title={selected ? TITLES[selected.kind] : undefined}
        subtitle={
          current
            ? `${riderNames?.[current.rider_id] || current.financial?.rider_name || current.rider_id} · ${current.business_date}`
            : undefined
        }
        dismissible={!saving}
      >
        {selected && (
          <form className="space-y-4" onSubmit={(event) => void submit(event)} noValidate>
            <p className="text-sm text-muted-foreground">
              {selected.kind === 'confirm'
                ? 'This records a financial consequence using the policy amount resolved by the server. It does not deduct money from Payroll.'
                : selected.kind === 'waive'
                  ? 'This records an authorized waiver with zero applied amount. The original policy amount is retained by the server.'
                  : selected.kind === 'send'
                    ? 'Create an unallocated Payroll obligation for this confirmed decision. Allocation and payment are separate Payroll steps.'
                    : 'Confirm reversal of this decision. The server checks Payroll state: it may void unused debt, remove editable allocations, block locked Payroll, or record compensation for a fully paid penalty.'}
            </p>
            <fieldset disabled={saving} className="space-y-4">
              {(selected.kind === 'confirm' || selected.kind === 'waive') && (
                <div>
                  <label htmlFor="financial-supervisor" className="mb-1 block text-xs font-semibold">
                    Supervisor / Attendance Monitor
                  </label>
                  <input
                    id="financial-supervisor"
                    className="ui-control w-full"
                    value={supervisor}
                    onChange={(e) => setSupervisor(e.target.value)}
                    maxLength={120}
                    required
                  />
                </div>
              )}
              {selected.kind === 'waive' && (
                <div>
                  <label htmlFor="financial-category" className="mb-1 block text-xs font-semibold">
                    Waiver category
                  </label>
                  <select
                    id="financial-category"
                    className="ui-control w-full"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as WaiverCategory)}
                  >
                    <option value="emergency">Emergency</option>
                    <option value="excused">Excused / Valid Justification</option>
                  </select>
                </div>
              )}
              {selected.kind !== 'send' && (
                <>
                  <div>
                    <label htmlFor="financial-notes" className="mb-1 block text-xs font-semibold">
                      {selected.kind === 'reverse' ? 'Reversal reason' : 'Decision notes'}
                    </label>
                    <textarea
                      id="financial-notes"
                      className="ui-control min-h-24 w-full py-2"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={500}
                      required
                      aria-describedby={dialogError ? 'financial-dialog-error' : undefined}
                    />
                  </div>
                  <div>
                    <label htmlFor="financial-evidence" className="mb-1 block text-xs font-semibold">
                      Evidence reference (optional)
                    </label>
                    <input
                      id="financial-evidence"
                      className="ui-control w-full"
                      value={evidence}
                      onChange={(e) => setEvidence(e.target.value)}
                      maxLength={200}
                    />
                  </div>
                </>
              )}
            </fieldset>
            {dialogError && (
              <p id="financial-dialog-error" role="alert" className="text-sm text-rose-700">
                {dialogError}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="ui-button-secondary"
                disabled={saving}
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={selected.kind === 'reverse' ? 'ui-button-danger' : 'ui-button-primary'}
                disabled={disabled || !current || !actionable(current, selected.kind)}
              >
                {saving
                  ? 'Saving…'
                  : selected.kind === 'confirm'
                    ? 'Record Confirmation'
                    : selected.kind === 'waive'
                      ? 'Record Waiver'
                      : selected.kind === 'send'
                        ? 'Create Payroll Obligation'
                        : 'Confirm Reversal'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
