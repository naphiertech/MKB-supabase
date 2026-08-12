import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Building2, MapPin, Pencil, Plus, Power } from 'lucide-react';
import { toast } from 'react-hot-toast';
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
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Hub directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create operational hubs and place zones under them. No hubs are created automatically.</p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Create hub
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5">
          <h3 className="font-semibold">{editing ? 'Edit hub' : 'Create hub'}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">Hub name
              <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border px-3 py-2 outline-none focus:border-primary" />
            </label>
            <label className="text-sm font-medium">Description <span className="font-normal text-muted-foreground">(optional)</span>
              <input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border px-3 py-2 outline-none focus:border-primary" />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
            <button disabled={saving || !name.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save hub'}</button>
          </div>
        </form>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
        <section className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Hubs</div>
          {loading ? <p className="p-6 text-sm text-muted-foreground">Loading hubs…</p> : snapshot.hubs.length === 0 ? (
            <div className="p-8 text-center"><Building2 className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">No hubs configured</p><p className="mt-1 text-sm text-muted-foreground">Create the first real hub when its details are ready.</p></div>
          ) : (
            <div className="divide-y divide-border">
              {snapshot.hubs.map((hub) => (
                <button key={hub.id} type="button" onClick={() => setSelectedId(hub.id)} className={`flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-panel-bg ${selectedId === hub.id ? 'bg-primary/5' : ''}`}>
                  <span className={`grid h-9 w-9 place-items-center rounded-lg ${hub.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><Building2 className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{hub.name}</span><span className="text-xs text-muted-foreground">{hub.zoneCount} zones · {hub.riderCount} riders · {hub.staffCount} staff</span></span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${hub.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{hub.active ? 'Active' : 'Inactive'}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5">
          {selectedHub ? <>
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{selectedHub.name}</h3><p className="mt-1 text-sm text-muted-foreground">{selectedHub.description || 'No description provided.'}</p></div><div className="flex gap-1"><button type="button" onClick={() => openEdit(selectedHub)} aria-label="Edit hub" className="rounded-lg border border-border p-2 text-muted-foreground hover:text-primary"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => void toggleActive(selectedHub)} aria-label={selectedHub.active ? 'Deactivate hub' : 'Activate hub'} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-primary"><Power className="h-4 w-4" /></button></div></div>
            <div className="mt-5 border-t border-border pt-4"><h4 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" /> Zone assignments</h4><div className="mt-3 space-y-2">
              {snapshot.zones.length === 0 ? <p className="text-sm text-muted-foreground">No zones are available.</p> : snapshot.zones.map((zone) => (
                <div key={zone.id} className="flex items-center gap-3 rounded-lg bg-panel-bg px-3 py-2.5"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{zone.name}</span><span className="text-xs text-muted-foreground">{zone.riderCount} assigned riders</span></span><select aria-label={`Hub for ${zone.name}`} value={zone.hubId ?? ''} onChange={(event) => { if (event.target.value) void assignZone(zone.id, event.target.value); }} className="max-w-[11rem] rounded-lg border border-border bg-white px-2 py-1.5 text-xs"><option value="" disabled>Unassigned</option>{snapshot.hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}</select></div>
              ))}
            </div></div>
          </> : <p className="text-sm text-muted-foreground">Select a hub to view details.</p>}
        </section>
      </div>
    </div>
  );
}
