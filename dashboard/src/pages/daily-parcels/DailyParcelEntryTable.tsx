import {
  ChevronDown,
  ChevronRight,
  Clock,
  Info,
  Loader2,
  MapPin,
  PackageCheck,
  Save,
} from 'lucide-react';
import { RiderAvatar } from '../../components/common/RiderAvatar';
import { StatusBadge as SemanticStatusBadge } from '../../components/common/DashboardPrimitives';
import { SkeletonTable } from '../../components/common/SkeletonPrimitives';
import {
  calculateParcelOperationalMetrics,
  type DailyParcelRow,
} from '../../services/operationsService';
import type { ParcelCountField } from './useDailyParcelDraft';

interface DailyParcelEntryTableProps {
  rows: DailyParcelRow[];
  absentRows: DailyParcelRow[];
  loading: boolean;
  totalEligibleCount: number;
  encodedCount: number;
  selectedDate: string;
  savingRowId: string | null;
  savingAll: boolean;
  absentCollapsed: boolean;
  onToggleAbsent: () => void;
  onParcelChange: (riderId: string, field: ParcelCountField, value: number) => void;
  onSaveRow: (row: DailyParcelRow) => void;
  onOpenDrawer: (row: DailyParcelRow) => void;
}

function StatusBadge({ status }: { status: DailyParcelRow['attendanceStatus'] }) {
  switch (status) {
    case 'present':
      return <SemanticStatusBadge tone="success" dot size="md">Present</SemanticStatusBadge>;
    case 'late':
      return <SemanticStatusBadge tone="warning" dot size="md">Late</SemanticStatusBadge>;
    case 'on_leave':
      return <SemanticStatusBadge tone="info" dot size="md">On Leave</SemanticStatusBadge>;
    case 'absent':
    default:
      return <SemanticStatusBadge tone="danger" dot size="md">Absent</SemanticStatusBadge>;
  }
}

export function DailyParcelEntryTable({
  rows,
  absentRows,
  loading,
  totalEligibleCount,
  encodedCount,
  selectedDate,
  savingRowId,
  savingAll,
  absentCollapsed,
  onToggleAbsent,
  onParcelChange,
  onSaveRow,
  onOpenDrawer,
}: DailyParcelEntryTableProps) {
  const renderRiderTableRows = (riderList: DailyParcelRow[]) => riderList.map(row => {
    const isSavingThis = savingRowId === row.riderId;
    const countsAreValid = [row.deliveredParcels, row.heavyParcels, row.failedDeliveries, row.returnedParcels]
      .every(value => Number.isInteger(value) && value >= 0);
    const metrics = countsAreValid
      ? calculateParcelOperationalMetrics({
          standardDelivered: row.deliveredParcels,
          heavyDelivered: row.heavyParcels,
          failed: row.failedDeliveries,
          returned: row.returnedParcels,
          standardRate: row.standardRate,
          heavyRate: row.heavyRate,
        })
      : null;
    const countInput = (field: ParcelCountField, label: string) => (
      <input
        type="number"
        min={0}
        step={1}
        aria-label={`${label} for ${row.riderName}`}
        value={row[field]}
        onChange={event => onParcelChange(row.riderId, field, Number(event.target.value))}
        className={`w-16 text-right px-2 py-1.5 rounded-lg font-mono text-xs font-bold transition outline-none ${
          row.isModified
            ? 'bg-white border-2 border-amber-500 text-foreground shadow-xs'
            : 'bg-panel-bg border border-border text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15'
        }`}
      />
    );

    return (
      <tr
        key={row.riderId}
        className={`transition-colors hover:bg-panel-bg/80 ${row.isModified ? 'bg-amber-50/40' : ''}`}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <RiderAvatar src={row.riderAvatar} name={row.riderName} className="w-8 h-8" />
            <div>
              <button
                type="button"
                onClick={() => onOpenDrawer(row)}
                className="font-bold text-foreground text-xs hover:text-primary transition text-left cursor-pointer"
              >
                {row.riderName}
              </button>
              <div className="text-[10px] font-mono text-muted-foreground">{row.riderMkbId}</div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 font-medium text-foreground">
          <span className="inline-flex items-center gap-1 text-xs">
            <MapPin className="w-3 h-3 text-muted-foreground" />
            {row.zoneName}
          </span>
        </td>
        <td className="px-4 py-3"><StatusBadge status={row.attendanceStatus} /></td>
        <td className="px-4 py-3 font-mono text-xs">
          {row.timeIn ? (
            <span className="inline-flex items-center gap-1 text-foreground font-medium">
              <Clock className="w-3 h-3 text-primary" />
              {row.timeIn}
            </span>
          ) : (
            <span className="text-subtle-text italic text-[11px]">Not Clocked In</span>
          )}
        </td>
        <td className="px-2 py-3 text-right">{countInput('deliveredParcels', 'Standard delivered')}</td>
        <td className="px-2 py-3 text-right">{countInput('heavyParcels', 'Heavy delivered')}</td>
        <td className="px-2 py-3 text-right">{countInput('failedDeliveries', 'Failed')}</td>
        <td className="px-2 py-3 text-right">{countInput('returnedParcels', 'Returned')}</td>
        <td className="px-4 py-3 text-right font-mono font-bold text-foreground whitespace-nowrap">
          {metrics ? `₱${metrics.dailyGross.toLocaleString()}` : 'Invalid'}
        </td>
        <td className="hidden">
          {row.lastUpdated
            ? new Date(row.lastUpdated).toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit', hour12: true,
              })
            : '—'}
        </td>
        <td className="hidden">
          <div className="font-semibold text-foreground text-[11.5px] leading-none">
            {row.recordedByName || 'Operations Staff'}
          </div>
          {row.recordedByDetail && (
            <div className="text-[10px] font-mono text-muted-foreground mt-0.5 leading-none">
              {row.recordedByDetail}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1.5">
            {row.isModified && (
              <button
                type="button"
                onClick={() => onSaveRow(row)}
                disabled={isSavingThis || savingAll}
                className="h-7 px-2.5 rounded-md bg-primary hover:bg-primary-hover text-white text-[11px] font-semibold transition inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                title="Save changes for this rider"
              >
                {isSavingThis ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenDrawer(row)}
              className="h-7 px-2.5 rounded-md bg-white border border-border hover:bg-panel-bg text-foreground text-[11px] font-medium transition inline-flex items-center gap-1 cursor-pointer shadow-xs"
              title="View rider operational drawer"
            >
              <Info className="w-3 h-3 text-primary" />
              Details
            </button>
          </div>
        </td>
      </tr>
    );
  });

  return (
    <>
      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-xs space-y-0">
        <div className="px-4 py-3 bg-panel-bg border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Eligible Encoding Queue ({rows.length} Pending)
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">Present &amp; Late On-Duty Riders</span>
        </div>

        {loading ? (
          <SkeletonTable
            rows={7}
            columns={10}
            columnWeights={[1.45, 1.1, 0.95, 0.75, 0.7, 0.65, 0.65, 0.7, 0.9, 0.55]}
            className="rounded-none border-0 shadow-none"
            minWidthClassName="data-table-extra-wide"
            showToolbar={false}
            mobileBreakpoint="lg"
          />
        ) : rows.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="p-3 rounded-full bg-accent text-primary w-fit mx-auto border border-primary/20">
              <PackageCheck className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-foreground">
                {totalEligibleCount > 0 && encodedCount === totalEligibleCount
                  ? 'All Eligible Riders Encoded!'
                  : 'Eligible Encoding Queue Empty'}
              </h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                {totalEligibleCount > 0 && encodedCount === totalEligibleCount
                  ? `All ${encodedCount} on-duty couriers for ${selectedDate} have completed parcel delivery logs recorded.`
                  : `No Present or Late riders waiting in the queue for ${selectedDate}. Riders must clock in before daily parcel entry.`}
              </p>
            </div>
            {encodedCount > 0 && (
              <a
                href="#parcel_history"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold transition cursor-pointer shadow-xs mt-2"
              >
                View Parcel History ({encodedCount} Encoded Logs) &rarr;
              </a>
            )}
          </div>
        ) : (
          <>
            <div className="table-scroll-region hidden lg:block" role="region" aria-label="Daily parcel rider records" tabIndex={0}>
              <table className="data-table-extra-wide w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-panel-bg/60 border-b border-border text-[10.5px] uppercase tracking-wider text-muted-foreground font-bold">
                    <th className="px-4 py-3">Rider</th>
                    <th className="px-4 py-3">Zone</th>
                    <th className="px-4 py-3">Attendance</th>
                    <th className="px-4 py-3">Time In</th>
                    <th className="px-2 py-3 text-right">Standard</th>
                    <th className="px-2 py-3 text-right">Heavy</th>
                    <th className="px-2 py-3 text-right">Failed</th>
                    <th className="px-2 py-3 text-right">Returned</th>
                    <th className="px-4 py-3 text-right">Daily Gross</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">{renderRiderTableRows(rows)}</tbody>
              </table>
            </div>
            <div className="grid gap-3 p-3 lg:hidden">
              {rows.map(row => {
                const counts = [row.deliveredParcels, row.heavyParcels, row.failedDeliveries, row.returnedParcels];
                const valid = counts.every(value => Number.isInteger(value) && value >= 0);
                const metrics = valid ? calculateParcelOperationalMetrics({
                  standardDelivered: row.deliveredParcels,
                  heavyDelivered: row.heavyParcels,
                  failed: row.failedDeliveries,
                  returned: row.returnedParcels,
                  standardRate: row.standardRate,
                  heavyRate: row.heavyRate,
                }) : null;
                return (
                  <article key={row.riderId} className="rounded-xl border border-border bg-white p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <RiderAvatar src={row.riderAvatar} name={row.riderName} className="w-9 h-9" />
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-foreground truncate">{row.riderName}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{row.zoneName} · {row.timeIn || 'No time in'}</div>
                        </div>
                      </div>
                      <StatusBadge status={row.attendanceStatus} />
                    </div>
                    <div className="grid grid-cols-2 min-[420px]:grid-cols-4 gap-2 text-center">
                      {[
                        ['Standard', row.deliveredParcels],
                        ['Heavy', row.heavyParcels],
                        ['Failed', row.failedDeliveries],
                        ['Returned', row.returnedParcels],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg bg-panel-bg border border-border p-2">
                          <div className="text-[9px] uppercase text-muted-foreground font-semibold">{label}</div>
                          <div className="text-sm font-bold font-mono text-foreground">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Daily Gross</div>
                        <div className="text-sm font-bold font-mono text-foreground">{metrics ? `₱${metrics.dailyGross.toLocaleString()}` : 'Invalid counts'}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenDrawer(row)}
                        className="h-8 px-3 rounded-lg border border-border bg-white text-xs font-semibold text-foreground"
                      >
                        Edit details
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>

      {!loading && absentRows.length > 0 && (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-xs">
          <button
            type="button"
            onClick={onToggleAbsent}
            className="w-full px-4 py-3 bg-panel-bg hover:bg-panel-bg/80 border-b border-border flex items-center justify-between text-left cursor-pointer transition"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Absent / Off-Duty Riders ({absentRows.length})
              </h3>
              <span className="text-[10.5px] text-subtle-text font-mono font-normal">(Read-Only Monitoring)</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <span>{absentCollapsed ? 'Expand Section' : 'Collapse Section'}</span>
              {absentCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {!absentCollapsed && (
            <div className="table-scroll-region" role="region" aria-label="Absent rider parcel status" tabIndex={0}>
              <table className="data-table w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-panel-bg/40 border-b border-border text-[10.5px] uppercase tracking-wider text-muted-foreground font-bold">
                    <th className="px-4 py-3">Rider</th>
                    <th className="px-4 py-3">Zone</th>
                    <th className="px-4 py-3">Attendance Status</th>
                    <th className="px-4 py-3">Time In</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {absentRows.map(row => (
                    <tr key={row.riderId} className="hover:bg-panel-bg/60 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2.5">
                          <RiderAvatar src={row.riderAvatar} name={row.riderName} className="w-7 h-7" />
                          <div>
                            <div className="font-semibold text-foreground">{row.riderName}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{row.riderMkbId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-panel-bg text-muted-foreground border border-border">
                          <MapPin className="w-3 h-3 text-subtle-text" />
                          {row.zoneName}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={row.attendanceStatus} /></td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{row.timeIn || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
