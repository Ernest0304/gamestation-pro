-- Migration 012: tender-based accounting + settings config columns
--
-- Competitive-audit Tier 0 fixes (2026-06-23):
--
-- 0.2 Void refund rows: voidOrder's doc promised negative refund rows in
--     order_payments but the code never wrote them. Consequence: voiding a
--     PREVIOUS day's cash order never reduced the current day's expected
--     drawer cash → silent Z-Report mismatch. We now (a) allow negative
--     amounts, (b) stamp branch_id on payment rows so the Z-Report can
--     count tenders by their own date/branch, (c) backfill refund rows for
--     already-voided orders + sessions (net-zero on their original day, so
--     historical reports do not shift).
--
-- 0.9 Config columns: takeaway charge + staff list + manager PIN move from
--     hardcoded JS constants into settings so changing them doesn't need a
--     deploy.

-- ===== 1) order_payments: allow refunds (negative amounts) =====
ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_amount_check;
-- keep a sanity bound: no zero rows
ALTER TABLE order_payments ADD CONSTRAINT order_payments_amount_nonzero CHECK (amount <> 0);

-- order_id becomes optional context: session-void refunds have no order.
ALTER TABLE order_payments ALTER COLUMN order_id DROP NOT NULL;

-- ===== 2) branch attribution on tender rows =====
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
UPDATE order_payments p SET branch_id = o.branch_id
FROM orders o WHERE p.order_id = o.id AND p.branch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_payments_branch_created
  ON order_payments(branch_id, created_at DESC);

-- ===== 3) settings config columns =====
ALTER TABLE settings ADD COLUMN IF NOT EXISTS manager_pin TEXT;              -- sha256 hex; NULL = gate disabled
ALTER TABLE settings ADD COLUMN IF NOT EXISTS takeaway_charge NUMERIC NOT NULL DEFAULT 0.20;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS staff_names JSONB NOT NULL
  DEFAULT '["Qian Min","Tock Chau","Ke Ying","Felicia","Ernest"]'::jsonb;

-- ===== 4) backfill refund rows for already-voided ORDERS =====
-- Mirror each original tender with a negative row dated the SAME moment, so
-- the void nets to zero within its original business day (historical reports
-- unchanged) while the new tender-based Z-Report math stays consistent.
INSERT INTO order_payments (order_id, method, amount, note, branch_id, created_at)
SELECT p.order_id, p.method, -p.amount, 'refund:void (backfill 012)', p.branch_id, p.created_at
FROM order_payments p
JOIN orders o ON o.id = p.order_id
WHERE o.status = 'voided' AND p.amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM order_payments r
    WHERE r.order_id = p.order_id AND r.method = p.method AND r.amount = -p.amount
  );

-- ===== 5) backfill refund rows for already-voided SESSIONS =====
-- Sessions never had tender rows; a voided session needs a negative row so
-- drawer math nets out. Dated at the session's end (net-zero same day).
INSERT INTO order_payments (order_id, method, amount, note, branch_id, created_at)
SELECT NULL,
       CASE WHEN s.member_id IS NOT NULL THEN 'member_balance'
            ELSE COALESCE(s.payment_method, 'cash') END,
       -s.total,
       'refund:session_void:' || s.id || ' (backfill 012)',
       s.branch_id,
       to_timestamp(s.end_time / 1000.0)
FROM sessions s
WHERE s.status = 'voided' AND s.total > 0 AND s.end_time IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM order_payments r
    WHERE r.note LIKE 'refund:session_void:' || s.id || '%'
  );
