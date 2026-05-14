# IT Audit — Z-Report + atomic-close (commits c8b8cb3 + 15c2266)

## Severity 1 — max 3

**S1-A. `order_payments` INSERT has no error check — silent orphan.**
`store.js:1118` destructures `data` but discards `error`. If payment
INSERT fails, `createOrder` still returns success: order is
`status='completed'`, items exist, kitchen prints — but payments has
zero rows. `getDailySummary` (1174) keys on `orderId`, so cash drawer is
silently undercounted. Same shape as pre-existing S1-1. Fix: check
`paymentsErr`; on failure void the order. Long-term:
`create_order_atomic` RPC wrapping all three INSERTs.

**S1-B. Realtime does NOT subscribe to `orders` / `order_payments` /
`top_ups` / `daily_closes`.** `store.js:315-355` listens only on
sessions, stations, members. Two iPads: A creates an order → B's
`_cache.orders` / `orderPayments` lag until reload. `getDailySummary`
(1168) reads those caches, so Z-Report drift is unbounded across a
shift. Same gap blinds the view to top-ups and to a prior cashier's
close-day row. Fix: add `postgres_changes` handlers for the four tables.

**S1-C. `closeDay` upsert silently destroys the first cashier's
reconciliation.** `store.js:1241` uses
`upsert(..., { onConflict: 'close_date' })`. Cashier-A counts $500 → row inserts. Cashier-B counts $400 → row
overwritten in place; `closed_by`, `actual_cash`, `cash_difference`
replaced. A's count vanishes. Fix: switch to `ON CONFLICT DO NOTHING`, surface
`alreadyClosedBy` to UI, gate corrections behind a manager-only
`reopenDay` RPC.

## Severity 2 — max 4

**S2-A. `closeSession` guard verified.** `.eq('status','active')` at
`store.js:618` prevents double-debit on a 100ms race — Postgres
serialises the UPDATE on the row lock; the second tab sees 0 rows,
returns `alreadyClosed: true`, and `chargeBalance` (line 635) never fires
for the loser. Station-status flip (657-663) reads from cache; worst
case is an idempotent dual-write to `idle`. OK.

**S2-B. Migration 006 inherits S1-3 (RLS DELETE wide-open).** Lines 24-27
use `FOR ALL`. Any authed staff can `DELETE FROM order_payments` /
`daily_closes` from DevTools. Split into SELECT/INSERT; forbid
UPDATE+DELETE — these are audit-grade.

**S2-C. No DB constraint that `SUM(order_payments.amount) =
orders.total`.** JS validates client-side (1066), but a direct SQL
INSERT can violate the invariant unseen. Add a deferred trigger fired
when `orders.status` becomes `completed`.

**S2-D. `memberToApp.archived_at` fix verified.** Mapper at line 75
surfaces the column; realtime UPDATE filter at 347 correctly hides
soft-deleted members. Correct.

## Resolved from prior audit

- **S1-2** closeSession atomic guard — present and effective.
- **S1-4** station status awaited with error logging (505-506, 659-660).
- **S2-1** member archive realtime filter — works end-to-end.
- Cashier identity stamped on sessions + orders via
  `getCurrentUserEmail()`.
- Walk-in `payment_method` persisted — unblocks Z-Report by-tender.
- Close-button debounce on dashboard (642) and Z-Report modal (570).

## Verdict

Schema, indexes, view, and the atomic close guard are sound. But three
Severity-1 gaps compromise Z-Report integrity on a multi-iPad night:
silent payment-INSERT failure (S1-A), missing realtime on the four new
tables (S1-B), and Close-Day upsert overwrite (S1-C). Together they let
Z-Report both undercount and lag. Fix order: A (5-line error check) → B
(four `postgres_changes` handlers) → C (`ON CONFLICT DO NOTHING` +
`reopenDay` RPC). Pre-existing S1-1 (orders+items atomicity) and S1-3
(RLS DELETE) remain deferred and now also expose `order_payments`.
