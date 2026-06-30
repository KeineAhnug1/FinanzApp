-- =============================================================================
-- Migration: drop legacy `depot_id` and unused `bank_account_id` from `shares`
-- =============================================================================
-- The `shares` table carried two dead columns:
--   * depot_id           — legacy alias of share_account_id; always written
--                          with the same value. Backend now writes only
--                          share_account_id.
--   * bank_account_id    — never set by any code path. Always NULL.
--
-- IMPORTANT: this migration MUST be run AFTER the backend deploy that removes
-- the legacy writes (commit drops depot_id from INSERT/UPDATE statements).
-- Otherwise live writes would fail with `column "depot_id" does not exist`.
-- =============================================================================

ALTER TABLE shares
  DROP COLUMN IF EXISTS depot_id,
  DROP COLUMN IF EXISTS bank_account_id;
