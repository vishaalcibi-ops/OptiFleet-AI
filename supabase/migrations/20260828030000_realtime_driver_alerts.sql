-- Migration 20260828030000_realtime_driver_alerts.sql

-- A1. Add driver_alerts table to supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'driver_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE driver_alerts;
  END IF;
END $$;

-- Ensure driver_report_breakdown RPC unassigns shipment and flags maintenance lorry in a single transaction
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

  -- 1. Unassign linked shipment
  UPDATE shipments
  SET shipment_status = 'unassigned', status = 'unassigned',
      assigned_lorry_id = NULL, assigned_driver_name = NULL, updated_at = now()
  WHERE shipment_id = v_shipment_id;

  -- 2. Set lorry to maintenance
  UPDATE lorries
  SET status = 'maintenance', assignment_status = 'available',
      is_breakdown = true, breakdown_at = now(),
      current_shipment_id = NULL, updated_at = now()
  WHERE lorry_id = v_lorry_id;

  -- 3. Insert breakdown alert for realtime subscriber
  INSERT INTO driver_alerts (lorry_id, shipment_id, alert_type, message, resolved)
  VALUES (v_lorry_id, v_shipment_id, 'BREAKDOWN',
    v_lorry_id || ' reported a breakdown while carrying ' || v_shipment_id ||
    '. Shipment returned to optimizer queue.', false);

  -- 4. Expire tracking token
  UPDATE driver_tracking_links SET expired_at = now() WHERE tracking_token = p_token;
END;
$$;
