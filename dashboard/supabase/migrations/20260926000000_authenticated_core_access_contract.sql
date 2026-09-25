-- Core Table Authenticated Access Contracts
--
-- Ensure explicit least-privilege table grants for authenticated app flows.
-- The core tables public.users, public.riders, and public.payroll_records had
-- no explicit table grants for authenticated in historical migrations, causing
-- fresh migration replay to deny access before Row Level Security (RLS) can evaluate.
--
-- RLS policies remain strictly authoritative for row filtering and access control.
-- Explicitly deny anon from all operations on these core tables.

revoke all on table public.users from anon, public;
revoke all on table public.riders from anon, public;
revoke all on table public.payroll_records from anon, public;

-- public.users:
-- Required for staff self-profile flow (read & update self) and staff directory reads.
-- Insert and delete are denied at the table level; RLS and triggers protect row access.
grant select, update on table public.users to authenticated;

-- public.riders:
-- Required for Rider self-read and staff directory lookups.
-- Mutations are denied at the table level; RLS and hub guards protect row access.
grant select on table public.riders to authenticated;

-- public.payroll_records:
-- Required for authorized Payroll draft lifecycle (select, insert, update).
-- Delete is denied at the table level; RLS, hub guards, and state triggers protect row access.
grant select, insert, update on table public.payroll_records to authenticated;
