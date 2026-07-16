# Finance Audit — 2026-07-03 (Tier 0, commit a29d68a)

## Verified correct (worked math)

- **Same-day void nets zero**: $25 cash order paid 14:00 (+25 at payment `createdAt`, store.js:1679), voided 18:00 (−25 refund row, store.js:1974-1977) → cash 0, refundsTotal 25. ✔
- **Cross-day void**: paid Jul 1 (+25 stays on Jul 1), voided Jul 2 (−25 dated now) → Jul 2 expected cash −25, matching cash handed back. ✔
- **No double-count**: sessions add `s.total` once at endTime (store.js:1685-1688, voided included); their refund rows are the only negatives; `sessionCount` uses completed only (1663, 1705). ✔
- **Backfill 012**: order refunds mirror `p.created_at` (net-zero same day), session refunds at `end_time`; both dedup guards idempotent (012:44-70). Matches commit's 2026-05-23 check (+34/−34). ✔
- **Opening float**: float 150 + (cash 500 − refund 25) + top-ups 50 → expected 675 (store.js:1867-1870); `cash_difference = actual − expected` (1876). ✔

## 🔴 Critical — max 3

1. **Percent discounts bypass the $10 cap** — pos.js:810 `isLarge = mode==='percent' ? v>20 : v>10`. 20% on a $500 bill = $100 off, no PIN; fixed $11 needs PIN. → Gate on computed `discountAmount() > 10 || v > 20`.
2. **Any cashier can replace the manager PIN** — Settings is not role-gated (only `admin` is, app.js:192); saving a new PIN never asks for the old one (settings.js:238-246). Staff set their own PIN, then self-approve voids/discounts. → Require current PIN or owner role; dedicated audit action.
3. **PIN is advisory, not a control** — unsalted sha256 of a 4-8-digit numeric PIN (app.js:137-140) is cached on every staff device (store.js:67); 10^4–10^8 hashes brute-force in seconds-to-minutes. Console `GC.Store.voidOrder()` skips the gate entirely (no RLS). → Salt+pepper, failed-attempt lockout, plan server-side enforcement (Tier A1).

## 🟡 Important — max 5

1. New original tender rows never stamp `branch_id` (store.js:1534-1541) — reintroduces the attribution gap 012 backfilled; branch-scoped summaries depend on the 500-order cache join (store.js:1640, 304).
2. `voidOrder` reads tenders from the 1000-row payments cache (store.js:306, 1938) — voiding an aged-out order silently writes no refund rows and skips mixed member refunds. Query DB by `order_id`.
3. Legacy member-order void fallback (store.js:1951-1954) refunds balance but writes no negative row → memberBalance bucket not netted.
4. Reports page `getRangeSummary` stays status-based (store.js:1764-1771) → diverges from tender-based Z-Report on any cross-day void.
5. `totalDiscount`/takeaway/extras use completed orders only (store.js:1690-1700) — re-run Z after a void won't match the persisted close snapshot.

## 🟢 Control gaps — max 4

1. PIN modal: unlimited retries, failures unaudited (app.js:176-182).
2. Close modal placeholder shows expected cash (history.js:706) — anchors the count; blind count preferred.
3. `settings_update` audit logs the PIN hash change but nothing flags it distinctly (store.js:1228-1237).

## 📊 Suggested reports

1. Refund register: all negative `order_payments` by day/staff/method.
2. Discount ledger ≥$10 with reason + approver.
3. Float-variance trend from `daily_closes.opening_float` vs `cash_difference`.

Resolved from 2026-05-14: P0-B timezone (0.1 business day), void member-refund P0-C (verified intact).
