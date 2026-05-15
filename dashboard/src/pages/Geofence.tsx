import React, { useEffect, useMemo, useState, memo } from 'react';
import { Plus } from 'lucide-react';
import {
  zones as initialZones,
  riders as allRiders,
  violations as allViolations,
  attendanceLogs,
  type Zone } from
'../services/mockData';
import {
  createZone,
  deleteZone,
  listZones,
  ridersInZone,
  riderCountByZone,
  totalViolationsToday,
  updateZone,
  type ZoneInput } from
'../services/geofenceService';
import { ZoneSummaryCards } from '../components/geofence/ZoneSummaryCards';
import { ZoneMapPreview } from '../components/geofence/ZoneMapPreview';
import { ZoneListPanel } from '../components/geofence/ZoneListPanel';
import { ZoneFormModal } from '../components/geofence/ZoneFormModal';
import { AssignedRidersByZone } from '../components/geofence/AssignedRidersByZone';
import { pushToast } from '../hooks/useToast';
export function Geofence() {
  // Trigger re-render after mutating the in-memory zones array
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(
    () => new Set(initialZones.length ? [initialZones[0].id] : [])
  );
  const zones: Zone[] = listZones();
  // Auto-open the group of the active zone, and scroll the page if needed
  useEffect(() => {
    if (!activeZoneId) return;
    setOpenGroupIds((prev) => {
      if (prev.has(activeZoneId)) return prev;
      const next = new Set(prev);
      next.add(activeZoneId);
      return next;
    });
  }, [activeZoneId]);
  const riderCounts = useMemo(() => riderCountByZone(), [zones, allRiders]);
  const violationCountByRider = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const counts: Record<string, number> = {};
    allViolations.forEach((v) => {
      if (v.ts < startOfDay.getTime()) return;
      counts[v.riderId] = (counts[v.riderId] ?? 0) + 1;
    });
    return counts;
  }, [allViolations]);
  const violationsToday = totalViolationsToday();
  const editingZone = editingZoneId ?
  zones.find((z) => z.id === editingZoneId) ?? null :
  null;
  const editingZoneRiderIds = editingZone ?
  ridersInZone(editingZone.id).map((r) => r.id) :
  [];
  function openCreate() {
    setEditingZoneId(null);
    setModalOpen(true);
  }
  function openEdit(zoneId: string) {
    setEditingZoneId(zoneId);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditingZoneId(null);
  }
  function handleSave(input: ZoneInput) {
    if (editingZoneId) {
      updateZone(editingZoneId, input);
      pushToast({
        title: 'Zone updated',
        description: `${input.name} saved successfully.`,
        tone: 'success'
      });
    } else {
      const zone = createZone(input);
      setActiveZoneId(zone.id);
      pushToast({
        title: 'Zone created',
        description: `${zone.name} added with ${input.riderIds.length} rider${input.riderIds.length === 1 ? '' : 's'}.`,
        tone: 'success'
      });
    }
    refresh();
    closeModal();
  }
  function handleDeleteRequest(zoneId: string) {
    setPendingDeleteId(zoneId);
  }
  function handleCancelDelete() {
    setPendingDeleteId(null);
  }
  function handleConfirmDelete(zoneId: string) {
    const { zone, unassignedRiderIds } = deleteZone(zoneId);
    setPendingDeleteId(null);
    if (activeZoneId === zoneId) setActiveZoneId(null);
    setOpenGroupIds((prev) => {
      const next = new Set(prev);
      next.delete(zoneId);
      return next;
    });
    refresh();
    if (zone) {
      pushToast({
        title: 'Zone deleted',
        description: `${zone.name} removed · ${unassignedRiderIds.length} rider${unassignedRiderIds.length === 1 ? '' : 's'} unassigned.`,
        tone: 'warning'
      });
    }
  }
  function handleDeleteFromModal() {
    if (!editingZoneId) return;
    const id = editingZoneId;
    closeModal();
    handleConfirmDelete(id);
  }
  function handleToggleGroup(zoneId: string) {
    setOpenGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);else
      next.add(zoneId);
      return next;
    });
  }
  function handleSelectFromTable(zoneId: string) {
    setActiveZoneId(zoneId);
    if (typeof window !== 'undefined') {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[#1A1410] font-semibold text-xl md:text-2xl tracking-tight">
            Geofence Zones
          </h2>
          <p className="text-sm text-[#6B6258] mt-0.5">
            Manage operational boundaries · Zamboanga City
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[#db6c00] hover:bg-[#b85a00] text-white text-sm font-semibold shadow-sm transition">
          
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Zone</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {/* Summary cards */}
      <ZoneSummaryCards
        zones={zones}
        riders={allRiders}
        violationsToday={violationsToday} />
      

      {/* Map + List */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <ZoneMapPreview
            zones={zones}
            activeZoneId={activeZoneId}
            onSelectZone={setActiveZoneId} />
          
        </div>
        <div className="lg:col-span-2">
          <ZoneListPanel
            zones={zones}
            riderCounts={riderCounts}
            activeZoneId={activeZoneId}
            onSelectZone={setActiveZoneId}
            onEdit={openEdit}
            onDelete={handleDeleteRequest}
            pendingDeleteId={pendingDeleteId}
            onConfirmDelete={handleConfirmDelete}
            onCancelDelete={handleCancelDelete} />
          
        </div>
      </div>

      {/* Assigned riders */}
      <AssignedRidersByZone
        zones={zones}
        riders={allRiders}
        attendanceLogs={attendanceLogs}
        violationCountByRider={violationCountByRider}
        openGroupIds={openGroupIds}
        onToggleGroup={handleToggleGroup}
        onSelectZone={handleSelectFromTable} />
      

      {/* Modal */}
      <ZoneFormModal
        open={modalOpen}
        onClose={closeModal}
        zone={editingZone}
        riders={allRiders}
        initialRiderIds={editingZoneRiderIds}
        onSave={handleSave}
        onDelete={handleDeleteFromModal} />
      
    </div>);

}