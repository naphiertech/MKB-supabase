import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PackageCheck,
  Weight,
  TrendingUp,
  Coins,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Calendar,
  Clock,
  FileSpreadsheet,
  PencilLine,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  Wallet,
} from 'lucide-react';
import {
  getPayrollWeek,
  nextPayrollWeek,
  previousPayrollWeek,
  WEEKLY_PAYROLL_START_DATE,
  type PayrollWeekPeriod,
} from '../lib/payroll/payrollCalendar';
import {
  type RiderParcelDailyEntry,
  type RiderParcelPeriodStatus,
  type RiderParcelPeriodView,
} from '../lib/parcels/riderParcelsModel';
import { loadRiderParcelPeriod } from '../services/parcels/riderParcelService';
import { useParcelLogsRealtimeVersion } from '../hooks/useParcelLogsRealtimeVersion';
import { RiderParcelsSkeleton } from '../components/rider/RiderRouteSkeletons';

interface RiderParcelsProps {
  userId: string;
  riderId?: string;
  onOpenPayouts?: () => void;
}

function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDayHeading(dateStr: string): { shortDate: string; weekday: string } {
  const parsed = new Date(`${dateStr}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { shortDate: dateStr, weekday: '' };
  }
  return {
    shortDate: parsed.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'Asia/Manila',
    }),
    weekday: parsed.toLocaleDateString('en-PH', {
      weekday: 'short',
      timeZone: 'Asia/Manila',
    }),
  };
}

function statusBadgeClass(status: RiderParcelPeriodStatus): string {
  if (status.code === 'paid') {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  if (status.code === 'approved') {
    return 'bg-sky-50 text-sky-800 border-sky-200';
  }
  return 'bg-amber-50 text-amber-800 border-amber-200';
}

function SourceBadge({ source }: { source: RiderParcelDailyEntry['source'] }) {
  if (source === 'fms_import') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-accent px-2 py-0.5 text-[10px] font-semibold text-primary">
        <FileSpreadsheet className="h-3 w-3 shrink-0" />
        FMS Import
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-panel-bg px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      <PencilLine className="h-3 w-3 shrink-0" />
      Manual Entry
    </span>
  );
}

export function RiderParcels({ userId, riderId, onOpenPayouts }: RiderParcelsProps) {
  const activeRiderId = riderId || userId;
  const currentWeek = useMemo(() => getPayrollWeek(), []);
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollWeekPeriod>(currentWeek);
  const [view, setView] = useState<RiderParcelPeriodView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const realtimeVersion = useParcelLogsRealtimeVersion(
    activeRiderId,
    selectedPeriod.cutoff_start,
    selectedPeriod.cutoff_end,
    Boolean(activeRiderId),
  );

  const loadPeriod = useCallback(
    async (silent = false) => {
      if (!activeRiderId) return;
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const result = await loadRiderParcelPeriod({
          userId,
          riderId: activeRiderId,
          period: selectedPeriod,
        });
        setView(result);
      } catch (err) {
        console.error('[RiderParcels] Failed to load parcel records:', err);
        setError('Unable to load your delivered parcel records. Check your connection and try again.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeRiderId, selectedPeriod, userId],
  );

  useEffect(() => {
    void loadPeriod(false);
  }, [loadPeriod]);

  useEffect(() => {
    if (realtimeVersion > 0) {
      void loadPeriod(true);
    }
  }, [realtimeVersion, loadPeriod]);

  const isCurrentWeek = selectedPeriod.cutoff_start === currentWeek.cutoff_start;
  const canGoPrev = previousPayrollWeek(selectedPeriod).cutoff_start >= WEEKLY_PAYROLL_START_DATE;
  const canGoNext = nextPayrollWeek(selectedPeriod).cutoff_start <= currentWeek.cutoff_start;

  if (loading && !view) {
    return <RiderParcelsSkeleton />;
  }

  return (
    <div className="p-4 md:p-6 lg:p-7 max-w-5xl mx-auto space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-accent px-2.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-primary">
            <PackageCheck className="h-3 w-3" />
            Delivery Transparency
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            My Parcels
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Daily delivered parcel counts, applied rate tiers, and estimated delivery earnings for each cutoff week.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {view && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusBadgeClass(view.status)}`}
            >
              {view.status.isFinalized ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              {view.status.label}
            </span>
          )}
          <button
            type="button"
            onClick={() => void loadPeriod(true)}
            disabled={refreshing}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-white px-3.5 py-2 text-xs font-semibold text-foreground transition hover:bg-panel-bg disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* 2. Weekly Cutoff Stepper */}
      <section className="ui-card p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous cutoff week"
            disabled={!canGoPrev}
            onClick={() => setSelectedPeriod((prev) => previousPayrollWeek(prev))}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-white text-foreground transition hover:bg-panel-bg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex-1 sm:flex-initial px-2">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span>Cutoff Week (Mon–Sun)</span>
              {isCurrentWeek && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  Current
                </span>
              )}
            </div>
            <div className="text-sm sm:text-base font-bold text-foreground font-mono">
              {selectedPeriod.label}
            </div>
          </div>

          <button
            type="button"
            aria-label="Next cutoff week"
            disabled={!canGoNext}
            onClick={() => setSelectedPeriod((prev) => nextPayrollWeek(prev))}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-white text-foreground transition hover:bg-panel-bg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={() => setSelectedPeriod(currentWeek)}
              className="inline-flex min-h-11 items-center rounded-lg border border-primary/25 bg-accent px-3 py-2 text-xs font-semibold text-primary transition hover:bg-accent/80 cursor-pointer"
            >
              This Week
            </button>
          )}
          {onOpenPayouts && (
            <button
              type="button"
              onClick={onOpenPayouts}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-panel-bg px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-white cursor-pointer"
            >
              <Wallet className="h-3.5 w-3.5 text-primary" />
              My Payouts
            </button>
          )}
        </div>
      </section>

      {/* 3. Offline Snapshot Banner */}
      {view?.isOfflineSnapshot && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
        >
          <WifiOff className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
          <div>
            <span className="font-semibold">Offline snapshot shown.</span>{' '}
            {view.cachedAt
              ? `Last synced ${new Date(view.cachedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
              : 'Reconnect to sync latest updates from dispatch.'}
          </div>
        </div>
      )}

      {/* 4. Error Banner */}
      {error && (
        <div
          role="alert"
          className="ui-card border-red-200 bg-red-50/70 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 text-xs sm:text-sm text-red-900">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadPeriod(false)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover cursor-pointer"
          >
            Try Again
          </button>
        </div>
      )}

      {/* 5. Summary KPI Strip */}
      {view && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="ui-card p-4 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span>Total Delivered</span>
              <PackageCheck className="h-4 w-4 text-primary" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-foreground">
              {view.summary.totalDelivered.toLocaleString()}
              <span className="ml-1 text-xs font-normal text-muted-foreground">pcs</span>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              Std {view.summary.standardDelivered} · Heavy {view.summary.heavyDelivered}
            </div>
          </div>

          <div className="ui-card p-4 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span>Heavy Parcels</span>
              <Weight className="h-4 w-4 text-primary" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-foreground">
              {view.summary.heavyDelivered.toLocaleString()}
              <span className="ml-1 text-xs font-normal text-muted-foreground">pcs</span>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {formatPeso(view.summary.heavyEarnings)} heavy pay
            </div>
          </div>

          <div className="ui-card p-4 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span>Delivery Success</span>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-foreground">
              {view.summary.successRate !== null ? `${view.summary.successRate}%` : '—'}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {view.summary.assigned !== null
                ? `${view.summary.assigned} assigned · ${view.summary.failed} failed`
                : `${view.summary.failed} failed · ${view.summary.returned} returned`}
            </div>
          </div>

          <div className="ui-card p-4 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span>Delivery Earnings</span>
              <Coins className="h-4 w-4 text-primary" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-primary">
              {formatPeso(view.summary.totalDeliveryGross)}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {view.status.isFinalized ? 'Finalized gross' : 'Pre-payroll estimate'} · {view.summary.activeDays}d
            </div>
          </div>
        </section>
      )}

      {/* 6. Daily Parcel Breakdown */}
      {view && (
        <section className="ui-card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border px-4 py-3.5 sm:px-5">
            <div>
              <h2 className="text-sm font-bold text-foreground">Daily Parcel Breakdown</h2>
              <p className="text-xs text-muted-foreground">
                Showing {view.days.length} recorded delivery {view.days.length === 1 ? 'day' : 'days'} in this cutoff week.
              </p>
            </div>
            <div className="text-[11px] font-mono text-muted-foreground">
              Std {formatPeso(view.summary.standardEarnings)} + Heavy {formatPeso(view.summary.heavyEarnings)}
            </div>
          </div>

          {view.days.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-2">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border bg-panel-bg text-muted-foreground">
                <PackageCheck className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                No delivered parcels recorded for this cutoff
              </h3>
              <p className="mx-auto max-w-md text-xs text-muted-foreground">
                Daily counts appear here automatically once HR or Admin records your deliveries or confirms an FMS delivery import.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile cards (< md) */}
              <div className="divide-y divide-border md:hidden">
                {view.days.map((day) => {
                  const { shortDate, weekday } = formatDayHeading(day.date);
                  return (
                    <article key={day.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-foreground">{shortDate}</span>
                            {weekday && (
                              <span className="text-xs font-mono text-muted-foreground">({weekday})</span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <SourceBadge source={day.source} />
                            {day.timeInLabel && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-800">
                                <Clock className="h-2.5 w-2.5" />
                                In {day.timeInLabel}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-base font-bold font-mono text-primary">
                            {formatPeso(day.dailyGross)}
                          </div>
                          <div className="text-[11px] font-mono text-muted-foreground">
                            {day.totalDelivered} delivered
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-panel-bg p-2.5 text-xs font-mono">
                        <div>
                          <div className="text-[10px] text-muted-foreground">Standard</div>
                          <div className="font-semibold text-foreground">
                            {day.standardDelivered} × {formatPeso(day.standardRate)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">Heavy</div>
                          <div className="font-semibold text-foreground">
                            {day.heavyDelivered} × {formatPeso(day.heavyRate)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">Success</div>
                          <div className="font-semibold text-foreground">
                            {day.successRate !== null ? `${day.successRate}%` : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-muted-foreground">
                        <span>
                          {day.assigned !== null ? `Assigned ${day.assigned} · ` : ''}
                          Failed {day.failed} · Returned {day.returned}
                        </span>
                        <span>Gross {formatPeso(day.dailyGross)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Desktop table (md+) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-panel-bg text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-2.5 px-4 text-left font-medium">Date &amp; Time-In</th>
                      <th className="py-2.5 px-3 text-right font-medium">Standard</th>
                      <th className="py-2.5 px-3 text-right font-medium">Heavy</th>
                      <th className="py-2.5 px-3 text-right font-medium">Delivered</th>
                      <th className="py-2.5 px-3 text-right font-medium">Assigned / Issues</th>
                      <th className="py-2.5 px-3 text-right font-medium">Applied Rate</th>
                      <th className="py-2.5 px-3 text-right font-medium">Daily Gross</th>
                      <th className="py-2.5 px-4 text-right font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {view.days.map((day) => {
                      const { shortDate, weekday } = formatDayHeading(day.date);
                      return (
                        <tr key={day.id} className="hover:bg-panel-bg/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-foreground">
                              {shortDate}{' '}
                              <span className="font-mono font-normal text-muted-foreground">
                                {weekday}
                              </span>
                            </div>
                            {day.timeInLabel ? (
                              <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700">
                                <Clock className="h-3 w-3" />
                                Time-In {day.timeInLabel}
                              </div>
                            ) : (
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                No Time-In recorded
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold text-foreground">
                            {day.standardDelivered}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold text-foreground">
                            {day.heavyDelivered}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-foreground">
                            {day.totalDelivered}
                            {day.successRate !== null && (
                              <div className="text-[10px] font-normal text-emerald-700">
                                {day.successRate}% rate
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                            <div>{day.assigned !== null ? `${day.assigned} assigned` : '—'}</div>
                            <div className="text-[10px]">
                              {day.failed} failed · {day.returned} ret
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                            <div>{formatPeso(day.standardRate)}/std</div>
                            {day.heavyRate > 0 && (
                              <div className="text-[10px]">{formatPeso(day.heavyRate)}/heavy</div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-primary">
                            {formatPeso(day.dailyGross)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <SourceBadge source={day.source} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* 7. Transparency Notice */}
      <div className="rounded-xl border border-border bg-white px-4 py-3 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <span>
          <strong className="text-foreground">How delivery pay is calculated:</strong> Daily Gross = (Standard × Rate Tier) + (Heavy × Heavy Rate). Adjustments and deductions are itemized under My Payouts once payroll closes.
        </span>
      </div>
    </div>
  );
}
