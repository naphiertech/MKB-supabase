import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Filter, 
  Calendar, 
  Download, 
  User as UserIcon, 
  ChevronDown, 
  RefreshCw, 
  Activity, 
  Laptop, 
  Globe, 
  ShieldCheck,
  Database,
  Lock
} from 'lucide-react';
import { getActivityLogs, type ActivityLog } from '../lib/apiService';
import { pushToast } from '../hooks/useToast';

export function AuditLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'hr' | 'payroll' | 'rider'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '3days' | '7days'>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Load logs on mount & support manual refresh
  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await getActivityLogs();
      setLogs(data);
    } catch (err) {
      console.error('[AuditLogs] Load failed:', err);
      pushToast({
        title: 'Failed to load audit logs',
        description: 'Please check database permissions or connection.',
        tone: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Compute distinct event types from the current log database for dynamic filter lists
  const distinctEventTypes = useMemo(() => {
    const types = new Set<string>();
    logs.forEach(l => {
      if (l.event_type) types.add(l.event_type);
    });
    return Array.from(types).sort();
  }, [logs]);

  // Statistics summaries
  const stats = useMemo(() => {
    const total = logs.length;
    const logins = logs.filter(l => l.event_type === 'login').length;
    const payrollUpdates = logs.filter(l => l.event_type === 'payroll_status_update').length;
    const adminEvents = logs.filter(l => {
      const uRole = l.users?.role;
      return uRole === 'admin';
    }).length;

    return { total, logins, payrollUpdates, adminEvents };
  }, [logs]);

  // Filter logs based on inputs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // 1. Search term (case-insensitive description, name, or email)
      const searchTerm = search.toLowerCase();
      const name = log.users?.full_name?.toLowerCase() || log.riders?.name?.toLowerCase() || 'unknown';
      const email = log.users?.email?.toLowerCase() || '';
      const desc = log.description?.toLowerCase() || '';
      const eventType = log.event_type?.toLowerCase() || '';
      
      const matchesSearch = 
        name.includes(searchTerm) || 
        email.includes(searchTerm) || 
        desc.includes(searchTerm) || 
        eventType.includes(searchTerm);

      if (!matchesSearch) return false;

      // 2. Role filter
      if (roleFilter !== 'all') {
        const uRole = log.users?.role;
        if (roleFilter === 'rider') {
          // A log is for a rider if user role is rider or rider_id is set
          if (uRole !== 'rider' && !log.rider_id) return false;
        } else {
          if (uRole !== roleFilter) return false;
        }
      }

      // 3. Event Type filter
      if (typeFilter !== 'all') {
        if (log.event_type !== typeFilter) return false;
      }

      // 4. Date filter
      if (dateFilter !== 'all') {
        const logDate = new Date(log.created_at);
        const now = new Date();
        const diffMs = now.getTime() - logDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (dateFilter === 'today') {
          const logDateStr = logDate.toDateString();
          const nowDateStr = now.toDateString();
          if (logDateStr !== nowDateStr) return false;
        } else if (dateFilter === '3days') {
          if (diffDays > 3) return false;
        } else if (dateFilter === '7days') {
          if (diffDays > 7) return false;
        }
      }

      return true;
    });
  }, [logs, search, roleFilter, typeFilter, dateFilter]);

  // Handle collapsible row toggle
  const toggleRow = (id: string) => {
    setExpandedRow(prev => (prev === id ? null : id));
  };

  // CSV Downloader
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      pushToast({
        title: 'No logs to export',
        tone: 'error'
      });
      return;
    }

    const headers = ['ID', 'Date & Time', 'Actor', 'Email', 'Role', 'Event Type', 'Description', 'IP Address', 'Location', 'ISP'];
    const rows = filteredLogs.map(l => {
      const actorName = l.users?.full_name || l.riders?.name || 'System';
      const actorEmail = l.users?.email || 'N/A';
      const actorRole = l.users?.role || (l.rider_id ? 'rider' : 'system');
      const ip = l.metadata?.ip || 'N/A';
      const loc = l.metadata?.city ? `${l.metadata.city}, ${l.metadata.region || ''}, ${l.metadata.country || ''}` : 'N/A';
      const isp = l.metadata?.org || 'N/A';

      return [
        l.id,
        new Date(l.created_at).toLocaleString('en-PH'),
        actorName,
        actorEmail,
        actorRole,
        l.event_type,
        l.description,
        ip,
        loc,
        isp
      ];
    });

    const escapeCSV = (v: string) => 
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

    const csvContent = 
      [headers, ...rows]
        .map(row => row.map(c => escapeCSV(String(c ?? ''))).join(','))
        .join('\n') + '\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mkbridertrack_audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    pushToast({
      title: 'Audit logs exported',
      description: `Downloaded ${filteredLogs.length} entries.`,
      tone: 'success'
    });
  };

  // UI Event Tag Color Mapping
  const getActionColor = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('unauthorized') || t.includes('blocked') || t.includes('security') || t.includes('lock')) {
      return 'bg-rose-50 text-rose-700 border-rose-200/50';
    }
    if (t.includes('login') || t.includes('auth')) {
      return 'bg-purple-50 text-purple-700 border-purple-200/50';
    }
    if (t.includes('payroll') || t.includes('salary') || t.includes('payout')) {
      return 'bg-blue-50 text-blue-700 border-blue-200/50';
    }
    if (t.includes('create') || t.includes('add') || t.includes('insert')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200/50';
    }
    if (t.includes('delete') || t.includes('remove') || t.includes('suspend')) {
      return 'bg-red-50 text-red-700 border-red-200/50';
    }
    if (t.includes('update') || t.includes('modify') || t.includes('edit')) {
      return 'bg-amber-50 text-amber-700 border-amber-200/50';
    }
    return 'bg-gray-50 text-gray-700 border-gray-200/50';
  };

  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-6">
      
      {/* Stats Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Events */}
        <div className="bg-white border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold">
              Total Log Entries
            </div>
            <div className="mt-1 text-2xl font-bold font-mono text-foreground">
              {loading ? '...' : stats.total}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
              since initialization
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-panel-bg border border-border flex items-center justify-center">
            <Database className="w-5 h-5 text-primary" />
          </div>
        </div>

        {/* Login Events */}
        <div className="bg-white border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold">
              Login Events
            </div>
            <div className="mt-1 text-2xl font-bold font-mono text-purple-700">
              {loading ? '...' : stats.logins}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
              biometric & manual checkins
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center">
            <Lock className="w-5 h-5 text-purple-600" />
          </div>
        </div>

        {/* Payroll Actions */}
        <div className="bg-white border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold">
              Payroll Status Audits
            </div>
            <div className="mt-1 text-2xl font-bold font-mono text-blue-700">
              {loading ? '...' : stats.payrollUpdates}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
              approvals and modifications
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
          </div>
        </div>

        {/* Admin operations */}
        <div className="bg-white border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold">
              Admin Modifications
            </div>
            <div className="mt-1 text-2xl font-bold font-mono text-primary">
              {loading ? '...' : stats.adminEvents}
            </div>
            <div className="text-[10px] text-primary/80 font-mono mt-0.5">
              system settings edits
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-accent border border-primary/25 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
        </div>

      </div>

      {/* Control panel (Filters + Search) */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Search bar */}
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search logs by description, user name, email, action..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-lg bg-panel-bg border border-border text-sm text-foreground placeholder-subtle-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition"
            />
          </div>

          {/* Refresh & Exporter */}
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <button
              onClick={loadLogs}
              disabled={loading}
              className="h-10 px-3 border border-border hover:border-primary/40 rounded-lg text-sm text-muted-foreground hover:text-foreground bg-white transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              title="Reload logs from DB"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleExportCSV}
              className="h-10 px-4 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-semibold transition flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export Logs (CSV)
            </button>
          </div>

        </div>

        {/* Advanced dropdown filters */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-panel-bg">
          
          {/* Filter by Role */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="w-3.5 h-3.5 text-primary" />
            <span>Role:</span>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as 'all' | 'admin' | 'hr' | 'payroll' | 'rider')}
              className="h-8 border border-border rounded bg-white text-xs px-2 outline-none focus:border-primary"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="hr">HR</option>
              <option value="payroll">Payroll</option>
              <option value="rider">Rider</option>
            </select>
          </div>

          {/* Filter by Type */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Event:</span>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="h-8 border border-border rounded bg-white text-xs px-2 outline-none focus:border-primary"
            >
              <option value="all">All Events</option>
              {distinctEventTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Filter by Date range */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <span>Time Range:</span>
            <select
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value as 'all' | 'today' | '3days' | '7days')}
              className="h-8 border border-border rounded bg-white text-xs px-2 outline-none focus:border-primary"
            >
              <option value="all">All History</option>
              <option value="today">Today Only</option>
              <option value="3days">Last 3 Days</option>
              <option value="7days">Last 7 Days</option>
            </select>
          </div>

        </div>
      </div>

      {/* Main Table Grid */}
      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        
        {loading && (
          <div className="p-10 text-center space-y-4">
            <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto" />
            <div className="text-sm text-muted-foreground font-medium">Querying public.activity_logs...</div>
          </div>
        )}

        {!loading && filteredLogs.length === 0 && (
          <div className="p-16 text-center space-y-2">
            <Database className="w-10 h-10 text-subtle-text mx-auto" />
            <div className="text-sm font-semibold text-foreground">No logs matching filters found</div>
            <div className="text-xs text-muted-foreground">Try adjusting your search criteria or filters.</div>
          </div>
        )}

        {!loading && filteredLogs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-panel-bg border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                <tr>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Actor Profile</th>
                  <th className="px-5 py-3">User Action</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">IP / Location</th>
                  <th className="px-5 py-3 text-center">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLogs.map(log => {
                  const isExpanded = expandedRow === log.id;
                  const actorName = log.users?.full_name || log.riders?.name || 'System / Automated';
                  const actorEmail = log.users?.email || 'automated@attenrider.system';
                  const actorRole = log.users?.role || (log.rider_id ? 'rider' : 'system');
                  
                  // Extract IP location details if present
                  const ip = log.metadata?.ip || 'Internal/Server';
                  const locString = log.metadata?.city 
                    ? `${log.metadata.city}, ${log.metadata.region || ''}, ${log.metadata.country || ''}`
                    : 'System API';

                  return (
                    <tr key={log.id} className="border-b border-border">
                      <td colSpan={6} className="p-0">
                        <div className="w-full">
                          {/* Row Summary */}
                          <div 
                            onClick={() => toggleRow(log.id)}
                            className={`w-full grid grid-cols-1 md:grid-cols-6 items-center hover:bg-panel-bg/60 transition-colors cursor-pointer px-5 py-3.5 ${isExpanded ? 'bg-accent/20 font-semibold' : ''}`}
                          >
                            {/* Timestamp */}
                            <div className="text-muted-foreground font-mono whitespace-nowrap">
                              {new Date(log.created_at).toLocaleString('en-PH', {
                                month: 'short',
                                day: '2-digit',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: true
                              })}
                            </div>

                            {/* Actor Profile */}
                            <div>
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-panel-bg border border-border flex items-center justify-center shrink-0">
                                  <UserIcon className="w-4 h-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-foreground truncate max-w-[120px]" title={actorName}>
                                    {actorName}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate max-w-[120px] font-mono" title={actorEmail}>
                                    {actorEmail}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* User Action */}
                            <div className="min-w-0 pr-2">
                              <span 
                                title={log.event_type.replace(/_/g, ' ')}
                                className={`inline-block truncate max-w-full px-2.5 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider border ${getActionColor(log.event_type)}`}
                              >
                                {log.event_type === 'unauthorized_device_access' ? 'UNAUTHORIZED DEVICE' : log.event_type.replace(/_/g, ' ')}
                              </span>
                            </div>

                            {/* Description */}
                            <div className="md:col-span-2 text-foreground truncate pr-4 min-w-0" title={log.description}>
                              {log.description}
                            </div>

                            {/* IP / Location & Toggle */}
                            <div className="flex items-center justify-between">
                              <div className="min-w-0 pr-2">
                                <div className="font-mono text-[10px] text-foreground truncate">{ip}</div>
                                <div className="text-[10px] text-muted-foreground truncate" title={locString}>{locString}</div>
                              </div>
                              <motion.button
                                whileTap={{ scale: 0.92 }}
                                type="button"
                                className="p-1 rounded bg-panel-bg border border-border text-muted-foreground hover:text-foreground transition cursor-pointer"
                              >
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ease-out ${isExpanded ? 'rotate-180' : ''}`} />
                              </motion.button>
                            </div>
                          </div>

                          {/* Expandable details panel */}
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                                className="overflow-hidden border-t border-border bg-panel-bg/45"
                              >
                                <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-5 text-[11px] text-muted-foreground">
                                  
                                  {/* Column A: Network & Origin Details */}
                                  <div className="space-y-2 border-r border-border/60 pr-4">
                                    <div className="font-bold uppercase tracking-wider text-foreground flex items-center gap-1">
                                      <Globe className="w-3.5 h-3.5 text-primary" /> Network Credentials
                                    </div>
                                    <div className="space-y-1 bg-white border border-border rounded-lg p-2.5 font-mono">
                                      <div className="flex justify-between"><span className="text-muted-foreground">IP Address:</span><span className="text-foreground font-semibold">{ip}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">City:</span><span className="text-foreground font-semibold">{log.metadata?.city || 'N/A'}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Region:</span><span className="text-foreground font-semibold">{log.metadata?.region || 'N/A'}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Country:</span><span className="text-foreground font-semibold">{log.metadata?.country || 'N/A'}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">ISP:</span><span className="text-foreground font-semibold truncate max-w-[120px]" title={log.metadata?.org}>{log.metadata?.org || 'N/A'}</span></div>
                                    </div>
                                  </div>

                                  {/* Column B: Device / Browser credentials */}
                                  <div className="space-y-2 border-r border-border/60 px-2 md:px-4">
                                    <div className="font-bold uppercase tracking-wider text-foreground flex items-center gap-1">
                                      <Laptop className="w-3.5 h-3.5 text-primary" /> Client Environment
                                    </div>
                                    <div className="space-y-1 bg-white border border-border rounded-lg p-2.5">
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">App Role:</span>
                                        <span className="text-foreground font-mono font-semibold uppercase">{actorRole}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Event Type:</span>
                                        <span className="text-foreground font-mono font-semibold">{log.event_type}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Browser Agent:</span>
                                        <span className="text-foreground font-semibold truncate max-w-[120px]" title={navigator.userAgent}>{navigator.userAgent.split(' ')[0]}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Column C: Custom event metadata JSON */}
                                  <div className="space-y-2">
                                    <div className="font-bold uppercase tracking-wider text-foreground flex items-center gap-1">
                                      <Database className="w-3.5 h-3.5 text-primary" /> Metadata Parameters
                                    </div>
                                    <div className="bg-white border border-border rounded-lg p-2.5 font-mono overflow-x-auto max-h-[110px] text-[10px] leading-relaxed">
                                      <pre className="text-foreground">{JSON.stringify(log.metadata || {}, null, 2)}</pre>
                                    </div>
                                  </div>

                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
