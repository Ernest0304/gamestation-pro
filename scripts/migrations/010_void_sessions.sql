-- Migration 010: allow voiding completed sessions
-- Ernest 2026-05-14: "the game order should be able to void also"
--
-- Sessions previously only allowed status='active' or 'completed'. We need
-- 'voided' so managers can cancel an erroneous session (cashier opened wrong
-- table, customer disputed time billed, etc.) — with member balance refund
-- when applicable, just like voidOrder.

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('active', 'completed', 'voided'));
