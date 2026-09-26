-- ============================================================
-- SQL Migration: Payroll Workflow Security & RLS Updates
-- ============================================================

-- 1. Update Submittor Visibility Policy on users table
-- Allow Admin and HR to read all user profiles (needed for submitted_by joins)
DROP POLICY IF EXISTS "Admin can read all users" ON users;
CREATE POLICY "Admin and HR can read all users" ON users
  FOR SELECT
  USING (get_my_role() = ANY (ARRAY['admin'::user_role, 'hr'::user_role]));


-- 2. Define Clean Role-Based Update Policies on payroll_records table
-- Drop old broad update policy
DROP POLICY IF EXISTS "Payroll and Admin can update payroll" ON payroll_records;
DROP POLICY IF EXISTS "Payroll update policy" ON payroll_records;
DROP POLICY IF EXISTS "HR update policy" ON payroll_records;
DROP POLICY IF EXISTS "Admin update policy" ON payroll_records;

-- Grant UPDATE privilege based strictly on Role (Logic validation is delegated to the trigger)
CREATE POLICY "Admin update policy" ON payroll_records
  FOR UPDATE USING (get_my_role() = 'admin'::user_role);

CREATE POLICY "Payroll update policy" ON payroll_records
  FOR UPDATE USING (get_my_role() = 'payroll'::user_role);

CREATE POLICY "HR update policy" ON payroll_records
  FOR UPDATE USING (get_my_role() = 'hr'::user_role);


-- 3. Create Constraints & Workflow Validator Trigger Function
CREATE OR REPLACE FUNCTION enforce_payroll_workflow_constraints()
RETURNS TRIGGER AS $$
DECLARE
  current_user_role user_role;
BEGIN
  -- Fetch current user's role from SECURITY DEFINER context
  current_user_role := get_my_role();

  -- 3.1 Role Authorization Checks for Status Changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Approve transition
    IF NEW.status = 'approved'::payroll_status AND current_user_role NOT IN ('admin'::user_role, 'hr'::user_role) THEN
      RAISE EXCEPTION 'Only HR or Admin can approve payroll.';
    END IF;

    -- Reject transition
    IF NEW.status = 'rejected'::payroll_status AND current_user_role NOT IN ('admin'::user_role, 'hr'::user_role) THEN
      RAISE EXCEPTION 'Only HR or Admin can reject payroll.';
    END IF;

    -- Return for revision (transition to draft)
    IF NEW.status = 'draft'::payroll_status AND OLD.status = 'pending'::payroll_status AND current_user_role NOT IN ('admin'::user_role, 'hr'::user_role) THEN
      RAISE EXCEPTION 'Only HR or Admin can return payroll for revision.';
    END IF;

    -- Paid transition
    IF NEW.status = 'paid'::payroll_status AND current_user_role != 'admin'::user_role THEN
      RAISE EXCEPTION 'Only Admin can mark payroll as Paid.';
    END IF;

    -- Submitting transition
    IF NEW.status = 'pending'::payroll_status AND current_user_role NOT IN ('admin'::user_role, 'payroll'::user_role) THEN
      RAISE EXCEPTION 'Only Payroll Officer or Admin can submit payroll for approval.';
    END IF;
  END IF;

  -- 3.2 Modify Protection based on Record Status
  -- Only Payroll Officer and Admin can edit Draft or Rejected records
  IF current_user_role = 'hr'::user_role AND (OLD.status = 'draft'::payroll_status OR OLD.status = 'rejected'::payroll_status) THEN
    RAISE EXCEPTION 'HR cannot edit payroll records in Draft or Rejected status.';
  END IF;

  -- Payroll Officer can ONLY edit when OLD status is draft or rejected
  IF current_user_role = 'payroll'::user_role AND OLD.status NOT IN ('draft'::payroll_status, 'rejected'::payroll_status) THEN
    RAISE EXCEPTION 'Payroll Officer can only edit payroll records in Draft or Rejected status.';
  END IF;

  -- Protect Approved records from modifications (except status change to Paid by Admin)
  IF OLD.status = 'approved'::payroll_status AND NEW.status != 'paid'::payroll_status THEN
    RAISE EXCEPTION 'Payroll records in Approved status cannot be modified.';
  END IF;

  -- Protect Paid records from modifications
  IF OLD.status = 'paid'::payroll_status THEN
    RAISE EXCEPTION 'Payroll records in Paid status cannot be modified.';
  END IF;

  -- 3.3 HR Immutability Guard: HR cannot modify financial or calculation columns
  IF current_user_role = 'hr'::user_role THEN
    IF NEW.total_parcels IS DISTINCT FROM OLD.total_parcels OR
       NEW.rate_per_parcel IS DISTINCT FROM OLD.rate_per_parcel OR
       NEW.gross_pay IS DISTINCT FROM OLD.gross_pay OR
       NEW.other_earnings IS DISTINCT FROM OLD.other_earnings OR
       NEW.fm_pickup_count IS DISTINCT FROM OLD.fm_pickup_count OR
       NEW.deductions IS DISTINCT FROM OLD.deductions OR
       NEW.late_onhold IS DISTINCT FROM OLD.late_onhold OR
       NEW.late_remittance IS DISTINCT FROM OLD.late_remittance OR
       NEW.rider_id IS DISTINCT FROM OLD.rider_id OR
       NEW.cutoff_start IS DISTINCT FROM OLD.cutoff_start OR
       NEW.cutoff_end IS DISTINCT FROM OLD.cutoff_end 
    THEN
      RAISE EXCEPTION 'HR cannot modify payroll computations or adjustments.';
    END IF;
  END IF;

  -- 3.4 State Machine Transition Rules
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (
      (OLD.status = 'draft'::payroll_status AND NEW.status = 'pending'::payroll_status) OR
      (OLD.status = 'rejected'::payroll_status AND NEW.status = 'pending'::payroll_status) OR
      (OLD.status = 'pending'::payroll_status AND NEW.status = 'approved'::payroll_status) OR
      (OLD.status = 'pending'::payroll_status AND NEW.status = 'rejected'::payroll_status) OR
      (OLD.status = 'pending'::payroll_status AND NEW.status = 'draft'::payroll_status) OR
      (OLD.status = 'approved'::payroll_status AND NEW.status = 'paid'::payroll_status)
    ) THEN
      RAISE EXCEPTION 'Invalid status transition: % → %.', initcap(OLD.status::text), initcap(NEW.status::text);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Bind Trigger to Table
DROP TRIGGER IF EXISTS trg_enforce_payroll_workflow_constraints ON payroll_records;
CREATE TRIGGER trg_enforce_payroll_workflow_constraints
  BEFORE UPDATE ON payroll_records
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payroll_workflow_constraints();


-- 5. Define Select Policy for Riders on payroll_records table
-- Allow riders to only view their own approved or paid records
DROP POLICY IF EXISTS "Riders can read own approved or paid payroll" ON payroll_records;
CREATE POLICY "Riders can read own approved or paid payroll" ON payroll_records
  FOR SELECT
  USING (
    get_my_role() = 'rider'::user_role 
    AND rider_id = (SELECT rider_id FROM users WHERE id = auth.uid())
    AND status IN ('approved'::payroll_status, 'paid'::payroll_status)
  );

