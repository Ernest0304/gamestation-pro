# Finance Audit — Z-Report + cashier (commits c8b8cb3 + 15c2266)

## 🔴 Critical

1. **Cash drawer reconciliation under-counts by `topUpsCash`.**
   `history.js:543` shows expected cash = `z.cash` (revenue only). The drawer
   also holds cash from top-ups, which `getDailySummary` returns as a separate
   bucket (`topUpsCash`), not folded into `cash`. Every day with top-ups,
   `actual − expected` registers a false positive equal to top-up cash.
   `daily_closes.cash_difference` becomes meaningless.
   Fix: `expected_cash = summary.cash + summary.topUpsCash` in `closeDay`
   (`store.js:1230`) + update modal hint.

2. **Member-session shortfall is not queryable.** `closeSession` writes the
   full `updated.total` into `sessions.total` even when balance ran out
   (`store.js:649-651`); actually-deducted is `total − shortfall`. The
   shortfall sits only inside `audit_log.after_state` (JSONB). Result:
   `getDailySummary` over-states `member_balance` revenue, and no SELECT
   lists "sessions where cashier still owes us cash."
   Fix: add `sessions.shortfall NUMERIC DEFAULT 0`, write it in
   `closeSession`, subtract from `member_balance` bucket.

3. **`closeDay` does not block when active sessions still exist.**
   `getDailySummary` filters `status === 'completed'`, so a walk-in that
   bridges midnight is invisible at close, then lands in the wrong day.
   `daily_close` audit row already fired → downstream reconciliation
   corrupted.
   Fix: refuse / warn if `getActiveSessions().length > 0`.

## 🟡 Important

4. **Cache limits truncate the snapshot.** `_runInit` caps `orders` at 500
   and `order_payments` at 1000. On a high-volume day, `getDailySummary`
   silently undercounts; `closeDay` persists an under-stated `snapshot`.
   Fix: query DB directly via `v_daily_summary` view inside `closeDay`.

5. **`daily_closes` schema missing columns** for monthly closing:
   `total_revenue`, `topup_bonus_given`, `shortfall_total`, `card_revenue`,
   `opening_float`. Currently total only derivable from `snapshot` JSONB —
   not SQL-friendly for GST reports.

6. **Split-bill `±$0.01` tolerance is fine.** `paySum` is `round2`-ed
   before comparison (`store.js:1066`); 3-way $100 (33.33+33.33+33.34)
   passes exactly. No risk.

7. **Cashier = `user.email` only.** Acceptable for IRAS (mappable to staff
   records), but `staff_id` FK would survive a leaver's email being
   reclaimed. Not blocking.

## ✅ Resolved from prior audit

- **#1 cashier on every write** — all four entry points call
  `getCurrentUserEmail()`.
- **#2 walk-in `payment_method` recorded** — `openSession` writes it;
  `getDailySummary` routes via `s.paymentMethod || 'cash'`.
- **#4 shortfall surfaced in UI** — `dashboard.js:649` red toast (but see
  Critical #2 — not persisted as a column).
- **Important #1 clock sync** — `now()` used in open/close session.
- **Top-up bonus separated from cash** — `topUpsCash` vs `topUpsBonus`
  returned distinctly; bonus never enters a revenue bucket. Accounting-
  correct (bonus is marketing cost).
- **Voided orders excluded from revenue** — `status === 'completed'`
  filter applied; voids counted separately as `voidedCount`.
- **Singapore midnight TZ rollover works.** `new Date(day + 'T00:00:00')`
  parses as local time → SG iPad gets UTC+8 midnight; session `endTime`
  is UTC epoch ms — both sides comparable.

## 📝 Verdict for Ernest

Z-Report **safe to demo, NOT yet safe for month-end GST filing**.
Three blockers in priority order:

1. Fix cash-drawer expected math (Critical #1) — one line + label. Half day.
2. Persist shortfall to a queryable column (Critical #2). One migration +
   one write. One day.
3. Block `closeDay` with active sessions (Critical #3). Trivial guard +
   warning. Half day.

Defer cache fix, schema additions, `staff_id`. Prior audit's RPC-atomicity
items (`applyTopUp`, `createOrder` two-insert) remain open but are not
blocking Z-Report.
