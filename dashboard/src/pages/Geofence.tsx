import { useEffect, useMemo, useRef, useState } from 'react';
import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

import { type Zone, type Rider, type ViolationEvent, type AttendanceLog } from '../services/types';
import {
  createZone,
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
import { ZoneFormPanel } from '../components/geofence/ZoneFormPanel';
import { AssignedRidersByZone } from '../components/geofence/AssignedRidersByZone';
import { pushToast } from '../hooks/useToast';
import { GeofenceDetailsPanel } from '../components/geofence/GeofenceDetailsPanels';

export function Geofence() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const refresh = () => setRefreshTrigger((n) => n + 1);

  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [ridersList, setRidersList] = useState<Rider[]>([]);
  const [violationsList, setViolationsList] = useState<ViolationEvent[]>([]);
  const [attendanceList, setAttendanceList] = useState<AttendanceLog[]>([]);
  const [violationsToday, setViolationsToday] = useState(0);

  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editZoneName, setEditZoneName] = useState('');
  const [editPin, setEditPin] = useState<{ lat: number; lng: number } | null>(null);
  const [editRadius, setEditRadius] = useState(1000);
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [selectedRiders, setSelectedRiders] = useState<string[]>([]);
  const [editZoneType, setEditZoneType] = useState<'circle' | 'polygon'>('circle');
  const [editPolygonCoords, setEditPolygonCoords] = useState<[number, number][]>([]);
  const [editColor, setEditColor] = useState('#db6c00');
  const [errors, setErrors] = useState<{ zoneName?: string; pin?: string; polygon?: string }>({});
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(new Set());
  const [activeSummaryModal, setActiveSummaryModal] = useState<'total_zones' | 'active_zones' | 'riders_assigned' | 'violations_today' | null>(null);

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
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (zonesList.length > 0 && !autoOpenedRef.current) {
      setOpenGroupIds(new Set([zonesList[0].id]));
      autoOpenedRef.current = true;
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

  const todayViolations = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return violationsList.filter((v) => v.ts >= startOfDay.getTime());
  }, [violationsList]);

  function openCreate() {
    setEditingZoneId(null);
    setEditZoneName('');
    setEditPin(null);
    setEditRadius(1000);
    setEditStatus('active');
    setSelectedRiders([]);
    setEditZoneType('circle');
    setEditPolygonCoords([]);
    
    // Choose first unused color from AVAILABLE_COLORS
    const used = zonesList.map(z => z.color);
    const firstFree = ['#db6c00', '#2563EB', '#059669', '#DC2626', '#7C3AED', '#D97706', '#0D9488', '#EC4899'].find(c => !used.includes(c)) || '#db6c00';
    setEditColor(firstFree);

    setErrors({});
    setIsEditing(true);
    setActiveZoneId(null);
  }

  function openEdit(zoneId: string) {
    const zoneToEdit = zonesList.find((z) => z.id === zoneId);
    if (!zoneToEdit) return;
    setEditingZoneId(zoneId);
    setEditZoneName(zoneToEdit.name);
    setEditPin(
      zoneToEdit.zone_type === 'polygon'
        ? null
        : { lat: zoneToEdit.center[0], lng: zoneToEdit.center[1] }
    );
    setEditRadius(zoneToEdit.radius || 1000);
    setEditStatus(zoneToEdit.status ?? 'active');
    setEditZoneType(zoneToEdit.zone_type || 'circle');
    setEditPolygonCoords(zoneToEdit.polygon_coordinates || []);
    setEditColor(zoneToEdit.color || '#db6c00');

    const assignedRiderIds = ridersList
      .filter((r) => r.zoneId === zoneId)
      .map((r) => r.id);
    setSelectedRiders(assignedRiderIds);
    setErrors({});
    setIsEditing(true);
    setActiveZoneId(zoneId);
  }

  function handleCancel() {
    setIsEditing(false);
    setEditingZoneId(null);
    setErrors({});
  }

  const handleMapClick = (lat: number, lng: number) => {
    if (editZoneType === 'circle') {
      setEditPin({ lat, lng });
    } else {
      setEditPolygonCoords((prev) => [...prev, [lat, lng]]);
    }
  };

  async function handleSaveInline() {
    const newErrors: { zoneName?: string; pin?: string; polygon?: string } = {};

    if (!editZoneName.trim()) {
      newErrors.zoneName = 'Zone name is required';
    }
    
    if (editZoneType === 'circle') {
      if (!editPin) {
        newErrors.pin = 'Please click on the map to set the zone center';
      }
    } else {
      if (editPolygonCoords.length < 3) {
        newErrors.polygon = 'Please add at least 3 points on the map';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    let finalPolygonCoords = editPolygonCoords;
    if (editZoneType === 'polygon') {
      const subtracted = subtractOverlappingZones(editPolygonCoords, zonesList, editingZoneId);
      if (subtracted.length < 3) {
        pushToast({
          title: 'Invalid shape',
          description: 'The zone is completely covered or overlaps too much with existing zones.',
          tone: 'error'
        });
        return;
      }
      finalPolygonCoords = subtracted;
    }

    const input: ZoneInput = {
      name: editZoneName.trim(),
      lat: editZoneType === 'circle' ? editPin!.lat : null,
      lng: editZoneType === 'circle' ? editPin!.lng : null,
      radius: editZoneType === 'circle' ? editRadius : null,
      status: editStatus,
      riderIds: selectedRiders,
      zone_type: editZoneType,
      polygon_coordinates: editZoneType === 'polygon' ? finalPolygonCoords : null,
      color: editColor,
    };

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
      setIsEditing(false);
      setEditingZoneId(null);
      refresh();
    } catch (err) {
      pushToast({
        title: 'Error saving zone',
        tone: 'error'
      });
    }
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
        violationsToday={violationsToday}
        onTotalZonesClick={() => setActiveSummaryModal((prev) => (prev === 'total_zones' ? null : 'total_zones'))}
        onActiveZonesClick={() => setActiveSummaryModal((prev) => (prev === 'active_zones' ? null : 'active_zones'))}
        onRidersAssignedClick={() => setActiveSummaryModal((prev) => (prev === 'riders_assigned' ? null : 'riders_assigned'))}
        onViolationsTodayClick={() => setActiveSummaryModal((prev) => (prev === 'violations_today' ? null : 'violations_today'))} />

      {/* Expanding Inline Details Panel */}
      {activeSummaryModal && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <GeofenceDetailsPanel
            type={activeSummaryModal}
            onClose={() => setActiveSummaryModal(null)}
            zones={zonesList}
            riders={ridersList}
            violations={todayViolations}
            onFocusZone={(zoneId) => {
              setActiveZoneId(zoneId);
              if (typeof window !== 'undefined') {
                window.scrollTo({
                  top: 0,
                  behavior: 'smooth'
                });
              }
            }}
          />
        </div>
      )}

      {/* Map + List */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <ZoneMapPreview
            zones={zonesList}
            activeZoneId={activeZoneId}
            onSelectZone={setActiveZoneId}
            isEditing={isEditing}
            zoneType={editZoneType}
            pin={editPin}
            polygonCoords={editPolygonCoords}
            onMapClick={handleMapClick}
            radius={editRadius}
            color={editColor}
          />
        </div>
        <div className="lg:col-span-2">
          {isEditing ? (
            <ZoneFormPanel
              zoneName={editZoneName}
              setZoneName={setEditZoneName}
              radius={editRadius}
              setRadius={setEditRadius}
              status={editStatus}
              setStatus={setEditStatus}
              selectedRiders={selectedRiders}
              setSelectedRiders={setSelectedRiders}
              riders={ridersList}
              pin={editPin}
              errors={errors}
              onSave={handleSaveInline}
              onCancel={handleCancel}
              isEditMode={!!editingZoneId}
              zoneType={editZoneType}
              setZoneType={setEditZoneType}
              polygonCoords={editPolygonCoords}
              setPolygonCoords={setEditPolygonCoords}
              color={editColor}
              setColor={setEditColor}
              usedColors={zonesList.filter(z => z.id !== editingZoneId).map(z => z.color)}
            />
          ) : (
            <ZoneListPanel
              zones={zonesList}
              riderCounts={riderCounts}
              activeZoneId={activeZoneId}
              onSelectZone={setActiveZoneId}
              onEdit={openEdit}
              onAdd={openCreate}
            />
          )}
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
        onSelectZone={handleSelectFromTable}
      />
    </div>
  );
}

/**
 * Subtracts overlapping areas of existing zones from the drawn polygon.
 */
function subtractOverlappingZones(
  newCoords: [number, number][],
  existingZones: Zone[],
  currentEditingId: string | null
): [number, number][] {
  if (newCoords.length < 3) return newCoords;

  // 1. Format coordinates to Turf LNG, LAT and close the loop
  const formattedNew = [...newCoords];
  if (
    formattedNew[0][0] !== formattedNew[formattedNew.length - 1][0] ||
    formattedNew[0][1] !== formattedNew[formattedNew.length - 1][1]
  ) {
    formattedNew.push(formattedNew[0]);
  }
  const newLngLat = formattedNew.map(([lat, lng]) => [lng, lat]);

  let currentTurfPoly: Feature<Polygon>;
  try {
    currentTurfPoly = turf.polygon([newLngLat]);
  } catch (err) {
    console.error('Failed to create Turf polygon:', err);
    return newCoords;
  }

  // 2. Subtract each other zone's area
  for (const zone of existingZones) {
    if (zone.id === currentEditingId) continue;

    let obstaclePoly: Feature<Polygon> | null = null;

    if (zone.zone_type === 'polygon' && zone.polygon_coordinates && zone.polygon_coordinates.length >= 3) {
      const obstacleCoords = [...zone.polygon_coordinates];
      if (
        obstacleCoords[0][0] !== obstacleCoords[obstacleCoords.length - 1][0] ||
        obstacleCoords[0][1] !== obstacleCoords[obstacleCoords.length - 1][1]
      ) {
        obstacleCoords.push(obstacleCoords[0]);
      }
      const obstacleLngLat = obstacleCoords.map(([lat, lng]) => [lng, lat]);
      try {
        obstaclePoly = turf.polygon([obstacleLngLat]);
      } catch (err) {
        console.warn('Failed to parse existing polygon:', zone.name, err);
        continue;
      }
    } else if (zone.zone_type === 'circle' && zone.center) {
      try {
        obstaclePoly = turf.circle(
          [zone.center[1], zone.center[0]], // [lng, lat]
          zone.radius / 1000, // km
          { steps: 64, units: 'kilometers' }
        );
      } catch (err) {
        console.warn('Failed to parse existing circle:', zone.name, err);
        continue;
      }
    }

    if (obstaclePoly) {
      try {
        let diff: Feature<Polygon | MultiPolygon> | null = null;
        // Turf v7 vs v6 compatible invocation
        try {
          diff = turf.difference(turf.featureCollection([currentTurfPoly, obstaclePoly]));
        } catch (e) {
          try {
            type Turf6DiffFn = (p1: Feature<Polygon>, p2: Feature<Polygon>) => Feature<Polygon | MultiPolygon> | null;
            diff = (turf.difference as unknown as Turf6DiffFn)(currentTurfPoly, obstaclePoly);
          } catch (e2) {
            console.error('Difference failed:', e2);
            continue;
          }
        }

        if (!diff) {
          console.warn('New zone completely overlaps an existing zone!');
          return [];
        }

        // If split into multiple pieces (MultiPolygon), select the largest contiguous area
        if (diff.geometry.type === 'MultiPolygon') {
          const multiCoords = diff.geometry.coordinates as number[][][][];
          let maxArea = 0;
          let bestPoly: Feature<Polygon> | null = null;
          for (const polyCoords of multiCoords) {
            const p = turf.polygon(polyCoords);
            const a = turf.area(p);
            if (a > maxArea) {
              maxArea = a;
              bestPoly = p;
            }
          }
          if (bestPoly) {
            currentTurfPoly = bestPoly;
          }
        } else if (diff.geometry.type === 'Polygon') {
          currentTurfPoly = diff as Feature<Polygon>;
        }
      } catch (err) {
        console.error('Turf operation error:', err);
      }
    }
  }

  // 3. Convert back to Leaflet [lat, lng][] (removing closing coordinate)
  try {
    const finalCoords = currentTurfPoly.geometry.coordinates[0];
    const leafletCoords = finalCoords.map((coord) => [coord[1], coord[0]]) as [number, number][];
    if (leafletCoords.length > 3) {
      leafletCoords.pop();
    }
    return leafletCoords;
  } catch (err) {
    console.error('Failed to translate Turf coordinates:', err);
    return newCoords;
  }
}
