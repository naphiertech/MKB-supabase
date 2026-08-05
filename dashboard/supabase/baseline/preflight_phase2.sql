-- Read-only Phase 2 deployment preflight. This query must return zero rows.
-- It verifies the live prerequisites and protected legacy payroll fingerprints
-- without changing schema or data.
with expected_paid(id, fingerprint) as (
  values
    (
      'b15404b6-b118-4344-9cb3-c847491f2a12'::uuid,
      '36d945471df5b833a0560f179004a34b'::text
    ),
    (
      'ba0f88bc-6169-4962-84fc-1f4360d8fa14'::uuid,
      'd0f6897ace65f3bc8176cec17e3958f7'::text
    )
), actual_paid as (
  select
    pr.id,
    md5(concat_ws('|',
      pr.rider_id,
      pr.cutoff_start,
      pr.cutoff_end,
      pr.total_parcels,
      pr.rate_per_parcel,
      pr.gross_pay,
      pr.other_earnings,
      pr.fm_pickup_count,
      pr.deductions,
      pr.late_onhold,
      pr.late_remittance,
      pr.status,
      pr.paid_at
    )) as fingerprint
  from public.payroll_records pr
  where pr.id in (select id from expected_paid)
), checks(check_name, passed, details) as (
  values
    (
      'migration history is reconciled',
      exists (
        select 1
        from supabase_migrations.schema_migrations
        where version = '20260804162434'
      ) and not exists (
        select 1
        from supabase_migrations.schema_migrations
        where version = '20260804162107'
      ),
      'Expected remote version 20260804162434 and no 20260804162107 entry.'
    ),
    (
      'required parcel tables exist',
      to_regclass('public.parcel_logs') is not null
        and to_regclass('public.parcel_correction_requests') is not null
        and to_regclass('public.parcel_log_audit') is not null,
      'parcel_logs, parcel_correction_requests, and parcel_log_audit are required.'
    ),
    (
      'required payroll table exists',
      to_regclass('public.payroll_records') is not null,
      'payroll_records is required.'
    ),
    (
      'RLS identity helpers exist',
      to_regprocedure('public.get_my_role()') is not null
        and to_regprocedure('public.get_my_rider_id()') is not null,
      'Expected get_my_role() and get_my_rider_id().'
    ),
    (
      'updated-at helper exists',
      to_regprocedure('public.handle_updated_at()') is not null,
      'Expected handle_updated_at().'
    ),
    (
      'existing payroll workflow triggers exist',
      exists (
        select 1 from pg_trigger
        where tgrelid = 'public.payroll_records'::regclass
          and tgname = 'payroll_updated_at'
          and not tgisinternal
      ) and exists (
        select 1 from pg_trigger
        where tgrelid = 'public.payroll_records'::regclass
          and tgname = 'trg_enforce_payroll_workflow_constraints'
          and not tgisinternal
      ),
      'Both existing payroll triggers are required for the controlled legacy backfill.'
    ),
    (
      'existing private document bucket exists',
      exists (
        select 1 from storage.buckets
        where id = 'rider-documents' and public = false
      ),
      'Expected the existing private rider-documents bucket.'
    ),
    (
      'Phase 2 tables are not already present',
      to_regclass('public.rider_documents') is null
        and to_regclass('public.parcel_rate_configurations') is null
        and to_regclass('public.parcel_rate_configuration_audit') is null
        and to_regclass('public.payroll_delivery_lines') is null,
      'A partial or previous Phase 2 deployment must be reconciled before continuing.'
    ),
    (
      'Phase 2 additive columns are not already present',
      not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'parcel_logs'
          and column_name = 'heavy_parcels'
      ) and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'payroll_records'
          and column_name = 'snapshot_finalized_at'
      ),
      'A partial additive-column deployment must be reconciled before continuing.'
    ),
    (
      'protected paid payroll fingerprints match baseline',
      not exists (
        select 1
        from expected_paid e
        left join actual_paid a on a.id = e.id
        where a.id is null or a.fingerprint is distinct from e.fingerprint
      ),
      'The two captured paid payroll financial snapshots must be unchanged.'
    )
)
select check_name, details
from checks
where not passed
order by check_name;
