-- Migration 004: Atomic balance updates, server clock RPC, audit log
-- Solves race condition on concurrent balance writes, client clock drift,
-- and adds an audit trail for settings changes & destructive ops.

-- ============================================================
-- 1. Atomic balance update (race-free)
-- ============================================================
-- Replaces read-modify-write pattern in store.js updateMember.
-- Use UPDATE … RETURNING which is atomic at the row level.

CREATE OR REPLACE FUNCTION apply_balance_delta(
  p_member_id UUID,
  p_delta NUMERIC,
  p_reason TEXT DEFAULT 'session'
) RETURNS TABLE(new_balance NUMERIC, shortfall NUMERIC) AS $$
DECLARE
  current_balance NUMERIC;
  resulting_balance NUMERIC;
  v_shortfall NUMERIC := 0;
BEGIN
  -- Lock the row
  SELECT balance INTO current_balance FROM members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found: %', p_member_id;
  END IF;

  resulting_balance := current_balance + p_delta;

  -- If a debit would take balance below 0, record the shortfall but cap at 0
  IF resulting_balance < 0 THEN
    v_shortfall := -resulting_balance;
    resulting_balance := 0;
  END IF;

  UPDATE members SET balance = resulting_balance WHERE id = p_member_id;

  RETURN QUERY SELECT resulting_balance, v_shortfall;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Server time (anti clock-drift)
-- ============================================================
-- Client calls this on boot + on visibilitychange to keep local Date.now()
-- in sync with server reality.

CREATE OR REPLACE FUNCTION server_now() RETURNS BIGINT AS $$
  SELECT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
$$ LANGUAGE sql;

-- ============================================================
-- 3. Settings & destructive-op audit log
-- ============================================================
-- Any rate / settings change is logged. Any clear/reset is logged.

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,                         -- 'settings_update', 'sessions_clear', 'reset_all', 'member_delete'
  actor_email TEXT,                              -- who did it
  before_state JSONB,
  after_state JSONB,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_created
  ON audit_log (action, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_full_audit_log" ON audit_log;
CREATE POLICY "auth_full_audit_log" ON audit_log FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 4. Soft-delete members (don't actually drop history)
-- ============================================================
-- Per owner's "会员信息一定要有备份并且需要一直保存" requirement.
-- archived_at NULL = active; non-null = soft-deleted.

ALTER TABLE members ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS archived_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_members_active
  ON members (archived_at) WHERE archived_at IS NULL;

-- ============================================================
-- 5. Sessions payment method + cashier (per Ops audit)
-- ============================================================

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payment_method TEXT
  CHECK (payment_method IN ('cash', 'paynow', 'member_balance', 'card', NULL));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cashier TEXT;

-- Existing sessions: walk-in = unknown, member = member_balance
UPDATE sessions
  SET payment_method = CASE WHEN member_id IS NOT NULL THEN 'member_balance' ELSE NULL END
  WHERE payment_method IS NULL AND status = 'completed';

-- ============================================================
-- 6. Helpful view: member balance ledger
-- ============================================================
-- Reconstructs a member's balance over time from top_ups + sessions.
-- Used by reports & Telegram bot.

CREATE OR REPLACE VIEW v_member_ledger AS
  SELECT
    t.member_id,
    t.created_at,
    'top_up' AS kind,
    t.amount AS delta,
    t.bonus,
    t.resulting_balance,
    t.reason
  FROM top_ups t
  UNION ALL
  SELECT
    s.member_id,
    COALESCE(to_timestamp(s.end_time / 1000.0), s.created_at) AS created_at,
    'session' AS kind,
    -s.total AS delta,
    0 AS bonus,
    NULL::NUMERIC AS resulting_balance,
    s.station_name AS reason
  FROM sessions s
  WHERE s.member_id IS NOT NULL AND s.status = 'completed';

GRANT SELECT ON v_member_ledger TO authenticated;
