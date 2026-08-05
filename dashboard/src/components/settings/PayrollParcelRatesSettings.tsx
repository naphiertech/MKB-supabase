import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, History, Loader2, Pencil, Plus, Power } from 'lucide-react';
import type { Role } from '../../hooks/useAuth';
import { pushToast } from '../../hooks/useToast';
import { Modal } from '../common/Modal';
import {
  createFutureParcelRateConfiguration,
  deactivateFutureParcelRateConfiguration,
  getCurrentParcelRateConfiguration,
  listParcelRateAudit,
  listParcelRateConfigurations,
  localDateString,
  updateFutureParcelRateConfiguration,
  validateParcelRateInput,
  type ParcelRateAuditWithPerson,
  type ParcelRateConfiguration,
  type ParcelRateInput,
} from '../../services/parcelRateConfigurationService';

interface PayrollParcelRatesSettingsProps { role: Role; }

const DEFAULT_INPUT: ParcelRateInput = {
  earlyStandardRate: 12,
  regularStandardRate: 11,
  lateStandardRate: 10,
  heavyParcelRate: 17,
  heavyThresholdKg: 4,
  effectiveFrom: '',
  reason: '',
};

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

function formatDate(value: string | null): string {
  if (!value) return 'No end date';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function auditRateSummary(values: ParcelRateAuditWithPerson['new_values'] | null): string {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return '—';
  const record = values as Record<string, unknown>;
  const number = (key: string) => typeof record[key] === 'number' ? peso.format(record[key] as number) : '—';
  return `Early ${number('early_standard_rate')}, Regular ${number('regular_standard_rate')}, Late ${number('late_standard_rate')}, Heavy ${number('heavy_parcel_rate')}`;
}

function ratesFrom(configuration: ParcelRateConfiguration | null): ParcelRateInput {
  if (!configuration) return DEFAULT_INPUT;
  return {
    earlyStandardRate: configuration.early_standard_rate,
    regularStandardRate: configuration.regular_standard_rate,
    lateStandardRate: configuration.late_standard_rate,
    heavyParcelRate: configuration.heavy_parcel_rate,
    heavyThresholdKg: configuration.heavy_threshold_kg,
    effectiveFrom: '',
    reason: '',
  };
}

export function PayrollParcelRatesSettings({ role }: PayrollParcelRatesSettingsProps) {
  const canManage = role === 'admin';
  const [configurations, setConfigurations] = useState<ParcelRateConfiguration[]>([]);
  const [audit, setAudit] = useState<ParcelRateAuditWithPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ParcelRateConfiguration | null>(null);
  const [deactivating, setDeactivating] = useState<ParcelRateConfiguration | null>(null);
  const [input, setInput] = useState<ParcelRateInput>(DEFAULT_INPUT);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rateRows, auditRows] = await Promise.all([
        listParcelRateConfigurations(),
        role === 'admin' ? listParcelRateAudit() : Promise.resolve([]),
      ]);
      setConfigurations(rateRows);
      setAudit(auditRows);
    } catch (loadError) {
      pushToast({ title: 'Unable to load rate settings', description: loadError instanceof Error ? loadError.message : 'Please try again.', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { void load(); }, [load]);

  const current = useMemo(() => getCurrentParcelRateConfiguration(configurations), [configurations]);
  const sortedConfigurations = useMemo(
    () => [...configurations].sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
    [configurations],
  );

  const openCreate = () => {
    setEditing(null);
    setInput({ ...ratesFrom(current), effectiveFrom: '', reason: '' });
    setError('');
    setEditorOpen(true);
  };

  const openEdit = (configuration: ParcelRateConfiguration) => {
    setEditing(configuration);
    setInput({ ...ratesFrom(configuration), effectiveFrom: configuration.effective_from, reason: '' });
    setError('');
    setEditorOpen(true);
  };

  const handleSave = async () => {
    const validation = validateParcelRateInput(input);
    if (validation) { setError(validation); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) await updateFutureParcelRateConfiguration(editing, input);
      else await createFutureParcelRateConfiguration(input);
      pushToast({ title: editing ? 'Future rates updated' : 'Future rates scheduled', description: `The configuration takes effect on ${formatDate(input.effectiveFrom)}.`, tone: 'success' });
      setEditorOpen(false);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivating) return;
    setSaving(true);
    setError('');
    try {
      await deactivateFutureParcelRateConfiguration(deactivating, reason);
      pushToast({ title: 'Future configuration deactivated', description: 'The scheduled rates will not take effect.', tone: 'success' });
      setDeactivating(null);
      setReason('');
      await load();
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : 'Unable to deactivate the configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading rate settings…</div>;

  return (
    <div id="settings-panel-payroll-parcel-rates" role="tabpanel" aria-labelledby="settings-tab-payroll-parcel-rates" className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-5 shadow-xs sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /><h3 className="text-sm font-bold text-foreground">Currently Active Configuration</h3></div>
          <p className="mt-1 text-xs text-muted-foreground">Operational parcel rates used by the deployed effective-dated configuration.</p>
        </div>
        {canManage && <button type="button" onClick={openCreate} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-xs font-bold text-white shadow-sm hover:bg-primary-hover"><Plus className="h-4 w-4" /> Create future configuration</button>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {[
          ['Early standard rate', current ? peso.format(current.early_standard_rate) : '—'],
          ['Regular standard rate', current ? peso.format(current.regular_standard_rate) : '—'],
          ['Late standard rate', current ? peso.format(current.late_standard_rate) : '—'],
          ['Heavy parcel rate', current ? `${peso.format(current.heavy_parcel_rate)} / parcel` : '—'],
          ['Heavy threshold', current ? `Above ${current.heavy_threshold_kg} kg` : '—'],
          ['Effective from', current ? formatDate(current.effective_from) : '—'],
          ['Effective until', current ? formatDate(current.effective_until) : '—'],
          ['Active status', current?.active ? 'Active' : 'No active rate'],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-white p-4 shadow-xs"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-2 text-sm font-bold text-foreground">{value}</div></div>)}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p><strong>Historical protection:</strong> rate changes never alter paid, disbursed, or finalized historical payroll. They apply only according to their effective dates.</p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-xs" aria-labelledby="rate-history-heading">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4"><History className="h-4 w-4 text-primary" /><h3 id="rate-history-heading" className="text-sm font-bold text-foreground">Configuration History</h3>{!canManage && <span className="ml-auto rounded-full border border-border bg-panel-bg px-2 py-0.5 text-[10px] font-bold text-muted-foreground">Read only</span>}</div>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-xs">
            <thead className="bg-panel-bg text-[10px] uppercase tracking-wider text-muted-foreground"><tr>{['Effective period', 'Early', 'Regular', 'Late', 'Heavy', 'Threshold', 'Status', 'Reason', 'Actions'].map((heading) => <th key={heading} className="px-4 py-3 font-bold">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {sortedConfigurations.map((configuration) => {
                const isFuture = configuration.effective_from > localDateString();
                return <tr key={configuration.id} className="hover:bg-panel-bg/50">
                  <td className="px-4 py-3 font-semibold text-foreground">{formatDate(configuration.effective_from)} – {formatDate(configuration.effective_until)}</td>
                  <td className="px-4 py-3">{peso.format(configuration.early_standard_rate)}</td><td className="px-4 py-3">{peso.format(configuration.regular_standard_rate)}</td><td className="px-4 py-3">{peso.format(configuration.late_standard_rate)}</td><td className="px-4 py-3">{peso.format(configuration.heavy_parcel_rate)}</td><td className="px-4 py-3">&gt; {configuration.heavy_threshold_kg} kg</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${configuration.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>{configuration.active ? (isFuture ? 'Scheduled' : 'Active') : 'Inactive'}</span></td>
                  <td className="max-w-56 px-4 py-3 text-muted-foreground">{configuration.change_reason}</td>
                  <td className="px-4 py-3">{canManage && isFuture && configuration.active ? <div className="flex gap-1"><button type="button" onClick={() => openEdit(configuration)} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 font-semibold hover:bg-panel-bg"><Pencil className="h-3 w-3" /> Edit</button><button type="button" onClick={() => { setDeactivating(configuration); setReason(''); setError(''); }} className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 px-2 font-semibold text-red-600 hover:bg-red-50"><Power className="h-3 w-3" /> Deactivate</button></div> : <span className="text-muted-foreground">—</span>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      {role === 'admin' && <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-xs" aria-labelledby="rate-audit-heading"><div className="border-b border-border px-5 py-4"><h3 id="rate-audit-heading" className="text-sm font-bold text-foreground">Rate-change Audit History</h3><p className="mt-0.5 text-xs text-muted-foreground">Append-only record of previous and new effective-dated values.</p></div><div className="divide-y divide-border">{audit.length ? audit.slice(0, 50).map((entry) => <div key={entry.id} className="space-y-2 px-5 py-3 text-xs"><div className="flex flex-wrap gap-x-5 gap-y-1"><span className="font-semibold text-foreground">{new Date(entry.changed_at).toLocaleString('en-PH')}</span><span className="capitalize text-foreground">{entry.action}</span><span className="text-foreground">By {entry.changedByName}</span><span className="text-muted-foreground">Effective {formatDate(entry.effective_date)}</span></div><p className="text-muted-foreground">{entry.reason}</p><div className="grid gap-1 rounded-lg border border-border bg-panel-bg p-2 text-[10px] sm:grid-cols-2"><span><strong>Previous:</strong> {auditRateSummary(entry.previous_values)}</span><span><strong>New:</strong> {auditRateSummary(entry.new_values)}</span></div></div>) : <p className="px-5 py-8 text-center text-xs text-muted-foreground">No audit entries available.</p>}</div></section>}

      <Modal open={editorOpen} onClose={() => !saving && setEditorOpen(false)} title={editing ? 'Edit future configuration' : 'Create future rate configuration'} subtitle="All values are effective-dated and require a reason." size="lg" dismissible={!saving}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {([
            ['Early standard rate', 'earlyStandardRate'], ['Regular standard rate', 'regularStandardRate'], ['Late standard rate', 'lateStandardRate'], ['Heavy parcel rate', 'heavyParcelRate'], ['Heavy threshold (kg)', 'heavyThresholdKg'],
          ] as const).map(([label, key]) => <label key={key} className="space-y-1 text-xs font-semibold text-foreground">{label} *<input type="number" min={key === 'heavyThresholdKg' ? '0.01' : '0'} step="0.01" value={input[key]} onChange={(event) => setInput((currentInput) => ({ ...currentInput, [key]: Number(event.target.value) }))} className="ar-input" /></label>)}
          <label className="space-y-1 text-xs font-semibold text-foreground">Effective from *<input type="date" min={localDateString(new Date(Date.now() + 86400000))} value={input.effectiveFrom} onChange={(event) => setInput((currentInput) => ({ ...currentInput, effectiveFrom: event.target.value }))} className="ar-input" disabled={Boolean(editing)} /></label>
          <label className="space-y-1 text-xs font-semibold text-foreground sm:col-span-2">Reason for change *<textarea value={input.reason} onChange={(event) => setInput((currentInput) => ({ ...currentInput, reason: event.target.value }))} className="ar-textarea" rows={3} placeholder="Explain why these rates are changing." /></label>
        </div>
        {error && <p role="alert" className="mt-3 text-xs font-medium text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={() => setEditorOpen(false)} disabled={saving} className="h-9 rounded-md border border-border px-4 text-xs font-semibold">Cancel</button><button type="button" onClick={() => void handleSave()} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save configuration</button></div>
      </Modal>

      <Modal open={Boolean(deactivating)} onClose={() => !saving && setDeactivating(null)} title="Deactivate future configuration" subtitle="Only scheduled configurations can be deactivated." size="sm" dismissible={!saving}><label className="space-y-1 text-xs font-semibold text-foreground">Reason *<textarea value={reason} onChange={(event) => setReason(event.target.value)} className="ar-textarea" rows={3} /></label>{error && <p role="alert" className="mt-3 text-xs font-medium text-red-600">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeactivating(null)} disabled={saving} className="h-9 rounded-md border border-border px-4 text-xs font-semibold">Cancel</button><button type="button" onClick={() => void handleDeactivate()} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md bg-red-600 px-4 text-xs font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Deactivate</button></div></Modal>
    </div>
  );
}
