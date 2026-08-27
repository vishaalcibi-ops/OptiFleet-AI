-- Migration 20260828020000_driver_tracking_tokens.sql
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS last_gps_latitude double precision;
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS last_gps_longitude double precision;
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS last_gps_updated_at timestamptz;

-- One row per active assignment; token is the public URL key.
CREATE TABLE IF NOT EXISTS driver_tracking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_token text NOT NULL UNIQUE,
  lorry_id text NOT NULL,
  shipment_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  expired_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_tracking_token ON driver_tracking_links(tracking_token);

ALTER TABLE driver_tracking_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_tracking_links" ON driver_tracking_links;
DROP POLICY IF EXISTS "anon_insert_tracking_links" ON driver_tracking_links;
DROP POLICY IF EXISTS "anon_update_tracking_links" ON driver_tracking_links;

CREATE POLICY "anon_select_tracking_links" ON driver_tracking_links FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_tracking_links" ON driver_tracking_links FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_tracking_links" ON driver_tracking_links FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Fleet-manager-facing alarm feed for breakdowns.
CREATE TABLE IF NOT EXISTS driver_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  lorry_id text NOT NULL,
  shipment_id text,
  alert_type text NOT NULL DEFAULT 'BREAKDOWN',
  message text NOT NULL,
  resolved boolean NOT NULL DEFAULT false
);
ALTER TABLE driver_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_alerts" ON driver_alerts;
DROP POLICY IF EXISTS "anon_insert_alerts" ON driver_alerts;
DROP POLICY IF EXISTS "anon_update_alerts" ON driver_alerts;

CREATE POLICY "anon_select_alerts" ON driver_alerts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_alerts" ON driver_alerts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_alerts" ON driver_alerts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Security Definer RPCs for Driver Actions

CREATE OR REPLACE FUNCTION driver_report_breakdown(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lorry_id text;
  v_shipment_id text;
BEGIN
  SELECT lorry_id, shipment_id INTO v_lorry_id, v_shipment_id
  FROM driver_tracking_links
  WHERE tracking_token = p_token AND expired_at IS NULL;

  IF v_lorry_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired tracking link';
  END IF;

  UPDATE shipments
  SET shipment_status = 'unassigned', status = 'unassigned',
      assigned_lorry_id = NULL, assigned_driver_name = NULL, updated_at = now()
  WHERE shipment_id = v_shipment_id AND shipment_status = 'active';

  UPDATE lorries
  SET status = 'maintenance', assignment_status = 'available',
      is_breakdown = true, breakdown_at = now(),
      current_shipment_id = NULL, updated_at = now()
  WHERE lorry_id = v_lorry_id;

  INSERT INTO driver_alerts (lorry_id, shipment_id, alert_type, message)
  VALUES (v_lorry_id, v_shipment_id, 'BREAKDOWN',
    v_lorry_id || ' reported a breakdown while carrying ' || v_shipment_id ||
    '. Shipment returned to optimizer queue.');

  UPDATE driver_tracking_links SET expired_at = now() WHERE tracking_token = p_token;
END;
$$;

CREATE OR REPLACE FUNCTION driver_mark_delivered(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lorry_id text;
  v_shipment_id text;
  v_dest_name text;
  v_dest_lat double precision;
  v_dest_lng double precision;
BEGIN
  SELECT lorry_id, shipment_id INTO v_lorry_id, v_shipment_id
  FROM driver_tracking_links
  WHERE tracking_token = p_token AND expired_at IS NULL;

  IF v_lorry_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired tracking link';
  END IF;

  SELECT destination_name, destination_latitude, destination_longitude
  INTO v_dest_name, v_dest_lat, v_dest_lng
  FROM shipments WHERE shipment_id = v_shipment_id;

  UPDATE shipments
  SET shipment_status = 'delivered', status = 'delivered', updated_at = now()
  WHERE shipment_id = v_shipment_id;

  UPDATE lorries
  SET current_location_name = v_dest_name,
      current_latitude = v_dest_lat,
      current_longitude = v_dest_lng,
      assignment_status = 'available',
      current_shipment_id = NULL,
      last_gps_latitude = v_dest_lat,
      last_gps_longitude = v_dest_lng,
      last_gps_updated_at = now(),
      updated_at = now()
  WHERE lorry_id = v_lorry_id;

  UPDATE driver_tracking_links SET expired_at = now() WHERE tracking_token = p_token;
END;
$$;

CREATE OR REPLACE FUNCTION driver_update_gps(p_token text, p_lat double precision, p_lng double precision)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lorry_id text;
BEGIN
  SELECT lorry_id INTO v_lorry_id FROM driver_tracking_links
  WHERE tracking_token = p_token AND expired_at IS NULL;
  IF v_lorry_id IS NULL THEN RETURN; END IF;

  UPDATE lorries
  SET last_gps_latitude = p_lat, last_gps_longitude = p_lng, last_gps_updated_at = now()
  WHERE lorry_id = v_lorry_id;
END;
$$;
