-- =============================================================================
-- Migration: GRANT permissions on new tables/functions (2026-06-30)
-- =============================================================================
-- BUG SYMPTOM:
--   "permission denied for table group_shared_expenses"
--   "permission denied for table group_trips"
--
-- ROOT CAUSE:
--   The 10 new tables created by 2026-06-29_groups_expansion.sql were CREATEd
--   via the SQL editor, which does NOT auto-grant access to Supabase roles
--   (anon, authenticated, service_role). Direct Hyperdrive Postgres connections
--   then hit "permission denied" on INSERT/SELECT.
--   This migration explicitly grants the standard Supabase role permissions
--   on every new table, sequence, and function.
--
-- IDEMPOTENT: All GRANT statements can be run multiple times without harm.
-- Run manually in Supabase SQL editor.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables from 2026-06-29_groups_expansion.sql
-- ---------------------------------------------------------------------------
GRANT ALL ON TABLE transfers                                  TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE group_shared_expenses                      TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE group_shared_expense_shares                TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE group_shared_expense_periods               TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE group_shared_expense_period_transfers      TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE group_trips                                TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE group_trip_participants                    TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE group_trip_expenses                        TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE group_trip_expense_participants            TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE group_trip_settlements                     TO postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- All sequences (SERIAL id columns rely on these)
-- ---------------------------------------------------------------------------
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC functions from groups_expansion + audit_fixes
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION contribute_to_funding(INT, NUMERIC)            TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION release_period_reservations(INT)               TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION increment_bank_balance(INT, NUMERIC)           TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION transfer_between_accounts(INT, INT, NUMERIC)   TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION refund_from_funding(INT, NUMERIC)              TO postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Future-proof: default privileges so any new tables/functions inherit grants
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES        TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES     TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres, anon, authenticated, service_role;

COMMIT;
