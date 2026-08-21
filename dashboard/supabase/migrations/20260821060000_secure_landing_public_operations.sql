-- Migration: 20260821060000_secure_landing_public_operations.sql
-- Description: Hardens the public interface for the Landing page by exposing only minimal sanitized
-- columns for active Hubs and active Geofence Zones via explicit security_barrier views,
-- while completely revoking direct access to the operational base tables from the anon role.

BEGIN;

-- 1. Drop temporary public policies from base tables if present
DROP POLICY IF EXISTS hubs_public_select ON public.hubs;
DROP POLICY IF EXISTS zones_public_select ON public.zones;

-- 2. Revoke all privileges on operational base tables from anon
REVOKE ALL ON public.hubs FROM anon;
REVOKE ALL ON public.zones FROM anon;

-- 3. Create minimal-column, read-only public views with security_barrier
DROP VIEW IF EXISTS public.public_hubs CASCADE;
DROP VIEW IF EXISTS public.public_zones CASCADE;

CREATE VIEW public.public_hubs 
WITH (security_barrier = true) AS
SELECT 
  id,
  name,
  description
FROM public.hubs
WHERE active = true;

CREATE VIEW public.public_zones 
WITH (security_barrier = true) AS
SELECT 
  id,
  hub_id,
  name,
  zone_type,
  lat,
  lng,
  radius,
  polygon_coordinates,
  color
FROM public.zones
WHERE status = 'active'::zone_status;

-- 4. Set explicit ownership and permissions
ALTER VIEW public.public_hubs OWNER TO postgres;
ALTER VIEW public.public_zones OWNER TO postgres;

REVOKE ALL ON public.public_hubs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.public_zones FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.public_hubs TO anon, authenticated;
GRANT SELECT ON public.public_zones TO anon, authenticated;

COMMIT;
