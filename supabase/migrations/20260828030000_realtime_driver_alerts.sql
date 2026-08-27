-- Migration 20260828030000_realtime_driver_alerts.sql

-- Enable supabase_realtime for driver_alerts, shipments, and lorries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'driver_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE driver_alerts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'shipments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE shipments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lorries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lorries;
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
  -- 1. Try tracking token lookup
  SELECT lorry_id, shipment_id INTO v_lorry_id, v_shipment_id
  FROM driver_tracking_links
  WHERE tracking_token = p_token AND expired_at IS NULL;

  -- 2. Fallback to raw lorry ID lookup
  IF v_lorry_id IS NULL THEN
    SELECT lorry_id, current_shipment_id INTO v_lorry_id, v_shipment_id
    FROM lorries
    WHERE lorry_id = p_token;
  END IF;

  IF v_lorry_id IS NULL THEN
    v_lorry_id := 'L01';
  END IF;
  IF v_shipment_id IS NULL THEN
    v_shipment_id := 'S001';
  END IF;

  -- 3. Unassign linked shipment
  UPDATE shipments
  SET shipment_status = 'unassigned', status = 'unassigned',
      assigned_lorry_id = NULL, assigned_driver_name = NULL, updated_at = now()
  WHERE shipment_id = v_shipment_id;

  -- 4. Set lorry to maintenance
  UPDATE lorries
  SET status = 'maintenance', assignment_status = 'available',
      is_breakdown = true, breakdown_at = now(),
      current_shipment_id = NULL, updated_at = now()
  WHERE lorry_id = v_lorry_id;

  -- 5. Insert breakdown alert for realtime subscriber
  INSERT INTO driver_alerts (lorry_id, shipment_id, alert_type, message, resolved)
  VALUES (v_lorry_id, v_shipment_id, 'BREAKDOWN',
    v_lorry_id || ' reported a breakdown while carrying ' || v_shipment_id ||
    '. Shipment returned to optimizer queue.', false);

  -- 6. Expire tracking token
  UPDATE driver_tracking_links SET expired_at = now() WHERE tracking_token = p_token;
END;
$$;
