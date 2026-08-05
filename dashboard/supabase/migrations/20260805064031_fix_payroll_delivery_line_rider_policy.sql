-- Ensure authenticated draft snapshot writes cannot attach a delivery line to
-- a rider other than the rider owned by the payroll record.
drop policy if exists "Admin and Payroll can create draft payroll delivery lines"
  on public.payroll_delivery_lines;
drop policy if exists "Admin and Payroll can update draft payroll delivery lines"
  on public.payroll_delivery_lines;

create policy "Admin and Payroll can create draft payroll delivery lines"
  on public.payroll_delivery_lines
  for insert
  to authenticated
  with check (
    (select public.get_my_role()) in ('admin'::public.user_role, 'payroll'::public.user_role)
    and exists (
      select 1
      from public.payroll_records pr
      where pr.id = payroll_delivery_lines.payroll_record_id
        and pr.rider_id = payroll_delivery_lines.rider_id
        and pr.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
    )
  );

create policy "Admin and Payroll can update draft payroll delivery lines"
  on public.payroll_delivery_lines
  for update
  to authenticated
  using (
    (select public.get_my_role()) in ('admin'::public.user_role, 'payroll'::public.user_role)
    and exists (
      select 1
      from public.payroll_records pr
      where pr.id = payroll_delivery_lines.payroll_record_id
        and pr.rider_id = payroll_delivery_lines.rider_id
        and pr.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
    )
  )
  with check (
    (select public.get_my_role()) in ('admin'::public.user_role, 'payroll'::public.user_role)
    and exists (
      select 1
      from public.payroll_records pr
      where pr.id = payroll_delivery_lines.payroll_record_id
        and pr.rider_id = payroll_delivery_lines.rider_id
        and pr.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
    )
  );
