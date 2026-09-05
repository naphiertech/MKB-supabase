import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  RefreshCw,
} from 'lucide-react';
import { StatePanel, StatusBadge } from '../components/common/DashboardPrimitives';
import { RiderScheduleSkeleton } from '../components/rider/RiderRouteSkeletons';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import {
  addBusinessDays,
  getCachedRiderSchedules,
  getManilaBusinessDate,
  listRiderSchedules,
  setCachedRiderSchedules,
  startOfBusinessWeek,
  type RiderSchedule,
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

interface RiderScheduleProps {
  userId: string;
  riderId: string;
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

function scheduleSummary(schedule: RiderSchedule): string {
  if (schedule.dayKind === 'day_off') return 'Day Off';
  return `${schedule.startsAt ?? '—'} – ${schedule.endsAt ?? '—'}`;
}

export function RiderSchedule({ userId, riderId }: RiderScheduleProps) {
  const isOnline = useNetworkStatus();
  const [weekStart, setWeekStart] = useState(() => startOfBusinessWeek(getManilaBusinessDate()));
  const [schedules, setSchedules] = useState<RiderSchedule[]>([]);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [showCachedState, setShowCachedState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addBusinessDays(weekStart, index)),
    [weekStart],
  );

  useEffect(() => {
    let active = true;
    const fromDate = weekStart;
    const toDate = addBusinessDays(weekStart, 6);

    async function load() {
      setLoading(true);
      setError(null);
      const cached = await getCachedRiderSchedules(userId, riderId, fromDate, toDate);
      if (active && cached) {
        setSchedules(cached.schedules);
        setCachedAt(cached.cachedAt);
        setShowCachedState(true);
        setLoading(false);
      }

      if (!isOnline) {
        if (active && !cached) setError('This week is not available offline yet. Connect once to cache your schedule.');
        if (active && cached) setError(null);
        if (active && !cached) setLoading(false);
        return;
      }

      try {
        const fresh = await listRiderSchedules({ fromDate, toDate, riderId });
        if (!active) return;
        const nextCachedAt = new Date().toISOString();
        setSchedules(fresh);
        setCachedAt(nextCachedAt);
        setShowCachedState(false);
        setLoading(false);
        setError(null);
        await setCachedRiderSchedules({
          userId,
          riderId,
          fromDate,
          toDate,
          schedules: fresh,
          cachedAt: nextCachedAt,
        });
      } catch (loadError) {
        if (!active) return;
        setLoading(false);
        if (!cached) setError(loadError instanceof Error ? loadError.message : 'Unable to load your schedule.');
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [isOnline, riderId, userId, weekStart]);

  const scheduleMap = useMemo(() => {
    const map = new Map<string, RiderSchedule>();
    schedules.forEach((schedule) => map.set(schedule.workDate, schedule));
    return map;
  }, [schedules]);

  const today = getManilaBusinessDate();
  const todaySchedule = scheduleMap.get(today);
  const upcoming = schedules.filter((schedule) => schedule.workDate >= today).slice(0, 4);

  if (loading && schedules.length === 0) {
    return <RiderScheduleSkeleton />;
  }

  if (error && schedules.length === 0) {
    return (
      <div className="dashboard-page mx-auto w-full max-w-4xl space-y-4">
        <StatePanel icon={isOnline ? CalendarDays : CloudOff} title="Schedule unavailable" description={error} action={isOnline ? <button type="button" onClick={() => window.location.reload()} className="ui-button-secondary inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry</button> : undefined} />
      </div>
    );
  }

  return (
    <div className="dashboard-page mx-auto w-full max-w-4xl space-y-5">
      <section className="ui-card overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="ui-eyebrow">Rider Portal</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">My Schedule</h1>
            <p className="mt-1 text-sm text-muted-foreground">Published planning information for your operational Hub.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {!isOnline && <><CloudOff className="h-4 w-4 text-amber-600" aria-hidden="true" /> Offline view</>}
            {cachedAt && <span>{showCachedState ? 'Cached copy · may be stale · ' : 'Updated '}{new Date(cachedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
          </div>
        </div>

        {todaySchedule ? (
          <div className="mt-5 rounded-xl border border-primary/20 bg-accent/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Today · {formatDate(today)}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{scheduleSummary(todaySchedule)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{todaySchedule.hubName}</p>
              </div>
              <StatusBadge tone={statusTone(todaySchedule.status)} size="md">{todaySchedule.status}</StatusBadge>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-border bg-panel-bg/60 p-4 text-sm text-muted-foreground">No published schedule entry exists for today. This does not change your attendance controls.</div>
        )}
      </section>

      {error && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>}

      <section className="ui-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="ui-section-title">Week agenda</h2>
            <p className="mt-1 text-xs text-muted-foreground">{formatRange(weekStart, addBusinessDays(weekStart, 6))}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setWeekStart(addBusinessDays(weekStart, -7))} className="ui-button-secondary inline-flex items-center gap-1.5" aria-label="Previous week"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</button>
            <button type="button" onClick={() => setWeekStart(startOfBusinessWeek(getManilaBusinessDate()))} className="ui-button-secondary">This week</button>
            <button type="button" onClick={() => setWeekStart(addBusinessDays(weekStart, 7))} className="ui-button-secondary inline-flex items-center gap-1.5" aria-label="Next week">Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </div>

        <div className="space-y-2">
          {weekDates.map((date) => {
            const schedule = scheduleMap.get(date);
            return (
              <article key={date} className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${date === today ? 'border-primary/30 bg-accent/30' : 'border-border bg-white'}`}>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground">{date === today ? 'Today · ' : ''}{formatDate(date)}</p>
                  {schedule ? <p className="mt-1 text-sm font-semibold text-foreground">{scheduleSummary(schedule)}</p> : <p className="mt-1 text-sm text-muted-foreground">No published schedule</p>}
                  {schedule && <p className="mt-1 text-xs text-muted-foreground">{schedule.hubName}</p>}
                </div>
                {schedule ? <StatusBadge tone={statusTone(schedule.status)} size="md">{schedule.status}</StatusBadge> : <span className="text-xs text-muted-foreground">Planning data only</span>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="ui-card space-y-3 p-4 sm:p-5">
        <div>
          <h2 className="ui-section-title">Upcoming published entries</h2>
          <p className="mt-1 text-xs text-muted-foreground">Your next available schedule entries are shown here.</p>
        </div>
        {upcoming.length === 0 ? <p className="rounded-lg bg-panel-bg px-3 py-3 text-sm text-muted-foreground">No upcoming published entries in this week.</p> : <div className="grid gap-2 sm:grid-cols-2">{upcoming.map((schedule) => <div key={schedule.id} className="rounded-lg border border-border bg-panel-bg/40 p-3"><div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold text-foreground">{formatDate(schedule.workDate)}</p><StatusBadge tone={statusTone(schedule.status)}>{schedule.status}</StatusBadge></div><p className="mt-1 text-sm font-semibold text-foreground">{scheduleSummary(schedule)}</p><p className="mt-1 text-xs text-muted-foreground">{schedule.hubName}</p></div>)}</div>}
      </section>
    </div>
  );
}
