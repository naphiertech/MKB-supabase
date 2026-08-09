-- The account-action Edge Function uses the service-role key, but this project
-- intentionally does not grant that role blanket access to public tables.
-- Grant only the columns needed to synchronize account status and append its
-- required audit record.
grant usage on schema public to service_role;
grant select (id, full_name, role, status), update (status)
on table public.users to service_role;
grant insert (user_id, event_type, description, metadata)
on table public.activity_logs to service_role;
