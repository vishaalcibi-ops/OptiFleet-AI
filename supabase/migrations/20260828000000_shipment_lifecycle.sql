-- Add locations table
CREATE TABLE IF NOT EXISTS locations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure lorries has driver_name
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS driver_name text;

-- Ensure assignments has driver_name
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS driver_name text;

-- Add new shipment tracking columns
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS shipment_status text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS assigned_lorry_id text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS assigned_driver_name text;

-- Backfill shipment_status from legacy status if missing
UPDATE shipments 
SET shipment_status = CASE 
  WHEN status = 'assigned' THEN 'active'
  WHEN status = 'delivered' THEN 'delivered'
  WHEN status = 'unassigned' THEN 'unassigned'
  ELSE 'pending'
END
WHERE shipment_status IS NULL;

-- Default driver names for demo lorries if missing
UPDATE lorries SET driver_name = 'Arun Kumar' WHERE lorry_id = 'L01' AND driver_name IS NULL;
UPDATE lorries SET driver_name = 'Suresh Raj' WHERE lorry_id = 'L02' AND driver_name IS NULL;
UPDATE lorries SET driver_name = 'Karthik M' WHERE lorry_id = 'L03' AND driver_name IS NULL;
UPDATE lorries SET driver_name = 'Prakash V' WHERE lorry_id = 'L04' AND driver_name IS NULL;
UPDATE lorries SET driver_name = 'Deepak S' WHERE lorry_id = 'L05' AND driver_name IS NULL;

-- Trigger to prevent silent reverting of active and delivered statuses
CREATE OR REPLACE FUNCTION enforce_shipment_lifecycle()
RETURNS TRIGGER AS $
BEGIN
  -- Delivered is terminal
  IF OLD.shipment_status = 'delivered' AND NEW.shipment_status != 'delivered' THEN
    RAISE EXCEPTION 'Cannot change status of a delivered shipment';
  END IF;
  
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shipment_lifecycle_trigger ON shipments;
CREATE TRIGGER shipment_lifecycle_trigger
  BEFORE UPDATE ON shipments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_shipment_lifecycle();
