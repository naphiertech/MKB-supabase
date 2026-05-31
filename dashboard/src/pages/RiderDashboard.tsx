import { useEffect, useMemo, useState } from 'react';
import {
  haversine,
  type Rider,
  type Zone } from
'../services/types';
import { supabase } from '../lib/supabaseClient';
import { recordTimeIn, recordTimeOut } from '../services/attendanceService';
import { getZones } from '../services/geofenceService';
import { useGeolocation } from '../hooks/useGeolocation';
import { useFaceRecognition } from '../hooks/useFaceRecognition';
import { Modal } from '../components/common/Modal';
import { FaceScanner } from '../components/attendance/FaceScanner';
import { AttendanceButton } from '../components/attendance/AttendanceButton';
import { AttendanceStatus } from '../components/attendance/AttendanceStatus';
import { RiderMap } from '../components/maps/RiderMap';
import { IdentityBanner } from '../components/rider/IdentityBanner';
import { GeofenceStatus } from '../components/rider/GeofenceStatus';
import {
  ActivityTimeline,
  type ActivityEvent } from
'../components/rider/ActivityTimeline';
import { PersonalStats } from '../components/rider/PersonalStats';
import { pushToast } from '../hooks/useToast';
import { DashboardSkeleton } from '../components/common/DashboardSkeleton';

interface RiderDashboardProps {
  userId: string;
}

function nowHHMM(d: Date = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toHHMM(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

function format12h(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = (h + 11) % 12 + 1;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function diffPretty(fromHHMM: string, to: Date = new Date()) {
  const [h, m] = fromHHMM.split(':').map(Number);
  const start = new Date();
  start.setHours(h, m, 0, 0);
  let diff = Math.max(0, to.getTime() - start.getTime());
  const hours = Math.floor(diff / 3600000);
  diff -= hours * 3600000;
  const mins = Math.floor(diff / 60000);
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

export function RiderDashboard({ userId }: RiderDashboardProps) {
  const riderId = userId.replace(/^u-rider-/, '');
  const [actualRiderId, setActualRiderId] = useState<string>(riderId);
  const [rider, setRider] = useState<Rider | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [loading, setLoading] = useState(true);

  const [timeIn, setTimeIn] = useState<string | null>(null);
  const [timeOut, setTimeOut] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'time-in' | 'time-out'>('time-in');

  const { phase, progress, result, start, reset, videoRef, canvasRef } = useFaceRecognition({
    referenceAvatar: rider?.avatar
  });

  useEffect(() => {
    async function loadRiderAndZone() {
      try {
        setLoading(true);

        // Retrieve the linked rider_id using the logged-in Auth UUID
        const { data: dbUser } = await supabase
          .from('users')
          .select('rider_id')
          .eq('id', userId)
          .maybeSingle();

        const resolvedRiderId = dbUser?.rider_id || riderId;
        setActualRiderId(resolvedRiderId);

        const { data: dbRider, error } = await supabase
          .from('riders')
          .select('*')
          .eq('id', resolvedRiderId)
          .maybeSingle();

        if (!error && dbRider) {
          const mappedRider: Rider = {
            id: dbRider.id,
            name: dbRider.name,
            avatar: dbRider.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(dbRider.name)}`,
            zoneId: dbRider.zone_id,
            status: dbRider.status,
            lat: dbRider.lat || 0,
            lng: dbRider.lng || 0,
            speed: dbRider.speed || 0,
            shift: (dbRider.shift || 'Morning').toLowerCase() as any,
            lastPing: dbRider.last_ping ? new Date(dbRider.last_ping).getTime() : Date.now(),
            phone: dbRider.contact || '',
            riderCode: dbRider.mkb_id
          };
          setRider(mappedRider);

          if (dbRider.zone_id) {
            const { data: dbZone } = await supabase
              .from('zones')
              .select('*')
              .eq('id', dbRider.zone_id)
              .maybeSingle();

            if (dbZone) {
              setZone({
                id: dbZone.id,
                name: dbZone.name,
                center: [dbZone.lat, dbZone.lng],
                radius: dbZone.radius,
                color: dbZone.color,
                status: dbZone.status
              });
            }
          } else {
            const zList = await getZones();
            if (zList.length > 0) {
              setZone(zList[0]);
            }
          }

          // Fetch attendance logs for today using the resolved Rider UUID
          const todayStr = new Date().toISOString().slice(0, 10);
          const { data: attLog } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('rider_id', resolvedRiderId)
            .eq('date', todayStr)
            .maybeSingle();

          if (attLog) {
            setTimeIn(attLog.time_in ? toHHMM(attLog.time_in) : null);
            setTimeOut(attLog.time_out ? toHHMM(attLog.time_out) : null);
          }
        }
      } catch (err) {
        console.error('Error loading rider dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadRiderAndZone();
  }, [userId, riderId]);

  const zoneCenterLat = zone?.center[0] ?? 6.9214;
  const zoneCenterLng = zone?.center[1] ?? 122.0790;
  const zoneRadius = zone?.radius ?? 1000;
  const zoneName = zone?.name ?? 'Talon-Talon';

  const anchor = useMemo(
    () => ({
      lat: zoneCenterLat + 0.0006,
      lng: zoneCenterLng + 0.0004
    }),
    [zoneCenterLat, zoneCenterLng]
  );

  const { position } = useGeolocation({
    initial: anchor,
    jitter: 0.00018
  });

  const distance = useMemo(
    () => haversine(zoneCenterLat, zoneCenterLng, position.lat, position.lng),
    [position.lat, position.lng, zoneCenterLat, zoneCenterLng]
  );

  const inZone = distance <= zoneRadius;

  const action: 'time-in' | 'time-out' | 'completed' =
    timeIn && timeOut ? 'completed' : timeIn ? 'time-out' : 'time-in';

  const [events, setEvents] = useState<ActivityEvent[]>([]);

  // Seed events once rider is loaded
  useEffect(() => {
    if (rider && zone) {
      setEvents([
        {
          id: 'seed-1',
          ts: '06:58',
          kind: 'note',
          label: 'Shift assignment received',
          detail: `Zone ${zoneName} · ${rider.shift.charAt(0).toUpperCase() + rider.shift.slice(1)} shift`
        }
      ]);
    }
  }, [rider, zone, zoneName]);

  useEffect(() => {
    if (!timeIn || timeOut || !zone) return;
    const id = window.setInterval(() => {
      setEvents((prev) => [
        {
          id: `geo-${Date.now()}`,
          ts: nowHHMM(),
          kind: inZone ? 'geofence_ok' : 'geofence_alert',
          label: inZone ? 'Geofence check passed' : 'Boundary alert triggered',
          detail: inZone ?
            `Within ${zoneName} · ${Math.round(distance)}m from center` :
            `Outside ${zoneName} by ${Math.round(distance - zoneRadius)}m`
        },
        ...prev
      ]);
    }, 90000);
    return () => window.clearInterval(id);
  }, [timeIn, timeOut, inZone, zoneName, zoneRadius, distance, zone]);

  const onlineStatus =
    timeIn && !timeOut ? 'online' : 'offline';
  const shiftStatus =
    timeIn && !timeOut ?
      'on_duty' :
      timeIn && timeOut ?
        'completed' :
        'not_started';

  function openScan(next: 'time-in' | 'time-out') {
    setPendingAction(next);
    reset();
    setScanOpen(true);
    window.setTimeout(start, 220);
  }

  useEffect(() => {
    if (phase !== 'matched' || !result?.matched || !rider || !actualRiderId) return;
    const stamp = nowHHMM(new Date(result.capturedAt));
    if (pendingAction === 'time-in') {
      recordTimeIn(actualRiderId).then(() => {
        setTimeIn(stamp);
        setEvents((prev) => [
          {
            id: `ti-${Date.now()}`,
            ts: stamp,
            kind: 'time_in',
            label: 'Time-In recorded (Facial Recognition)',
            detail: `Confidence ${result.confidence.toFixed(2)} · CAM-01`
          },
          ...prev
        ]);
        pushToast({
          title: 'Time-In recorded',
          description: `Welcome on shift, ${rider.name.split(' ')[0]}.`,
          tone: 'success'
        });
      }).catch((err) => {
        console.error('Error ticking in:', err);
        pushToast({
          title: 'Time-In failed',
          description: 'Database clock-in failed. Please try again.',
          tone: 'error'
        });
      });
    } else {
      recordTimeOut(actualRiderId).then(() => {
        setTimeOut(stamp);
        setEvents((prev) => [
          {
            id: `to-${Date.now()}`,
            ts: stamp,
            kind: 'time_out',
            label: 'Time-Out recorded (Facial Recognition)',
            detail: `Shift duration · ${timeIn ? diffPretty(timeIn, new Date(result.capturedAt)) : '—'}`
          },
          ...prev
        ]);
        pushToast({
          title: 'Time-Out recorded',
          description: 'Great work today. Drive safe.',
          tone: 'success'
        });
      }).catch((err) => {
        console.error('Error ticking out:', err);
        pushToast({
          title: 'Time-Out failed',
          description: 'Database clock-out failed. Please try again.',
          tone: 'error'
        });
      });
    }
    const t = window.setTimeout(() => setScanOpen(false), 1200);
    return () => window.clearTimeout(t);
  }, [phase, result]);

  const duration =
    timeIn && !timeOut ?
      diffPretty(timeIn) :
      timeIn && timeOut ?
        diffPretty(timeIn, parseTime(timeOut)) :
        null;

  function parseTime(hhmm: string) {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }

  if (loading || !rider || !zone) {
    return <DashboardSkeleton page="dashboard" role="rider" />;
  }

  const today = new Date();
  const monthDays = today.getDate();
  const daysPresent = Math.max(1, monthDays - 2);
  const hoursThisWeek = 38.5;
  const violationsThisMonth = 0;

  return (
    <div className="p-4 md:p-6 lg:p-7 max-w-6xl mx-auto space-y-5">
      {/* 1. Identity banner */}
      <IdentityBanner
        name={rider.name}
        zoneName={zoneName}
        date={today}
        onlineStatus={onlineStatus}
        shiftStatus={shiftStatus} />

      {/* 2. Time-In/Out hero panel */}
      <section className="rounded-2xl border border-[#EFEAE2] bg-white p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-5">
          <div className="text-center text-[10px] uppercase tracking-[0.2em] text-[#6B6258] font-mono">
            Attendance · Face Verified
          </div>
          <h2 className="text-[#1A1410] font-semibold text-lg sm:text-xl tracking-tight mt-1">
            {action === 'time-in' ?
              'Ready to start your shift?' :
              action === 'time-out' ?
                "Wrapping up? Let's clock you out." :
                'You are all done for today.'}
          </h2>
        </div>

        <AttendanceButton
          action={action}
          onClick={() =>
            openScan(action === 'time-out' ? 'time-out' : 'time-in')
          } />

        <div className="mt-6">
          <AttendanceStatus
            timeIn={timeIn ? format12h(timeIn) : null}
            timeOut={timeOut ? format12h(timeOut) : null}
            duration={duration} />
        </div>
      </section>

      {/* 3. My Location & Geofence */}
      <section className="rounded-2xl border border-[#EFEAE2] bg-white p-5 space-y-4 shadow-sm">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-[#1A1410] font-semibold text-base">
              My Location
            </h2>
            <p className="text-[11px] text-[#6B6258] font-mono mt-0.5">
              Live GPS · {zoneName} geofence ({zoneRadius}m)
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-[0.16em] text-[#6B6258] font-mono">
            Accuracy ±{Math.round(position.accuracy)}m
          </span>
        </header>

        <RiderMap
          position={position}
          zone={zone}
          inZone={inZone}
          height="320px" />

        <GeofenceStatus
          inZone={inZone}
          zoneName={zoneName}
          distance={distance}
          radius={zoneRadius} />
      </section>

      {/* 4. Activity + 5. Stats */}
      <ActivityTimeline events={events} />

      <PersonalStats
        daysPresent={daysPresent}
        monthDays={monthDays}
        hoursThisWeek={hoursThisWeek}
        violationsThisMonth={violationsThisMonth} />

      {/* Face-scan modal */}
      <Modal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        title={
          pendingAction === 'time-in' ?
            'Face Scan · Time-In' :
            'Face Scan · Time-Out'
        }
        subtitle="Hold still — verifying against your enrolled template."
        dismissible={phase !== 'scanning' && phase !== 'initializing'}
        size="md">

        <FaceScanner
          phase={phase}
          progress={progress}
          riderName={rider.name}
          riderAvatar={rider.avatar}
          confidence={result?.confidence}
          videoRef={videoRef}
          canvasRef={canvasRef} />

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-[11px] text-[#6B6258] font-mono">
            {nowHHMM()} · {zoneName}
          </span>
          {phase === 'failed' ?
            <div className="flex gap-2">
              <button
                onClick={() => setScanOpen(false)}
                className="px-4 h-9 rounded-md text-sm text-[#1A1410] bg-[#FAFAF7] border border-[#EFEAE2] hover:bg-white hover:border-[#db6c00]/30 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  reset();
                  start();
                }}
                className="px-4 h-9 rounded-md text-sm text-white bg-[#db6c00] hover:bg-[#b85a00] transition-colors shadow-sm">
                Retry scan
              </button>
            </div> :
            phase === 'matched' ?
              <button
                onClick={() => setScanOpen(false)}
                className="px-4 h-9 rounded-md text-sm text-white bg-[#16A34A] hover:bg-[#15803D] transition-colors shadow-sm">
                Done
              </button> :
              <button
                onClick={() => setScanOpen(false)}
                disabled={phase === 'scanning' || phase === 'initializing'}
                className="px-4 h-9 rounded-md text-sm text-[#1A1410] bg-[#FAFAF7] border border-[#EFEAE2] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                Cancel
              </button>
          }
        </div>
      </Modal>
    </div>);
}
