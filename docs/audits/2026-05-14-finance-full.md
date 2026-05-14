# Finance Audit — Full state (commit 61e15f0)

## 🔴 Critical (financial loss / audit failure risk)

1. **Cashier identity is never captured on orders or sessions.**
   `pos.js:647-654` calls `createOrder({...})` without a `cashier` arg, so `orders.cashier` is always NULL (`store.js:993`). `openSession` / `closeSession` / `extendWalkIn` don't write `sessions.cashier` either, though the column exists (`004:92`). We cannot attribute any sale to a person — fatal for shortage investigation. Fix: cache `sb.auth.getUser().email` on boot, pass into every money-moving call.

2. **Walk-in (cash/PayNow) sessions never record a payment method.**
   `closeSession` walk-in branch (`store.js:543-550`) only writes end_time + duration; `payment_method` stays NULL. `openSession` (`store.js:425-450`) ignores it too. Migration added the column (`004:90-91`); JS just doesn't use it. Walk-in revenue cannot be split between cash and PayNow at end-of-day.

3. **`applyTopUp` is not atomic across balance + tier + ledger.**
   `store.js:707-753` runs `chargeBalance` RPC → `updateMember({tier})` → `top_ups` insert as three separate writes. A drop between (a) and (b) leaves a member with Platinum balance but `regular` tier — and no top-up audit_log row exists (only the `top_ups` table) to reconcile against. Fix: single Postgres RPC `apply_topup(member, amount)` mirroring `apply_balance_delta`.

## 🟡 Important book-balancing

1. **Session start/end use raw `Date.now()`, not clock-synced `now()`** (`store.js:421`, `:526`). 3-minute iPad drift mis-bills prorated member sessions. `syncClock()` exists, just isn't used here.

2. **No manual-discount path on a gaming session.** Discount UI only wires into `createOrder` (`store.js:954-969`). Cashier cannot give goodwill on a member session at close — `closeSession` recomputes from rate × duration only. Risk: cashier pockets the cash difference.

3. **`extendWalkIn` writes a blended `discount_percent`** (`store.js:499`) mixing promo savings with cumulative rate-change averaging. Monthly "promo discount" reports will be wrong.

4. **`session_shortfall` silently logged with no cashier UI signal** (`store.js:565-571`). Owner sees member session $12, balance 0, no follow-up cash collected.

5. **`voidOrder` does `Math.max(0, m.totalSpent - order.total)`** (`store.js:1047`), masking inconsistency. Treat `v_member_ledger` (`004:105-127`) as source of truth.

## 🟢 Audit-trail gaps

1. **`top_ups` insert has no `actor_email`** (`store.js:742-749`). Every other destructive op captures it; top-ups are larger money and don't.

2. **`voidOrder` audit row has no `actor_email`** (`store.js:1057-1061`). Voids are the most fraud-prone op — must know who.

3. **Discount audit row** (`store.js:1008-1014`) stores raw input but not `member_id` / `guest_name`; reconciliation requires joining back via `order_no`.

4. **No audit entry when `extendWalkIn` crosses a promo flip.** Money moved at a rate different from the session's opening rate, with no row stating it.

## 📊 For upcoming Z-Report: data we need

1. **`cash_drawer_sessions` table** — `opened_by, opened_at, opening_float, closed_by, closed_at, closing_float_counted, expected_cash, variance, note`. Drives the drawer reconcile step.

2. **`sessions.payment_method` written on walk-in open** (🔴 #2). No walk-in tender split without it.

3. **`sessions.cashier` written everywhere** (🔴 #1). Per-cashier breakdown.

4. **`orders.cash_received` and `orders.change_given` as NUMERIC columns.** Today they live only on the in-memory receipt (`pos.js:643-645`) and are squashed into `orders.note` as a string — unparseable.

5. **View `v_daily_takings`** summing `sessions.total + orders.total` by `payment_method`, `status='completed'`. Today `dashboard.js:52-58` totals only sessions; F&B is missing from the headline number.

## 💳 For upcoming split bill: architectural recommendation

**Separate `order_payments` table. Do NOT stuff JSON into `orders.note`.**

`orders.payment_method` is single-value CHECK (`003:47`) — split needs N rows. Z-Report wants `SUM(amount) GROUP BY method`: trivial with rows, ugly with JSON. Partial refunds need per-tender reversal — JSON can't do this cleanly.

```sql
CREATE TABLE order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT CHECK (method IN ('cash','paynow','member_balance','card')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  cash_received NUMERIC, change_given NUMERIC,  -- cash only
  member_id UUID REFERENCES members(id),         -- member_balance only
  cashier_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- orders.payment_method = 'mixed' when payments count > 1.
-- Trigger: SUM(order_payments.amount) = orders.total.
```

Same shape can later carry refunds (negative amount) and tips.

## 📝 Note for Ernest

Three changes unblock Z-Report in one migration: write `cashier` + `payment_method` on walk-in flows, wrap top-up in an RPC, add `order_payments`. The discount feature already audits well — the gap is on sessions and top-ups, where bigger money moves. Don't ship the Z-Report UI until cashier identity is captured everywhere, or its variance column will always read "unknown".
