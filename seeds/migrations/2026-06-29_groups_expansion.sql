-- =============================================================================
-- Migration: Groups Expansion (2026-06-29)
-- =============================================================================
-- Adds: peer-to-peer transfers, group shared expenses (Splitwise-style),
-- group trips with min-cash-flow settlements, default receiving accounts,
-- Sammelaktion target + status + archive.
--
-- Idempotent: uses IF NOT EXISTS for every DDL and ADD COLUMN.
-- Run manually in Supabase SQL editor.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New columns on existing tables
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_bank_account_id INTEGER NULL
    REFERENCES bank_accounts(id) ON DELETE SET NULL;

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL;

ALTER TABLE group_funding
  ADD COLUMN IF NOT EXISTS target_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_funding_status_check'
  ) THEN
    ALTER TABLE group_funding
      ADD CONSTRAINT group_funding_status_check
      CHECK (status IN ('open', 'completed', 'archived'));
  END IF;
END $$;

ALTER TABLE private_expenses
  ADD COLUMN IF NOT EXISTS transfer_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS group_id INTEGER NULL REFERENCES groups(id) ON DELETE SET NULL;

ALTER TABLE income
  ADD COLUMN IF NOT EXISTS transfer_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS group_id INTEGER NULL REFERENCES groups(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. New tables
-- ---------------------------------------------------------------------------

-- Peer-to-peer transfers. Immutable once created.
CREATE TABLE IF NOT EXISTS transfers (
  id SERIAL PRIMARY KEY,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id   INTEGER NOT NULL REFERENCES users(id),
  from_bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  to_bank_account_id   INTEGER NOT NULL REFERENCES bank_accounts(id),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  reason VARCHAR,
  group_id INTEGER NULL REFERENCES groups(id) ON DELETE SET NULL,
  group_expense_share_id INTEGER NULL,
  trip_settlement_id     INTEGER NULL,
  status VARCHAR NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  completed_at TIMESTAMP NULL,
  CHECK (from_user_id <> to_user_id),
  CHECK (from_bank_account_id <> to_bank_account_id)
);

CREATE INDEX IF NOT EXISTS idx_transfers_from_user ON transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_user   ON transfers(to_user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_group     ON transfers(group_id);

-- Group-level shared expense (rent, internet, ...).
CREATE TABLE IF NOT EXISTS group_shared_expenses (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  creator_user_id INTEGER NOT NULL REFERENCES users(id),
  title VARCHAR NOT NULL,
  info TEXT,
  total_amount NUMERIC NOT NULL CHECK (total_amount > 0),
  payment_mode VARCHAR NOT NULL CHECK (payment_mode IN ('prepaid','postpaid')),
  cycle VARCHAR NOT NULL DEFAULT 'once' CHECK (cycle IN ('once','weekly','monthly','yearly')),
  next_due_date TIMESTAMP NULL,
  status VARCHAR NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','completed','cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gse_group  ON group_shared_expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_gse_status ON group_shared_expenses(status);

CREATE TABLE IF NOT EXISTS group_shared_expense_shares (
  id SERIAL PRIMARY KEY,
  shared_expense_id INTEGER NOT NULL REFERENCES group_shared_expenses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  share_amount NUMERIC NOT NULL CHECK (share_amount >= 0),
  status VARCHAR NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','left','paid')),
  decided_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (shared_expense_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gses_expense     ON group_shared_expense_shares(shared_expense_id);
CREATE INDEX IF NOT EXISTS idx_gses_user_status ON group_shared_expense_shares(user_id, status);

CREATE TABLE IF NOT EXISTS group_shared_expense_periods (
  id SERIAL PRIMARY KEY,
  shared_expense_id INTEGER NOT NULL REFERENCES group_shared_expenses(id) ON DELETE CASCADE,
  period_start TIMESTAMP NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'collecting'
    CHECK (status IN ('collecting','settled','cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  settled_at TIMESTAMP NULL,
  UNIQUE (shared_expense_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_gsep_expense ON group_shared_expense_periods(shared_expense_id);

CREATE TABLE IF NOT EXISTS group_shared_expense_period_transfers (
  id SERIAL PRIMARY KEY,
  period_id INTEGER NOT NULL REFERENCES group_shared_expense_periods(id) ON DELETE CASCADE,
  share_id INTEGER NOT NULL REFERENCES group_shared_expense_shares(id) ON DELETE CASCADE,
  transfer_id INTEGER NULL REFERENCES transfers(id),
  amount NUMERIC NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','released','cancelled')),
  UNIQUE (period_id, share_id)
);

-- Trips
CREATE TABLE IF NOT EXISTS group_trips (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  creator_user_id INTEGER NOT NULL REFERENCES users(id),
  name VARCHAR NOT NULL,
  description TEXT,
  status VARCHAR NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','closed','archived')),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  closed_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_group_trips_group ON group_trips(group_id);

CREATE TABLE IF NOT EXISTS group_trip_participants (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES group_trips(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  UNIQUE (trip_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_trip_expenses (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES group_trips(id) ON DELETE CASCADE,
  payer_user_id INTEGER NOT NULL REFERENCES users(id),
  description VARCHAR NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  spent_at TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gte_trip ON group_trip_expenses(trip_id);

CREATE TABLE IF NOT EXISTS group_trip_expense_participants (
  id SERIAL PRIMARY KEY,
  trip_expense_id INTEGER NOT NULL REFERENCES group_trip_expenses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  UNIQUE (trip_expense_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_trip_settlements (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES group_trips(id) ON DELETE CASCADE,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  status VARCHAR NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','paid','cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  paid_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_gts_trip        ON group_trip_settlements(trip_id);
CREATE INDEX IF NOT EXISTS idx_gts_from_status ON group_trip_settlements(from_user_id, status);

-- ---------------------------------------------------------------------------
-- 3. Deferred FKs on `transfers`
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_transfers_gses'
  ) THEN
    ALTER TABLE transfers
      ADD CONSTRAINT fk_transfers_gses
        FOREIGN KEY (group_expense_share_id) REFERENCES group_shared_expense_shares(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_transfers_trip_settlement'
  ) THEN
    ALTER TABLE transfers
      ADD CONSTRAINT fk_transfers_trip_settlement
        FOREIGN KEY (trip_settlement_id) REFERENCES group_trip_settlements(id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. RPC: contribute_to_funding — atomic Sammelaktion contribution with cap
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION contribute_to_funding(p_funding_id INT, p_amount NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
  v_target NUMERIC; v_current NUMERIC; v_room NUMERIC; v_actual NUMERIC;
BEGIN
  SELECT target_amount, amount INTO v_target, v_current
    FROM group_funding WHERE id = p_funding_id FOR UPDATE;
  IF v_target IS NULL OR v_target <= 0 THEN
    RETURN p_amount;
  END IF;
  v_room := GREATEST(0, v_target - COALESCE(v_current, 0));
  v_actual := LEAST(p_amount, v_room);
  UPDATE group_funding
    SET amount = COALESCE(amount, 0) + v_actual,
        status = CASE
          WHEN COALESCE(amount, 0) + v_actual >= v_target THEN 'completed'
          ELSE status
        END,
        completed_at = CASE
          WHEN COALESCE(amount, 0) + v_actual >= v_target AND completed_at IS NULL THEN now()
          ELSE completed_at
        END
    WHERE id = p_funding_id;
  RETURN v_actual;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 5. RPC: release_period_reservations — atomically release all reserved
--    shares of a postpaid period as completed transfers to the admin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION release_period_reservations(p_period_id INT)
RETURNS INT AS $$
DECLARE
  v_shared_expense_id INT;
  v_group_id INT;
  v_admin_user_id INT;
  v_admin_account_id INT;
  v_title VARCHAR;
  v_released INT := 0;
  v_member_account_id INT;
  v_transfer_id INT;
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

    INSERT INTO transfers (
      from_user_id, to_user_id,
      from_bank_account_id, to_bank_account_id,
      amount, reason, group_id, group_expense_share_id,
      status, completed_at
    ) VALUES (
      r.user_id, v_admin_user_id,
      v_member_account_id, v_admin_account_id,
      r.amount, 'Anteil: ' || v_title, v_group_id, r.share_id,
      'completed', now()
    ) RETURNING id INTO v_transfer_id;

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
    SET status = 'settled', settled_at = now()
   WHERE id = p_period_id;

  RETURN v_released;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 6. Backfills
-- ---------------------------------------------------------------------------

UPDATE users
   SET default_bank_account_id = (
     SELECT id FROM bank_accounts
      WHERE bank_accounts.user_id = users.id
      ORDER BY created_at ASC
      LIMIT 1
   )
 WHERE default_bank_account_id IS NULL;

UPDATE group_funding
   SET target_amount = COALESCE(amount, 0) + 1,
       status = 'open'
 WHERE target_amount = 0;

COMMIT;
