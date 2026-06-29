-- =============================================================================
-- Migration: Audit Fixes (2026-06-30)
-- =============================================================================
-- Behebt Bugs aus dem Money-Safety Audit:
--   A. group_funding.group_activity_id darf NULL sein (UI erlaubt "keine Aktivität")
--   H. RPC `increment_bank_balance` absichern (idempotent CREATE OR REPLACE)
--   D/F. Atomic `transfer_between_accounts` RPC für race-freie Money-Bewegungen
--   K. `contribute_to_funding` RPC re-definieren (idempotent, falls vorherige
--      Migration nicht ausgeführt wurde)
--
-- Idempotent: ALTER TABLE und CREATE OR REPLACE FUNCTION sind safe to re-run.
-- Run manually in Supabase SQL editor.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Bug A: group_funding.group_activity_id NULL erlauben
-- ---------------------------------------------------------------------------
ALTER TABLE group_funding ALTER COLUMN group_activity_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Bug H: increment_bank_balance — atomarer Balance-Delta-Update
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_bank_balance(p_account_id INT, p_delta NUMERIC)
RETURNS VOID AS $$
  UPDATE bank_accounts
    SET balance = balance + p_delta
    WHERE id = p_account_id;
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------------
-- Bug D/F: atomarer Transfer zwischen zwei Konten in einer einzigen DB-Transaktion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION transfer_between_accounts(
  p_from_id INT,
  p_to_id INT,
  p_amount NUMERIC
)
RETURNS VOID AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'transfer_between_accounts: amount must be > 0 (got %)', p_amount;
  END IF;
  IF p_from_id = p_to_id THEN
    RAISE EXCEPTION 'transfer_between_accounts: from and to must differ (both %)', p_from_id;
  END IF;
  UPDATE bank_accounts SET balance = balance - p_amount WHERE id = p_from_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_between_accounts: source account % not found', p_from_id;
  END IF;
  UPDATE bank_accounts SET balance = balance + p_amount WHERE id = p_to_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_between_accounts: target account % not found', p_to_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Bug K: contribute_to_funding — idempotent neu definieren falls fehlend
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION contribute_to_funding(p_funding_id INT, p_amount NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
  v_target NUMERIC;
  v_current NUMERIC;
  v_room NUMERIC;
  v_actual NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN 0;
  END IF;
  SELECT target_amount, amount INTO v_target, v_current
    FROM group_funding WHERE id = p_funding_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contribute_to_funding: funding % not found', p_funding_id;
  END IF;
  IF v_target IS NULL OR v_target <= 0 THEN
    -- Legacy fundings ohne Zielbetrag: kein Cap, voller Betrag wird angenommen
    UPDATE group_funding SET amount = amount + p_amount WHERE id = p_funding_id;
    RETURN p_amount;
  END IF;
  v_room := GREATEST(0, v_target - v_current);
  v_actual := LEAST(p_amount, v_room);
  IF v_actual <= 0 THEN
    RETURN 0;
  END IF;
  UPDATE group_funding
    SET amount = amount + v_actual,
        status = CASE WHEN amount + v_actual >= v_target THEN 'completed' ELSE status END,
        completed_at = CASE
          WHEN amount + v_actual >= v_target AND completed_at IS NULL THEN now()
          ELSE completed_at
        END
    WHERE id = p_funding_id;
  RETURN v_actual;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Race-safe rollback of a failed donation: subtracts a delta from the pool
-- in a single FOR UPDATE transaction. Reverts 'completed' status if the
-- subtraction drops the pool below target. Used by the donate handler to
-- compensate when funding_participants / private_expenses inserts fail
-- after contribute_to_funding has already incremented the pool.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refund_from_funding(p_funding_id INT, p_amount NUMERIC)
RETURNS VOID AS $$
DECLARE
  v_target NUMERIC;
  v_new_amount NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN; END IF;
  SELECT target_amount INTO v_target FROM group_funding WHERE id = p_funding_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE group_funding
    SET amount = GREATEST(0, amount - p_amount)
    WHERE id = p_funding_id
    RETURNING amount INTO v_new_amount;
  IF v_target IS NOT NULL AND v_target > 0 AND v_new_amount < v_target THEN
    UPDATE group_funding
      SET status = 'open', completed_at = NULL
      WHERE id = p_funding_id AND status = 'completed';
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;
