-- Cover the reply sender foreign key for user lifecycle checks and diagnostics.
create index support_ticket_messages_sender_idx
  on public.support_ticket_messages (sender_id);
