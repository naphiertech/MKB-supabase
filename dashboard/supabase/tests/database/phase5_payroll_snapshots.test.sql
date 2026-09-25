begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

-- Uses fixed test-only UUIDs and rolls back so the suite is repeatable on the
-- existing development project without Supabase Branching.
insert into auth.users (id, email, email_confirmed_at) values
  ('12000000-0000-4000-8000-000000000001', 'phase5-payroll@example.test', clock_timestamp());

insert into public.users (id, full_name, email, role) values
  ('12000000-0000-4000-8000-000000000001', 'Phase Five Payroll', 'phase5-payroll@example.test', 'payroll');

insert into public.riders (id, name, mkb_id, email) values
  ('22000000-0000-4000-8000-000000000001', 'Phase Five Rider', 'TEST-PHASE5-001', 'phase5-rider@example.test'),
  ('22000000-0000-4000-8000-000000000002', 'Other Phase Five Rider', 'TEST-PHASE5-002', 'phase5-other@example.test');

insert into public.attendance_logs (id, rider_id, date, time_in, status, source) values
  ('32000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001',
   date '2026-08-05', timestamptz '2026-08-05 07:50:00+08', 'present', 'face-scan');

insert into public.parcel_logs (
  id, rider_id, date, parcels, heavy_parcels, failed_parcels,
  returned_parcels, rate, created_by
) values (
  '52000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001',
  date '2026-08-05', 20, 5, 2, 1, 0, '12000000-0000-4000-8000-000000000001'
);

insert into public.payroll_records (
  id, rider_id, cutoff_start, cutoff_end, status,
  total_parcels, rate_per_parcel, gross_pay
) values (
  '82000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001',
  date '2026-08-01', date '2026-08-15', 'draft', 0, 0, 0
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$insert into public.payroll_delivery_lines (
      payroll_record_id, rider_id, date, standard_delivered, heavy_delivered,
      failed, returned, applied_standard_rate, applied_heavy_rate,
      standard_earnings, heavy_earnings, gross_delivery_pay,
      rate_configuration_id, calculation_version
    ) select
      '82000000-0000-4000-8000-000000000001',
      '22000000-0000-4000-8000-000000000002',
      date '2026-08-05', 20, 5, 2, 1, 12, 17, 240, 85, 325, id, 2
    from public.parcel_rate_configurations
    where active and effective_from <= date '2026-08-05'
    order by effective_from desc limit 1$$,
  '42501', null,
  'a payroll actor cannot insert a delivery snapshot for a different Rider'
);

reset role;
update public.payroll_records
set status = 'pending',
    submitted_by = '12000000-0000-4000-8000-000000000001',
    submitted_at = now()
where id = '82000000-0000-4000-8000-000000000001';

select is(
  (select jsonb_build_array(
    standard_parcels, heavy_parcels, standard_earnings,
    heavy_earnings, gross_pay, calculation_version
  ) from public.payroll_records
   where id = '82000000-0000-4000-8000-000000000001'),
  jsonb_build_array(20, 5, 240.00, 85.00, 325.00, 2),
  'submission stores the expected finalized payroll header snapshot'
);
select is(
  (select jsonb_build_array(
    standard_delivered, heavy_delivered, failed, returned,
    applied_standard_rate, applied_heavy_rate,
    standard_earnings, heavy_earnings, gross_delivery_pay,
    calculation_version
  ) from public.payroll_delivery_lines
   where payroll_record_id = '82000000-0000-4000-8000-000000000001'),
  jsonb_build_array(20, 5, 2, 1, 12.00, 17.00, 240.00, 85.00, 325.00, 2),
  'submission stores the expected immutable delivery-line snapshot'
);

-- A later operational correction must not rewrite the submitted snapshot.
update public.parcel_logs
set parcels = 21, heavy_parcels = 6
where id = '52000000-0000-4000-8000-000000000001';

select is(
  (select jsonb_build_array(standard_parcels, heavy_parcels, gross_pay)
   from public.payroll_records
   where id = '82000000-0000-4000-8000-000000000001'),
  jsonb_build_array(20, 5, 325.00),
  'parcel corrections do not rewrite the submitted payroll snapshot'
);
select throws_ok(
  $$update public.payroll_records
    set gross_pay = 999
    where id = '82000000-0000-4000-8000-000000000001'$$,
  'P0001', null,
  'finalized payroll mutation is rejected'
);

select * from finish();

rollback;
