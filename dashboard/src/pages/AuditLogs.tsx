import { useCallback, useEffect, useState, useMemo } from 'react';
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
import { StatePanel, SummaryCard } from '../components/common/DashboardPrimitives';

const PAGE_SIZE = 100;

function formatLogTimestamp(value: string) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function formatActionLabel(type: string) {
  return type === 'unauthorized_device_access'
    ? 'Unauthorized device'
    : type.replace(/_/g, ' ');
}

function metadataText(log: ActivityLog, key: string): string | null {
  const value = log.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function AuditEntryDetails({
  log,
  actorRole,
  ip
}: {
  log: ActivityLog;
  actorRole: string;
  ip: string;
}) {
  const detailRows = [
    ['IP Address', ip],
    ['City', log.metadata?.city || 'N/A'],
    ['Region', log.metadata?.region || 'N/A'],
    ['Country', log.metadata?.country || 'N/A'],
    ['ISP', log.metadata?.org || 'N/A']
  ];

  return (
    <div className="grid grid-cols-1 gap-3 p-4 text-[11px] text-muted-foreground lg:grid-cols-3 lg:gap-5 lg:px-6">
      <section className="space-y-2 lg:border-r lg:border-border/60 lg:pr-5">
        <h3 className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-foreground">
          <Globe className="h-3.5 w-3.5 text-primary" /> Network origin
        </h3>
        <dl className="space-y-1.5 rounded-lg border border-border bg-white p-3 font-mono">
          {detailRows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
              <dt>{label}</dt>
              <dd className="text-right font-semibold text-foreground text-wrap-safe">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-2 lg:border-r lg:border-border/60 lg:px-2 lg:pr-5">
        <h3 className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-foreground">
          <Laptop className="h-3.5 w-3.5 text-primary" /> Client environment
        </h3>
        <dl className="space-y-1.5 rounded-lg border border-border bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <dt>App role</dt>
            <dd className="font-mono font-semibold uppercase text-foreground">{actorRole}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt>Event type</dt>
            <dd className="max-w-[70%] text-right font-mono font-semibold text-foreground text-wrap-safe">{log.event_type}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt>Browser agent</dt>
            <dd className="max-w-[70%] text-right font-semibold text-foreground text-wrap-safe">{navigator.userAgent.split(' ')[0]}</dd>
          </div>
        </dl>
      </section>

      <section className="min-w-0 space-y-2">
        <h3 className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-foreground">
          <Database className="h-3.5 w-3.5 text-primary" /> Evidence payload
        </h3>
        <div className="max-h-36 overflow-auto rounded-lg border border-border bg-white p-3 font-mono text-[10px] leading-relaxed">
          <pre className="whitespace-pre-wrap break-words text-foreground">{JSON.stringify(log.metadata || {}, null, 2)}</pre>
        </div>
      </section>
    </div>
  );
}

export function AuditLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'hr' | 'payroll' | 'rider'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '3days' | '7days'>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Load logs on mount & support manual refresh
  const loadLogs = useCallback(async (append = false, offset = 0) => {
    append ? setLoadingMore(true) : setLoading(true);
    setLoadError(false);
    try {
      const data = await getActivityLogs({ limit: PAGE_SIZE, offset });
      setLogs(current => append ? [...current, ...data] : data);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      console.error('[AuditLogs] Load failed:', err);
      pushToast({
        title: 'Failed to load audit logs',
        description: 'Please check database permissions or connection.',
        tone: 'error'
      });
      setLoadError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

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

  const getActionRailColor = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('unauthorized') || t.includes('blocked') || t.includes('security') || t.includes('lock')) return 'bg-rose-500';
    if (t.includes('login') || t.includes('auth')) return 'bg-purple-500';
    if (t.includes('payroll') || t.includes('salary') || t.includes('payout')) return 'bg-blue-500';
    if (t.includes('create') || t.includes('add') || t.includes('insert')) return 'bg-emerald-500';
    if (t.includes('delete') || t.includes('remove') || t.includes('suspend')) return 'bg-red-500';
    if (t.includes('update') || t.includes('modify') || t.includes('edit')) return 'bg-amber-500';
    return 'bg-slate-400';
  };

  return (
    <div className="dashboard-page space-y-5">
      
      {/* Stats Widgets */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <SummaryCard icon={Database} label="Total Log Entries" value={loading ? '…' : stats.total} helper="Currently loaded" tone="neutral" />
        <SummaryCard icon={Lock} label="Login Events" value={loading ? '…' : stats.logins} helper="Biometric and manual check-ins" tone="violet" />
        <SummaryCard icon={ShieldCheck} label="Payroll Status Audits" value={loading ? '…' : stats.payrollUpdates} helper="Approvals and modifications" tone="info" />
        <SummaryCard icon={Activity} label="Admin Modifications" value={loading ? '…' : stats.adminEvents} helper="System settings edits" tone="brand" />
      </div>

      {/* Control panel (Filters + Search) */}
      <div className="ui-toolbar space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Search bar */}
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search audit logs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="ui-control w-full pl-9 pr-4"
            />
          </div>

          {/* Refresh & Exporter */}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:self-end lg:self-auto">
            <button
              onClick={() => void loadLogs()}
              disabled={loading}
              className="ui-button-secondary"
              title="Reload logs from DB"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleExportCSV}
              className="ui-button-primary"
            >
              <Download className="w-4 h-4" />
              Export Logs (CSV)
            </button>
          </div>

        </div>

        {/* Advanced dropdown filters */}
        <div className="grid grid-cols-2 gap-3 border-t border-panel-bg pt-3 lg:flex lg:flex-wrap lg:items-end">
          
          {/* Filter by Role */}
          <label className="order-1 flex min-w-0 flex-col gap-1.5 text-xs text-muted-foreground lg:order-none">
            <span className="flex items-center gap-1.5 font-semibold"><Filter className="w-3.5 h-3.5 text-primary" />Role</span>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as 'all' | 'admin' | 'hr' | 'payroll' | 'rider')}
              className="ui-control w-full px-2 text-xs lg:w-auto"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="hr">HR</option>
              <option value="payroll">Payroll</option>
              <option value="rider">Rider</option>
            </select>
          </label>

          {/* Filter by Type */}
          <label className="order-3 col-span-2 flex min-w-0 flex-col gap-1.5 text-xs text-muted-foreground sm:col-span-1 lg:order-none">
            <span className="font-semibold">Event type</span>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="ui-control w-full min-w-0 px-2 text-xs lg:w-auto lg:max-w-60"
            >
              <option value="all">All Events</option>
              {distinctEventTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>

          {/* Filter by Date range */}
          <label className="order-2 flex min-w-0 flex-col gap-1.5 text-xs text-muted-foreground lg:order-none">
            <span className="flex items-center gap-1.5 font-semibold"><Calendar className="w-3.5 h-3.5 text-primary" />Time range</span>
            <select
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value as 'all' | 'today' | '3days' | '7days')}
              className="ui-control w-full px-2 text-xs lg:w-auto"
            >
              <option value="all">All History</option>
              <option value="today">Today Only</option>
              <option value="3days">Last 3 Days</option>
              <option value="7days">Last 7 Days</option>
            </select>
          </label>

        </div>
      </div>

      {/* Main Table Grid */}
      <div className="ui-card overflow-hidden">
        
        {loading && (
          <StatePanel compact loading title="Loading audit activity" description="Querying the activity ledger…" />
        )}

        {!loading && filteredLogs.length === 0 && (
          <StatePanel
            icon={Database}
            title={loadError ? 'Audit logs could not be loaded' : 'No logs matching filters found'}
            description={loadError ? 'Check your connection and try again.' : 'Try adjusting your search criteria or filters.'}
            action={<button
              type="button"
              onClick={() => loadError ? void loadLogs() : (setSearch(''), setRoleFilter('all'), setTypeFilter('all'), setDateFilter('all'))}
              className="ui-button-secondary"
            >
              {loadError ? 'Retry' : 'Clear filters'}
            </button>}
          />
        )}

        {!loading && filteredLogs.length > 0 && (
          <>
            <div className="divide-y divide-border lg:hidden" aria-label="Audit log records">
              <div className="flex items-center justify-between gap-3 bg-panel-bg px-4 py-2.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Activity ledger</span>
                <span className="font-mono text-[10px] text-muted-foreground">{filteredLogs.length} visible</span>
              </div>

              {filteredLogs.map((log, index) => {
                const isExpanded = expandedRow === log.id;
                const actorName = metadataText(log, 'actor_name_snapshot') || log.users?.full_name || log.riders?.name || 'System / Automated';
                const actorEmail = metadataText(log, 'actor_email_snapshot') || log.users?.email || log.riders?.mkb_id || 'automated@attenrider.system';
                const actorRole = log.users?.role || (log.rider_id ? 'rider' : 'system');
                const ip = log.metadata?.ip || 'Internal/Server';
                const locString = log.metadata?.city
                  ? `${log.metadata.city}, ${log.metadata.region || ''}, ${log.metadata.country || ''}`
                  : 'System API';

                return (
                  <article key={log.id} className="group relative bg-white pl-5 pr-4 py-4">
                    <span className={`absolute bottom-4 left-0 top-4 w-1 rounded-r-full ${getActionRailColor(log.event_type)}`} aria-hidden="true" />

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                          <span className="mr-2 text-primary/80">#{String(index + 1).padStart(2, '0')}</span>
                          {formatLogTimestamp(log.created_at)}
                        </div>
                        <span className={`mt-2 inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${getActionColor(log.event_type)}`}>
                          <span className="truncate">{formatActionLabel(log.event_type)}</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={isExpanded ? 'Collapse audit details' : 'Expand audit details'}
                        aria-expanded={isExpanded}
                        onClick={() => toggleRow(log.id)}
                        className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-panel-bg text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    <div className="mt-3 flex min-w-0 items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-accent/50">
                        <UserIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground text-wrap-safe">{actorName}</div>
                        <div className="font-mono text-[10px] text-muted-foreground text-wrap-safe">{actorEmail}</div>
                      </div>
                    </div>

                    <p className="mt-3 text-[13px] leading-relaxed text-foreground text-wrap-safe">{log.description}</p>

                    <div className="mt-3 grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-2 rounded-lg border border-border/70 bg-panel-bg/55 p-2.5 text-[10px]">
                      <div className="min-w-0">
                        <div className="font-bold uppercase tracking-wider text-muted-foreground">Origin</div>
                        <div className="mt-0.5 truncate font-mono text-foreground" title={ip}>{ip}</div>
                      </div>
                      <div className="min-w-0 border-l border-border pl-2">
                        <div className="font-bold uppercase tracking-wider text-muted-foreground">Location</div>
                        <div className="mt-0.5 truncate text-foreground" title={locString}>{locString}</div>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                          className="-mx-4 mt-4 overflow-hidden border-t border-border bg-panel-bg/45"
                        >
                          <AuditEntryDetails log={log} actorRole={actorRole} ip={ip} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </article>
                );
              })}
            </div>

          <div className="table-scroll-region hidden lg:block" role="region" aria-label="Audit log records" tabIndex={0}>
            <table className="data-table-wide min-w-[66rem] text-xs">
              <thead className="bg-panel-bg border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                <tr>
                  <th colSpan={6} className="p-0">
                    <div className="grid grid-cols-[10.5rem_12rem_11rem_minmax(14rem,1fr)_13rem] gap-4 px-5 py-3">
                      <span>Timestamp</span>
                      <span>Actor profile</span>
                      <span>Event</span>
                      <span>Description</span>
                      <span>Origin / evidence</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLogs.map(log => {
                  const isExpanded = expandedRow === log.id;
                  const actorName = metadataText(log, 'actor_name_snapshot') || log.users?.full_name || log.riders?.name || 'System / Automated';
                  const actorEmail = metadataText(log, 'actor_email_snapshot') || log.users?.email || log.riders?.mkb_id || 'automated@attenrider.system';
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
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                toggleRow(log.id);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-expanded={isExpanded}
                            className={`grid w-full grid-cols-[10.5rem_12rem_11rem_minmax(14rem,1fr)_13rem] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-panel-bg/60 cursor-pointer ${isExpanded ? 'bg-accent/20 font-semibold' : ''}`}
                          >
                            {/* Timestamp */}
                            <div className="text-muted-foreground font-mono whitespace-nowrap">
                              {formatLogTimestamp(log.created_at)}
                            </div>

                            {/* Actor Profile */}
                            <div>
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-panel-bg border border-border flex items-center justify-center shrink-0">
                                  <UserIcon className="w-4 h-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-foreground" title={actorName}>
                                    {actorName}
                                  </div>
                                  <div className="truncate font-mono text-[10px] text-muted-foreground" title={actorEmail}>
                                    {actorEmail}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* User Action */}
                            <div className="min-w-0 pr-2">
                              <span 
                                title={formatActionLabel(log.event_type)}
                                className={`inline-block truncate max-w-full px-2.5 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider border ${getActionColor(log.event_type)}`}
                              >
                                {formatActionLabel(log.event_type)}
                              </span>
                            </div>

                            {/* Description */}
                            <div className="min-w-0 truncate pr-2 text-foreground" title={log.description}>
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
                                aria-label={isExpanded ? 'Collapse audit details' : 'Expand audit details'}
                                aria-expanded={isExpanded}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleRow(log.id);
                                }}
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
                                <AuditEntryDetails log={log} actorRole={actorRole} ip={ip} />
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
          </>
        )}
        {!loading && hasMore && (
          <div className="border-t border-border p-3 text-center">
            <button
              type="button"
              onClick={() => void loadLogs(true, logs.length)}
              disabled={loadingMore}
              className="h-9 rounded-lg border border-border bg-white px-4 text-xs font-semibold text-foreground hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore ? 'Loading older entries…' : 'Load older entries'}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
