-- Migration 011: lock the financial ledger tables append-only
--
-- Foundation hardening (Ernest 2026-05-14 "基础要打好"). Audit found every
-- table had a single "ALL = authenticated" RLS policy, meaning ANY logged-in
-- session could UPDATE or DELETE rows — including audit_log and daily_closes.
--
-- Threat: a staff member voids an order (pocketing the cash), then deletes
-- the audit_log row + edits the daily_close so the books balance. The whole
-- tamper-evidence value of these tables is lost.
--
-- Verified the app NEVER updates/deletes these tables (INSERT-only in code),
-- so revoking UPDATE/DELETE is safe and breaks nothing.
--
-- Pattern: with RLS enabled, a command with NO permitting policy is denied.
-- So we drop the catch-all ALL policy and re-add only the allowed commands.

-- ===== audit_log → append-only (SELECT + INSERT, no UPDATE/DELETE) =====
DROP POLICY IF EXISTS "auth_full_audit_log" ON audit_log;
CREATE POLICY "audit_log_select" ON audit_log FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
-- (no UPDATE, no DELETE policy → both denied for all client roles)

-- ===== daily_closes → no DELETE (SELECT + INSERT + UPDATE) =====
-- UPDATE kept so a future "amend reconciliation note" flow can work; DELETE
-- removed so a closed day's record can never be silently erased.
DROP POLICY IF EXISTS "auth_full_daily_closes" ON daily_closes;
CREATE POLICY "daily_closes_select" ON daily_closes FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "daily_closes_insert" ON daily_closes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "daily_closes_update" ON daily_closes FOR UPDATE
  USING (auth.role() = 'authenticated');
-- (no DELETE policy → denied)
