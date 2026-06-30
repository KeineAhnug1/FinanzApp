-- =============================================================================
-- Migration: Funding Creator Flow (2026-06-30)
-- =============================================================================
-- Neue Logik für Sammelaktionen:
--   * Sammelaktion hat einen Ersteller (creator_user_id) und ein Empfangskonto
--     (creator_bank_account_id) — Spenden gehen direkt auf dieses Konto.
--   * Pool-Unter-Ausgaben (group_expenses) sind Planposten. Sie reservieren
--     Budget gegen target_amount, schmälern den realen Pool aber erst beim
--     Bezahlen — dann wird auch das Ersteller-Konto belastet.
--
-- Idempotent: alle DDL via IF NOT EXISTS.
-- =============================================================================

ALTER TABLE group_funding
  ADD COLUMN IF NOT EXISTS creator_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS creator_bank_account_id INT NULL REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- Link bookkeeping rows back to the funding they originate from.
-- income gets group_funding_id (creator credit on donation, possible refunds);
-- private_expenses gets group_expense_id (creator debit when a sub-expense is paid).
ALTER TABLE income
  ADD COLUMN IF NOT EXISTS group_funding_id INT NULL REFERENCES group_funding(id) ON DELETE SET NULL;

ALTER TABLE private_expenses
  ADD COLUMN IF NOT EXISTS group_expense_id INT NULL REFERENCES group_expenses(id) ON DELETE SET NULL;

-- Backfill: für bestehende Sammelaktionen ohne Ersteller → ältester Admin der Gruppe,
-- sein default_bank_account_id (falls vorhanden), sonst sein ältestes Bankkonto.
WITH oldest_admin AS (
  SELECT DISTINCT ON (gm.group_id)
    gm.group_id,
    gm.user_id,
    u.default_bank_account_id
  FROM group_members gm
  JOIN users u ON u.id = gm.user_id
  WHERE gm.role = 'admin' AND gm.status = 'accepted'
  ORDER BY gm.group_id, gm.id ASC
),
chosen_account AS (
  SELECT
    oa.group_id,
    oa.user_id,
    COALESCE(
      oa.default_bank_account_id,
      (SELECT id FROM bank_accounts ba WHERE ba.user_id = oa.user_id ORDER BY ba.created_at ASC LIMIT 1)
    ) AS bank_account_id
  FROM oldest_admin oa
)
UPDATE group_funding gf
SET creator_user_id = ca.user_id,
    creator_bank_account_id = ca.bank_account_id
FROM chosen_account ca
WHERE gf.group_id = ca.group_id
  AND gf.creator_user_id IS NULL;
