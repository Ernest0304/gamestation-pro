-- Migration 008: Delivery platforms (Grab/FoodPanda), takeaway box charge,
-- and extra_charges JSONB for ad-hoc add-on fees (delivery diff, surcharge).
--
-- Triggered by Ernest's product spec 2026-05-14:
-- "Grab/FoodPanda as payment methods" + "delivery platform total auto-diff"
-- + "外带盒 +$0.20" + "自定义添加收费" button.

-- 1) Allow 'grab' and 'foodpanda' as payment methods.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN (
    'cash', 'paynow', 'member_balance', 'card',
    'mixed', 'pending', 'grab', 'foodpanda'
  ));

-- order_payments method whitelist must also include delivery channels.
ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_method_check;
ALTER TABLE order_payments ADD CONSTRAINT order_payments_method_check
  CHECK (method IN (
    'cash', 'paynow', 'member_balance', 'card', 'grab', 'foodpanda'
  ));

-- 2) Takeaway flag + charge column.
-- Per Ernest's clarification: one takeaway charge per order, not per item.
-- $0.20 default; setting can change later via shop settings.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS takeaway BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS takeaway_charge NUMERIC NOT NULL DEFAULT 0;

-- 3) extra_charges JSONB: array of {label, amount} for ad-hoc fees.
-- Used by:
--   - Manual "+ 添加收费" button (cashier custom label + amount)
--   - Smart Grab/FoodPanda flow (auto-adds {label:'外卖差额', amount: diff})
-- Stored as JSONB so the line items appear on receipt + are queryable.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS extra_charges JSONB DEFAULT '[]'::jsonb;

-- 4) Optional: persist the delivery platform's total for reconciliation
-- against the platform's own settlement report.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_platform_total NUMERIC;

-- Index for "show me today's Grab/FoodPanda orders"
CREATE INDEX IF NOT EXISTS idx_orders_delivery
  ON orders(payment_method, completed_at DESC)
  WHERE payment_method IN ('grab', 'foodpanda');

CREATE INDEX IF NOT EXISTS idx_orders_takeaway
  ON orders(takeaway, completed_at DESC)
  WHERE takeaway = TRUE;
