-- ============================================================
-- Migration 002: phone verification
--
-- Adds a one-to-one verified-phone link to profiles plus a
-- short-lived OTP table that stores hashed codes (never plaintext).
--
-- profiles.phone now holds an E.164 number (`+91XXXXXXXXXX`) only
-- after the user confirms ownership via WhatsApp OTP. We null out
-- the legacy free-form phones from the old phone/OTP auth era so
-- the new unique index applies cleanly — affected users can re-link
-- via the new flow.
-- ============================================================

-- +migrate Up

-- 1. Clear legacy phone strings written under the pre-username schema.
--    They were never required to be unique, so they'd block the index.
UPDATE profiles SET phone = NULL WHERE phone IS NOT NULL;

-- 2. Track when verification completed (null = unverified).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

COMMENT ON COLUMN profiles.phone IS
  'Verified E.164 phone (one-to-one). Null until the user passes WhatsApp OTP.';
COMMENT ON COLUMN profiles.phone_verified_at IS
  'Timestamp the phone link was confirmed via OTP; null = unverified.';

-- 3. One verified phone → one profile. Postgres unique indexes treat NULLs
--    as distinct, so unverified rows (phone IS NULL) coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique ON profiles (phone);

-- 4. Pending OTPs. We store only a SHA-256 hash of the 6-digit code; the
--    plaintext OTP never lives in Postgres. attempts is incremented on
--    every verify call so brute force fails fast.
CREATE TABLE IF NOT EXISTS phone_otps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  phone       text        NOT NULL,
  code_hash   text        NOT NULL,
  attempts    integer     NOT NULL DEFAULT 0,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phone_otps_user_phone_sent
  ON phone_otps (user_id, phone, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_phone_otps_expires_at
  ON phone_otps (expires_at);

-- +migrate Down

DROP INDEX IF EXISTS idx_phone_otps_expires_at;
DROP INDEX IF EXISTS idx_phone_otps_user_phone_sent;
DROP TABLE IF EXISTS phone_otps;
DROP INDEX IF EXISTS profiles_phone_unique;
ALTER TABLE profiles DROP COLUMN IF EXISTS phone_verified_at;
