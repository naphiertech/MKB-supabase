import { useEffect, useMemo, useState } from 'react';

import { type Zone, type Rider, type ViolationEvent, type AttendanceLog } from '../services/types';
import {
  createZone,
  deleteZone,
  listZones,
  totalViolationsToday,
  updateZone,
  type ZoneInput
} from '../services/geofenceService';
import { getAllRiders } from '../services/monitoringService';
import { getViolations } from '../services/monitoringService';
import { getAttendanceLogs } from '../services/attendanceService';
import { ZoneSummaryCards } from '../components/geofence/ZoneSummaryCards';
import { ZoneMapPreview } from '../components/geofence/ZoneMapPreview';
import { ZoneListPanel } from '../components/geofence/ZoneListPanel';
import { ZoneFormModal } from '../components/geofence/ZoneFormModal';
import { AssignedRidersByZone } from '../components/geofence/AssignedRidersByZone';
import { pushToast } from '../hooks/useToast';

export function Geofence() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const refresh = () => setRefreshTrigger((n) => n + 1);

  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [ridersList, setRidersList] = useState<Rider[]>([]);
  const [violationsList, setViolationsList] = useState<ViolationEvent[]>([]);
  const [attendanceList, setAttendanceList] = useState<AttendanceLog[]>([]);
  const [violationsToday, setViolationsToday] = useState(0);

  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(new Set());

  // Load all live database records asynchronously on mount and refresh triggers
  useEffect(() => {
    async function loadData() {
      try {
        const [z, r, v, a, vt] = await Promise.all([
          listZones(),
          getAllRiders(),
          getViolations(),
          getAttendanceLogs(),
          totalViolationsToday()
        ]);
        setZonesList(z);
        setRidersList(r);
        setViolationsList(v);
        setAttendanceList(a);
        setViolationsToday(vt);
      } catch (err) {
        console.error('Failed to load geofence page data:', err);
      }
    }
    loadData();
  }, [refreshTrigger]);

  // Auto-open the group of the first zone when they finish loading
  useEffect(() => {
    if (zonesList.length > 0 && openGroupIds.size === 0) {
      setOpenGroupIds(new Set([zonesList[0].id]));
    }
  }, [zonesList]);

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

  // Compute rider counts per zone from local state
  const riderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    zonesList.forEach((z) => {
      counts[z.id] = ridersList.filter((r) => r.zoneId === z.id).length;
    });
    return counts;
  }, [zonesList, ridersList]);

  // Compute violations today per rider from local state
  const violationCountByRider = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const counts: Record<string, number> = {};
    violationsList.forEach((v) => {
      if (v.ts < startOfDay.getTime()) return;
      counts[v.riderId] = (counts[v.riderId] ?? 0) + 1;
    });
    return counts;
  }, [violationsList]);

  const editingZone = editingZoneId ?
  zonesList.find((z) => z.id === editingZoneId) ?? null :
  null;

  const editingZoneRiderIds = editingZone ?
  ridersList.filter((r) => r.zoneId === editingZone.id).map((r) => r.id) :
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

  async function handleSave(input: ZoneInput) {
    try {
      if (editingZoneId) {
        await updateZone(editingZoneId, input);
        pushToast({
          title: 'Zone updated',
          description: `${input.name} saved successfully.`,
          tone: 'success'
        });
      } else {
        const zone = await createZone(input);
        setActiveZoneId(zone.id);
        pushToast({
          title: 'Zone created',
          description: `${zone.name} added successfully.`,
          tone: 'success'
        });
      }
      refresh();
      closeModal();
    } catch (err) {
      pushToast({
        title: 'Error saving zone',
        tone: 'error'
      });
    }
  }

  function handleDeleteRequest(zoneId: string) {
    setPendingDeleteId(zoneId);
  }

  function handleCancelDelete() {
    setPendingDeleteId(null);
  }

  async function handleConfirmDelete(zoneId: string) {
    try {
      const { zone } = await deleteZone(zoneId);
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
          description: `${zone.name} removed successfully.`,
          tone: 'warning'
        });
      }
    } catch (err) {
      pushToast({
        title: 'Error deleting zone',
        tone: 'error'
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
      if (next.has(zoneId)) next.delete(zoneId); else next.add(zoneId);
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
      {/* Summary cards */}
      <ZoneSummaryCards
        zones={zonesList}
        riders={ridersList}
        violationsToday={violationsToday} />

      {/* Map + List */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <ZoneMapPreview
            zones={zonesList}
            activeZoneId={activeZoneId}
            onSelectZone={setActiveZoneId} />
        </div>
        <div className="lg:col-span-2">
          <ZoneListPanel
            zones={zonesList}
            riderCounts={riderCounts}
            activeZoneId={activeZoneId}
            onSelectZone={setActiveZoneId}
            onEdit={openEdit}
            onDelete={handleDeleteRequest}
            pendingDeleteId={pendingDeleteId}
            onConfirmDelete={handleConfirmDelete}
            onCancelDelete={handleCancelDelete}
            onAdd={openCreate} />
        </div>
      </div>

      {/* Assigned riders */}
      <AssignedRidersByZone
        zones={zonesList}
        riders={ridersList}
        attendanceLogs={attendanceList}
        violationCountByRider={violationCountByRider}
        openGroupIds={openGroupIds}
        onToggleGroup={handleToggleGroup}
        onSelectZone={handleSelectFromTable} />

      {/* Modal */}
      <ZoneFormModal
        open={modalOpen}
        onClose={closeModal}
        zone={editingZone}
        riders={ridersList}
        initialRiderIds={editingZoneRiderIds}
        onSave={handleSave}
        onDelete={handleDeleteFromModal} />
    </div>
  );
}
