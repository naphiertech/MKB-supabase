import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  RefreshCw,
  Save,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../components/common/Modal';
import { StatePanel, StatusBadge, SummaryCard } from '../components/common/DashboardPrimitives';
import { useHub } from '../context/HubContext';
import { getRiderWorkforceDirectory, type WorkforceDirectoryEntry } from '../services/workforce/workforceDirectoryService';
import {
  addBusinessDays,
  cancelRiderSchedule,
  createRiderSchedule,
  getManilaBusinessDate,
  listRiderSchedules,
  publishRiderSchedule,
  startOfBusinessWeek,
  updateRiderSchedule,
  validateRiderScheduleDraft,
  type RiderSchedule,
  type RiderScheduleDayKind,
} from '../services/workforce/riderScheduleService';

const DAY_LABEL = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const RANGE_LABEL = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

interface ScheduleEditorState {
  scheduleId?: string;
  expectedRevision?: number;
  riderId: string;
  workDate: string;
  hubId: string;
  dayKind: RiderScheduleDayKind;
  startsAt: string | null;
  endsAt: string | null;
  status?: RiderSchedule['status'];
  reason: string;
}

function formatDate(value: string): string {
  return DAY_LABEL.format(new Date(`${value}T00:00:00Z`));
}

function formatRange(fromDate: string, toDate: string): string {
  return `${RANGE_LABEL.format(new Date(`${fromDate}T00:00:00Z`))} – ${RANGE_LABEL.format(new Date(`${toDate}T00:00:00Z`))}`;
}

function statusTone(status: RiderSchedule['status']) {
  if (status === 'published') return 'success' as const;
  if (status === 'cancelled') return 'danger' as const;
  return 'warning' as const;
}

function cellText(schedule: RiderSchedule | undefined): string {
  if (!schedule) return 'Add schedule';
  if (schedule.dayKind === 'day_off') return 'Day Off';
  return `${schedule.startsAt ?? '—'}–${schedule.endsAt ?? '—'}`;
}

export function RiderScheduling() {
  const { hubs, selectedHubId } = useHub();
  const [weekStart, setWeekStart] = useState(() => startOfBusinessWeek(getManilaBusinessDate()));
  const [riders, setRiders] = useState<WorkforceDirectoryEntry[]>([]);
  const [schedules, setSchedules] = useState<RiderSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editor, setEditor] = useState<ScheduleEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addBusinessDays(weekStart, index)),
    [weekStart],
  );
  const activeHubs = useMemo(() => hubs.filter((hub) => hub.active), [hubs]);
  const scheduleMap = useMemo(() => {
    const map = new Map<string, RiderSchedule>();
    schedules.forEach((schedule) => map.set(`${schedule.riderId}:${schedule.workDate}`, schedule));
    return map;
  }, [schedules]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [directory, scheduleRows] = await Promise.all([
        getRiderWorkforceDirectory({ scope: 'active' }),
        listRiderSchedules({
          fromDate: weekStart,
          toDate: addBusinessDays(weekStart, 6),
          hubId: selectedHubId,
        }),
      ]);
      setRiders(directory);
      setSchedules(scheduleRows);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load Rider schedules.');
    } finally {
      setLoading(false);
    }
  }, [selectedHubId, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const publishedCount = schedules.filter((schedule) => schedule.status === 'published').length;
  const draftCount = schedules.filter((schedule) => schedule.status === 'draft').length;
  const dayOffCount = schedules.filter((schedule) => schedule.dayKind === 'day_off').length;

  function openEditor(rider: WorkforceDirectoryEntry, workDate: string) {
    const existing = scheduleMap.get(`${rider.id}:${workDate}`);
    setEditorError(null);
    setEditor(existing ? {
      scheduleId: existing.id,
      expectedRevision: existing.revision,
      riderId: existing.riderId,
      workDate: existing.workDate,
      hubId: existing.hubId,
      dayKind: existing.dayKind,
      startsAt: existing.startsAt,
      endsAt: existing.endsAt,
      status: existing.status,
      reason: '',
    } : {
      riderId: rider.id,
      workDate,
      hubId: selectedHubId ?? rider.hubId ?? activeHubs[0]?.id ?? '',
      dayKind: 'work',
      startsAt: '08:00',
      endsAt: '17:00',
      reason: '',
    });
  }

  function updateEditor(patch: Partial<ScheduleEditorState>) {
    setEditor((current) => current ? { ...current, ...patch } : current);
    setEditorError(null);
  }

  async function saveEditor() {
    if (!editor) return;
    const input = {
      riderId: editor.riderId,
      workDate: editor.workDate,
      hubId: editor.hubId,
      dayKind: editor.dayKind,
      startsAt: editor.startsAt,
      endsAt: editor.endsAt,
    };
    const validation = validateRiderScheduleDraft(input);
    if (validation) {
      setEditorError(validation);
      return;
    }
    if (editor.reason.trim().length < 3) {
      setEditorError('Add a short reason so the change has an immutable audit record.');
      return;
    }

    setSaving(true);
    setEditorError(null);
    try {
      if (editor.scheduleId && editor.expectedRevision !== undefined) {
        await updateRiderSchedule({
          ...input,
          scheduleId: editor.scheduleId,
          expectedRevision: editor.expectedRevision,
          reason: editor.reason,
        });
        toast.success(editor.status === 'published' ? 'Published schedule updated.' : 'Draft schedule updated.');
      } else {
        await createRiderSchedule({ ...input, reason: editor.reason });
        toast.success('Draft schedule created.');
      }
      setEditor(null);
      await load();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Unable to save the schedule.');
    } finally {
      setSaving(false);
    }
  }

  async function publishEditor() {
    if (!editor?.scheduleId || editor.expectedRevision === undefined) return;
    if (editor.reason.trim().length < 3) {
      setEditorError('Add a short reason before publishing.');
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      await publishRiderSchedule(editor.scheduleId, editor.expectedRevision, editor.reason);
      toast.success('Schedule published to the Rider.');
      setEditor(null);
      await load();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Unable to publish the schedule.');
    } finally {
      setSaving(false);
    }
  }

  async function cancelEditor() {
    if (!editor?.scheduleId || editor.expectedRevision === undefined) return;
    if (editor.reason.trim().length < 3) {
      setEditorError('Add a cancellation reason.');
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      await cancelRiderSchedule(editor.scheduleId, editor.expectedRevision, editor.reason);
      toast.success('Schedule cancelled.');
      setEditor(null);
      await load();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Unable to cancel the schedule.');
    } finally {
      setSaving(false);
    }
  }

  if (loading && schedules.length === 0) {
    return <StatePanel loading title="Loading Rider Scheduling" description="Preparing the authorized workforce calendar." />;
  }

  if (loadError && schedules.length === 0) {
    return (
      <StatePanel
        icon={CalendarDays}
        title="Unable to load Rider Scheduling"
        description={loadError}
        action={(
          <button type="button" onClick={() => void load()} className="ui-button-primary inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
          </button>
        )}
      />
    );
  }

  return (
    <div className="dashboard-page min-w-0 space-y-5">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard icon={CalendarDays} label="Published" value={publishedCount} helper="Visible to affected Riders" tone="success" />
        <SummaryCard icon={CalendarPlus} label="Drafts" value={draftCount} helper="Still editable by scheduling staff" tone="warning" />
        <SummaryCard icon={Clock3} label="Day Off" value={dayOffCount} helper="Within the displayed week" tone="info" />
      </section>

      <section className="ui-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="ui-eyebrow">Workforce planning</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Rider Scheduling</h1>
            <p className="mt-1 text-sm text-muted-foreground">Plan one Work or Day Off entry per Rider and Manila business date.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setWeekStart(addBusinessDays(weekStart, -7))} className="ui-button-secondary inline-flex items-center gap-1.5" aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
            </button>
            <button type="button" onClick={() => setWeekStart(startOfBusinessWeek(getManilaBusinessDate()))} className="ui-button-secondary">This week</button>
            <button type="button" onClick={() => setWeekStart(addBusinessDays(weekStart, 7))} className="ui-button-secondary inline-flex items-center gap-1.5" aria-label="Next week">
              Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span>Displayed range: {formatRange(weekStart, addBusinessDays(weekStart, 6))}</span>
          <span>Scheduling does not change attendance or payroll rules.</span>
        </div>

        {loadError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{loadError}</p>}

        {riders.length === 0 ? (
          <StatePanel icon={CalendarDays} title="No active Riders in this workspace" description="Change the Hub workspace or add an active Rider before creating a schedule." compact />
        ) : (
          <div className="table-scroll-region overflow-x-auto rounded-xl border border-border" role="region" aria-label="Rider scheduling calendar" tabIndex={0}>
            <table className="min-w-[60rem] w-full text-sm">
              <thead className="bg-panel-bg text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-10 min-w-48 bg-panel-bg px-4 py-3 text-left font-semibold">Rider</th>
                  {weekDates.map((date) => (
                    <th key={date} className="min-w-32 px-3 py-3 text-left font-semibold">{formatDate(date)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {riders.map((rider) => (
                  <tr key={rider.id} className="align-top hover:bg-panel-bg/50">
                    <th scope="row" className="sticky left-0 z-[1] min-w-48 bg-white px-4 py-3 text-left">
                      <p className="font-semibold text-foreground">{rider.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{rider.mkb_id}</p>
                    </th>
                    {weekDates.map((date) => {
                      const schedule = scheduleMap.get(`${rider.id}:${date}`);
                      return (
                        <td key={date} className="min-w-32 px-2 py-2">
                          <button
                            type="button"
                            onClick={() => openEditor(rider, date)}
                            className={`min-h-16 w-full rounded-lg border p-2 text-left transition hover:border-primary/50 hover:bg-accent/40 ${schedule?.status === 'cancelled' ? 'border-rose-200 bg-rose-50/50' : schedule?.status === 'published' ? 'border-emerald-200 bg-emerald-50/50' : schedule ? 'border-amber-200 bg-amber-50/50' : 'border-dashed border-border bg-panel-bg/40'}`}
                          >
                            <span className="block text-xs font-semibold text-foreground">{cellText(schedule)}</span>
                            {schedule ? <StatusBadge tone={statusTone(schedule.status)} className="mt-1 capitalize">{schedule.status}</StatusBadge> : <span className="mt-1 block text-[10px] text-muted-foreground">Create draft</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={Boolean(editor)}
        onClose={() => !saving && setEditor(null)}
        title={editor?.scheduleId ? 'Edit Rider Schedule' : 'Create Draft Schedule'}
        subtitle={editor ? `${riders.find((rider) => rider.id === editor.riderId)?.name ?? 'Rider'} · ${formatDate(editor.workDate)}` : undefined}
        size="lg"
        dismissible={!saving}
      >
        {editor && (
          <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-semibold text-foreground">
                Planned operational Hub
                <select value={editor.hubId} onChange={(event) => updateEditor({ hubId: event.target.value })} className="ui-control mt-1.5 min-h-11" disabled={saving}>
                  <option value="">Select an active Hub</option>
                  {activeHubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-xs font-semibold text-foreground">
                Plan type
                <select
                  value={editor.dayKind}
                  onChange={(event) => {
                    const dayKind = event.target.value as RiderScheduleDayKind;
                    updateEditor({ dayKind, startsAt: dayKind === 'work' ? (editor.startsAt ?? '08:00') : null, endsAt: dayKind === 'work' ? (editor.endsAt ?? '17:00') : null });
                  }}
                  className="ui-control mt-1.5 min-h-11"
                  disabled={saving}
                >
                  <option value="work">Work</option>
                  <option value="day_off">Day Off</option>
                </select>
              </label>
            </div>

            {editor.dayKind === 'work' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs font-semibold text-foreground">
                  Planned start
                  <input type="time" value={editor.startsAt ?? ''} onChange={(event) => updateEditor({ startsAt: event.target.value || null })} className="ui-control mt-1.5 min-h-11" disabled={saving} />
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-foreground">
                  Planned end
                  <input type="time" value={editor.endsAt ?? ''} onChange={(event) => updateEditor({ endsAt: event.target.value || null })} className="ui-control mt-1.5 min-h-11" disabled={saving} />
                </label>
              </div>
            ) : (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">Day Off contains no working interval. Attendance behavior is unchanged until the later integration phase.</div>
            )}

            <label className="block space-y-1.5 text-xs font-semibold text-foreground">
              Reason for this change
              <textarea value={editor.reason} onChange={(event) => updateEditor({ reason: event.target.value })} className="ui-textarea mt-1.5 min-h-24 w-full" placeholder="Describe the staffing reason for this schedule change." disabled={saving} />
            </label>

            {editorError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{editorError}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <div className="flex flex-wrap gap-2">
                {editor.scheduleId && editor.status === 'draft' && (
                  <button type="button" onClick={() => void publishEditor()} disabled={saving} className="ui-button-primary inline-flex items-center gap-2">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Publish
                  </button>
                )}
                {editor.scheduleId && editor.status !== 'cancelled' && (
                  <button type="button" onClick={() => void cancelEditor()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                    <X className="h-4 w-4" aria-hidden="true" /> Cancel schedule
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditor(null)} disabled={saving} className="ui-button-secondary">Close</button>
                {editor.status !== 'cancelled' && (
                  <button type="button" onClick={() => void saveEditor()} disabled={saving} className="ui-button-primary inline-flex items-center gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                    {editor.scheduleId ? 'Save changes' : 'Save draft'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
