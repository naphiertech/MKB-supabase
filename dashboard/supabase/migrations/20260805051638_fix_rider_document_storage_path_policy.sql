-- Qualify the outer Storage object path inside the rider existence subquery.
-- Without qualification, PostgreSQL resolves `name` to public.riders.name.
drop policy "Admin and HR can upload rider document files"
  on storage.objects;

create policy "Admin and HR can upload rider document files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'rider-documents'
    and (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
    and (storage.foldername(storage.objects.name))[1] = 'riders'
    and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.riders r
      where r.id::text = (storage.foldername(storage.objects.name))[2]
    )
    and (
      (
        array_length(storage.foldername(storage.objects.name), 1) = 2
        and storage.filename(storage.objects.name) in (
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
        array_length(storage.foldername(storage.objects.name), 1) = 3
        and (storage.foldername(storage.objects.name))[3] = 'other'
        and storage.filename(storage.objects.name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
  );
