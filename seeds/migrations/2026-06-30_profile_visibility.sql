-- 2026-06-30_profile_visibility.sql
-- Adds a per-user opt-out for showing the profile image to other users.
-- Default TRUE — existing users keep their current visible-by-default behavior.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS show_profile_image_to_others BOOLEAN NOT NULL DEFAULT TRUE;

-- Permissions — match the existing GRANT pattern from grant_permissions.sql.
-- Idempotent: GRANTs do not error if already present.
GRANT SELECT, UPDATE (show_profile_image_to_others) ON users TO authenticated, service_role;
