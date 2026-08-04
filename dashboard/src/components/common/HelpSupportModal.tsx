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
  AlertTriangle,
  User,
  MessageSquare,
  ChevronDown
} from 'lucide-react';
import { BRANDING } from '../../config/branding';

export type HelpTab = 'guide' | 'faq' | 'support';

interface HelpSupportModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: HelpTab;
}

export function HelpSupportModal({ open, onClose, defaultTab = 'guide' }: HelpSupportModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [activeTab, setActiveTab] = useState<HelpTab>(defaultTab);
  const [faqSearch, setFaqSearch] = useState('');
  
  // Support Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    category: 'technical',
    message: ''
  });
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
            className="absolute inset-y-0 right-0 w-full max-w-lg h-full bg-white border-l border-border shadow-2xl flex flex-col overflow-hidden z-10 font-[Geist,sans-serif]"
          >
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-panel-bg">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/30 flex items-center justify-center">
                <HelpCircle className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h2 id="help-support-title" className="text-base font-bold text-foreground">Help & Support Center</h2>
                <p className="text-[11px] text-muted-foreground font-mono">User guides, FAQs, and support ticket desk</p>
              </div>
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Close help and support"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-border/50 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs & Content */}
          <div className="flex flex-col overflow-hidden flex-1">
            {/* Top Navigation Tabs Bar */}
            <div className="flex px-6 py-2 bg-panel-bg border-b border-border gap-1 shrink-0" role="tablist" aria-label="Help sections">
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
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition duration-150 cursor-pointer ${
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
            <div className="flex-1 p-6 overflow-y-auto bg-white">
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
                  {/* Left Form Panel */}
                  <div className="space-y-4">
                    <h3 className="text-base font-bold text-foreground">Submit Support Ticket</h3>
                    
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <div className="text-xs font-bold">Not yet available</div>
                        <p id="support-unavailable-note" className="mt-0.5 text-xs leading-relaxed text-amber-800">
                          Online support tickets are planned but are not connected yet. Please use the direct contact channels below.
                        </p>
                      </div>
                    </div>
                    <form onSubmit={(event) => event.preventDefault()} className="space-y-4" aria-describedby="support-unavailable-note">
                      <fieldset disabled className="space-y-4 opacity-60">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label htmlFor="support-name" className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold block">Your Name</label>
                            <div className="relative group">
                              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors duration-200">
                                <User className="w-4 h-4" />
                              </span>
                              <input
                                id="support-name"
                                type="text"
                                required
                                placeholder="e.g. Ronald"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                className="w-full h-10 pl-9 pr-3 rounded-xl border border-border text-xs outline-none bg-panel-bg/30 hover:bg-white hover:border-primary/40 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/8 transition-all duration-200"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label htmlFor="support-email" className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold block">Email Address</label>
                            <div className="relative group">
                              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors duration-200">
                                <Mail className="w-4 h-4" />
                              </span>
                              <input
                                id="support-email"
                                type="email"
                                required
                                placeholder="ronald@mkb.ph"
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                className="w-full h-10 pl-9 pr-3 rounded-xl border border-border text-xs outline-none bg-panel-bg/30 hover:bg-white hover:border-primary/40 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/8 transition-all duration-200"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="support-category" className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold block">Ticket Category</label>
                          <div className="relative group">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors duration-200">
                              <HelpCircle className="w-4 h-4" />
                            </span>
                            <select
                              id="support-category"
                              value={formData.category}
                              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                              className="w-full h-10 pl-9 pr-8 rounded-xl border border-border text-xs outline-none bg-panel-bg/30 hover:bg-white hover:border-primary/40 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/8 transition-all duration-200 font-sans appearance-none cursor-pointer"
                            >
                              <option value="technical">Technical Glitch / Bug</option>
                              <option value="attendance">Biometric Face Check-in Failure</option>
                              <option value="geofence">Geofence / GPS Pin Discrepancy</option>
                              <option value="payroll">Payroll Cutoff / Rate Modification</option>
                            </select>
                            <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors duration-200">
                              <ChevronDown className="w-4 h-4" />
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label htmlFor="support-message" className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold block">Message / Issue Details</label>
                            <span className={`text-[10px] font-mono font-semibold transition-colors duration-200 ${
                              formData.message.length >= 450 ? 'text-red-500' :
                              formData.message.length >= 350 ? 'text-amber-500' : 'text-muted-foreground'
                            }`}>
                              {formData.message.length} / 500
                            </span>
                          </div>
                          <div className="relative group">
                            <span className="absolute top-3 left-3 pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors duration-200">
                              <MessageSquare className="w-4 h-4" />
                            </span>
                            <textarea
                              id="support-message"
                              required
                              rows={4}
                              maxLength={500}
                              placeholder="Explain the technical problem here..."
                              value={formData.message}
                              onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border text-xs outline-none bg-panel-bg/30 hover:bg-white hover:border-primary/40 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/8 transition-all duration-200 resize-none font-sans"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled
                          className="w-full h-11 rounded-xl border border-border bg-panel-bg text-muted-foreground text-xs font-bold flex items-center justify-center disabled:cursor-not-allowed"
                        >
                          Submit Support Ticket — Not yet available
                        </button>
                      </fieldset>
                      </form>
                  </div>

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
