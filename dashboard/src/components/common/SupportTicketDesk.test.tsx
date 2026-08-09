// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getMessages: vi.fn(),
  getTickets: vi.fn(),
  reply: vi.fn(),
  subscribe: vi.fn(),
  updateStatus: vi.fn(),
}));

vi.mock('../../services/supportTicketService', async () => {
  const actual = await vi.importActual<typeof import('../../services/supportTicketService')>('../../services/supportTicketService');
  return {
    ...actual,
    createSupportTicket: mocks.create,
    getSupportTicketMessages: mocks.getMessages,
    getSupportTickets: mocks.getTickets,
    replyToSupportTicket: mocks.reply,
    subscribeToSupportTickets: mocks.subscribe,
    updateSupportTicketStatus: mocks.updateStatus,
  };
});

vi.mock('../../hooks/useToast', () => ({ pushToast: vi.fn() }));

import { SupportTicketDesk } from './SupportTicketDesk';

const ticket = {
  id: 'ticket-1',
  ticket_number: 'MKB-A1B2C3D4',
  created_by: 'rider-1',
  subject: 'Unable to clock in',
  category: 'attendance' as const,
  description: 'The face scanner does not complete verification.',
  status: 'open' as const,
  resolved_at: null,
  created_at: '2026-08-09T10:00:00Z',
  updated_at: '2026-08-09T10:00:00Z',
  creator: { full_name: 'Rider One', email: 'rider@example.test', role: 'rider' as const },
};

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function enterValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('SupportTicketDesk', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.getTickets.mockResolvedValue([]);
    mocks.getMessages.mockResolvedValue([]);
    mocks.subscribe.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('shows inline required-field errors without sending an invalid ticket', async () => {
    act(() => root.render(<SupportTicketDesk currentUser={{ id: 'rider-1', name: 'Rider One', role: 'rider' }} />));
    await flush();

    const form = container.querySelector<HTMLFormElement>('form[aria-label="Create support ticket"]');
    act(() => form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

    expect(container.textContent).toContain('Enter a subject.');
    expect(container.textContent).toContain('Describe the issue using at least 10 characters.');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('guards a valid submission from accidental duplicate clicks', async () => {
    let finishCreate: (value: typeof ticket) => void = () => undefined;
    mocks.create.mockReturnValue(new Promise((resolve) => { finishCreate = resolve; }));
    act(() => root.render(<SupportTicketDesk currentUser={{ id: 'rider-1', name: 'Rider One', role: 'rider' }} />));
    await flush();

    const subject = container.querySelector<HTMLInputElement>('#support-ticket-subject');
    const description = container.querySelector<HTMLTextAreaElement>('#support-ticket-description');
    const form = container.querySelector<HTMLFormElement>('form[aria-label="Create support ticket"]');
    act(() => {
      if (subject) enterValue(subject, ticket.subject);
      if (description) enterValue(description, ticket.description);
    });
    act(() => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    act(() => finishCreate(ticket));
    await flush();
    expect(container.textContent).toContain(ticket.ticket_number);
  });

  it('lets Admin review the global queue and advance only the current ticket status', async () => {
    mocks.getTickets.mockResolvedValue([ticket]);
    mocks.updateStatus.mockResolvedValue({ ...ticket, status: 'in_progress' });
    act(() => root.render(<SupportTicketDesk currentUser={{ id: 'admin-1', name: 'Admin One', role: 'admin' }} />));
    await flush();

    expect(container.textContent).toContain('Support Queue');
    const ticketButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes(ticket.subject));
    act(() => ticketButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await flush();

    const progressButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Mark In Progress'));
    act(() => progressButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await flush();
    expect(mocks.updateStatus).toHaveBeenCalledWith(ticket.id, 'in_progress');
  });

  it('subscribes to Realtime and exposes personal ticket history to non-Admin users', async () => {
    mocks.getTickets.mockResolvedValue([ticket]);
    act(() => root.render(<SupportTicketDesk currentUser={{ id: 'rider-1', name: 'Rider One', role: 'rider' }} />));
    await flush();

    const historyButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('My Tickets'));
    act(() => historyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await flush();

    expect(container.textContent).toContain(ticket.ticket_number);
    expect(container.textContent).toContain(ticket.subject);
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('Mark In Progress');
  });

  it('shows a recoverable loading error in ticket history', async () => {
    mocks.getTickets.mockRejectedValue(new Error('Network unavailable'));
    act(() => root.render(<SupportTicketDesk currentUser={{ id: 'rider-1', name: 'Rider One', role: 'rider' }} />));
    await flush();
    const historyButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('My Tickets'));
    act(() => historyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(container.textContent).toContain('Unable to load tickets: Network unavailable');
    expect(container.textContent).toContain('Retry');
  });
});
