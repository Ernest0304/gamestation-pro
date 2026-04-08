-- ============================================
-- GameStation Pro — Supabase Database Setup
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================

-- 1. Settings table (single config row)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rate_ps5 NUMERIC NOT NULL DEFAULT 15,
  rate_switch2 NUMERIC NOT NULL DEFAULT 15,
  currency TEXT NOT NULL DEFAULT 'SGD',
  currency_symbol TEXT NOT NULL DEFAULT '$',
  min_billing_minutes INTEGER NOT NULL DEFAULT 0,
  discount_bronze NUMERIC NOT NULL DEFAULT 0,
  discount_silver NUMERIC NOT NULL DEFAULT 5,
  discount_gold NUMERIC NOT NULL DEFAULT 10,
  threshold_silver NUMERIC NOT NULL DEFAULT 200,
  threshold_gold NUMERIC NOT NULL DEFAULT 500,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Stations table
CREATE TABLE IF NOT EXISTS stations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'active')),
  start_time BIGINT,
  member_id UUID
);

-- 3. Members table
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  total_spent NUMERIC NOT NULL DEFAULT 0,
  total_minutes NUMERIC NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id INTEGER NOT NULL,
  station_name TEXT NOT NULL,
  station_type TEXT NOT NULL,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  start_time BIGINT NOT NULL,
  end_time BIGINT NOT NULL,
  duration_minutes NUMERIC NOT NULL,
  rate NUMERIC NOT NULL,
  subtotal NUMERIC NOT NULL,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Foreign key: stations.member_id → members.id
ALTER TABLE stations
  ADD CONSTRAINT fk_stations_member
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;

-- ============================================
-- Seed Data
-- ============================================

-- Default settings
INSERT INTO settings (id, rate_ps5, rate_switch2) VALUES (1, 15, 15)
ON CONFLICT (id) DO NOTHING;

-- 6 stations
INSERT INTO stations (id, name, type, status) VALUES
  (1, '1号台', 'PS5', 'idle'),
  (2, '2号台', 'PS5', 'idle'),
  (3, '3号台', 'PS5', 'idle'),
  (4, '4号台', 'PS5', 'idle'),
  (5, '5号台', 'Switch 2', 'idle'),
  (6, '6号台', 'Switch 2', 'idle')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users have full access
CREATE POLICY "auth_full_settings" ON settings
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_full_stations" ON stations
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_full_members" ON members
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_full_sessions" ON sessions
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- Enable Realtime for stations table
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE stations;
