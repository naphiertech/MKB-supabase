import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  Activity,
  ArrowUpDown,
  Building2,
  CalendarDays,
  ChevronRight,
  MapPin,
  Pencil,
  Plus,
  Power,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { StatusBadge, SummaryCard } from '../components/common/DashboardPrimitives';
import { RightDrawer } from '../components/common/RightDrawer';
import { HubLocationPickerMap } from '../components/hubs/HubLocationPickerMap';
import { HubManagementSkeleton } from '../components/hubs/HubManagementSkeleton';
import { useHub } from '../context/HubContext';
import { formatLatLng, metersToReadable } from '../lib/geofenceUtils';
import {
  assignZoneToHub,
  createHub,
  getHubManagementSnapshot,
  updateHub,
  type HubManagementHub,
  type HubManagementSnapshot,
} from '../services/hubs/hubService';

const EMPTY: HubManagementSnapshot = { hubs: [], zones: [] };

type WorkspaceTab = 'zones' | 'details' | 'staff' | 'activity';
type HubStatusFilter = 'all' | 'active' | 'inactive';
type HubSort = 'name-asc' | 'name-desc' | 'zones-desc' | 'riders-desc';

const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'zones', label: 'Zone Assignments' },
  { id: 'details', label: 'Hub Details' },
  { id: 'staff', label: 'Staff' },
  { id: 'activity', label: 'Activity' },
];

const NUMBER_FORMAT = new Intl.NumberFormat('en-PH');
const DATE_FORMAT = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function HubStatusBadge({ active }: { active: boolean }) {
  return (
    <StatusBadge tone={active ? 'success' : 'neutral'} dot size="md">
      {active ? 'Active' : 'Inactive'}
    </StatusBadge>
  );
}

function formatHubDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : DATE_FORMAT.format(date);
}

export function HubManagement() {
  const { refreshHubs } = useHub();
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('zones');
  const [hubSearch, setHubSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<HubStatusFilter>('all');
  const [hubSort, setHubSort] = useState<HubSort>('name-asc');
  const [editing, setEditing] = useState<HubManagementHub | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [attendanceRadiusM, setAttendanceRadiusM] = useState<number | null>(null);
  const [radiusInput, setRadiusInput] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assigningZoneId, setAssigningZoneId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const drawerTitleId = useId();
  const drawerDescriptionId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getHubManagementSnapshot();
      setSnapshot(next);
      setSelectedId((current) => (
        current && next.hubs.some((hub) => hub.id === current)
          ? current
          : next.hubs[0]?.id ?? null
      ));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load hubs.');
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedHub = useMemo(
    () => snapshot.hubs.find((hub) => hub.id === selectedId) ?? null,
    [selectedId, snapshot.hubs],
  );

  const totals = useMemo(() => ({
    hubs: snapshot.hubs.length,
    activeHubs: snapshot.hubs.filter((hub) => hub.active).length,
    zones: snapshot.zones.length,
    riders: snapshot.hubs.reduce((total, hub) => total + hub.riderCount, 0),
    staff: snapshot.hubs.reduce((total, hub) => total + hub.staffCount, 0),
  }), [snapshot]);

  const visibleHubs = useMemo(() => {
    const query = hubSearch.trim().toLocaleLowerCase();
    const next = snapshot.hubs.filter((hub) => {
      const matchesSearch = !query || hub.name.toLocaleLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' ? hub.active : !hub.active);
      return matchesSearch && matchesStatus;
    });

    return next.sort((left, right) => {
      if (hubSort === 'name-desc') return right.name.localeCompare(left.name);
      if (hubSort === 'zones-desc') return right.zoneCount - left.zoneCount || left.name.localeCompare(right.name);
      if (hubSort === 'riders-desc') return right.riderCount - left.riderCount || left.name.localeCompare(right.name);
      return left.name.localeCompare(right.name);
    });
  }, [hubSearch, hubSort, snapshot.hubs, statusFilter]);

  const orderedZones = useMemo(() => (
    [...snapshot.zones].sort((left, right) => {
      const leftSelected = left.hubId === selectedId ? 0 : 1;
      const rightSelected = right.hubId === selectedId ? 0 : 1;
      return leftSelected - rightSelected || left.name.localeCompare(right.name);
    })
  ), [selectedId, snapshot.zones]);

  function selectHub(hubId: string) {
    setSelectedId(hubId);
    setActiveTab('zones');
  }

  function clearHubFilters() {
    setHubSearch('');
    setStatusFilter('all');
    setHubSort('name-asc');
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: WorkspaceTab) {
    const currentIndex = WORKSPACE_TABS.findIndex((tab) => tab.id === currentTab);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % WORKSPACE_TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + WORKSPACE_TABS.length) % WORKSPACE_TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = WORKSPACE_TABS.length - 1;
    else return;

    event.preventDefault();
    const nextTab = WORKSPACE_TABS[nextIndex].id;
    setActiveTab(nextTab);
    document.getElementById(`hub-tab-${nextTab}`)?.focus();
  }

  function openCreate() {
    setEditing(null);
    setName('');
    setDescription('');
    setLatitude(null);
    setLongitude(null);
    setAttendanceRadiusM(null);
    setRadiusInput('');
    setShowForm(true);
  }

  function openEdit(hub: HubManagementHub) {
    setEditing(hub);
    setName(hub.name);
    setDescription(hub.description ?? '');
    setLatitude(hub.latitude);
    setLongitude(hub.longitude);
    setAttendanceRadiusM(hub.attendanceRadiusM);
    setRadiusInput(hub.attendanceRadiusM != null ? String(hub.attendanceRadiusM) : '');
    setShowForm(true);
  }

  function handleRadiusInputChange(val: string) {
    setRadiusInput(val);
    const parsed = parseInt(val, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setAttendanceRadiusM(parsed);
    } else {
      setAttendanceRadiusM(null);
    }
  }

  function handleLocationChange(coords: { latitude: number; longitude: number }) {
    setLatitude(coords.latitude);
    setLongitude(coords.longitude);
  }

  const isCompleteGeofence = Boolean(
    latitude != null &&
    longitude != null &&
    attendanceRadiusM != null &&
    attendanceRadiusM > 0
  );

  const hasAnyGeofenceInput = Boolean(
    latitude != null ||
    longitude != null ||
    radiusInput.trim() !== ''
  );

  const isGeofenceValid = editing
    ? (editing.latitude == null && !hasAnyGeofenceInput ? true : isCompleteGeofence)
    : isCompleteGeofence;

  const canSubmit = Boolean(name.trim().length >= 2 && isGeofenceValid);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      if (editing) {
        const payload: {
          name: string;
          description: string | null;
          latitude?: number | null;
          longitude?: number | null;
          attendanceRadiusM?: number | null;
        } = {
          name,
          description,
        };
        if (isCompleteGeofence) {
          payload.latitude = latitude;
          payload.longitude = longitude;
          payload.attendanceRadiusM = attendanceRadiusM;
        }
        await updateHub(editing.id, payload);
      } else {
        if (!isCompleteGeofence || latitude == null || longitude == null || attendanceRadiusM == null) {
          toast.error('Please position the physical Hub pin and enter an attendance radius.');
          return;
        }
        await createHub({
          name,
          description,
          latitude,
          longitude,
          attendanceRadiusM,
        });
      }
      toast.success(editing ? 'Hub updated.' : 'Hub created.');
      setShowForm(false);
      await Promise.all([load(), refreshHubs()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save hub.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(hub: HubManagementHub) {
    try {
      await updateHub(hub.id, { active: !hub.active });
      toast.success(hub.active ? 'Hub deactivated.' : 'Hub activated.');
      await Promise.all([load(), refreshHubs()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to change hub status.');
    }
  }

  async function assignZone(zoneId: string, hubId: string) {
    setAssigningZoneId(zoneId);
    try {
      await assignZoneToHub(zoneId, hubId);
      toast.success('Zone assignment updated.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to assign zone.');
    } finally {
      setAssigningZoneId(null);
    }
  }

  if (loading && !hasLoadedRef.current) return <HubManagementSkeleton />;

  return (
    <div className="dashboard-page space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Hub directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize Zamboanga City operations by managing hubs and their assigned zones.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          aria-expanded={showForm}
          className="ui-button-primary min-h-11 px-4"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Create hub</span>
        </button>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Building2}
          label="Total Hubs"
          value={loading ? '—' : NUMBER_FORMAT.format(totals.hubs)}
          helper={`${NUMBER_FORMAT.format(totals.activeHubs)} active`}
        />
        <SummaryCard
          icon={MapPin}
          tone="success"
          label="Total Zones"
          value={loading ? '—' : NUMBER_FORMAT.format(totals.zones)}
          helper="Across all hubs"
        />
        <SummaryCard
          icon={Users}
          tone="info"
          label="Total Riders"
          value={loading ? '—' : NUMBER_FORMAT.format(totals.riders)}
          helper="Assigned across hubs"
        />
        <SummaryCard
          icon={Users}
          tone="violet"
          label="Total Staff"
          value={loading ? '—' : NUMBER_FORMAT.format(totals.staff)}
          helper="Across hub assignments"
        />
      </div>

      <RightDrawer
        open={showForm}
        onClose={() => setShowForm(false)}
        ariaLabelledBy={drawerTitleId}
        ariaDescribedBy={drawerDescriptionId}
        initialFocusRef={nameInputRef}
        widthClassName="max-w-xl"
        closeLabel="Close hub drawer"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-white px-4 py-3.5 sm:px-5 sm:py-4">
          <h2 id={drawerTitleId} className="text-base font-semibold text-foreground">
            {editing ? 'Edit hub' : 'Create hub'}
          </h2>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="ui-icon-button"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
            <p id={drawerDescriptionId} className="text-xs leading-relaxed text-muted-foreground">
              {editing
                ? 'Update this operational hub’s details and physical attendance geofence for Zamboanga City.'
                : 'Specify details and physical attendance geofence for a new operational hub in Zamboanga City.'}
            </p>

            <div>
              <label className="block text-sm font-medium text-foreground">
                Hub name <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="ui-control mt-1.5 min-h-11"
                placeholder="e.g. Talon-Talon Operations Hub"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">
                Description <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                rows={3}
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="ui-textarea mt-1.5"
                placeholder="e.g. Operational hub serving assigned Zamboanga City zones and riders."
              />
            </div>

            {/* Attendance Geofence Section */}
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-sm font-semibold text-foreground">
                  Attendance Geofence {!editing && <span className="text-red-500">*</span>}
                </label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Set the physical Hub location and the attendance area around it. Click the map or drag the pin to adjust the location.
                </p>
              </div>

              {/* Map Picker */}
              <HubLocationPickerMap
                latitude={latitude}
                longitude={longitude}
                radius={attendanceRadiusM}
                onLocationChange={handleLocationChange}
                disabled={saving}
              />

              {/* Geofence Form Controls: Coordinates & Radius */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground">
                    Physical Coordinates
                  </label>
                  <div className="mt-1 flex min-h-10 items-center rounded-lg border border-border bg-panel-bg px-3 py-2 font-mono text-xs text-foreground">
                    {latitude != null && longitude != null ? (
                      formatLatLng([latitude, longitude], 6)
                    ) : (
                      <span className="text-muted-foreground italic">Pin not placed</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground">
                    Attendance Radius {!editing && <span className="text-red-500">*</span>}
                  </label>
                  <div className="relative mt-1">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={radiusInput}
                      onChange={(e) => handleRadiusInputChange(e.target.value)}
                      className="ui-control min-h-10 pr-16 font-mono text-xs"
                      placeholder="e.g. 100"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                      meters
                    </span>
                  </div>
                </div>
              </div>

              {editing && editing.latitude == null && latitude == null && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
                  <strong className="font-semibold">Legacy Hub:</strong> Attendance geofence is currently unconfigured. Place a pin and enter a radius to configure physical attendance enforcement for this Hub.
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-border bg-white px-4 py-4 sm:px-5">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="ui-button-secondary min-h-11"
            >
              Cancel
            </button>
            <button
              disabled={saving || !canSubmit}
              className="ui-button-primary min-h-11"
            >
              {saving ? 'Saving…' : 'Save hub'}
            </button>
          </div>
        </form>
      </RightDrawer>

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(18rem,0.78fr)_minmax(0,1.35fr)] 2xl:grid-cols-[minmax(22rem,0.72fr)_minmax(0,1.5fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">All hubs</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {loading ? 'Loading directory…' : `${NUMBER_FORMAT.format(visibleHubs.length)} of ${NUMBER_FORMAT.format(snapshot.hubs.length)} shown`}
                </p>
              </div>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-panel-bg text-muted-foreground" title="Hub list controls">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>

            <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] lg:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="relative min-w-0">
                <span className="sr-only">Search hubs</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  type="search"
                  value={hubSearch}
                  onChange={(event) => setHubSearch(event.target.value)}
                  placeholder="Search hubs"
                  className="ui-control min-h-10 pl-9 pr-3"
                />
              </label>
              <label className="relative min-w-0">
                <span className="sr-only">Sort hubs</span>
                <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <select
                  value={hubSort}
                  onChange={(event) => setHubSort(event.target.value as HubSort)}
                  className="min-h-10 w-full appearance-none rounded-lg border border-border bg-white py-2 pl-8 pr-7 text-xs font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  <option value="name-asc">Name A–Z</option>
                  <option value="name-desc">Name Z–A</option>
                  <option value="zones-desc">Most zones</option>
                  <option value="riders-desc">Most riders</option>
                </select>
                <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-muted-foreground" aria-hidden="true" />
              </label>
              <label className="relative min-w-0">
                <span className="sr-only">Filter hubs by status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as HubStatusFilter)}
                  className="min-h-10 w-full appearance-none rounded-lg border border-border bg-white py-2 pl-3 pr-7 text-xs font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-muted-foreground" aria-hidden="true" />
              </label>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 p-4" aria-label="Loading hubs">
              {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-panel-bg" />)}
            </div>
          ) : snapshot.hubs.length === 0 ? (
            <div className="p-8 text-center">
              <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium text-foreground">No hubs configured</p>
              <p className="mt-1 text-sm text-muted-foreground">Create the first real hub when its details are ready.</p>
            </div>
          ) : visibleHubs.length === 0 ? (
            <div className="p-8 text-center">
              <Search className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-3 font-medium text-foreground">No hubs match these filters</p>
              <button type="button" onClick={clearHubFilters} className="mt-2 text-sm font-semibold text-primary hover:underline">
                Clear filters
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visibleHubs.map((hub) => {
                const selected = selectedId === hub.id;
                return (
                  <button
                    key={hub.id}
                    type="button"
                    onClick={() => selectHub(hub.id)}
                    aria-pressed={selected}
                    className={`group relative flex min-w-0 w-full items-center gap-3 px-4 py-3.5 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                      selected ? 'bg-primary/[0.06]' : 'hover:bg-panel-bg'
                    }`}
                  >
                    {selected && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" aria-hidden="true" />}
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                      selected
                        ? 'bg-primary/10 text-primary'
                        : hub.active
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Building2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">{hub.name}</span>
                        {!hub.active && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Inactive</span>}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {NUMBER_FORMAT.format(hub.zoneCount)} zones · {NUMBER_FORMAT.format(hub.riderCount)} riders · {NUMBER_FORMAT.format(hub.staffCount)} staff
                      </span>
                    </span>
                    <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${
                      selected ? 'translate-x-0.5 text-primary' : 'text-muted-foreground group-hover:translate-x-0.5 group-hover:text-foreground'
                    }`} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          {selectedHub ? (
            <>
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-4 border-b border-border p-4 sm:p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-semibold text-foreground">{selectedHub.name}</h3>
                      <HubStatusBadge active={selectedHub.active} />
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {NUMBER_FORMAT.format(selectedHub.zoneCount)} zones · Created {formatHubDate(selectedHub.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(selectedHub)}
                    aria-label={`Edit ${selectedHub.name}`}
                    title="Edit hub"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(selectedHub)}
                    aria-label={selectedHub.active ? `Deactivate ${selectedHub.name}` : `Activate ${selectedHub.name}`}
                    title={selectedHub.active ? 'Deactivate hub' : 'Activate hub'}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Power className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="table-scroll-region border-b border-border" role="tablist" aria-label={`${selectedHub.name} workspace`}>
                <div className="flex min-w-max px-2 sm:px-3">
                  {WORKSPACE_TABS.map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        id={`hub-tab-${tab.id}`}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-controls={`hub-panel-${tab.id}`}
                        tabIndex={active ? 0 : -1}
                        onClick={() => setActiveTab(tab.id)}
                        onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                        className={`relative min-h-12 whitespace-nowrap px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-4 ${
                          active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tab.label}
                        {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary sm:inset-x-4" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeTab === 'zones' && (
                <div
                  id="hub-panel-zones"
                  role="tabpanel"
                  aria-labelledby="hub-tab-zones"
                  className="p-4 sm:p-5"
                >
                  <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
                        Zone assignments
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Assign zones to hubs. Zones under {selectedHub.name} are shown first.
                      </p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      {NUMBER_FORMAT.format(selectedHub.zoneCount)} assigned here
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {orderedZones.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-6 text-center">
                        <MapPin className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
                        <p className="mt-2 text-sm text-muted-foreground">No zones are available.</p>
                      </div>
                    ) : orderedZones.map((zone) => (
                      <div
                        key={zone.id}
                        className={`flex min-w-0 flex-col gap-3 rounded-lg border px-3 py-3 transition-colors sm:flex-row sm:items-center ${
                          zone.hubId === selectedHub.id
                            ? 'border-primary/25 bg-primary/[0.035]'
                            : 'border-border bg-panel-bg/60'
                        }`}
                      >
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                          zone.hubId === selectedHub.id ? 'bg-primary/10 text-primary' : 'bg-white text-muted-foreground'
                        }`}>
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">{zone.name}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {NUMBER_FORMAT.format(zone.riderCount)} assigned {zone.riderCount === 1 ? 'rider' : 'riders'}
                          </span>
                        </span>
                        <label className="min-w-0 sm:w-48 lg:w-44 2xl:w-52">
                          <span className="sr-only">Current hub for {zone.name}</span>
                          <select
                            aria-label={`Current hub for ${zone.name}`}
                            value={zone.hubId ?? ''}
                            disabled={assigningZoneId === zone.id}
                            onChange={(event) => {
                              if (event.target.value) void assignZone(zone.id, event.target.value);
                            }}
                            className="min-h-10 w-full min-w-0 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-wait disabled:opacity-60"
                          >
                            <option value="" disabled>Unassigned</option>
                            {snapshot.hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}
                          </select>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'details' && (
                <div
                  id="hub-panel-details"
                  role="tabpanel"
                  aria-labelledby="hub-tab-details"
                  className="p-4 sm:p-5"
                >
                  <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(15rem,0.65fr)]">
                    <div className="min-w-0 rounded-xl border border-border p-4">
                      <h4 className="text-sm font-semibold text-foreground">Operational details</h4>
                      <dl className="mt-4 divide-y divide-border text-sm">
                        <div className="grid min-w-0 gap-1 py-3 first:pt-0 sm:grid-cols-[7rem_minmax(0,1fr)]">
                          <dt className="text-xs font-medium text-muted-foreground">Description</dt>
                          <dd className="text-wrap-safe text-foreground">{selectedHub.description || 'No description provided.'}</dd>
                        </div>
                        <div className="grid min-w-0 gap-1 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
                          <dt className="text-xs font-medium text-muted-foreground">Status</dt>
                          <dd><HubStatusBadge active={selectedHub.active} /></dd>
                        </div>
                        <div className="grid min-w-0 gap-1 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
                          <dt className="text-xs font-medium text-muted-foreground">Geofence</dt>
                          <dd className="text-foreground">
                            {selectedHub.latitude != null && selectedHub.longitude != null && selectedHub.attendanceRadiusM != null ? (
                              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-foreground">
                                <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                                {formatLatLng([selectedHub.latitude, selectedHub.longitude], 5)} ({metersToReadable(selectedHub.attendanceRadiusM)} radius)
                              </span>
                            ) : (
                              <span className="italic text-xs text-muted-foreground">Not configured</span>
                            )}
                          </dd>
                        </div>
                        <div className="grid min-w-0 gap-1 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
                          <dt className="text-xs font-medium text-muted-foreground">Created</dt>
                          <dd className="text-foreground">{formatHubDate(selectedHub.createdAt)}</dd>
                        </div>
                        <div className="grid min-w-0 gap-1 py-3 pb-0 sm:grid-cols-[7rem_minmax(0,1fr)]">
                          <dt className="text-xs font-medium text-muted-foreground">Last updated</dt>
                          <dd className="text-foreground">{formatHubDate(selectedHub.updatedAt)}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="grid grid-cols-3 gap-2 xl:grid-cols-1">
                      {[
                        ['Zones', selectedHub.zoneCount],
                        ['Riders', selectedHub.riderCount],
                        ['Staff', selectedHub.staffCount],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-border bg-panel-bg/60 p-3 xl:p-4">
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
                          <strong className="mt-1 block text-xl font-semibold text-foreground">{NUMBER_FORMAT.format(value as number)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'staff' && (
                <div
                  id="hub-panel-staff"
                  role="tabpanel"
                  aria-labelledby="hub-tab-staff"
                  className="p-4 sm:p-5"
                >
                  <div className="rounded-xl border border-border bg-panel-bg/50 p-5">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
                        <Users className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {NUMBER_FORMAT.format(selectedHub.staffCount)} staff {selectedHub.staffCount === 1 ? 'assignment' : 'assignments'}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          Staff access for this hub is managed in Users Registry. This workspace reflects the current real assignment count.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'activity' && (
                <div
                  id="hub-panel-activity"
                  role="tabpanel"
                  aria-labelledby="hub-tab-activity"
                  className="p-4 sm:p-5"
                >
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-xl border border-border p-4">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Activity className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Hub record last updated</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatHubDate(selectedHub.updatedAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-xl border border-border p-4">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-panel-bg text-muted-foreground">
                        <CalendarDays className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Hub record created</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatHubDate(selectedHub.createdAt)}</p>
                      </div>
                    </div>
                    <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                      Detailed administrative events remain available in Audit Logs.
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="grid min-h-64 place-items-center p-8 text-center">
              <div>
                <Building2 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-foreground">Select a hub to open its workspace</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
