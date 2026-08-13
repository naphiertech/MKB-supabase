import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRightLeft,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  History,
  Info,
  Search,
  UserRoundCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { RightDrawer } from '../components/common/RightDrawer';
import { useHub } from '../context/HubContext';
import { getZonesForHubs } from '../services/geofenceService';
import type { Zone } from '../services/types';
import {
  deployRiderTemporarily,
  endRiderDeploymentEarly,
  extendRiderDeployment,
  getRiderAssignmentWorkspace,
  transferRiderPermanently,
  type RiderAssignmentHistoryItem,
  type RiderAssignmentRow,
} from '../services/riderAssignmentService';
import { calculateAssignmentSummary, filterAssignmentRows, validateAssignmentTarget } from './riderAssignmentUtils';

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

function statusStyle(status: RiderAssignmentRow['status']) {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700';
  if (status === 'unassigned') return 'bg-amber-50 text-amber-700';
  if (status === 'ended_early') return 'bg-orange-50 text-orange-700';
  return 'bg-slate-100 text-slate-600';
}

function Metric({ icon: Icon, label, value, note, tone }: {
  icon: LucideIcon; label: string; value: number; note: string; tone: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold leading-tight text-foreground">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{note}</p>
        </div>
      </div>
    </article>
  );
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
      toast.error(error instanceof Error ? error.message : 'Failed to load Rider Assignments.');
    } finally {
      setLoading(false);
    }
  }, [activeHubs, selectedHubId]);

  useEffect(() => { void load(); }, [load, workspaceKey]);

  const visibleRows = useMemo(() => filterAssignmentRows(rows, filters), [filters, rows]);
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
      if (targetError) { toast.error(targetError); return; }
    }
    if (reason.trim().length < 3) { toast.error('A reason of at least 3 characters is required.'); return; }

    setSaving(true);
    try {
      if (drawerMode === 'transfer') {
        await transferRiderPermanently({
          riderId: selectedRider.riderId, targetHubId, targetZoneId, effectiveDate, reason,
        });
        toast.success('Permanent Rider assignment updated.');
      } else if (drawerMode === 'deploy') {
        if (endDate < effectiveDate) throw new Error('End Date must be on or after Start Date.');
        await deployRiderTemporarily({
          riderId: selectedRider.riderId, targetHubId, targetZoneId, startDate: effectiveDate, endDate, reason,
        });
        toast.success('Temporary deployment started.');
      } else if (drawerMode === 'extend') {
        if (!selectedRider.assignmentId) throw new Error('Active deployment was not found.');
        await extendRiderDeployment(selectedRider.assignmentId, endDate, reason);
        toast.success('Temporary deployment extended.');
      } else {
        if (!selectedRider.assignmentId) throw new Error('Active deployment was not found.');
        await endRiderDeploymentEarly(selectedRider.assignmentId, reason);
        toast.success('Temporary deployment ended. Rider returned to the Home assignment.');
      }
      setDrawerMode(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The assignment could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const isActiveDeployment = selectedRider?.assignmentType === 'temporary_deployment' && selectedRider.status === 'active';
  const drawerTitle = drawerMode === 'transfer' ? 'Transfer Permanently'
    : drawerMode === 'deploy' ? 'Deploy Temporarily'
      : drawerMode === 'extend' ? 'Extend Deployment'
        : drawerMode === 'end' ? 'End Deployment Early' : 'Assignment History';

  return (
    <div className="min-w-0 flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={UserRoundCheck} label="Active Assignments" value={summary.activeAssignments} note="Current operational assignments" tone="bg-emerald-50 text-emerald-700" />
        <Metric icon={ArrowRightLeft} label="Temporary Deployments" value={summary.temporaryDeployments} note="Away from Home assignment" tone="bg-blue-50 text-blue-700" />
        <Metric icon={CalendarClock} label="Expiring Soon" value={summary.expiringSoon} note="Within the next 7 days" tone="bg-amber-50 text-amber-700" />
        <Metric icon={CircleAlert} label="Unassigned Riders" value={summary.unassignedRiders} note="Missing Home Hub or Zone" tone="bg-rose-50 text-rose-700" />
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
            <input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Search Rider or MKB ID" className="min-h-10 w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </label>
          <select aria-label="Filter by Hub" value={filters.hubId} onChange={(e) => setFilters((f) => ({ ...f, hubId: e.target.value, zoneId: '' }))} className="min-h-10 rounded-lg border border-border px-3 text-sm">
            <option value="">All authorized hubs</option>{activeHubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}
          </select>
          <select aria-label="Filter by Zone" value={filters.zoneId} onChange={(e) => setFilters((f) => ({ ...f, zoneId: e.target.value }))} className="min-h-10 rounded-lg border border-border px-3 text-sm">
            <option value="">All zones</option>{filterZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
          </select>
          <select aria-label="Filter by Assignment Type" value={filters.assignmentType} onChange={(e) => setFilters((f) => ({ ...f, assignmentType: e.target.value }))} className="min-h-10 rounded-lg border border-border px-3 text-sm">
            <option value="">All assignment types</option><option value="home_assignment">Home Assignment</option><option value="permanent_transfer">Permanent Transfer</option><option value="temporary_deployment">Temporary Deployment</option><option value="unassigned">Unassigned</option>
          </select>
          <select aria-label="Filter by Status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="min-h-10 rounded-lg border border-border px-3 text-sm">
            <option value="">All statuses</option><option value="active">Active</option><option value="completed">Completed</option><option value="ended_early">Ended Early</option><option value="expired">Expired</option><option value="unassigned">Unassigned</option>
          </select>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="bg-panel-bg text-[11px] uppercase tracking-wide text-muted-foreground"><tr>
              {['Rider', 'Home Hub', 'Current Operational Hub', 'Current Zone', 'Assignment Type', 'Start Date', 'End Date', 'Status', 'Actions'].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {visibleRows.map((rider) => <tr key={rider.riderId} className="align-top hover:bg-panel-bg/50">
                <td className="px-4 py-3"><p className="font-medium text-foreground">{rider.riderName}</p><p className="text-xs text-muted-foreground">{rider.riderCode}</p></td>
                <td className="px-4 py-3">{rider.homeHubName ?? 'Restricted / Unassigned'}</td>
                <td className="px-4 py-3">{rider.operationalHubName ?? 'Restricted / Unassigned'}</td>
                <td className="px-4 py-3">{rider.operationalZoneName ?? 'Restricted / Unassigned'}</td>
                <td className="px-4 py-3">{assignmentLabel(rider.assignmentType)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(rider.startDate)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(rider.endDate)}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusStyle(rider.status)}`}>{rider.status.replace('_', ' ')}</span></td>
                <td className="px-4 py-3"><ActionMenu rider={rider} openDrawer={openDrawer} /></td>
              </tr>)}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border lg:hidden">
          {visibleRows.map((rider) => <article key={rider.riderId} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{rider.riderName}</p><p className="text-xs text-muted-foreground">{rider.riderCode}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusStyle(rider.status)}`}>{rider.status.replace('_', ' ')}</span></div>
            <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Home Hub</dt><dd className="mt-0.5 font-medium">{rider.homeHubName ?? 'Restricted / Unassigned'}</dd></div><div><dt className="text-muted-foreground">Operational Hub</dt><dd className="mt-0.5 font-medium">{rider.operationalHubName ?? 'Restricted / Unassigned'}</dd></div><div><dt className="text-muted-foreground">Current Zone</dt><dd className="mt-0.5 font-medium">{rider.operationalZoneName ?? 'Restricted / Unassigned'}</dd></div><div><dt className="text-muted-foreground">Assignment</dt><dd className="mt-0.5 font-medium">{assignmentLabel(rider.assignmentType)}</dd></div></dl>
            <ActionMenu rider={rider} openDrawer={openDrawer} />
          </article>)}
        </div>

        {!loading && visibleRows.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No Riders match the current assignment filters.</div>}
        {loading && <div className="p-10 text-center text-sm text-muted-foreground">Loading Rider assignments…</div>}
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
                <div><label className="text-sm font-medium">Target Hub <span className="text-red-500">*</span></label><select required value={targetHubId} onChange={(e) => { setTargetHubId(e.target.value); setTargetZoneId(''); }} className="mt-1.5 min-h-11 w-full rounded-lg border border-border px-3 text-sm"><option value="">Select an active authorized hub</option>{activeHubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}</select></div>
                <div><label className="text-sm font-medium">Target Zone <span className="text-red-500">*</span></label><select required disabled={!targetHubId} value={targetZoneId} onChange={(e) => setTargetZoneId(e.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-border px-3 text-sm disabled:bg-panel-bg"><option value="">Select a Zone under the Target Hub</option>{targetZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></div>
              </>}
              {(drawerMode === 'transfer' || drawerMode === 'deploy') && <div><label className="text-sm font-medium">{drawerMode === 'transfer' ? 'Effective Date' : 'Start Date'} <span className="text-red-500">*</span></label><input type="date" required readOnly value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-border bg-panel-bg px-3 text-sm" /><p className="mt-1 text-xs text-muted-foreground">Controlled assignment changes take effect today.</p></div>}
              {(drawerMode === 'deploy' || drawerMode === 'extend') && <div><label className="text-sm font-medium">{drawerMode === 'extend' ? 'New End Date' : 'End Date'} <span className="text-red-500">*</span></label><input type="date" required min={drawerMode === 'extend' ? selectedRider?.endDate ?? MANILA_TODAY : effectiveDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-border px-3 text-sm" /></div>}
              {drawerMode === 'end' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ending now returns this Rider to {selectedRider?.homeHubName ?? 'their Home Hub'} / {selectedRider?.homeZoneName ?? 'Home Zone'}.</div>}
              <div><label className="text-sm font-medium">Reason <span className="text-red-500">*</span></label><textarea required minLength={3} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5 w-full rounded-lg border border-border p-3 text-sm" placeholder="Record the operational reason for this assignment change." /></div>
              {isActiveDeployment && drawerMode === 'transfer' && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">End the active temporary deployment before a permanent transfer.</p>}
            </div>
            <footer className="flex justify-end gap-2 border-t border-border p-4"><button type="button" onClick={() => setDrawerMode(null)} disabled={saving} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">Cancel</button><button disabled={saving || (drawerMode === 'transfer' && isActiveDeployment)} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : drawerTitle}</button></footer>
          </form>
        )}
      </RightDrawer>
    </div>
  );
}

function ActionMenu({ rider, openDrawer }: { rider: RiderAssignmentRow; openDrawer: (mode: Exclude<DrawerMode, null>, rider: RiderAssignmentRow) => void }) {
  const activeDeployment = rider.assignmentType === 'temporary_deployment' && rider.status === 'active';
  return <div className="flex flex-wrap gap-1.5">
    {!activeDeployment && <><button type="button" onClick={() => openDrawer('transfer', rider)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-panel-bg">Transfer Permanently</button><button type="button" onClick={() => openDrawer('deploy', rider)} disabled={!rider.homeHubId || !rider.homeZoneId} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-panel-bg disabled:opacity-40">Deploy Temporarily</button></>}
    {activeDeployment && <><button type="button" onClick={() => openDrawer('extend', rider)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-panel-bg">Extend Deployment</button><button type="button" onClick={() => openDrawer('end', rider)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50">End Early</button></>}
    <button type="button" onClick={() => openDrawer('history', rider)} aria-label={`View assignment history for ${rider.riderName}`} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-panel-bg"><History className="h-4 w-4" /></button>
  </div>;
}
