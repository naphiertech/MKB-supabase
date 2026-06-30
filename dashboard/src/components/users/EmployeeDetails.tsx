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
  Calendar
} from 'lucide-react';
import type { AppUser, Zone, AttendanceLog } from '../../services/types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../../lib/supabaseClient';

interface EmployeeDetailsProps {
  user: AppUser;
  zones: Zone[];
  onClose: () => void;
  onEdit: () => void;
}

export function EmployeeDetails({ user, zones, onClose, onEdit }: EmployeeDetailsProps) {
  const isRider = user.role === 'rider';
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [activeTab, setActiveTab] = useState<'profile' | 'attendance'>('profile');

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
          const mappedLogs: AttendanceLog[] = data.map((log: any) => ({
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
            status: log.status,
            source: log.source || 'manual',
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
    try {
      const doc = new jsPDF();

      // Title & Header branding
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(219, 108, 0); // MKB Orange
      doc.text('MKB CORPORATION - EMPLOYEE PROFILE CARD', 14, 20);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 98, 88); // Charcoal Gray
      doc.text(`Generated on ${new Date().toLocaleDateString()} | MKB Logistics Registry`, 14, 25);
      
      // Line separator
      doc.setDrawColor(239, 234, 226);
      doc.setLineWidth(0.5);
      doc.line(14, 28, 196, 28);

      // Section 1: Basic Information
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 20, 16);
      doc.text('1. Basic Profile & Employment', 14, 36);

      const basicInfoRows = [
        ['Full Name', user.name || '—'],
        ['Role / Title', (user.role || '—').toUpperCase()],
        ['Employee ID (MKB ID)', user.mkbRiderId || '—'],
        ['Employment Type', user.employmentType || '—'],
        ['Date Joined / Hire', formattedHireDate],
        ['Assigned Operational Zone', zoneName],
        ['Shift Assignment', user.shift || '—'],
        ['Account Registry Status', user.status || '—']
      ];

      autoTable(doc, {
        startY: 40,
        head: [['Field / Property', 'Registered Value']],
        body: basicInfoRows,
        theme: 'striped',
        headStyles: { fillColor: [219, 108, 0], textColor: 255 },
        styles: { fontSize: 9, font: 'helvetica' },
        margin: { left: 14, right: 14 }
      });

      const nextY1 = (doc as any).lastAutoTable.finalY + 10;

      // Section 2: Contact & Address Details
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('2. Contact Info & Residential Address', 14, nextY1);

      const contactAddressRows = [
        ['Primary Email', user.email || '—'],
        ['Phone Number', user.contact || '—'],
        ['Last Active Time', formattedLastLogin],
        ['Street Address', user.streetAddress || '—'],
        ['Barangay', user.barangay || '—'],
        ['City', user.city || '—'],
        ['Province', user.province || '—'],
        ['Zip Code', user.zipCode || '—']
      ];

      autoTable(doc, {
        startY: nextY1 + 4,
        head: [['Property', 'Details']],
        body: contactAddressRows,
        theme: 'striped',
        headStyles: { fillColor: [219, 108, 0], textColor: 255 },
        styles: { fontSize: 9, font: 'helvetica' },
        margin: { left: 14, right: 14 }
      });

      const nextY2 = (doc as any).lastAutoTable.finalY + 10;

      // Section 3: Vehicle Specs, Emergency Info, and Remarks
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('3. Operations, Emergency & Onboarding Notes', 14, nextY2);

      const vehicleEmergencyRows = [
        ['Vehicle Type / Class', isRider ? (user.vehicleType || '—') : 'Not applicable'],
        ['Vehicle License Plate', isRider ? (user.vehiclePlateNumber || '—') : 'Not applicable'],
        ['Emergency Contact Person', user.emergencyContactName || '—'],
        ['Emergency Contact Phone', user.emergencyContactPhone || '—'],
        ['Biometric Scan Enrolled', user.faceImage ? 'Yes (Enrolled)' : 'No (Pending)'],
        ['Onboarding Notes / Remarks', user.notes || 'No remarks recorded']
      ];

      autoTable(doc, {
        startY: nextY2 + 4,
        head: [['Operation/HR Item', 'Status / Detail']],
        body: vehicleEmergencyRows,
        theme: 'striped',
        headStyles: { fillColor: [219, 108, 0], textColor: 255 },
        styles: { fontSize: 9, font: 'helvetica' },
        margin: { left: 14, right: 14 }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 20;

      // Verification Signature Block
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Employee Signature:', 14, finalY);
      doc.line(14, finalY + 8, 80, finalY + 8);

      doc.text('Authorized Administrator:', 120, finalY);
      doc.line(120, finalY + 8, 186, finalY + 8);

      doc.save(`MKB_Profile_Card_${(user.name || 'employee').replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('Failed to export profile PDF:', err);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#FAFAF7] text-[#1A1410] font-[Geist,sans-serif]">
      {/* Top Header */}
      <div className="sticky top-0 bg-[#FAFAF7]/90 backdrop-blur-md border-b border-[#EFEAE2] z-50 px-4 py-3 md:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-2 -ml-2 rounded-lg text-[#6B6258] hover:text-[#1A1410] hover:bg-[#EFEAE2]/50 transition shrink-0 cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[#1A1410]">
              Employee Profile Dashboard
            </h1>
            <p className="text-xs text-[#6B6258] hidden sm:block">
              Detailed registry overview, operational status, and biometrics.
            </p>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportPDF}
            className="px-3.5 h-9 rounded-md border border-[#EFEAE2] bg-white text-[#1A1410] hover:bg-[#FAFAF7] text-sm font-semibold transition cursor-pointer inline-flex items-center justify-center gap-2 shadow-sm"
          >
            <Download className="w-4 h-4 text-[#db6c00]" />
            Export PDF
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="px-4 h-9 rounded-md bg-[#db6c00] hover:bg-[#b85a00] active:bg-[#a04e00] text-white text-sm font-semibold focus:ring-2 focus:ring-[#db6c00]/25 transition cursor-pointer inline-flex items-center justify-center gap-2 shadow-sm"
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
            <div className="bg-white rounded-xl border border-[#EFEAE2] p-6 shadow-sm flex flex-col items-center">
              {/* Profile Photo */}
              <div className="relative mb-4">
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-32 h-32 rounded-2xl border border-[#EFEAE2] object-cover shadow-sm bg-[#FAFAF7]"
                />
                <span 
                  className={`absolute bottom-2 right-2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${
                    user.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`} 
                  title={user.status === 'active' ? 'Active Account' : 'Suspended Account'} 
                />
              </div>

              <h2 className="text-lg font-bold text-[#1A1410]">{user.name}</h2>
              <p className="text-xs text-[#6B6258] capitalize mt-0.5 font-medium">
                {user.role} &bull; {user.employmentType || 'Contractual'}
              </p>

              {/* Basic Quick Stats */}
              <div className="w-full space-y-3.5 border-t border-[#EFEAE2]/60 pt-5 mt-5 text-xs text-[#6B6258]">
                <div className="flex justify-between items-center py-0.5">
                  <span>Employee ID</span>
                  <span className="font-mono font-bold text-[#1A1410] bg-[#FAFAF7] px-2 py-0.5 border border-[#EFEAE2] rounded">
                    {user.mkbRiderId || '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span>Date Joined</span>
                  <span className="font-semibold text-[#1A1410]">{formattedHireDate}</span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span>Email address</span>
                  <span className="font-semibold text-[#1A1410] truncate max-w-[180px]">{user.email}</span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span>Phone Number</span>
                  <span className="font-mono font-semibold text-[#1A1410]">{user.contact || '—'}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 w-full mt-6">
                <a
                  href={`mailto:${user.email}`}
                  className="flex items-center justify-center gap-1.5 h-9 rounded-lg border border-[#EFEAE2] bg-[#FAFAF7] text-xs text-[#1A1410] font-semibold hover:bg-[#EFEAE2]/40 transition text-center"
                >
                  <Mail className="w-3.5 h-3.5 text-[#db6c00]" /> Email
                </a>
                <a
                  href={`https://wa.me/${cleanContactNumber || '639000000000'}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 h-9 rounded-lg border border-[#EFEAE2] bg-[#FAFAF7] text-xs text-[#1A1410] font-semibold hover:bg-[#EFEAE2]/40 transition text-center"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-500" /> WhatsApp
                </a>
              </div>
            </div>

            {/* Document Verification Checklist */}
            <div className="bg-white rounded-xl border border-[#EFEAE2] p-5 shadow-sm space-y-4">
              <div className="text-[11px] font-bold text-[#b85a00] uppercase tracking-wider border-b border-[#EFEAE2]/60 pb-2 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#db6c00]/80" />
                Registry Verifications
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 bg-[#FAFAF7] rounded-lg border border-[#EFEAE2] text-xs">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#db6c00] shrink-0" />
                    <div>
                      <div className="font-bold text-[#1A1410]">Employment Record</div>
                      <div className="text-[9px] text-[#6B6258]">{user.employmentType ? 'Onboarded' : 'Pending Details'}</div>
                    </div>
                  </div>
                  {user.employmentType ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                </div>

                <div className="flex items-center justify-between p-2 bg-[#FAFAF7] rounded-lg border border-[#EFEAE2] text-xs">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#db6c00] shrink-0" />
                    <div>
                      <div className="font-bold text-[#1A1410]">License &amp; Vehicle Info</div>
                      <div className="text-[9px] text-[#6B6258]">
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
                    <span className="text-[10px] text-[#6B6258] font-bold">N/A</span>
                  )}
                </div>

                <div className="flex items-center justify-between p-2 bg-[#FAFAF7] rounded-lg border border-[#EFEAE2] text-xs">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#db6c00] shrink-0" />
                    <div>
                      <div className="font-bold text-[#1A1410]">Biometric Face Scan</div>
                      <div className="text-[9px] text-[#6B6258]">
                        {user.faceImage ? 'Registered Face Key' : 'Pending Enrolment'}
                      </div>
                    </div>
                  </div>
                  {user.faceImage ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : isRider ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <span className="text-[10px] text-[#6B6258] font-bold">N/A</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Tailored Bento Grid (No Mock Data) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Main Header Banner */}
            <div className="bg-white rounded-xl border border-[#EFEAE2] p-5 shadow-sm flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#1A1410]">Employment Details</h3>
                <p className="text-[11px] text-[#6B6258] mt-0.5">Rider logistics profile metadata and geofence assignments.</p>
              </div>
              <span className="text-xs bg-[#FFF1E0] border border-[#db6c00]/15 text-[#b85a00] font-bold px-2.5 py-1 rounded-full">
                Tenure: {tenure}
              </span>
            </div>

            {/* Tabs Navigation */}
            {isRider && (
              <div className="flex border-b border-[#EFEAE2] gap-6 text-sm">
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className={`pb-3 font-semibold relative cursor-pointer outline-none transition-colors ${
                    activeTab === 'profile' ? 'text-[#db6c00]' : 'text-[#6B6258] hover:text-[#1A1410]'
                  }`}
                >
                  Rider Profile Details
                  {activeTab === 'profile' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#db6c00] rounded-t-full" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('attendance')}
                  className={`pb-3 font-semibold relative cursor-pointer outline-none transition-colors ${
                    activeTab === 'attendance' ? 'text-[#db6c00]' : 'text-[#6B6258] hover:text-[#1A1410]'
                  }`}
                >
                  Attendance History Calendar
                  {activeTab === 'attendance' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#db6c00] rounded-t-full" />
                  )}
                </button>
              </div>
            )}

            {(!isRider || activeTab === 'profile') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              
              {/* Card 1: HR & Employment Status */}
              <div className="bg-white rounded-xl border border-[#EFEAE2] p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-[#EFEAE2]/60 pb-2">
                  <UserCheck className="w-4 h-4 text-[#db6c00]" />
                  <span className="text-xs font-bold text-[#b85a00] uppercase tracking-wider">Employment Profile</span>
                </div>
                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">Role</span>
                    <span className="font-semibold text-[#1A1410] capitalize">{user.role}</span>
                  </div>
                  <div>
                    <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">Employment Type</span>
                    <span className="font-semibold text-[#1A1410] capitalize">{user.employmentType || 'Not Set'}</span>
                  </div>
                  <div>
                    <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">Date of Hire</span>
                    <span className="font-semibold text-[#1A1410]">{formattedHireDate}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Operational Location / Geofence */}
              <div className="bg-white rounded-xl border border-[#EFEAE2] p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-[#EFEAE2]/60 pb-2">
                  <MapPin className="w-4 h-4 text-[#db6c00]" />
                  <span className="text-xs font-bold text-[#b85a00] uppercase tracking-wider">Operational Area</span>
                </div>
                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">Assigned Zone</span>
                    <span className="font-semibold text-[#1A1410]">{zoneName}</span>
                  </div>
                  {isRider && (
                    <div>
                      <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">Shift Schedule</span>
                      <span className="font-semibold text-[#1A1410] capitalize">{user.shift || 'Not assigned'}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">Last Activity</span>
                    <span className="font-semibold text-[#1A1410]">{formattedLastLogin}</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Address Details */}
              <div className="bg-white rounded-xl border border-[#EFEAE2] p-5 shadow-sm space-y-4 sm:col-span-2">
                <div className="flex items-center gap-2 border-b border-[#EFEAE2]/60 pb-2">
                  <MapPin className="w-4 h-4 text-[#db6c00]" />
                  <span className="text-xs font-bold text-[#b85a00] uppercase tracking-wider">Residential Address</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">Street Address</span>
                    <span className="font-semibold text-[#1A1410]">{user.streetAddress || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">Barangay</span>
                    <span className="font-semibold text-[#1A1410]">{user.barangay || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">City</span>
                    <span className="font-semibold text-[#1A1410]">{user.city || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">Province</span>
                    <span className="font-semibold text-[#1A1410]">{user.province || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">Zip Code</span>
                    <span className="font-semibold text-[#1A1410]">{user.zipCode || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Card 4: Vehicle Information (Conditional) */}
              {isRider && (
                <div className="bg-white rounded-xl border border-[#EFEAE2] p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-[#EFEAE2]/60 pb-2">
                    <Bike className="w-4 h-4 text-[#db6c00]" />
                    <span className="text-xs font-bold text-[#b85a00] uppercase tracking-wider">Vehicle Specifications</span>
                  </div>
                  <div className="space-y-3.5 text-xs">
                    <div>
                      <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">Vehicle Type</span>
                      <span className="font-semibold text-[#1A1410] capitalize">{user.vehicleType || 'Not Specified'}</span>
                    </div>
                    <div>
                      <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">License Plate Number</span>
                      <span className="font-mono font-bold text-[#1A1410] bg-[#FAFAF7] border border-[#EFEAE2] px-2 py-0.5 rounded inline-block">
                        {user.vehiclePlateNumber || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Card 5: Emergency Details */}
              <div className={`bg-white rounded-xl border border-[#EFEAE2] p-5 shadow-sm space-y-4 ${!isRider ? 'sm:col-span-2' : ''}`}>
                <div className="flex items-center gap-2 border-b border-[#EFEAE2]/60 pb-2">
                  <Heart className="w-4 h-4 text-[#db6c00]" />
                  <span className="text-xs font-bold text-[#b85a00] uppercase tracking-wider">Emergency Contact</span>
                </div>
                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">Contact Person</span>
                    <span className="font-semibold text-[#1A1410]">{user.emergencyContactName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[#6B6258] block text-[10px] uppercase font-bold tracking-wider">Phone Number</span>
                    <span className="font-mono font-semibold text-[#1A1410]">{user.emergencyContactPhone || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Card 6: HR Remarks & Notes */}
              <div className="bg-white rounded-xl border border-[#EFEAE2] p-5 shadow-sm space-y-4 sm:col-span-2">
                <div className="flex items-center gap-2 border-b border-[#EFEAE2]/60 pb-2">
                  <Clipboard className="w-4 h-4 text-[#db6c00]" />
                  <span className="text-xs font-bold text-[#b85a00] uppercase tracking-wider">HR Remarks &amp; Notes</span>
                </div>
                {user.notes ? (
                  <p className="text-xs text-[#6B6258] italic leading-relaxed bg-[#FAFAF7] p-3 rounded-lg border border-[#EFEAE2] whitespace-pre-wrap">
                    "{user.notes}"
                  </p>
                ) : (
                  <p className="text-xs text-[#6B6258] italic text-center py-4">
                    No onboarding notes recorded for this profile.
                  </p>
                )}
              </div>
            </div>
          )}

            {/* Card 7: Attendance Calendar Grid */}
            {isRider && activeTab === 'attendance' && (
              <div className="bg-white rounded-xl border border-[#EFEAE2] p-5 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EFEAE2]/60 pb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#db6c00]" />
                      <span className="text-xs font-bold text-[#b85a00] uppercase tracking-wider">Attendance Calendar</span>
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 text-[10px] font-semibold text-[#6B6258]">
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
                      className="p-1.5 rounded-lg border border-[#EFEAE2] hover:bg-[#FAFAF7] transition cursor-pointer text-[#6B6258]"
                    >
                      &larr;
                    </button>
                    <span className="text-sm font-bold text-[#1A1410]">
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
                      className="p-1.5 rounded-lg border border-[#EFEAE2] hover:bg-[#FAFAF7] transition cursor-pointer text-[#6B6258]"
                    >
                      &rarr;
                    </button>
                  </div>

                  {/* Calendar Grid */}
                  <div className="space-y-1">
                    {/* Days of week header */}
                    <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-[#6B6258] uppercase tracking-wider py-1">
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
                        const isToday = cDay.dateStr === new Date().toISOString().split('T')[0];
                        
                        let bgStyle = 'bg-[#FAFAF7] text-[#6B6258]/60';
                        if (cDay.isCurrentMonth) {
                          bgStyle = 'bg-white border border-[#EFEAE2] text-[#1A1410] hover:border-[#db6c00]/50';
                        }
                        if (dayLog) {
                          if (dayLog.status === 'present') bgStyle = 'bg-emerald-500 text-white font-bold hover:bg-emerald-600';
                          else if (dayLog.status === 'late') bgStyle = 'bg-amber-500 text-white font-bold hover:bg-amber-600';
                          else if (dayLog.status === 'on_leave') bgStyle = 'bg-indigo-500 text-white font-bold hover:bg-indigo-600';
                          else if (dayLog.status === 'absent') bgStyle = 'bg-red-500 text-white font-bold hover:bg-red-600';
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
                                  source: 'manual',
                                  events: []
                                });
                              }
                            }}
                            className={`h-9 flex flex-col items-center justify-center rounded-lg text-xs relative transition cursor-pointer ${bgStyle} ${
                              isSelected ? 'ring-2 ring-[#db6c00] ring-offset-1' : ''
                            }`}
                          >
                            <span>{cDay.dayNum}</span>
                            {isToday && (
                              <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#db6c00]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Day Details Panel */}
                  {selectedDayLog && (
                    <div className="bg-[#FAFAF7] border border-[#EFEAE2] rounded-lg p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between border-b border-[#EFEAE2]/60 pb-1.5">
                        <span className="font-bold text-[#1A1410]">
                          Date details: {new Date(selectedDayLog.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider ${
                          selectedDayLog.id === '' 
                            ? 'bg-gray-100 text-gray-600'
                            : selectedDayLog.status === 'present' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-500/10'
                              : selectedDayLog.status === 'late'
                                ? 'bg-amber-50 text-amber-700 border border-amber-500/10'
                                : selectedDayLog.status === 'on_leave'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-500/10'
                                  : 'bg-red-50 text-red-700 border border-red-500/10'
                        }`}>
                          {selectedDayLog.id === '' ? 'No Shift Log' : selectedDayLog.status}
                        </span>
                      </div>
                      {selectedDayLog.id !== '' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div>
                            <span className="text-[#6B6258] block text-[9px] uppercase font-bold tracking-wider">Clock In</span>
                            <span className="font-mono font-bold text-[#1A1410]">{selectedDayLog.timeIn || '—'}</span>
                          </div>
                          <div>
                            <span className="text-[#6B6258] block text-[9px] uppercase font-bold tracking-wider">Clock Out</span>
                            <span className="font-mono font-bold text-[#1A1410]">{selectedDayLog.timeOut || '—'}</span>
                          </div>
                          <div>
                            <span className="text-[#6B6258] block text-[9px] uppercase font-bold tracking-wider">Shift Hours</span>
                            <span className="font-semibold text-[#1A1410]">{selectedDayLog.hours ? `${selectedDayLog.hours} hrs` : '—'}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-[#6B6258] italic">No attendance activity or log recorded for this date.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>

          </div>

      </div>
    </div>
  );
}
