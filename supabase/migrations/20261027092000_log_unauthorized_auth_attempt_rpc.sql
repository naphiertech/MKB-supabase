-- Trigger and RPC to log unauthorized Google / OAuth login attempts and reject unlisted accounts.

CREATE OR REPLACE FUNCTION public.log_unauthorized_auth_attempt(
  p_email text,
  p_provider text DEFAULT 'google',
  p_reason text DEFAULT 'Unregistered account',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rider_id uuid;
  v_user_id uuid;
  v_actor_user_id uuid;
BEGIN
  -- Look up if user or rider exists by email
  SELECT id, rider_id INTO v_user_id, v_rider_id
  FROM public.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;

  -- Determine user_id to record (if user was temporarily authenticated in auth.users)
  v_actor_user_id := coalesce(auth.uid(), v_user_id);

  INSERT INTO public.activity_logs (
    user_id,
    rider_id,
    event_type,
    description,
    metadata,
    created_at
  ) VALUES (
    v_actor_user_id,
    v_rider_id,
    'unauthorized_login_attempt',
    format('Blocked %s login attempt for unregistered or unauthorized email: %s (%s)', coalesce(p_provider, 'OAuth'), coalesce(p_email, 'unknown'), coalesce(p_reason, 'Access denied')),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'attempted_email', p_email,
      'provider', p_provider,
      'reason', p_reason
    ),
    now()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.log_unauthorized_auth_attempt(text, text, text, jsonb) TO anon, authenticated;
