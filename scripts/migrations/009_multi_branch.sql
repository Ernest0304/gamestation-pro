-- Migration 009: Multi-branch foundation
--
-- Ernest 2026-05-14:
-- - Two branches: Kallang (existing, full menu + gaming) and Geylang
--   (smaller dessert-only, no gaming, no rice/sets, no shrimp roll).
-- - Members暂不跨店 — `home_branch_id` tag on members, POS filters by it.
-- - Menu主菜单共享 + per-branch overrides (price + available).
-- - Settings per-branch (each branch has its own takeaway charge etc.).
-- - Ernest's account = owner of both branches; staff seats can be added
--   later via /admin/staff once that UI ships.
--
-- This migration is STRUCTURE-ONLY. Existing RLS policies ('authenticated
-- = full access') stay in place. A later migration (010) will tighten
-- RLS to staff_branches-scoped reads once the client code is fully
-- branch-aware and we've verified the owner has both staff_branches rows.

-- ============================================================
-- branches table
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,             -- 'kallang', 'geylang'
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  has_gaming BOOLEAN NOT NULL DEFAULT FALSE,
  printer_counter_ip TEXT,               -- TM-T82III-i counter
  printer_kitchen_ip TEXT,               -- TM-T82III-i kitchen
  opening_float NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Per-branch settings (takeaway charge, top-up bonus rules, etc.)
  -- as JSONB so we can extend without schema migrations.
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO branches (code, name_zh, name_en, has_gaming, active, settings)
VALUES
  ('kallang', '加冷店', 'Kallang', TRUE, TRUE,
   '{"takeawayCharge": 0.20}'::jsonb),
  ('geylang', '芽笼店', 'Geylang', FALSE, FALSE,
   '{"takeawayCharge": 0.20}'::jsonb)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_full_branches" ON branches;
CREATE POLICY "auth_full_branches" ON branches FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE branches;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Add branch_id to all operational tables.
-- Phase 1: NULL allowed during backfill. After UPDATE, set NOT NULL.
-- ============================================================
ALTER TABLE orders        ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE sessions      ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE top_ups       ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE stations      ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE daily_closes  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE members       ADD COLUMN IF NOT EXISTS home_branch_id UUID REFERENCES branches(id);
ALTER TABLE audit_log     ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Backfill everything existing → Kallang
DO $$
DECLARE
  kallang_id UUID;
BEGIN
  SELECT id INTO kallang_id FROM branches WHERE code = 'kallang';

  UPDATE orders       SET branch_id = kallang_id WHERE branch_id IS NULL;
  UPDATE sessions     SET branch_id = kallang_id WHERE branch_id IS NULL;
  UPDATE top_ups      SET branch_id = kallang_id WHERE branch_id IS NULL;
  UPDATE stations     SET branch_id = kallang_id WHERE branch_id IS NULL;
  UPDATE daily_closes SET branch_id = kallang_id WHERE branch_id IS NULL;
  UPDATE members      SET home_branch_id = kallang_id WHERE home_branch_id IS NULL;
END $$;

-- Now enforce NOT NULL where mandatory
ALTER TABLE orders       ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE sessions     ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE top_ups      ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE stations     ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE daily_closes ALTER COLUMN branch_id SET NOT NULL;
-- members.home_branch_id stays nullable (system members, imports, etc.)
-- audit_log.branch_id stays nullable (system-wide events may have no branch)

-- Indexes for branch-scoped reads
CREATE INDEX IF NOT EXISTS idx_orders_branch_completed
  ON orders(branch_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_branch
  ON sessions(branch_id, end_time DESC NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_top_ups_branch
  ON top_ups(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stations_branch
  ON stations(branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_closes_branch
  ON daily_closes(branch_id, close_date DESC);
CREATE INDEX IF NOT EXISTS idx_members_home_branch
  ON members(home_branch_id) WHERE home_branch_id IS NOT NULL;

-- The (close_date) UNIQUE constraint from migration 006 must become
-- per-branch since two branches can both close the same date.
ALTER TABLE daily_closes DROP CONSTRAINT IF EXISTS daily_closes_close_date_key;
DO $$ BEGIN
  ALTER TABLE daily_closes
    ADD CONSTRAINT daily_closes_branch_date_unique UNIQUE (branch_id, close_date);
EXCEPTION WHEN duplicate_table THEN NULL;
WHEN unique_violation THEN NULL;
END $$;

-- ============================================================
-- branch_menu_pricing — overlay for per-branch price + availability
-- ============================================================
CREATE TABLE IF NOT EXISTS branch_menu_pricing (
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  price NUMERIC,                          -- NULL = use master price
  available BOOLEAN NOT NULL DEFAULT TRUE, -- FALSE = hidden on this branch
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (branch_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_menu_pricing_branch
  ON branch_menu_pricing(branch_id) WHERE available = TRUE;

ALTER TABLE branch_menu_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_full_branch_menu_pricing" ON branch_menu_pricing;
CREATE POLICY "auth_full_branch_menu_pricing" ON branch_menu_pricing FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE branch_menu_pricing;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- staff_branches — which user can act in which branch + role
-- Role: cashier (POS only) | manager (POS + own-branch reports)
--     | owner (all branches + admin backend)
-- ============================================================
CREATE TABLE IF NOT EXISTS staff_branches (
  user_id UUID NOT NULL,                  -- references auth.users.id
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('cashier', 'manager', 'owner')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_branches_user ON staff_branches(user_id);

ALTER TABLE staff_branches ENABLE ROW LEVEL SECURITY;
-- Read-own + write-owner. For now anyone authenticated reads (so app can
-- show "which branches do I have access to" on login). Writes are not yet
-- exposed to client — only superuser/SQL Editor.
DROP POLICY IF EXISTS "auth_read_staff_branches" ON staff_branches;
CREATE POLICY "auth_read_staff_branches" ON staff_branches FOR SELECT
  USING (auth.role() = 'authenticated');

-- Bootstrap Ernest as owner of both branches.
-- Best-effort lookup by email; safe to re-run.
INSERT INTO staff_branches (user_id, branch_id, role)
SELECT u.id, b.id, 'owner'
FROM auth.users u CROSS JOIN branches b
WHERE u.email = 'ernest.vid8@gmail.com'
ON CONFLICT (user_id, branch_id) DO UPDATE SET role = 'owner';

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE staff_branches;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
