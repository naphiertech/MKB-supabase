-- Phase 2.2: private rider document metadata and Storage access foundation.

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'rider-documents'
  ) then
    raise exception 'Expected existing private Storage bucket rider-documents was not found.';
  end if;
end;
$$;

update storage.buckets
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
where id = 'rider-documents';

create table public.rider_documents (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete cascade,
  document_type text not null,
  document_label text,
  document_number text,
  issue_date date,
  expiration_date date,
  verification_status text not null default 'pending',
  notes text,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  uploaded_by uuid not null references public.users(id) on delete restrict,
  verified_by uuid references public.users(id) on delete restrict,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rider_documents_type_check check (
    document_type in (
      'drivers_license',
      'government_id',
      'vehicle_registration',
      'insurance',
      'nbi_or_police_clearance',
      'employment_contract',
      'medical_certificate',
      'other'
    )
  ),
  constraint rider_documents_other_label_check check (
    document_type <> 'other'
    or nullif(btrim(document_label), '') is not null
  ),
  constraint rider_documents_date_order_check check (
    issue_date is null
    or expiration_date is null
    or expiration_date >= issue_date
  ),
  constraint rider_documents_verification_check check (
    (
      verification_status = 'pending'
      and verified_by is null
      and verified_at is null
    )
    or (
      verification_status = 'verified'
      and verified_by is not null
      and verified_at is not null
    )
  ),
  constraint rider_documents_mime_type_check check (
    mime_type in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
  ),
  constraint rider_documents_file_size_check check (
    file_size_bytes > 0
    and file_size_bytes <= 5242880
  ),
  constraint rider_documents_storage_path_check check (
    (
      document_type <> 'other'
      and storage_path = 'riders/' || rider_id::text || '/' || document_type
    )
    or (
      document_type = 'other'
      and storage_path = 'riders/' || rider_id::text || '/other/' || id::text
    )
  )
);

create unique index rider_documents_standard_type_unique
  on public.rider_documents (rider_id, document_type)
  where document_type <> 'other';

create unique index rider_documents_other_label_unique
  on public.rider_documents (rider_id, lower(btrim(document_label)))
  where document_type = 'other';

create index rider_documents_rider_id_idx
  on public.rider_documents (rider_id);
create index rider_documents_expiration_date_idx
  on public.rider_documents (expiration_date)
  where expiration_date is not null;
create index rider_documents_verification_status_idx
  on public.rider_documents (verification_status);

create trigger rider_documents_updated_at
  before update on public.rider_documents
  for each row
  execute function public.handle_updated_at();

alter table public.rider_documents enable row level security;

revoke all on table public.rider_documents from anon;
revoke all on table public.rider_documents from authenticated;
grant select, insert, update, delete on table public.rider_documents to authenticated;

create policy "Admin and HR can read rider documents"
  on public.rider_documents
  for select
  to authenticated
  using (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  );

create policy "Admin and HR can upload rider documents"
  on public.rider_documents
  for insert
  to authenticated
  with check (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
    and uploaded_by = (select auth.uid())
  );

create policy "Admin and HR can replace or verify rider documents"
  on public.rider_documents
  for update
  to authenticated
  using (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  )
  with check (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  );

create policy "Admin and HR can delete rider documents"
  on public.rider_documents
  for delete
  to authenticated
  using (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  );

drop policy if exists "Admin and HR can read rider document files"
  on storage.objects;
drop policy if exists "Admin and HR can upload rider document files"
  on storage.objects;
drop policy if exists "Admin and HR can replace rider document files"
  on storage.objects;
drop policy if exists "Admin and HR can delete rider document files"
  on storage.objects;

create policy "Admin and HR can read rider document files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'rider-documents'
    and (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  );

create policy "Admin and HR can upload rider document files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'rider-documents'
    and (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
    and (storage.foldername(name))[1] = 'riders'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.riders r
      where r.id::text = (storage.foldername(name))[2]
    )
    and (
      (
        array_length(storage.foldername(name), 1) = 2
        and storage.filename(name) in (
          'drivers_license',
          'government_id',
          'vehicle_registration',
          'insurance',
          'nbi_or_police_clearance',
          'employment_contract',
          'medical_certificate'
        )
      )
      or (
        array_length(storage.foldername(name), 1) = 3
        and (storage.foldername(name))[3] = 'other'
        and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
  );

create policy "Admin and HR can replace rider document files"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'rider-documents'
    and (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  )
  with check (
    bucket_id = 'rider-documents'
    and (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
    and (storage.foldername(name))[1] = 'riders'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (
      (
        array_length(storage.foldername(name), 1) = 2
        and storage.filename(name) in (
          'drivers_license',
          'government_id',
          'vehicle_registration',
          'insurance',
          'nbi_or_police_clearance',
          'employment_contract',
          'medical_certificate'
        )
      )
      or (
        array_length(storage.foldername(name), 1) = 3
        and (storage.foldername(name))[3] = 'other'
        and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
  );

create policy "Admin and HR can delete rider document files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'rider-documents'
    and (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  );
