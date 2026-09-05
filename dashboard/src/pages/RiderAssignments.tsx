import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRightLeft,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleAlert,
  CircleStop,
  History,
  Info,
  MapPinned,
  MoreVertical,
  Search,
  UserRoundCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { appToast } from '../hooks/useToast';
import { StatePanel, StatusBadge, SummaryCard, type SemanticTone } from '../components/common/DashboardPrimitives';
import { RightDrawer } from '../components/common/RightDrawer';
import { RiderAssignmentsSkeleton } from '../components/assignments/RiderAssignmentsSkeleton';
import { useHub } from '../context/HubContext';
import { getZonesForHubs } from '../services/geofencing/geofenceService';
import type { Zone } from '../services/types';
import {
  deployRiderTemporarily,
  endRiderDeploymentEarly,
  extendRiderDeployment,
  getRiderAssignmentWorkspace,
  transferRiderPermanently,
  type RiderAssignmentHistoryItem,
  type RiderAssignmentRow,
} from '../services/riders/riderAssignmentService';
import { calculateAssignmentSummary, filterAssignmentRows, validateAssignmentTarget } from './riderAssignmentUtils';
import { calculateUserActionMenuPosition, type ActionMenuPosition } from '../lib/userActionMenuPosition';

type DrawerMode = 'transfer' | 'deploy' | 'extend' | 'end' | 'history' | null;

const MANILA_TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const DATE_FORMAT = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' });

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}

function assignmentLabel(type: RiderAssignmentRow['assignmentType']) {
  if (type === 'temporary_deployment') return 'Temporary Deployment';
  if (type === 'permanent_transfer') return 'Permanent Transfer';
  if (type === 'unassigned') return 'Unassigned';
  return 'Home Assignment';
}

function statusTone(status: RiderAssignmentRow['status']): SemanticTone {
  if (status === 'active') return 'success';
  if (status === 'unassigned') return 'warning';
  if (status === 'ended_early') return 'danger';
  return 'neutral';
}

export function RiderAssignments() {
  const { hubs, selectedHubId, workspaceKey } = useHub();
  const activeHubs = useMemo(() => hubs.filter((hub) => hub.active), [hubs]);
  const [rows, setRows] = useState<RiderAssignmentRow[]>([]);
  const [history, setHistory] = useState<RiderAssignmentHistoryItem[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedRider, setSelectedRider] = useState<RiderAssignmentRow | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [targetHubId, setTargetHubId] = useState('');
  const [targetZoneId, setTargetZoneId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(MANILA_TODAY);
  const [endDate, setEndDate] = useState(MANILA_TODAY);
  const [reason, setReason] = useState('');
  const [filters, setFilters] = useState({ hubId: '', zoneId: '', assignmentType: '', status: '', search: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [workspace, zoneRows] = await Promise.all([
        getRiderAssignmentWorkspace({ hubId: selectedHubId }),
        getZonesForHubs(activeHubs.map((hub) => hub.id)),
      ]);
      setRows(workspace.riders);
      setHistory(workspace.history);
      setZones(zoneRows.filter((zone) => zone.status === 'active'));

      const focusedRiderId = window.sessionStorage.getItem('mkb.assignment.focus');
      if (focusedRiderId) {
        window.sessionStorage.removeItem('mkb.assignment.focus');
        const focused = workspace.riders.find((rider) => rider.riderId === focusedRiderId);
        if (focused) {
          setFilters((current) => ({ ...current, search: focused.riderCode || focused.riderName }));
          setSelectedRider(focused);
          setDrawerMode('history');
        }
      }
    } catch (error) {
      appToast.error(error instanceof Error ? error.message : 'Failed to load Rider Assignments.');
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [activeHubs, selectedHubId]);

  useEffect(() => { void load(); }, [load, workspaceKey]);

  const visibleRows = useMemo(() => filterAssignmentRows(rows, filters), [filters, rows]);
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const desktopRows = useMemo(
    () => visibleRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [pageSize, safePage, visibleRows],
  );
  const startItem = visibleRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, visibleRows.length);
  const summary = useMemo(() => calculateAssignmentSummary(rows, MANILA_TODAY), [rows]);
  const filterZones = useMemo(
    () => zones.filter((zone) => !filters.hubId || zone.hubId === filters.hubId),
    [filters.hubId, zones],
  );
  const targetZones = useMemo(() => zones.filter((zone) => zone.hubId === targetHubId), [targetHubId, zones]);
  const riderHistory = useMemo(
    () => history.filter((item) => item.riderId === selectedRider?.riderId),
    [history, selectedRider],
  );

  useEffect(() => { setPage(1); }, [filters, pageSize, workspaceKey]);

  function openDrawer(mode: Exclude<DrawerMode, null>, rider: RiderAssignmentRow) {
    setSelectedRider(rider);
    setDrawerMode(mode);
    const preferredHub = mode === 'extend' || mode === 'end'
      ? rider.operationalHubId
      : selectedHubId;
    setTargetHubId(preferredHub && activeHubs.some((hub) => hub.id === preferredHub) ? preferredHub : '');
    setTargetZoneId('');
    setEffectiveDate(MANILA_TODAY);
    setEndDate(mode === 'extend' ? rider.endDate ?? MANILA_TODAY : MANILA_TODAY);
    setReason('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedRider || !drawerMode || drawerMode === 'history') return;
    if ((drawerMode === 'transfer' || drawerMode === 'deploy')) {
      const targetError = validateAssignmentTarget(targetHubId, targetZoneId, zones);
      if (targetError) { appToast.error(targetError); return; }
    }
    if (reason.trim().length < 3) { appToast.error('A reason of at least 3 characters is required.'); return; }

    setSaving(true);
    try {
      if (drawerMode === 'transfer') {
        await transferRiderPermanently({
          riderId: selectedRider.riderId, targetHubId, targetZoneId, effectiveDate, reason,
        });
        appToast.success('Permanent Rider assignment updated.');
      } else if (drawerMode === 'deploy') {
        if (endDate < effectiveDate) throw new Error('End Date must be on or after Start Date.');
        await deployRiderTemporarily({
          riderId: selectedRider.riderId, targetHubId, targetZoneId, startDate: effectiveDate, endDate, reason,
        });
        appToast.success('Temporary deployment started.');
      } else if (drawerMode === 'extend') {
        if (!selectedRider.assignmentId) throw new Error('Active deployment was not found.');
        await extendRiderDeployment(selectedRider.assignmentId, endDate, reason);
        appToast.success('Temporary deployment extended.');
      } else {
        if (!selectedRider.assignmentId) throw new Error('Active deployment was not found.');
        await endRiderDeploymentEarly(selectedRider.assignmentId, reason);
        appToast.success('Temporary deployment ended. Rider returned to the Home assignment.');
      }
      setDrawerMode(null);
      await load();
    } catch (error) {
      appToast.error(error instanceof Error ? error.message : 'The assignment could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const isActiveDeployment = selectedRider?.assignmentType === 'temporary_deployment' && selectedRider.status === 'active';
  const drawerTitle = drawerMode === 'transfer' ? 'Transfer Permanently'
    : drawerMode === 'deploy' ? 'Deploy Temporarily'
      : drawerMode === 'extend' ? 'Extend Deployment'
        : drawerMode === 'end' ? 'End Deployment Early' : 'Assignment History';

  if (loading && !hasLoadedRef.current) return <RiderAssignmentsSkeleton />;

  return (
    <div className="dashboard-page flex-1 space-y-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={UserRoundCheck} label="Active Assignments" value={summary.activeAssignments} helper="Current operational assignments" tone="success" />
        <SummaryCard icon={ArrowRightLeft} label="Temporary Deployments" value={summary.temporaryDeployments} helper="Away from Home assignment" tone="info" />
        <SummaryCard icon={CalendarClock} label="Expiring Soon" value={summary.expiringSoon} helper="Within the next 7 days" tone="warning" />
        <SummaryCard icon={CircleAlert} label="Unassigned Riders" value={summary.unassignedRiders} helper="Missing Home Hub or Zone" tone="danger" />
      </section>

      <section className="rounded-xl border border-border bg-white shadow-sm">
        <div role="note" className="flex items-center gap-2 border-b border-border bg-panel-bg/40 px-4 py-2 text-xs text-muted-foreground">
          <Info aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span>Assignment changes are blocked while attendance is open.</span>
        </div>
        <div className="grid gap-2 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-[minmax(13rem,1.3fr)_repeat(4,minmax(9rem,1fr))]">
          <label className="relative min-w-0">
            <span className="sr-only">Search riders</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Search Rider or MKB ID" className="ui-control pl-9" />
          </label>
          <select aria-label="Filter by Hub" value={filters.hubId} onChange={(e) => setFilters((f) => ({ ...f, hubId: e.target.value, zoneId: '' }))} className="ui-control">
            <option value="">All authorized hubs</option>{activeHubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}
          </select>
          <select aria-label="Filter by Zone" value={filters.zoneId} onChange={(e) => setFilters((f) => ({ ...f, zoneId: e.target.value }))} className="ui-control">
            <option value="">All zones</option>{filterZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
          </select>
          <select aria-label="Filter by Assignment Type" value={filters.assignmentType} onChange={(e) => setFilters((f) => ({ ...f, assignmentType: e.target.value }))} className="ui-control">
            <option value="">All assignment types</option><option value="home_assignment">Home Assignment</option><option value="permanent_transfer">Permanent Transfer</option><option value="temporary_deployment">Temporary Deployment</option><option value="unassigned">Unassigned</option>
          </select>
          <select aria-label="Filter by Status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="ui-control">
            <option value="">All statuses</option><option value="active">Active</option><option value="completed">Completed</option><option value="ended_early">Ended Early</option><option value="expired">Expired</option><option value="unassigned">Unassigned</option>
          </select>
        </div>

        <div className="table-scroll-region no-scrollbar hidden overflow-x-auto lg:block" role="region" aria-label="Rider assignment records" tabIndex={0}>
          <table className="data-table-extra-wide min-w-[86rem] text-sm">
            <thead className="bg-panel-bg text-[11px] uppercase tracking-wide text-muted-foreground"><tr>
              <th className="min-w-48 px-4 py-3 font-semibold">Rider</th>
              <th className="min-w-40 whitespace-nowrap px-4 py-3 font-semibold">Home Hub</th>
              <th className="min-w-44 whitespace-nowrap px-4 py-3 font-semibold">Operational Hub</th>
              <th className="min-w-56 px-4 py-3 font-semibold">Current Zone</th>
              <th className="min-w-44 whitespace-nowrap px-4 py-3 font-semibold">Assignment Type</th>
              <th className="min-w-32 whitespace-nowrap px-4 py-3 font-semibold">Start Date</th>
              <th className="min-w-32 whitespace-nowrap px-4 py-3 font-semibold">End Date</th>
              <th className="min-w-28 whitespace-nowrap px-4 py-3 font-semibold">Status</th>
              <th className="sticky right-0 z-20 w-16 min-w-16 border-l border-border bg-panel-bg px-2 py-3 text-center font-semibold shadow-[-10px_0_14px_-14px_rgba(15,23,42,0.5)]">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {desktopRows.map((rider) => <tr key={rider.riderId} className="group align-top hover:bg-panel-bg/50">
                <td className="min-w-48 px-4 py-3"><p className="font-medium text-foreground">{rider.riderName}</p><p className="text-xs text-muted-foreground">{rider.riderCode}</p></td>
                <td className="min-w-40 whitespace-nowrap px-4 py-3">{rider.homeHubName ?? 'Restricted / Unassigned'}</td>
                <td className="min-w-44 whitespace-nowrap px-4 py-3">{rider.operationalHubName ?? 'Restricted / Unassigned'}</td>
                <td className="min-w-56 px-4 py-3">{rider.operationalZoneName ?? 'Restricted / Unassigned'}</td>
                <td className="min-w-44 whitespace-nowrap px-4 py-3">{assignmentLabel(rider.assignmentType)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(rider.startDate)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(rider.endDate)}</td>
                <td className="min-w-28 whitespace-nowrap px-4 py-3"><StatusBadge tone={statusTone(rider.status)} size="md" className="capitalize">{rider.status.replace('_', ' ')}</StatusBadge></td>
                <td className="sticky right-0 z-10 w-16 min-w-16 border-l border-border bg-white px-2 py-2.5 text-center shadow-[-10px_0_14px_-14px_rgba(15,23,42,0.5)] transition-colors group-hover:bg-panel-bg"><ActionMenu rider={rider} openDrawer={openDrawer} desktop /></td>
              </tr>)}
            </tbody>
          </table>
        </div>

        {visibleRows.length > 0 && (
          <div className="hidden items-center justify-between gap-3 border-t border-border bg-panel-bg px-4 py-3 text-xs text-muted-foreground lg:flex">
            <div className="flex flex-wrap items-center gap-4">
              <span>
                Showing <strong className="font-semibold text-foreground">{startItem}</strong> to{' '}
                <strong className="font-semibold text-foreground">{endItem}</strong> of{' '}
                <strong className="font-semibold text-foreground">{visibleRows.length}</strong> riders
              </span>
              <label className="flex items-center gap-1.5 border-l border-border pl-4">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="rounded border border-border bg-white px-2 py-1 text-xs font-semibold text-foreground shadow-sm outline-none focus:border-primary"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-1 font-semibold">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(1)} className="rounded border border-border bg-white p-1.5 text-foreground transition hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="First page" title="First page"><ChevronsLeft className="h-4 w-4" /></button>
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="rounded border border-border bg-white p-1.5 text-foreground transition hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous page" title="Previous page"><ChevronLeft className="h-4 w-4" /></button>
              <span className="rounded border border-border bg-white px-3 py-1 font-mono text-xs text-foreground">Page <strong>{safePage}</strong> of <strong>{totalPages}</strong></span>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="rounded border border-border bg-white p-1.5 text-foreground transition hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next page" title="Next page"><ChevronRight className="h-4 w-4" /></button>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)} className="rounded border border-border bg-white p-1.5 text-foreground transition hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Last page" title="Last page"><ChevronsRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}

        <div className="divide-y divide-border lg:hidden">
          {visibleRows.map((rider) => <article key={rider.riderId} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{rider.riderName}</p><p className="text-xs text-muted-foreground">{rider.riderCode}</p></div><StatusBadge tone={statusTone(rider.status)} size="md" className="capitalize">{rider.status.replace('_', ' ')}</StatusBadge></div>
            <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Home Hub</dt><dd className="mt-0.5 font-medium">{rider.homeHubName ?? 'Restricted / Unassigned'}</dd></div><div><dt className="text-muted-foreground">Operational Hub</dt><dd className="mt-0.5 font-medium">{rider.operationalHubName ?? 'Restricted / Unassigned'}</dd></div><div><dt className="text-muted-foreground">Current Zone</dt><dd className="mt-0.5 font-medium">{rider.operationalZoneName ?? 'Restricted / Unassigned'}</dd></div><div><dt className="text-muted-foreground">Assignment</dt><dd className="mt-0.5 font-medium">{assignmentLabel(rider.assignmentType)}</dd></div></dl>
            <ActionMenu rider={rider} openDrawer={openDrawer} />
          </article>)}
        </div>

        {!loading && visibleRows.length === 0 && <StatePanel icon={Search} title="No Riders match these filters" description="Adjust the Hub, Zone, assignment type, status, or search query." compact />}
        {loading && <StatePanel title="Loading Rider assignments…" loading compact />}
      </section>

      <RightDrawer open={drawerMode !== null} onClose={() => !saving && setDrawerMode(null)} ariaLabel={drawerTitle} widthClassName="max-w-lg" dismissible={!saving}>
        <header className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold text-foreground">{drawerTitle}</h2><p className="text-xs text-muted-foreground">{selectedRider?.riderName} · {selectedRider?.riderCode}</p></div><button type="button" onClick={() => setDrawerMode(null)} disabled={saving} aria-label="Close drawer" className="rounded-lg p-2 hover:bg-panel-bg"><X className="h-5 w-5" /></button></header>
        {drawerMode === 'history' ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
            {riderHistory.map((item) => <article key={item.id} className="rounded-xl border border-border p-4"><div className="flex justify-between gap-3"><p className="font-semibold">{item.assignmentType === 'temporary_deployment' ? 'Temporary Deployment' : 'Permanent Transfer'}</p><span className="text-xs capitalize text-muted-foreground">{item.status.replace('_', ' ')}</span></div><p className="mt-2 text-sm">{item.fromHubName ?? 'Unassigned'} / {item.fromZoneName ?? 'Unassigned'} <ChevronRight className="inline h-4 w-4" /> {item.targetHubName} / {item.targetZoneName}</p><p className="mt-2 text-xs text-muted-foreground">{formatDate(item.startDate)}{item.endDate ? ` – ${formatDate(item.endDate)}` : ''} · {item.reason}</p><p className="mt-1 text-xs text-muted-foreground">Recorded by {item.createdByName ?? 'System'}</p>{item.endReason && <p className="mt-2 rounded-lg bg-orange-50 p-2 text-xs text-orange-800">Ended early: {item.endReason}</p>}</article>)}
            {riderHistory.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No transfer or deployment history.</p>}
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              {(drawerMode === 'transfer' || drawerMode === 'deploy') && <>
                <div><label className="text-sm font-medium">Target Hub <span className="text-red-500">*</span></label><select required value={targetHubId} onChange={(e) => { setTargetHubId(e.target.value); setTargetZoneId(''); }} className="ui-control mt-1.5 min-h-11"><option value="">Select an active authorized hub</option>{activeHubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}</select></div>
                <div><label className="text-sm font-medium">Target Zone <span className="text-red-500">*</span></label><select required disabled={!targetHubId} value={targetZoneId} onChange={(e) => setTargetZoneId(e.target.value)} className="ui-control mt-1.5 min-h-11"><option value="">Select a Zone under the Target Hub</option>{targetZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></div>
              </>}
              {(drawerMode === 'transfer' || drawerMode === 'deploy') && <div><label className="text-sm font-medium">{drawerMode === 'transfer' ? 'Effective Date' : 'Start Date'} <span className="text-red-500">*</span></label><input type="date" required readOnly value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="ui-control mt-1.5 min-h-11 bg-panel-bg" /><p className="mt-1 text-xs text-muted-foreground">Controlled assignment changes take effect today.</p></div>}
              {(drawerMode === 'deploy' || drawerMode === 'extend') && <div><label className="text-sm font-medium">{drawerMode === 'extend' ? 'New End Date' : 'End Date'} <span className="text-red-500">*</span></label><input type="date" required min={drawerMode === 'extend' ? selectedRider?.endDate ?? MANILA_TODAY : effectiveDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="ui-control mt-1.5 min-h-11" /></div>}
              {drawerMode === 'end' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ending now returns this Rider to {selectedRider?.homeHubName ?? 'their Home Hub'} / {selectedRider?.homeZoneName ?? 'Home Zone'}.</div>}
              <div><label className="text-sm font-medium">Reason <span className="text-red-500">*</span></label><textarea required minLength={3} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className="ui-textarea mt-1.5" placeholder="Record the operational reason for this assignment change." /></div>
              {isActiveDeployment && drawerMode === 'transfer' && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">End the active temporary deployment before a permanent transfer.</p>}
            </div>
            <footer className="flex justify-end gap-2 border-t border-border p-4"><button type="button" onClick={() => setDrawerMode(null)} disabled={saving} className="ui-button-secondary min-h-11">Cancel</button><button disabled={saving || (drawerMode === 'transfer' && isActiveDeployment)} className="ui-button-primary min-h-11">{saving ? 'Saving…' : drawerTitle}</button></footer>
          </form>
        )}
      </RightDrawer>
    </div>
  );
}

interface AssignmentAction {
  mode: Exclude<DrawerMode, null>;
  label: string;
  mobileLabel?: string;
  icon: LucideIcon;
  disabled?: boolean;
  disabledReason?: string;
  tone?: 'default' | 'warning';
}

function getAssignmentActions(rider: RiderAssignmentRow): AssignmentAction[] {
  const activeDeployment = rider.assignmentType === 'temporary_deployment' && rider.status === 'active';
  if (activeDeployment) {
    return [
      { mode: 'extend', label: 'Extend Deployment', icon: CalendarClock },
      { mode: 'end', label: 'End Deployment Early', mobileLabel: 'End Early', icon: CircleStop, tone: 'warning' },
      { mode: 'history', label: 'View Assignment History', icon: History },
    ];
  }

  const missingHomeAssignment = !rider.homeHubId || !rider.homeZoneId;
  return [
    { mode: 'transfer', label: 'Transfer Permanently', icon: ArrowRightLeft },
    {
      mode: 'deploy',
      label: 'Deploy Temporarily',
      icon: MapPinned,
      disabled: missingHomeAssignment,
      disabledReason: missingHomeAssignment ? 'Assign a Home Hub and Home Zone first.' : undefined,
    },
    { mode: 'history', label: 'View Assignment History', icon: History },
  ];
}

function AssignmentActionMenuPortal({
  anchor,
  rider,
  actions,
  onSelect,
  onClose,
}: {
  anchor: HTMLButtonElement;
  rider: RiderAssignmentRow;
  actions: AssignmentAction[];
  onSelect: (mode: Exclude<DrawerMode, null>) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [position, setPosition] = useState<ActionMenuPosition>(() => calculateUserActionMenuPosition(
    anchor.getBoundingClientRect(),
    { width: 224, height: 168 },
    { width: window.innerWidth, height: window.innerHeight },
  ));

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useLayoutEffect(() => {
    function updatePosition() {
      const menuRect = menuRef.current?.getBoundingClientRect();
      setPosition(calculateUserActionMenuPosition(
        anchor.getBoundingClientRect(),
        { width: menuRect?.width || 224, height: menuRect?.height || 168 },
        { width: window.innerWidth, height: window.innerHeight },
      ));
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchor]);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    });

    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !anchor.contains(target)) onCloseRef.current();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        anchor.focus();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []);
      if (items.length === 0) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1 + items.length) % items.length
            : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex].focus();
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchor]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Assignment actions for ${rider.riderName}`}
      data-placement={position.placement}
      style={{ position: 'fixed', top: position.top, left: position.left, width: 224, zIndex: 2000 }}
      className="overflow-hidden rounded-lg border border-border bg-white py-1 shadow-xl"
    >
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.mode}
            type="button"
            role="menuitem"
            disabled={action.disabled}
            title={action.disabledReason ?? action.label}
            onClick={() => onSelect(action.mode)}
            className={`flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-panel-bg disabled:text-muted-foreground ${
              action.tone === 'warning' ? 'text-orange-700 hover:bg-orange-50' : 'text-foreground hover:bg-accent'
            }`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${action.tone === 'warning' ? 'text-orange-600' : 'text-primary'}`} aria-hidden="true" />
            <span>
              <span className="block font-medium">{action.label}</span>
              {action.disabledReason && <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">{action.disabledReason}</span>}
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

function ActionMenu({ rider, openDrawer, desktop = false }: {
  rider: RiderAssignmentRow;
  openDrawer: (mode: Exclude<DrawerMode, null>, rider: RiderAssignmentRow) => void;
  desktop?: boolean;
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const actions = getAssignmentActions(rider);

  if (!desktop) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {actions.map((action) => {
          const isHistory = action.mode === 'history';
          if (isHistory) {
            return (
              <button key={action.mode} type="button" onClick={() => openDrawer(action.mode, rider)} aria-label={`View assignment history for ${rider.riderName}`} className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-panel-bg"><History className="h-4 w-4" /></button>
            );
          }
          return (
            <button
              key={action.mode}
              type="button"
              onClick={() => openDrawer(action.mode, rider)}
              disabled={action.disabled}
              title={action.disabledReason}
              className={`whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${action.tone === 'warning' ? 'text-orange-700 hover:bg-orange-50' : 'hover:bg-panel-bg'}`}
            >
              {action.mobileLabel ?? action.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex justify-center" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label={`Actions for ${rider.riderName}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(menuAnchor)}
        title="Actions"
        onClick={(event) => setMenuAnchor(menuAnchor ? null : event.currentTarget)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {menuAnchor && (
        <AssignmentActionMenuPortal
          anchor={menuAnchor}
          rider={rider}
          actions={actions}
          onClose={() => setMenuAnchor(null)}
          onSelect={(mode) => {
            setMenuAnchor(null);
            openDrawer(mode, rider);
          }}
        />
      )}
    </div>
  );
}
