import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  PackageCheck,
  Calendar,
  Search,
  RotateCcw,
  Save,
  Loader2,
  Users,
  CheckCircle2,
  UserX
} from 'lucide-react';
import {
  getDailyParcelEntries,
  saveDailyParcelEntries,
  createParcelCorrectionRequest,
  isCutoffLockedForDate,
  type DailyParcelRow,
  type ParcelRateContext
} from '../services/operationsService';
import { getZones } from '../services/geofencing/geofenceService';
import { getRidersLookup } from '../services/riders/riderService';
import type { Zone } from '../services/types';
import { useAuth } from '../hooks/useAuth';
import { pushToast } from '../hooks/useToast';
import { getLocalDateString } from '../services/attendance/attendanceService';
import { PAGE_TRANSITION_VARIANTS } from '../lib/motion';
import { useDailyParcelDraft } from './daily-parcels/useDailyParcelDraft';
import { DailyParcelEntryTable } from './daily-parcels/DailyParcelEntryTable';
import { DailyParcelEntryDrawer } from './daily-parcels/DailyParcelEntryDrawer';

export function DailyParcelEntry() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [zones, setZones] = useState<Zone[]>([]);
  const [riders, setRiders] = useState<{ id: string; name: string; mkb_id?: string; zone_id?: string }[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [selectedRider, setSelectedRider] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const {
    rows,
    modifiedRows,
    selectedRiderDrawer,
    drawerDraft,
    replaceRows,
    updateRowCount,
    updateDrawerField,
    openDrawer,
    closeDrawer,
    stageDrawerDraft,
    reset,
  } = useDailyParcelDraft(selectedDate);
  const [absentRows, setAbsentRows] = useState<DailyParcelRow[]>([]);
  const [rateContext, setRateContext] = useState<ParcelRateContext | null>(null);
  const [totalEligibleCount, setTotalEligibleCount] = useState<number>(0);
  const [encodedCount, setEncodedCount] = useState<number>(0);
  const [absentCount, setAbsentCount] = useState<number>(0);
  const [absentCollapsed, setAbsentCollapsed] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(true);
  const [savingAll, setSavingAll] = useState<boolean>(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [submittingCorrection, setSubmittingCorrection] = useState<boolean>(false);
  const [isCutoffLocked, setIsCutoffLocked] = useState<boolean>(false);

  useEffect(() => {
    if (selectedRiderDrawer) {
      setCorrectionReason('');

      isCutoffLockedForDate(selectedDate)
        .then(setIsCutoffLocked)
        .catch(() => setIsCutoffLocked(false));
    }
  }, [selectedRiderDrawer, selectedDate]);

  // Parcel entry is date-effective: former employees stay available only for
  // work dates on which they were employed.
  useEffect(() => {
    getZones()
      .then(setZones)
      .catch(err => console.error('Failed to load zones:', err));
    getRidersLookup({ scope: 'employed_on_date', date: selectedDate })
      .then(setRiders)
      .catch(err => console.error('Failed to load riders:', err));
  }, [selectedDate]);

  // Dynamically filter riders based on parent Zone selection
  const filteredRiders = useMemo(() => {
    if (!selectedZone || selectedZone === 'all') {
      return riders;
    }
    return riders.filter(r => r.zone_id === selectedZone);
  }, [riders, selectedZone]);

  // Handle parent Zone change with auto-reset of child Rider filter
  const handleZoneChange = (zoneId: string) => {
    setSelectedZone(zoneId);
    setSelectedRider('all'); // Auto-reset child rider filter to "All Couriers"
  };

  // Fetch daily parcel entries for the Eligible Encoding Queue and Absent section
  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDailyParcelEntries({
        date: selectedDate,
        zoneId: selectedZone,
        search: searchQuery,
        status: selectedStatus
      });
      replaceRows(res.rows);
      setAbsentRows(res.absentRows);
      setTotalEligibleCount(res.totalEligibleCount);
      setEncodedCount(res.encodedCount);
      setAbsentCount(res.absentCount);
      setRateContext(res.rateContext);

    } catch (err) {
      console.error('Error loading daily parcel entries:', err);
      pushToast({
        title: 'Error Loading Data',
        description: 'Failed to fetch rider parcel records for selected date.',
        tone: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedZone, searchQuery, selectedStatus, replaceRows]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Apply child rider filter on loaded queue rows
  const displayRows = useMemo(() => {
    if (!selectedRider || selectedRider === 'all') return rows;
    return rows.filter(r => r.riderId === selectedRider);
  }, [rows, selectedRider]);

  // Apply child rider filter on loaded absent rows
  const displayAbsentRows = useMemo(() => {
    if (!selectedRider || selectedRider === 'all') return absentRows;
    return absentRows.filter(r => r.riderId === selectedRider);
  }, [absentRows, selectedRider]);

  const handleReset = () => {
    reset();
    pushToast({
      title: 'Changes Reverted',
      description: 'Local edits have been restored to saved values.',
      tone: 'info'
    });
  };

  // Save single row & immediately remove rider from encoding queue
  const handleSaveRow = async (row: DailyParcelRow) => {
    setSavingRowId(row.riderId);
    try {
      const isDrawerRow = selectedRiderDrawer?.riderId === row.riderId;
      const rowDraft = isDrawerRow
        ? {
            deliveredParcels: drawerDraft.deliveredParcels,
            heavyParcels: drawerDraft.heavyParcels,
            notes: drawerDraft.notes,
            assignedParcels: drawerDraft.assignedParcels,
            failedDeliveries: drawerDraft.failedDeliveries,
            returnedParcels: drawerDraft.returnedParcels
          }
        : row;
      await saveDailyParcelEntries(
        [
          {
            riderId: row.riderId,
            date: selectedDate,
            parcels: rowDraft.deliveredParcels,
            heavyParcels: rowDraft.heavyParcels,
            notes: rowDraft.notes,
            assignedParcels: rowDraft.assignedParcels,
            failedDeliveries: rowDraft.failedDeliveries,
            returnedParcels: rowDraft.returnedParcels
          }
        ],
        user?.id || user?.email || 'Operations'
      );

      const nowTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      setLastSavedTime(nowTime);

      pushToast({
        title: 'Parcel Entry Saved',
        description: `Delivered parcels for ${row.riderName} committed. Rider moved to Parcel History.`,
        tone: 'success'
      });

      if (isDrawerRow) {
        closeDrawer();
      }
      // Reload queue to filter out saved rider
      await loadEntries();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Could not save parcel record to database.';
      console.error('Failed to save parcel entry:', err);
      pushToast({
        title: 'Save Failed',
        description: errMsg,
        tone: 'error'
      });
    } finally {
      setSavingRowId(null);
    }
  };

  // Save all modified rows & update queue
  const handleSaveAll = async () => {
    if (modifiedRows.length === 0) return;
    setSavingAll(true);
    try {
      const payload = modifiedRows.map(r => ({
        riderId: r.riderId,
        date: selectedDate,
        parcels: r.deliveredParcels,
        heavyParcels: r.heavyParcels,
        notes: r.notes,
        assignedParcels: r.assignedParcels,
        failedDeliveries: r.failedDeliveries,
        returnedParcels: r.returnedParcels
      }));

      await saveDailyParcelEntries(payload, user?.id || user?.email || 'Operations');

      const nowTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      setLastSavedTime(nowTime);

      pushToast({
        title: 'Queue Records Saved',
        description: `Successfully persisted ${modifiedRows.length} parcel entry log(s). Moved to Parcel History.`,
        tone: 'success'
      });

      // Reload queue to remove saved riders
      await loadEntries();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to update daily parcel manifest.';
      console.error('Failed to bulk save parcel entries:', err);
      pushToast({
        title: 'Bulk Save Failed',
        description: errMsg,
        tone: 'error'
      });
    } finally {
      setSavingAll(false);
    }
  };

  const handleStageDrawerEdits = () => {
    stageDrawerDraft();
    pushToast({
      title: 'Operational Notes Staged',
      description: 'Click "Save" or "Save All" to commit details to database.',
      tone: 'info'
    });
  };

  const handleSubmitCorrection = async () => {
    if (!selectedRiderDrawer?.parcelLogId) return;
    setSubmittingCorrection(true);
    try {
      await createParcelCorrectionRequest({
        parcelLogId: selectedRiderDrawer.parcelLogId,
        riderId: selectedRiderDrawer.riderId,
        date: selectedDate,
        previousDelivered: selectedRiderDrawer.deliveredParcels,
        previousHeavy: selectedRiderDrawer.heavyParcels,
        previousFailed: selectedRiderDrawer.failedDeliveries || 0,
        previousReturned: selectedRiderDrawer.returnedParcels || 0,
        requestedDelivered: drawerDraft.deliveredParcels,
        requestedHeavy: drawerDraft.heavyParcels,
        requestedFailed: drawerDraft.failedDeliveries,
        requestedReturned: drawerDraft.returnedParcels,
        reason: correctionReason,
        requestedBy: user?.id || user?.email || 'Operations',
      });
      pushToast({
        title: 'Correction Request Submitted',
        description: 'Submitted correction request for Admin review. Original log remains unchanged until approved.',
        tone: 'success'
      });
      closeDrawer();
      setCorrectionReason('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit request.';
      pushToast({
        title: 'Submission Failed',
        description: msg,
        tone: 'error'
      });
    } finally {
      setSubmittingCorrection(false);
    }
  };

  return (
    <motion.div
      variants={PAGE_TRANSITION_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="dashboard-page space-y-5 font-sans"
    >
      {/* Informational Header Card */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-accent border border-primary/20 text-primary shrink-0 mt-0.5">
            <PackageCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">Operations Manifest Encoding</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent text-primary border border-primary/20">
                Operational Workspace
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Record each rider&apos;s daily delivered parcels before payroll processing. Attendance information is read-only. Financial calculations remain under Finance &amp; Reports.
            </p>
          </div>
        </div>

        {/* Action Controls & Timestamps */}
        <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
          {lastSavedTime && (
            <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1 bg-panel-bg px-2.5 py-1 rounded-md border border-border">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Last Saved: <strong className="text-foreground">{lastSavedTime}</strong>
            </span>
          )}

          {modifiedRows.length > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              type="button"
              onClick={handleReset}
              disabled={savingAll}
              className="h-9 px-3 rounded-lg border border-amber-300 bg-amber-50/50 hover:bg-amber-100/60 text-amber-900 text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Edits
            </motion.button>
          )}

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={savingAll || modifiedRows.length === 0}
            className="h-9 px-4 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold transition inline-flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {savingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save All ({modifiedRows.length})
          </button>
        </div>
      </div>

      {/* Filter & Metric Summary Toolbar */}
      <div className="bg-white border border-border rounded-xl p-4 space-y-3 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Date Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Date Logged
            </label>
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                max={getLocalDateString()}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-panel-bg border border-border text-xs font-medium text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition"
              />
              <Calendar className="w-4 h-4 text-muted-foreground absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Zone Filter (Parent) */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Zone / Area
            </label>
            <select
              value={selectedZone}
              onChange={e => handleZoneChange(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-panel-bg border border-border text-xs font-medium text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition"
            >
              <option value="all">All Operational Zones</option>
              {zones.map(z => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>

          {/* Rider Filter (Child Cascading) */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Filter Rider
            </label>
            <select
              value={selectedRider}
              onChange={e => setSelectedRider(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-panel-bg border border-border text-xs font-medium text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition"
            >
              <option value="all">
                {selectedZone !== 'all' ? `All Couriers in Zone (${filteredRiders.length})` : 'All Couriers'}
              </option>
              {filteredRiders.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.mkb_id ? `(${r.mkb_id})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Search Rider */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Search Rider
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rider Name or MKB ID..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-panel-bg border border-border text-xs font-medium text-foreground placeholder:text-subtle-text outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition"
              />
              <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Attendance Status Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Attendance Filter (Read-Only)
            </label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-panel-bg border border-border text-xs font-medium text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition"
            >
              <option value="all">All Statuses (Active &amp; Absent)</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="on_leave">On Leave</option>
            </select>
          </div>
        </div>

        {rateContext && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-3 border-t border-border" aria-label="Active parcel rates">
            {[
              ['Early standard', `₱${rateContext.earlyStandardRate}`],
              ['Regular standard', `₱${rateContext.regularStandardRate}`],
              ['Late standard', `₱${rateContext.lateStandardRate}`],
              ['Heavy parcel', `₱${rateContext.heavyParcelRate}`],
              ['Heavy threshold', `Above ${rateContext.heavyThresholdKg} kg`]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-panel-bg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
                <div className="text-xs font-bold font-mono text-foreground mt-0.5">{value}</div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Standard: 4 kg or below · Heavy: above 4 kg. Rates are resolved automatically for the selected work date.
        </p>

        {/* Live Counters Snapshot */}
        <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Users className="w-3.5 h-3.5 text-primary" />
              Pending Queue: <strong className="text-primary font-bold font-mono">{displayRows.length}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Present/Late Today: <strong className="text-foreground font-bold font-mono">{totalEligibleCount}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <PackageCheck className="w-3.5 h-3.5 text-emerald-700" />
              Encoded Today: <strong className="text-emerald-700 font-bold font-mono">{encodedCount}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <UserX className="w-3.5 h-3.5 text-gray-500" />
              Absent/Off Duty Today: <strong className="text-gray-700 font-bold font-mono">{absentCount}</strong>
            </span>
          </div>

          {modifiedRows.length > 0 && (
            <span className="text-amber-700 font-semibold inline-flex items-center gap-1.5 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Unsaved Changes ({modifiedRows.length})
            </span>
          )}
        </div>
      </div>

      <DailyParcelEntryTable
        rows={displayRows}
        absentRows={displayAbsentRows}
        loading={loading}
        totalEligibleCount={totalEligibleCount}
        encodedCount={encodedCount}
        selectedDate={selectedDate}
        savingRowId={savingRowId}
        savingAll={savingAll}
        absentCollapsed={absentCollapsed}
        onToggleAbsent={() => setAbsentCollapsed(previous => !previous)}
        onParcelChange={updateRowCount}
        onSaveRow={handleSaveRow}
        onOpenDrawer={openDrawer}
      />

      <DailyParcelEntryDrawer
        row={selectedRiderDrawer}
        selectedDate={selectedDate}
        draft={drawerDraft}
        requiresCorrection={Boolean(selectedRiderDrawer?.parcelLogId && isCutoffLocked)}
        correctionReason={correctionReason}
        submittingCorrection={submittingCorrection}
        onClose={closeDrawer}
        onDraftChange={updateDrawerField}
        onCorrectionReasonChange={setCorrectionReason}
        onStageEdits={handleStageDrawerEdits}
        onSubmitCorrection={handleSubmitCorrection}
      />
    </motion.div>
  );
}
