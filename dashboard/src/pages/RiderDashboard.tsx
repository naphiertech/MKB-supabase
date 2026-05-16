import { useEffect, useMemo, useState } from 'react';
import {
  riders as ALL_RIDERS,
  zones as ALL_ZONES,
  haversine,
  type Rider } from
'../services/mockData';
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
interface RiderDashboardProps {
  userId: string;
}
function nowHHMM(d: Date = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  const baseRider: Rider | undefined = ALL_RIDERS.find((r) => r.id === riderId);
  const rider: Rider = baseRider ?? ALL_RIDERS[0];
  const zone = useMemo(
    () => ALL_ZONES.find((z) => z.id === rider.zoneId) ?? ALL_ZONES[0],
    [rider.zoneId]
  );
  const anchor = useMemo(
    () => ({
      lat: zone.center[0] + 0.0006,
      lng: zone.center[1] + 0.0004
    }),
    [zone]
  );
  const { position } = useGeolocation({
    initial: anchor,
    jitter: 0.00018
  });
  const distance = useMemo(
    () => haversine(zone.center[0], zone.center[1], position.lat, position.lng),
    [position.lat, position.lng, zone]
  );
  const inZone = distance <= zone.radius;
  const [timeIn, setTimeIn] = useState<string | null>(null);
  const [timeOut, setTimeOut] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'time-in' | 'time-out'>(
    'time-in'
  );
  const { phase, progress, result, start, reset } = useFaceRecognition();
  const action: 'time-in' | 'time-out' | 'completed' =
  timeIn && timeOut ? 'completed' : timeIn ? 'time-out' : 'time-in';
  const [events, setEvents] = useState<ActivityEvent[]>(() => [
  {
    id: 'seed-1',
    ts: '06:58',
    kind: 'note',
    label: 'Shift assignment received',
    detail: `Zone ${zone.name} · ${rider.shift.charAt(0).toUpperCase() + rider.shift.slice(1)} shift`
  }]
  );
  useEffect(() => {
    if (!timeIn || timeOut) return;
    const id = window.setInterval(() => {
      setEvents((prev) => [
      {
        id: `geo-${Date.now()}`,
        ts: nowHHMM(),
        kind: inZone ? 'geofence_ok' : 'geofence_alert',
        label: inZone ? 'Geofence check passed' : 'Boundary alert triggered',
        detail: inZone ?
        `Within ${zone.name} · ${Math.round(distance)}m from center` :
        `Outside ${zone.name} by ${Math.round(distance - zone.radius)}m`
      },
      ...prev]
      );
    }, 90000);
    return () => window.clearInterval(id);
  }, [timeIn, timeOut, inZone, zone, distance]);
  const onlineStatus =
  timeIn && !timeOut ? 'online' : timeOut ? 'offline' : 'offline';
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
    if (phase !== 'matched' || !result?.matched) return;
    const stamp = nowHHMM(new Date(result.capturedAt));
    if (pendingAction === 'time-in') {
      setTimeIn(stamp);
      setEvents((prev) => [
      {
        id: `ti-${Date.now()}`,
        ts: stamp,
        kind: 'time_in',
        label: 'Time-In recorded (Facial Recognition)',
        detail: `Confidence ${result.confidence.toFixed(2)} · CAM-01`
      },
      ...prev]
      );
      pushToast({
        title: 'Time-In recorded',
        description: `Welcome on shift, ${rider.name.split(' ')[0]}.`,
        tone: 'success'
      });
    } else {
      setTimeOut(stamp);
      setEvents((prev) => [
      {
        id: `to-${Date.now()}`,
        ts: stamp,
        kind: 'time_out',
        label: 'Time-Out recorded (Facial Recognition)',
        detail: `Shift duration · ${timeIn ? diffPretty(timeIn, new Date(result.capturedAt)) : '—'}`
      },
      ...prev]
      );
      pushToast({
        title: 'Time-Out recorded',
        description: 'Great work today. Drive safe.',
        tone: 'success'
      });
    }
    const t = window.setTimeout(() => setScanOpen(false), 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        zoneName={zone.name}
        date={today}
        onlineStatus={onlineStatus}
        shiftStatus={shiftStatus} />
      

      {/* 2. Time-In/Out hero panel */}
      <section className="rounded-2xl border border-[#EFEAE2] bg-white p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#6B6258] font-mono">
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
              Live GPS · {zone.name} geofence ({zone.radius}m)
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
          zoneName={zone.name}
          distance={distance}
          radius={zone.radius} />
        
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
          confidence={result?.confidence} />
        

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-[11px] text-[#6B6258] font-mono">
            {nowHHMM()} · {zone.name}
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