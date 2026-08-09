import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  from: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    channel: mocks.channel,
    from: mocks.from,
    removeChannel: mocks.removeChannel,
  },
}));

import {
  createSupportTicket,
  getSupportTicketMessages,
  getSupportTickets,
  replyToSupportTicket,
  subscribeToSupportTickets,
  updateSupportTicketStatus,
  validateSupportReply,
  validateSupportTicketDraft,
} from './supportTicketService';

const ticket = {
  id: 'ticket-1',
  ticket_number: 'MKB-A1B2C3D4',
  created_by: 'user-1',
  subject: 'Unable to clock in',
  category: 'attendance',
  description: 'The face scanner does not complete verification.',
  status: 'open',
  resolved_at: null,
  created_at: '2026-08-09T10:00:00Z',
  updated_at: '2026-08-09T10:00:00Z',
  creator: { full_name: 'Rider One', email: 'rider@example.test', role: 'rider' },
};

beforeEach(() => vi.clearAllMocks());

describe('support ticket validation', () => {
  it('rejects missing or undersized required ticket fields', () => {
    expect(validateSupportTicketDraft({ subject: '', category: 'attendance', description: 'short' })).toEqual({
      subject: 'Enter a subject.',
      description: 'Describe the issue using at least 10 characters.',
    });
  });

  it('rejects unsupported categories and empty replies', () => {
    expect(validateSupportTicketDraft({ subject: 'A valid subject', category: 'loans' as never, description: 'A sufficiently detailed issue.' })).toEqual({
      category: 'Select a valid category.',
    });
    expect(validateSupportReply('   ')).toBe('Enter a reply.');
  });
});

describe('support ticket persistence', () => {
  it('creates a sanitized ticket without client-controlled identity or status', async () => {
    const single = vi.fn().mockResolvedValue({ data: ticket, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    mocks.from.mockReturnValue({ insert });

    const result = await createSupportTicket({
      subject: '  Unable to clock in  ',
      category: 'attendance',
      description: '  The face scanner does not complete verification.  ',
    }, 'ticket-1');

    expect(mocks.from).toHaveBeenCalledWith('support_tickets');
    expect(insert).toHaveBeenCalledWith({
      id: 'ticket-1',
      subject: 'Unable to clock in',
      category: 'attendance',
      description: 'The face scanner does not complete verification.',
    });
    expect(result.status).toBe('open');
  });

  it('recovers the original ticket after a duplicated request id', async () => {
    const existingSingle = vi.fn().mockResolvedValue({ data: ticket, error: null });
    const eq = vi.fn(() => ({ single: existingSingle }));
    const existingSelect = vi.fn(() => ({ eq }));
    const createSingle = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } });
    const createSelect = vi.fn(() => ({ single: createSingle }));
    const insert = vi.fn(() => ({ select: createSelect }));
    mocks.from
      .mockReturnValueOnce({ insert })
      .mockReturnValueOnce({ select: existingSelect });

    await expect(createSupportTicket({
      subject: ticket.subject,
      category: 'attendance',
      description: ticket.description,
    }, ticket.id)).resolves.toMatchObject({ id: ticket.id });
    expect(eq).toHaveBeenCalledWith('id', ticket.id);
  });

  it('reads the RLS-authorized ticket list and chronological messages', async () => {
    const ticketOrder = vi.fn().mockResolvedValue({ data: [ticket], error: null });
    const ticketSelect = vi.fn(() => ({ order: ticketOrder }));
    const messageOrder = vi.fn().mockResolvedValue({ data: [{ id: 'message-1', ticket_id: ticket.id }], error: null });
    const messageEq = vi.fn(() => ({ order: messageOrder }));
    const messageSelect = vi.fn(() => ({ eq: messageEq }));
    mocks.from
      .mockReturnValueOnce({ select: ticketSelect })
      .mockReturnValueOnce({ select: messageSelect });

    await expect(getSupportTickets()).resolves.toEqual([ticket]);
    await expect(getSupportTicketMessages(ticket.id)).resolves.toHaveLength(1);
    expect(ticketOrder).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(messageOrder).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('persists an immutable reply without client-controlled sender identity', async () => {
    const message = { id: 'message-1', ticket_id: ticket.id, sender_id: 'user-1', message: ' Please try again. ', created_at: '2026-08-09T10:05:00Z' };
    const single = vi.fn().mockResolvedValue({ data: { ...message, message: message.message.trim() }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    mocks.from.mockReturnValue({ insert });

    await replyToSupportTicket(ticket.id, message.message, message.id);
    expect(insert).toHaveBeenCalledWith({ id: message.id, ticket_id: ticket.id, message: 'Please try again.' });
  });

  it('changes only the administrative status field', async () => {
    const single = vi.fn().mockResolvedValue({ data: { ...ticket, status: 'in_progress' }, error: null });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    mocks.from.mockReturnValue({ update });

    await updateSupportTicketStatus(ticket.id, 'in_progress');
    expect(update).toHaveBeenCalledWith({ status: 'in_progress' });
  });
});

describe('support ticket Realtime', () => {
  it('uses one channel for ticket and message changes and cleans it up', () => {
    const handlers: Array<() => void> = [];
    const channel = {
      on: vi.fn((_type: string, _filter: unknown, handler: () => void) => {
        handlers.push(handler);
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    mocks.channel.mockReturnValue(channel);
    const onChange = vi.fn();

    const unsubscribe = subscribeToSupportTickets(onChange);
    expect(channel.on).toHaveBeenCalledTimes(2);
    handlers.forEach((handler) => handler());
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  });
});
