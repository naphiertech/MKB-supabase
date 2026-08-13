import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Building2, MapPin, Pencil, Plus, Power, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { RightDrawer } from '../components/common/RightDrawer';
import { useHub } from '../context/HubContext';
import {
  assignZoneToHub,
  createHub,
  getHubManagementSnapshot,
  updateHub,
  type HubManagementHub,
  type HubManagementSnapshot,
} from '../services/hubService';

const EMPTY: HubManagementSnapshot = { hubs: [], zones: [] };

export function HubManagement() {
  const { refreshHubs } = useHub();
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<HubManagementHub | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const drawerTitleId = useId();
  const drawerDescriptionId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getHubManagementSnapshot();
      setSnapshot(next);
      setSelectedId((current) => current && next.hubs.some((hub) => hub.id === current) ? current : next.hubs[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load hubs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedHub = useMemo(
    () => snapshot.hubs.find((hub) => hub.id === selectedId) ?? null,
    [selectedId, snapshot.hubs],
  );

  function openCreate() {
    setEditing(null);
    setName('');
    setDescription('');
    setShowForm(true);
  }

  function openEdit(hub: HubManagementHub) {
    setEditing(hub);
    setName(hub.name);
    setDescription(hub.description ?? '');
    setShowForm(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) await updateHub(editing.id, { name, description });
      else await createHub({ name, description });
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
    try {
      await assignZoneToHub(zoneId, hubId);
      toast.success('Zone assignment updated.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to assign zone.');
    }
  }

  return (
    <div className="dashboard-page space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Hub directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create operational hubs and place zones under them. No hubs are created automatically.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          aria-expanded={showForm}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          <span>Create hub</span>
        </button>
      </div>

      <RightDrawer
        open={showForm}
        onClose={() => setShowForm(false)}
        ariaLabelledBy={drawerTitleId}
        ariaDescribedBy={drawerDescriptionId}
        initialFocusRef={nameInputRef}
        widthClassName="max-w-md"
        closeLabel="Close hub drawer"
      >
                <div className="flex shrink-0 items-center justify-between border-b border-border bg-white px-4 py-3.5 sm:px-5 sm:py-4">
                  <div className="flex items-center gap-1.5">
                    <h2 id={drawerTitleId} className="text-base font-semibold text-foreground">
                      {editing ? 'Edit hub' : 'Create hub'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-panel-bg hover:text-foreground"
                    aria-label="Close drawer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
                    <p id={drawerDescriptionId} className="text-xs leading-relaxed text-muted-foreground">
                      {editing
                        ? 'Update this operational hub’s details for its Zamboanga City service area.'
                        : 'Specify details for a new operational hub in Zamboanga City.'}
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
                        className="mt-1.5 min-h-11 w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                        placeholder="e.g. Zamboanga City Operations Hub"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground">
                        Description <span className="font-normal text-muted-foreground">(optional)</span>
                      </label>
                      <textarea
                        rows={4}
                        maxLength={500}
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        className="mt-1.5 w-full resize-y rounded-lg border border-border px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                        placeholder="e.g. Operational hub serving assigned Zamboanga City zones and riders."
                      />
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-border bg-white px-4 py-4 sm:px-5">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-panel-bg"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={saving || !name.trim()}
                      className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save hub'}
                    </button>
                  </div>
                </form>
      </RightDrawer>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Hubs</div>
          {loading ? <p className="p-6 text-sm text-muted-foreground">Loading hubs…</p> : snapshot.hubs.length === 0 ? (
            <div className="p-8 text-center"><Building2 className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">No hubs configured</p><p className="mt-1 text-sm text-muted-foreground">Create the first real hub when its details are ready.</p></div>
          ) : (
            <div className="divide-y divide-border">
              {snapshot.hubs.map((hub) => (
                <button key={hub.id} type="button" onClick={() => setSelectedId(hub.id)} className={`flex min-w-0 w-full items-center gap-3 px-4 py-4 text-left hover:bg-panel-bg ${selectedId === hub.id ? 'bg-primary/5' : ''}`}>
                  <span className={`grid h-9 w-9 place-items-center rounded-lg ${hub.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><Building2 className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{hub.name}</span><span className="block truncate text-xs text-muted-foreground">{hub.zoneCount} zones · {hub.riderCount} riders · {hub.staffCount} staff</span></span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${hub.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{hub.active ? 'Active' : 'Inactive'}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5">
          {selectedHub ? <>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold">{selectedHub.name}</h3><p className="mt-1 text-sm text-muted-foreground text-wrap-safe">{selectedHub.description || 'No description provided.'}</p></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => openEdit(selectedHub)} aria-label="Edit hub" className="rounded-lg border border-border p-2 text-muted-foreground hover:text-primary"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => void toggleActive(selectedHub)} aria-label={selectedHub.active ? 'Deactivate hub' : 'Activate hub'} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-primary"><Power className="h-4 w-4" /></button></div></div>
            <div className="mt-5 border-t border-border pt-4"><h4 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" /> Zone assignments</h4><div className="mt-3 space-y-2">
              {snapshot.zones.length === 0 ? <p className="text-sm text-muted-foreground">No zones are available.</p> : snapshot.zones.map((zone) => (
                <div key={zone.id} className="flex min-w-0 flex-col items-stretch gap-2 rounded-lg bg-panel-bg px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{zone.name}</span><span className="text-xs text-muted-foreground">{zone.riderCount} assigned riders</span></span><select aria-label={`Hub for ${zone.name}`} value={zone.hubId ?? ''} onChange={(event) => { if (event.target.value) void assignZone(zone.id, event.target.value); }} className="w-full min-w-0 rounded-lg border border-border bg-white px-2 py-1.5 text-xs sm:w-auto sm:max-w-[11rem]"><option value="" disabled>Unassigned</option>{snapshot.hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}</select></div>
              ))}
            </div></div>
          </> : <p className="text-sm text-muted-foreground">Select a hub to view details.</p>}
        </section>
      </div>
    </div>
  );
}
