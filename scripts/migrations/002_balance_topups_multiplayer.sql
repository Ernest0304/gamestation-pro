-- Migration 002: Balance, top-ups, multi-player support, walk-in pre-paid hours
-- Idempotent — safe to re-run.

-- 1. Members: balance + telegram_id + bind_code
ALTER TABLE members ADD COLUMN IF NOT EXISTS balance NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN IF NOT EXISTS telegram_id TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS bind_code TEXT UNIQUE;

-- 2. Top-ups history table
CREATE TABLE IF NOT EXISTS top_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  bonus NUMERIC NOT NULL DEFAULT 0,
  resulting_balance NUMERIC NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sessions: support active sessions, walk-in pre-paid, guest names
ALTER TABLE sessions ALTER COLUMN end_time DROP NOT NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS paid_minutes NUMERIC;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expected_end_time BIGINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS guest_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_status_check CHECK (status IN ('active', 'completed'));

-- 4. Settings: bonus + warn minutes + max players
ALTER TABLE settings ADD COLUMN IF NOT EXISTS platinum_topup_bonus NUMERIC NOT NULL DEFAULT 20;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS warn_minutes INTEGER NOT NULL DEFAULT 10;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS max_players_per_station INTEGER NOT NULL DEFAULT 4;

-- 5. Generate bind codes for existing members without one
UPDATE members SET bind_code = upper(substring(md5(random()::text || id::text), 1, 8))
WHERE bind_code IS NULL;

-- 6. Clean up stations (old per-station member_id no longer used)
UPDATE stations SET status = 'idle', start_time = NULL, member_id = NULL;

-- 7. Enable Realtime on sessions (needed for multi-device sync)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 8. RLS for top_ups
ALTER TABLE top_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_full_top_ups" ON top_ups;
CREATE POLICY "auth_full_top_ups" ON top_ups
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 9. Index for fast queries: active sessions per station
CREATE INDEX IF NOT EXISTS idx_sessions_station_active
  ON sessions (station_id) WHERE status = 'active';

-- 10. Index for member sessions lookup
CREATE INDEX IF NOT EXISTS idx_sessions_member
  ON sessions (member_id, end_time DESC);
