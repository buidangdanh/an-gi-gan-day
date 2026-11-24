SET LOCAL statement_timeout = 0;

-- 1. Popularity & favourite signals on restaurants
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS popularity_saves integer NOT NULL DEFAULT 0;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS popularity_reviews integer NOT NULL DEFAULT 0;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS popularity_rating double precision;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS popularity_score double precision NOT NULL DEFAULT 0;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS popularity_badge text;

ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_popularity_badge_check;
ALTER TABLE restaurants ADD CONSTRAINT restaurants_popularity_badge_check
 CHECK (popularity_badge IS NULL OR popularity_badge IN ('top_fav','popular','good_rating','worth_try'));

WITH src AS (
 SELECT
  f.restaurant_id,
  max(GREATEST(0, coalesce((f.source_payload->>'TotalSaves')::int, 0)))::int AS saves,
  max(GREATEST(0, coalesce((f.source_payload->>'TotalReviews')::int, 0)))::int AS reviews,
  max(GREATEST(0, coalesce((f.source_payload->>'TotalPictures')::int, 0)))::int AS pics,
  max(NULLIF((f.source_payload->>'AvgRating')::float, 0)) AS rating
 FROM foody_import_records f
 GROUP BY f.restaurant_id
)
UPDATE restaurants r
SET
 popularity_saves = coalesce(s.saves, r.popularity_saves),
 popularity_reviews = coalesce(s.reviews, r.popularity_reviews),
 popularity_rating = coalesce(s.rating, r.popularity_rating),
 popularity_score = LEAST(
  100.0,
  coalesce(s.rating, 0) * 6.0 +
  ln(1 + coalesce(s.reviews, 0)) * 7.0 +
  ln(1 + coalesce(s.saves, 0)) * 8.0 +
  ln(1 + coalesce(s.pics, 0)) * 2.0 +
  CASE WHEN r.import_record_id IS NOT NULL THEN 35.0 ELSE 0.0 END
 ),
 popularity_badge = CASE
  WHEN (coalesce(s.rating, 0) >= 7.2 AND coalesce(s.reviews, 0) >= 40)
    OR coalesce(s.saves, 0) >= 40
    OR coalesce(s.reviews, 0) >= 120 THEN 'top_fav'
  WHEN (coalesce(s.rating, 0) >= 6.8 AND coalesce(s.reviews, 0) >= 12)
    OR coalesce(s.saves, 0) >= 10
    OR r.import_record_id IS NOT NULL THEN 'popular'
  WHEN coalesce(s.rating, 0) >= 7.2 AND coalesce(s.reviews, 0) >= 3 THEN 'good_rating'
  WHEN coalesce(s.reviews, 0) >= 3 OR coalesce(s.pics, 0) >= 10 OR coalesce(s.saves, 0) >= 3 THEN 'worth_try'
  ELSE NULL
 END
FROM src s
WHERE r.id = s.restaurant_id;

UPDATE restaurants r
SET
 popularity_score = GREATEST(r.popularity_score, 35.0),
 popularity_badge = coalesce(r.popularity_badge, 'popular')
WHERE r.import_record_id IS NOT NULL AND r.popularity_badge IS NULL;

CREATE INDEX IF NOT EXISTS restaurant_group_popularity_idx
 ON restaurants(primary_group, popularity_score DESC, id)
 WHERE active AND NOT demo;

-- 2. Thường / Pro Account Credentials & Rich Features
CREATE TABLE IF NOT EXISTS account_credentials (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 username text NOT NULL UNIQUE CHECK (char_length(username) BETWEEN 3 AND 120),
 password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_preferences (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 excluded_groups text[] NOT NULL DEFAULT '{}',
 default_area text,
 pro_boost boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collections (
 id uuid PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
 icon text NOT NULL DEFAULT '📁' CHECK (char_length(icon) BETWEEN 1 AND 8),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collections_account_idx ON collections(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS collection_items (
 collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(collection_id, restaurant_id)
);

CREATE TABLE IF NOT EXISTS place_notes (
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 500),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id, restaurant_id)
);

CREATE TABLE IF NOT EXISTS pro_trials (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 claimed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations(version) VALUES('010') ON CONFLICT DO NOTHING;
