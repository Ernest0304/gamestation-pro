-- Migration 007: surface session shortfalls + expand daily_closes schema
-- Triggered by Finance audit (commits 2026-05-14-finance-zreport.md):
-- - Shortfall lives in audit_log JSONB; can't be queried for outstanding amounts
-- - daily_closes lacks fields needed for full accounting

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS shortfall NUMERIC DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_sessions_shortfall ON sessions(shortfall) WHERE shortfall > 0;

ALTER TABLE daily_closes ADD COLUMN IF NOT EXISTS total_revenue NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE daily_closes ADD COLUMN IF NOT EXISTS topup_bonus_given NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE daily_closes ADD COLUMN IF NOT EXISTS shortfall_total NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE daily_closes ADD COLUMN IF NOT EXISTS card_revenue NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE daily_closes ADD COLUMN IF NOT EXISTS opening_float NUMERIC;
