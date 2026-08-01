import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Search,
  Loader2,
  MapPin,
  Clock,
  ChevronLeft,
  ChevronRight,
  Info,
  PackageCheck,
  X,
  FileSpreadsheet,
  UserCheck
} from 'lucide-react';
import {
  getParcelHistory,
  type ParcelHistoryItem
} from '../services/operationsService';
import { getRidersLookup } from '../services/riderService';
import { getZones } from '../services/geofenceService';
import type { Zone } from '../services/types';
import { pushToast } from '../hooks/useToast';
import { getLocalDateString } from '../services/attendanceService';
import { PAGE_TRANSITION_VARIANTS } from '../lib/motion';
import { RiderAvatar } from '../components/common/RiderAvatar';

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
      <div className="bg-white border border-[#EFEAE2] rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-[#FFF1E0] border border-[#db6c00]/20 text-[#db6c00] shrink-0 mt-0.5">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#1A1410]">Operational Parcel Manifest History</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FFF1E0] text-[#db6c00] border border-[#db6c00]/20">
                Audit Trail
              </span>
            </div>
            <p className="text-xs text-[#6B6258] mt-0.5 leading-relaxed">
              Historical record of physical parcel delivery manifests merged with read-only attendance context and payroll cutoff period labels.
            </p>
          </div>
        </div>

        <div className="text-xs font-mono text-[#6B6258] bg-[#FAFAF7] border border-[#EFEAE2] px-3.5 py-2 rounded-lg shadow-xs shrink-0 self-end md:self-auto">
          Total Manifest Logs: <strong className="text-[#1A1410] font-bold tabular-nums">{totalCount.toLocaleString()}</strong>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl p-4 space-y-3 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Date From */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6B6258] uppercase tracking-wider mb-1">
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
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-xs font-medium text-[#1A1410] outline-none focus:border-[#db6c00] transition"
              />
              <Calendar className="w-4 h-4 text-[#6B6258] absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Date To */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6B6258] uppercase tracking-wider mb-1">
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
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-xs font-medium text-[#1A1410] outline-none focus:border-[#db6c00] transition"
              />
              <Calendar className="w-4 h-4 text-[#6B6258] absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Zone Filter (Parent) */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6B6258] uppercase tracking-wider mb-1">
              Filter Zone
            </label>
            <select
              value={selectedZone}
              onChange={e => handleZoneChange(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-xs font-medium text-[#1A1410] outline-none focus:border-[#db6c00] transition"
            >
              <option value="all">All Zones</option>
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
              onChange={e => {
                setSelectedRider(e.target.value);
                setPage(1);
              }}
              className="w-full h-9 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-xs font-medium text-[#1A1410] outline-none focus:border-[#db6c00] transition"
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

          {/* Search Bar */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6B6258] uppercase tracking-wider mb-1">
              Search Query
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Rider Name or ID..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-xs font-medium text-[#1A1410] placeholder:text-[#A39988] outline-none focus:border-[#db6c00] transition"
              />
              <Search className="w-4 h-4 text-[#6B6258] absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <Loader2 className="w-6 h-6 text-[#db6c00] animate-spin mx-auto" />
            <p className="text-xs text-[#6B6258] font-medium">Fetching manifest audit logs...</p>
          </div>
        ) : historyItems.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <PackageCheck className="w-8 h-8 text-[#A39988] mx-auto opacity-50" />
            <p className="text-xs font-semibold text-[#1A1410]">No Parcel History Logs Found</p>
            <p className="text-[11px] text-[#6B6258]">
              No recorded daily parcel logs match the active filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAFAF7] border-b border-[#EFEAE2] text-[10.5px] uppercase tracking-wider text-[#6B6258] font-bold">
                  <th className="px-4 py-3 text-left align-middle whitespace-nowrap">Date Logged</th>
                  <th className="px-4 py-3 text-left align-middle whitespace-nowrap">Rider Courier</th>
                  <th className="px-4 py-3 text-left align-middle whitespace-nowrap">Zone</th>
                  <th className="px-4 py-3 text-left align-middle whitespace-nowrap">Attendance</th>
                  <th className="px-4 py-3 text-left align-middle whitespace-nowrap">Time In</th>
                  <th className="px-4 py-3 text-right align-middle whitespace-nowrap">
                    Delivered Parcels <span className="text-[#db6c00] font-normal text-[10px] lowercase">(primary)</span>
                  </th>
                  <th className="px-4 py-3 text-right align-middle whitespace-nowrap">
                    Gross Wage Preview <span className="text-gray-400 font-normal text-[10px] lowercase">(est)</span>
                  </th>
                  <th className="px-4 py-3 text-left align-middle whitespace-nowrap">Payroll Cutoff</th>
                  <th className="px-4 py-3 text-left align-middle whitespace-nowrap">Recorded By</th>
                  <th className="px-4 py-3 text-right align-middle whitespace-nowrap">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEAE2]">
                {historyItems.map(item => (
                  <tr key={item.id} className="hover:bg-[#FAFAF7]/80 transition">
                    {/* Date Logged */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap font-mono font-bold text-[#1A1410] tabular-nums">
                      {item.date}
                    </td>

                    {/* Rider Courier */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <div>
                        <div className="font-bold text-[#1A1410] text-xs leading-none">{item.riderName}</div>
                        <div className="text-[10px] font-mono text-[#6B6258] mt-0.5 leading-none">{item.riderMkbId}</div>
                      </div>
                    </td>

                    {/* Zone */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap font-medium text-[#1A1410]">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <MapPin className="w-3 h-3 text-[#6B6258]" />
                        {item.zoneName}
                      </span>
                    </td>

                    {/* Attendance Status */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <StatusBadge status={item.attendanceStatus} />
                    </td>

                    {/* Time In */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap font-mono text-xs">
                      {item.timeIn ? (
                        <span className="inline-flex items-center gap-1 text-[#1A1410] font-medium tabular-nums">
                          <Clock className="w-3 h-3 text-[#db6c00]" />
                          {item.timeIn}
                        </span>
                      ) : (
                        <span className="text-[#A39988] italic text-[11px]">No Clock-in</span>
                      )}
                    </td>

                    {/* Delivered Parcels (Primary Operational Focus - Bold Orange) */}
                    <td className="px-4 py-3 text-right align-middle whitespace-nowrap font-mono font-bold text-sm text-[#db6c00] tabular-nums">
                      {item.deliveredParcels.toLocaleString()}
                    </td>

                    {/* Gross Wage Preview (Secondary De-Emphasized - Smaller Green Text) */}
                    <td className="px-4 py-3 text-right align-middle whitespace-nowrap font-mono font-medium text-[11px] text-emerald-700/80 tabular-nums">
                      ₱{item.grossWagePreview.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Payroll Cutoff (Supporting Information - Muted Gray Badge) */}
                    <td className="px-4 py-3 text-left align-middle whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-[#FAFAF7] border border-[#EFEAE2] font-mono text-[10.5px] text-[#6B6258]">
                        {item.payrollCutoff}
                      </span>
                    </td>

                    {/* Recorded By (Operator Identity - Zero UUIDs) */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap text-left">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-[#6B6258] shrink-0" />
                        <div>
                          <div className="font-semibold text-[#1A1410] text-xs leading-none">
                            {item.createdByName || 'Operations Staff'}
                          </div>
                          {item.createdByDetail && (
                            <div className="text-[10px] font-mono text-[#6B6258] mt-0.5 leading-none">
                              {item.createdByDetail}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Details Action */}
                    <td className="px-4 py-3 text-right align-middle whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedDetailRow(item)}
                        className="h-7 px-2.5 rounded bg-white border border-[#EFEAE2] hover:bg-[#FAFAF7] text-[#db6c00] text-[11px] font-semibold transition cursor-pointer inline-flex items-center gap-1 shadow-xs"
                      >
                        <Info className="w-3 h-3" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-[#FAFAF7] border-t border-[#EFEAE2] flex items-center justify-between text-xs text-[#6B6258]">
          <div>
            Showing <strong className="text-[#1A1410] tabular-nums">{historyItems.length}</strong> of{' '}
            <strong className="text-[#1A1410] tabular-nums">{totalCount}</strong> recorded logs
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="h-8 px-2.5 rounded-lg border border-[#EFEAE2] bg-white hover:bg-[#FAFAF7] text-[#1A1410] font-medium transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1 shadow-xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <span className="font-mono text-xs font-semibold px-2 text-[#1A1410] tabular-nums">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="h-8 px-2.5 rounded-lg border border-[#EFEAE2] bg-white hover:bg-[#FAFAF7] text-[#1A1410] font-medium transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1 shadow-xs"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Row Detail Drawer (Portaled to document.body to bypass parent CSS transforms) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {selectedDetailRow && (
              <div className="fixed inset-0 z-[99999] overflow-hidden">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSelectedDetailRow(null)}
                  className="absolute inset-0 bg-black/30 backdrop-blur-xs"
                />
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="absolute inset-y-0 right-0 w-full max-w-md bg-white border-l border-[#EFEAE2] shadow-2xl flex flex-col font-sans z-[100000]"
                >
                  <div className="p-5 border-b border-[#EFEAE2] flex items-center justify-between bg-[#FAFAF7]">
                    <div className="flex items-center gap-3">
                      <RiderAvatar src={selectedDetailRow.riderAvatar} name={selectedDetailRow.riderName} className="w-10 h-10" />
                      <div>
                        <h3 className="font-bold text-[#1A1410] text-sm">{selectedDetailRow.riderName}</h3>
                        <p className="text-xs text-[#6B6258] font-mono">
                          MKB ID: {selectedDetailRow.riderMkbId} &bull; {selectedDetailRow.zoneName}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDetailRow(null)}
                      className="p-1.5 rounded-lg text-[#6B6258] hover:text-[#1A1410] hover:bg-white transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="p-4 rounded-xl bg-[#FAFAF7] border border-[#EFEAE2] space-y-3">
                      <div className="text-[11px] font-bold text-[#6B6258] uppercase tracking-wider">
                        Operational Manifest Audit Summary
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-[#6B6258] text-[11px]">Shift Date</div>
                          <div className="font-semibold font-mono text-[#1A1410] tabular-nums">{selectedDetailRow.date}</div>
                        </div>
                        <div>
                          <div className="text-[#6B6258] text-[11px]">Attendance</div>
                          <StatusBadge status={selectedDetailRow.attendanceStatus} />
                        </div>
                        <div>
                          <div className="text-[#6B6258] text-[11px]">Clock In</div>
                          <div className="font-semibold font-mono text-[#1A1410] tabular-nums">
                            {selectedDetailRow.timeIn || 'None'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[#6B6258] text-[11px]">Delivered Parcels</div>
                          <div className="font-bold font-mono text-[#db6c00] text-sm tabular-nums">
                            {selectedDetailRow.deliveredParcels.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Delivery Outcome Breakdown Card */}
                    <div className="p-4 rounded-xl bg-[#FAFAF7] border border-[#EFEAE2] space-y-3">
                      <div className="text-[11px] font-bold text-[#6B6258] uppercase tracking-wider flex items-center justify-between">
                        <span>Delivery Outcome Breakdown</span>
                        <span className="text-[10px] font-mono text-[#6B6258] font-normal">Manifest Audit</span>
                      </div>
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
                      {selectedDetailRow.assignedParcels ? (
                        <div className="text-[11px] text-[#6B6258] flex justify-between items-center border-t border-[#EFEAE2]/60 pt-2 font-mono">
                          <span>Assigned Manifest:</span>
                          <strong className="text-[#1A1410] font-bold">{selectedDetailRow.assignedParcels} parcels</strong>
                        </div>
                      ) : null}
                      {selectedDetailRow.notes ? (
                        <div className="text-[11px] text-[#6B6258] bg-white p-2.5 rounded-lg border border-[#EFEAE2] italic whitespace-pre-wrap">
                          "{selectedDetailRow.notes}"
                        </div>
                      ) : null}
                    </div>

                    <div className="p-4 rounded-xl bg-[#FAFAF7] border border-[#EFEAE2] space-y-2">
                      <div className="text-[11px] font-bold text-[#6B6258] uppercase tracking-wider flex items-center justify-between">
                        <span>Gross Wage Preview (Secondary)</span>
                        <span className="text-[10px] font-mono font-normal">Baseline ₱10/parcel</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-emerald-800 tabular-nums">
                        ₱{selectedDetailRow.grossWagePreview.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[11px] text-[#6B6258] leading-tight">
                        Payroll Cutoff: <strong className="font-mono">{selectedDetailRow.payrollCutoff}</strong>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#FAFAF7] border border-[#EFEAE2] space-y-2 text-xs">
                      <div className="text-[11px] font-semibold text-[#6B6258] uppercase tracking-wider">
                        Operator Identity
                      </div>
                      <div className="space-y-1.5 font-mono text-[11px]">
                        <div>
                          <span className="text-[#6B6258]">Recorded By:</span>{' '}
                          <span className="text-[#1A1410] font-semibold">
                            {selectedDetailRow.createdByName || 'Operations Staff'}
                          </span>
                          {selectedDetailRow.createdByDetail && (
                            <div className="text-[10px] text-[#6B6258] pl-4">
                              ({selectedDetailRow.createdByDetail})
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="text-[#6B6258]">Updated At:</span>{' '}
                          <span className="text-[#1A1410] font-semibold tabular-nums">
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

                  <div className="p-4 border-t border-[#EFEAE2] bg-[#FAFAF7] flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedDetailRow(null)}
                      className="px-4 py-2 rounded-lg bg-white border border-[#EFEAE2] text-xs font-semibold text-[#6B6258] hover:bg-[#FAFAF7] cursor-pointer shadow-xs"
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
    </motion.div>
  );
}
