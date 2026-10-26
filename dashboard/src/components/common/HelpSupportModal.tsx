import { useState, useEffect, useRef } from 'react';
import {
  X,
  BookOpen,
  HelpCircle,
  Headphones,
  Mail,
  Phone,
  Clock,
  FileText,
  Target,
  ClipboardCheck,
  Calculator,
  AlertTriangle,
  Code2,
  Bug,
} from 'lucide-react';
import { BRANDING } from '../../config/branding';
import { SupportTicketDesk } from './SupportTicketDesk';
import { RightDrawer } from './RightDrawer';
import {
  DEVELOPER_SUPPORT_CONTACT,
  buildDeveloperBugReportMailto,
} from '../../services/support/supportTicketService';

export type HelpTab = 'guide' | 'faq' | 'support';

interface HelpSupportModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: HelpTab;
  currentUser: {
    id: string;
    name: string;
    role: 'admin' | 'hr' | 'payroll' | 'rider';
  };
}

export function HelpSupportModal({ open, onClose, defaultTab = 'guide', currentUser }: HelpSupportModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [activeTab, setActiveTab] = useState<HelpTab>(defaultTab);
  const [faqSearch, setFaqSearch] = useState('');

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  const faqs = [
    {
      q: "How does geofence violation detection work across multiple hubs?",
      a: "MKB System enforces Hub Operational Territory boundaries across all 4 operational hubs (Talon-Talon, Baliwasan, Ayala, Cabaluay). A rider can deliver freely across any zones assigned to their operational hub without incurring a violation. A boundary exit violation is only triggered if a rider enters another hub's territory or travels completely outside authorized operational boundaries."
    },
    {
      q: "How are geofence delivery zones created and shaped?",
      a: "Zones use polygon boundaries created via point-click or freehand loop drawing. The system uses Turf.js spatial logic to automatically snap and subtract overlapping areas from neighboring zones, guaranteeing zero seam gaps and zero territorial overlaps between adjacent zones."
    },
    {
      q: "How does biometric facial verification verify riders?",
      a: "The rider mobile app utilizes client-side MediaPipe Face Mesh (478 landmarks) and a 128-dimensional biometric embedding vector. Riders align their face in the camera guide during clock-in and clock-out to ensure authentic identity verification and prevent buddy-punching."
    },
    {
      q: "What happens if a rider loses cellular signal or internet while delivering?",
      a: "The mobile application runs an offline-first architecture powered by Dexie / IndexedDB. Attendance events, timestamps, GPS pings, and parcel delivery attempts are cached securely on the device and automatically sync with Supabase Realtime when connectivity is restored."
    },
    {
      q: "How are payroll cutoffs, parcel commissions, and deductions computed?",
      a: "Payroll operates on semi-monthly cutoff cycles (1st–15th and 16th–end of month). Gross earnings are calculated from verified parcel deliveries multiplied by designated tier rates. Net pay automatically factors in attendance lateness penalties, unexcused absence deductions, and statutory contributions (SSS, PhilHealth, Pag-IBIG)."
    },
    {
      q: "Can dispatchers and admins import parcel manifests from spreadsheets?",
      a: "Yes. Admins and dispatchers can upload standard FMS Excel (.xlsx) or CSV manifests. The system parses tracking numbers, recipient info, and COD amounts, automatically flags duplicates, and merges valid shipments into active delivery queues."
    },
    {
      q: "Can HR edit attendance logs manually?",
      a: "Yes. HR and Admin profiles can manually update attendance states, notes, and time-in/time-out records directly from Attendance Management. Every edit logs the user ID, timestamp, and edit source as 'manual' for transparency."
    },
    {
      q: "Who do I contact if I encounter a software bug or system error?",
      a: `Technical bugs, app crashes, or GPS geofence anomalies can be submitted via the Contact Support tab under 'Technical Issue' or reported directly to Lead Systems Developer ${DEVELOPER_SUPPORT_CONTACT.name} at ${DEVELOPER_SUPPORT_CONTACT.email}.`
    }
  ];

  const filteredFaqs = faqs.filter(
    faq => faq.q.toLowerCase().includes(faqSearch.toLowerCase()) || 
           faq.a.toLowerCase().includes(faqSearch.toLowerCase())
  );

  const directMailtoUrl = buildDeveloperBugReportMailto({
    currentUser,
    subject: 'System Issue Report',
    description: 'Please describe the bug encountered, what page you were on, and any error message displayed.',
  });

  return (
    <RightDrawer
      open={open}
      onClose={onClose}
      ariaLabelledBy="help-support-title"
      initialFocusRef={closeButtonRef}
      widthClassName="max-w-xl"
      panelClassName="overflow-hidden font-[Geist,sans-serif]"
      closeLabel="Close help and support"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-panel-bg px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/30 flex items-center justify-center">
            <HelpCircle className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 id="help-support-title" className="truncate text-sm font-bold text-foreground sm:text-base">Help & Support Center</h2>
            <p className="hidden truncate text-[11px] text-muted-foreground font-mono min-[360px]:block">User guides, FAQs, and engineering support desk</p>
          </div>
        </div>
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close help and support"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-border/50 hover:text-foreground cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs & Content */}
      <div className="flex flex-col overflow-hidden flex-1">
        {/* Top Navigation Tabs Bar */}
        <div className="table-scroll-region flex shrink-0 gap-1 border-b border-border bg-panel-bg px-4 py-2 sm:px-6" role="tablist" aria-label="Help sections" tabIndex={0}>
          {(['guide', 'faq', 'support'] as const).map((tab) => {
            const active = activeTab === tab;
            const label = tab === 'guide' ? 'User Guide' : tab === 'faq' ? 'FAQ' : 'Contact Support';
            const Icon = tab === 'guide' ? BookOpen : tab === 'faq' ? HelpCircle : Headphones;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                role="tab"
                id={`help-tab-${tab}`}
                aria-selected={active}
                aria-controls={`help-panel-${tab}`}
                className={`flex shrink-0 items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition duration-150 cursor-pointer ${
                  active
                    ? 'bg-white text-accent-foreground border border-border shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto bg-white p-4 sm:p-6">
          {/* Tab 1: User Guide */}
          {activeTab === 'guide' && (
            <div id="help-panel-guide" role="tabpanel" aria-labelledby="help-tab-guide" className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-foreground mb-1">{BRANDING.appName} Operational Architecture Guide</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Reference manual for multi-hub polygon geofencing, Option B territory compliance, biometric check-ins, parcel tracking, and payroll.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3.5">
                {/* Admins & Dispatchers */}
                <div className="p-4 rounded-xl border border-border bg-panel-bg/30 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-primary">
                      <Target className="w-3.5 h-3.5" />
                    </div>
                    Admins & Dispatchers
                  </div>
                  <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc pl-4 leading-relaxed">
                    <li><strong>Multi-Hub Operational Model</strong>: Manage 4 active hubs (Talon-Talon, Baliwasan, Ayala, Cabaluay) with 12 flush polygon delivery zones.</li>
                    <li><strong>Option B Territory Compliance</strong>: Riders can deliver across any zones within their assigned hub without violation. Boundary exits only trigger when leaving the hub's entire territory.</li>
                    <li><strong>Polygon Geofence Editor</strong>: Create zones using freehand or point-click drawing with automatic Turf neighbor snapping (0 kinks, 0 overlapping seams).</li>
                    <li><strong>FMS Parcel Ingestion</strong>: Bulk import parcel manifests via Excel/CSV with automatic duplicate detection and status synchronization.</li>
                  </ul>
                </div>

                {/* HR Management */}
                <div className="p-4 rounded-xl border border-border bg-panel-bg/30 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-primary">
                      <ClipboardCheck className="w-3.5 h-3.5" />
                    </div>
                    HR Management
                  </div>
                  <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc pl-4 leading-relaxed">
                    <li><strong>Attendance Invariants</strong>: Real-time detection of on-time, late, and absent shifts based on configurable hub shift schedules and grace windows.</li>
                    <li><strong>Biometric Registry</strong>: Enroll 128-dimensional face embedding vectors for riders to enable secure mobile clock-in.</li>
                    <li><strong>Leave & Absence Auditing</strong>: Review rider leave notices with transparent payroll deduction impact previews before approval.</li>
                    <li><strong>Custom Timecard Exports</strong>: Compile attendance and shift logs into audit-ready CSV reports.</li>
                  </ul>
                </div>

                {/* Payroll Management */}
                <div className="p-4 rounded-xl border border-border bg-panel-bg/30 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-primary">
                      <Calculator className="w-3.5 h-3.5" />
                    </div>
                    Payroll Officers
                  </div>
                  <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc pl-4 leading-relaxed">
                    <li><strong>Semi-Monthly Cutoffs</strong>: Set 1st–15th and 16th–end cutoff bounds to calculate verified deliveries and hours.</li>
                    <li><strong>Rate & Commission Rules</strong>: Authoritative server calculation of base pay, parcel band rates, and overtime earnings.</li>
                    <li><strong>Deduction Engine</strong>: Automatic calculations for unexcused absences, cash advance repayments, and statutory deductions (SSS, PhilHealth, Pag-IBIG).</li>
                    <li><strong>PDF Payslip Generation</strong>: Compile and download official individual rider payslips and summary master sheets.</li>
                  </ul>
                </div>

                {/* Rider Mobile App */}
                <div className="p-4 rounded-xl border border-border bg-panel-bg/30 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-primary">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    Rider Mobile App
                  </div>
                  <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc pl-4 leading-relaxed">
                    <li><strong>Face Biometric Clock-in</strong>: Align face with on-screen MediaPipe mesh guide for instant verified time-in.</li>
                    <li><strong>Offline Resilience</strong>: Dexie / IndexedDB offline cache saves attendance and delivery proof even without cellular connection.</li>
                    <li><strong>Background GPS Telemetry</strong>: Continuous location tracking with automatic replay once reconnected to network.</li>
                    <li><strong>Territory Guidance</strong>: Clear in-app map boundary cues showing active hub operational zones.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: FAQ */}
          {activeTab === 'faq' && (
            <div id="help-panel-faq" role="tabpanel" aria-labelledby="help-tab-faq" className="space-y-4">
              <div className="flex flex-col gap-2">
                <h3 className="text-base font-bold text-foreground">Frequently Asked Questions</h3>
                <input
                  aria-label="Search frequently asked questions"
                  type="text"
                  placeholder="Search questions and answers..."
                  value={faqSearch}
                  onChange={(e) => setFaqSearch(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-border text-xs outline-none bg-panel-bg focus:border-primary focus:ring-1 focus:ring-primary/15"
                />
              </div>

              <div className="space-y-3 pt-2">
                {filteredFaqs.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-8">No matching questions found.</p>
                ) : (
                  filteredFaqs.map((faq, idx) => (
                    <div key={idx} className="p-3.5 rounded-xl border border-border hover:border-primary/30 transition space-y-1.5 bg-panel-bg/20">
                      <h4 className="text-xs font-bold text-foreground flex items-start gap-1.5">
                        <span className="text-primary font-mono font-bold">Q:</span>
                        {faq.q}
                      </h4>
                      <p className="text-[11px] text-muted-foreground pl-4 leading-relaxed">
                        {faq.a}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Contact Support */}
          {activeTab === 'support' && (
            <div id="help-panel-support" role="tabpanel" aria-labelledby="help-tab-support" className="grid grid-cols-1 gap-6">
              {/* Online Ticket Desk */}
              <SupportTicketDesk currentUser={currentUser} />

              {/* Channels & Developer Information Cards */}
              <div className="space-y-4">
                {/* Engineering & Developer Bug Desk */}
                <div className="p-4 border-2 border-primary/20 bg-accent/20 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <Code2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-foreground">Systems Engineering & Bug Reports</h4>
                        <p className="text-[10px] text-muted-foreground">Direct escalation to codebase author</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary/10 text-primary uppercase">
                      Developer
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-white border border-border">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase">Lead Systems Developer</div>
                      <div className="font-semibold text-foreground text-xs mt-0.5">{DEVELOPER_SUPPORT_CONTACT.name}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-border">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase">Direct Developer Email</div>
                      <a
                        href={`mailto:${DEVELOPER_SUPPORT_CONTACT.email}`}
                        className="font-semibold text-primary hover:underline text-xs mt-0.5 truncate block"
                      >
                        {DEVELOPER_SUPPORT_CONTACT.email}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Found a system bug, geofence mismatch, or crash? Submit a technical ticket or notify directly.
                    </p>
                    <a
                      href={directMailtoUrl}
                      className="inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold transition hover:opacity-90 cursor-pointer"
                    >
                      <Bug className="w-3.5 h-3.5" />
                      <span>Email Developer</span>
                    </a>
                  </div>
                </div>

                {/* Operations & Dispatch Channels */}
                <div className="p-4 border border-border bg-panel-bg/40 rounded-xl space-y-3.5">
                  <h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider">MKB Operations Hotline</h4>
                  
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded bg-accent flex items-center justify-center shrink-0">
                        <Phone className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Dispatch Hotline</div>
                        <div className="text-[11px] text-foreground font-semibold mt-0.5">+63 953 293 5565</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded bg-accent flex items-center justify-center shrink-0">
                        <Mail className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">General Support Email</div>
                        <div className="text-[11px] text-foreground font-semibold mt-0.5">support@mkb.ph</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded bg-accent flex items-center justify-center shrink-0">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Operating Hours</div>
                        <div className="text-[11px] text-foreground font-semibold mt-0.5">Mon - Sat, 8:00 AM - 5:00 PM (PHT)</div>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 border-t border-border flex items-start gap-2 pt-3">
                    <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      For immediate rider field emergencies or delivery disputes, please contact the dispatch hotline directly.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </RightDrawer>
  );
}
