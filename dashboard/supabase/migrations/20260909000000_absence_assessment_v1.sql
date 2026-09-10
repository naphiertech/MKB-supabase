-- ============================================================================
-- Migration: 20260909000000_absence_assessment_v1.sql
-- Description: Absence Assessment V1 - Versioned Policy Storage & Seed
-- ============================================================================

-- 1. Absence Policy Versions Table
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

-- 2. Absence Policy Rules Table
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

-- 3. Immutability Trigger Function
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

-- 4. Attach trigger to absence_policy_versions
DROP TRIGGER IF EXISTS trg_prevent_published_policy_version_mutation ON public.absence_policy_versions;
CREATE TRIGGER trg_prevent_published_policy_version_mutation
BEFORE UPDATE OR DELETE ON public.absence_policy_versions
FOR EACH ROW
EXECUTE FUNCTION private.prevent_published_absence_policy_mutation();

-- 5. Seed Provisional MKB Absence Policy V1
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

-- 6. Attach trigger to absence_policy_rules AFTER seeding V1
DROP TRIGGER IF EXISTS trg_prevent_published_policy_rule_mutation ON public.absence_policy_rules;
CREATE TRIGGER trg_prevent_published_policy_rule_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.absence_policy_rules
FOR EACH ROW
EXECUTE FUNCTION private.prevent_published_absence_policy_mutation();

-- 7. Security: Enable RLS and Restrict Client Direct Mutations
ALTER TABLE public.absence_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_policy_rules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.absence_policy_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.absence_policy_rules FROM PUBLIC, anon, authenticated;

-- Policies for internal/service reads
CREATE POLICY absence_policy_versions_read_auth
  ON public.absence_policy_versions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY absence_policy_rules_read_auth
  ON public.absence_policy_rules
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON TABLE public.absence_policy_versions TO authenticated;
GRANT SELECT ON TABLE public.absence_policy_rules TO authenticated;

-- 8. Server-Authoritative Absence Assessment Resolver
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
