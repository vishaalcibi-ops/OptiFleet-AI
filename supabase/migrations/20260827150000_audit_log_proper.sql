/*
  OptiFleet AI — Proper Audit Log + GPS Location Fields

  1. audit_log table (new, separate from audit_logs) with full columns:
     id, created_at, entity_type, entity_id, action, old_value, new_value, actor, details
  2. GPS columns on lorries:
     last_location_update, speed_kmh, heading_deg
  3. RLS on audit_log (same anon+authenticated pattern)
*/

-- ============ AUDIT LOG (proper schema) ============
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz DEFAULT now(),
  entity_type text NOT NULL CHECK (entity_type IN ('lorry', 'shipment', 'optimization')),
  entity_id   text NOT NULL,
  action      text NOT NULL,
  old_value   jsonb,
  new_value   jsonb,
  actor       text NOT NULL DEFAULT 'user',
  details     text
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_audit_log" ON audit_log;
CREATE POLICY "anon_select_audit_log" ON audit_log FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_audit_log" ON audit_log;
CREATE POLICY "anon_insert_audit_log" ON audit_log FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_audit_log" ON audit_log;
CREATE POLICY "anon_update_audit_log" ON audit_log FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_audit_log" ON audit_log;
CREATE POLICY "anon_delete_audit_log" ON audit_log FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at   ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type  ON audit_log (entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id    ON audit_log (entity_id);

-- ============ GPS COLUMNS ON LORRIES ============
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS last_location_update timestamptz;
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS speed_kmh            numeric;
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS heading_deg          numeric;

-- ============ UPDATE LIFECYCLE TRIGGER ============
-- Allow active -> unassigned unconditionally when lorry ID and driver are null
CREATE OR REPLACE FUNCTION enforce_shipment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.shipment_status = 'active' AND NEW.shipment_status NOT IN ('active', 'delivered') THEN
    IF NEW.shipment_status = 'unassigned' AND NEW.assigned_lorry_id IS NULL AND NEW.assigned_driver_name IS NULL THEN
      -- Permitted: explicitly unassigned
      NULL;
    ELSE
      RAISE EXCEPTION 'Active shipment % must remain active until explicitly delivered, or properly unassigned', OLD.shipment_id;
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
