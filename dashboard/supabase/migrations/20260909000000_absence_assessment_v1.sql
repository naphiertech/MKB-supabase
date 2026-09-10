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
