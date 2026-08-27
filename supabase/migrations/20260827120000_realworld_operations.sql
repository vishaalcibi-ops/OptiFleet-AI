/*
  OptiFleet AI — Real-World Operations Extension Migration
  
  Adds:
  1. audit_logs table for lorry-maintenance unassignment tracking
  2. earliest_delivery_time on shipments (delivery time window)
  3. max_driving_hours_per_day on lorries (driver working-hour limit)
  4. sla_penalty_per_late_shipment on optimization_settings
  5. split_index, split_total, split_portion_weight_kg, split_portion_volume_m3 on assignments
  6. Updated lifecycle trigger to allow active → unassigned from maintenance
  7. Lorry status change trigger for auto-reassignment
*/

-- ============ AUDIT LOGS ============
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  event_type text NOT NULL,
  message text NOT NULL,
  details jsonb
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_audit_logs" ON audit_logs;
CREATE POLICY "anon_select_audit_logs" ON audit_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_audit_logs" ON audit_logs;
CREATE POLICY "anon_insert_audit_logs" ON audit_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ============ SHIPMENTS: earliest_delivery_time ============
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS earliest_delivery_time timestamptz;

-- ============ LORRIES: max_driving_hours_per_day ============
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS max_driving_hours_per_day numeric NOT NULL DEFAULT 9;

-- ============ OPTIMIZATION SETTINGS: SLA penalty ============
ALTER TABLE optimization_settings ADD COLUMN IF NOT EXISTS sla_penalty_per_late_shipment numeric NOT NULL DEFAULT 500;

-- ============ ASSIGNMENTS: split shipment fields ============
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS split_index integer;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS split_total integer;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS split_portion_weight_kg numeric;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS split_portion_volume_m3 numeric;

-- ============ UPDATED LIFECYCLE TRIGGER ============
-- Allow active → unassigned ONLY when triggered by a lorry maintenance/inactive event.
-- We add a session variable check: if 'optifleet.lorry_maintenance_unassign' is set to 'true',
-- allow active → unassigned. Otherwise, enforce the original rule.
CREATE OR REPLACE FUNCTION enforce_shipment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.shipment_status = 'active' AND NEW.shipment_status NOT IN ('active', 'delivered') THEN
    -- Allow active → unassigned when triggered by lorry maintenance
    IF NEW.shipment_status = 'unassigned' AND current_setting('optifleet.lorry_maintenance_unassign', true) = 'true' THEN
      -- Permitted: lorry went to maintenance/inactive
      NULL;
    ELSE
      RAISE EXCEPTION 'Active shipment % must remain active until explicitly delivered', OLD.shipment_id;
    END IF;
  END IF;

  IF OLD.shipment_status = 'delivered' AND NEW.shipment_status <> 'delivered' THEN
    RAISE EXCEPTION 'Delivered shipment % cannot be reopened', OLD.shipment_id;
  END IF;

  IF NEW.shipment_status = 'active' AND NEW.assigned_lorry_id IS NULL THEN
    RAISE EXCEPTION 'An active shipment must have an optimizer-assigned lorry';
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============ LORRY STATUS CHANGE TRIGGER ============
-- When a lorry goes to maintenance/inactive, auto-unassign its active shipments
CREATE OR REPLACE FUNCTION on_lorry_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_shipment RECORD;
BEGIN
  -- Only fire when status changes TO maintenance or inactive
  IF NEW.status IN ('maintenance', 'inactive') AND OLD.status <> NEW.status THEN
    -- Set session variable to bypass lifecycle trigger
    PERFORM set_config('optifleet.lorry_maintenance_unassign', 'true', true);

    FOR affected_shipment IN
      SELECT id, shipment_id FROM shipments
      WHERE assigned_lorry_id = NEW.lorry_id
        AND shipment_status = 'active'
    LOOP
      -- Unassign the shipment
      UPDATE shipments
      SET shipment_status = 'unassigned',
          status = 'unassigned',
          assigned_lorry_id = NULL,
          assigned_driver_name = NULL,
          updated_at = now()
      WHERE id = affected_shipment.id;

      -- Create audit log entry
      INSERT INTO audit_logs (event_type, message, details)
      VALUES (
        'lorry_maintenance_unassign',
        NEW.lorry_id || ' marked ' || NEW.status || '; shipment ' || affected_shipment.shipment_id || ' unassigned and returned to optimizer queue.',
        jsonb_build_object('lorry_id', NEW.lorry_id, 'shipment_id', affected_shipment.shipment_id, 'new_lorry_status', NEW.status)
      );
    END LOOP;

    -- Also release the lorry's assignment status
    NEW.assignment_status = 'available';
    NEW.current_shipment_id = NULL;
    NEW.driver_available = false; -- driver unavailable since lorry is in maintenance

    -- Reset session variable
    PERFORM set_config('optifleet.lorry_maintenance_unassign', 'false', true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_lorry_status_change ON lorries;
CREATE TRIGGER trg_on_lorry_status_change
BEFORE UPDATE ON lorries
FOR EACH ROW
EXECUTE FUNCTION on_lorry_status_change();

-- ============ SEED DATA (idempotent) ============
-- Only insert if tables are empty, so this never duplicates on re-run.
-- Uses a DO block to check row counts.

DO $$
BEGIN
  -- Seed lorries only if none exist
  IF NOT EXISTS (SELECT 1 FROM lorries LIMIT 1) THEN
    INSERT INTO lorries (lorry_id, maximum_weight_capacity_kg, maximum_volume_capacity_m3, current_location_name, current_latitude, current_longitude, fuel_efficiency_km_per_litre, driver_available, driver_name, status, max_driving_hours_per_day) VALUES
    ('L01', 5000, 30, 'Kangeyam', 11.0, 77.56, 4.0, true, 'Arun Kumar', 'active', 9),
    ('L02', 10000, 40, 'Tiruppur', 11.11, 77.23, 6.0, true, 'Suresh Raj', 'active', 10),
    ('L03', 10000, 40, 'Coimbatore', 11.0, 76.96, 8.0, true, 'Karthik M', 'active', 9),
    ('L04', 8000, 35, 'Erode', 11.34, 77.73, 5.0, true, 'Prakash V', 'active', 8),
    ('L05', 12000, 50, 'Salem', 11.66, 78.14, 7.0, true, 'Deepak S', 'active', 9);
  END IF;

  -- Seed shipments only if none exist
  IF NOT EXISTS (SELECT 1 FROM shipments LIMIT 1) THEN
    INSERT INTO shipments (shipment_id, weight_kg, volume_m3, pickup_location_name, pickup_latitude, pickup_longitude, destination_name, destination_latitude, destination_longitude, delivery_deadline, earliest_delivery_time, priority, status, shipment_status) VALUES
    -- URGENT shipments with tight deadlines (test urgency-over-priority)
    ('S001', 2000, 8, 'Kangeyam', 11.0, 77.56, 'Tiruppur', 11.11, 77.23, now() + interval '2 hours', now() + interval '1 hour', 'URGENT', 'pending', 'pending'),
    ('S002', 1500, 6, 'Tiruppur', 11.11, 77.23, 'Coimbatore', 11.0, 76.96, now() + interval '3 hours', NULL, 'URGENT', 'pending', 'pending'),
    -- Same destination shipments (test grouping)
    ('S003', 3000, 12, 'Kangeyam', 11.0, 77.56, 'Coimbatore', 11.0, 76.96, now() + interval '10 hours', NULL, 'HIGH', 'pending', 'pending'),
    ('S004', 2500, 10, 'Tiruppur', 11.11, 77.23, 'Coimbatore', 11.0, 76.96, now() + interval '12 hours', now() + interval '8 hours', 'MEDIUM', 'pending', 'pending'),
    -- Oversized shipment for split logic (exceeds any single lorry: max is 12000 kg / 50 m³)
    ('S005', 18000, 65, 'Coimbatore', 11.0, 76.96, 'Salem', 11.66, 78.14, now() + interval '24 hours', NULL, 'HIGH', 'pending', 'pending'),
    -- Standard shipments
    ('S006', 4000, 15, 'Erode', 11.34, 77.73, 'Salem', 11.66, 78.14, now() + interval '8 hours', now() + interval '5 hours', 'MEDIUM', 'pending', 'pending'),
    ('S007', 7000, 20, 'Kangeyam', 11.0, 77.56, 'Erode', 11.34, 77.73, now() + interval '9 hours', NULL, 'HIGH', 'pending', 'pending'),
    -- Long deadline shipments
    ('S008', 1000, 4, 'Salem', 11.66, 78.14, 'Erode', 11.34, 77.73, now() + interval '4 days', NULL, 'LOW', 'pending', 'pending'),
    ('S009', 3500, 14, 'Coimbatore', 11.0, 76.96, 'Kangeyam', 11.0, 77.56, now() + interval '6 hours', now() + interval '3 hours', 'HIGH', 'pending', 'pending'),
    -- Chennai → Erode for backhaul test
    ('S010', 500, 2, 'Tiruppur', 11.11, 77.23, 'Erode', 11.34, 77.73, now() + interval '5 hours', NULL, 'URGENT', 'pending', 'pending');
  END IF;

  -- Seed locations only if none exist
  IF NOT EXISTS (SELECT 1 FROM locations LIMIT 1) THEN
    INSERT INTO locations (name, latitude, longitude) VALUES
    ('Kangeyam', 11.0, 77.56),
    ('Tiruppur', 11.11, 77.23),
    ('Coimbatore', 11.0, 76.96),
    ('Erode', 11.34, 77.73),
    ('Salem', 11.66, 78.14);
  END IF;
END;
$$;
