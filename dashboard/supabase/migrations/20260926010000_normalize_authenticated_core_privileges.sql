-- Migration: 20260926010000_normalize_authenticated_core_privileges.sql
-- Description: Normalize core table privileges for authenticated role.
-- First revokes ALL historical privileges from authenticated, then explicitly
-- grants back ONLY the intended minimum table privileges:
--
-- public.users:
--   authenticated: SELECT, UPDATE ONLY
--   denied: INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
--
-- public.riders:
--   authenticated: SELECT ONLY
--   denied: INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
--
-- public.payroll_records:
--   authenticated: SELECT, INSERT, UPDATE ONLY
--   denied: DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
--
-- anon: remains completely denied on all 3 tables.
-- RLS policies remain strictly authoritative for all row-level access.

-- 1. public.users
revoke all on table public.users from authenticated;
grant select, update on table public.users to authenticated;

-- 2. public.riders
revoke all on table public.riders from authenticated;
grant select on table public.riders to authenticated;

-- 3. public.payroll_records
revoke all on table public.payroll_records from authenticated;
grant select, insert, update on table public.payroll_records to authenticated;

-- Explicitly ensure anon and public remain denied
revoke all on table public.users from anon, public;
revoke all on table public.riders from anon, public;
revoke all on table public.payroll_records from anon, public;
