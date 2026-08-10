import { useMemo, useState, useEffect } from 'react';
import {
  ArrowLeft,
  Pencil,
  Mail,
  Shield,
  Bike,
  AlertTriangle,
  Heart,
  Clipboard,
  CheckCircle2,
  Lock,
  MessageCircle,
  FileText,
  MapPin,
  UserCheck,
  Download,
  Calendar,
  Smartphone,
  RotateCcw
} from 'lucide-react';
import type { AppUser, Zone, AttendanceLog } from '../../services/types';
import { supabase } from '../../lib/supabaseClient';
import { exportEmployeeProfileCard, exportEmployeeDTR } from '../../lib/exports/employeeExport';
import { useAuth } from '../../hooks/useAuth';
import { pushToast } from '../../hooks/useToast';
import { getUserTrustedDevice, resetUserTrustedDevice } from '../../services/riderService';
import { DeviceResetModal, type TrustedDeviceInfo } from './DeviceResetModal';
import { RiderDocumentsTab } from './RiderDocumentsTab';

function formatTimeString(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T'));
  return isNaN(d.getTime()) ? '—' : d.toTimeString().slice(0, 5);
}

interface EmployeeDetailsProps {
  user: AppUser;
  zones: Zone[];
  onClose: () => void;
  onEdit: () => void;
}

export function EmployeeDetails({ user, zones, onClose, onEdit }: EmployeeDetailsProps) {
  const { session } = useAuth();
  const isRider = user.role === 'rider';
  const canViewDocuments = session?.role === 'admin' || session?.role === 'hr';
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [activeTab, setActiveTab] = useState<'profile' | 'attendance' | 'documents'>('profile');
  const [device, setDevice] = useState<TrustedDeviceInfo | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  useEffect(() => {
    if (!isRider) return;
    let active = true;
    setDeviceLoading(true);
    getUserTrustedDevice(user.id)
      .then((dev) => {
        if (active) setDevice(dev);
      })
      .finally(() => {
        if (active) setDeviceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id, isRider]);

  useEffect(() => {
    if (!isRider || !user.riderId) return;
    let active = true;

    const fetchLogs = async () => {
      try {
        const { data, error } = await supabase
          .from('attendance_logs')
          .select('*')
          .eq('rider_id', user.riderId)
          .order('date', { ascending: false });

        if (!error && data && active) {
          const mappedLogs: AttendanceLog[] = (data as {
            id: string;
            rider_id: string;
            date: string;
            time_in: string | null;
            time_out: string | null;
            hours: number | null;
            zone_id: string | null;
            status: string;
            source: string | null;
            events?: AttendanceLog['events'];
          }[]).map((log) => ({
            id: log.id,
            riderId: log.rider_id,
            riderName: user.name,
            riderAvatar: user.avatar,
            date: log.date,
            timeIn: log.time_in,
            timeOut: log.time_out,
            hours: log.hours || 0,
            zoneId: log.zone_id || '',
            zoneName: '',
            status: log.status as AttendanceLog['status'],
            presence: (log.status === 'on_leave' ? 'on_leave' : log.time_in ? 'present' : 'absent'),
            punctuality: (log.status === 'late' ? 'late' : log.time_in ? 'on_time' : 'none'),
            source: (log.source || 'manual') as AttendanceLog['source'],
            events: log.events || []
          }));
          setLogs(mappedLogs);
        }
      } catch (err) {
        console.error('Failed to load attendance logs:', err);
      }
    };

    fetchLogs();
    return () => {
      active = false;
    };
  }, [user.riderId, isRider, user.name, user.avatar]);

  const zoneName = useMemo(() => {
    if (!user.zoneId) return 'Unassigned';
    const zone = zones.find((z) => z.id === user.zoneId);
    return zone ? zone.name : 'Unknown Zone';
  }, [user.zoneId, zones]);

  const tenure = useMemo(() => {
    if (!user.dateOfHire) return 'Not set';
    const start = new Date(user.dateOfHire);
    if (isNaN(start.getTime())) return 'Not set';
    const now = new Date();
    
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    let days = now.getDate() - start.getDate();
    
    if (days < 0) {
      months -= 1;
      const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      days += daysInMonth;
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    
    const parts = [];
    if (years > 0) parts.push(`${years} yr${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} mo${months > 1 ? 's' : ''}`);
    if (days > 0 || parts.length === 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    
    return parts.join(', ');
  }, [user.dateOfHire]);

  const formattedHireDate = useMemo(() => {
    if (!user.dateOfHire) return '—';
    const d = new Date(user.dateOfHire);
    if (isNaN(d.getTime())) return user.dateOfHire;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }, [user.dateOfHire]);

  const formattedLastLogin = useMemo(() => {
    if (!user.lastLogin) return 'Never';
    const d = new Date(user.lastLogin);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [user.lastLogin]);

  // Direct Viber chat trigger number format
  const cleanContactNumber = useMemo(() => {
    if (!user.contact) return '';
    return user.contact.replace(/\D/g, '');
  }, [user.contact]);
  // Calendar computations
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevTotalDays = new Date(year, month, 0).getDate();

    const days = [];

    // Padding days from previous month
    for (let i = firstDay - 1; i >= 0; i--) {
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      days.push({
        dayNum: prevTotalDays - i,
        isCurrentMonth: false,
        dateStr: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(prevTotalDays - i).padStart(2, '0')}`
      });
    }

    // Days of current month
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        dayNum: i,
        isCurrentMonth: true,
        dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      });
    }

    // Padding days for next month to make a complete grid (multiple of 7)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      days.push({
        dayNum: i,
        isCurrentMonth: false,
        dateStr: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      });
    }

    return days;
  }, [calendarDate]);

  const [selectedDayLog, setSelectedDayLog] = useState<AttendanceLog | null>(null);

  const handleExportPDF = () => {
    exportEmployeeProfileCard({
      user,
      zoneName,
      formattedHireDate,
      formattedLastLogin
    });
  };

  const handleDownloadDTR = () => {
    exportEmployeeDTR({
      riderName: user.name,
      riderRole: user.role || 'rider',
      zoneName,
      calendarDate,
      logs
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-panel-bg text-foreground font-[Geist,sans-serif]">
      {/* Top Header */}
      <div className="sticky top-16 z-40 flex flex-col items-stretch justify-between gap-3 border-b border-border bg-panel-bg/95 px-4 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:gap-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-border/50 transition shrink-0 cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight text-foreground sm:text-lg">
              Employee Profile Dashboard
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Detailed registry overview, operational status, and biometrics.
            </p>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0">
          {isRider && (
            <button
              type="button"
              onClick={handleDownloadDTR}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-xs font-semibold text-foreground shadow-sm transition hover:bg-panel-bg sm:h-9 sm:px-3.5 sm:text-sm cursor-pointer"
            >
              <FileText className="w-4 h-4 text-primary" />
              Export DTR
            </button>
          )}
          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-xs font-semibold text-foreground shadow-sm transition hover:bg-panel-bg sm:h-9 sm:px-3.5 sm:text-sm cursor-pointer"
          >
            <Download className="w-4 h-4 text-primary" />
            Export PDF
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-hover active:bg-primary/90 focus:ring-2 focus:ring-primary/25 sm:col-auto sm:h-9 sm:text-sm cursor-pointer"
          >
            <Pencil className="w-4 h-4" />
            Edit Profile
          </button>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Avatar & Quick Info Panel */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-xl border border-border p-6 shadow-sm flex flex-col items-center">
              {/* Profile Photo */}
              <div className="relative mb-4">
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-32 h-32 rounded-2xl border border-border object-cover shadow-sm bg-panel-bg"
                />
                <span 
                  className={`absolute bottom-2 right-2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${
                    user.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`} 
                  title={user.status === 'active' ? 'Active Account' : 'Suspended Account'} 
                />
              </div>

              <h2 className="text-lg font-bold text-foreground">{user.name}</h2>
              <p className="text-xs text-muted-foreground capitalize mt-0.5 font-medium">
                {user.role} &bull; {user.employmentType || 'Contractual'}
              </p>

              {/* Basic Quick Stats */}
              <div className="w-full space-y-3.5 border-t border-border/60 pt-5 mt-5 text-xs text-muted-foreground">
                <div className="flex justify-between items-center py-0.5">
                  <span>Employee ID</span>
                  <span className="font-mono font-bold text-foreground bg-panel-bg px-2 py-0.5 border border-border rounded">
                    {user.mkbRiderId || '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span>Date Joined</span>
                  <span className="font-semibold text-foreground">{formattedHireDate}</span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span>Email address</span>
                  <span className="text-wrap-safe max-w-[65%] text-right font-semibold text-foreground">{user.email}</span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span>Phone Number</span>
                  <span className="font-mono font-semibold text-foreground">{user.contact || '—'}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 w-full mt-6">
                <a
                  href={`mailto:${user.email}`}
                  className="flex items-center justify-center gap-1.5 h-9 rounded-lg border border-border bg-panel-bg text-xs text-foreground font-semibold hover:bg-border/40 transition text-center"
                >
                  <Mail className="w-3.5 h-3.5 text-primary" /> Email
                </a>
                <a
                  href={`https://wa.me/${cleanContactNumber || '639000000000'}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 h-9 rounded-lg border border-border bg-panel-bg text-xs text-foreground font-semibold hover:bg-border/40 transition text-center"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-500" /> WhatsApp
                </a>
              </div>
            </div>

            {/* Document Verification Checklist */}
            <div className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-4">
              <div className="text-[11px] font-bold text-accent-foreground uppercase tracking-wider border-b border-border/60 pb-2 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-primary/80" />
                Registry Verifications
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 bg-panel-bg rounded-lg border border-border text-xs">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <div className="font-bold text-foreground">Employment Record</div>
                      <div className="text-[9px] text-muted-foreground">{user.employmentType ? 'Onboarded' : 'Pending Details'}</div>
                    </div>
                  </div>
                  {user.employmentType ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                </div>

                <div className="flex items-center justify-between p-2 bg-panel-bg rounded-lg border border-border text-xs">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <div className="font-bold text-foreground">License &amp; Vehicle Info</div>
                      <div className="text-[9px] text-muted-foreground">
                        {isRider 
                          ? (user.vehiclePlateNumber ? `Plate: ${user.vehiclePlateNumber}` : 'Pending Plate') 
                          : 'Not required'
                        }
                      </div>
                    </div>
                  </div>
                  {isRider ? (
                    user.vehiclePlateNumber ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    )
                  ) : (
                    <span className="text-[10px] text-muted-foreground font-bold">N/A</span>
                  )}
                </div>

                <div className="flex items-center justify-between p-2 bg-panel-bg rounded-lg border border-border text-xs">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <div className="font-bold text-foreground">Biometric Face Scan</div>
                      <div className="text-[9px] text-muted-foreground">
                        {user.faceImage ? 'Registered Face Key' : 'Pending Enrolment'}
                      </div>
                    </div>
                  </div>
                  {user.faceImage ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : isRider ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground font-bold">N/A</span>
                  )}
                </div>

                {isRider && (
                  <div className="flex flex-col p-2.5 bg-panel-bg rounded-lg border border-border text-xs gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-primary shrink-0" />
                        <div>
                          <div className="font-bold text-foreground">Trusted Device</div>
                          <div className="text-[9px] text-muted-foreground truncate max-w-[140px]">
                            {deviceLoading
                              ? 'Checking device state…'
                              : device
                              ? `${device.deviceName}`
                              : 'No device bound'}
                          </div>
                        </div>
                      </div>
                      {device ? (
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-300/40">
                          Trusted
                        </span>
                      ) : (
                        <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-300/40">
                          None
                        </span>
                      )}
                    </div>

                    {device && (
                      <div className="pt-1.5 border-t border-border/60 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Reg: {new Date(device.registeredAt).toLocaleDateString()}</span>
                        <button
                          type="button"
                          onClick={() => setIsResetModalOpen(true)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded font-semibold text-[10px] transition cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" /> Reset Device
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Tailored Bento Grid (No Mock Data) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Main Header Banner */}
            <div className="bg-white rounded-xl border border-border p-5 shadow-sm flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Employment Details</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Rider logistics profile metadata and geofence assignments.</p>
              </div>
              <span className="text-xs bg-accent border border-primary/15 text-accent-foreground font-bold px-2.5 py-1 rounded-full">
                Tenure: {tenure}
              </span>
            </div>

            {/* Tabs Navigation */}
            {isRider && (
          <div className="table-scroll-region flex gap-6 border-b border-border text-sm" role="tablist" aria-label="Rider details sections" tabIndex={0}>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  role="tab"
                  aria-selected={activeTab === 'profile'}
                  aria-controls="rider-profile-panel"
                  className={`pb-3 font-semibold relative cursor-pointer outline-none transition-colors ${
                    activeTab === 'profile' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Rider Profile Details
                  {activeTab === 'profile' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-primary rounded-t-full" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('attendance')}
                  role="tab"
                  aria-selected={activeTab === 'attendance'}
                  aria-controls="rider-attendance-panel"
                  className={`pb-3 font-semibold relative cursor-pointer outline-none transition-colors ${
                    activeTab === 'attendance' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Attendance History Calendar
                  {activeTab === 'attendance' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-primary rounded-t-full" />
                  )}
                </button>
                {canViewDocuments && <button
                  type="button"
                  onClick={() => setActiveTab('documents')}
                  role="tab"
                  aria-selected={activeTab === 'documents'}
                  aria-controls="rider-documents-panel"
                  className={`pb-3 font-semibold relative cursor-pointer outline-none transition-colors whitespace-nowrap ${
                    activeTab === 'documents' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Documents
                  {activeTab === 'documents' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-primary rounded-t-full" />
                  )}
                </button>}
              </div>
            )}

            {(!isRider || activeTab === 'profile') && (
              <div id={isRider ? 'rider-profile-panel' : undefined} role={isRider ? 'tabpanel' : undefined} className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              
              {/* Card 1: HR & Employment Status */}
              <div className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                  <UserCheck className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-accent-foreground uppercase tracking-wider">Employment Profile</span>
                </div>
                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Role</span>
                    <span className="font-semibold text-foreground capitalize">{user.role}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Employment Type</span>
                    <span className="font-semibold text-foreground capitalize">{user.employmentType || 'Not Set'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Date of Hire</span>
                    <span className="font-semibold text-foreground">{formattedHireDate}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Operational Location / Geofence */}
              <div className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-accent-foreground uppercase tracking-wider">Operational Area</span>
                </div>
                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Assigned Zone</span>
                    <span className="font-semibold text-foreground">{zoneName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Last Activity</span>
                    <span className="font-semibold text-foreground">{formattedLastLogin}</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Address Details */}
              <div className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-4 sm:col-span-2">
                <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-accent-foreground uppercase tracking-wider">Residential Address</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Street Address</span>
                    <span className="font-semibold text-foreground">{user.streetAddress || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Barangay</span>
                    <span className="font-semibold text-foreground">{user.barangay || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">City</span>
                    <span className="font-semibold text-foreground">{user.city || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Province</span>
                    <span className="font-semibold text-foreground">{user.province || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Zip Code</span>
                    <span className="font-semibold text-foreground">{user.zipCode || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Card 4: Vehicle Information (Conditional) */}
              {isRider && (
                <div className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                    <Bike className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-accent-foreground uppercase tracking-wider">Vehicle Specifications</span>
                  </div>
                  <div className="space-y-3.5 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Vehicle Type</span>
                      <span className="font-semibold text-foreground capitalize">{user.vehicleType || 'Not Specified'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">License Plate Number</span>
                      <span className="font-mono font-bold text-foreground bg-panel-bg border border-border px-2 py-0.5 rounded inline-block">
                        {user.vehiclePlateNumber || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Card 5: Emergency Details */}
              <div className={`bg-white rounded-xl border border-border p-5 shadow-sm space-y-4 ${!isRider ? 'sm:col-span-2' : ''}`}>
                <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                  <Heart className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-accent-foreground uppercase tracking-wider">Emergency Contact</span>
                </div>
                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Contact Person</span>
                    <span className="font-semibold text-foreground">{user.emergencyContactName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Phone Number</span>
                    <span className="font-mono font-semibold text-foreground">{user.emergencyContactPhone || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Card 6: HR Remarks & Notes */}
              <div className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-4 sm:col-span-2">
                <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                  <Clipboard className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-accent-foreground uppercase tracking-wider">HR Remarks &amp; Notes</span>
                </div>
                {user.notes ? (
                  <p className="text-xs text-muted-foreground italic leading-relaxed bg-panel-bg p-3 rounded-lg border border-border whitespace-pre-wrap">
                    "{user.notes}"
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic text-center py-4">
                    No onboarding notes recorded for this profile.
                  </p>
                )}
              </div>
            </div>
          )}

            {/* Card 7: Attendance Calendar Grid */}
            {isRider && activeTab === 'attendance' && (
              <div id="rider-attendance-panel" role="tabpanel" className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span className="text-xs font-bold text-accent-foreground uppercase tracking-wider">Attendance Calendar</span>
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 text-[10px] font-semibold text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Present
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded bg-amber-500" /> Late
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded bg-indigo-500" /> On Leave
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded bg-red-500" /> Absent
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1 px-1">
                    <button
                      type="button"
                      onClick={() => {
                        const prev = new Date(calendarDate);
                        prev.setMonth(prev.getMonth() - 1);
                        setCalendarDate(prev);
                        setSelectedDayLog(null);
                      }}
                      className="p-1.5 rounded-lg border border-border hover:bg-panel-bg transition cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      &larr;
                    </button>
                    <span className="text-sm font-bold text-foreground">
                      {calendarDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Date(calendarDate);
                        next.setMonth(next.getMonth() + 1);
                        setCalendarDate(next);
                        setSelectedDayLog(null);
                      }}
                      className="p-1.5 rounded-lg border border-border hover:bg-panel-bg transition cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      &rarr;
                    </button>
                  </div>

                  {/* Calendar Grid */}
                  <div className="space-y-1">
                    {/* Days of week header */}
                    <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-muted-foreground uppercase tracking-wider py-1">
                      <span>Su</span>
                      <span>Mo</span>
                      <span>Tu</span>
                      <span>We</span>
                      <span>Th</span>
                      <span>Fr</span>
                      <span>Sa</span>
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {calendarDays.map((cDay, idx) => {
                        const dayLog = logs.find(l => l.date === cDay.dateStr);
                        const todayStr = new Date().toISOString().split('T')[0];
                        const isToday = cDay.dateStr === todayStr;
                        
                        // Check if date is on or after date of hire
                        const hireDateStr = user.dateOfHire ? new Date(user.dateOfHire).toISOString().split('T')[0] : null;
                        const isAfterOrOnHireDate = !hireDateStr || cDay.dateStr >= hireDateStr;
                        const isPastWorkDay = cDay.isCurrentMonth && isAfterOrOnHireDate && cDay.dateStr < todayStr;

                        let bgStyle = 'bg-panel-bg text-muted-foreground/60';
                        if (cDay.isCurrentMonth) {
                          bgStyle = 'bg-white border border-border text-foreground hover:border-primary/50';
                        }
                        if (dayLog) {
                          if (dayLog.status === 'present') bgStyle = 'bg-emerald-500 text-white font-bold hover:bg-emerald-600';
                          else if (dayLog.status === 'late') bgStyle = 'bg-amber-500 text-white font-bold hover:bg-amber-600';
                          else if (dayLog.status === 'on_leave') bgStyle = 'bg-indigo-500 text-white font-bold hover:bg-indigo-600';
                          else if (dayLog.status === 'absent') bgStyle = 'bg-red-500 text-white font-bold hover:bg-red-600';
                        } else if (isPastWorkDay) {
                          // Past working days within employment without a clock-in log are ABSENT (RED)
                          bgStyle = 'bg-red-500 text-white font-bold hover:bg-red-600';
                        }

                        const isSelected = selectedDayLog?.date === cDay.dateStr;

                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={!cDay.isCurrentMonth}
                            onClick={() => {
                              if (dayLog) setSelectedDayLog(dayLog);
                              else {
                                setSelectedDayLog({
                                  id: '',
                                  riderId: user.riderId || '',
                                  riderName: user.name,
                                  riderAvatar: user.avatar,
                                  date: cDay.dateStr,
                                  timeIn: null,
                                  timeOut: null,
                                  hours: 0,
                                  zoneId: '',
                                  zoneName: '',
                                  status: 'absent',
                                  presence: 'absent',
                                  punctuality: 'none',
                                  source: 'manual',
                                  events: []
                                });
                              }
                            }}
                            className={`h-9 flex flex-col items-center justify-center rounded-lg text-xs relative transition cursor-pointer ${bgStyle} ${
                              isSelected ? 'ring-2 ring-primary ring-offset-1' : ''
                            }`}
                          >
                            <span>{cDay.dayNum}</span>
                            {isToday && (
                              <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Day Details Panel */}
                  {selectedDayLog && (
                    <div className="bg-panel-bg border border-border rounded-lg p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                        <span className="font-bold text-foreground">
                          Date details: {new Date(selectedDayLog.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        </span>
                        {(() => {
                          const todayStr = new Date().toISOString().split('T')[0];
                          const hireDateStr = user.dateOfHire ? new Date(user.dateOfHire).toISOString().split('T')[0] : null;
                          const isAfterOrOnHireDate = !hireDateStr || selectedDayLog.date >= hireDateStr;
                          const isPastWorkDay = isAfterOrOnHireDate && selectedDayLog.date < todayStr;
                          const isNoLogAbsent = selectedDayLog.id === '' && isPastWorkDay;

                          return (
                            <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider ${
                              isNoLogAbsent
                                ? 'bg-red-50 text-red-700 border border-red-500/20'
                                : selectedDayLog.id === ''
                                  ? 'bg-gray-100 text-gray-600'
                                  : selectedDayLog.status === 'present' 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-500/10'
                                    : selectedDayLog.status === 'late'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-500/10'
                                      : selectedDayLog.status === 'on_leave'
                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-500/10'
                                        : 'bg-red-50 text-red-700 border border-red-500/10'
                            }`}>
                              {isNoLogAbsent ? 'Absent (No Clock-In)' : selectedDayLog.id === '' ? 'No Attendance Log' : selectedDayLog.status}
                            </span>
                          );
                        })()}
                      </div>
                      {selectedDayLog.id !== '' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div>
                            <span className="text-muted-foreground block text-[9px] uppercase font-bold tracking-wider">Clock In</span>
                            <span className="font-mono font-bold text-foreground">{formatTimeString(selectedDayLog.timeIn)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-[9px] uppercase font-bold tracking-wider">Time Out</span>
                            <span className="font-mono font-bold text-foreground">{formatTimeString(selectedDayLog.timeOut)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-[9px] uppercase font-bold tracking-wider">Hours Worked</span>
                            <span className="font-semibold text-foreground">{selectedDayLog.hours ? `${Number(selectedDayLog.hours).toFixed(2)} hrs` : '—'}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">No attendance activity or log recorded for this date.</p>
                      )}
              </div>
            )}

                </div>
              )}

            {isRider && canViewDocuments && activeTab === 'documents' && (
              <div id="rider-documents-panel" role="tabpanel">
                {user.riderId ? (
                  <RiderDocumentsTab riderId={user.riderId} role={session?.role} />
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                    Documents are unavailable because this account is not linked to a canonical rider record.
                  </div>
                )}
              </div>
            )}

            </div>

          </div>

      </div>

      <DeviceResetModal
        isOpen={isResetModalOpen}
        riderName={user.name}
        device={device}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={async (reason, customReason) => {
          if (!session?.id) return;
          await resetUserTrustedDevice({
            userId: user.id,
            riderId: user.riderId || undefined,
            adminUserId: session.id,
            riderName: user.name,
            reason,
            customReason
          });
          setDevice(null);
          pushToast({
            title: 'Trusted Device Revoked',
            description: `Revoked device access for ${user.name}. Reason: ${reason === 'Other' && customReason ? customReason : reason}`,
            tone: 'success'
          });
        }}
      />
    </div>
  );
}
