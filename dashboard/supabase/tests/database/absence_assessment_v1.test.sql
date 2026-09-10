BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- Staged migration DDL within isolated transaction
CREATE TABLE IF NOT EXISTS public.absence_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number integer NOT NULL UNIQUE CHECK (version_number > 0),
  policy_name text NOT NULL,
  policy_type text NOT NULL CHECK (policy_type IN ('provisional', 'official')),
  lifecycle text NOT NULL CHECK (lifecycle IN ('draft', 'published', 'archived')),
  effective_from date NOT NULL,
  published_at timestamptz,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (lifecycle = 'published' AND published_at IS NOT NULL)
    OR lifecycle <> 'published'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS absence_policy_versions_one_effective_version_idx
  ON public.absence_policy_versions(effective_from, version_number);

CREATE INDEX IF NOT EXISTS absence_policy_versions_effective_idx
  ON public.absence_policy_versions(lifecycle, effective_from DESC, version_number DESC);

CREATE TABLE IF NOT EXISTS public.absence_policy_rules (
  policy_version_id uuid NOT NULL
    REFERENCES public.absence_policy_versions(id)
    ON DELETE RESTRICT,
  rule_key text NOT NULL,
  assessment_status text NOT NULL CHECK (
    assessment_status IN (
      'excused',
      'unexcused',
      'pending_review',
      'not_absent',
      'not_applicable'
    )
  ),
  reason_code text NOT NULL,
  priority integer NOT NULL CHECK (priority > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (policy_version_id, rule_key)
);

CREATE OR REPLACE FUNCTION private.prevent_published_absence_policy_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lifecycle text;
BEGIN
  IF TG_TABLE_NAME = 'absence_policy_versions' THEN
    IF OLD.lifecycle = 'published' THEN
      RAISE EXCEPTION 'Published absence policy versions are immutable'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  SELECT lifecycle
    INTO v_lifecycle
  FROM public.absence_policy_versions
  WHERE id = COALESCE(OLD.policy_version_id, NEW.policy_version_id);

  IF v_lifecycle = 'published' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Rules for a published absence policy are immutable'
        USING ERRCODE = '55000';
    ELSIF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'Rules for a published absence policy are immutable'
        USING ERRCODE = '55000';
    ELSIF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Rules for a published absence policy are immutable'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_published_policy_version_mutation ON public.absence_policy_versions;
CREATE TRIGGER trg_prevent_published_policy_version_mutation
BEFORE UPDATE OR DELETE ON public.absence_policy_versions
FOR EACH ROW
EXECUTE FUNCTION private.prevent_published_absence_policy_mutation();

DO $$
DECLARE
  v_v1_id uuid := 'c9100000-0000-4000-8000-000000000001'::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.absence_policy_versions WHERE version_number = 1) THEN
    INSERT INTO public.absence_policy_versions (
      id,
      version_number,
      policy_name,
      policy_type,
      lifecycle,
      effective_from,
      published_at,
      created_at,
      updated_at
    ) VALUES (
      v_v1_id,
      1,
      'MKB Provisional Absence Policy',
      'provisional',
      'published',
      DATE '2026-09-09',
      clock_timestamp(),
      clock_timestamp(),
      clock_timestamp()
    );

    INSERT INTO public.absence_policy_rules (
      policy_version_id,
      rule_key,
      assessment_status,
      reason_code,
      priority
    ) VALUES
      (v_v1_id, 'actual_attendance',     'not_absent',     'actual_attendance',     10),
      (v_v1_id, 'published_day_off',     'not_applicable', 'published_day_off',     20),
      (v_v1_id, 'approved_leave',        'excused',        'approved_leave',        30),
      (v_v1_id, 'accepted_notice',       'excused',        'accepted_notice',       40),
      (v_v1_id, 'leave_pending_review',  'pending_review', 'leave_pending_review',  50),
      (v_v1_id, 'notice_pending_review', 'pending_review', 'notice_pending_review', 60),
      (v_v1_id, 'leave_rejected',        'unexcused',      'leave_rejected',        70),
      (v_v1_id, 'notice_rejected',       'unexcused',      'notice_rejected',       80),
      (v_v1_id, 'leave_withdrawn',       'unexcused',      'leave_withdrawn',       90),
      (v_v1_id, 'notice_withdrawn',      'unexcused',      'notice_withdrawn',      100),
      (v_v1_id, 'leave_cancelled',       'unexcused',      'leave_cancelled',       110),
      (v_v1_id, 'notice_cancelled',      'unexcused',      'notice_cancelled',      120),
      (v_v1_id, 'no_notice',             'unexcused',      'no_notice',             130);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_published_policy_rule_mutation ON public.absence_policy_rules;
CREATE TRIGGER trg_prevent_published_policy_rule_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.absence_policy_rules
FOR EACH ROW
EXECUTE FUNCTION private.prevent_published_absence_policy_mutation();

ALTER TABLE public.absence_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_policy_rules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.absence_policy_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.absence_policy_rules FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.resolve_rider_absence_assessment(
  p_rider_id uuid,
  p_business_date date,
  p_as_of timestamptz DEFAULT pg_catalog.clock_timestamp()
)
RETURNS TABLE (
  rider_id uuid,
  business_date date,
  effective_status text,
  context_code text,
  expected_to_work boolean,
  is_finalized boolean,
  assessment_status text,
  assessment_reason text,
  policy_version_id uuid,
  policy_version_number integer,
  policy_type text,
  attendance_log_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ctx record;
  v_policy_id uuid;
  v_policy_version integer;
  v_policy_type text;
  v_rule_key text;
  v_assessment_status text;
  v_assessment_reason text;
  v_has_valid_clock boolean := false;
BEGIN
  IF p_rider_id IS NULL OR p_business_date IS NULL OR p_as_of IS NULL THEN
    RAISE EXCEPTION 'Rider absence assessment requires a Rider, business date, and server moment.'
      USING ERRCODE = '22023';
  END IF;

  -- 1. Resolve underlying Attendance Context
  SELECT *
  INTO v_ctx
  FROM private.resolve_rider_attendance_context(p_rider_id, p_business_date, p_as_of);

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 2. Select policy applicable to Manila business date
  SELECT v.id, v.version_number, v.policy_type
  INTO v_policy_id, v_policy_version, v_policy_type
  FROM public.absence_policy_versions v
  WHERE v.lifecycle = 'published'
    AND v.effective_from <= p_business_date
  ORDER BY v.effective_from DESC, v.version_number DESC
  LIMIT 1;

  -- If no published policy applies for this date, return no classification
  IF v_policy_id IS NULL THEN
    RETURN QUERY SELECT
      v_ctx.rider_id,
      v_ctx.business_date,
      v_ctx.effective_status,
      v_ctx.context_code,
      v_ctx.expected_to_work,
      v_ctx.is_finalized,
      NULL::text AS assessment_status,
      NULL::text AS assessment_reason,
      NULL::uuid AS policy_version_id,
      NULL::integer AS policy_version_number,
      NULL::text AS policy_type,
      v_ctx.attendance_log_id;
    RETURN;
  END IF;

  -- 3. Determine if attendance has valid clock evidence
  v_has_valid_clock := (v_ctx.time_in IS NOT NULL OR v_ctx.time_out IS NOT NULL);

  -- 4. Map Attendance Context to stable rule key:
  -- Precedence:
  -- 1. Actual valid attendance -> 'actual_attendance'
  -- 2. Published Day Off -> 'published_day_off'
  -- 3. Approved Planned Leave -> 'approved_leave'
  -- 4. Accepted Absence Notice -> 'accepted_notice'
  -- 5. Pending review:
  --    leave pending -> 'leave_pending_review'
  --    notice pending -> 'notice_pending_review'
  -- 6. Rejected / withdrawn / cancelled / no_notice:
  --    Must only resolve to unexcused if finalized.
  --    Pre-finalization workday without clocks does NOT become unexcused.
  IF v_has_valid_clock THEN
    v_rule_key := 'actual_attendance';
  ELSIF v_ctx.effective_status = 'day_off' THEN
    v_rule_key := 'published_day_off';
  ELSIF v_ctx.effective_status = 'on_leave' AND v_ctx.context_code = 'approved_leave' THEN
    v_rule_key := 'approved_leave';
  ELSIF v_ctx.context_code = 'accepted_notice' THEN
    v_rule_key := 'accepted_notice';
  ELSIF v_ctx.context_code IN ('leave_pending', 'leave_pending_review') THEN
    v_rule_key := 'leave_pending_review';
  ELSIF v_ctx.context_code IN ('notice_pending', 'notice_pending_review') THEN
    v_rule_key := 'notice_pending_review';
  ELSIF NOT v_ctx.is_finalized THEN
    -- A no-clock expected workday before Attendance Context considers the day finalized must not become unexcused.
    v_rule_key := NULL;
  ELSIF v_ctx.context_code = 'leave_rejected' THEN
    v_rule_key := 'leave_rejected';
  ELSIF v_ctx.context_code = 'notice_rejected' THEN
    v_rule_key := 'notice_rejected';
  ELSIF v_ctx.context_code = 'leave_withdrawn' THEN
    v_rule_key := 'leave_withdrawn';
  ELSIF v_ctx.context_code = 'notice_withdrawn' THEN
    v_rule_key := 'notice_withdrawn';
  ELSIF v_ctx.context_code = 'leave_cancelled' THEN
    v_rule_key := 'leave_cancelled';
  ELSIF v_ctx.context_code = 'notice_cancelled' THEN
    v_rule_key := 'notice_cancelled';
  ELSIF v_ctx.context_code = 'no_notice' THEN
    v_rule_key := 'no_notice';
  ELSE
    v_rule_key := NULL;
  END IF;

  -- 5. Look up policy rule
  IF v_rule_key IS NOT NULL THEN
    SELECT r.assessment_status, r.reason_code
    INTO v_assessment_status, v_assessment_reason
    FROM public.absence_policy_rules r
    WHERE r.policy_version_id = v_policy_id
      AND r.rule_key = v_rule_key;
  END IF;

  RETURN QUERY SELECT
    v_ctx.rider_id,
    v_ctx.business_date,
    v_ctx.effective_status,
    v_ctx.context_code,
    v_ctx.expected_to_work,
    v_ctx.is_finalized,
    v_assessment_status,
    v_assessment_reason,
    v_policy_id,
    v_policy_version,
    v_policy_type,
    v_ctx.attendance_log_id;
END;
$$;

COMMENT ON FUNCTION private.resolve_rider_absence_assessment(uuid, date, timestamptz) IS
  'Server-authoritative derivation of absence assessment from Attendance Context and versioned absence policy.';

REVOKE ALL ON FUNCTION private.resolve_rider_absence_assessment(uuid, date, timestamptz)
FROM PUBLIC, anon, authenticated, service_role;

-- Test assertions
SELECT no_plan();


SELECT has_table('public', 'absence_policy_versions', 'absence_policy_versions table exists');
SELECT has_table('public', 'absence_policy_rules', 'absence_policy_rules table exists');

SELECT col_is_pk('public', 'absence_policy_versions', 'id', 'absence_policy_versions PK is id');
SELECT col_is_unique('public', 'absence_policy_versions', 'version_number', 'version_number is unique');

SELECT results_eq(
  $$
    SELECT version_number, policy_type, lifecycle, effective_from
    FROM public.absence_policy_versions
    WHERE version_number = 1
  $$,
  $$ VALUES (1, 'provisional'::text, 'published'::text, DATE '2026-09-09') $$,
  'V1 is published provisional policy effective 2026-09-09'
);

SELECT results_eq(
  $$
    SELECT rule_key, assessment_status, reason_code
    FROM public.absence_policy_rules r
    JOIN public.absence_policy_versions v ON v.id = r.policy_version_id
    WHERE v.version_number = 1
    ORDER BY rule_key
  $$,
  $$
    VALUES
      ('accepted_notice','excused','accepted_notice'),
      ('actual_attendance','not_absent','actual_attendance'),
      ('approved_leave','excused','approved_leave'),
      ('leave_cancelled','unexcused','leave_cancelled'),
      ('leave_pending_review','pending_review','leave_pending_review'),
      ('leave_rejected','unexcused','leave_rejected'),
      ('leave_withdrawn','unexcused','leave_withdrawn'),
      ('no_notice','unexcused','no_notice'),
      ('notice_cancelled','unexcused','notice_cancelled'),
      ('notice_pending_review','pending_review','notice_pending_review'),
      ('notice_rejected','unexcused','notice_rejected'),
      ('notice_withdrawn','unexcused','notice_withdrawn'),
      ('published_day_off','not_applicable','published_day_off')
  $$,
  'V1 contains the locked classification rules'
);

-- Immutability assertions
SELECT throws_ok(
  $$
    UPDATE public.absence_policy_versions
    SET policy_name = 'Mutated Policy'
    WHERE version_number = 1
  $$,
  '55000',
  NULL,
  'Cannot update published absence policy version'
);

SELECT throws_ok(
  $$
    DELETE FROM public.absence_policy_versions
    WHERE version_number = 1
  $$,
  '55000',
  NULL,
  'Cannot delete published absence policy version'
);

SELECT throws_ok(
  $$
    UPDATE public.absence_policy_rules
    SET assessment_status = 'excused'
    WHERE rule_key = 'no_notice'
  $$,
  '55000',
  NULL,
  'Cannot mutate rules belonging to published policy'
);

SELECT throws_ok(
  $$
    DELETE FROM public.absence_policy_rules
    WHERE rule_key = 'no_notice'
  $$,
  '55000',
  NULL,
  'Cannot delete rules belonging to published policy'
);

SELECT throws_ok(
  $$
    INSERT INTO public.absence_policy_rules (policy_version_id, rule_key, assessment_status, reason_code, priority)
    SELECT id, 'extra_rule', 'unexcused', 'extra_rule', 999
    FROM public.absence_policy_versions
    WHERE version_number = 1
  $$,
  '55000',
  NULL,
  'Cannot insert rules into published policy'
);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.absence_policy_versions'::regclass), 'absence_policy_versions has RLS');

-- ============================================================================
-- Task 2: Assessment Resolver Tests
-- ============================================================================

-- Function existence and security attributes
SELECT ok(to_regprocedure('private.resolve_rider_absence_assessment(uuid,date,timestamp with time zone)') is not null, 'resolve_rider_absence_assessment exists');
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid = 'private.resolve_rider_absence_assessment(uuid,date,timestamp with time zone)'::regprocedure), 'resolver is SECURITY DEFINER');
SELECT ok((SELECT proconfig @> array['search_path=""'] FROM pg_proc WHERE oid = 'private.resolve_rider_absence_assessment(uuid,date,timestamp with time zone)'::regprocedure), 'resolver has empty search_path');
SELECT ok(NOT has_function_privilege('authenticated', 'private.resolve_rider_absence_assessment(uuid,date,timestamp with time zone)', 'EXECUTE'), 'resolver is private from authenticated');
SELECT ok(NOT has_function_privilege('anon', 'private.resolve_rider_absence_assessment(uuid,date,timestamp with time zone)', 'EXECUTE'), 'resolver is private from anon');

-- Set up test fixtures for assessment resolver matrix
CREATE TEMPORARY TABLE test_fix AS
SELECT
  'c9100000-0000-4000-8000-000000000099'::uuid AS rider_id,
  'a9100000-0000-4000-8000-000000000099'::uuid AS hub_id,
  (SELECT id FROM public.users WHERE role = 'admin'::public.user_role LIMIT 1) AS admin_id,
  'f9100000-0000-4000-8000-000000000099'::uuid AS rider_user_id,
  DATE '2026-09-10' AS base_date;

INSERT INTO public.hubs (id, name, latitude, longitude, attendance_radius_m)
SELECT hub_id, 'Absence Test Hub', 14.5995, 120.9842, 100
FROM test_fix;

INSERT INTO public.riders (id, hub_id, home_hub_id, name, mkb_id, email, status)
SELECT rider_id, hub_id, hub_id, 'Absence Test Rider', 'MKB-ABS-99', 'abs-rider-99@example.com', 'active'
FROM test_fix;

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT rider_user_id, 'abs-rider-99@example.com', clock_timestamp()
FROM test_fix;

INSERT INTO public.users (id, rider_id, full_name, email, role, employment_status, status)
SELECT rider_user_id, rider_id, 'Absence Test Rider', 'abs-rider-99@example.com', 'rider', 'active', 'active'
FROM test_fix;

-- Schedules
-- Day 1: Published Day Off
-- Days 2-16: Published Work
DO $$
DECLARE
  v_f test_fix%ROWTYPE;
BEGIN
  SELECT * INTO v_f FROM test_fix;

  INSERT INTO public.rider_schedules (
    id, rider_id, work_date, hub_id, day_kind, status, revision, created_by, updated_by, published_by, published_at
  ) VALUES (
    'a9100000-0000-4000-8000-000000000001'::uuid, v_f.rider_id, v_f.base_date + 1, v_f.hub_id,
    'day_off'::public.rider_schedule_day_kind, 'published'::public.rider_schedule_status, 1,
    v_f.admin_id, v_f.admin_id, v_f.admin_id, clock_timestamp()
  );

  FOR i IN 2..16 LOOP
    INSERT INTO public.rider_schedules (
      id, rider_id, work_date, hub_id, day_kind, status, revision, starts_at, ends_at, created_by, updated_by, published_by, published_at
    ) VALUES (
      ('a9100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
      v_f.rider_id, v_f.base_date + i, v_f.hub_id,
      'work'::public.rider_schedule_day_kind, 'published'::public.rider_schedule_status, 1,
      TIME '08:00', TIME '17:00', v_f.admin_id, v_f.admin_id, v_f.admin_id, clock_timestamp()
    );
  END LOOP;
END $$;

-- Absence requests
-- Day 1: Approved Leave on Published Day Off (precedence check)
-- Day 3: Approved Leave
-- Day 4: Accepted Notice
-- Day 5: Pending Leave
-- Day 6: Pending Notice
-- Day 7: Rejected Leave
-- Day 8: Rejected Notice
-- Day 9: Withdrawn Leave
-- Day 10: Withdrawn Notice
-- Day 11: Cancelled Leave (cancelled on base_date - 1 so cancellation takes effect)
-- Day 12: Cancelled Notice (cancelled on base_date - 1)
-- Day 14: Approved Leave + Clocks
-- Day 15: Accepted Notice + Clocks
DO $$
DECLARE
  v_f test_fix%ROWTYPE;
  v_cancel_time timestamptz;
BEGIN
  SELECT * INTO v_f FROM test_fix;
  v_cancel_time := ((v_f.base_date - 1)::timestamp + TIME '10:00') AT TIME ZONE 'Asia/Manila';

  -- Day 1: Approved Leave on Day Off
  INSERT INTO public.rider_absence_requests (
    id, rider_id, request_kind, start_date, end_date, hub_id, reason, submitted_by, submitted_at,
    status, revision, reviewed_by, reviewed_at, review_reason, request_key, updated_by
  ) VALUES (
    'b9100000-0000-4000-8000-000000000001'::uuid, v_f.rider_id, 'planned_leave',
    v_f.base_date + 1, v_f.base_date + 1, v_f.hub_id, 'Leave on day off', v_f.rider_user_id, clock_timestamp(),
    'approved', 2, v_f.admin_id, clock_timestamp(), 'approved', gen_random_uuid(), v_f.admin_id
  );

  -- Day 3: Approved Leave
  INSERT INTO public.rider_absence_requests (
    id, rider_id, request_kind, start_date, end_date, hub_id, reason, submitted_by, submitted_at,
    status, revision, reviewed_by, reviewed_at, review_reason, request_key, updated_by
  ) VALUES (
    'b9100000-0000-4000-8000-000000000003'::uuid, v_f.rider_id, 'planned_leave',
    v_f.base_date + 3, v_f.base_date + 3, v_f.hub_id, 'Planned vacation', v_f.rider_user_id, clock_timestamp(),
    'approved', 2, v_f.admin_id, clock_timestamp(), 'approved', gen_random_uuid(), v_f.admin_id
  );

  -- Day 4: Accepted Notice
  INSERT INTO public.rider_absence_requests (
    id, rider_id, request_kind, start_date, end_date, hub_id, reason, submitted_by, submitted_at,
    status, revision, reviewed_by, reviewed_at, review_reason, request_key, updated_by
  ) VALUES (
    'b9100000-0000-4000-8000-000000000004'::uuid, v_f.rider_id, 'absence_notice',
    v_f.base_date + 4, v_f.base_date + 4, v_f.hub_id, 'Emergency notice', v_f.rider_user_id, clock_timestamp(),
    'approved', 2, v_f.admin_id, clock_timestamp(), 'accepted', gen_random_uuid(), v_f.admin_id
  );

  -- Day 5: Pending Leave
  INSERT INTO public.rider_absence_requests (
    id, rider_id, request_kind, start_date, end_date, hub_id, reason, submitted_by, submitted_at,
    status, revision, request_key, updated_by
  ) VALUES (
    'b9100000-0000-4000-8000-000000000005'::uuid, v_f.rider_id, 'planned_leave',
    v_f.base_date + 5, v_f.base_date + 5, v_f.hub_id, 'Pending vacation', v_f.rider_user_id, clock_timestamp(),
    'pending', 1, gen_random_uuid(), v_f.rider_user_id
  );

  -- Day 6: Pending Notice
  INSERT INTO public.rider_absence_requests (
    id, rider_id, request_kind, start_date, end_date, hub_id, reason, submitted_by, submitted_at,
    status, revision, request_key, updated_by
  ) VALUES (
    'b9100000-0000-4000-8000-000000000006'::uuid, v_f.rider_id, 'absence_notice',
    v_f.base_date + 6, v_f.base_date + 6, v_f.hub_id, 'Pending notice', v_f.rider_user_id, clock_timestamp(),
    'pending', 1, gen_random_uuid(), v_f.rider_user_id
  );

  -- Day 7: Rejected Leave
  INSERT INTO public.rider_absence_requests (
    id, rider_id, request_kind, start_date, end_date, hub_id, reason, submitted_by, submitted_at,
    status, revision, reviewed_by, reviewed_at, review_reason, request_key, updated_by
  ) VALUES (
    'b9100000-0000-4000-8000-000000000007'::uuid, v_f.rider_id, 'planned_leave',
    v_f.base_date + 7, v_f.base_date + 7, v_f.hub_id, 'Rejected leave', v_f.rider_user_id, clock_timestamp(),
    'rejected', 2, v_f.admin_id, clock_timestamp(), 'denied', gen_random_uuid(), v_f.admin_id
  );

  -- Day 8: Rejected Notice
  INSERT INTO public.rider_absence_requests (
    id, rider_id, request_kind, start_date, end_date, hub_id, reason, submitted_by, submitted_at,
    status, revision, reviewed_by, reviewed_at, review_reason, request_key, updated_by
  ) VALUES (
    'b9100000-0000-4000-8000-000000000008'::uuid, v_f.rider_id, 'absence_notice',
    v_f.base_date + 8, v_f.base_date + 8, v_f.hub_id, 'Rejected notice', v_f.rider_user_id, clock_timestamp(),
    'rejected', 2, v_f.admin_id, clock_timestamp(), 'denied', gen_random_uuid(), v_f.admin_id
  );

  -- Day 9: Withdrawn Leave
  INSERT INTO public.rider_absence_requests (
    id, rider_id, request_kind, start_date, end_date, hub_id, reason, submitted_by, submitted_at,
    status, revision, withdrawn_by, withdrawn_at, withdrawal_reason, request_key, updated_by
  ) VALUES (
    'b9100000-0000-4000-8000-000000000009'::uuid, v_f.rider_id, 'planned_leave',
    v_f.base_date + 9, v_f.base_date + 9, v_f.hub_id, 'Withdrawn leave', v_f.rider_user_id, clock_timestamp(),
    'withdrawn', 2, v_f.rider_user_id, clock_timestamp(), 'withdrawn', gen_random_uuid(), v_f.rider_user_id
  );

  -- Day 10: Withdrawn Notice
  INSERT INTO public.rider_absence_requests (
    id, rider_id, request_kind, start_date, end_date, hub_id, reason, submitted_by, submitted_at,
    status, revision, withdrawn_by, withdrawn_at, withdrawal_reason, request_key, updated_by
  ) VALUES (
    'b9100000-0000-4000-8000-000000000010'::uuid, v_f.rider_id, 'absence_notice',
    v_f.base_date + 10, v_f.base_date + 10, v_f.hub_id, 'Withdrawn notice', v_f.rider_user_id, clock_timestamp(),
    'withdrawn', 2, v_f.rider_user_id, clock_timestamp(), 'withdrawn', gen_random_uuid(), v_f.rider_user_id
  );

  -- Day 11: Cancelled Leave (cancelled in past)
  INSERT INTO public.rider_absence_requests (
    id, rider_id, request_kind, start_date, end_date, hub_id, reason, submitted_by, submitted_at,
    status, revision, reviewed_by, reviewed_at, review_reason, cancelled_by, cancelled_at, cancellation_reason, request_key, updated_by
  ) VALUES (
    'b9100000-0000-4000-8000-000000000011'::uuid, v_f.rider_id, 'planned_leave',
    v_f.base_date + 11, v_f.base_date + 11, v_f.hub_id, 'Cancelled leave', v_f.rider_user_id, clock_timestamp(),
    'cancelled', 3, v_f.admin_id, clock_timestamp(), 'approved', v_f.admin_id, v_cancel_time, 'cancelled', gen_random_uuid(), v_f.admin_id
  );

  -- Day 12: Cancelled Notice (cancelled in past)
  INSERT INTO public.rider_absence_requests (
    id, rider_id, request_kind, start_date, end_date, hub_id, reason, submitted_by, submitted_at,
    status, revision, reviewed_by, reviewed_at, review_reason, cancelled_by, cancelled_at, cancellation_reason, request_key, updated_by
  ) VALUES (
    'b9100000-0000-4000-8000-000000000012'::uuid, v_f.rider_id, 'absence_notice',
    v_f.base_date + 12, v_f.base_date + 12, v_f.hub_id, 'Cancelled notice', v_f.rider_user_id, clock_timestamp(),
    'cancelled', 3, v_f.admin_id, clock_timestamp(), 'accepted', v_f.admin_id, v_cancel_time, 'cancelled', gen_random_uuid(), v_f.admin_id
  );

  -- Day 14: Approved Leave + Clocks
  INSERT INTO public.rider_absence_requests (
    id, rider_id, request_kind, start_date, end_date, hub_id, reason, submitted_by, submitted_at,
    status, revision, reviewed_by, reviewed_at, review_reason, request_key, updated_by
  ) VALUES (
    'b9100000-0000-4000-8000-000000000014'::uuid, v_f.rider_id, 'planned_leave',
    v_f.base_date + 14, v_f.base_date + 14, v_f.hub_id, 'Worked leave', v_f.rider_user_id, clock_timestamp(),
    'approved', 2, v_f.admin_id, clock_timestamp(), 'approved', gen_random_uuid(), v_f.admin_id
  );

  -- Day 15: Accepted Notice + Clocks
  INSERT INTO public.rider_absence_requests (
    id, rider_id, request_kind, start_date, end_date, hub_id, reason, submitted_by, submitted_at,
    status, revision, reviewed_by, reviewed_at, review_reason, request_key, updated_by
  ) VALUES (
    'b9100000-0000-4000-8000-000000000015'::uuid, v_f.rider_id, 'absence_notice',
    v_f.base_date + 15, v_f.base_date + 15, v_f.hub_id, 'Worked notice', v_f.rider_user_id, clock_timestamp(),
    'approved', 2, v_f.admin_id, clock_timestamp(), 'accepted', gen_random_uuid(), v_f.admin_id
  );
END $$;

-- Attendance logs
-- Day 13: Normal clock (08:00 to 17:00)
-- Day 14: Clock during approved leave
-- Day 15: Clock despite accepted notice (late at 09:00)
DO $$
DECLARE
  v_f test_fix%ROWTYPE;
BEGIN
  SELECT * INTO v_f FROM test_fix;

  -- Day 13
  INSERT INTO public.attendance_logs (
    id, rider_id, date, time_in, time_out, status, source
  ) VALUES (
    'e9100000-0000-4000-8000-000000000013'::uuid, v_f.rider_id, v_f.base_date + 13,
    ((v_f.base_date + 13)::timestamp + TIME '08:00') AT TIME ZONE 'Asia/Manila',
    ((v_f.base_date + 13)::timestamp + TIME '17:00') AT TIME ZONE 'Asia/Manila',
    'present'::public.attendance_status, 'face-scan'::public.attendance_source
  );

  -- Day 14
  INSERT INTO public.attendance_logs (
    id, rider_id, date, time_in, time_out, status, source
  ) VALUES (
    'e9100000-0000-4000-8000-000000000014'::uuid, v_f.rider_id, v_f.base_date + 14,
    ((v_f.base_date + 14)::timestamp + TIME '08:00') AT TIME ZONE 'Asia/Manila',
    ((v_f.base_date + 14)::timestamp + TIME '17:00') AT TIME ZONE 'Asia/Manila',
    'present'::public.attendance_status, 'face-scan'::public.attendance_source
  );

  -- Day 15
  INSERT INTO public.attendance_logs (
    id, rider_id, date, time_in, time_out, status, source
  ) VALUES (
    'e9100000-0000-4000-8000-000000000015'::uuid, v_f.rider_id, v_f.base_date + 15,
    ((v_f.base_date + 15)::timestamp + TIME '09:00') AT TIME ZONE 'Asia/Manila',
    null,
    'late'::public.attendance_status, 'face-scan'::public.attendance_source
  );
END $$;

-- Assessment matrix assertions
-- Helper function to assert resolver result
CREATE OR REPLACE FUNCTION pg_temp.assert_assessment(
  p_label text,
  p_offset integer,
  p_expected_status text,
  p_expected_reason text,
  p_as_of_time time DEFAULT TIME '18:00'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_f test_fix%ROWTYPE;
  v_res record;
  v_moment timestamptz;
BEGIN
  SELECT * INTO v_f FROM test_fix;
  v_moment := ((v_f.base_date + p_offset)::timestamp + p_as_of_time) AT TIME ZONE 'Asia/Manila';

  SELECT * INTO v_res
  FROM private.resolve_rider_absence_assessment(v_f.rider_id, v_f.base_date + p_offset, v_moment);

  PERFORM is(v_res.assessment_status, p_expected_status, p_label || ' status');
  PERFORM is(v_res.assessment_reason, p_expected_reason, p_label || ' reason');
END;
$$;

-- 1. Published Day Off (even with approved leave) -> not_applicable
SELECT pg_temp.assert_assessment('Published Day Off + Approved Leave', 1, 'not_applicable', 'published_day_off');

-- 2. Finalized Workday + No Notice -> unexcused
SELECT pg_temp.assert_assessment('Finalized No Notice', 2, 'unexcused', 'no_notice');

-- 3. Approved Leave -> excused
SELECT pg_temp.assert_assessment('Approved Leave', 3, 'excused', 'approved_leave');

-- 4. Accepted Notice -> excused
SELECT pg_temp.assert_assessment('Accepted Notice', 4, 'excused', 'accepted_notice');

-- 5. Pending Leave -> pending_review
SELECT pg_temp.assert_assessment('Pending Leave', 5, 'pending_review', 'leave_pending_review');

-- 6. Pending Notice -> pending_review
SELECT pg_temp.assert_assessment('Pending Notice', 6, 'pending_review', 'notice_pending_review');

-- 7. Rejected Leave -> unexcused
SELECT pg_temp.assert_assessment('Rejected Leave', 7, 'unexcused', 'leave_rejected');

-- 8. Rejected Notice -> unexcused
SELECT pg_temp.assert_assessment('Rejected Notice', 8, 'unexcused', 'notice_rejected');

-- 9. Withdrawn Leave -> unexcused
SELECT pg_temp.assert_assessment('Withdrawn Leave', 9, 'unexcused', 'leave_withdrawn');

-- 10. Withdrawn Notice -> unexcused
SELECT pg_temp.assert_assessment('Withdrawn Notice', 10, 'unexcused', 'notice_withdrawn');

-- 11. Cancelled Leave -> unexcused
SELECT pg_temp.assert_assessment('Cancelled Leave', 11, 'unexcused', 'leave_cancelled');

-- 12. Cancelled Notice -> unexcused
SELECT pg_temp.assert_assessment('Cancelled Notice', 12, 'unexcused', 'notice_cancelled');

-- 13. Actual Attendance -> not_absent
SELECT pg_temp.assert_assessment('Actual Attendance', 13, 'not_absent', 'actual_attendance');

-- Precedence checks: Actual clocks override Approved Leave & Accepted Notice
SELECT pg_temp.assert_assessment('Clocks override Approved Leave', 14, 'not_absent', 'actual_attendance');
SELECT pg_temp.assert_assessment('Clocks override Accepted Notice', 15, 'not_absent', 'actual_attendance');

-- Pre-finalization check: At 16:59 Manila time on the business date itself, workday without clocks is not unexcused
SELECT is(
  (SELECT assessment_status
   FROM private.resolve_rider_absence_assessment(
     (SELECT rider_id FROM test_fix),
     (SELECT base_date FROM test_fix) + 16,
     (((SELECT base_date FROM test_fix) + 16)::timestamp + TIME '16:59:59') AT TIME ZONE 'Asia/Manila'
   )),
  NULL,
  'Pre-finalization workday without clocks returns NULL assessment status'
);

-- Pre-policy date check: DATE '2026-09-08' is before policy effectivity (2026-09-09)
SELECT is(
  (SELECT assessment_status
   FROM private.resolve_rider_absence_assessment(
     (SELECT rider_id FROM test_fix),
     DATE '2026-09-08',
     (DATE '2026-09-08'::timestamp + TIME '18:00') AT TIME ZONE 'Asia/Manila'
   )),
  NULL,
  'Pre-policy date returns NULL assessment status'
);

SELECT is(
  (SELECT policy_version_id
   FROM private.resolve_rider_absence_assessment(
     (SELECT rider_id FROM test_fix),
     DATE '2026-09-08',
     (DATE '2026-09-08'::timestamp + TIME '18:00') AT TIME ZONE 'Asia/Manila'
   )),
  NULL,
  'Pre-policy date returns NULL policy_version_id'
);

-- Historical policy stability test: V1 vs V2
DO $$
DECLARE
  v_v2_id uuid := 'c9100000-0000-4000-8000-000000000002'::uuid;
BEGIN
  -- Insert draft V2
  INSERT INTO public.absence_policy_versions (
    id, version_number, policy_name, policy_type, lifecycle, effective_from, created_at, updated_at
  ) VALUES (
    v_v2_id, 2, 'MKB Absence Policy V2', 'provisional', 'draft', DATE '2026-10-01', clock_timestamp(), clock_timestamp()
  );

  -- Insert rules for V2: copy from V1 but change no_notice to excused
  INSERT INTO public.absence_policy_rules (policy_version_id, rule_key, assessment_status, reason_code, priority)
  SELECT v_v2_id, rule_key,
    CASE WHEN rule_key = 'no_notice' THEN 'excused' ELSE assessment_status END,
    reason_code, priority
  FROM public.absence_policy_rules
  WHERE policy_version_id = 'c9100000-0000-4000-8000-000000000001'::uuid;

  -- Transition V2 to published
  UPDATE public.absence_policy_versions
  SET lifecycle = 'published', published_at = clock_timestamp()
  WHERE id = v_v2_id;
END $$;

-- September date uses V1 (no_notice -> unexcused)
SELECT is(
  (SELECT assessment_status
   FROM private.resolve_rider_absence_assessment(
     (SELECT rider_id FROM test_fix),
     (SELECT base_date FROM test_fix) + 2,
     (((SELECT base_date FROM test_fix) + 2)::timestamp + TIME '18:00') AT TIME ZONE 'Asia/Manila'
   )),
  'unexcused',
  'September date resolves no_notice as unexcused under V1'
);

SELECT is(
  (SELECT policy_version_number
   FROM private.resolve_rider_absence_assessment(
     (SELECT rider_id FROM test_fix),
     (SELECT base_date FROM test_fix) + 2,
     (((SELECT base_date FROM test_fix) + 2)::timestamp + TIME '18:00') AT TIME ZONE 'Asia/Manila'
   )),
  1,
  'September date uses policy version 1'
);

-- October date uses V2 (no_notice -> excused)
SELECT is(
  (SELECT assessment_status
   FROM private.resolve_rider_absence_assessment(
     (SELECT rider_id FROM test_fix),
     DATE '2026-10-05',
     (DATE '2026-10-05'::timestamp + TIME '18:00') AT TIME ZONE 'Asia/Manila'
   )),
  'excused',
  'October date resolves no_notice as excused under V2'
);

SELECT is(
  (SELECT policy_version_number
   FROM private.resolve_rider_absence_assessment(
     (SELECT rider_id FROM test_fix),
     DATE '2026-10-05',
     (DATE '2026-10-05'::timestamp + TIME '18:00') AT TIME ZONE 'Asia/Manila'
   )),
  2,
  'October date uses policy version 2'
);

SELECT * FROM finish();
ROLLBACK;
