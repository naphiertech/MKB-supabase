import { Clock, FileText, Loader2, Package, PackageCheck, ShieldCheck, X } from 'lucide-react';
import { RiderAvatar } from '../../components/common/RiderAvatar';
import { RightDrawer } from '../../components/common/RightDrawer';
import { StatusBadge as SemanticStatusBadge } from '../../components/common/DashboardPrimitives';
import {
  calculateParcelOperationalMetrics,
  type DailyParcelRow,
} from '../../services/operationsService';
import type { DailyParcelDrawerDraft } from './useDailyParcelDraft';

interface DailyParcelEntryDrawerProps {
  row: DailyParcelRow | null;
  selectedDate: string;
  draft: DailyParcelDrawerDraft;
  requiresCorrection: boolean;
  correctionReason: string;
  submittingCorrection: boolean;
  onClose: () => void;
  onDraftChange: <Field extends keyof DailyParcelDrawerDraft>(
    field: Field,
    value: DailyParcelDrawerDraft[Field],
  ) => void;
  onCorrectionReasonChange: (reason: string) => void;
  onStageEdits: () => void;
  onSubmitCorrection: () => void;
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

export function DailyParcelEntryDrawer({
  row,
  selectedDate,
  draft,
  requiresCorrection,
  correctionReason,
  submittingCorrection,
  onClose,
  onDraftChange,
  onCorrectionReasonChange,
  onStageEdits,
  onSubmitCorrection,
}: DailyParcelEntryDrawerProps) {
  const counts = [
    draft.deliveredParcels,
    draft.heavyParcels,
    draft.failedDeliveries,
    draft.returnedParcels,
  ];
  const drawerMetrics = row && counts.every(value => Number.isInteger(value) && value >= 0)
    ? calculateParcelOperationalMetrics({
        standardDelivered: draft.deliveredParcels,
        heavyDelivered: draft.heavyParcels,
        failed: draft.failedDeliveries,
        returned: draft.returnedParcels,
        standardRate: row.standardRate,
        heavyRate: row.heavyRate,
      })
    : null;

  return (
    <RightDrawer
      open={Boolean(row)}
      onClose={onClose}
      ariaLabel={row ? `Parcel entry for ${row.riderName}` : 'Parcel entry details'}
      widthClassName="max-w-md"
      panelClassName="font-sans"
      closeLabel="Close parcel entry drawer"
    >
      {row && (
        <>
          <div className="p-5 border-b border-border flex items-center justify-between bg-panel-bg">
            <div className="flex items-center gap-3">
              <RiderAvatar src={row.riderAvatar} name={row.riderName} className="w-10 h-10" />
              <div>
                <h3 className="font-bold text-foreground text-sm">{row.riderName}</h3>
                <p className="text-xs text-muted-foreground font-mono">
                  MKB ID: {row.riderMkbId} &bull; {row.zoneName}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="p-4 rounded-xl bg-panel-bg border border-border space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  Attendance Status (Read-Only)
                </span>
                <StatusBadge status={row.attendanceStatus} />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border text-xs">
                <div>
                  <div className="text-muted-foreground text-[11px] mb-0.5">Time In</div>
                  <div className="font-semibold font-mono text-foreground">{row.timeIn || 'Not Clocked In'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[11px] mb-0.5">Time Out</div>
                  <div className="font-semibold font-mono text-foreground">{row.timeOut || 'Active / None'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[11px] mb-0.5">Shift Hours</div>
                  <div className="font-semibold font-mono text-foreground">
                    {row.hours ? `${row.hours.toFixed(1)} hrs` : '0.0 hrs'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[11px] mb-0.5">Shift Date</div>
                  <div className="font-semibold font-mono text-foreground">{selectedDate}</div>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-primary/30 bg-accent/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground text-xs flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-primary" />
                  Applied Rate Context
                </span>
                <span className="text-[10px] font-mono text-primary font-semibold uppercase">Operational Input</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground">Standard rate</div>
                  <div className="font-mono font-bold text-foreground">₱{row.standardRate}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground">Heavy rate</div>
                  <div className="font-mono font-bold text-foreground">₱{row.heavyRate} / parcel</div>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-panel-bg border border-border space-y-2 text-xs">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Operator Identity</div>
              <div className="space-y-1 font-mono text-[11px]">
                <div>
                  <span className="text-muted-foreground">Recorded By:</span>{' '}
                  <span className="text-foreground font-semibold">{row.recordedByName || 'Operations Staff'}</span>
                </div>
                {row.recordedByDetail && (
                  <div className="text-[10px] text-muted-foreground">({row.recordedByDetail})</div>
                )}
                <div>
                  <span className="text-muted-foreground">Last Updated:</span>{' '}
                  <span className="text-foreground font-semibold tabular-nums">
                    {row.lastUpdated
                      ? new Date(row.lastUpdated).toLocaleTimeString('en-US', {
                          hour: 'numeric', minute: '2-digit', hour12: true,
                        })
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-4">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-primary" />
                Parcel Outcomes
              </h4>
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Standard Delivered</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.deliveredParcels}
                  onChange={event => onDraftChange('deliveredParcels', Number(event.target.value))}
                  className="w-full h-8 px-2.5 rounded-lg bg-panel-bg border border-border font-mono text-xs text-foreground font-bold text-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Heavy Delivered</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={draft.heavyParcels}
                    onChange={event => onDraftChange('heavyParcels', Number(event.target.value))}
                    className="w-full h-8 px-2.5 rounded-lg bg-panel-bg border border-border font-mono text-xs text-foreground font-bold text-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Assigned Parcels</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={draft.assignedParcels}
                    onChange={event => onDraftChange('assignedParcels', Number(event.target.value))}
                    className="w-full h-8 px-2.5 rounded-lg bg-panel-bg border border-border font-mono text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Failed Deliveries</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={draft.failedDeliveries}
                    onChange={event => onDraftChange('failedDeliveries', Number(event.target.value))}
                    className="w-full h-8 px-2.5 rounded-lg bg-panel-bg border border-border font-mono text-xs text-foreground"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Returned Parcels</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.returnedParcels}
                  onChange={event => onDraftChange('returnedParcels', Number(event.target.value))}
                  className="w-full h-8 px-2.5 rounded-lg bg-panel-bg border border-border font-mono text-xs text-foreground"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-panel-bg p-3 text-xs">
                <div>
                  <div className="text-[9px] uppercase font-semibold text-muted-foreground">Standard earnings</div>
                  <div className="font-mono font-bold text-foreground">{drawerMetrics ? `₱${drawerMetrics.standardEarnings.toLocaleString()}` : 'Invalid'}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-semibold text-muted-foreground">Heavy earnings</div>
                  <div className="font-mono font-bold text-foreground">{drawerMetrics ? `₱${drawerMetrics.heavyEarnings.toLocaleString()}` : 'Invalid'}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-semibold text-muted-foreground">Daily gross</div>
                  <div className="font-mono font-bold text-primary">{drawerMetrics ? `₱${drawerMetrics.dailyGross.toLocaleString()}` : 'Invalid'}</div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3 text-muted-foreground" />
                  Operational Shift Notes
                </label>
                <textarea
                  rows={3}
                  value={draft.notes}
                  onChange={event => onDraftChange('notes', event.target.value)}
                  placeholder="Enter hub exceptions, weather delays, or dispatch notes..."
                  className="w-full p-2.5 rounded-lg bg-panel-bg border border-border text-xs text-foreground outline-none focus:border-primary"
                />
              </div>

              {requiresCorrection ? (
                <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900 uppercase text-[10.5px]">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                    Locked Payroll Period — Correction Request Required
                  </div>
                  <p className="text-[11px] text-amber-800 leading-snug">
                    The payroll cutoff for this shift has been submitted for review. Direct edits are disabled. All modifications must go through an official Correction Request and Admin approval.
                  </p>
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-900 mb-1">Reason for Correction *</label>
                    <textarea
                      rows={2}
                      value={correctionReason}
                      onChange={event => onCorrectionReasonChange(event.target.value)}
                      placeholder="Describe the discrepancy or reason for modifying this log..."
                      className="w-full p-2 rounded-lg bg-white border border-amber-300 text-xs text-amber-950 outline-none focus:border-amber-600 font-sans"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="p-4 border-t border-border bg-panel-bg flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg bg-white border border-border hover:bg-panel-bg text-xs font-semibold text-muted-foreground cursor-pointer shadow-xs"
            >
              Close Drawer
            </button>
            {requiresCorrection ? (
              <button
                type="button"
                disabled={submittingCorrection || !correctionReason.trim()}
                onClick={onSubmitCorrection}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-xs font-semibold text-white cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {submittingCorrection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                Submit Correction Request
              </button>
            ) : (
              <button
                type="button"
                onClick={onStageEdits}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-xs font-semibold text-white cursor-pointer shadow-xs"
              >
                Apply &amp; Stage Edits
              </button>
            )}
          </div>
        </>
      )}
    </RightDrawer>
  );
}
