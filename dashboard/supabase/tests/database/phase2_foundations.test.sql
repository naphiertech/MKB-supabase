begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select pg_advisory_xact_lock(hashtext('phase2_foundations_test'));
select plan(33);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.parcel_correction_requests'::regclass),
  'parcel correction requests have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.parcel_log_audit'::regclass),
  'parcel audit has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.parcel_correction_requests', 'SELECT'),
  'anonymous users cannot read parcel corrections'
);
select ok(
  not has_table_privilege('anon', 'public.parcel_log_audit', 'SELECT'),
  'anonymous users cannot read parcel audit'
);
select ok(
  not has_table_privilege('authenticated', 'public.parcel_log_audit', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.parcel_log_audit', 'DELETE'),
  'parcel audit has no authenticated update or delete privilege'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'parcel_logs'
      and policyname = 'Admin HR and Payroll can read parcel logs'
      and cmd = 'SELECT'
  ),
  'Payroll has an explicit read policy for parcel logs'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'parcel_logs'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%payroll%'
  ),
  'no parcel write policy includes Payroll'
);

select is(
  (
    select jsonb_build_object(
      'public', public,
      'limit', file_size_limit,
      'mimes', allowed_mime_types
    )
    from storage.buckets
    where id = 'rider-documents'
  ),
  jsonb_build_object(
    'public', false,
    'limit', 5242880,
    'mimes', array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  'rider-documents is private and constrained to approved size and MIME types'
);

select is(
  (
    select jsonb_build_array(
      early_standard_rate,
      regular_standard_rate,
      late_standard_rate,
      heavy_parcel_rate,
      heavy_threshold_kg
    )
    from public.parcel_rate_configurations
    where active and effective_from = date '2026-01-01'
  ),
  jsonb_build_array(12.00, 11.00, 10.00, 17.00, 4.00),
  'confirmed parcel rates are seeded exactly'
);
select ok(
  exists (
    select 1 from public.parcel_rate_configuration_audit
    where action = 'created' and effective_date = date '2026-01-01'
  ),
  'the seeded rate has an audit entry'
);
select throws_ok(
  $$insert into public.parcel_rate_configurations (
      early_standard_rate, regular_standard_rate, late_standard_rate,
      heavy_parcel_rate, heavy_threshold_kg, effective_from,
      active, change_reason
    ) values (13, 12, 11, 18, 4, date '2026-08-01', true, 'overlap test')$$,
  '23P01',
  null,
  'overlapping active rate periods are rejected'
);

insert into auth.users (id, email) values
  ('11000000-0000-4000-8000-000000000001', 'phase2-admin@example.test'),
  ('11000000-0000-4000-8000-000000000002', 'phase2-hr@example.test'),
  ('11000000-0000-4000-8000-000000000003', 'phase2-payroll@example.test');

insert into public.riders (id, name, mkb_id, email) values
  ('21000000-0000-4000-8000-000000000001', 'Phase Two Rider', 'TEST-PHASE2-001', 'phase2-rider@example.test');

insert into public.users (id, full_name, email, role) values
  ('11000000-0000-4000-8000-000000000001', 'Phase Two Admin', 'phase2-admin@example.test', 'admin'),
  ('11000000-0000-4000-8000-000000000002', 'Phase Two HR', 'phase2-hr@example.test', 'hr'),
  ('11000000-0000-4000-8000-000000000003', 'Phase Two Payroll', 'phase2-payroll@example.test', 'payroll');

insert into public.attendance_logs (
  id, rider_id, date, time_in, status, source
) values (
  '31000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  date '2026-08-05',
  timestamptz '2026-08-05 07:50:00+08',
  'present',
  'face-scan'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.rider_documents (
      id, rider_id, document_type, storage_path, original_filename,
      mime_type, file_size_bytes, uploaded_by
    ) values (
      '41000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      'drivers_license',
      'riders/21000000-0000-4000-8000-000000000001/drivers_license',
      'license.pdf', 'application/pdf', 1024,
      '11000000-0000-4000-8000-000000000001'
    )$$,
  'Admin can create deterministic rider document metadata'
);
select throws_ok(
  $$insert into public.rider_documents (
      rider_id, document_type, storage_path, original_filename,
      mime_type, file_size_bytes, uploaded_by
    ) values (
      '21000000-0000-4000-8000-000000000001',
      'government_id',
      'riders/21000000-0000-4000-8000-000000000001/version-2.pdf',
      'id.pdf', 'application/pdf', 1024,
      '11000000-0000-4000-8000-000000000001'
    )$$,
  '23514',
  null,
  'non-deterministic rider document paths are rejected'
);

select lives_ok(
  $$insert into public.parcel_logs (
      id, rider_id, date, parcels, heavy_parcels, assigned_parcels,
      failed_parcels, returned_parcels, rate, created_by
    ) values (
      '51000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      date '2026-08-05', 10, 2, 13, 1, 1, 99,
      '11000000-0000-4000-8000-000000000001'
    )$$,
  'Admin can create parcel operations data'
);
select is(
  (
    select jsonb_build_array(rate, heavy_rate, standard_earnings, heavy_earnings, daily_gross)
    from public.parcel_logs
    where id = '51000000-0000-4000-8000-000000000001'
  ),
  jsonb_build_array(12.00, 17.00, 120.00, 34.00, 154.00),
  'parcel insert resolves early and heavy rates server-side'
);

select lives_ok(
  $$insert into public.parcel_correction_requests (
      id, parcel_log_id, rider_id, date,
      previous_delivered, previous_failed, previous_returned, previous_heavy,
      requested_delivered, requested_failed, requested_returned, requested_heavy,
      reason, requested_by
    ) values (
      '61000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      date '2026-08-05', 10, 1, 1, 2, 11, 1, 1, 2,
      'verified correction test',
      '11000000-0000-4000-8000-000000000001'
    )$$,
  'Admin can submit a correction request'
);
select throws_ok(
  $$update public.parcel_correction_requests
    set status = 'approved', reason = 'tampered',
        reviewed_by = '11000000-0000-4000-8000-000000000001', reviewed_at = now()
    where id = '61000000-0000-4000-8000-000000000001'$$,
  'P0001',
  'Parcel correction request details are immutable after submission.',
  'submitted correction details cannot be changed during review'
);
select lives_ok(
  $$update public.parcel_correction_requests
    set status = 'approved',
        reviewed_by = '11000000-0000-4000-8000-000000000001', reviewed_at = now()
    where id = '61000000-0000-4000-8000-000000000001'$$,
  'Admin can approve an unchanged pending correction once'
);
select lives_ok(
  $$insert into public.parcel_log_audit (
      id, parcel_log_id, rider_id, date,
      old_delivered, new_delivered, old_heavy, new_heavy,
      action_type, changed_by
    ) values (
      '71000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      date '2026-08-05', 10, 11, 2, 2, 'updated',
      '11000000-0000-4000-8000-000000000001'
    )$$,
  'Admin can append parcel audit evidence'
);
select throws_ok(
  $$update public.parcel_log_audit
    set reason = 'tampered'
    where id = '71000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'parcel audit rows cannot be updated'
);
select throws_ok(
  $$delete from public.parcel_log_audit
    where id = '71000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'parcel audit rows cannot be deleted'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.rider_documents),
  0::bigint,
  'Payroll cannot read rider documents'
);
select is(
  (select count(*) from public.parcel_logs where id = '51000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Payroll can read parcel logs'
);
select throws_ok(
  $$insert into public.parcel_logs (rider_id, date, parcels, rate, created_by)
    values (
      '21000000-0000-4000-8000-000000000001',
      date '2026-08-06', 1, 10,
      '11000000-0000-4000-8000-000000000003'
    )$$,
  '42501',
  null,
  'Payroll cannot insert parcel logs'
);
select lives_ok(
  $$insert into public.payroll_records (
      id, rider_id, cutoff_start, cutoff_end, status,
      total_parcels, rate_per_parcel, gross_pay
    ) values (
      '81000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      date '2026-08-01', date '2026-08-15', 'draft', 10, 12, 154
    )$$,
  'Payroll can create a draft payroll record'
);
select lives_ok(
  $$update public.payroll_records
    set status = 'pending',
        submitted_by = '11000000-0000-4000-8000-000000000003',
        submitted_at = now()
    where id = '81000000-0000-4000-8000-000000000001'$$,
  'submitting payroll creates its immutable delivery snapshot'
);
select is(
  (
    select jsonb_build_array(
      date, standard_delivered, heavy_delivered, failed, returned,
      applied_standard_rate, applied_heavy_rate,
      standard_earnings, heavy_earnings, gross_delivery_pay,
      calculation_version
    )
    from public.payroll_delivery_lines
    where payroll_record_id = '81000000-0000-4000-8000-000000000001'
  ),
  jsonb_build_array(
    date '2026-08-05', 10, 2, 1, 1,
    12.00, 17.00, 120.00, 34.00, 154.00, 2
  ),
  'the daily payroll snapshot contains the exact operational and applied-rate values'
);
select is(
  (
    select jsonb_build_array(
      standard_parcels, heavy_parcels, standard_earnings,
      heavy_earnings, gross_pay, calculation_version,
      snapshot_finalized_at is not null
    )
    from public.payroll_records
    where id = '81000000-0000-4000-8000-000000000001'
  ),
  jsonb_build_array(10, 2, 120.00, 34.00, 154.00, 2, true),
  'the payroll header stores its finalized calculation snapshot'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$update public.payroll_records
    set gross_pay = 999
    where id = '81000000-0000-4000-8000-000000000001'$$,
  'P0001',
  'Finalized payroll calculation snapshots are immutable.',
  'Admin cannot rewrite a submitted payroll snapshot'
);
select lives_ok(
  $$update public.payroll_records
      set status = 'approved',
          approved_by = '11000000-0000-4000-8000-000000000001', approved_at = now()
      where id = '81000000-0000-4000-8000-000000000001';
    update public.payroll_records
      set status = 'paid',
          paid_by = '11000000-0000-4000-8000-000000000001', paid_at = now()
      where id = '81000000-0000-4000-8000-000000000001'$$,
  'Admin can complete the existing approval and payment workflow'
);
select throws_ok(
  $$update public.payroll_records
    set notes = 'tampered after payment'
    where id = '81000000-0000-4000-8000-000000000001'$$,
  'P0001',
  'Paid payroll records are immutable.',
  'paid payroll is fully immutable'
);
select ok(
  not exists (
    select 1 from public.parcel_logs
    where heavy_parcels is null
      or standard_earnings is null
      or heavy_earnings is null
  ),
  'all parcel rows have additive heavy and earnings fields'
);
select ok(
  not exists (
    select 1 from public.payroll_records
    where standard_parcels is null
      or heavy_parcels is null
      or standard_earnings is null
      or heavy_earnings is null
      or calculation_version is null
  ),
  'all payroll headers have additive snapshot fields'
);

select coalesce(string_agg(result, E'\n'), 'ok') as test_suite
from finish() as result;
rollback;
