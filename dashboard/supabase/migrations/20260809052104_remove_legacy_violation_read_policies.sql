-- Remove superseded PUBLIC-role policies after installing explicit
-- authenticated violation policies in the lifecycle migration.
drop policy if exists "Admin and HR can read all violations" on public.violations;
drop policy if exists "Rider can read own violations" on public.violations;
