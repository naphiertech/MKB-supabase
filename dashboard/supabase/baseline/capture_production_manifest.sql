select jsonb_build_object(
  'captured_at', now(),
  'project_ref', 'odlawqxcmbbextrmcnbg',
  'server_version', version(),
  'extensions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', e.extname,
      'version', e.extversion,
      'schema', n.nspname
    ) order by e.extname), '[]'::jsonb)
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
  ),
  'migrations', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'version', version,
      'name', name
    ) order by version), '[]'::jsonb)
    from supabase_migrations.schema_migrations
  ),
  'enums', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', t.typname,
      'values', values.labels
    ) order by t.typname), '[]'::jsonb)
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    cross join lateral (
      select jsonb_agg(e.enumlabel order by e.enumsortorder) as labels
      from pg_enum e
      where e.enumtypid = t.oid
    ) values
    where n.nspname = 'public'
      and values.labels is not null
  ),
  'tables', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', c.relname,
      'rls_enabled', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity,
      'columns', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', a.attname,
          'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
          'not_null', a.attnotnull,
          'default', pg_get_expr(ad.adbin, ad.adrelid),
          'generated', a.attgenerated
        ) order by a.attnum), '[]'::jsonb)
        from pg_attribute a
        left join pg_attrdef ad
          on ad.adrelid = a.attrelid
         and ad.adnum = a.attnum
        where a.attrelid = c.oid
          and a.attnum > 0
          and not a.attisdropped
      ),
      'constraints', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', con.conname,
          'type', con.contype,
          'definition', pg_get_constraintdef(con.oid, true),
          'validated', con.convalidated
        ) order by con.conname), '[]'::jsonb)
        from pg_constraint con
        where con.conrelid = c.oid
      ),
      'indexes', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', i.indexname,
          'definition', i.indexdef
        ) order by i.indexname), '[]'::jsonb)
        from pg_indexes i
        where i.schemaname = 'public'
          and i.tablename = c.relname
      ),
      'policies', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', p.policyname,
          'roles', p.roles,
          'command', p.cmd,
          'using', p.qual,
          'with_check', p.with_check
        ) order by p.policyname), '[]'::jsonb)
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
      ),
      'triggers', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', t.tgname,
          'definition', pg_get_triggerdef(t.oid, true)
        ) order by t.tgname), '[]'::jsonb)
        from pg_trigger t
        where t.tgrelid = c.oid
          and not t.tgisinternal
      )
    ) order by c.relname), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  ),
  'views', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', c.relname,
      'security_invoker', coalesce((select option_value = 'true'
        from pg_options_to_table(c.reloptions)
        where option_name = 'security_invoker'), false),
      'definition', pg_get_viewdef(c.oid, true)
    ) order by c.relname), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
  ),
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'identity_arguments', pg_get_function_identity_arguments(p.oid),
      'security_definer', p.prosecdef,
      'definition', pg_get_functiondef(p.oid)
    ) order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
  ),
  'storage', jsonb_build_object(
    'buckets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'public', b.public,
        'file_size_limit', b.file_size_limit,
        'allowed_mime_types', b.allowed_mime_types,
        'object_count', (select count(*) from storage.objects o where o.bucket_id = b.id),
        'bytes_used', (select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
          from storage.objects o where o.bucket_id = b.id)
      ) order by b.name), '[]'::jsonb)
      from storage.buckets b
    ),
    'object_policies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', p.policyname,
        'roles', p.roles,
        'command', p.cmd,
        'using', p.qual,
        'with_check', p.with_check
      ) order by p.policyname), '[]'::jsonb)
      from pg_policies p
      where p.schemaname = 'storage'
        and p.tablename = 'objects'
    )
  ),
  'protected_payroll', jsonb_build_object(
    'paid_count', (select count(*) from public.payroll_records where status = 'paid'),
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'fingerprint', md5(concat_ws('|',
          rider_id,
          cutoff_start,
          cutoff_end,
          total_parcels,
          rate_per_parcel,
          gross_pay,
          other_earnings,
          fm_pickup_count,
          deductions,
          late_onhold,
          late_remittance,
          status,
          paid_at
        ))
      ) order by id), '[]'::jsonb)
      from public.payroll_records
      where status = 'paid'
    )
  ),
  'parcel_logs', jsonb_build_object(
    'row_count', (select count(*) from public.parcel_logs),
    'legacy_fingerprint', (
      select md5(coalesce(string_agg(md5(concat_ws('|',
        id,
        rider_id,
        date,
        parcels,
        assigned_parcels,
        failed_parcels,
        returned_parcels,
        rate,
        daily_gross,
        notes
      )), '' order by id), ''))
      from public.parcel_logs
    )
  )
) as manifest;
