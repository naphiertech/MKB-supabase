import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Check,
  CheckCheck,
  Archive,
  Trash2,
  RotateCcw,
  AlertTriangle,
  ChevronRight,
  Clock,
  DollarSign,
  MapPin,
  UserCheck,
  User,
  Megaphone,
  Info,
  Loader2,
  X
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNotificationContext } from '../context/NotificationContext';
import {
  calculateTrashDaysRemaining,
  isExpiredTrash,
  type NotificationStatusTab
} from '../services/notifications/notificationService';
import { appToast } from '../hooks/useToast';

interface NotificationCenterProps {
  onNavigate?: (path: string) => void;
}

const CATEGORY_ICONS: Record<
  string,
  {
    icon: React.ElementType;
    bg: string;
    fg: string;
  }
> = {
  attendance: {
    icon: Clock,
    bg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    fg: 'text-emerald-600'
  },
  payroll: {
    icon: DollarSign,
    bg: 'bg-amber-50 text-amber-600 border-amber-100',
    fg: 'text-amber-600'
  },
  geofence: {
    icon: MapPin,
    bg: 'bg-rose-50 text-rose-600 border-rose-100',
    fg: 'text-rose-600'
  },
  biometrics: {
    icon: UserCheck,
    bg: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    fg: 'text-indigo-600'
  },
  account: {
    icon: User,
    bg: 'bg-sky-50 text-sky-600 border-sky-100',
    fg: 'text-sky-600'
  },
  announcement: {
    icon: Megaphone,
    bg: 'bg-purple-50 text-purple-600 border-purple-100',
    fg: 'text-purple-600'
  },
  system: {
    icon: Info,
    bg: 'bg-slate-50 text-slate-600 border-slate-100',
    fg: 'text-slate-600'
  }
};

const PRIORITY_BADGES: Record<
  string,
  {
    label: string;
    badge: string;
  }
> = {
  critical: {
    label: 'CRITICAL',
    badge: 'bg-rose-100 text-rose-700 border-rose-200 font-bold'
  },
  high: {
    label: 'HIGH',
    badge: 'bg-red-50 text-red-600 border-red-200'
  },
  medium: {
    label: 'MEDIUM',
    badge: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  low: {
    label: 'LOW',
    badge: 'bg-slate-50 text-slate-600 border-slate-200'
  }
};

export function NotificationCenter({ onNavigate }: NotificationCenterProps) {
  const {
    notifications: allNotifications,
    loading,
    markAsRead,
    markAllAsRead,
    archiveNotifications,
    trashNotifications,
    restoreNotifications,
    deleteNotificationsPermanently,
    emptyTrash
  } = useNotificationContext();

  const [activeTab, setActiveTab] = useState<NotificationStatusTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [emptyTrashDialogOpen, setEmptyTrashDialogOpen] = useState(false);
  const [isActionInProgress, setIsActionInProgress] = useState(false);

  // Clear selections on tab switch
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  // Tab counts calculation
  const counts = useMemo(() => {
    const unexpired = allNotifications.filter(n => !isExpiredTrash(n.deleted_at));
    const active = unexpired.filter(n => !n.deleted_at && !n.archived_at);
    return {
      all: active.length,
      unread: active.filter(n => !n.read).length,
      read: active.filter(n => n.read).length,
      archived: unexpired.filter(n => !n.deleted_at && n.archived_at).length,
      trash: unexpired.filter(n => Boolean(n.deleted_at)).length
    };
  }, [allNotifications]);

  // Filter notifications based on tab, search, priority, and category
  const filteredNotifications = useMemo(() => {
    return allNotifications.filter(n => {
      // Exclude expired trash (over 30 days) everywhere
      if (isExpiredTrash(n.deleted_at)) return false;

      // Tab filter
      switch (activeTab) {
        case 'trash':
          if (!n.deleted_at) return false;
          break;
        case 'archived':
          if (n.deleted_at || !n.archived_at) return false;
          break;
        case 'unread':
          if (n.deleted_at || n.archived_at || n.read) return false;
          break;
        case 'read':
          if (n.deleted_at || n.archived_at || !n.read) return false;
          break;
        case 'all':
        default:
          if (n.deleted_at || n.archived_at) return false;
          break;
      }

      // Priority filter
      if (selectedPriority !== 'all' && n.priority !== selectedPriority) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && n.category !== selectedCategory) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = n.title?.toLowerCase().includes(query);
        const matchesMessage = n.message?.toLowerCase().includes(query);
        const matchesType = n.type?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesMessage && !matchesType) {
          return false;
        }
      }

      return true;
    });
  }, [allNotifications, activeTab, selectedPriority, selectedCategory, searchQuery]);

  // Bulk selection toggles
  const isAllSelected = filteredNotifications.length > 0 && selectedIds.size === filteredNotifications.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNotifications.map(n => n.id)));
    }
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Bulk actions handlers
  const handleBulkMarkRead = async () => {
    if (selectedIds.size === 0) return;
    setIsActionInProgress(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id => markAsRead(id)));
      appToast.success(`Marked ${selectedIds.size} notification(s) as read`);
      setSelectedIds(new Set());
    } catch {
      appToast.error('Failed to update notifications');
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handleBulkArchive = async (archive: boolean = true) => {
    if (selectedIds.size === 0) return;
    setIsActionInProgress(true);
    try {
      await archiveNotifications(Array.from(selectedIds), archive);
      appToast.success(archive ? `Archived ${selectedIds.size} notification(s)` : `Unarchived ${selectedIds.size} notification(s)`);
      setSelectedIds(new Set());
    } catch {
      appToast.error('Failed to archive notifications');
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handleBulkTrash = async () => {
    if (selectedIds.size === 0) return;
    setIsActionInProgress(true);
    try {
      await trashNotifications(Array.from(selectedIds));
      appToast.success(`Moved ${selectedIds.size} notification(s) to Trash`);
      setSelectedIds(new Set());
    } catch {
      appToast.error('Failed to move notifications to Trash');
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    setIsActionInProgress(true);
    try {
      await restoreNotifications(Array.from(selectedIds));
      appToast.success(`Restored ${selectedIds.size} notification(s)`);
      setSelectedIds(new Set());
    } catch {
      appToast.error('Failed to restore notifications');
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handleBulkDeletePermanently = async () => {
    if (selectedIds.size === 0) return;
    setIsActionInProgress(true);
    try {
      await deleteNotificationsPermanently(Array.from(selectedIds));
      appToast.success(`Permanently deleted ${selectedIds.size} notification(s)`);
      setSelectedIds(new Set());
    } catch {
      appToast.error('Failed to permanently delete notifications');
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handleConfirmEmptyTrash = async () => {
    setIsActionInProgress(true);
    try {
      await emptyTrash();
      appToast.success('Trash emptied successfully');
      setEmptyTrashDialogOpen(false);
      setSelectedIds(new Set());
    } catch {
      appToast.error('Failed to empty trash');
    } finally {
      setIsActionInProgress(false);
    }
  };

  return (
    <div className="dashboard-page space-y-5">


      {/* Retention Banner for Trash Tab */}
      {activeTab === 'trash' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-bold">Trash Retention Policy:</span> Items in Trash will be automatically and permanently deleted after <span className="font-bold">30 days</span>. You can restore items to your active feed at any time before expiration.
          </div>
        </div>
      )}

      {/* Tabs & Filters Card */}
      <div className="bg-white rounded-xl border border-border p-4 shadow-xs space-y-4">
        {/* Status Tabs and Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border">
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-0.5">
            {(
              [
                { key: "all", label: "All", count: counts.all },
                { key: "unread", label: "Unread", count: counts.unread },
                { key: "read", label: "Read", count: counts.read },
                { key: "archived", label: "Archived", count: counts.archived },
                { key: "trash", label: "Trash", count: counts.trash }
              ] as const
            ).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer ${
                  activeTab === tab.key
                    ? "bg-primary text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-panel-bg"
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      activeTab === tab.key
                        ? "bg-white/20 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {counts.unread > 0 && activeTab !== "trash" && activeTab !== "archived" && (
              <button
                type="button"
                disabled={isActionInProgress}
                onClick={async () => {
                  setIsActionInProgress(true);
                  try {
                    await markAllAsRead();
                    appToast.success("All notifications marked as read");
                  } catch {
                    appToast.error("Failed to mark all as read");
                  } finally {
                    setIsActionInProgress(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/20 bg-accent text-primary text-xs font-semibold hover:bg-accent/80 transition cursor-pointer disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all as read
              </button>
            )}

            {activeTab === "trash" && counts.trash > 0 && (
              <button
                type="button"
                disabled={isActionInProgress}
                onClick={() => setEmptyTrashDialogOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Empty Trash
              </button>
            )}
          </div>
        </div>
        {/* Search & Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search notifications by title, details, or role..."
              className="ar-input pl-9 text-xs w-full"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Priority Selector */}
            <select
              value={selectedPriority}
              onChange={e => setSelectedPriority(e.target.value)}
              className="ar-input text-xs py-1.5 h-9 min-w-[130px]"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            {/* Category Selector */}
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="ar-input text-xs py-1.5 h-9 min-w-[140px] capitalize"
            >
              <option value="all">All Categories</option>
              <option value="attendance">Attendance</option>
              <option value="payroll">Payroll</option>
              <option value="geofence">Geofence</option>
              <option value="biometrics">Biometrics</option>
              <option value="account">Account</option>
              <option value="announcement">Announcement</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>
      </div>

      {/* Floating / Sticky Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-primary/30 bg-accent/90 backdrop-blur-sm p-3 px-4 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-2 font-bold text-accent-foreground">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span>{selectedIds.size} notification(s) selected</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {activeTab !== 'trash' && (
              <>
                <button
                  type="button"
                  disabled={isActionInProgress}
                  onClick={handleBulkMarkRead}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white border border-border text-foreground hover:border-primary/40 font-semibold transition"
                >
                  <Check className="w-3.5 h-3.5 text-primary" />
                  Mark Read
                </button>

                <button
                  type="button"
                  disabled={isActionInProgress}
                  onClick={() => handleBulkArchive(activeTab !== 'archived')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white border border-border text-foreground hover:border-primary/40 font-semibold transition"
                >
                  <Archive className="w-3.5 h-3.5 text-primary" />
                  {activeTab === 'archived' ? 'Unarchive' : 'Archive'}
                </button>

                <button
                  type="button"
                  disabled={isActionInProgress}
                  onClick={handleBulkTrash}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white border border-border text-red-600 hover:border-red-300 font-semibold transition"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  Move to Trash
                </button>
              </>
            )}

            {activeTab === 'trash' && (
              <>
                <button
                  type="button"
                  disabled={isActionInProgress}
                  onClick={handleBulkRestore}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white border border-border text-foreground hover:border-primary/40 font-semibold transition"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-primary" />
                  Restore
                </button>

                <button
                  type="button"
                  disabled={isActionInProgress}
                  onClick={handleBulkDeletePermanently}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-red-600 text-white font-semibold transition hover:bg-red-700 shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Permanently
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-muted-foreground hover:text-foreground p-1 ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Notifications List */}
      <div className="bg-white rounded-xl border border-border shadow-xs overflow-hidden">
        {/* Table / List Header */}
        <div className="p-3.5 px-4 border-b border-border bg-panel-bg/40 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={handleToggleSelectAll}
              className="rounded border-border text-primary focus:ring-primary w-4 h-4 cursor-pointer"
            />
            <span>Select All</span>
          </div>
          <div>
            Showing {filteredNotifications.length} notification(s)
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground font-medium">Loading notification center...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-accent/60 border border-primary/20 flex items-center justify-center">
              <Check className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {activeTab === 'trash'
                ? 'Trash is empty'
                : activeTab === 'archived'
                  ? 'No archived notifications'
                  : activeTab === 'unread'
                    ? 'No unread notifications'
                    : 'No notifications found'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              {searchQuery || selectedPriority !== 'all' || selectedCategory !== 'all'
                ? 'No notifications match your current filter criteria.'
                : 'You are completely up to date with all system and operational alerts.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredNotifications.map(item => {
              const categoryConfig = CATEGORY_ICONS[item.category] || CATEGORY_ICONS.system;
              const { icon: Icon, bg } = categoryConfig;
              const priorityInfo = PRIORITY_BADGES[item.priority] || PRIORITY_BADGES.medium;
              const isSelected = selectedIds.has(item.id);
              const daysRemaining = calculateTrashDaysRemaining(item.deleted_at);

              return (
                <div
                  key={item.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 transition group ${
                    isSelected
                      ? 'bg-accent/40'
                      : !item.read && !item.deleted_at && !item.archived_at
                        ? 'bg-[#FFF9F2] hover:bg-[#FFF3E2]'
                        : 'bg-white hover:bg-panel-bg/60'
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelectItem(item.id)}
                      className="mt-1 rounded border-border text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                    />

                    <span
                      className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center ${bg}`}
                      aria-hidden="true"
                    >
                      <Icon className="w-5 h-5" strokeWidth={2.2} />
                    </span>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ${priorityInfo.badge}`}>
                          {priorityInfo.label}
                        </span>

                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                          {item.category}
                        </span>

                        <span className="text-[10px] font-mono text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>

                        {daysRemaining !== null && (
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded">
                            {daysRemaining === 0 ? 'Purges today' : `Deletes in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`}
                          </span>
                        )}
                      </div>

                      <h4 className={`text-xs text-foreground leading-snug break-words ${!item.read ? 'font-bold' : 'font-medium'}`}>
                        {item.title}
                      </h4>

                      <p className="text-xs text-muted-foreground leading-relaxed break-words">
                        {item.message}
                      </p>

                      {item.action_link && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigate) {
                              onNavigate(item.action_link!);
                            } else {
                              window.location.hash = item.action_link!.replace(/^\//, '#/');
                            }
                          }}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer"
                        >
                          <span>View Details</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Individual Actions */}
                  <div className="flex items-center gap-1 sm:self-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/50">
                    {activeTab !== 'trash' && (
                      <>
                        <button
                          type="button"
                          title={item.read ? 'Mark as unread' : 'Mark as read'}
                          onClick={async () => {
                            await markAsRead(item.id);
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-panel-bg transition cursor-pointer"
                        >
                          {item.read ? <Check className="w-4 h-4 text-emerald-600" /> : <CheckCheck className="w-4 h-4 text-primary" />}
                        </button>

                        <button
                          type="button"
                          title={item.archived_at ? 'Unarchive' : 'Archive'}
                          onClick={async () => {
                            await archiveNotifications([item.id], !item.archived_at);
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-panel-bg transition cursor-pointer"
                        >
                          <Archive className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          title="Move to Trash"
                          onClick={async () => {
                            await trashNotifications([item.id]);
                            appToast.success('Moved to Trash');
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    {activeTab === 'trash' && (
                      <>
                        <button
                          type="button"
                          title="Restore"
                          onClick={async () => {
                            await restoreNotifications([item.id]);
                            appToast.success('Notification restored');
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-panel-bg transition cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          title="Delete Permanently"
                          onClick={async () => {
                            await deleteNotificationsPermanently([item.id]);
                            appToast.success('Notification deleted permanently');
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal: Empty Trash */}
      {emptyTrashDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-foreground/60 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-white p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-foreground">Empty Trash Permanently?</h3>
              <p className="text-xs text-muted-foreground">
                All {counts.trash} notification(s) in Trash will be permanently deleted. This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isActionInProgress}
                onClick={() => setEmptyTrashDialogOpen(false)}
                className="flex-1 py-2 px-3 rounded-lg border border-border bg-white text-xs font-semibold text-foreground hover:bg-panel-bg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionInProgress}
                onClick={handleConfirmEmptyTrash}
                className="flex-1 py-2 px-3 rounded-lg bg-red-600 text-xs font-semibold text-white hover:bg-red-700 transition shadow-xs"
              >
                {isActionInProgress ? 'Emptying...' : 'Yes, Empty Trash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
