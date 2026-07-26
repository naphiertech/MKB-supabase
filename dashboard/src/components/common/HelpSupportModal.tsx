import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  BookOpen,
  HelpCircle,
  Headphones,
  Mail,
  Phone,
  Clock,
  Send,
  CheckCircle,
  FileText,
  Target,
  ClipboardCheck,
  Calculator,
  AlertTriangle,
  User,
  MessageSquare,
  ChevronDown
} from 'lucide-react';
import { pushToast } from '../../hooks/useToast';
import { BRANDING } from '../../config/branding';

export type HelpTab = 'guide' | 'faq' | 'support';

interface HelpSupportModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: HelpTab;
}

export function HelpSupportModal({ open, onClose, defaultTab = 'guide' }: HelpSupportModalProps) {
  const [activeTab, setActiveTab] = useState<HelpTab>(defaultTab);
  const [faqSearch, setFaqSearch] = useState('');
  
  // Support Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    category: 'technical',
    message: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Sync active tab with defaultTab prop when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
      setSuccess(false);
    }
  }, [open, defaultTab]);
  const handleSupportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      pushToast({
        title: 'Validation Error',
        description: 'Please fill in all required fields.',
        tone: 'error'
      });
      return;
    }

    setSubmitting(true);
    // Simulate sending request to support email/endpoint
    setTimeout(() => {
      setSubmitting(false);
      setSuccess(true);
      pushToast({
        title: 'Message Sent',
        description: 'Your support request has been delivered. We will respond within 24 hours.',
        tone: 'success'
      });
    }, 1200);
  };

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
      a: "When a rider clocks in or out, MediaPipe Tasks Vision runs in the client browser to compute a 512-dimension face descriptor. This descriptor is matched against the rider's cached facial profile using euclidean distance check (requires a match score above 0.6)."
    },
    {
      q: "Can HR edit attendance logs manually?",
      a: "Yes. HR and Admin profiles can manually update attendance states, notes, and time-in/time-out records directly from the Attendance Management page, which logs the edit source as 'manual' for transparency."
    },
    {
      q: "How are payroll gross amounts calculated?",
      a: "MKB Payroll calculates payout based on cutoff periods. The system supports custom per-parcel rates (default ₱50.00) multiplied by the total verified parcels delivered during that cutoff period."
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
            className="absolute inset-0 bg-[#1A1410]/50 backdrop-blur-sm"
          />

          {/* Slide-over Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute inset-y-0 right-0 w-full max-w-lg h-full bg-white border-l border-[#EFEAE2] shadow-2xl flex flex-col overflow-hidden z-10 font-[Geist,sans-serif]"
          >
          {/* Header */}
          <div className="px-6 py-4 border-b border-[#EFEAE2] flex items-center justify-between bg-[#FAFAF7]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/30 flex items-center justify-center">
                <HelpCircle className="w-4.5 h-4.5 text-[#db6c00]" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#1A1410]">Help & Support Center</h2>
                <p className="text-[11px] text-[#6B6258] font-mono">User guides, FAQs, and support ticket desk</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#6B6258] hover:text-[#1A1410] hover:bg-[#EFEAE2]/50 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs & Content */}
          <div className="flex flex-col overflow-hidden flex-1">
            {/* Top Navigation Tabs Bar */}
            <div className="flex px-6 py-2 bg-[#FAFAF7] border-b border-[#EFEAE2] gap-1 shrink-0">
              {(['guide', 'faq', 'support'] as const).map((tab) => {
                const active = activeTab === tab;
                const label = tab === 'guide' ? 'User Guide' : tab === 'faq' ? 'FAQ' : 'Contact Support';
                const Icon = tab === 'guide' ? BookOpen : tab === 'faq' ? HelpCircle : Headphones;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition duration-150 cursor-pointer ${
                      active
                        ? 'bg-white text-[#b85a00] border border-[#EFEAE2] shadow-xs'
                        : 'text-[#6B6258] hover:text-[#1A1410] hover:bg-white/50'
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
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-[#1A1410] mb-1">{BRANDING.appName} Operational Guide</h3>
                    <p className="text-xs text-[#6B6258] leading-relaxed">
                      Learn how to successfully manage and interact with our realtime geofencing, face check-ins, and payroll systems.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {/* Admins & Dispatchers */}
                    <div className="p-4 rounded-xl border border-[#EFEAE2] bg-[#FAFAF7]/30 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#1A1410]">
                        <div className="w-6 h-6 rounded-md bg-[#FFF1E0] flex items-center justify-center text-[#db6c00]">
                          <Target className="w-3.5 h-3.5" />
                        </div>
                        Admins & Dispatch
                      </div>
                      <ul className="text-[11px] text-[#6B6258] space-y-1.5 list-disc pl-4 leading-relaxed">
                        <li><strong>Geofence Setup</strong>: Create zones with customizable center coordinates and safe radii limits.</li>
                        <li><strong>Rider Maps</strong>: Monitor courier routes, speed, pings, and violation trails in real-time.</li>
                        <li><strong>Alert Audits</strong>: Review the violation feed and acknowledge resolved boundary exits.</li>
                      </ul>
                    </div>

                    {/* HR Management */}
                    <div className="p-4 rounded-xl border border-[#EFEAE2] bg-[#FAFAF7]/30 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#1A1410]">
                        <div className="w-6 h-6 rounded-md bg-[#FFF1E0] flex items-center justify-center text-[#db6c00]">
                          <ClipboardCheck className="w-3.5 h-3.5" />
                        </div>
                        HR Management
                      </div>
                      <ul className="text-[11px] text-[#6B6258] space-y-1.5 list-disc pl-4 leading-relaxed">
                        <li><strong>Attendance Rules</strong>: Shift check-in cutoffs are 8:15 AM. Late pings are tagged automatically.</li>
                        <li><strong>Face Profile Registry</strong>: Ensure riders complete face descriptor registration to activate webcam check-ins.</li>
                        <li><strong>Logs Export</strong>: Compile custom timecards to CSV directly from the attendance reports.</li>
                      </ul>
                    </div>

                    {/* Payroll Management */}
                    <div className="p-4 rounded-xl border border-[#EFEAE2] bg-[#FAFAF7]/30 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#1A1410]">
                        <div className="w-6 h-6 rounded-md bg-[#FFF1E0] flex items-center justify-center text-[#db6c00]">
                          <Calculator className="w-3.5 h-3.5" />
                        </div>
                        Payroll Officer
                      </div>
                      <ul className="text-[11px] text-[#6B6258] space-y-1.5 list-disc pl-4 leading-relaxed">
                        <li><strong>Cutoff Records</strong>: Establishes start/end date bounds to query verified parcel logs in database.</li>
                        <li><strong>Computation Upsert</strong>: Modify individual rider parcel outputs directly and click Save.</li>
                        <li><strong>Payslips Exports</strong>: Compile details to official PDF payslips or full CSV spreadsheets.</li>
                      </ul>
                    </div>

                    {/* Rider App */}
                    <div className="p-4 rounded-xl border border-[#EFEAE2] bg-[#FAFAF7]/30 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#1A1410]">
                        <div className="w-6 h-6 rounded-md bg-[#FFF1E0] flex items-center justify-center text-[#db6c00]">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        Rider Dashboard
                      </div>
                      <ul className="text-[11px] text-[#6B6258] space-y-1.5 list-disc pl-4 leading-relaxed">
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
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <h3 className="text-base font-bold text-[#1A1410]">Frequently Asked Questions</h3>
                    <input
                      type="text"
                      placeholder="Search questions and answers..."
                      value={faqSearch}
                      onChange={(e) => setFaqSearch(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-[#EFEAE2] text-xs outline-none bg-[#FAFAF7] focus:border-[#db6c00] focus:ring-1 focus:ring-[#db6c00]/15"
                    />
                  </div>

                  <div className="space-y-3.5 pt-2">
                    {filteredFaqs.length === 0 ? (
                      <p className="text-center text-xs text-[#6B6258] py-8">No matching questions found.</p>
                    ) : (
                      filteredFaqs.map((faq, idx) => (
                        <div key={idx} className="p-3.5 rounded-xl border border-[#EFEAE2] hover:border-[#db6c00]/30 transition space-y-1.5">
                          <h4 className="text-xs font-bold text-[#1A1410] flex items-start gap-1.5">
                            <span className="text-[#db6c00] font-mono">Q:</span>
                            {faq.q}
                          </h4>
                          <p className="text-[11px] text-[#6B6258] pl-4 leading-relaxed">
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
                <div className="grid grid-cols-1 gap-6">
                  {/* Left Form Panel */}
                  <div className="space-y-4">
                    <h3 className="text-base font-bold text-[#1A1410]">Submit Support Ticket</h3>
                    
                    {success ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-6 border border-emerald-500/25 bg-emerald-50/50 rounded-xl text-center space-y-3 flex flex-col items-center"
                      >
                        <CheckCircle className="w-10 h-10 text-emerald-600" />
                        <h4 className="text-sm font-bold text-emerald-800">Support Ticket Created</h4>
                        <p className="text-xs text-emerald-700 max-w-xs leading-relaxed">
                          Your technical request has been compiled. Our operations crew will review details and email you shortly.
                        </p>
                        <button
                          onClick={() => {
                            setSuccess(false);
                            setFormData({ name: '', email: '', category: 'technical', message: '' });
                          }}
                          className="mt-2 text-xs font-bold text-[#db6c00] hover:text-[#b85a00] underline"
                        >
                          Send another message
                        </button>
                      </motion.div>
                    ) : (
                      <form onSubmit={handleSupportSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold block">Your Name</label>
                            <div className="relative group">
                              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6B6258] group-focus-within:text-[#db6c00] transition-colors duration-200">
                                <User className="w-4 h-4" />
                              </span>
                              <input
                                type="text"
                                required
                                placeholder="e.g. Ronald"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#EFEAE2] text-xs outline-none bg-[#FAFAF7]/30 hover:bg-white hover:border-[#db6c00]/40 focus:bg-white focus:border-[#db6c00] focus:ring-4 focus:ring-[#db6c00]/8 transition-all duration-200"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold block">Email Address</label>
                            <div className="relative group">
                              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6B6258] group-focus-within:text-[#db6c00] transition-colors duration-200">
                                <Mail className="w-4 h-4" />
                              </span>
                              <input
                                type="email"
                                required
                                placeholder="ronald@mkb.ph"
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#EFEAE2] text-xs outline-none bg-[#FAFAF7]/30 hover:bg-white hover:border-[#db6c00]/40 focus:bg-white focus:border-[#db6c00] focus:ring-4 focus:ring-[#db6c00]/8 transition-all duration-200"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold block">Ticket Category</label>
                          <div className="relative group">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6B6258] group-focus-within:text-[#db6c00] transition-colors duration-200">
                              <HelpCircle className="w-4 h-4" />
                            </span>
                            <select
                              value={formData.category}
                              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                              className="w-full h-10 pl-9 pr-8 rounded-xl border border-[#EFEAE2] text-xs outline-none bg-[#FAFAF7]/30 hover:bg-white hover:border-[#db6c00]/40 focus:bg-white focus:border-[#db6c00] focus:ring-4 focus:ring-[#db6c00]/8 transition-all duration-200 font-sans appearance-none cursor-pointer"
                            >
                              <option value="technical">Technical Glitch / Bug</option>
                              <option value="attendance">Biometric Face Check-in Failure</option>
                              <option value="geofence">Geofence / GPS Pin Discrepancy</option>
                              <option value="payroll">Payroll Cutoff / Rate Modification</option>
                            </select>
                            <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B6258] group-focus-within:text-[#db6c00] transition-colors duration-200">
                              <ChevronDown className="w-4 h-4" />
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold block">Message / Issue Details</label>
                            <span className={`text-[10px] font-mono font-semibold transition-colors duration-200 ${
                              formData.message.length >= 450 ? 'text-red-500' :
                              formData.message.length >= 350 ? 'text-amber-500' : 'text-[#6B6258]'
                            }`}>
                              {formData.message.length} / 500
                            </span>
                          </div>
                          <div className="relative group">
                            <span className="absolute top-3 left-3 pointer-events-none text-[#6B6258] group-focus-within:text-[#db6c00] transition-colors duration-200">
                              <MessageSquare className="w-4 h-4" />
                            </span>
                            <textarea
                              required
                              rows={4}
                              maxLength={500}
                              placeholder="Explain the technical problem here..."
                              value={formData.message}
                              onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#EFEAE2] text-xs outline-none bg-[#FAFAF7]/30 hover:bg-white hover:border-[#db6c00]/40 focus:bg-white focus:border-[#db6c00] focus:ring-4 focus:ring-[#db6c00]/8 transition-all duration-200 resize-none font-sans"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full h-11 rounded-xl bg-[#db6c00] hover:bg-[#b85a00] text-white text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md hover:shadow-[#db6c00]/10 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {submitting ? (
                            <div className="flex items-center gap-2">
                              <svg className="animate-spin h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span>Submitting ticket...</span>
                            </div>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>Submit Support Ticket</span>
                            </>
                          )}
                        </button>
                      </form>
                    )}
                  </div>

                  {/* Right Hotline/Channel Panel */}
                  <div className="p-5 border border-[#EFEAE2] bg-[#FAFAF7]/50 rounded-xl flex flex-col justify-between h-fit space-y-4">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-[#1A1410] uppercase tracking-wider">Direct Channels</h4>
                      
                      <div className="space-y-3">
                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 rounded bg-[#FFF1E0] flex items-center justify-center shrink-0">
                            <Phone className="w-3.5 h-3.5 text-[#db6c00]" />
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold">MKB Hotline</div>
                            <div className="text-[11px] text-[#1A1410] font-semibold mt-0.5">+63 953 293 5565</div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 rounded bg-[#FFF1E0] flex items-center justify-center shrink-0">
                            <Mail className="w-3.5 h-3.5 text-[#db6c00]" />
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold">Email Support</div>
                            <div className="text-[11px] text-[#1A1410] font-semibold mt-0.5">support@mkb.ph</div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 rounded bg-[#FFF1E0] flex items-center justify-center shrink-0">
                            <Clock className="w-3.5 h-3.5 text-[#db6c00]" />
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold">Crew Availability</div>
                            <div className="text-[11px] text-[#1A1410] font-semibold mt-0.5">Mon - Sat, 8:00 AM - 5:00 PM</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 border-t border-[#EFEAE2] flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#db6c00] shrink-0 mt-0.5" />
                      <p className="text-[10px] text-[#6B6258] leading-relaxed">
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
