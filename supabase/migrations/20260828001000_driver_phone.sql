-- Add driver_phone column to lorries table
ALTER TABLE lorries ADD COLUMN IF NOT EXISTS driver_phone text;

-- Add driver_phone to assignments (optional snapshot if needed)
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS driver_phone text;
