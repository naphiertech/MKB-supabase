-- ============================================================
-- SQL Migration: Backend-Driven Geofencing Validation & Alerts
-- ============================================================

-- 1. Helper function: Calculate Haversine distance in meters
CREATE OR REPLACE FUNCTION public.calculate_distance(
  lat1 float,
  lng1 float,
  lat2 float,
  lng2 float
)
RETURNS float AS $$
DECLARE
  R float := 6371000; -- Earth's radius in meters
  dLat float;
  dLng float;
  a float;
  c float;
BEGIN
  dLat := radians(lat2 - lat1);
  dLng := radians(lng2 - lng1);
  a := sin(dLat/2) * sin(dLat/2) + cos(radians(lat1)) * cos(radians(lat2)) * sin(dLng/2) * sin(dLng/2);
  c := 2 * asin(sqrt(a));
  RETURN R * c;
END;
$$ LANGUAGE plpgsql STABLE;


-- 2. Helper function: Ray-casting point-in-polygon checker
CREATE OR REPLACE FUNCTION public.is_point_in_polygon(
  p_lat float,
  p_lng float,
  polygon_coords jsonb
)
RETURNS boolean AS $$
DECLARE
  inside boolean := false;
  num_vertices int;
  i int;
  j int;
  lat_i float;
  lng_i float;
  lat_j float;
  lng_j float;
  is_intersect boolean;
BEGIN
  num_vertices := jsonb_array_length(polygon_coords);
  IF num_vertices < 3 THEN
    RETURN false;
  END IF;

  j := num_vertices - 1;
  FOR i IN 0 .. num_vertices - 1 LOOP
    lat_i := (polygon_coords->i->>0)::float;
    lng_i := (polygon_coords->i->>1)::float;
    lat_j := (polygon_coords->j->>0)::float;
    lng_j := (polygon_coords->j->>1)::float;

    is_intersect := ((lng_i > p_lng) != (lng_j > p_lng))
      AND (p_lat < (lat_j - lat_i) * (p_lng - lng_i) / (lng_j - lng_i) + lat_i);
    
    IF is_intersect THEN
      inside := NOT inside;
    END IF;
    j := i;
  END LOOP;
  RETURN inside;
END;
$$ LANGUAGE plpgsql STABLE;


-- 3. Core Trigger Function: Validate geofence, update status, create violations/notifications/logs
CREATE OR REPLACE FUNCTION public.process_rider_location_geofence()
RETURNS TRIGGER AS $$
DECLARE
  r_status rider_status;
  r_zone_id uuid;
  r_name text;
  
  -- Active clock-in check
  active_log_id uuid;
  
  -- Zone attributes
  z_name text;
  z_status zone_status;
  z_type text;
  z_lat float;
  z_lng float;
  z_radius int;
  z_poly_coords jsonb;
  
  -- Calculation states
  is_inside boolean := true;
  calculated_status rider_status;
  v_id uuid;
BEGIN
  -- Fetch current rider details
  SELECT status, zone_id, name INTO r_status, r_zone_id, r_name 
  FROM public.riders WHERE id = NEW.rider_id;
  
  -- Check if rider is clocked in today without being clocked out
  SELECT id INTO active_log_id 
  FROM public.attendance_logs 
  WHERE rider_id = NEW.rider_id 
    AND date = CURRENT_DATE 
    AND time_in IS NOT NULL 
    AND time_out IS NULL;
    
  -- Safeguard: If the rider is not clocked in, keep them offline and skip updates
  IF active_log_id IS NULL THEN
    NEW.status := 'offline';
    IF r_status != 'offline' THEN
      UPDATE public.riders 
      SET status = 'offline', 
          lat = NEW.lat, 
          lng = NEW.lng, 
          last_ping = NEW.recorded_at 
      WHERE id = NEW.rider_id;
    END IF;
    RETURN NEW;
  END IF;
  
  -- If rider has no assigned zone, they are automatically considered inside/active
  IF r_zone_id IS NULL THEN
    calculated_status := 'active';
  ELSE
    -- Fetch zone parameters
    SELECT name, status, zone_type, lat, lng, radius, polygon_coordinates 
    INTO z_name, z_status, z_type, z_lat, z_lng, z_radius, z_poly_coords 
    FROM public.zones WHERE id = r_zone_id;
    
    -- If zone is inactive, treat as active
    IF z_status IS DISTINCT FROM 'active' THEN
      calculated_status := 'active';
    ELSE
      -- Calculate position relative to zone boundary
      IF z_type = 'polygon' AND z_poly_coords IS NOT NULL THEN
        is_inside := public.is_point_in_polygon(NEW.lat, NEW.lng, z_poly_coords);
      ELSE
        is_inside := public.calculate_distance(NEW.lat, NEW.lng, z_lat, z_lng) <= z_radius;
      END IF;
      
      IF is_inside THEN
        calculated_status := 'active';
      ELSE
        calculated_status := 'violation';
      END IF;
    END IF;
  END IF;

  -- Set status on the new rider_location record
  NEW.status := calculated_status;
  
  -- Update riders status, coordinates, last ping
  UPDATE public.riders 
  SET status = calculated_status, 
      lat = NEW.lat, 
      lng = NEW.lng, 
      last_ping = NEW.recorded_at 
  WHERE id = NEW.rider_id;
  
  -- Geofence Transition logic:
  
  -- 1. Exited Zone (Active -> Violation)
  IF calculated_status = 'violation' AND r_status IS DISTINCT FROM 'violation' THEN
    -- Log violation
    INSERT INTO public.violations (rider_id, zone_id, zone_name, lat, lng, type, read, resolved)
    VALUES (NEW.rider_id, r_zone_id, z_name, NEW.lat, NEW.lng, 'boundary_exit', false, false)
    RETURNING id INTO v_id;
    
    -- Log system notification
    INSERT INTO public.notifications (type, title, message, rider_id, violation_id, read, target_roles)
    VALUES (
      'violation',
      'Geofence Exit Breach',
      'Rider ' || r_name || ' has breached the boundary of zone ' || z_name,
      NEW.rider_id,
      v_id,
      false,
      ARRAY['admin'::user_role, 'hr'::user_role]
    );
    
    -- Log activity
    INSERT INTO public.activity_logs (user_id, rider_id, event_type, description, metadata)
    VALUES (
      NULL,
      NEW.rider_id,
      'geofence_exit',
      'Rider exited zone ' || z_name || '.',
      jsonb_build_object('lat', NEW.lat, 'lng', NEW.lng, 'zone_id', r_zone_id, 'zone_name', z_name)
    );
  END IF;
  
  -- 2. Returned to Zone (Violation -> Active)
  IF calculated_status = 'active' AND r_status = 'violation' THEN
    -- Resolve active violations
    UPDATE public.violations 
    SET resolved = true 
    WHERE rider_id = NEW.rider_id 
      AND zone_id = r_zone_id 
      AND resolved = false;
      
    -- Log activity
    INSERT INTO public.activity_logs (user_id, rider_id, event_type, description, metadata)
    VALUES (
      NULL,
      NEW.rider_id,
      'geofence_enter',
      'Rider returned to zone ' || z_name || '.',
      jsonb_build_object('lat', NEW.lat, 'lng', NEW.lng, 'zone_id', r_zone_id, 'zone_name', z_name)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Create trigger on rider_locations
DROP TRIGGER IF EXISTS trg_process_rider_location_geofence ON public.rider_locations;
CREATE TRIGGER trg_process_rider_location_geofence
  BEFORE INSERT ON public.rider_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.process_rider_location_geofence();
