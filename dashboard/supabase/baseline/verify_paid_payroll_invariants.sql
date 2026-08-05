-- Run read-only after applying Phase 2. These are the two production payroll
-- snapshots captured before the migration. The query returns zero rows only
-- when both protected financial fingerprints remain unchanged and both rows
-- received the additive legacy snapshot defaults without daily reconstruction.
with expected(id, fingerprint) as (
  values
    (
      'b15404b6-b118-4344-9cb3-c847491f2a12'::uuid,
      '36d945471df5b833a0560f179004a34b'::text
    ),
    (
      'ba0f88bc-6169-4962-84fc-1f4360d8fa14'::uuid,
      'd0f6897ace65f3bc8176cec17e3958f7'::text
    )
), actual as (
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
    )) as fingerprint,
    pr.standard_parcels,
    pr.heavy_parcels,
    pr.standard_earnings,
    pr.heavy_earnings,
    pr.calculation_version,
    pr.snapshot_finalized_at,
    (select count(*) from public.payroll_delivery_lines pdl where pdl.payroll_record_id = pr.id) as line_count
  from public.payroll_records pr
  join expected e on e.id = pr.id
)
select
  e.id,
  e.fingerprint as expected_fingerprint,
  a.fingerprint as actual_fingerprint,
  a.standard_parcels,
  a.heavy_parcels,
  a.standard_earnings,
  a.heavy_earnings,
  a.calculation_version,
  a.snapshot_finalized_at,
  a.line_count
from expected e
left join actual a on a.id = e.id
where a.id is null
  or a.fingerprint is distinct from e.fingerprint
  or a.standard_parcels is distinct from (
    select total_parcels from public.payroll_records where id = e.id
  )
  or a.heavy_parcels is distinct from 0
  or a.standard_earnings is distinct from (
    select coalesce(gross_pay, 0) from public.payroll_records where id = e.id
  )
  or a.heavy_earnings is distinct from 0
  or a.calculation_version is distinct from 1
  or a.snapshot_finalized_at is null
  or a.line_count is distinct from 0;
