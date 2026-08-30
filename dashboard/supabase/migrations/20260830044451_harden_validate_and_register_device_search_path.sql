-- Captured verbatim from the deployed function before this migration.
-- Only search_path pinning and declaration/cast type qualification change.
CREATE OR REPLACE FUNCTION public.validate_and_register_device(p_device_uuid text, p_fingerprint_hash text, p_device_name text, p_platform text, p_user_agent text, p_ip text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_user_id pg_catalog.uuid;
  v_user_role public.user_role;
  v_rider_id pg_catalog.uuid;
  v_existing_device public.user_devices%rowtype;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: No active authentication session.';
  END IF;

  SELECT role, rider_id INTO v_user_role, v_rider_id
  FROM public.users
  WHERE id = v_user_id;

  -- Non-rider accounts (Admin, HR, Payroll) bypass device locking
  IF v_user_role != 'rider'::public.user_role THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'bypassed_non_rider');
  END IF;

  -- Check if user already has an active trusted device
  SELECT * INTO v_existing_device
  FROM public.user_devices
  WHERE user_id = v_user_id AND status = 'trusted';

  -- Scenario 1: First login for this rider — Register current device as trusted
  IF v_existing_device.id IS NULL THEN
    INSERT INTO public.user_devices (
      user_id, rider_id, device_uuid, device_fingerprint_hash, device_name, platform, status, user_agent, ip_address
    ) VALUES (
      v_user_id, v_rider_id, p_device_uuid, p_fingerprint_hash, COALESCE(p_device_name, 'Unknown Device'), COALESCE(p_platform, 'web'), 'trusted', p_user_agent, p_ip
    );

    RETURN jsonb_build_object('allowed', true, 'reason', 'registered_first_device');
  END IF;

  -- Scenario 2: Login from the exact registered trusted device — Allow & Update timestamp
  IF v_existing_device.device_uuid = p_device_uuid OR v_existing_device.device_fingerprint_hash = p_fingerprint_hash THEN
    UPDATE public.user_devices
    SET last_used_at = now(),
        device_uuid = p_device_uuid,
        ip_address = COALESCE(p_ip, ip_address),
        user_agent = COALESCE(p_user_agent, user_agent)
    WHERE id = v_existing_device.id;

    RETURN jsonb_build_object('allowed', true, 'reason', 'trusted_device_match');
  END IF;

  -- Scenario 3: Login from a different/untrusted device — Block
  RETURN jsonb_build_object(
    'allowed', false,
    'reason', 'device_mismatch',
    'registered_device_name', v_existing_device.device_name,
    'registered_at', v_existing_device.registered_at
  );
END;
$function$;
