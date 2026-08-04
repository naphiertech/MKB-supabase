import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Search,
  Loader2,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Info,
  PackageCheck,
  X,
  FileSpreadsheet,
  UserCheck,
  CheckCircle2,
  XCircle,
  History,
  ShieldCheck,
  Edit3
} from 'lucide-react';
import {
  getParcelHistory,
  getParcelLogAuditHistory,
  getParcelCorrectionRequests,
  reviewParcelCorrectionRequest,
  saveDailyParcelEntries,
  createParcelCorrectionRequest,
  isCutoffLockedForDate,
  type ParcelHistoryItem,
  type ParcelLogAuditEntry,
  type ParcelCorrectionRequest
} from '../services/operationsService';
import { getRidersLookup } from '../services/riderService';
import { getZones } from '../services/geofenceService';
import type { Zone } from '../services/types';
import { pushToast } from '../hooks/useToast';
import { getLocalDateString } from '../services/attendanceService';
import { PAGE_TRANSITION_VARIANTS } from '../lib/motion';
import { RiderAvatar } from '../components/common/RiderAvatar';
import { useAuth } from '../hooks/useAuth';

function StatusBadge({ status }: { status?: ParcelHistoryItem['attendanceStatus'] }) {
  switch (status) {
    case 'present':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-500/20 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Present
        </span>
      );
    case 'late':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-500/20 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Late
        </span>
      );
    case 'on_leave':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-500/20 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          On Leave
        </span>
      );
    case 'absent':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          Absent
        </span>
      );
  }
}

export function ParcelHistory() {
  const today = getLocalDateString();
  const thirtyDaysAgo = getLocalDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const [dateFrom, setDateFrom] = useState<string>(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState<string>(today);
  const [selectedRider, setSelectedRider] = useState<string>('all');
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [riders, setRiders] = useState<{ id: string; name: string; mkb_id?: string; zone_id?: string }[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);

  const [historyItems, setHistoryItems] = useState<ParcelHistoryItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Pagination
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  // Selected row for detail drawer
  const [selectedDetailRow, setSelectedDetailRow] = useState<ParcelHistoryItem | null>(null);

  // Auth & Audit state
  const { user } = useAuth();
  const [auditLogs, setAuditLogs] = useState<ParcelLogAuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  // Drawer Inline Edit state
  const [isEditingDrawer, setIsEditingDrawer] = useState<boolean>(false);
  const [editDelivered, setEditDelivered] = useState<number>(0);
  const [editFailed, setEditFailed] = useState<number>(0);
  const [editReturned, setEditReturned] = useState<number>(0);
  const [editReason, setEditReason] = useState<string>('');
  const [submittingDrawerEdit, setSubmittingDrawerEdit] = useState<boolean>(false);
  const [drawerCutoffLocked, setDrawerCutoffLocked] = useState<boolean>(false);

  // Correction Review Modal state
  const [showCorrectionsModal, setShowCorrectionsModal] = useState<boolean>(false);
  const [correctionRequests, setCorrectionRequests] = useState<ParcelCorrectionRequest[]>([]);
  const [loadingCorrections, setLoadingCorrections] = useState<boolean>(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  // Fetch pending correction requests for admin review
  const loadCorrectionRequests = useCallback(async () => {
    setLoadingCorrections(true);
    try {
      const data = await getParcelCorrectionRequests('pending');
      setCorrectionRequests(data);
    } catch (err) {
      console.error('Failed to fetch correction requests:', err);
    } finally {
      setLoadingCorrections(false);
    }
  }, []);

  useEffect(() => {
    loadCorrectionRequests();
  }, [loadCorrectionRequests]);

  // Fetch audit history & cutoff lock state whenever a row is selected for the detail drawer
  useEffect(() => {
    if (selectedDetailRow?.id) {
      setLoadingAudit(true);
      getParcelLogAuditHistory(selectedDetailRow.id)
        .then(setAuditLogs)
        .catch(err => console.error('Failed to fetch parcel audit history:', err))
        .finally(() => setLoadingAudit(false));

      setEditDelivered(selectedDetailRow.deliveredParcels);
      setEditFailed(selectedDetailRow.failedDeliveries || 0);
      setEditReturned(selectedDetailRow.returnedParcels || 0);
      setEditReason('');
      setIsEditingDrawer(false);

      isCutoffLockedForDate(selectedDetailRow.date)
        .then(setDrawerCutoffLocked)
        .catch(() => setDrawerCutoffLocked(false));
    } else {
      setAuditLogs([]);
      setIsEditingDrawer(false);
    }
  }, [selectedDetailRow]);

  const handleReviewDecision = async (requestId: string, decision: 'approved' | 'rejected') => {
    setProcessingId(requestId);
    try {
      await reviewParcelCorrectionRequest(
        requestId,
        decision,
        user?.id || user?.email || 'Admin',
        reviewNotes[requestId]
      );
      pushToast({
        title: `Correction Request ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
        description: `Successfully ${decision} correction request.`,
        tone: decision === 'approved' ? 'success' : 'info'
      });
      await loadCorrectionRequests();
      await fetchHistory();
      if (selectedDetailRow) {
        const logs = await getParcelLogAuditHistory(selectedDetailRow.id);
        setAuditLogs(logs);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Action failed.';
      pushToast({
        title: 'Review Action Failed',
        description: errMsg,
        tone: 'error'
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Load dropdown options
  useEffect(() => {
    getRidersLookup()
      .then(setRiders)
      .catch(err => console.error('Failed to fetch riders:', err));
    getZones()
      .then(setZones)
      .catch(err => console.error('Failed to fetch zones:', err));
  }, []);

  // Dynamically filter riders based on parent Zone selection
  const filteredRiders = useMemo(() => {
    if (!selectedZone || selectedZone === 'all') {
      return riders;
    }
    return riders.filter((r: { id: string; name: string; mkb_id?: string; zone_id?: string }) => r.zone_id === selectedZone);
  }, [riders, selectedZone]);

  // Handle parent Zone change with auto-reset of child Rider filter
  const handleZoneChange = (zoneId: string) => {
    setSelectedZone(zoneId);
    setSelectedRider('all'); // Auto-reset child rider filter to "All Couriers"
    setPage(1);
  };

  // Fetch parcel history data
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getParcelHistory({
        dateFrom,
        dateTo,
        riderId: selectedRider,
        zoneId: selectedZone,
        search: searchQuery,
        page,
        pageSize
      });
      setHistoryItems(res.data);
      setTotalCount(res.totalCount);
    } catch (err) {
      console.error('Error loading parcel history:', err);
      pushToast({
        title: 'Error Loading History',
        description: 'Failed to retrieve parcel manifest logs.',
        tone: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedRider, selectedZone, searchQuery, page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <motion.div
      variants={PAGE_TRANSITION_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 max-w-[1600px] mx-auto space-y-5 font-sans"
    >
      {/* Informational Header Card */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-accent border border-primary/20 text-primary shrink-0 mt-0.5">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">Operational Parcel Manifest History</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent text-primary border border-primary/20">
                Audit Trail
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Historical record of physical parcel delivery manifests merged with read-only attendance context and payroll cutoff period labels.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <button
            type="button"
            onClick={() => setShowCorrectionsModal(true)}
            className="px-3.5 py-2 rounded-lg bg-white border border-border hover:bg-panel-bg text-xs font-semibold text-foreground flex items-center gap-2 cursor-pointer shadow-xs transition"
          >
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>Correction Approvals</span>
            {correctionRequests.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold tabular-nums">
                {correctionRequests.length}
              </span>
            )}
          </button>
          <div className="text-xs font-mono text-muted-foreground bg-panel-bg border border-border px-3.5 py-2 rounded-lg shadow-xs">
            Total Manifest Logs: <strong className="text-foreground font-bold tabular-nums">{totalCount.toLocaleString()}</strong>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-border rounded-xl p-4 space-y-3 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Date From */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Date From
            </label>
            <div className="relative">
              <input
                type="date"
                value={dateFrom}
                onChange={e => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-panel-bg border border-border text-xs font-medium text-foreground outline-none focus:border-primary transition"
              />
              <Calendar className="w-4 h-4 text-muted-foreground absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Date To */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Date To
            </label>
            <div className="relative">
              <input
                type="date"
                value={dateTo}
                onChange={e => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-panel-bg border border-border text-xs font-medium text-foreground outline-none focus:border-primary transition"
              />
              <Calendar className="w-4 h-4 text-muted-foreground absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Zone Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Zone Filter
            </label>
            <div className="relative">
              <select
                value={selectedZone}
                onChange={e => handleZoneChange(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-panel-bg border border-border text-xs font-medium text-foreground outline-none focus:border-primary transition cursor-pointer appearance-none"
              >
                <option value="all">All Delivery Zones</option>
                {zones.map(z => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
              <MapPin className="w-4 h-4 text-muted-foreground absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Rider Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Courier / Rider
            </label>
            <div className="relative">
              <select
                value={selectedRider}
                onChange={e => {
                  setSelectedRider(e.target.value);
                  setPage(1);
                }}
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-panel-bg border border-border text-xs font-medium text-foreground outline-none focus:border-primary transition cursor-pointer appearance-none"
              >
                <option value="all">All Couriers ({filteredRiders.length})</option>
                {filteredRiders.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.mkb_id ? `(${r.mkb_id})` : ''}
                  </option>
                ))}
              </select>
              <UserCheck className="w-4 h-4 text-muted-foreground absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Search Input */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Search Courier
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name or MKB ID..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-panel-bg border border-border text-xs font-medium text-foreground outline-none focus:border-primary transition"
              />
              <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            Fetching historical parcel manifest logs...
          </div>
        ) : historyItems.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
            <PackageCheck className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <p className="font-semibold text-foreground">No Parcel History Logs Found</p>
            <p className="text-[11px]">Adjust your filter date range or search parameters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-panel-bg border-b border-border text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Shift Date</th>
                  <th className="py-3 px-4">Courier / Rider</th>
                  <th className="py-3 px-4">Zone</th>
                  <th className="py-3 px-4">Attendance</th>
                  <th className="py-3 px-4 text-right">Delivered</th>
                  <th className="py-3 px-4 text-right">Gross Wage Preview</th>
                  <th className="py-3 px-4">Payroll Cutoff</th>
                  <th className="py-3 px-4">Recorded By</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-foreground">
                {historyItems.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedDetailRow(row)}
                    className="hover:bg-panel-bg/80 transition cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-foreground whitespace-nowrap">
                      {row.date}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <RiderAvatar src={row.riderAvatar} name={row.riderName} className="w-7 h-7" />
                        <div>
                          <div className="font-semibold text-foreground">{row.riderName}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{row.riderMkbId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{row.zoneName}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge status={row.attendanceStatus} />
                    </td>
                    <td className="py-3 px-4 text-right font-bold font-mono text-primary tabular-nums whitespace-nowrap">
                      {row.deliveredParcels.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-bold font-mono text-emerald-700 tabular-nums whitespace-nowrap">
                      ₱{row.grossWagePreview.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                      {row.payrollCutoff}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-muted-foreground whitespace-nowrap">
                      <div className="font-medium text-foreground">{row.createdByName}</div>
                      {row.createdByDetail && <div className="text-[10px] text-muted-foreground">{row.createdByDetail}</div>}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedDetailRow(row);
                        }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white border border-transparent hover:border-border transition cursor-pointer"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 bg-panel-bg border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Showing <strong className="text-foreground">{historyItems.length}</strong> of{' '}
            <strong className="text-foreground">{totalCount}</strong> logs
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg bg-white border border-border hover:bg-panel-bg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-xs font-semibold px-2 text-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg bg-white border border-border hover:bg-panel-bg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Slide-over Detail Drawer */}
      {selectedDetailRow &&
        createPortal(
          <AnimatePresence>
            {selectedDetailRow && (
              <div className="fixed inset-0 z-[100000] flex justify-end">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSelectedDetailRow(null)}
                  className="fixed inset-0 bg-black/30 backdrop-blur-xs"
                />
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="w-full max-w-md bg-white border-l border-border shadow-2xl flex flex-col font-sans z-[100000]"
                >
                  <div className="p-5 border-b border-border flex items-center justify-between bg-panel-bg">
                    <div className="flex items-center gap-3">
                      <RiderAvatar src={selectedDetailRow.riderAvatar} name={selectedDetailRow.riderName} className="w-10 h-10" />
                      <div>
                        <h3 className="font-bold text-foreground text-sm">{selectedDetailRow.riderName}</h3>
                        <p className="text-xs text-muted-foreground font-mono">
                          MKB ID: {selectedDetailRow.riderMkbId} &bull; {selectedDetailRow.zoneName}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDetailRow(null)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="p-4 rounded-xl bg-panel-bg border border-border space-y-3">
                      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Operational Manifest Audit Summary
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-muted-foreground text-[11px]">Shift Date</div>
                          <div className="font-semibold font-mono text-foreground tabular-nums">{selectedDetailRow.date}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-[11px]">Attendance</div>
                          <StatusBadge status={selectedDetailRow.attendanceStatus} />
                        </div>
                        <div>
                          <div className="text-muted-foreground text-[11px]">Clock In</div>
                          <div className="font-semibold font-mono text-foreground tabular-nums">
                            {selectedDetailRow.timeIn || 'None'}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-[11px]">Delivered Parcels</div>
                          <div className="font-bold font-mono text-primary text-sm tabular-nums">
                            {selectedDetailRow.deliveredParcels.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Delivery Outcome Breakdown Card */}
                    <div className="p-4 rounded-xl bg-panel-bg border border-border space-y-3">
                      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                        <span>Delivery Outcome Breakdown</span>
                        <button
                          type="button"
                          onClick={() => setIsEditingDrawer(!isEditingDrawer)}
                          className="px-2.5 py-1 rounded-lg bg-white border border-border hover:bg-panel-bg text-[10.5px] font-semibold text-primary flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <Edit3 className="w-3 h-3" />
                          {isEditingDrawer ? 'Cancel Edit' : drawerCutoffLocked ? 'Request Correction' : 'Edit Manifest'}
                        </button>
                      </div>

                      {isEditingDrawer ? (
                        <div className="p-3.5 rounded-xl bg-white border border-border space-y-3 font-sans text-xs">
                          <div className="text-[11px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5 border-b border-border pb-2">
                            <PackageCheck className="w-3.5 h-3.5 text-primary" />
                            {drawerCutoffLocked ? 'Submit Correction Request' : 'Direct Operational Edit (Draft Status)'}
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10.5px] font-semibold text-muted-foreground mb-1">Delivered</label>
                              <input
                                type="number"
                                min={0}
                                value={editDelivered}
                                onChange={e => setEditDelivered(parseInt(e.target.value) || 0)}
                                className="w-full h-8 px-2 rounded-lg bg-panel-bg border border-border font-mono text-xs text-foreground font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-[10.5px] font-semibold text-muted-foreground mb-1">Failed</label>
                              <input
                                type="number"
                                min={0}
                                value={editFailed}
                                onChange={e => setEditFailed(parseInt(e.target.value) || 0)}
                                className="w-full h-8 px-2 rounded-lg bg-panel-bg border border-border font-mono text-xs text-foreground"
                              />
                            </div>
                            <div>
                              <label className="block text-[10.5px] font-semibold text-muted-foreground mb-1">Returned</label>
                              <input
                                type="number"
                                min={0}
                                value={editReturned}
                                onChange={e => setEditReturned(parseInt(e.target.value) || 0)}
                                className="w-full h-8 px-2 rounded-lg bg-panel-bg border border-border font-mono text-xs text-foreground"
                              />
                            </div>
                          </div>

                          {drawerCutoffLocked ? (
                            <div className="p-3 rounded-lg bg-amber-50/90 border border-amber-200 space-y-1.5 text-xs">
                              <div className="flex items-center gap-1.5 font-bold text-amber-900 uppercase text-[10px]">
                                <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                Locked Payroll Period
                              </div>
                              <p className="text-[10.5px] text-amber-800 leading-snug">
                                This shift's payroll cutoff is locked. All edits require an official Correction Request and Admin approval.
                              </p>
                              <label className="block text-[10.5px] font-semibold text-amber-900 pt-1">
                                Reason for Correction *
                              </label>
                              <textarea
                                rows={2}
                                value={editReason}
                                onChange={e => setEditReason(e.target.value)}
                                placeholder="State manifest discrepancy reason..."
                                className="w-full p-2 rounded-lg bg-white border border-amber-300 text-xs text-amber-950 outline-none focus:border-amber-600 font-sans"
                              />
                            </div>
                          ) : (
                            <div className="text-[10.5px] text-slate-600 italic">
                              Payroll cutoff is currently in draft. Edits will be applied directly to the operational log.
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setIsEditingDrawer(false)}
                              className="px-3 py-1.5 rounded-lg bg-white border border-border text-xs font-semibold text-muted-foreground hover:bg-panel-bg"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={submittingDrawerEdit || (drawerCutoffLocked && !editReason.trim())}
                              onClick={async () => {
                                setSubmittingDrawerEdit(true);
                                try {
                                  if (drawerCutoffLocked) {
                                    await createParcelCorrectionRequest({
                                      parcelLogId: selectedDetailRow.id,
                                      riderId: selectedDetailRow.riderId,
                                      date: selectedDetailRow.date,
                                      previousDelivered: selectedDetailRow.deliveredParcels,
                                      previousFailed: selectedDetailRow.failedDeliveries || 0,
                                      previousReturned: selectedDetailRow.returnedParcels || 0,
                                      requestedDelivered: editDelivered,
                                      requestedFailed: editFailed,
                                      requestedReturned: editReturned,
                                      reason: editReason,
                                      requestedBy: user?.id || user?.email || 'Operations Staff',
                                    });
                                    pushToast({
                                      title: 'Correction Request Submitted',
                                      description: 'Submitted correction request for Admin review. Manifest remains unchanged until approved.',
                                      tone: 'success'
                                    });
                                    loadCorrectionRequests();
                                  } else {
                                    await saveDailyParcelEntries(
                                      [
                                        {
                                          riderId: selectedDetailRow.riderId,
                                          date: selectedDetailRow.date,
                                          parcels: editDelivered,
                                          assignedParcels: selectedDetailRow.assignedParcels,
                                          failedDeliveries: editFailed,
                                          returnedParcels: editReturned,
                                          notes: selectedDetailRow.notes,
                                        }
                                      ],
                                      user?.id || user?.email || 'Operations Staff'
                                    );
                                    pushToast({
                                      title: 'Parcel Entry Updated',
                                      description: 'Operational manifest updated directly.',
                                      tone: 'success'
                                    });
                                    fetchHistory();
                                  }

                                  // Refresh audit logs
                                  getParcelLogAuditHistory(selectedDetailRow.id).then(setAuditLogs);
                                  setIsEditingDrawer(false);
                                } catch (err: unknown) {
                                  const msg = err instanceof Error ? err.message : 'Operation failed.';
                                  pushToast({ title: 'Error', description: msg, tone: 'error' });
                                } finally {
                                  setSubmittingDrawerEdit(false);
                                }
                              }}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ${
                                drawerCutoffLocked ? 'bg-amber-600 hover:bg-amber-700' : 'bg-primary hover:bg-primary-hover'
                              }`}
                            >
                              {submittingDrawerEdit ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : drawerCutoffLocked ? (
                                <ShieldCheck className="w-3.5 h-3.5" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              {drawerCutoffLocked ? 'Submit Correction Request' : 'Save Direct Edits'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="p-2.5 rounded-lg bg-emerald-50/80 border border-emerald-500/20">
                            <div className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Delivered</div>
                            <div className="text-base font-bold font-mono text-emerald-700 tabular-nums mt-0.5">
                              {selectedDetailRow.deliveredParcels.toLocaleString()}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-500/20">
                            <div className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Failed</div>
                            <div className="text-base font-bold font-mono text-amber-700 tabular-nums mt-0.5">
                              {(selectedDetailRow.failedDeliveries || 0).toLocaleString()}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-red-50/80 border border-red-500/20">
                            <div className="text-[10px] uppercase font-bold text-red-800 tracking-wider">Returned</div>
                            <div className="text-base font-bold font-mono text-red-700 tabular-nums mt-0.5">
                              {(selectedDetailRow.returnedParcels || 0).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedDetailRow.assignedParcels ? (
                        <div className="text-[11px] text-muted-foreground flex justify-between items-center border-t border-border/60 pt-2 font-mono">
                          <span>Assigned Manifest:</span>
                          <strong className="text-foreground font-bold">{selectedDetailRow.assignedParcels} parcels</strong>
                        </div>
                      ) : null}
                      {selectedDetailRow.notes ? (
                        <div className="text-[11px] text-muted-foreground bg-white p-2.5 rounded-lg border border-border italic whitespace-pre-wrap">
                          "{selectedDetailRow.notes}"
                        </div>
                      ) : null}
                    </div>

                    {/* Audit Log History Timeline Card */}
                    <div className="p-4 rounded-xl bg-panel-bg border border-border space-y-3">
                      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-primary" />
                          Operational Audit Trail &amp; History
                        </span>
                        {auditLogs.length > 0 && (
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {auditLogs.length} event(s)
                          </span>
                        )}
                      </div>
                      {loadingAudit ? (
                        <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          Loading audit timeline...
                        </div>
                      ) : auditLogs.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic p-3 rounded-lg bg-white border border-border text-center">
                          No historical modifications recorded. Manifest values represent original encoding.
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                          {auditLogs.map(log => {
                            const badgeStyle =
                              log.actionType === 'created'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : log.actionType === 'updated'
                                ? 'bg-slate-100 text-slate-700 border-slate-200'
                                : log.actionType === 'correction_requested'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : log.actionType === 'correction_approved'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200';

                            const label =
                              log.actionType === 'created'
                                ? 'Manifest Record Created'
                                : log.actionType === 'updated'
                                ? 'Direct Operational Edit'
                                : log.actionType === 'correction_requested'
                                ? 'Correction Requested'
                                : log.actionType === 'correction_approved'
                                ? 'Correction Approved'
                                : 'Correction Rejected';

                            return (
                              <div key={log.id} className="p-3 rounded-xl bg-white border border-border text-xs space-y-2 font-sans shadow-2xs">
                                <div className="flex items-center justify-between">
                                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${badgeStyle}`}>
                                    {label}
                                  </span>
                                  <span className="text-[10px] font-mono text-muted-foreground">
                                    {new Date(log.timestamp).toLocaleString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true
                                    })}
                                  </span>
                                </div>

                                <div className="text-[11px] text-muted-foreground grid grid-cols-2 gap-2 p-2 rounded-lg bg-panel-bg font-mono text-[10.5px]">
                                  <div>
                                    <span className="text-gray-500">Old (D/F/R):</span>{' '}
                                    <span className="font-semibold text-gray-700">{log.oldDelivered}/{log.oldFailed}/{log.oldReturned}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">New (D/F/R):</span>{' '}
                                    <span className="font-semibold text-emerald-700">{log.newDelivered}/{log.newFailed}/{log.newReturned}</span>
                                  </div>
                                </div>

                                {log.reason && (
                                  <div className="text-[11px] text-foreground bg-amber-50/50 p-2 rounded-lg border border-amber-200/60">
                                    <span className="font-semibold text-amber-900">Reason / Notes:</span> "{log.reason}"
                                  </div>
                                )}

                                <div className="text-[10px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/80 font-mono">
                                  <span>Requested By: <strong className="text-foreground">{log.changedByName || 'HR Staff'}</strong></span>
                                  {log.approvedBy && (
                                    <span>Reviewed By: <strong className="text-foreground">{log.approvedByName || 'Admin'}</strong></span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="p-4 rounded-xl bg-panel-bg border border-border space-y-2">
                      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                        <span>Operational Wage Estimate</span>
                        <span className="text-[10px] font-mono font-normal">Final rate set in Payroll</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-emerald-800 tabular-nums">
                        ₱{selectedDetailRow.grossWagePreview.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[11px] text-muted-foreground leading-tight">
                        Payroll Cutoff: <strong className="font-mono">{selectedDetailRow.payrollCutoff}</strong>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-panel-bg border border-border space-y-2 text-xs">
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Operator Identity
                      </div>
                      <div className="space-y-1.5 font-mono text-[11px]">
                        <div>
                          <span className="text-muted-foreground">Recorded By:</span>{' '}
                          <span className="text-foreground font-semibold">
                            {selectedDetailRow.createdByName || 'Operations Staff'}
                          </span>
                          {selectedDetailRow.createdByDetail && (
                            <div className="text-[10px] text-muted-foreground pl-4">
                              ({selectedDetailRow.createdByDetail})
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Updated At:</span>{' '}
                          <span className="text-foreground font-semibold tabular-nums">
                            {new Date(selectedDetailRow.updatedAt).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border-t border-border bg-panel-bg flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedDetailRow(null)}
                      className="px-4 py-2 rounded-lg bg-white border border-border text-xs font-semibold text-muted-foreground hover:bg-panel-bg cursor-pointer shadow-xs"
                    >
                      Close Drawer
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Correction Requests Review Modal */}
      {showCorrectionsModal &&
        createPortal(
          <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCorrectionsModal(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl border border-border shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col font-sans z-[100001]"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-accent text-primary border border-primary/20">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-foreground">Parcel Correction Requests Queue</h3>
                    <p className="text-xs text-muted-foreground">Review and approve or reject requested outcome changes for parcel manifests.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCorrectionsModal(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-panel-bg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3">
                {loadingCorrections ? (
                  <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    Loading correction requests...
                  </div>
                ) : correctionRequests.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                    <p className="font-medium text-foreground">No pending correction requests!</p>
                    <p className="text-[11px] text-muted-foreground">All manifest entries match approved operational logs.</p>
                  </div>
                ) : (
                  correctionRequests.map(req => (
                    <div key={req.id} className="p-4 rounded-xl bg-panel-bg border border-border space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <RiderAvatar src={req.riderAvatar} name={req.riderName || ''} className="w-9 h-9" />
                          <div>
                            <h4 className="font-bold text-xs text-foreground">{req.riderName}</h4>
                            <p className="text-[11px] font-mono text-muted-foreground">
                              MKB ID: {req.riderMkbId} &bull; Shift Date: <strong className="text-foreground">{req.date}</strong>
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-300 uppercase">
                          {req.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs bg-white p-3 rounded-lg border border-border font-mono">
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Previous Values</div>
                          <div>Delivered: <strong>{req.previousDelivered}</strong></div>
                          <div>Failed: <strong>{req.previousFailed}</strong></div>
                          <div>Returned: <strong>{req.previousReturned}</strong></div>
                        </div>
                        <div>
                          <div className="text-[10px] text-primary uppercase font-bold mb-1">Requested Target</div>
                          <div>Delivered: <strong className="text-emerald-700">{req.requestedDelivered}</strong></div>
                          <div>Failed: <strong className="text-amber-700">{req.requestedFailed}</strong></div>
                          <div>Returned: <strong className="text-red-700">{req.requestedReturned}</strong></div>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground bg-white p-2.5 rounded-lg border border-border space-y-1">
                        <div className="text-[10px] uppercase font-bold text-muted-foreground">Justification Reason:</div>
                        <div className="italic text-foreground">"{req.reason}"</div>
                        <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/60 flex justify-between">
                          <span>Requested By: <strong>{req.requestedByName}</strong></span>
                          <span>{new Date(req.requestedAt).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="space-y-2 pt-1">
                        <input
                          type="text"
                          placeholder="Admin review notes (optional)..."
                          value={reviewNotes[req.id] || ''}
                          onChange={e => setReviewNotes({ ...reviewNotes, [req.id]: e.target.value })}
                          className="w-full h-8 px-2.5 rounded-lg bg-white border border-border text-xs text-foreground outline-none focus:border-primary"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={processingId === req.id}
                            onClick={() => handleReviewDecision(req.id, 'rejected')}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {processingId === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            Reject
                          </button>
                          <button
                            type="button"
                            disabled={processingId === req.id}
                            onClick={() => handleReviewDecision(req.id, 'approved')}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-xs"
                          >
                            {processingId === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Approve Correction
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>,
          document.body
        )}
    </motion.div>
  );
}
