import { useEffect, useState } from 'react';
import { ArrowLeft, Phone, Mail, IdCard, MapPin, Edit3, Check, X, Lock, Eye, EyeOff } from 'lucide-react';
import { MapContainer, TileLayer, Polygon, Circle } from 'react-leaflet';
import {
  type Rider,
  type Zone,
  type AppUser,
  type UserRole,
  type UserStatus,
  type ZoneStatus } from '../services/types';
import { updateUserAuthCredentials } from '../services/userService';
import { updateRiderContact } from '../services/riderService';
import { fetchRiderProfileWithSWR, type CachedProfilePayload } from '../services/riderCacheService';
import { DashboardSkeleton } from '../components/common/DashboardSkeleton';
import { pushToast } from '../hooks/useToast';

interface RiderProfileProps {
  userId: string;
  riderId: string;
  onBack: () => void;
}

const MAP_TILE = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  attribution: '&copy; OpenStreetMap &copy; CARTO'
};

export function RiderProfile({ userId, riderId, onBack }: RiderProfileProps) {
  const [rider, setRider] = useState<Rider | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit Phone States
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  // Password Change States
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const applyPayload = (payload: CachedProfilePayload) => {
          const { dbUser, dbRider } = payload;
          if (dbUser) {
            setUser({
              id: dbUser.id,
              name: dbUser.full_name,
              avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(dbUser.full_name)}`,
              email: dbUser.email,
              role: dbUser.role as UserRole,
              zoneId: null,
              status: dbUser.status as UserStatus,
              lastLogin: dbUser.last_login ? new Date(dbUser.last_login).getTime() : 0
            });
          }

          if (dbRider) {
            const mappedRider: Rider = {
              id: dbRider.id,
              name: dbRider.name,
              avatar: dbRider.face_image_url || dbRider.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(dbRider.name)}`,
              zoneId: dbRider.zone_id,
              status: dbRider.status,
              lat: dbRider.lat || 0,
              lng: dbRider.lng || 0,
              speed: dbRider.speed || 0,
              shift: (dbRider.shift || 'Morning').toLowerCase() as 'morning' | 'afternoon' | 'evening',
              lastPing: dbRider.last_ping ? new Date(dbRider.last_ping).getTime() : 0,
              phone: dbRider.contact || '',
              riderCode: dbRider.mkb_id
            };
            setRider(mappedRider);
            setPhoneInput(dbRider.contact || '');

            if (dbRider.zones) {
              const dbZone = dbRider.zones;
              let center: [number, number] = [0, 0];
              if (dbZone.lat != null && dbZone.lng != null) {
                center = [dbZone.lat, dbZone.lng];
              } else if (Array.isArray(dbZone.polygon_coordinates) && dbZone.polygon_coordinates.length > 0) {
                const polyCoords = dbZone.polygon_coordinates as [number, number][];
                const latSum = polyCoords.reduce((sum: number, c: [number, number]) => sum + c[0], 0);
                const lngSum = polyCoords.reduce((sum: number, c: [number, number]) => sum + c[1], 0);
                center = [latSum / polyCoords.length, lngSum / polyCoords.length];
              }
              setZone({
                id: dbZone.id,
                name: dbZone.name,
                center,
                radius: dbZone.radius || 0,
                color: dbZone.color || '#3B82F6',
                status: (dbZone.status || 'active') as ZoneStatus,
                zone_type: (dbZone.zone_type || 'polygon') as 'circle' | 'polygon',
                polygon_coordinates: (dbZone.polygon_coordinates as [number, number][]) || undefined
              });
            }
          }

          setLoading(false);
        };

        await fetchRiderProfileWithSWR(
          userId,
          riderId,
          {
            onCacheLoaded: applyPayload,
            onFreshDataLoaded: applyPayload
          }
        );
      } catch (e) {
        console.error('Failed to load profile data:', e);
        setLoading(false);
      }
    }

    loadData();
  }, [userId, riderId]);

  const handleSavePhone = async () => {
    if (!rider) return;
    try {
      setIsSavingPhone(true);
      await updateRiderContact(rider.id, phoneInput);
      setRider(prev => prev ? { ...prev, phone: phoneInput } : null);
      setIsEditingPhone(false);
      pushToast({
        title: 'Contact updated',
        description: 'Your mobile phone number has been updated successfully.',
        tone: 'success'
      });
    } catch (err) {
      console.error('Failed to update contact:', err);
      pushToast({
        title: 'Update failed',
        description: 'Failed to update contact. Please try again.',
        tone: 'error'
      });
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword !== confirmPassword) {
      pushToast({
        title: 'Mismatch passwords',
        description: 'New password and confirmation do not match.',
        tone: 'error'
      });
      return;
    }
    if (newPassword.length < 6) {
      pushToast({
        title: 'Password too short',
        description: 'Password must be at least 6 characters.',
        tone: 'error'
      });
      return;
    }

    try {
      setIsSavingPassword(true);
      await updateUserAuthCredentials({ password: newPassword, fullName: user?.name || '' });
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
      pushToast({
        title: 'Password updated',
        description: 'Your login credentials have been successfully updated.',
        tone: 'success'
      });
    } catch (err) {
      console.error('Failed to update password:', err);
      pushToast({
        title: 'Update failed',
        description: 'Could not change password. Try logging in again.',
        tone: 'error'
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  if (loading || !rider || !zone) {
    return <DashboardSkeleton page="profile" role="rider" />;
  }



  return (
    <div className="p-4 md:p-6 lg:p-7 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </button>

      {/* Header card */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-accent via-white to-white p-5 sm:p-6 flex items-center gap-4 shadow-sm overflow-hidden">
        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-primary/8 blur-2xl pointer-events-none" />
        <img
          src={rider.avatar}
          alt={`${rider.name} avatar`}
          className="relative w-20 h-20 rounded-2xl border border-border bg-white shadow-sm"
        />
        
        <div className="relative min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono font-semibold">
            Courier · MKB Corporation
          </div>
          <h1 className="mt-0.5 text-wrap-safe text-xl font-semibold leading-tight text-foreground sm:text-2xl">
            {rider.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/50 uppercase tracking-wider font-semibold">
              {user?.status ?? 'active'}
            </span>
            <span className="text-muted-foreground">{rider.riderCode}</span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Column: Account Details */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-foreground font-semibold text-base">Account Settings</h2>
            
            <div className="space-y-3">
              {/* Email */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white border border-border">
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-50 text-muted-foreground ring-1 ring-gray-200 shrink-0">
                  <Mail className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono font-semibold">
                    Email Address
                  </div>
                  <div className="text-wrap-safe mt-0.5 text-sm text-muted-foreground font-mono">
                    {user?.email ?? '—'}
                  </div>
                </div>
              </div>

              {/* Phone (Editable) */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white border border-border hover:border-primary/20 transition-colors">
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent text-primary ring-1 ring-primary/25 shrink-0">
                  <Phone className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono font-semibold">
                    Contact Phone
                  </div>
                  
                  {isEditingPhone ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        type="tel"
                        value={phoneInput}
                        onChange={e => setPhoneInput(e.target.value)}
                        disabled={isSavingPhone}
                        className="h-8 px-2.5 rounded border border-border text-sm font-mono w-full max-w-xs focus:outline-none focus:border-primary disabled:bg-gray-50"
                      />
                      <button
                        onClick={handleSavePhone}
                        disabled={isSavingPhone}
                        className="w-8 h-8 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setPhoneInput(rider.phone);
                          setIsEditingPhone(false);
                        }}
                        disabled={isSavingPhone}
                        className="w-8 h-8 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="text-sm text-foreground font-mono">
                        {rider.phone || 'No phone registered'}
                      </span>
                      <button
                        onClick={() => setIsEditingPhone(true)}
                        className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-accent transition cursor-pointer"
                        title="Edit Phone"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Rider Code */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white border border-border">
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-50 text-muted-foreground ring-1 ring-gray-200 shrink-0">
                  <IdCard className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono font-semibold">
                    MKB Code
                  </div>
                  <div className="mt-0.5 text-sm text-foreground font-mono">
                    {rider.riderCode}
                  </div>
                </div>
              </div>


            </div>

            {/* Password section */}
            <div className="pt-3 border-t border-border/60">
              {showPasswordForm ? (
                <div className="space-y-3.5 bg-gray-50/50 p-4 rounded-xl border border-border">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Update Password</h3>
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        placeholder="New Password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        disabled={isSavingPassword}
                        className="h-9 px-3 rounded border border-border text-sm w-full focus:outline-none focus:border-primary pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <input
                      type={showPass ? 'text' : 'password'}
                      placeholder="Confirm New Password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      disabled={isSavingPassword}
                      className="h-9 px-3 rounded border border-border text-sm w-full focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowPasswordForm(false);
                        setNewPassword('');
                        setConfirmPassword('');
                      }}
                      disabled={isSavingPassword}
                      className="px-3 h-8 rounded text-xs text-muted-foreground bg-white border border-border hover:bg-gray-100 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUpdatePassword}
                      disabled={isSavingPassword}
                      className="px-3 h-8 rounded text-xs text-white bg-primary hover:bg-primary-hover flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSavingPassword && <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                      Save Password
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowPasswordForm(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover uppercase tracking-wider mt-1 focus:outline-none cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Change Account Password
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Visual Geofence Map */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-4">
            <div>
              <h2 className="text-foreground font-semibold text-base">Assigned Geofence Map</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Riders must remain inside this boundary.
              </p>
            </div>

            <div className="relative rounded-xl overflow-hidden border border-border h-[240px] bg-gray-50">
              <MapContainer
                center={[zone.center[0], zone.center[1]]}
                zoom={14}
                scrollWheelZoom={false}
                zoomControl={false}
                attributionControl={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer url={MAP_TILE.url} attribution={MAP_TILE.attribution} />
                
                {zone.zone_type === 'polygon' && zone.polygon_coordinates ? (
                  <Polygon
                    positions={zone.polygon_coordinates}
                    pathOptions={{
                      color: zone.color,
                      fillColor: zone.color,
                      fillOpacity: 0.15,
                      weight: 2
                    }}
                  />
                ) : (
                  <Circle
                    center={zone.center}
                    radius={zone.radius}
                    pathOptions={{
                      color: zone.color,
                      fillColor: zone.color,
                      fillOpacity: 0.15,
                      weight: 2
                    }}
                  />
                )}
              </MapContainer>

              <div className="absolute top-3 left-3 z-[400] flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/95 backdrop-blur-sm border border-border text-xs shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: zone.color }} />
                <span className="text-foreground font-semibold">{zone.name}</span>
                <span className="text-muted-foreground font-mono text-[10px]">
                  {zone.zone_type === 'polygon' ? 'Polygon' : `${zone.radius}m`}
                </span>
              </div>

              <div className="absolute bottom-3 left-3 z-[400] px-2 py-1 rounded-md bg-white/95 backdrop-blur-sm border border-border text-[10px] text-muted-foreground font-mono">
                Center: {zone.center[0].toFixed(4)}, {zone.center[1].toFixed(4)}
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground/80 leading-relaxed font-medium bg-panel-bg p-3 rounded-xl border border-border/60 flex items-start gap-2">
              <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                Your GPS position is verified against this boundary. Being outside the boundary triggers boundary exit warnings automatically.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Face enrollment info */}
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="text-foreground font-semibold text-base">Face Enrollment</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your face template is enrolled and used to verify every time-in and
          time-out. To re-enroll (e.g. after a major appearance change), contact
          your dispatcher.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/50 text-[11px] uppercase tracking-wider font-semibold">
            ● Enrolled
          </span>
          <span className="text-[11px] text-muted-foreground font-mono">
            FaceNet v2 · captured CAM-01
          </span>
        </div>
      </div>
    </div>
  );
}
