-- Legacy staff profile normalization.
-- Auth identities remain authoritative and are never recreated or reseeded.

-- Synchronize the public profile copy only after Supabase Auth commits the
-- confirmed email. Pending auth.users.email_change values are intentionally
-- not copied into public.users.
create or replace function public.sync_confirmed_auth_email_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
  set email = new.email,
      updated_at = clock_timestamp()
  where id = new.id
    and new.email_confirmed_at is not null
    and email is distinct from new.email;
  return new;
end;
$$;

revoke all on function public.sync_confirmed_auth_email_to_profile() from public, anon, authenticated;

drop trigger if exists sync_confirmed_auth_email_to_profile on auth.users;
create trigger sync_confirmed_auth_email_to_profile
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_confirmed_auth_email_to_profile();

-- The trigger above is forward-only. Reconcile confirmed mismatches that
-- already existed before this migration without copying pending email_change.
update public.users as profile
set email = auth_user.email,
    updated_at = clock_timestamp()
from auth.users as auth_user
where profile.id = auth_user.id
  and auth_user.email_confirmed_at is not null
  and nullif(btrim(auth_user.email), '') is not null
  and profile.email is distinct from auth_user.email;

-- Prevent client/application writes from creating an Auth/profile mismatch.
-- Profile creation remains supported because the Auth identity is created first.
create or replace function public.enforce_public_user_email_matches_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_email text;
begin
  select au.email into v_auth_email
  from auth.users au
  where au.id = new.id;

  if v_auth_email is null or lower(btrim(new.email)) is distinct from lower(btrim(v_auth_email)) then
    raise exception 'Profile email must match the confirmed authentication email.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_public_user_email_matches_auth() from public, anon, authenticated;

drop trigger if exists enforce_public_user_email_matches_auth on public.users;
create trigger enforce_public_user_email_matches_auth
before insert or update of email on public.users
for each row execute function public.enforce_public_user_email_matches_auth();

-- Existing self-update RLS is retained, but staff self-service cannot be used
-- to change identity, authorization, account, or employment-lifecycle fields.
create or replace function public.enforce_staff_self_service_profile_boundary()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) = old.id
     and old.role in ('admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role)
     and current_user not in ('postgres', 'supabase_auth_admin', 'service_role')
     and (
       old.id is distinct from new.id
       or old.email is distinct from new.email
       or old.role is distinct from new.role
       or old.status is distinct from new.status
       or old.rider_id is distinct from new.rider_id
       or old.employment_status is distinct from new.employment_status
       or old.archive_effective_date is distinct from new.archive_effective_date
       or old.archive_reason is distinct from new.archive_reason
       or old.archive_remarks is distinct from new.archive_remarks
       or old.archived_at is distinct from new.archived_at
       or old.archived_by is distinct from new.archived_by
       or old.restored_at is distinct from new.restored_at
       or old.restored_by is distinct from new.restored_by
       or old.restore_reason is distinct from new.restore_reason
       or old.created_at is distinct from new.created_at
       or old.last_login is distinct from new.last_login
     ) then
    raise exception 'Staff self-service may update profile fields only.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_staff_self_service_profile_boundary() from public, anon, authenticated;

drop trigger if exists enforce_staff_self_service_profile_boundary on public.users;
create trigger enforce_staff_self_service_profile_boundary
before update on public.users
for each row execute function public.enforce_staff_self_service_profile_boundary();

-- Private, deterministic staff avatars. These objects are normal profile
-- photos and are not Rider face images, descriptors, liveness, or MFA data.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-avatars',
  'staff-avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Staff can read permitted profile photos" on storage.objects;
drop policy if exists "Staff can upload permitted profile photos" on storage.objects;
drop policy if exists "Staff can replace permitted profile photos" on storage.objects;
drop policy if exists "Staff can remove permitted profile photos" on storage.objects;

create policy "Staff can read permitted profile photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'staff-avatars'
  and (storage.foldername(storage.objects.name))[1] = 'staff'
  and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and array_length(storage.foldername(storage.objects.name), 1) = 2
  and storage.filename(storage.objects.name) = 'avatar'
  and exists (
    select 1 from public.users target
    where target.id::text = (storage.foldername(storage.objects.name))[2]
      and target.role in ('admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role)
  )
  and (
    (select auth.uid())::text = (storage.foldername(storage.objects.name))[2]
    or (select public.get_my_role()) = 'admin'::public.user_role
  )
);

create policy "Staff can upload permitted profile photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'staff-avatars'
  and (storage.foldername(storage.objects.name))[1] = 'staff'
  and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and array_length(storage.foldername(storage.objects.name), 1) = 2
  and storage.filename(storage.objects.name) = 'avatar'
  and exists (
    select 1 from public.users target
    where target.id::text = (storage.foldername(storage.objects.name))[2]
      and target.role in ('admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role)
  )
  and (
    (select auth.uid())::text = (storage.foldername(storage.objects.name))[2]
    or (select public.get_my_role()) = 'admin'::public.user_role
  )
);

create policy "Staff can replace permitted profile photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'staff-avatars'
  and (storage.foldername(storage.objects.name))[1] = 'staff'
  and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and array_length(storage.foldername(storage.objects.name), 1) = 2
  and storage.filename(storage.objects.name) = 'avatar'
  and (
    (select auth.uid())::text = (storage.foldername(storage.objects.name))[2]
    or (select public.get_my_role()) = 'admin'::public.user_role
  )
)
with check (
  bucket_id = 'staff-avatars'
  and (storage.foldername(storage.objects.name))[1] = 'staff'
  and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and array_length(storage.foldername(storage.objects.name), 1) = 2
  and storage.filename(storage.objects.name) = 'avatar'
  and exists (
    select 1 from public.users target
    where target.id::text = (storage.foldername(storage.objects.name))[2]
      and target.role in ('admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role)
  )
  and (
    (select auth.uid())::text = (storage.foldername(storage.objects.name))[2]
    or (select public.get_my_role()) = 'admin'::public.user_role
  )
);

create policy "Staff can remove permitted profile photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'staff-avatars'
  and (storage.foldername(storage.objects.name))[1] = 'staff'
  and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and array_length(storage.foldername(storage.objects.name), 1) = 2
  and storage.filename(storage.objects.name) = 'avatar'
  and exists (
    select 1 from public.users target
    where target.id::text = (storage.foldername(storage.objects.name))[2]
      and target.role in ('admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role)
  )
  and (
    (select auth.uid())::text = (storage.foldername(storage.objects.name))[2]
    or (select public.get_my_role()) = 'admin'::public.user_role
  )
);
