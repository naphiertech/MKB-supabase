-- Create secure RPC function to allow users to update their own last_login timestamp
-- without exposing general UPDATE rights on public.users table (preventing role escalation).
CREATE OR REPLACE FUNCTION public.update_my_last_login()
RETURNS void AS $$
BEGIN
  UPDATE public.users
  SET last_login = now()
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
