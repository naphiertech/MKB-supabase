import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, CalendarClock, Coins, FileText, History, Info, Loader2, Pencil, Plus, Power, X } from 'lucide-react';
import type { Role } from '../../hooks/useAuth';
import { pushToast } from '../../hooks/useToast';
import { Modal } from '../common/Modal';
import { RightDrawer } from '../common/RightDrawer';
import { ParcelRatesSkeleton } from './ParcelRatesSkeleton';
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
} from '../../services/parcels/parcelRateConfigurationService';

interface PayrollParcelRatesSettingsProps { role: Role; }

const DEFAULT_INPUT: ParcelRateInput = {
  earlyStandardRate: 12,
  regularStandardRate: 11,
  lateStandardRate: 10,
  heavyParcelRate: 17,
  regularHeavyRate: 16,
  lateHeavyRate: 15,
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
  const formatKey = (key: string, fallback?: number) => {
    const v = typeof record[key] === 'number' ? record[key] as number : fallback;
    return typeof v === 'number' ? peso.format(v) : '—';
  };
  const earlySmall = formatKey('early_standard_rate');
  const regSmall = formatKey('regular_standard_rate');
  const lateSmall = formatKey('late_standard_rate');
  const earlyBulky = formatKey('heavy_parcel_rate');
  const regBulky = formatKey('regular_heavy_rate', typeof record['heavy_parcel_rate'] === 'number' ? record['heavy_parcel_rate'] as number : undefined);
  const lateBulky = formatKey('late_heavy_rate', typeof record['heavy_parcel_rate'] === 'number' ? record['heavy_parcel_rate'] as number : undefined);
  return `Small: ${earlySmall} → ${regSmall} → ${lateSmall} | Bulky: ${earlyBulky} → ${regBulky} → ${lateBulky}`;
}

function ratesFrom(configuration: ParcelRateConfiguration | null): ParcelRateInput {
  if (!configuration) return DEFAULT_INPUT;
  const record = configuration as unknown as Record<string, unknown>;
  const earlyBulky = Number(configuration.heavy_parcel_rate);
  return {
    earlyStandardRate: Number(configuration.early_standard_rate),
    regularStandardRate: Number(configuration.regular_standard_rate),
    lateStandardRate: Number(configuration.late_standard_rate),
    heavyParcelRate: earlyBulky,
    regularHeavyRate: record.regular_heavy_rate !== undefined && record.regular_heavy_rate !== null ? Number(record.regular_heavy_rate) : earlyBulky,
    lateHeavyRate: record.late_heavy_rate !== undefined && record.late_heavy_rate !== null ? Number(record.late_heavy_rate) : earlyBulky,
    heavyThresholdKg: Number(configuration.heavy_threshold_kg),
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
      pushToast({ title: 'Unable to load parcel rates', description: loadError instanceof Error ? loadError.message : 'Please try again.', tone: 'error' });
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

  const currentBulky = useMemo(() => {
    if (!current) return { early: 0, regular: 0, late: 0 };
    const rec = current as unknown as Record<string, unknown>;
    const early = Number(current.heavy_parcel_rate);
    const regular = rec.regular_heavy_rate !== undefined && rec.regular_heavy_rate !== null ? Number(rec.regular_heavy_rate) : early;
    const late = rec.late_heavy_rate !== undefined && rec.late_heavy_rate !== null ? Number(rec.late_heavy_rate) : early;
    return { early, regular, late };
  }, [current]);

  const smallProgressionError = useMemo(() => {
    if (input.regularStandardRate > input.earlyStandardRate) {
      return 'Invalid rate progression. The 8:01–9:00 AM rate cannot exceed the ≤8:00 AM rate under the current parcel compensation policy.';
    }
    if (input.lateStandardRate > input.regularStandardRate) {
      return 'Invalid rate progression. The >9:00 AM rate cannot exceed the 8:01–9:00 AM rate under the current parcel compensation policy.';
    }
    return null;
  }, [input.earlyStandardRate, input.regularStandardRate, input.lateStandardRate]);

  const bulkyProgressionError = useMemo(() => {
    if (input.regularHeavyRate > input.heavyParcelRate) {
      return 'Invalid rate progression. The 8:01–9:00 AM bulky rate cannot exceed the ≤8:00 AM rate under the current parcel compensation policy.';
    }
    if (input.lateHeavyRate > input.regularHeavyRate) {
      return 'Invalid rate progression. The >9:00 AM bulky rate cannot exceed the 8:01–9:00 AM rate under the current parcel compensation policy.';
    }
    return null;
  }, [input.heavyParcelRate, input.regularHeavyRate, input.lateHeavyRate]);

  const isProgressionInvalid = Boolean(smallProgressionError || bulkyProgressionError);

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

  if (loading) return <ParcelRatesSkeleton />;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Top Toolbar */}
      <div className="ui-toolbar flex flex-col gap-4 p-4 md:p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Parcel Rate Schedule</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Authoritative time-based parcel compensation used by rider payroll calculations.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="ui-button-primary inline-flex h-10 items-center justify-center gap-2 px-4 text-xs font-bold"
          >
            <Plus className="h-4 w-4" /> Create Future Rates
          </button>
        )}
      </div>

      {/* Current Rate Schedule Matrix Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Rate Schedule Matrix Table Card */}
        <div className="ui-card p-5 lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Current Active Rates
            </div>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${current?.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
              {current?.active ? 'Active' : 'No active configuration'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 font-bold">Time In</th>
                  <th className="py-2 font-bold">Small Parcel Rate</th>
                  <th className="py-2 font-bold">Bulky Parcel Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-semibold">
                <tr>
                  <td className="py-2.5 text-muted-foreground">≤ 8:00 AM (Early)</td>
                  <td className="py-2.5 font-bold text-foreground">{current ? peso.format(current.early_standard_rate) : '—'}</td>
                  <td className="py-2.5 font-bold text-foreground">{current ? peso.format(currentBulky.early) : '—'}</td>
                </tr>
                <tr>
                  <td className="py-2.5 text-muted-foreground">8:01–9:00 AM (Regular)</td>
                  <td className="py-2.5 font-bold text-foreground">{current ? peso.format(current.regular_standard_rate) : '—'}</td>
                  <td className="py-2.5 font-bold text-foreground">{current ? peso.format(currentBulky.regular) : '—'}</td>
                </tr>
                <tr>
                  <td className="py-2.5 text-muted-foreground">&gt; 9:00 AM (Late)</td>
                  <td className="py-2.5 font-bold text-foreground">{current ? peso.format(current.late_standard_rate) : '—'}</td>
                  <td className="py-2.5 font-bold text-foreground">{current ? peso.format(currentBulky.late) : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Configuration Metadata Card */}
        <div className="ui-card p-5 space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2.5">
            Policy Details
          </div>
          <div className="space-y-3 text-xs">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Bulky Threshold</div>
              <div className="mt-0.5 text-sm font-bold text-foreground">
                {current ? `Above ${current.heavy_threshold_kg} kg` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Effective Period</div>
              <div className="mt-0.5 font-medium text-foreground">
                {current ? `${formatDate(current.effective_from)} – ${formatDate(current.effective_until)}` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Policy Basis</div>
              <div className="mt-0.5 text-muted-foreground text-[11px] leading-relaxed">
                {current?.change_reason ?? 'Initial confirmed parcel configuration'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Protection Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p>
          <strong>Historical protection:</strong> rate changes never alter paid, disbursed, or finalized historical payroll. They apply strictly according to their effective dates.
        </p>
      </div>

      {/* Configuration History Table */}
      <section className="ui-card overflow-hidden" aria-labelledby="rate-history-heading">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <History className="h-4 w-4 text-primary" />
          <h3 id="rate-history-heading" className="text-sm font-bold text-foreground">Configuration History</h3>
          {!canManage && (
            <span className="ml-auto rounded-full border border-border bg-panel-bg px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              Read only
            </span>
          )}
        </div>
        <div className="table-scroll-region" role="region" aria-label="Parcel rate configuration history" tabIndex={0}>
          <table className="data-table-wide w-full text-left text-xs">
            <thead className="bg-panel-bg text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {['Effective period', 'Small (Early → Reg → Late)', 'Bulky (Early → Reg → Late)', 'Threshold', 'Status', 'Reason', 'Actions'].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-bold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedConfigurations.map((configuration) => {
                const isFuture = configuration.effective_from > localDateString();
                const rec = configuration as unknown as Record<string, unknown>;
                const earlyB = Number(configuration.heavy_parcel_rate);
                const regB = rec.regular_heavy_rate !== undefined && rec.regular_heavy_rate !== null ? Number(rec.regular_heavy_rate) : earlyB;
                const lateB = rec.late_heavy_rate !== undefined && rec.late_heavy_rate !== null ? Number(rec.late_heavy_rate) : earlyB;

                return (
                  <tr key={configuration.id} className="hover:bg-panel-bg/50">
                    <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                      {formatDate(configuration.effective_from)} – {formatDate(configuration.effective_until)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                      {peso.format(configuration.early_standard_rate)} → {peso.format(configuration.regular_standard_rate)} → {peso.format(configuration.late_standard_rate)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                      {peso.format(earlyB)} → {peso.format(regB)} → {peso.format(lateB)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">&gt; {configuration.heavy_threshold_kg} kg</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${configuration.active ? (isFuture ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700') : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                        {configuration.active ? (isFuture ? 'Scheduled' : 'Active') : 'Inactive'}
                      </span>
                    </td>
                    <td className="max-w-56 px-4 py-3 text-muted-foreground">{configuration.change_reason}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {canManage && isFuture && configuration.active ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(configuration)}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 font-semibold hover:bg-panel-bg"
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => { setDeactivating(configuration); setReason(''); setError(''); }}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 px-2 font-semibold text-red-600 hover:bg-red-50"
                          >
                            <Power className="h-3 w-3" /> Deactivate
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Append-only Rate Audit History */}
      {role === 'admin' && <section className="ui-card overflow-hidden" aria-labelledby="rate-audit-heading">
          <div className="border-b border-border px-5 py-4">
            <h3 id="rate-audit-heading" className="text-sm font-bold text-foreground">Rate-change Audit History</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Append-only record of previous and new effective-dated values.</p>
          </div>
          <div className="divide-y divide-border">
            {audit.length ? audit.slice(0, 50).map((entry) => (
              <div key={entry.id} className="space-y-2 px-5 py-3 text-xs">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  <span className="font-semibold text-foreground">{new Date(entry.changed_at).toLocaleString('en-PH')}</span>
                  <span className="capitalize text-foreground font-medium">{entry.action}</span>
                  <span className="text-foreground">By {entry.changedByName}</span>
                  <span className="text-muted-foreground">Effective {formatDate(entry.effective_date)}</span>
                </div>
                <p className="text-muted-foreground">{entry.reason}</p>
                <div className="grid gap-1 rounded-lg border border-border bg-panel-bg p-2 text-[10px] sm:grid-cols-2">
                  <span><strong>Previous:</strong> {auditRateSummary(entry.previous_values)}</span>
                  <span><strong>New:</strong> {auditRateSummary(entry.new_values)}</span>
                </div>
              </div>
            )) : (
              <p className="px-5 py-8 text-center text-xs text-muted-foreground">No audit entries available.</p>
            )}
          </div>
        </section>}

      {/* Editor Drawer */}
      <RightDrawer
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        dismissible={!saving}
        ariaLabelledBy="drawer-rate-title"
        ariaDescribedBy="drawer-rate-subtitle"
        widthClassName="max-w-[600px]"
        closeLabel="Close rate configuration drawer"
      >
        <div className="flex h-full flex-col">
          {/* Drawer Header */}
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-white px-5 py-4">
            <div className="min-w-0">
              <h2 id="drawer-rate-title" className="text-base font-bold text-foreground tracking-tight">
                {editing ? 'Edit Future Configuration' : 'Create Future Rate Configuration'}
              </h2>
              <p id="drawer-rate-subtitle" className="text-xs text-muted-foreground mt-0.5">
                Configure rates with early ≥ regular ≥ late progression.
              </p>
            </div>
            <button
              type="button"
              onClick={() => !saving && setEditorOpen(false)}
              disabled={saving}
              aria-label="Close panel"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-panel-bg hover:text-foreground transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto ar-scroll px-5 py-4 space-y-4 text-xs">
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200/90 bg-amber-50/70 p-3 text-xs text-amber-950 shadow-xs">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="space-y-0.5 leading-relaxed">
                <p className="font-bold text-amber-950">Effective-Dated Policy</p>
                <p className="text-amber-900/90 text-[11px]">
                  Rates become active strictly on the selected start date and never alter paid historical payroll.
                </p>
              </div>
            </div>

            {/* Section 1: Parcel Rate Schedule Matrix */}
            <div className="rounded-xl border border-border/80 bg-panel-bg/50 p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-border/60 pb-2 text-xs font-bold text-foreground">
                <Coins className="h-4 w-4 text-primary" />
                <span>Parcel Rate Schedule</span>
              </div>

              <div className="overflow-hidden rounded-lg border border-border bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-panel-bg/70 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3 font-bold">Time In</th>
                      <th className="py-2.5 px-3 font-bold">Small Parcel Rate</th>
                      <th className="py-2.5 px-3 font-bold">Bulky Parcel Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {/* Early Bracket */}
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-foreground whitespace-nowrap">
                        ≤ 8:00 AM
                      </td>
                      <td className="py-2 px-3">
                        <div className="relative rounded-md shadow-xs">
                          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs font-semibold text-muted-foreground">₱</span>
                          <input
                            id="earlyStandardRate"
                            aria-label="Small rate for Time In <= 8:00 AM"
                            type="number"
                            min="0"
                            step="0.01"
                            value={input.earlyStandardRate}
                            onChange={(e) => setInput((cur) => ({ ...cur, earlyStandardRate: Number(e.target.value) }))}
                            className="w-full rounded-md border border-border bg-white pl-6 pr-2 py-1.5 text-xs font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="relative rounded-md shadow-xs">
                          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs font-semibold text-muted-foreground">₱</span>
                          <input
                            id="earlyHeavyRate"
                            aria-label="Bulky rate for Time In <= 8:00 AM"
                            type="number"
                            min="0"
                            step="0.01"
                            value={input.heavyParcelRate}
                            onChange={(e) => setInput((cur) => ({ ...cur, heavyParcelRate: Number(e.target.value) }))}
                            className="w-full rounded-md border border-border bg-white pl-6 pr-2 py-1.5 text-xs font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </td>
                    </tr>

                    {/* Regular Bracket */}
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-foreground whitespace-nowrap">
                        8:01–9:00 AM
                      </td>
                      <td className="py-2 px-3">
                        <div className="relative rounded-md shadow-xs">
                          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs font-semibold text-muted-foreground">₱</span>
                          <input
                            id="regularStandardRate"
                            aria-label="Small rate for Time In 8:01-9:00 AM"
                            type="number"
                            min="0"
                            step="0.01"
                            value={input.regularStandardRate}
                            onChange={(e) => setInput((cur) => ({ ...cur, regularStandardRate: Number(e.target.value) }))}
                            className={`w-full rounded-md border bg-white pl-6 pr-2 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 ${input.regularStandardRate > input.earlyStandardRate ? 'border-red-400 bg-red-50/40 text-red-900 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-primary focus:ring-primary'}`}
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="relative rounded-md shadow-xs">
                          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs font-semibold text-muted-foreground">₱</span>
                          <input
                            id="regularHeavyRate"
                            aria-label="Bulky rate for Time In 8:01-9:00 AM"
                            type="number"
                            min="0"
                            step="0.01"
                            value={input.regularHeavyRate}
                            onChange={(e) => setInput((cur) => ({ ...cur, regularHeavyRate: Number(e.target.value) }))}
                            className={`w-full rounded-md border bg-white pl-6 pr-2 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 ${input.regularHeavyRate > input.heavyParcelRate ? 'border-red-400 bg-red-50/40 text-red-900 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-primary focus:ring-primary'}`}
                          />
                        </div>
                      </td>
                    </tr>

                    {/* Late Bracket */}
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-foreground whitespace-nowrap">
                        &gt; 9:00 AM
                      </td>
                      <td className="py-2 px-3">
                        <div className="relative rounded-md shadow-xs">
                          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs font-semibold text-muted-foreground">₱</span>
                          <input
                            id="lateStandardRate"
                            aria-label="Small rate for Time In > 9:00 AM"
                            type="number"
                            min="0"
                            step="0.01"
                            value={input.lateStandardRate}
                            onChange={(e) => setInput((cur) => ({ ...cur, lateStandardRate: Number(e.target.value) }))}
                            className={`w-full rounded-md border bg-white pl-6 pr-2 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 ${input.lateStandardRate > input.regularStandardRate ? 'border-red-400 bg-red-50/40 text-red-900 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-primary focus:ring-primary'}`}
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="relative rounded-md shadow-xs">
                          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs font-semibold text-muted-foreground">₱</span>
                          <input
                            id="lateHeavyRate"
                            aria-label="Bulky rate for Time In > 9:00 AM"
                            type="number"
                            min="0"
                            step="0.01"
                            value={input.lateHeavyRate}
                            onChange={(e) => setInput((cur) => ({ ...cur, lateHeavyRate: Number(e.target.value) }))}
                            className={`w-full rounded-md border bg-white pl-6 pr-2 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 ${input.lateHeavyRate > input.regularHeavyRate ? 'border-red-400 bg-red-50/40 text-red-900 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-primary focus:ring-primary'}`}
                          />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Inline Small Progression Error */}
              {smallProgressionError && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] font-medium text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <span>{smallProgressionError}</span>
                </div>
              )}

              {/* Inline Bulky Progression Error */}
              {bulkyProgressionError && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] font-medium text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <span>{bulkyProgressionError}</span>
                </div>
              )}

              {/* Bulky Threshold Input */}
              <div className="pt-2">
                <label htmlFor="heavyThresholdKg" className="block text-[11px] font-semibold text-foreground">
                  Bulky Threshold (kg) <span className="text-primary">*</span>
                </label>
                <div className="relative rounded-lg shadow-xs max-w-xs mt-1">
                  <input
                    id="heavyThresholdKg"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={input.heavyThresholdKg}
                    onChange={(e) => setInput((cur) => ({ ...cur, heavyThresholdKg: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-semibold text-muted-foreground">
                    kg
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Minimum weight required to classify parcel as bulky.</p>
              </div>
            </div>

            {/* Section 2: Effective Schedule */}
            <div className="rounded-xl border border-border/80 bg-panel-bg/50 p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-border/60 pb-2 text-xs font-bold text-foreground">
                <Calendar className="h-4 w-4 text-primary" />
                <span>Effective Schedule</span>
              </div>
              <div className="space-y-1">
                <label htmlFor="effectiveFrom" className="block text-[11px] font-semibold text-foreground">
                  Effective From Date <span className="text-primary">*</span>
                </label>
                <input
                  id="effectiveFrom"
                  type="date"
                  min={localDateString(new Date(Date.now() + 86400000))}
                  value={input.effectiveFrom}
                  onChange={(e) => setInput((cur) => ({ ...cur, effectiveFrom: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-100 disabled:opacity-70"
                  disabled={Boolean(editing)}
                />
                <p className="text-[10px] text-muted-foreground">The date when this schedule automatically takes effect.</p>
              </div>
            </div>

            {/* Section 3: Reason for Change */}
            <div className="rounded-xl border border-border/80 bg-panel-bg/50 p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-border/60 pb-2 text-xs font-bold text-foreground">
                <FileText className="h-4 w-4 text-primary" />
                <span>Reason for Change</span>
              </div>
              <div className="space-y-1">
                <label htmlFor="changeReason" className="block text-[11px] font-semibold text-foreground">
                  Audit Rationale & Description <span className="text-primary">*</span>
                </label>
                <textarea
                  id="changeReason"
                  value={input.reason}
                  onChange={(e) => setInput((cur) => ({ ...cur, reason: e.target.value }))}
                  className="ar-textarea w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                  rows={3}
                  placeholder="Explain why rates are changing (e.g., Annual rate adjustment, fuel surcharge update, or company policy revision)..."
                />
              </div>
            </div>

            {/* General Error Alert */}
            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 shadow-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-border bg-white px-5 py-4">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              disabled={saving}
              className="h-9 rounded-lg border border-border bg-white px-4 text-xs font-semibold text-foreground hover:bg-panel-bg active:scale-[0.99] transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || isProgressionInvalid}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-bold text-white shadow-xs hover:bg-primary-hover active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{editing ? 'Update Configuration' : 'Save Configuration'}</span>
            </button>
          </div>
        </div>
      </RightDrawer>

      {/* Deactivate Modal */}
      <Modal
        open={Boolean(deactivating)}
        onClose={() => !saving && setDeactivating(null)}
        title="Deactivate future configuration"
        subtitle="Only scheduled configurations can be deactivated."
        size="sm"
        dismissible={!saving}
      >
        <label className="space-y-1 text-xs font-semibold text-foreground">
          Reason *
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="ar-textarea"
            rows={3}
          />
        </label>
        {error && <p role="alert" className="mt-3 text-xs font-medium text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeactivating(null)}
            disabled={saving}
            className="h-9 rounded-md border border-border px-4 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDeactivate()}
            disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-red-600 px-4 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Deactivate
          </button>
        </div>
      </Modal>
    </div>
  );
}
