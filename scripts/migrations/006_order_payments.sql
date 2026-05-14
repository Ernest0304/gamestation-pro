-- Migration 006: order_payments table for split-bill support + Z-Report querying
--
-- Why a separate table:
-- - One order can have MULTIPLE payments (cash $30 + PayNow $20)
-- - Each payment may have cash-specific fields (tendered, change_given)
-- - Z-Report queries SUM(amount) GROUP BY method without scattered notes
-- - Audit trail is cleaner than a single payment_method column

CREATE TABLE IF NOT EXISTS order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('cash', 'paynow', 'member_balance', 'card')),
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  tendered NUMERIC,            -- cash received (only set for cash)
  change_given NUMERIC,        -- cash change (only set for cash)
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_method_created
  ON order_payments(method, created_at DESC);

ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_full_order_payments" ON order_payments;
CREATE POLICY "auth_full_order_payments" ON order_payments FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE order_payments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow 'mixed' on orders.payment_method now that split is real
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cash', 'paynow', 'member_balance', 'card', 'mixed', 'pending'));

-- Backfill: each existing completed order gets one payment row matching its current state
INSERT INTO order_payments (order_id, method, amount, created_at)
SELECT id, payment_method, total, completed_at
FROM orders
WHERE status = 'completed'
  AND payment_method IS NOT NULL
  AND payment_method != 'pending'
  AND payment_method != 'mixed'
  AND id NOT IN (SELECT order_id FROM order_payments WHERE order_id IS NOT NULL);

-- Daily Z-Report view — what staff need at end of shift.
-- Aggregates orders + gaming sessions + top-ups by date and payment method.
CREATE OR REPLACE VIEW v_daily_summary AS
WITH order_revenue AS (
  SELECT
    DATE(COALESCE(o.completed_at, o.created_at) AT TIME ZONE 'Asia/Singapore') AS day,
    op.method,
    COUNT(DISTINCT o.id) AS order_count,
    SUM(op.amount) AS amount
  FROM orders o
  LEFT JOIN order_payments op ON op.order_id = o.id
  WHERE o.status = 'completed'
  GROUP BY 1, 2
),
session_revenue AS (
  SELECT
    DATE(to_timestamp(s.end_time / 1000.0) AT TIME ZONE 'Asia/Singapore') AS day,
    CASE WHEN s.member_id IS NOT NULL THEN 'member_balance'
         ELSE COALESCE(s.payment_method, 'cash') END AS method,
    COUNT(*) AS session_count,
    SUM(s.total) AS amount
  FROM sessions s
  WHERE s.status = 'completed'
  GROUP BY 1, 2
),
topup_cash AS (
  -- Top-ups assume cash received (real money in). Bonus is marketing expense.
  SELECT
    DATE(t.created_at AT TIME ZONE 'Asia/Singapore') AS day,
    COUNT(*) AS topup_count,
    SUM(t.amount) AS topup_cash_amount,
    SUM(t.bonus) AS topup_bonus_amount
  FROM top_ups t
  GROUP BY 1
)
SELECT
  COALESCE(o.day, s.day, t.day) AS day,
  COALESCE(o.method, s.method) AS method,
  COALESCE(o.order_count, 0) AS f_and_b_orders,
  COALESCE(s.session_count, 0) AS gaming_sessions,
  COALESCE(o.amount, 0) AS f_and_b_amount,
  COALESCE(s.amount, 0) AS gaming_amount,
  COALESCE(t.topup_count, 0) AS topups_count,
  COALESCE(t.topup_cash_amount, 0) AS topups_cash,
  COALESCE(t.topup_bonus_amount, 0) AS topups_bonus
FROM order_revenue o
FULL OUTER JOIN session_revenue s ON s.day = o.day AND s.method = o.method
FULL OUTER JOIN topup_cash t ON t.day = COALESCE(o.day, s.day) AND COALESCE(o.method, s.method) = 'cash';

GRANT SELECT ON v_daily_summary TO authenticated;

-- Daily closes table — once a day is "closed" (reconciled by cashier),
-- log the snapshot + any discrepancy so monthly reports can pull a clean record.
CREATE TABLE IF NOT EXISTS daily_closes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  close_date DATE NOT NULL,
  closed_at TIMESTAMPTZ DEFAULT NOW(),
  closed_by TEXT,
  expected_cash NUMERIC NOT NULL DEFAULT 0,    -- system total
  actual_cash NUMERIC,                          -- counted in drawer
  cash_difference NUMERIC,                      -- actual - expected
  expected_paynow NUMERIC NOT NULL DEFAULT 0,
  member_deductions NUMERIC NOT NULL DEFAULT 0,
  total_discount NUMERIC NOT NULL DEFAULT 0,
  topups_received NUMERIC NOT NULL DEFAULT 0,
  voided_orders INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  snapshot JSONB,                               -- full summary at close time
  UNIQUE (close_date)
);

ALTER TABLE daily_closes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_full_daily_closes" ON daily_closes;
CREATE POLICY "auth_full_daily_closes" ON daily_closes FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
