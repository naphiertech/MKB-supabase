-- Storage RLS policies execute as the caller. Resolve the target staff role in
-- a narrowly scoped definer helper instead of reading public.users directly
-- from policies on storage.objects.
create or replace function private.staff_avatar_subject_is_authorized(
  p_target_user_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      (
        p_target_user_id = (select auth.uid())::text
        or (select public.get_my_role()) = 'admin'::public.user_role
      )
      and exists (
        select 1
        from public.users target
        where target.id::text = p_target_user_id
          and target.role in (
            'admin'::public.user_role,
            'hr'::public.user_role,
            'payroll'::public.user_role
          )
      )
    ),
    false
  )
$$;

revoke all on function private.staff_avatar_subject_is_authorized(text)
from public, anon, authenticated, service_role;
grant execute on function private.staff_avatar_subject_is_authorized(text)
to authenticated, service_role;

drop policy if exists "Staff can read permitted profile photos" on storage.objects;
create policy "Staff can read permitted profile photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'staff-avatars'
  and (storage.foldername(storage.objects.name))[1] = 'staff'
  and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and array_length(storage.foldername(storage.objects.name), 1) = 2
  and storage.filename(storage.objects.name) = 'avatar'
  and private.staff_avatar_subject_is_authorized((storage.foldername(storage.objects.name))[2])
  and (
    (select auth.uid())::text = (storage.foldername(storage.objects.name))[2]
    or (select public.get_my_role()) = 'admin'::public.user_role
  )
);

drop policy if exists "Staff can upload permitted profile photos" on storage.objects;
create policy "Staff can upload permitted profile photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'staff-avatars'
  and (storage.foldername(storage.objects.name))[1] = 'staff'
  and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and array_length(storage.foldername(storage.objects.name), 1) = 2
  and storage.filename(storage.objects.name) = 'avatar'
  and private.staff_avatar_subject_is_authorized((storage.foldername(storage.objects.name))[2])
  and (
    (select auth.uid())::text = (storage.foldername(storage.objects.name))[2]
    or (select public.get_my_role()) = 'admin'::public.user_role
  )
);

drop policy if exists "Staff can replace permitted profile photos" on storage.objects;
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
  and private.staff_avatar_subject_is_authorized((storage.foldername(storage.objects.name))[2])
  and (
    (select auth.uid())::text = (storage.foldername(storage.objects.name))[2]
    or (select public.get_my_role()) = 'admin'::public.user_role
  )
);

drop policy if exists "Staff can remove permitted profile photos" on storage.objects;
create policy "Staff can remove permitted profile photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'staff-avatars'
  and (storage.foldername(storage.objects.name))[1] = 'staff'
  and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and array_length(storage.foldername(storage.objects.name), 1) = 2
  and storage.filename(storage.objects.name) = 'avatar'
  and private.staff_avatar_subject_is_authorized((storage.foldername(storage.objects.name))[2])
  and (
    (select auth.uid())::text = (storage.foldername(storage.objects.name))[2]
    or (select public.get_my_role()) = 'admin'::public.user_role
  )
);
