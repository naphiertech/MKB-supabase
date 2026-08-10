import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  AlertTriangle
} from 'lucide-react';
import { BRANDING } from '../../config/branding';
import { SupportTicketDesk } from './SupportTicketDesk';

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
  // Sync active tab with defaultTab prop when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
      window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    }
  }, [open, defaultTab]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);
  // FAQ Data List
  const faqs = [
    {
      q: "Why is a rider showing offline when they have a violation?",
      a: "Riders are set to 'offline' when they clock out of their shift, resetting their active coordinates. However, any unresolved boundary violations committed during their shift remain active in the system until manually acknowledged or read by the dispatcher."
    },
    {
      q: "How accurate is the geofence tracking?",
      a: `${BRANDING.appName} uses standard HTML5 Geolocation API on the mobile app, combined with the database Haversine math constraint. The geofence radius can be set between 100m and 5000m. Signal interference in dense areas may cause brief coordinate jumps.`
    },
    {
      q: "How does the biometric face check-in work?",
      a: "When a rider clocks in or out, face verification runs on the rider device and compares a 128-dimensional face descriptor with the enrolled template. The matching threshold is managed by the application and should not be adjusted by riders."
    },
    {
      q: "Can HR edit attendance logs manually?",
      a: "Yes. HR and Admin profiles can manually update attendance states, notes, and time-in/time-out records directly from the Attendance Management page, which logs the edit source as 'manual' for transparency."
    },
    {
      q: "How are payroll gross amounts calculated?",
      a: "MKB Payroll calculates payout by cutoff period using the rate stored on each payroll record. If a rate is missing, Payroll must review the record before it is finalized."
    }
  ];

  const filteredFaqs = faqs.filter(
    faq => faq.q.toLowerCase().includes(faqSearch.toLowerCase()) || 
           faq.a.toLowerCase().includes(faqSearch.toLowerCase())
  );

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[2000]">
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-foreground/50 backdrop-blur-sm"
          />

          {/* Slide-over Drawer */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-support-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="safe-drawer absolute inset-y-0 right-0 flex w-full max-w-lg flex-col overflow-hidden border-l border-border bg-white shadow-2xl z-10 font-[Geist,sans-serif]"
          >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-panel-bg px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/30 flex items-center justify-center">
                <HelpCircle className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 id="help-support-title" className="truncate text-sm font-bold text-foreground sm:text-base">Help & Support Center</h2>
                <p className="hidden truncate text-[11px] text-muted-foreground font-mono min-[360px]:block">User guides, FAQs, and support ticket desk</p>
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
                    <h3 className="text-base font-bold text-foreground mb-1">{BRANDING.appName} Operational Guide</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Learn how to successfully manage and interact with our realtime geofencing, face check-ins, and payroll systems.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {/* Admins & Dispatchers */}
                    <div className="p-4 rounded-xl border border-border bg-panel-bg/30 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                        <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-primary">
                          <Target className="w-3.5 h-3.5" />
                        </div>
                        Admins & Dispatch
                      </div>
                      <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc pl-4 leading-relaxed">
                        <li><strong>Geofence Setup</strong>: Create zones with customizable center coordinates and safe radii limits.</li>
                        <li><strong>Rider Maps</strong>: Monitor courier routes, speed, pings, and violation trails in real-time.</li>
                        <li><strong>Alert Audits</strong>: Review the violation feed and acknowledge resolved boundary exits.</li>
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
                        <li><strong>Attendance Rules</strong>: Shift check-in cutoffs are 8:15 AM. Late pings are tagged automatically.</li>
                        <li><strong>Face Profile Registry</strong>: Ensure riders complete face descriptor registration to activate webcam check-ins.</li>
                        <li><strong>Logs Export</strong>: Compile custom timecards to CSV directly from the attendance reports.</li>
                      </ul>
                    </div>

                    {/* Payroll Management */}
                    <div className="p-4 rounded-xl border border-border bg-panel-bg/30 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                        <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-primary">
                          <Calculator className="w-3.5 h-3.5" />
                        </div>
                        Payroll Officer
                      </div>
                      <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc pl-4 leading-relaxed">
                        <li><strong>Cutoff Records</strong>: Establishes start/end date bounds to query verified parcel logs in database.</li>
                        <li><strong>Computation Upsert</strong>: Modify individual rider parcel outputs directly and click Save.</li>
                        <li><strong>Payslips Exports</strong>: Compile details to official PDF payslips or full CSV spreadsheets.</li>
                      </ul>
                    </div>

                    {/* Rider App */}
                    <div className="p-4 rounded-xl border border-border bg-panel-bg/30 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                        <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-primary">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        Rider Dashboard
                      </div>
                      <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc pl-4 leading-relaxed">
                        <li><strong>Webcam Check-in</strong>: Align face in frame. The system confirms similarity match.</li>
                        <li><strong>GPS Feeds</strong>: App pings geolocation in background. Closing app updates status to offline.</li>
                        <li><strong>Personal Dashboard</strong>: View current assigned zone limits and daily delivery status updates.</li>
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

                  <div className="space-y-3.5 pt-2">
                    {filteredFaqs.length === 0 ? (
                      <p className="text-center text-xs text-muted-foreground py-8">No matching questions found.</p>
                    ) : (
                      filteredFaqs.map((faq, idx) => (
                        <div key={idx} className="p-3.5 rounded-xl border border-border hover:border-primary/30 transition space-y-1.5">
                          <h4 className="text-xs font-bold text-foreground flex items-start gap-1.5">
                            <span className="text-primary font-mono">Q:</span>
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
                  <SupportTicketDesk currentUser={currentUser} />
                  {/* Right Hotline/Channel Panel */}
                  <div className="p-5 border border-border bg-panel-bg/50 rounded-xl flex flex-col justify-between h-fit space-y-4">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Direct Channels</h4>
                      
                      <div className="space-y-3">
                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 rounded bg-accent flex items-center justify-center shrink-0">
                            <Phone className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">MKB Hotline</div>
                            <div className="text-[11px] text-foreground font-semibold mt-0.5">+63 953 293 5565</div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 rounded bg-accent flex items-center justify-center shrink-0">
                            <Mail className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Email Support</div>
                            <div className="text-[11px] text-foreground font-semibold mt-0.5">support@mkb.ph</div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 rounded bg-accent flex items-center justify-center shrink-0">
                            <Clock className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Crew Availability</div>
                            <div className="text-[11px] text-foreground font-semibold mt-0.5">Mon - Sat, 8:00 AM - 5:00 PM</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 border-t border-border flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        For immediate geofence zone updates or emergency routing, please use the direct operations hotline.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
