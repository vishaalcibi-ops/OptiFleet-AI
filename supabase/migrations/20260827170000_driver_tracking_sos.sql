-- ============ DRIVER TRACKING & BREAKDOWN SOS MIGRATION ============
-- Add location and breakdown tracking columns to lorries
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS current_latitude double precision;
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS current_longitude double precision;
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS last_location_update timestamptz;
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS speed_kmh numeric;
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS heading_deg numeric;
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS is_breakdown boolean NOT NULL DEFAULT false;
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS breakdown_at timestamptz;

-- Enable Realtime publication on lorries table for live push updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lorries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lorries;
  END IF;
END $$;
