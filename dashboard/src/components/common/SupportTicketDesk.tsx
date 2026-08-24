import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Clock3, MessageSquare, Plus, RefreshCw, Search } from 'lucide-react';
import { pushToast } from '../../hooks/useToast';
import {
  SUPPORT_TICKET_CATEGORIES,
  createSupportTicket,
  getSupportTicketMessages,
  getSupportTickets,
  replyToSupportTicket,
  subscribeToSupportTickets,
  updateSupportTicketStatus,
  validateSupportReply,
  validateSupportTicketDraft,
  type SupportTicket,
  type SupportTicketCategory,
  type SupportTicketDraftErrors,
  type SupportTicketMessage,
  type SupportTicketStatus,
} from '../../services/support/supportTicketService';

type SupportUserRole = 'admin' | 'hr' | 'payroll' | 'rider';

interface SupportTicketDeskProps {
  currentUser: {
    id: string;
    name: string;
    role: SupportUserRole;
  };
}

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

const STATUS_STYLES: Record<SupportTicketStatus, string> = {
  open: 'border-blue-200 bg-blue-50 text-blue-700',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-700',
  resolved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

function categoryLabel(category: SupportTicketCategory): string {
  return SUPPORT_TICKET_CATEGORIES.find((item) => item.value === category)?.label ?? category;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

function StatusBadge({ status }: { status: SupportTicketStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function SupportTicketDesk({ currentUser }: SupportTicketDeskProps) {
  const isAdmin = currentUser.role === 'admin';
  const [view, setView] = useState<'create' | 'tickets'>(isAdmin ? 'tickets' : 'create');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const selectedTicketRef = useRef<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<'connecting' | 'connected' | 'unavailable'>('connecting');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SupportTicketStatus>('all');
  const [draft, setDraft] = useState({
    subject: '',
    category: 'technical_issue' as SupportTicketCategory,
    description: '',
  });
  const [draftErrors, setDraftErrors] = useState<SupportTicketDraftErrors>({});
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const ticketRequestIdRef = useRef<string | null>(null);
  const replyRequestIdRef = useRef<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    selectedTicketRef.current = selectedTicket;
  }, [selectedTicket]);

  const refreshTickets = useCallback(async () => {
    try {
      const nextTickets = await getSupportTickets();
      setTickets(nextTickets);
      setLoadError(null);
      const current = selectedTicketRef.current;
      if (current) {
        const refreshed = nextTickets.find((ticket) => ticket.id === current.id) ?? null;
        setSelectedTicket(refreshed);
      }
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSelectedMessages = useCallback(async (ticketId: string) => {
    try {
      setMessages(await getSupportTicketMessages(ticketId));
    } catch (error) {
      pushToast({ title: 'Unable to load replies', description: errorMessage(error), tone: 'error' });
    }
  }, []);

  useEffect(() => {
    void refreshTickets();
    const unsubscribe = subscribeToSupportTickets(
      () => {
        void refreshTickets();
        const current = selectedTicketRef.current;
        if (current) void refreshSelectedMessages(current.id);
      },
      (status) => {
        if (status === 'SUBSCRIBED') setRealtimeState('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeState('unavailable');
      },
    );
    return unsubscribe;
  }, [refreshSelectedMessages, refreshTickets]);

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
      if (!query) return true;
      return [
        ticket.ticket_number,
        ticket.subject,
        ticket.creator?.full_name,
        ticket.creator?.email,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [search, statusFilter, tickets]);

  const openTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setMessages([]);
    setReply('');
    setReplyError(null);
    await refreshSelectedMessages(ticket.id);
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validateSupportTicketDraft(draft);
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0 || submittingRef.current) return;

    submittingRef.current = true;
    setSaving(true);
    ticketRequestIdRef.current ??= globalThis.crypto.randomUUID();
    try {
      const created = await createSupportTicket(draft, ticketRequestIdRef.current);
      ticketRequestIdRef.current = null;
      setTickets((current) => [created, ...current.filter((ticket) => ticket.id !== created.id)]);
      setDraft({ subject: '', category: 'technical_issue', description: '' });
      setDraftErrors({});
      setView('tickets');
      setSelectedTicket(created);
      setMessages([]);
      pushToast({
        title: 'Support ticket submitted',
        description: `${created.ticket_number} is now in the support queue.`,
        tone: 'success',
      });
    } catch (error) {
      pushToast({ title: 'Unable to submit ticket', description: errorMessage(error), tone: 'error' });
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  const handleReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTicket || submittingRef.current) return;
    const validationError = validateSupportReply(reply);
    setReplyError(validationError);
    if (validationError) return;

    submittingRef.current = true;
    setSaving(true);
    replyRequestIdRef.current ??= globalThis.crypto.randomUUID();
    try {
      const created = await replyToSupportTicket(selectedTicket.id, reply, replyRequestIdRef.current);
      replyRequestIdRef.current = null;
      setMessages((current) => [...current.filter((message) => message.id !== created.id), created]);
      setReply('');
      setReplyError(null);
      pushToast({ title: 'Reply sent', description: `Reply added to ${selectedTicket.ticket_number}.`, tone: 'success' });
    } catch (error) {
      pushToast({ title: 'Unable to send reply', description: errorMessage(error), tone: 'error' });
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (status: Exclude<SupportTicketStatus, 'open'>) => {
    if (!selectedTicket || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      const updated = await updateSupportTicketStatus(selectedTicket.id, status);
      setSelectedTicket(updated);
      setTickets((current) => current.map((ticket) => (ticket.id === updated.id ? updated : ticket)));
      pushToast({
        title: status === 'resolved' ? 'Ticket resolved' : 'Ticket in progress',
        description: `${updated.ticket_number} was updated.`,
        tone: 'success',
      });
    } catch (error) {
      pushToast({ title: 'Unable to update status', description: errorMessage(error), tone: 'error' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <section className="space-y-4" aria-label="Online support tickets">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">Online Support Tickets</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {isAdmin ? 'Review and respond to authenticated user requests.' : 'Submit a request and follow replies from the support team.'}
          </p>
        </div>
        <span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold ${realtimeState === 'connected' ? 'text-emerald-700' : 'text-muted-foreground'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${realtimeState === 'connected' ? 'bg-emerald-500' : realtimeState === 'unavailable' ? 'bg-amber-500' : 'bg-border'}`} />
          {realtimeState === 'connected' ? 'Live' : realtimeState === 'unavailable' ? 'Refresh available' : 'Connecting'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-panel-bg/50 p-1">
        <button
          type="button"
          onClick={() => { setView('create'); setSelectedTicket(null); }}
          className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition ${view === 'create' ? 'bg-white text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Plus className="h-3.5 w-3.5" /> New Ticket
        </button>
        <button
          type="button"
          onClick={() => { setView('tickets'); setSelectedTicket(null); }}
          className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition ${view === 'tickets' ? 'bg-white text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <MessageSquare className="h-3.5 w-3.5" /> {isAdmin ? 'Support Queue' : 'My Tickets'}
        </button>
      </div>

      {view === 'create' && (
        <form aria-label="Create support ticket" onSubmit={handleCreate} className="space-y-4 rounded-xl border border-border p-4">
          <div className="space-y-1.5">
            <label htmlFor="support-ticket-subject" className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Subject <span aria-hidden="true" className="text-red-600">*</span>
            </label>
            <input
              id="support-ticket-subject"
              value={draft.subject}
              onChange={(event) => { setDraft((current) => ({ ...current, subject: event.target.value })); setDraftErrors((current) => ({ ...current, subject: undefined })); }}
              maxLength={120}
              aria-invalid={Boolean(draftErrors.subject)}
              aria-describedby={draftErrors.subject ? 'support-ticket-subject-error' : undefined}
              className="h-10 w-full rounded-xl border border-border bg-panel-bg/30 px-3 text-xs outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/8"
              placeholder="Briefly summarize the issue"
            />
            {draftErrors.subject && <p id="support-ticket-subject-error" className="text-[11px] text-red-600">{draftErrors.subject}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="support-ticket-category" className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Category <span aria-hidden="true" className="text-red-600">*</span>
            </label>
            <select
              id="support-ticket-category"
              value={draft.category}
              onChange={(event) => { setDraft((current) => ({ ...current, category: event.target.value as SupportTicketCategory })); setDraftErrors((current) => ({ ...current, category: undefined })); }}
              aria-invalid={Boolean(draftErrors.category)}
              aria-describedby={draftErrors.category ? 'support-ticket-category-error' : undefined}
              className="h-10 w-full rounded-xl border border-border bg-panel-bg/30 px-3 text-xs outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/8"
            >
              {SUPPORT_TICKET_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
            </select>
            {draftErrors.category && <p id="support-ticket-category-error" className="text-[11px] text-red-600">{draftErrors.category}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="support-ticket-description" className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Description <span aria-hidden="true" className="text-red-600">*</span>
              </label>
              <span className="text-[10px] font-mono text-muted-foreground">{draft.description.length} / 2,000</span>
            </div>
            <textarea
              id="support-ticket-description"
              value={draft.description}
              onChange={(event) => { setDraft((current) => ({ ...current, description: event.target.value })); setDraftErrors((current) => ({ ...current, description: undefined })); }}
              maxLength={2000}
              rows={5}
              aria-invalid={Boolean(draftErrors.description)}
              aria-describedby={draftErrors.description ? 'support-ticket-description-error' : undefined}
              className="w-full resize-none rounded-xl border border-border bg-panel-bg/30 px-3 py-2.5 text-xs outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/8"
              placeholder="Describe what happened, what you expected, and any steps already tried."
            />
            {draftErrors.description && <p id="support-ticket-description-error" className="text-[11px] text-red-600">{draftErrors.description}</p>}
          </div>

          <p className="text-[10px] text-muted-foreground">Required fields are marked with *.</p>
          <button
            type="submit"
            disabled={saving}
            className="flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? 'Submitting…' : 'Submit Support Ticket'}
          </button>
        </form>
      )}

      {view === 'tickets' && !selectedTicket && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_130px]">
            <label className="relative">
              <span className="sr-only">Search support tickets</span>
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-white pl-8 pr-3 text-xs outline-none focus:border-primary"
                placeholder={isAdmin ? 'Search user or ticket…' : 'Search my tickets…'}
              />
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | SupportTicketStatus)}
                className="h-9 w-full rounded-lg border border-border bg-white px-2 text-xs outline-none focus:border-primary"
              >
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
          </div>

          {loadError && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <span>Unable to load tickets: {loadError}</span>
              <button type="button" onClick={() => void refreshTickets()} className="flex items-center gap-1 font-bold"><RefreshCw className="h-3 w-3" /> Retry</button>
            </div>
          )}

          {loading ? (
            <div className="rounded-xl border border-border p-8 text-center text-xs text-muted-foreground">Loading support tickets…</div>
          ) : filteredTickets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-xs font-semibold text-foreground">{tickets.length === 0 ? 'No support tickets yet.' : 'No tickets match these filters.'}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{tickets.length === 0 && !isAdmin ? 'Create a ticket when you need help.' : 'Adjust the search or status filter.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => void openTicket(ticket)}
                  className="w-full rounded-xl border border-border p-3 text-left transition hover:border-primary/40 hover:bg-panel-bg/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-foreground">{ticket.subject}</div>
                      <div className="mt-1 text-[10px] font-mono text-muted-foreground">{ticket.ticket_number} · {categoryLabel(ticket.category)}</div>
                      {isAdmin && <div className="mt-1 truncate text-[11px] text-muted-foreground">{ticket.creator?.full_name ?? 'Unknown user'} · {ticket.creator?.email}</div>}
                    </div>
                    <StatusBadge status={ticket.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="h-3 w-3" /> Updated {formatDate(ticket.updated_at)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'tickets' && selectedTicket && (
        <div className="space-y-4">
          <button type="button" onClick={() => setSelectedTicket(null)} className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to {isAdmin ? 'support queue' : 'my tickets'}
          </button>

          <article className="rounded-xl border border-border">
            <header className="space-y-2 border-b border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-foreground">{selectedTicket.subject}</h4>
                  <p className="mt-1 text-[10px] font-mono text-muted-foreground">{selectedTicket.ticket_number} · {categoryLabel(selectedTicket.category)}</p>
                </div>
                <StatusBadge status={selectedTicket.status} />
              </div>
              {isAdmin && <p className="text-[11px] text-muted-foreground">Submitted by {selectedTicket.creator?.full_name ?? 'Unknown user'} ({selectedTicket.creator?.email ?? 'No email'})</p>}
              {isAdmin && selectedTicket.status !== 'resolved' && (
                <div className="flex justify-end pt-1">
                  {selectedTicket.status === 'open' ? (
                    <button type="button" disabled={updatingStatus} onClick={() => void handleStatusUpdate('in_progress')} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-800 disabled:opacity-50">Mark In Progress</button>
                  ) : (
                    <button type="button" disabled={updatingStatus} onClick={() => void handleStatusUpdate('resolved')} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800 disabled:opacity-50">Resolve Ticket</button>
                  )}
                </div>
              )}
            </header>

            <div className="space-y-3 p-4" aria-label="Ticket conversation">
              <div className="rounded-xl bg-panel-bg/60 p-3">
                <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span className="font-bold text-foreground">{selectedTicket.creator?.full_name ?? currentUser.name}</span>
                  <time dateTime={selectedTicket.created_at}>{formatDate(selectedTicket.created_at)}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{selectedTicket.description}</p>
              </div>

              {messages.map((message) => {
                const ownMessage = message.sender_id === currentUser.id;
                return (
                  <div key={message.id} className={`rounded-xl border p-3 ${ownMessage ? 'ml-5 border-primary/20 bg-accent/40' : 'mr-5 border-border bg-white'}`}>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="font-bold text-foreground">{message.sender?.full_name ?? 'Support participant'}</span>
                      <time dateTime={message.created_at}>{formatDate(message.created_at)}</time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{message.message}</p>
                  </div>
                );
              })}

              {selectedTicket.status === 'resolved' ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-[11px] text-emerald-800">
                  This ticket was resolved{selectedTicket.resolved_at ? ` on ${formatDate(selectedTicket.resolved_at)}` : ''}. Its history remains available.
                </div>
              ) : (
                <form aria-label="Reply to support ticket" onSubmit={handleReply} className="space-y-2 border-t border-border pt-3">
                  <label htmlFor="support-ticket-reply" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reply</label>
                  <textarea
                    id="support-ticket-reply"
                    rows={3}
                    maxLength={2000}
                    value={reply}
                    onChange={(event) => { setReply(event.target.value); setReplyError(null); }}
                    aria-invalid={Boolean(replyError)}
                    aria-describedby={replyError ? 'support-ticket-reply-error' : undefined}
                    className="w-full resize-none rounded-xl border border-border px-3 py-2 text-xs outline-none focus:border-primary focus:ring-4 focus:ring-primary/8"
                    placeholder="Write a reply…"
                  />
                  {replyError && <p id="support-ticket-reply-error" className="text-[11px] text-red-600">{replyError}</p>}
                  <div className="flex justify-end">
                    <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-[11px] font-bold text-primary-foreground disabled:opacity-50">{saving ? 'Sending…' : 'Send Reply'}</button>
                  </div>
                </form>
              )}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
