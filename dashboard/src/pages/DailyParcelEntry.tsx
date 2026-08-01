import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PackageCheck,
  Calendar,
  Search,
  RotateCcw,
  Save,
  Loader2,
  Info,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  UserX,
  ChevronDown,
  ChevronRight,
  X,
  Package,
  FileText,
  ShieldCheck
} from 'lucide-react';
import {
  getDailyParcelEntries,
  saveDailyParcelEntries,
  createParcelCorrectionRequest,
  isCutoffLockedForDate,
  type DailyParcelRow
} from '../services/operationsService';
import { getZones } from '../services/geofenceService';
import { getRidersLookup } from '../services/riderService';
import type { Zone } from '../services/types';
import { useAuth } from '../hooks/useAuth';
import { pushToast } from '../hooks/useToast';
import { getLocalDateString } from '../services/attendanceService';
import { PAGE_TRANSITION_VARIANTS } from '../lib/motion';
import { RiderAvatar } from '../components/common/RiderAvatar';

function StatusBadge({ status }: { status: DailyParcelRow['attendanceStatus'] }) {
  switch (status) {
    case 'present':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Present
        </span>
      );
    case 'late':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Late
        </span>
      );
    case 'on_leave':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          On Leave
        </span>
      );
    case 'absent':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          Absent
        </span>
      );
  }
}

export function DailyParcelEntry() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [zones, setZones] = useState<Zone[]>([]);
  const [riders, setRiders] = useState<{ id: string; name: string; mkb_id?: string; zone_id?: string }[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [selectedRider, setSelectedRider] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [rows, setRows] = useState<DailyParcelRow[]>([]);
  const [absentRows, setAbsentRows] = useState<DailyParcelRow[]>([]);
  const [initialRows, setInitialRows] = useState<Record<string, number>>({});
  const [totalEligibleCount, setTotalEligibleCount] = useState<number>(0);
  const [encodedCount, setEncodedCount] = useState<number>(0);
  const [absentCount, setAbsentCount] = useState<number>(0);
  const [absentCollapsed, setAbsentCollapsed] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(true);
  const [savingAll, setSavingAll] = useState<boolean>(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Right-side Drawer state for selected rider
  const [selectedRiderDrawer, setSelectedRiderDrawer] = useState<DailyParcelRow | null>(null);
  const [drawerDelivered, setDrawerDelivered] = useState<number>(0);
  const [drawerAssigned, setDrawerAssigned] = useState<number>(0);
  const [drawerFailed, setDrawerFailed] = useState<number>(0);
  const [drawerReturned, setDrawerReturned] = useState<number>(0);
  const [drawerNotes, setDrawerNotes] = useState<string>('');
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [submittingCorrection, setSubmittingCorrection] = useState<boolean>(false);
  const [isCutoffLocked, setIsCutoffLocked] = useState<boolean>(false);

  useEffect(() => {
    if (selectedRiderDrawer) {
      setDrawerDelivered(selectedRiderDrawer.deliveredParcels);
      setDrawerAssigned(selectedRiderDrawer.assignedParcels || 0);
      setDrawerFailed(selectedRiderDrawer.failedDeliveries || 0);
      setDrawerReturned(selectedRiderDrawer.returnedParcels || 0);
      setDrawerNotes(selectedRiderDrawer.notes || '');
      setCorrectionReason('');

      isCutoffLockedForDate(selectedDate)
        .then(setIsCutoffLocked)
        .catch(() => setIsCutoffLocked(false));
    }
  }, [selectedRiderDrawer, selectedDate]);

  // Load dropdown options on mount
  useEffect(() => {
    getZones()
      .then(setZones)
      .catch(err => console.error('Failed to load zones:', err));
    getRidersLookup()
      .then(setRiders)
      .catch(err => console.error('Failed to load riders:', err));
  }, []);

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
      setRows(res.rows);
      setAbsentRows(res.absentRows);
      setTotalEligibleCount(res.totalEligibleCount);
      setEncodedCount(res.encodedCount);
      setAbsentCount(res.absentCount);

      const initMap: Record<string, number> = {};
      res.rows.forEach(r => {
        initMap[r.riderId] = r.deliveredParcels;
      });
      setInitialRows(initMap);
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
  }, [selectedDate, selectedZone, searchQuery, selectedStatus]);

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

  // Handle local inline edits
  const handleParcelChange = (riderId: string, val: number) => {
    const parcels = Math.max(0, val || 0);
    setRows(prev =>
      prev.map(r => {
        if (r.riderId === riderId) {
          const isModified = parcels !== (initialRows[riderId] ?? 0);
          return { ...r, deliveredParcels: parcels, isModified };
        }
        return r;
      })
    );
    setSelectedRiderDrawer(prev => {
      if (prev && prev.riderId === riderId) {
        const isModified = parcels !== (initialRows[riderId] ?? 0);
        return { ...prev, deliveredParcels: parcels, isModified };
      }
      return prev;
    });
  };

  // Check unsaved modified rows
  const modifiedRows = useMemo(() => {
    return rows.filter(r => r.isModified);
  }, [rows]);

  // Reset local changes
  const handleReset = () => {
    setRows(prev =>
      prev.map(r => ({
        ...r,
        deliveredParcels: initialRows[r.riderId] ?? 0,
        isModified: false
      }))
    );
    setSelectedRiderDrawer(prev => {
      if (prev) {
        return {
          ...prev,
          deliveredParcels: initialRows[prev.riderId] ?? 0,
          isModified: false
        };
      }
      return prev;
    });
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
      await saveDailyParcelEntries(
        [
          {
            riderId: row.riderId,
            date: selectedDate,
            parcels: row.deliveredParcels,
            notes: isDrawerRow ? drawerNotes : row.notes,
            assignedParcels: isDrawerRow ? drawerAssigned : row.assignedParcels,
            failedDeliveries: isDrawerRow ? drawerFailed : row.failedDeliveries,
            returnedParcels: isDrawerRow ? drawerReturned : row.returnedParcels
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
        setSelectedRiderDrawer(null);
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

  const renderRiderTableRows = (riderList: DailyParcelRow[]) => {
    return riderList.map(row => {
      const isSavingThis = savingRowId === row.riderId;
      const isSaved = !row.isModified && row.submissionStatus === 'saved';

      return (
        <tr
          key={row.riderId}
          className={`transition-colors hover:bg-[#FAFAF7]/80 ${
            row.isModified ? 'bg-amber-50/40' : ''
          }`}
        >
          {/* Rider */}
          <td className="px-4 py-3">
            <div className="flex items-center gap-2.5">
              <RiderAvatar src={row.riderAvatar} name={row.riderName} className="w-8 h-8" />
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRiderDrawer(row);
                    setDrawerNotes(row.notes || '');
                    setDrawerAssigned(row.assignedParcels || row.deliveredParcels);
                    setDrawerFailed(row.failedDeliveries || 0);
                    setDrawerReturned(row.returnedParcels || 0);
                  }}
                  className="font-bold text-[#1A1410] text-xs hover:text-[#db6c00] transition text-left cursor-pointer"
                >
                  {row.riderName}
                </button>
                <div className="text-[10px] font-mono text-[#6B6258]">{row.riderMkbId}</div>
              </div>
            </div>
          </td>

          {/* Zone */}
          <td className="px-4 py-3 font-medium text-[#1A1410]">
            <span className="inline-flex items-center gap-1 text-xs">
              <MapPin className="w-3 h-3 text-[#6B6258]" />
              {row.zoneName}
            </span>
          </td>

          {/* Attendance (Read-Only) */}
          <td className="px-4 py-3">
            <StatusBadge status={row.attendanceStatus} />
          </td>

          {/* Time In (Read-Only Context) */}
          <td className="px-4 py-3 font-mono text-xs">
            {row.timeIn ? (
              <span className="inline-flex items-center gap-1 text-[#1A1410] font-medium">
                <Clock className="w-3 h-3 text-[#db6c00]" />
                {row.timeIn}
              </span>
            ) : (
              <span className="text-[#A39988] italic text-[11px]">Not Clocked In</span>
            )}
          </td>

          {/* Delivered Parcels (Inline Editable Input) */}
          <td className="px-4 py-3 text-right">
            <div className="relative inline-flex items-center justify-end gap-1.5">
              {row.isModified ? (
                <span
                  className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"
                  title="Unsaved local edit"
                />
              ) : isSaved ? (
                <span title="Saved to database">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                </span>
              ) : null}
              <input
                type="number"
                min={0}
                value={row.deliveredParcels}
                onChange={e => handleParcelChange(row.riderId, parseInt(e.target.value) || 0)}
                className={`w-24 text-right px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold transition outline-none ${
                  row.isModified
                    ? 'bg-white border-2 border-amber-500 text-[#1A1410] shadow-xs'
                    : isSaved
                    ? 'bg-emerald-50/50 border border-emerald-500/30 text-emerald-950 font-semibold'
                    : 'bg-[#FAFAF7] border border-[#EFEAE2] text-[#1A1410] focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/15'
                }`}
              />
            </div>
          </td>

          {/* Last Updated */}
          <td className="px-4 py-3 font-mono text-[11px] text-[#6B6258]">
            {row.lastUpdated
              ? new Date(row.lastUpdated).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })
              : '—'}
          </td>

          {/* Recorded By */}
          <td className="px-4 py-3 align-middle whitespace-nowrap text-left text-xs">
            <div className="font-semibold text-[#1A1410] text-[11.5px] leading-none">
              {row.recordedByName || 'Operations Staff'}
            </div>
            {row.recordedByDetail && (
              <div className="text-[10px] font-mono text-[#6B6258] mt-0.5 leading-none">
                {row.recordedByDetail}
              </div>
            )}
          </td>

          {/* Actions */}
          <td className="px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-1.5">
              {row.isModified && (
                <button
                  type="button"
                  onClick={() => handleSaveRow(row)}
                  disabled={isSavingThis || savingAll}
                  className="h-7 px-2.5 rounded-md bg-[#db6c00] hover:bg-[#c56000] text-white text-[11px] font-semibold transition inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Save changes for this rider"
                >
                  {isSavingThis ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                  Save
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setSelectedRiderDrawer(row);
                  setDrawerNotes(row.notes || '');
                  setDrawerAssigned(row.assignedParcels || row.deliveredParcels);
                  setDrawerFailed(row.failedDeliveries || 0);
                  setDrawerReturned(row.returnedParcels || 0);
                }}
                className="h-7 px-2.5 rounded-md bg-white border border-[#EFEAE2] hover:bg-[#FAFAF7] text-[#1A1410] text-[11px] font-medium transition inline-flex items-center gap-1 cursor-pointer shadow-xs"
                title="View rider operational drawer"
              >
                <Info className="w-3 h-3 text-[#db6c00]" />
                Details
              </button>
            </div>
          </td>
        </tr>
      );
    });
  };

  return (
    <motion.div
      variants={PAGE_TRANSITION_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 max-w-[1600px] mx-auto space-y-5 font-sans"
    >
      {/* Informational Header Card */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-[#FFF1E0] border border-[#db6c00]/20 text-[#db6c00] shrink-0 mt-0.5">
            <PackageCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#1A1410]">Operations Manifest Encoding</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FFF1E0] text-[#db6c00] border border-[#db6c00]/20">
                Operational Workspace
              </span>
            </div>
            <p className="text-xs text-[#6B6258] mt-0.5 leading-relaxed">
              Record each rider&apos;s daily delivered parcels before payroll processing. Attendance information is read-only. Financial calculations remain under Finance &amp; Reports.
            </p>
          </div>
        </div>

        {/* Action Controls & Timestamps */}
        <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
          {lastSavedTime && (
            <span className="text-[11px] font-mono text-[#6B6258] flex items-center gap-1 bg-[#FAFAF7] px-2.5 py-1 rounded-md border border-[#EFEAE2]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Last Saved: <strong className="text-[#1A1410]">{lastSavedTime}</strong>
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
            className="h-9 px-4 rounded-lg bg-[#db6c00] hover:bg-[#c56000] text-white text-xs font-semibold transition inline-flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {savingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save All ({modifiedRows.length})
          </button>
        </div>
      </div>

      {/* Filter & Metric Summary Toolbar */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl p-4 space-y-3 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Date Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6B6258] uppercase tracking-wider mb-1">
              Date Logged
            </label>
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-xs font-medium text-[#1A1410] outline-none focus:border-[#db6c00] focus:ring-1 focus:ring-[#db6c00]/20 transition"
              />
              <Calendar className="w-4 h-4 text-[#6B6258] absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Zone Filter (Parent) */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6B6258] uppercase tracking-wider mb-1">
              Zone / Area
            </label>
            <select
              value={selectedZone}
              onChange={e => handleZoneChange(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-xs font-medium text-[#1A1410] outline-none focus:border-[#db6c00] focus:ring-1 focus:ring-[#db6c00]/20 transition"
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
            <label className="block text-[11px] font-semibold text-[#6B6258] uppercase tracking-wider mb-1">
              Filter Rider
            </label>
            <select
              value={selectedRider}
              onChange={e => setSelectedRider(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-xs font-medium text-[#1A1410] outline-none focus:border-[#db6c00] focus:ring-1 focus:ring-[#db6c00]/20 transition"
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
            <label className="block text-[11px] font-semibold text-[#6B6258] uppercase tracking-wider mb-1">
              Search Rider
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rider Name or MKB ID..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-xs font-medium text-[#1A1410] placeholder:text-[#A39988] outline-none focus:border-[#db6c00] focus:ring-1 focus:ring-[#db6c00]/20 transition"
              />
              <Search className="w-4 h-4 text-[#6B6258] absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Attendance Status Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6B6258] uppercase tracking-wider mb-1">
              Attendance Filter (Read-Only)
            </label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-xs font-medium text-[#1A1410] outline-none focus:border-[#db6c00] focus:ring-1 focus:ring-[#db6c00]/20 transition"
            >
              <option value="all">All Statuses (Active &amp; Absent)</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="on_leave">On Leave</option>
            </select>
          </div>
        </div>        {/* Live Counters Snapshot */}
        <div className="pt-2 border-t border-[#EFEAE2] flex items-center justify-between text-xs text-[#6B6258] flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Users className="w-3.5 h-3.5 text-[#db6c00]" />
              Pending Queue: <strong className="text-[#db6c00] font-bold font-mono">{displayRows.length}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Present/Late Today: <strong className="text-[#1A1410] font-bold font-mono">{totalEligibleCount}</strong>
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

      {/* Main Active Encoding Queue Table */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl overflow-hidden shadow-xs space-y-0">
        <div className="px-4 py-3 bg-[#FAFAF7] border-b border-[#EFEAE2] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#db6c00] animate-pulse" />
            <h3 className="text-xs font-bold text-[#1A1410] uppercase tracking-wider">
              Eligible Encoding Queue ({displayRows.length} Pending)
            </h3>
          </div>
          <span className="text-[11px] text-[#6B6258] font-mono">Present &amp; Late On-Duty Riders</span>
        </div>

        {loading ? (
          <div className="p-12 text-center space-y-3">
            <Loader2 className="w-6 h-6 text-[#db6c00] animate-spin mx-auto" />
            <p className="text-xs text-[#6B6258] font-medium">Loading eligible encoding queue...</p>
          </div>
        ) : displayRows.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="p-3 rounded-full bg-[#FFF1E0] text-[#db6c00] w-fit mx-auto border border-[#db6c00]/20">
              <PackageCheck className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[#1A1410]">
                {totalEligibleCount > 0 && encodedCount === totalEligibleCount
                  ? 'All Eligible Riders Encoded!'
                  : 'Eligible Encoding Queue Empty'}
              </h4>
              <p className="text-xs text-[#6B6258] max-w-md mx-auto leading-relaxed">
                {totalEligibleCount > 0 && encodedCount === totalEligibleCount
                  ? `All ${encodedCount} on-duty couriers for ${selectedDate} have completed parcel delivery logs recorded.`
                  : `No Present or Late riders waiting in the queue for ${selectedDate}. Riders must clock in before daily parcel entry.`}
              </p>
            </div>
            {encodedCount > 0 && (
              <a
                href="#parcel_history"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#db6c00] hover:bg-[#c56000] text-white text-xs font-semibold transition cursor-pointer shadow-xs mt-2"
              >
                View Parcel History ({encodedCount} Encoded Logs) &rarr;
              </a>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#FAFAF7]/60 border-b border-[#EFEAE2] text-[10.5px] uppercase tracking-wider text-[#6B6258] font-bold">
                  <th className="px-4 py-3">Rider</th>
                  <th className="px-4 py-3">Zone</th>
                  <th className="px-4 py-3">Attendance</th>
                  <th className="px-4 py-3">Time In</th>
                  <th className="px-4 py-3 text-right">Delivered Parcels</th>
                  <th className="px-4 py-3">Last Updated</th>
                  <th className="px-4 py-3">Recorded By</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEAE2]">
                {renderRiderTableRows(displayRows)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Absent / Off-Duty Riders (Read-Only Operational View) */}
      {!loading && displayAbsentRows.length > 0 && (
        <div className="bg-white border border-[#EFEAE2] rounded-xl overflow-hidden shadow-xs">
          <button
            type="button"
            onClick={() => setAbsentCollapsed(prev => !prev)}
            className="w-full px-4 py-3 bg-[#FAFAF7] hover:bg-[#FAFAF7]/80 border-b border-[#EFEAE2] flex items-center justify-between text-left cursor-pointer transition"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              <h3 className="text-xs font-bold text-[#6B6258] uppercase tracking-wider">
                Absent / Off-Duty Riders ({displayAbsentRows.length})
              </h3>
              <span className="text-[10.5px] text-[#A39988] font-mono font-normal">(Read-Only Monitoring)</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#6B6258] font-medium">
              <span>{absentCollapsed ? 'Expand Section' : 'Collapse Section'}</span>
              {absentCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {!absentCollapsed && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAFAF7]/40 border-b border-[#EFEAE2] text-[10.5px] uppercase tracking-wider text-[#6B6258] font-bold">
                    <th className="px-4 py-3">Rider</th>
                    <th className="px-4 py-3">Zone</th>
                    <th className="px-4 py-3">Attendance Status</th>
                    <th className="px-4 py-3">Time In</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEAE2]">
                  {displayAbsentRows.map(row => (
                    <tr key={row.riderId} className="hover:bg-[#FAFAF7]/60 transition-colors">
                      <td className="px-4 py-3 font-medium text-[#1A1410]">
                        <div className="flex items-center gap-2.5">
                          <RiderAvatar src={row.riderAvatar} name={row.riderName} className="w-7 h-7" />
                          <div>
                            <div className="font-semibold text-[#1A1410]">{row.riderName}</div>
                            <div className="text-[10px] text-[#6B6258] font-mono">{row.riderMkbId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#6B6258]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#FAFAF7] text-[#6B6258] border border-[#EFEAE2]">
                          <MapPin className="w-3 h-3 text-[#A39988]" />
                          {row.zoneName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.attendanceStatus} />
                      </td>
                      <td className="px-4 py-3 font-mono text-[#6B6258]">
                        {row.timeIn || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Rider Central Operational View - Right-Side Slide-Over Drawer (Portaled to document.body) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {selectedRiderDrawer && (
              <div className="fixed inset-0 z-[99999] overflow-hidden">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSelectedRiderDrawer(null)}
                  className="absolute inset-0 bg-black/30 backdrop-blur-xs"
                />

                {/* Slide-Over Panel */}
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="absolute inset-y-0 right-0 w-full max-w-md bg-white border-l border-[#EFEAE2] shadow-2xl flex flex-col font-sans z-[100000]"
                >
                  {/* Drawer Header */}
                  <div className="p-5 border-b border-[#EFEAE2] flex items-center justify-between bg-[#FAFAF7]">
                    <div className="flex items-center gap-3">
                      <RiderAvatar src={selectedRiderDrawer.riderAvatar} name={selectedRiderDrawer.riderName} className="w-10 h-10" />
                      <div>
                        <h3 className="font-bold text-[#1A1410] text-sm">{selectedRiderDrawer.riderName}</h3>
                        <p className="text-xs text-[#6B6258] font-mono">
                          MKB ID: {selectedRiderDrawer.riderMkbId} &bull; {selectedRiderDrawer.zoneName}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedRiderDrawer(null)}
                      className="p-1.5 rounded-lg text-[#6B6258] hover:text-[#1A1410] hover:bg-white transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Drawer Content Body */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Attendance Summary Card (Read-Only Context) */}
                    <div className="p-4 rounded-xl bg-[#FAFAF7] border border-[#EFEAE2] space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#6B6258] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#db6c00]" />
                          Attendance Status (Read-Only)
                        </span>
                        <StatusBadge status={selectedRiderDrawer.attendanceStatus} />
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#EFEAE2] text-xs">
                        <div>
                          <div className="text-[#6B6258] text-[11px] mb-0.5">Time In</div>
                          <div className="font-semibold font-mono text-[#1A1410]">
                            {selectedRiderDrawer.timeIn || 'Not Clocked In'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[#6B6258] text-[11px] mb-0.5">Time Out</div>
                          <div className="font-semibold font-mono text-[#1A1410]">
                            {selectedRiderDrawer.timeOut || 'Active / None'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[#6B6258] text-[11px] mb-0.5">Shift Hours</div>
                          <div className="font-semibold font-mono text-[#1A1410]">
                            {selectedRiderDrawer.hours ? `${selectedRiderDrawer.hours.toFixed(1)} hrs` : '0.0 hrs'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[#6B6258] text-[11px] mb-0.5">Shift Date</div>
                          <div className="font-semibold font-mono text-[#1A1410]">{selectedDate}</div>
                        </div>
                      </div>
                    </div>

                    {/* Delivered Parcels Input Section */}
                    <div className="p-4 rounded-xl border border-[#db6c00]/30 bg-[#FFF1E0]/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#1A1410] text-xs flex items-center gap-1.5">
                          <PackageCheck className="w-4 h-4 text-[#db6c00]" />
                          Delivered Parcels Encoding
                        </span>
                        <span className="text-[10px] font-mono text-[#db6c00] font-semibold uppercase">
                          Operational Input
                        </span>
                      </div>

                      <div className="flex items-center gap-3 pt-1">
                        <input
                          type="number"
                          min={0}
                          value={selectedRiderDrawer.deliveredParcels}
                          onChange={e => handleParcelChange(selectedRiderDrawer.riderId, parseInt(e.target.value) || 0)}
                          className="flex-1 h-10 px-3 rounded-lg bg-white border border-[#EFEAE2] font-mono text-base font-bold text-[#1A1410] outline-none focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/20"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRow(selectedRiderDrawer)}
                          disabled={savingRowId === selectedRiderDrawer.riderId || !selectedRiderDrawer.isModified}
                          className="h-10 px-4 rounded-lg bg-[#db6c00] hover:bg-[#c56000] text-white text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                        >
                          {savingRowId === selectedRiderDrawer.riderId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          Save Record
                        </button>
                      </div>
                    </div>

                    {/* Audit & Record Metadata */}
                    <div className="p-3.5 rounded-xl bg-[#FAFAF7] border border-[#EFEAE2] space-y-2 text-xs">
                      <div className="text-[11px] font-semibold text-[#6B6258] uppercase tracking-wider">
                        Operator Identity
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div>
                          <span className="text-[#6B6258]">Recorded By:</span>{' '}
                          <span className="text-[#1A1410] font-semibold">
                            {selectedRiderDrawer.recordedByName || 'Operations Staff'}
                          </span>
                        </div>
                        {selectedRiderDrawer.recordedByDetail && (
                          <div className="text-[10px] text-[#6B6258]">
                            ({selectedRiderDrawer.recordedByDetail})
                          </div>
                        )}
                        <div>
                          <span className="text-[#6B6258]">Last Updated:</span>{' '}
                          <span className="text-[#1A1410] font-semibold tabular-nums">
                            {selectedRiderDrawer.lastUpdated
                              ? new Date(selectedRiderDrawer.lastUpdated).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                })
                              : '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Reserved Operational Sections for Future Fields */}
                    <div className="border-t border-[#EFEAE2] pt-4 space-y-4">
                      <h4 className="text-xs font-bold text-[#1A1410] uppercase tracking-wider flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-[#db6c00]" />
                        Extended Operational Outcomes
                      </h4>

                      <div>
                        <label className="block text-[11px] font-medium text-[#6B6258] mb-1">
                          Delivered Parcels
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={drawerDelivered}
                          onChange={e => setDrawerDelivered(parseInt(e.target.value) || 0)}
                          className="w-full h-8 px-2.5 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] font-mono text-xs text-[#1A1410] font-bold text-[#db6c00]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-[#6B6258] mb-1">
                            Assigned Parcels
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={drawerAssigned}
                            onChange={e => setDrawerAssigned(parseInt(e.target.value) || 0)}
                            className="w-full h-8 px-2.5 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] font-mono text-xs text-[#1A1410]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#6B6258] mb-1">
                            Failed Deliveries
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={drawerFailed}
                            onChange={e => setDrawerFailed(parseInt(e.target.value) || 0)}
                            className="w-full h-8 px-2.5 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] font-mono text-xs text-[#1A1410]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[#6B6258] mb-1">
                          Returned Parcels
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={drawerReturned}
                          onChange={e => setDrawerReturned(parseInt(e.target.value) || 0)}
                          className="w-full h-8 px-2.5 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] font-mono text-xs text-[#1A1410]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[#6B6258] mb-1 flex items-center gap-1">
                          <FileText className="w-3 h-3 text-[#6B6258]" />
                          Operational Shift Notes
                        </label>
                        <textarea
                          rows={3}
                          value={drawerNotes}
                          onChange={e => setDrawerNotes(e.target.value)}
                          placeholder="Enter hub exceptions, weather delays, or dispatch notes..."
                          className="w-full p-2.5 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-xs text-[#1A1410] outline-none focus:border-[#db6c00]"
                        />
                      </div>

                      {selectedRiderDrawer.parcelLogId && isCutoffLocked ? (
                        <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 space-y-2 text-xs">
                          <div className="flex items-center gap-1.5 font-bold text-amber-900 uppercase text-[10.5px]">
                            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                            Locked Payroll Period — Correction Request Required
                          </div>
                          <p className="text-[11px] text-amber-800 leading-snug">
                            The payroll cutoff for this shift has been submitted for review. Direct edits are disabled. All modifications must go through an official Correction Request and Admin approval.
                          </p>
                          <div>
                            <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                              Reason for Correction *
                            </label>
                            <textarea
                              rows={2}
                              value={correctionReason}
                              onChange={e => setCorrectionReason(e.target.value)}
                              placeholder="Describe the discrepancy or reason for modifying this log..."
                              className="w-full p-2 rounded-lg bg-white border border-amber-300 text-xs text-amber-950 outline-none focus:border-amber-600 font-sans"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Drawer Footer */}
                  <div className="p-4 border-t border-[#EFEAE2] bg-[#FAFAF7] flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRiderDrawer(null)}
                      className="px-3.5 py-2 rounded-lg bg-white border border-[#EFEAE2] hover:bg-[#FAFAF7] text-xs font-semibold text-[#6B6258] cursor-pointer shadow-xs"
                    >
                      Close Drawer
                    </button>
                    {selectedRiderDrawer.parcelLogId && isCutoffLocked ? (
                      <button
                        type="button"
                        disabled={submittingCorrection || !correctionReason.trim()}
                        onClick={async () => {
                          setSubmittingCorrection(true);
                          try {
                            await createParcelCorrectionRequest({
                              parcelLogId: selectedRiderDrawer.parcelLogId!,
                              riderId: selectedRiderDrawer.riderId,
                              date: selectedDate,
                              previousDelivered: selectedRiderDrawer.deliveredParcels,
                              previousFailed: selectedRiderDrawer.failedDeliveries || 0,
                              previousReturned: selectedRiderDrawer.returnedParcels || 0,
                              requestedDelivered: drawerDelivered,
                              requestedFailed: drawerFailed,
                              requestedReturned: drawerReturned,
                              reason: correctionReason,
                              requestedBy: 'Operations Staff',
                            });
                            pushToast({
                              title: 'Correction Request Submitted',
                              description: 'Submitted correction request for Admin review. Original log remains unchanged until approved.',
                              tone: 'success'
                            });
                            setSelectedRiderDrawer(null);
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
                        }}
                        className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-xs font-semibold text-white cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {submittingCorrection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        Submit Correction Request
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setRows(prev =>
                            prev.map(r =>
                              r.riderId === selectedRiderDrawer.riderId
                                ? {
                                    ...r,
                                    deliveredParcels: drawerDelivered,
                                    notes: drawerNotes,
                                    assignedParcels: drawerAssigned,
                                    failedDeliveries: drawerFailed,
                                    returnedParcels: drawerReturned,
                                    isModified: true
                                  }
                                : r
                            )
                          );
                          setSelectedRiderDrawer(null);
                          pushToast({
                            title: 'Operational Notes Staged',
                            description: 'Click "Save" or "Save All" to commit details to database.',
                            tone: 'info'
                          });
                        }}
                        className="px-4 py-2 rounded-lg bg-[#db6c00] hover:bg-[#c56000] text-xs font-semibold text-white cursor-pointer shadow-xs"
                      >
                        Apply &amp; Stage Edits
                      </button>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </motion.div>
  );
}
