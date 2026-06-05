-- cache_rider_face_descriptor SQL Function (SECURITY DEFINER)
-- Allows riders (or admin/hr) to cache their 128-dimensional face descriptor to the database if not already set.

DROP FUNCTION IF EXISTS public.cache_rider_face_descriptor(UUID, FLOAT8[]);

CREATE OR REPLACE FUNCTION public.cache_rider_face_descriptor(
  p_rider_id UUID,
  p_descriptor jsonb
) RETURNS VOID SECURITY DEFINER AS $$
BEGIN
  IF (
    get_my_role() = 'admin'::user_role 
    OR get_my_role() = 'hr'::user_role 
    OR p_rider_id = get_my_rider_id()
  ) THEN
    UPDATE public.riders
    SET face_descriptor = p_descriptor,
        face_registered_at = now()
    WHERE id = p_rider_id AND face_descriptor IS NULL;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Cannot cache face descriptor for this rider profile.';
  END IF;
END;
$$ LANGUAGE plpgsql;
