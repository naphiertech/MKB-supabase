import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/supabase';
import { getSelectedHubId } from '../../lib/hubWorkspaceState';

export type SupportTicketCategory = Database['public']['Enums']['support_ticket_category'];
export type SupportTicketStatus = Database['public']['Enums']['support_ticket_status'];
type SupportTicketRow = Database['public']['Tables']['support_tickets']['Row'];
type SupportTicketMessageRow = Database['public']['Tables']['support_ticket_messages']['Row'];

export const SUPPORT_TICKET_CATEGORIES: ReadonlyArray<{
  value: SupportTicketCategory;
  label: string;
}> = [
  { value: 'account_login', label: 'Account & Login' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'parcel_operations', label: 'Parcel Operations' },
  { value: 'geofence_location', label: 'Geofence & Location' },
  { value: 'technical_issue', label: 'Technical Issue' },
  { value: 'other', label: 'Other' },
];

export interface SupportTicketPerson {
  full_name: string;
  email: string;
  role: Database['public']['Enums']['user_role'];
}

export interface SupportTicket extends SupportTicketRow {
  creator: SupportTicketPerson | null;
}

export interface SupportTicketMessage extends SupportTicketMessageRow {
  sender: SupportTicketPerson | null;
}

export interface SupportTicketDraft {
  subject: string;
  category: SupportTicketCategory;
  description: string;
}

export type SupportTicketDraftErrors = Partial<Record<keyof SupportTicketDraft, string>>;

const TICKET_SELECT = `
  *,
  creator:users!support_tickets_created_by_fkey(full_name, email, role)
`;

const MESSAGE_SELECT = `
  *,
  sender:users!support_ticket_messages_sender_id_fkey(full_name, email, role)
`;

const VALID_CATEGORIES = new Set<SupportTicketCategory>(
  SUPPORT_TICKET_CATEGORIES.map(({ value }) => value),
);

function requestId(): string {
  return globalThis.crypto.randomUUID();
}

export function validateSupportTicketDraft(draft: SupportTicketDraft): SupportTicketDraftErrors {
  const errors: SupportTicketDraftErrors = {};
  const subject = draft.subject.trim();
  const description = draft.description.trim();

  if (!subject) errors.subject = 'Enter a subject.';
  else if (subject.length < 5) errors.subject = 'Use at least 5 characters for the subject.';
  else if (subject.length > 120) errors.subject = 'Keep the subject within 120 characters.';

  if (!VALID_CATEGORIES.has(draft.category)) errors.category = 'Select a valid category.';

  if (!description || description.length < 10) {
    errors.description = 'Describe the issue using at least 10 characters.';
  } else if (description.length > 2000) {
    errors.description = 'Keep the description within 2,000 characters.';
  }

  return errors;
}

export function validateSupportReply(message: string): string | null {
  const cleaned = message.trim();
  if (!cleaned) return 'Enter a reply.';
  if (cleaned.length > 2000) return 'Keep the reply within 2,000 characters.';
  return null;
}

export async function getSupportTickets(): Promise<SupportTicket[]> {
  let query = supabase
    .from('support_tickets')
    .select(TICKET_SELECT)
    .order('updated_at', { ascending: false });
  const hubId = getSelectedHubId();
  if (hubId) query = query.or(`hub_id.is.null,hub_id.eq.${hubId}`);
  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as unknown as SupportTicket[];
}

export async function getSupportTicketMessages(ticketId: string): Promise<SupportTicketMessage[]> {
  const { data, error } = await supabase
    .from('support_ticket_messages')
    .select(MESSAGE_SELECT)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as SupportTicketMessage[];
}

export async function createSupportTicket(
  draft: SupportTicketDraft,
  id = requestId(),
): Promise<SupportTicket> {
  const errors = validateSupportTicketDraft(draft);
  if (Object.keys(errors).length > 0) throw new Error('Review the required ticket details.');

  const hubId = getSelectedHubId();
  const payload = {
    id,
    subject: draft.subject.trim(),
    category: draft.category,
    description: draft.description.trim(),
    ...(hubId ? { hub_id: hubId } : {}),
  };

  const { data, error } = await supabase
    .from('support_tickets')
    .insert(payload)
    .select(TICKET_SELECT)
    .single();

  if (!error) return data as unknown as SupportTicket;
  if (error.code !== '23505') throw error;

  const { data: existing, error: recoveryError } = await supabase
    .from('support_tickets')
    .select(TICKET_SELECT)
    .eq('id', id)
    .single();

  if (recoveryError) throw recoveryError;
  return existing as unknown as SupportTicket;
}

export async function replyToSupportTicket(
  ticketId: string,
  message: string,
  id = requestId(),
): Promise<SupportTicketMessage> {
  const validationError = validateSupportReply(message);
  if (validationError) throw new Error(validationError);

  const { data, error } = await supabase
    .from('support_ticket_messages')
    .insert({ id, ticket_id: ticketId, message: message.trim() })
    .select(MESSAGE_SELECT)
    .single();

  if (!error) return data as unknown as SupportTicketMessage;
  if (error.code !== '23505') throw error;

  const { data: existing, error: recoveryError } = await supabase
    .from('support_ticket_messages')
    .select(MESSAGE_SELECT)
    .eq('id', id)
    .single();

  if (recoveryError) throw recoveryError;
  return existing as unknown as SupportTicketMessage;
}

export async function updateSupportTicketStatus(
  ticketId: string,
  status: Exclude<SupportTicketStatus, 'open'>,
): Promise<SupportTicket> {
  const { data, error } = await supabase
    .from('support_tickets')
    .update({ status })
    .eq('id', ticketId)
    .select(TICKET_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as SupportTicket;
}

export function subscribeToSupportTickets(
  onChange: () => void,
  onStatus?: (status: string) => void,
): () => void {
  const selectedHubId = getSelectedHubId();
  const handleTicketChange = (payload?: { new?: { hub_id?: string | null }; old?: { hub_id?: string | null } }) => {
    if (!payload) { onChange(); return; }
    const hubId = payload.new?.hub_id ?? payload.old?.hub_id ?? null;
    if (!selectedHubId || !hubId || hubId === selectedHubId) onChange();
  };
  const channel = supabase
    .channel(`support-tickets-${requestId()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_tickets' },
      handleTicketChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_ticket_messages' },
      onChange,
    )
    .subscribe((status) => onStatus?.(status));

  return () => {
    void supabase.removeChannel(channel);
  };
}
