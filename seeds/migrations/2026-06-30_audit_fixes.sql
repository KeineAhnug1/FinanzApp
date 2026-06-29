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

-- ---------------------------------------------------------------------------
-- Bug G2 (audit follow-up): release_period_reservations RPC moved money via
-- direct UPDATE statements but didn't create paired private_expenses/income
-- ledger rows — so postpaid group-expense settlements appeared in users'
-- balances but NOT in their dashboard Einnahmen/Ausgaben journal.
--
-- This re-definition adds the paired ledger entries (matching the behavior
-- of the TS-side createPeerTransfer helper). Now every member→admin transfer
-- inside this RPC also inserts:
--   * one private_expenses row on the member's bank account (debit)
--   * one income row on the admin's bank account (credit)
-- both tagged with transfer_id and group_id so the dashboard can show them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION release_period_reservations(p_period_id INT)
RETURNS INT AS $$
DECLARE
  v_shared_expense_id INT;
  v_group_id INT;
  v_admin_user_id INT;
  v_admin_account_id INT;
  v_title VARCHAR;
  v_reason TEXT;
  v_released INT := 0;
  v_member_account_id INT;
  v_transfer_id INT;
  v_now TIMESTAMP := now();
  r RECORD;
BEGIN
  SELECT gse.id, gse.group_id, gse.creator_user_id, gse.title
    INTO v_shared_expense_id, v_group_id, v_admin_user_id, v_title
    FROM group_shared_expense_periods p
    JOIN group_shared_expenses gse ON gse.id = p.shared_expense_id
   WHERE p.id = p_period_id
   FOR UPDATE;

  IF v_shared_expense_id IS NULL THEN
    RAISE EXCEPTION 'Period % not found', p_period_id;
  END IF;

  SELECT default_bank_account_id INTO v_admin_account_id
    FROM users WHERE id = v_admin_user_id;

  IF v_admin_account_id IS NULL THEN
    RAISE EXCEPTION 'Admin user % has no default bank account', v_admin_user_id;
  END IF;

  v_reason := 'Anteil: ' || v_title;

  FOR r IN
    SELECT pt.id AS pt_id, pt.share_id, pt.amount, s.user_id
      FROM group_shared_expense_period_transfers pt
      JOIN group_shared_expense_shares s ON s.id = pt.share_id
     WHERE pt.period_id = p_period_id
       AND pt.status = 'reserved'
     FOR UPDATE
  LOOP
    SELECT default_bank_account_id INTO v_member_account_id
      FROM users WHERE id = r.user_id;

    IF v_member_account_id IS NULL THEN
      RAISE EXCEPTION 'Member user % has no default bank account', r.user_id;
    END IF;

    -- Skip self-transfers (admin is participant of their own expense)
    IF v_member_account_id = v_admin_account_id THEN
      UPDATE group_shared_expense_period_transfers
        SET status = 'released'
       WHERE id = r.pt_id;
      UPDATE group_shared_expense_shares
        SET status = 'paid'
       WHERE id = r.share_id;
      CONTINUE;
    END IF;

    INSERT INTO transfers (
      from_user_id, to_user_id,
      from_bank_account_id, to_bank_account_id,
      amount, reason, group_id, group_expense_share_id,
      status, completed_at
    ) VALUES (
      r.user_id, v_admin_user_id,
      v_member_account_id, v_admin_account_id,
      r.amount, v_reason, v_group_id, r.share_id,
      'completed', v_now
    ) RETURNING id INTO v_transfer_id;

    -- Paired ledger entry on sender side (private_expenses)
    INSERT INTO private_expenses (
      bank_account_id, source, category, amount, theo_amount,
      spent_at, due_date, pay_date, info, state, note,
      recurrence, cycle, is_active, transfer_id, group_id
    ) VALUES (
      v_member_account_id, v_reason, 'transfer', r.amount, r.amount,
      v_now, v_now, v_now, v_reason, 'open', '',
      NULL, 'once', TRUE, v_transfer_id, v_group_id
    );

    -- Paired ledger entry on recipient side (income)
    INSERT INTO income (
      bank_account_id, source, category, amount,
      received_at, pay_date, info, note,
      recurrence, cycle, is_active, state, transfer_id, group_id
    ) VALUES (
      v_admin_account_id, v_reason, 'transfer', r.amount,
      v_now, v_now, v_reason, '',
      NULL, 'once', TRUE, 'open', v_transfer_id, v_group_id
    );

    UPDATE bank_accounts SET balance = balance - r.amount WHERE id = v_member_account_id;
    UPDATE bank_accounts SET balance = balance + r.amount WHERE id = v_admin_account_id;

    UPDATE group_shared_expense_period_transfers
      SET status = 'released', transfer_id = v_transfer_id
     WHERE id = r.pt_id;

    UPDATE group_shared_expense_shares
      SET status = 'paid'
     WHERE id = r.share_id;

    v_released := v_released + 1;
  END LOOP;

  UPDATE group_shared_expense_periods
    SET status = 'settled', settled_at = v_now
   WHERE id = p_period_id;

  RETURN v_released;
END;
$$ LANGUAGE plpgsql;

COMMIT;
