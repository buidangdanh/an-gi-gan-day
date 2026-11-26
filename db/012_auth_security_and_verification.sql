SET LOCAL statement_timeout = 0;

-- 1. Extend accounts with verified email/phone & 7-day verification tracking
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS verify_reminded_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_unique_idx ON accounts(lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_phone_unique_idx ON accounts(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS accounts_unverified_expiry_idx
 ON accounts(created_at)
 WHERE email_verified_at IS NULL AND phone_verified_at IS NULL;

-- Grandfather pre-existing accounts created before migration 012 so none are unexpectedly purged
UPDATE accounts a
SET
 email = CASE
  WHEN a.email IS NULL AND c.username LIKE '%@%.%' THEN lower(c.username)
  ELSE a.email
 END,
 email_verified_at = COALESCE(a.email_verified_at, a.created_at)
FROM account_credentials c
WHERE c.account_id = a.id AND a.email_verified_at IS NULL;

-- 2. Progressive brute-force lockout columns on account_credentials
ALTER TABLE account_credentials ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE account_credentials ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE account_credentials ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NOT NULL DEFAULT now();

-- 3. Ensure ON DELETE CASCADE across account/session child tables so 7-day unverified purge is clean
ALTER TABLE auth_identities DROP CONSTRAINT IF EXISTS auth_identities_account_id_fkey;
ALTER TABLE auth_identities ADD CONSTRAINT auth_identities_account_id_fkey
 FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_account_id_fkey;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_account_id_fkey
 FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_account_id_fkey;
ALTER TABLE sessions ADD CONSTRAINT sessions_account_id_fkey
 FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_session_id_fkey;
ALTER TABLE visits ADD CONSTRAINT visits_session_id_fkey
 FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_account_id_fkey;
ALTER TABLE visits ADD CONSTRAINT visits_account_id_fkey
 FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;

ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_account_id_fkey;
ALTER TABLE favorites ADD CONSTRAINT favorites_account_id_fkey
 FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;

ALTER TABLE saved_filters DROP CONSTRAINT IF EXISTS saved_filters_account_id_fkey;
ALTER TABLE saved_filters ADD CONSTRAINT saved_filters_account_id_fkey
 FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_account_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_account_id_fkey
 FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;

ALTER TABLE review_history DROP CONSTRAINT IF EXISTS review_history_review_id_fkey;
ALTER TABLE review_history ADD CONSTRAINT review_history_review_id_fkey
 FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_session_id_fkey;
ALTER TABLE reports ADD CONSTRAINT reports_session_id_fkey
 FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

-- 4. One-way hashed Email Verification & Password Reset tokens
CREATE TABLE IF NOT EXISTS auth_tokens (
 id uuid PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK (purpose IN ('email_verify', 'password_reset')),
 code_hash text NOT NULL,
 link_token_hash text NOT NULL UNIQUE,
 attempts integer NOT NULL DEFAULT 0,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_account_purpose_idx ON auth_tokens(account_id, purpose, created_at DESC);

-- 5. Zero-cost Reverse Phone Verification challenges (Telegram Bot verified contact)
CREATE TABLE IF NOT EXISTS phone_auth_challenges (
 id uuid PRIMARY KEY,
 challenge_code text NOT NULL UNIQUE,
 poll_secret_hash text NOT NULL,
 session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 phone text,
 telegram_user_id text,
 display_name text,
 verified_at timestamptz,
 consumed_at timestamptz,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_auth_challenges_expires_idx ON phone_auth_challenges(expires_at);

-- 6. Zero-cost WebAuthn Passkey credentials (FaceID / TouchID / Windows Hello)
CREATE TABLE IF NOT EXISTS passkey_credentials (
 credential_id text PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 public_key_spki text NOT NULL,
 algorithm integer NOT NULL DEFAULT -7,
 counter bigint NOT NULL DEFAULT 0,
 device_label text NOT NULL DEFAULT 'Thiết bị cá nhân',
 created_at timestamptz NOT NULL DEFAULT now(),
 last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS passkey_credentials_account_idx ON passkey_credentials(account_id);

CREATE TABLE IF NOT EXISTS passkey_challenges (
 id uuid PRIMARY KEY,
 challenge text NOT NULL UNIQUE,
 account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK (purpose IN ('register', 'login')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passkey_challenges_expires_idx ON passkey_challenges(expires_at);

INSERT INTO schema_migrations(version) VALUES('012') ON CONFLICT DO NOTHING;
