-- ============================================================
-- Migration 000: initial schema
--
-- Full Sikka schema for plain Postgres (no Supabase auth.users
-- dependency, no RLS — auth is enforced in the Node layer via JWT).
--
-- Idempotent CREATEs (IF NOT EXISTS) so it's safe to re-run on a
-- partially-set-up DB.
-- ============================================================

-- +migrate Up

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- profiles owns username + password (no FK to auth.users; we own auth here)
CREATE TABLE IF NOT EXISTS profiles (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text        NOT NULL,
  password_hash text        NOT NULL,
  phone         text,
  name          text,
  role          text        NOT NULL CHECK (role IN ('customer', 'owner')),
  fcm_token     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON profiles (lower(username));

COMMENT ON COLUMN profiles.username      IS 'Login identifier. Case-insensitive unique.';
COMMENT ON COLUMN profiles.password_hash IS 'bcrypt hash of the user password.';
COMMENT ON COLUMN profiles.phone         IS 'Optional. Not used for auth.';
COMMENT ON COLUMN profiles.role          IS 'customer = shopper, owner = kirana store owner.';

-- stores
CREATE TABLE IF NOT EXISTS stores (
  id          uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid              NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  name        text              NOT NULL,
  upi_id      text              UNIQUE NOT NULL,
  address     text,
  lat         double precision,
  lng         double precision,
  is_active   boolean           NOT NULL DEFAULT true,
  created_at  timestamptz       NOT NULL DEFAULT now(),
  updated_at  timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON stores (owner_id);

-- transactions
CREATE TABLE IF NOT EXISTS transactions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid        NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  store_id              uuid        NOT NULL REFERENCES stores  (id) ON DELETE RESTRICT,
  amount                numeric     NOT NULL CHECK (amount > 0),
  coins_earned          numeric     NOT NULL CHECK (coins_earned >= 0),
  razorpay_order_id     text        NOT NULL,
  razorpay_payment_id   text        UNIQUE NOT NULL,
  status                text        NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_store_id_created_at ON transactions (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_razorpay_order_id ON transactions (razorpay_order_id);

-- coin_wallets
CREATE TABLE IF NOT EXISTS coin_wallets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  store_id        uuid        NOT NULL REFERENCES stores  (id) ON DELETE CASCADE,
  balance         numeric     NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned    numeric     NOT NULL DEFAULT 0,
  streak_days     integer     NOT NULL DEFAULT 0,
  last_visit_date date,
  tier            text        NOT NULL DEFAULT 'bronze'
                              CHECK (tier IN ('bronze', 'silver', 'gold')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (customer_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_coin_wallets_store_id ON coin_wallets (store_id);

-- redemption_requests
CREATE TABLE IF NOT EXISTS redemption_requests (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid        NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  store_id         uuid        NOT NULL REFERENCES stores  (id) ON DELETE RESTRICT,
  coins_to_redeem  numeric     NOT NULL CHECK (coins_to_redeem > 0),
  rupee_value      numeric     NOT NULL,
  bill_amount      numeric     NOT NULL,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  resolved_by      uuid        REFERENCES profiles (id)
);

CREATE INDEX IF NOT EXISTS idx_redemption_requests_customer_id ON redemption_requests (customer_id);
CREATE INDEX IF NOT EXISTS idx_redemption_requests_store_id_status ON redemption_requests (store_id, status);

-- offers
CREATE TABLE IF NOT EXISTS offers (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid        NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  title        text        NOT NULL,
  offer_type   text        NOT NULL CHECK (offer_type IN ('double_coins', 'bonus_coins', 'spend_and_earn')),
  multiplier   numeric     NOT NULL DEFAULT 1,
  bonus_amount numeric     NOT NULL DEFAULT 0,
  min_spend    numeric     NOT NULL DEFAULT 0,
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offers_store_id_active ON offers (store_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_offers_store_id_time ON offers (store_id, starts_at, ends_at);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  title        text        NOT NULL,
  body         text        NOT NULL,
  type         text        NOT NULL CHECK (type IN (
                             'coins_earned',
                             'redemption_requested',
                             'redemption_confirmed',
                             'redemption_rejected',
                             'streak_bonus',
                             'offer'
                           )),
  reference_id uuid,
  is_read      boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_unread ON notifications (user_id) WHERE is_read = false;

-- store_upi_history
CREATE TABLE IF NOT EXISTS store_upi_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid        NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  old_upi_id  text        NOT NULL,
  new_upi_id  text        NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_upi_history_store_id ON store_upi_history (store_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_stores_updated_at ON stores;
CREATE TRIGGER trg_stores_updated_at
  BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_coin_wallets_updated_at ON coin_wallets;
CREATE TRIGGER trg_coin_wallets_updated_at
  BEFORE UPDATE ON coin_wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +migrate Down

DROP TRIGGER IF EXISTS trg_coin_wallets_updated_at ON coin_wallets;
DROP TRIGGER IF EXISTS trg_stores_updated_at ON stores;
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
DROP FUNCTION IF EXISTS set_updated_at();

DROP TABLE IF EXISTS store_upi_history;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS offers;
DROP TABLE IF EXISTS redemption_requests;
DROP TABLE IF EXISTS coin_wallets;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS stores;
DROP TABLE IF EXISTS profiles;
