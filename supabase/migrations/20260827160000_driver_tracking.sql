-- ============ DRIVER TRACKING COLUMNS ============
-- Ensure last_location_update exists on lorries for no-install GPS freshness tracking
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS last_location_update timestamptz;
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS speed_kmh numeric;
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS heading_deg numeric;
