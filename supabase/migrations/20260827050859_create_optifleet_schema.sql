/*
# OptiFleet AI — Core Schema

1. New Tables
- `lorries`: fleet vehicles with capacity, location, fuel efficiency, driver/status
- `shipments`: delivery requests with weight, volume, pickup/destination, deadline, priority
- `optimization_runs`: audit record of each optimization execution
- `assignments`: per-shipment assignment within a run (lorry, sequence, distance, fuel, cost, eta, deadline status)
- `rejection_reasons`: per lorry/shipment rejection with exact reason
- `optimization_settings`: configurable global settings (speed, loading/unloading/service time, fuel price, costs)

2. Security
- Single-tenant app (no auth). RLS enabled on all tables.
- Policies allow anon + authenticated full CRUD (data is intentionally shared/public for the hackathon demo).

3. Notes
- Uses numeric lat/lng for geographic distance calculations (Haversine fallback).
- `optimization_settings` is a singleton row (id=1) seeded with defaults.
- Seed data: 5 lorries + 10 shipments exercising varied capacities, fuel efficiencies, locations, priorities, deadlines, grouping opportunities, and at least one difficult shipment.
*/

-- ============ LORRIES ============
CREATE TABLE IF NOT EXISTS lorries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lorry_id text NOT NULL UNIQUE,
  maximum_weight_capacity_kg numeric NOT NULL CHECK (maximum_weight_capacity_kg > 0),
  maximum_volume_capacity_m3 numeric NOT NULL CHECK (maximum_volume_capacity_m3 > 0),
  current_location_name text NOT NULL,
  current_latitude double precision NOT NULL,
  current_longitude double precision NOT NULL,
  fuel_efficiency_km_per_litre numeric NOT NULL CHECK (fuel_efficiency_km_per_litre > 0),
  driver_available boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','maintenance')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE lorries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_lorries" ON lorries;
CREATE POLICY "anon_select_lorries" ON lorries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_lorries" ON lorries;
CREATE POLICY "anon_insert_lorries" ON lorries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_lorries" ON lorries;
CREATE POLICY "anon_update_lorries" ON lorries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_lorries" ON lorries;
CREATE POLICY "anon_delete_lorries" ON lorries FOR DELETE TO anon, authenticated USING (true);

-- ============ SHIPMENTS ============
CREATE TABLE IF NOT EXISTS shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id text NOT NULL UNIQUE,
  weight_kg numeric NOT NULL CHECK (weight_kg > 0),
  volume_m3 numeric NOT NULL CHECK (volume_m3 > 0),
  pickup_location_name text NOT NULL,
  pickup_latitude double precision NOT NULL,
  pickup_longitude double precision NOT NULL,
  destination_name text NOT NULL,
  destination_latitude double precision NOT NULL,
  destination_longitude double precision NOT NULL,
  delivery_deadline timestamptz NOT NULL,
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('URGENT','HIGH','MEDIUM','LOW')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','assigned','unassigned','delivered')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_shipments" ON shipments;
CREATE POLICY "anon_select_shipments" ON shipments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_shipments" ON shipments;
CREATE POLICY "anon_insert_shipments" ON shipments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_shipments" ON shipments;
CREATE POLICY "anon_update_shipments" ON shipments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_shipments" ON shipments;
CREATE POLICY "anon_delete_shipments" ON shipments FOR DELETE TO anon, authenticated USING (true);

-- ============ OPTIMIZATION RUNS ============
CREATE TABLE IF NOT EXISTS optimization_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  total_cost numeric NOT NULL DEFAULT 0,
  total_distance_km numeric NOT NULL DEFAULT 0,
  total_fuel_litres numeric NOT NULL DEFAULT 0,
  assigned_shipments integer NOT NULL DEFAULT 0,
  unassigned_shipments integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('running','completed','failed')),
  input_summary jsonb,
  before_summary jsonb
);

ALTER TABLE optimization_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_runs" ON optimization_runs;
CREATE POLICY "anon_select_runs" ON optimization_runs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_runs" ON optimization_runs;
CREATE POLICY "anon_insert_runs" ON optimization_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_runs" ON optimization_runs;
CREATE POLICY "anon_update_runs" ON optimization_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_runs" ON optimization_runs;
CREATE POLICY "anon_delete_runs" ON optimization_runs FOR DELETE TO anon, authenticated USING (true);

-- ============ ASSIGNMENTS ============
CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  optimization_run_id uuid REFERENCES optimization_runs(id) ON DELETE CASCADE,
  lorry_id text NOT NULL,
  shipment_id text NOT NULL,
  delivery_sequence integer NOT NULL,
  distance_km numeric NOT NULL DEFAULT 0,
  travel_time_minutes numeric NOT NULL DEFAULT 0,
  fuel_litres numeric NOT NULL DEFAULT 0,
  fuel_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  eta timestamptz,
  deadline timestamptz,
  deadline_status text NOT NULL DEFAULT 'ON_TIME' CHECK (deadline_status IN ('ON_TIME','LATE','AT_RISK')),
  group_id text,
  route_summary jsonb
);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_assignments" ON assignments;
CREATE POLICY "anon_select_assignments" ON assignments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_assignments" ON assignments;
CREATE POLICY "anon_insert_assignments" ON assignments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_assignments" ON assignments;
CREATE POLICY "anon_update_assignments" ON assignments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_assignments" ON assignments;
CREATE POLICY "anon_delete_assignments" ON assignments FOR DELETE TO anon, authenticated USING (true);

-- ============ REJECTION REASONS ============
CREATE TABLE IF NOT EXISTS rejection_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  optimization_run_id uuid REFERENCES optimization_runs(id) ON DELETE CASCADE,
  shipment_id text NOT NULL,
  lorry_id text NOT NULL,
  reason text NOT NULL,
  details text
);

ALTER TABLE rejection_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_rejections" ON rejection_reasons;
CREATE POLICY "anon_select_rejections" ON rejection_reasons FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_rejections" ON rejection_reasons;
CREATE POLICY "anon_insert_rejections" ON rejection_reasons FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_rejections" ON rejection_reasons;
CREATE POLICY "anon_update_rejections" ON rejection_reasons FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_rejections" ON rejection_reasons;
CREATE POLICY "anon_delete_rejections" ON rejection_reasons FOR DELETE TO anon, authenticated USING (true);

-- ============ OPTIMIZATION SETTINGS (singleton) ============
CREATE TABLE IF NOT EXISTS optimization_settings (
  id integer PRIMARY KEY DEFAULT 1,
  average_speed_kmh numeric NOT NULL DEFAULT 50 CHECK (average_speed_kmh > 0),
  loading_time_minutes numeric NOT NULL DEFAULT 30 CHECK (loading_time_minutes >= 0),
  unloading_time_minutes numeric NOT NULL DEFAULT 30 CHECK (unloading_time_minutes >= 0),
  service_time_minutes numeric NOT NULL DEFAULT 15 CHECK (service_time_minutes >= 0),
  fuel_price_per_litre numeric NOT NULL DEFAULT 95 CHECK (fuel_price_per_litre > 0),
  driver_cost_per_hour numeric NOT NULL DEFAULT 200 CHECK (driver_cost_per_hour >= 0),
  operating_cost_per_km numeric NOT NULL DEFAULT 12 CHECK (operating_cost_per_km >= 0),
  toll_cost_per_km numeric NOT NULL DEFAULT 2 CHECK (toll_cost_per_km >= 0),
  service_cost numeric NOT NULL DEFAULT 100 CHECK (service_cost >= 0),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT singleton_check CHECK (id = 1)
);

ALTER TABLE optimization_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_settings" ON optimization_settings;
CREATE POLICY "anon_select_settings" ON optimization_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_settings" ON optimization_settings;
CREATE POLICY "anon_insert_settings" ON optimization_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_settings" ON optimization_settings;
CREATE POLICY "anon_update_settings" ON optimization_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_settings" ON optimization_settings;
CREATE POLICY "anon_delete_settings" ON optimization_settings FOR DELETE TO anon, authenticated USING (true);

-- Seed singleton settings
INSERT INTO optimization_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- ============ SEED DATA ============
-- 5 lorries with varied capacities, fuel efficiencies, locations
INSERT INTO lorries (lorry_id, maximum_weight_capacity_kg, maximum_volume_capacity_m3, current_location_name, current_latitude, current_longitude, fuel_efficiency_km_per_litre, driver_available, status) VALUES
('L01', 5000, 30, 'Kangeyam', 11.0, 77.56, 4.0, true, 'active'),
('L02', 10000, 40, 'Tiruppur', 11.11, 77.23, 6.0, true, 'active'),
('L03', 10000, 40, 'Coimbatore', 11.0, 76.96, 8.0, true, 'active'),
('L04', 8000, 35, 'Erode', 11.34, 77.73, 5.0, true, 'active'),
('L05', 12000, 50, 'Salem', 11.66, 78.14, 7.0, false, 'maintenance')
ON CONFLICT (lorry_id) DO NOTHING;

-- 10 shipments with varied weights, volumes, locations, priorities, deadlines
INSERT INTO shipments (shipment_id, weight_kg, volume_m3, pickup_location_name, pickup_latitude, pickup_longitude, destination_name, destination_latitude, destination_longitude, delivery_deadline, priority, status) VALUES
('S001', 2000, 8, 'Kangeyam', 11.0, 77.56, 'Tiruppur', 11.11, 77.23, now() + interval '8 hours', 'HIGH', 'pending'),
('S002', 3000, 12, 'Kangeyam', 11.0, 77.56, 'Coimbatore', 11.0, 76.96, now() + interval '10 hours', 'MEDIUM', 'pending'),
('S003', 1500, 6, 'Tiruppur', 11.11, 77.23, 'Coimbatore', 11.0, 76.96, now() + interval '6 hours', 'URGENT', 'pending'),
('S004', 4000, 15, 'Erode', 11.34, 77.73, 'Salem', 11.66, 78.14, now() + interval '12 hours', 'MEDIUM', 'pending'),
('S005', 2500, 10, 'Coimbatore', 11.0, 76.96, 'Salem', 11.66, 78.14, now() + interval '14 hours', 'LOW', 'pending'),
('S006', 2000, 8, 'Tiruppur', 11.11, 77.23, 'Coimbatore', 11.0, 76.96, now() + interval '7 hours', 'HIGH', 'pending'),
('S007', 7000, 20, 'Kangeyam', 11.0, 77.56, 'Erode', 11.34, 77.73, now() + interval '9 hours', 'HIGH', 'pending'),
('S008', 1000, 4, 'Erode', 11.34, 77.73, 'Salem', 11.66, 78.14, now() + interval '5 hours', 'URGENT', 'pending'),
('S009', 3500, 14, 'Coimbatore', 11.0, 76.96, 'Kangeyam', 11.0, 77.56, now() + interval '11 hours', 'MEDIUM', 'pending'),
('S010', 500, 2, 'Salem', 11.66, 78.14, 'Erode', 11.34, 77.73, now() + interval '4 hours', 'URGENT', 'pending')
ON CONFLICT (shipment_id) DO NOTHING;