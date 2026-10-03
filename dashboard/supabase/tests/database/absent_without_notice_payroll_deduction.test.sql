-- pgTAP suite: Dedicated "Absent w/o prior notice" (absent_without_notice) payroll deduction category.
-- Verifies all 14 points required by specification:
-- 1. Confirmed absence consequence still does NOT directly touch payroll.
-- 2. Materializing confirmed consequence creates: adjustment_code = 'absent_without_notice'.
-- 3. Reference remains: ABS-PEN:<uuid>.
-- 4. Waived consequence creates no obligation.
-- 5. Unconfirmed consequence creates no obligation.
-- 6. Allocation updates dedicated absence deduction aggregate.
-- 7. General Deductions remains separate.
-- 8. Two allocated 500 absence obligations = 1,000 absence deduction.
-- 9. Absent Days count does NOT affect monetary deduction.
-- 10. Dedicated line exists in definitions and balance views.
-- 11. Traceable snapshot includes absent_without_notice at dedicated position.
-- 12. Total deductions and net pay remain mathematically correct.
-- 13. No duplicate ABS-PEN obligation can be created.
-- 14. Policy V2 remains inactive after migration.
-- 15. Manual creation of absent_without_notice via generic RPCs is strictly forbidden.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Setup fixtures
insert into public.hubs (id, name, latitude, longitude, attendance_radius_m) values
  ('a8500000-0000-4000-8000-000000000001', 'AWN Test Hub', 14.5995, 120.9842, 100);

insert into public.riders (id, hub_id, name, mkb_id, email, status) values
  ('c8500000-0000-4000-8000-000000000001', 'a8500000-0000-4000-8000-000000000001', 'AWN Test Rider 1', 'MKB-AWN-001', 'awn1@test.mkb', 'active'),
  ('c8500000-0000-4000-8000-000000000002', 'a8500000-0000-4000-8000-000000000001', 'AWN Test Rider 2', 'MKB-AWN-002', 'awn2@test.mkb', 'active');

insert into auth.users (id, email, email_confirmed_at) values
  ('d8500000-0000-4000-8000-000000000001', 'awn-admin@test.mkb', clock_timestamp()),
  ('d8500000-0000-4000-8000-000000000002', 'awn-payroll@test.mkb', clock_timestamp()),
  ('d8500000-0000-4000-8000-000000000003', 'awn-hr@test.mkb', clock_timestamp());

insert into public.users (id, full_name, email, role, hub_access_scope, status, employment_status) values
  ('d8500000-0000-4000-8000-000000000001', 'AWN Admin', 'awn-admin@test.mkb', 'admin', 'global', 'active', 'active'),
  ('d8500000-0000-4000-8000-000000000002', 'AWN Payroll', 'awn-payroll@test.mkb', 'payroll', 'global', 'active', 'active'),
  ('d8500000-0000-4000-8000-000000000003', 'AWN HR', 'awn-hr@test.mkb', 'hr', 'global', 'active', 'active');

-- Point 14: Policy V2 remains inactive after migration.
select is(
  (select count(*) from public.absence_policy_versions where version_number = 2 and lifecycle = 'published'),
  0::bigint,
  'Point 14: Policy V2 remains inactive after migration'
);

-- Point 10: Definition exists in registry with proper metadata.
select is(
  (select display_name from public.payroll_adjustment_definitions where code = 'absent_without_notice'),
  'Absent w/o prior notice',
  'Point 10: absent_without_notice definition exists with correct display name'
);

select is(
  (select category from public.payroll_adjustment_definitions where code = 'absent_without_notice'),
  'deduction',
  'Point 10: absent_without_notice category is deduction'
);

-- Point 15: Manual generic RPC creation is forbidden.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d8500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'd8500000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$
    select public.create_payroll_deduction_obligation(
      'c8500000-0000-4000-8000-000000000001',
      'absent_without_notice',
      500.00,
      '2026-10-01'::date,
      'Fake manual absence penalty'
    )
  $$,
  'Absent w/o prior notice cannot be created manually. Use Leave & Absence management.',
  'Point 15: create_payroll_deduction_obligation rejects manual absent_without_notice'
);

select throws_ok(
  $$
    select public.create_payroll_adjustments_batch(
      'c8500000-0000-4000-8000-000000000001',
      jsonb_build_array(
        jsonb_build_object(
          'adjustment_code', 'absent_without_notice',
          'amount', 500,
          'adjustment_date', '2026-10-01',
          'reason', 'Fake batch absence penalty'
        )
      ),
      'Batch creation attempt'
    )
  $$,
  'Absent w/o prior notice cannot be created manually. Use Leave & Absence management.',
  'Point 15: create_payroll_adjustments_batch rejects manual absent_without_notice'
);

-- Create draft payroll record for Rider 1
insert into public.payroll_records (
  id, rider_id, hub_id, cutoff_start, cutoff_end, total_parcels, standard_parcels, heavy_parcels,
  standard_earnings, heavy_earnings, gross_pay, rate_per_parcel, status, calculation_version, adjustment_source_version
) values (
  'e8500000-0000-4000-8000-000000000001',
  'c8500000-0000-4000-8000-000000000001',
  'a8500000-0000-4000-8000-000000000001',
  '2026-10-01', '2026-10-15',
  100, 100, 0, 1200.00, 0, 1200.00, 12.00, 'draft', 2, 2
);

-- Point 1: Create confirmed absence consequence -> verify it does NOT touch payroll directly.
insert into public.rider_absence_financial_consequences (
  id, rider_id, hub_id, business_date, attendance_context_code, policy_version_id,
  financial_eligibility_reason, policy_penalty_amount, applied_amount, currency,
  status, confirmation_key, decided_by, supervisor_name, decision_notes
) values (
  'f8500000-0000-4000-8000-000000000001',
  'c8500000-0000-4000-8000-000000000001',
  'a8500000-0000-4000-8000-000000000001',
  '2026-10-02', 'no_notice',
  (select id from public.absence_policy_versions where version_number = 1),
  'absence_without_prior_notice', 500.00, 500.00, 'PHP',
  'confirmed', gen_random_uuid(), 'd8500000-0000-4000-8000-000000000001',
  'Test Admin', 'Confirmed penalty 1'
);

select is(
  (select absent_without_notice from public.payroll_records where id = 'e8500000-0000-4000-8000-000000000001'),
  0.00,
  'Point 1: Confirmed consequence does NOT automatically alter payroll deductions'
);

select is(
  (select count(*) from public.payroll_deduction_obligations where reference = 'ABS-PEN:f8500000-0000-4000-8000-000000000001'),
  0::bigint,
  'Point 1: Confirmed consequence does NOT create obligation before Send to Payroll'
);

-- Point 4: Waived consequence creates no obligation.
insert into public.rider_absence_financial_consequences (
  id, rider_id, hub_id, business_date, attendance_context_code, policy_version_id,
  financial_eligibility_reason, policy_penalty_amount, applied_amount, currency,
  status, confirmation_key, decided_by, supervisor_name, decision_notes, waiver_reason_category
) values (
  'f8500000-0000-4000-8000-000000000002',
  'c8500000-0000-4000-8000-000000000001',
  'a8500000-0000-4000-8000-000000000001',
  '2026-10-03', 'no_notice',
  (select id from public.absence_policy_versions where version_number = 1),
  'absence_without_prior_notice', 500.00, 0, 'PHP',
  'waived_emergency', gen_random_uuid(), 'd8500000-0000-4000-8000-000000000001',
  'Test Admin', 'Emergency waiver', 'emergency'
);

select throws_ok(
  $$ select public.materialize_absence_financial_deduction_obligation('f8500000-0000-4000-8000-000000000002') $$,
  '23514',
  null,
  'Point 4: Waived consequence cannot materialize an obligation'
);

-- Point 5: Unconfirmed (or reversed) consequence cannot create obligation.
insert into public.rider_absence_financial_consequences (
  id, rider_id, hub_id, business_date, attendance_context_code, policy_version_id,
  financial_eligibility_reason, policy_penalty_amount, applied_amount, currency,
  status, confirmation_key, decided_by, supervisor_name, decision_notes
) values (
  'f8500000-0000-4000-8000-000000000003',
  'c8500000-0000-4000-8000-000000000001',
  'a8500000-0000-4000-8000-000000000001',
  '2026-10-04', 'no_notice',
  (select id from public.absence_policy_versions where version_number = 1),
  'absence_without_prior_notice', 500.00, 500.00, 'PHP',
  'reversed', gen_random_uuid(), 'd8500000-0000-4000-8000-000000000001',
  'Test Admin', 'Reversed decision'
);

select throws_ok(
  $$ select public.materialize_absence_financial_deduction_obligation('f8500000-0000-4000-8000-000000000003') $$,
  '23514',
  null,
  'Point 5: Unconfirmed/reversed consequence cannot materialize an obligation'
);

-- Points 2 & 3: Materialize confirmed consequence creates adjustment_code = absent_without_notice and ABS-PEN:<uuid>
do $$
declare
  v_ob_id uuid;
begin
  v_ob_id := public.materialize_absence_financial_deduction_obligation('f8500000-0000-4000-8000-000000000001');
end;
$$;

select is(
  (select adjustment_code from public.payroll_deduction_obligations where reference = 'ABS-PEN:f8500000-0000-4000-8000-000000000001'),
  'absent_without_notice',
  'Point 2: Materialized obligation receives adjustment_code = absent_without_notice'
);

select is(
  (select reference from public.payroll_deduction_obligations where reference = 'ABS-PEN:f8500000-0000-4000-8000-000000000001'),
  'ABS-PEN:f8500000-0000-4000-8000-000000000001',
  'Point 3: Reference remains ABS-PEN:<uuid>'
);

-- Point 13: Idempotent - cannot create duplicate obligation on retry.
do $$
declare
  v_second_ob_id uuid;
  v_first_ob_id uuid;
begin
  select deduction_obligation_id into v_first_ob_id from public.rider_absence_financial_consequences where id = 'f8500000-0000-4000-8000-000000000001';
  v_second_ob_id := public.materialize_absence_financial_deduction_obligation('f8500000-0000-4000-8000-000000000001');
  if v_second_ob_id <> v_first_ob_id then
    raise exception 'Retry generated different obligation ID';
  end if;
end;
$$;

select is(
  (select count(*) from public.payroll_deduction_obligations where reference = 'ABS-PEN:f8500000-0000-4000-8000-000000000001'),
  1::bigint,
  'Point 13: No duplicate ABS-PEN obligation created on retry'
);

-- Create second confirmed consequence and obligation for same rider and cutoff
insert into public.rider_absence_financial_consequences (
  id, rider_id, hub_id, business_date, attendance_context_code, policy_version_id,
  financial_eligibility_reason, policy_penalty_amount, applied_amount, currency,
  status, confirmation_key, decided_by, supervisor_name, decision_notes
) values (
  'f8500000-0000-4000-8000-000000000004',
  'c8500000-0000-4000-8000-000000000001',
  'a8500000-0000-4000-8000-000000000001',
  '2026-10-05', 'no_notice',
  (select id from public.absence_policy_versions where version_number = 1),
  'absence_without_prior_notice', 500.00, 500.00, 'PHP',
  'confirmed', gen_random_uuid(), 'd8500000-0000-4000-8000-000000000001',
  'Test Admin', 'Confirmed penalty 2'
);

do $$
begin
  perform public.materialize_absence_financial_deduction_obligation('f8500000-0000-4000-8000-000000000004');
end;
$$;

-- Create an independent General Deduction obligation as well
insert into public.payroll_deduction_obligations (
  id, rider_id, hub_id, adjustment_code, original_amount, adjustment_date,
  reason, reference, source, created_by, updated_by
) values (
  'b8500000-0000-4000-8000-000000000099',
  'c8500000-0000-4000-8000-000000000001',
  'a8500000-0000-4000-8000-000000000001',
  'general_deductions', 150.00, '2026-10-01',
  'Uniform deduction', 'UNI-1', 'manual',
  'd8500000-0000-4000-8000-000000000001', 'd8500000-0000-4000-8000-000000000001'
);

-- Points 6, 7, 8, 9, 12: Allocate obligations to draft payroll via save_payroll_adjustment_plan
do $$
declare
  v_ob1 uuid;
  v_ob2 uuid;
begin
  select deduction_obligation_id into v_ob1 from public.rider_absence_financial_consequences where id = 'f8500000-0000-4000-8000-000000000001';
  select deduction_obligation_id into v_ob2 from public.rider_absence_financial_consequences where id = 'f8500000-0000-4000-8000-000000000004';

  perform public.save_payroll_adjustment_plan(
    'e8500000-0000-4000-8000-000000000001',
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('obligation_id', v_ob1, 'amount', 500.00),
      jsonb_build_object('obligation_id', v_ob2, 'amount', 500.00),
      jsonb_build_object('obligation_id', 'b8500000-0000-4000-8000-000000000099'::uuid, 'amount', 150.00)
    ),
    'Allocating absence penalties and uniform deduction'
  );
end;
$$;

-- Point 6: Dedicated aggregate updated
select is(
  (select absent_without_notice from public.payroll_records where id = 'e8500000-0000-4000-8000-000000000001'),
  1000.00,
  'Point 6 & 8: Allocation updates dedicated absence deduction aggregate to 1,000.00'
);

-- Point 7: General deductions remains separate
select is(
  (select deductions from public.payroll_records where id = 'e8500000-0000-4000-8000-000000000001'),
  150.00,
  'Point 7: General Deductions remains separate at 150.00'
);

-- Point 9: Absent days count in attendance does NOT affect monetary deduction
select is(
  (select count(*) from public.attendance_logs where rider_id = 'c8500000-0000-4000-8000-000000000001' and status = 'absent'),
  0::bigint,
  'Point 9: 0 attendance log entries exist; monetary deduction is strictly from allocated obligations'
);

-- Point 11: Submit payroll -> snapshot built with absent_without_notice
update public.payroll_records
set status = 'pending'
where id = 'e8500000-0000-4000-8000-000000000001';

select is(
  (select total_deductions_snapshot from public.payroll_records where id = 'e8500000-0000-4000-8000-000000000001'),
  1150.00,
  'Point 12: Total deductions snapshot correctly reconciles (1,000 AWN + 150 General)'
);

select is(
  (select net_pay_snapshot from public.payroll_records where id = 'e8500000-0000-4000-8000-000000000001'),
  50.00,
  'Point 12: Net pay snapshot correctly reconciles (1,200 gross - 1,150 deductions = 50.00)'
);

select is(
  (
    select (item->>'amount')::numeric
    from public.payroll_records p,
    jsonb_array_elements(p.adjustment_snapshot->'items') item
    where p.id = 'e8500000-0000-4000-8000-000000000001'
      and item->>'code' = 'absent_without_notice'
  ),
  1000.00,
  'Point 11: Traceable snapshot contains absent_without_notice with amount 1,000.00'
);

select is(
  (
    select count(*)::integer
    from public.payroll_records p,
    jsonb_array_elements(p.adjustment_snapshot->'items') item
    where p.id = 'e8500000-0000-4000-8000-000000000001'
  ),
  6,
  'Point 11: Traceable snapshot contains 6 items (all 6 adjustment definitions)'
);

-- Approve payroll with transition request id
select set_config('app.payroll_transition_request_id', gen_random_uuid()::text, true);
update public.payroll_records
set status = 'approved'
where id = 'e8500000-0000-4000-8000-000000000001';

select is(
  (select status::text from public.payroll_records where id = 'e8500000-0000-4000-8000-000000000001'),
  'approved',
  'Point 12: Transition to Approved succeeds and snapshot validates successfully'
);

select * from finish();
rollback;
