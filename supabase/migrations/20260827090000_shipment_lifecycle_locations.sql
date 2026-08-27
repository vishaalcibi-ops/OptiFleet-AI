-- OptiFleet AI: persistent shipment lifecycle, optimizer assignment and shared locations.
-- Safe to run after the original schema migration.

ALTER TABLE lorries ADD COLUMN IF NOT EXISTS driver_name text;
UPDATE lorries SET driver_name = CASE lorry_id
  WHEN 'L01' THEN 'Arun Kumar'
  WHEN 'L02' THEN 'Suresh Raj'
  WHEN 'L03' THEN 'Karthik M'
  WHEN 'L04' THEN 'Prakash V'
  WHEN 'L05' THEN 'Maintenance Pool'
  ELSE driver_name
END WHERE driver_name IS NULL;

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS shipment_status text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS assigned_lorry_id text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS assigned_driver_name text;

UPDATE shipments
SET shipment_status = CASE
  WHEN status = 'assigned' THEN 'active'
  WHEN status = 'delivered' THEN 'delivered'
  WHEN status = 'unassigned' THEN 'unassigned'
  ELSE 'pending'
END
WHERE shipment_status IS NULL;

ALTER TABLE shipments ALTER COLUMN shipment_status SET DEFAULT 'pending';
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_shipment_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_shipment_status_check CHECK (shipment_status IN ('pending','active','delivered','unassigned'));

CREATE INDEX IF NOT EXISTS idx_shipments_shipment_status ON shipments(shipment_status);
CREATE INDEX IF NOT EXISTS idx_shipments_assigned_lorry ON shipments(assigned_lorry_id);

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS locations_name_lower_unique ON locations (lower(name));
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_locations" ON locations;
CREATE POLICY "anon_select_locations" ON locations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_locations" ON locations;
CREATE POLICY "anon_insert_locations" ON locations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_locations" ON locations;
CREATE POLICY "anon_update_locations" ON locations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_locations" ON locations;
CREATE POLICY "anon_delete_locations" ON locations FOR DELETE TO anon, authenticated USING (true);

INSERT INTO locations (name, latitude, longitude) VALUES
('Kangeyam', 11.0, 77.56),
('Tiruppur', 11.11, 77.23),
('Coimbatore', 11.0, 76.96),
('Erode', 11.34, 77.73),
('Salem', 11.66, 78.14)
ON CONFLICT DO NOTHING;

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS driver_name text;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_assignments_shipment ON assignments(shipment_id);
CREATE INDEX IF NOT EXISTS idx_assignments_run ON assignments(optimization_run_id);

-- Enforce the lifecycle in the database as well as the UI: active cannot silently
-- revert, and delivered is terminal. This prevents accidental client-side state changes.
CREATE OR REPLACE FUNCTION enforce_shipment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.shipment_status = 'active' AND NEW.shipment_status NOT IN ('active', 'delivered') THEN
    RAISE EXCEPTION 'Active shipment % must remain active until explicitly delivered', OLD.shipment_id;
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

DROP TRIGGER IF EXISTS trg_enforce_shipment_lifecycle ON shipments;
CREATE TRIGGER trg_enforce_shipment_lifecycle
BEFORE UPDATE ON shipments
FOR EACH ROW
EXECUTE FUNCTION enforce_shipment_lifecycle();


-- Live cross-module lorry assignment state.
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS assignment_status text DEFAULT 'available';
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS current_shipment_id text;
UPDATE lorries SET assignment_status = COALESCE(assignment_status, 'available');
ALTER TABLE lorries DROP CONSTRAINT IF EXISTS lorries_assignment_status_check;
ALTER TABLE lorries ADD CONSTRAINT lorries_assignment_status_check CHECK (assignment_status IN ('available','assigned'));
CREATE INDEX IF NOT EXISTS idx_lorries_assignment_status ON lorries(assignment_status);
CREATE INDEX IF NOT EXISTS idx_lorries_current_shipment ON lorries(current_shipment_id);
