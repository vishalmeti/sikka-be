-- ============================================================
-- Migration 001: phone/OTP auth -> username/password auth
--
-- Auth moves to Supabase email/password. The backend derives a
-- synthetic email (<username>@sikka.local) from the username.
-- Passwords are stored and hashed by Supabase in auth.users —
-- this table only holds the public username.
-- ============================================================

-- +migrate Up

-- 1. Add username (nullable first so existing rows don't break).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;

-- 2. Backfill existing rows with a placeholder derived from the id.
UPDATE profiles
SET username = 'user_' || left(replace(id::text, '-', ''), 12)
WHERE username IS NULL;

-- 3. Enforce NOT NULL + case-insensitive uniqueness.
ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON profiles (lower(username));

-- 4. Phone is no longer required (kept for legacy/optional contact).
ALTER TABLE profiles ALTER COLUMN phone DROP NOT NULL;

COMMENT ON COLUMN profiles.username IS 'Login identifier. Backend maps it to a synthetic Supabase auth email (<username>@sikka.local).';
COMMENT ON COLUMN profiles.phone    IS 'Optional. No longer used for auth (legacy from phone/OTP login).';

-- +migrate Down

DROP INDEX IF EXISTS profiles_username_key;
ALTER TABLE profiles DROP COLUMN IF EXISTS username;
-- Note: phone's NOT NULL constraint is intentionally not restored — rows created
-- under username auth have no phone, so re-adding it would fail. Restore manually
-- if you ever truly revert to phone-based auth.
