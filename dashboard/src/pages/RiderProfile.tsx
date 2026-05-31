import { useEffect, useState } from 'react';
import { ArrowLeft, Phone, Mail, IdCard, MapPin, Shield } from 'lucide-react';
import {
  type Rider,
  type Zone,
  type AppUser } from
'../services/types';
import { supabase } from '../lib/supabaseClient';
import { getZones } from '../services/geofenceService';
import { DashboardSkeleton } from '../components/common/DashboardSkeleton';

interface RiderProfileProps {
  userId: string;
  onBack: () => void;
}

function Field({
  label,
  value,
  icon: Icon,
  mono
}: {label: string;value: string;icon: typeof Phone;mono?: boolean;}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-white border border-[#EFEAE2] hover:border-[#db6c00]/30 transition-colors">
      <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#FFF1E0] text-[#db6c00] ring-1 ring-[#db6c00]/20 shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[#6B6258] font-mono">
          {label}
        </div>
        <div className={`mt-0.5 text-sm text-[#1A1410] truncate ${mono ? 'font-mono' : ''}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

export function RiderProfile({ userId, onBack }: RiderProfileProps) {
  const riderId = userId.replace(/^u-rider-/, '');
  const [rider, setRider] = useState<Rider | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        // Fetch public.users by Auth UUID (userId)
        const { data: dbUser, error: userErr } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (!userErr && dbUser) {
          setUser({
            id: dbUser.id,
            name: dbUser.full_name,
            avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(dbUser.full_name)}`,
            email: dbUser.email,
            role: dbUser.role,
            zoneId: null,
            status: dbUser.status,
            lastLogin: dbUser.last_login ? new Date(dbUser.last_login).getTime() : Date.now()
          });

          // Fetch public.riders using user's linked rider_id
          const resolvedRiderId = dbUser.rider_id || riderId;
          const { data: dbRider, error: riderErr } = await supabase
            .from('riders')
            .select('*')
            .eq('id', resolvedRiderId)
            .maybeSingle();

          if (!riderErr && dbRider) {
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
          }
        }
      } catch (err) {
        console.error('Error loading rider profile details:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [userId, riderId]);

  if (loading || !rider || !zone) {
    return <DashboardSkeleton page="profile" role="rider" />;
  }

  return (
    <div className="p-4 md:p-6 lg:p-7 max-w-3xl mx-auto space-y-5">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-[#6B6258] hover:text-[#1A1410] transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </button>

      {/* Header card */}
      <div className="relative rounded-2xl border border-[#EFEAE2] bg-gradient-to-br from-[#FFF1E0] via-white to-white p-5 sm:p-6 flex items-center gap-4 shadow-sm overflow-hidden">
        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-[#db6c00]/8 blur-2xl pointer-events-none" />
        <img
          src={rider.avatar}
          alt={`${rider.name} avatar`}
          className="relative w-20 h-20 rounded-2xl border border-[#EFEAE2] bg-white shadow-sm" />
        
        <div className="relative min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#6B6258] font-mono">
            Courier · MKB Corporation
          </div>
          <h1 className="text-2xl font-semibold text-[#1A1410] truncate">
            {rider.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded-md bg-[#DCFCE7] text-[#16A34A] border border-[#16A34A]/25 uppercase tracking-wider">
              {user?.status ?? 'active'}
            </span>
            <span className="text-[#6B6258]">{rider.riderCode}</span>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Email" value={user?.email ?? '—'} icon={Mail} mono />
        <Field label="Phone" value={rider.phone} icon={Phone} mono />
        <Field label="Rider Code" value={rider.riderCode} icon={IdCard} mono />
        <Field label="Assigned Zone" value={zone.name} icon={MapPin} />
        <Field
          label="Shift"
          value={rider.shift.charAt(0).toUpperCase() + rider.shift.slice(1)}
          icon={Shield} />
        <Field
          label="Zone Center"
          value={`${zone.center[0].toFixed(4)}, ${zone.center[1].toFixed(4)}`}
          icon={MapPin}
          mono />
      </div>

      <div className="rounded-2xl border border-[#EFEAE2] bg-white p-5 shadow-sm">
        <h2 className="text-[#1A1410] font-semibold text-base">
          Face Enrollment
        </h2>
        <p className="text-sm text-[#6B6258] mt-1">
          Your face template is enrolled and used to verify every time-in and
          time-out. To re-enroll (e.g. after a major appearance change), contact
          your dispatcher.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="px-2 py-1 rounded-md bg-[#DCFCE7] text-[#16A34A] border border-[#16A34A]/25 text-[11px] uppercase tracking-wider font-mono">
            ● Enrolled
          </span>
          <span className="text-[11px] text-[#6B6258] font-mono">
            FaceNet v2 · captured CAM-01
          </span>
        </div>
      </div>
    </div>
  );
}
