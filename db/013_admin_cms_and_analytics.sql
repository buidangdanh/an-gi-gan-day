SET LOCAL statement_timeout = 0;

-- 1. Stamp authentication method on sessions so Admin CMS strictly enforces Google OAuth login
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS auth_method text;

-- 2. Add created_at & deleted_at timestamps to restaurants (alongside existing updated_at)
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

WITH imp AS (
 SELECT restaurant_id, min(imported_at) AS imported_at
 FROM foody_import_records
 GROUP BY restaurant_id
)
UPDATE restaurants r
SET created_at = LEAST(r.updated_at, imp.imported_at)
FROM imp
WHERE r.id = imp.restaurant_id;

UPDATE restaurants SET created_at = updated_at WHERE created_at > updated_at;
UPDATE restaurants SET deleted_at = updated_at WHERE NOT active AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS restaurants_admin_updated_idx ON restaurants(updated_at DESC, id);
CREATE INDEX IF NOT EXISTS restaurants_admin_city_updated_idx ON restaurants(city_slug, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS restaurants_admin_created_idx ON restaurants(created_at DESC, id);
CREATE INDEX IF NOT EXISTS restaurants_admin_deleted_idx ON restaurants(deleted_at DESC, id) WHERE deleted_at IS NOT NULL;

-- Preserve explicit primary_group / food_groups when dishes is empty array '[]'::jsonb
CREATE OR REPLACE FUNCTION update_food_search() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 computed_groups text[];
 first_group text;
BEGIN
 SELECT coalesce(array_agg(DISTINCT dish->>'group' ORDER BY dish->>'group'), '{}')
  INTO computed_groups
  FROM jsonb_array_elements(NEW.dishes) dish
  WHERE dish->>'group' IS NOT NULL AND btrim(dish->>'group') <> '';

 first_group := NULLIF(btrim(coalesce(NEW.dishes->0->>'group', '')), '');

 IF array_length(computed_groups, 1) IS NOT NULL THEN
  NEW.food_groups := computed_groups;
 END IF;
 IF first_group IS NOT NULL THEN
  NEW.primary_group := first_group;
 ELSIF NEW.primary_group IS NULL OR btrim(NEW.primary_group) = '' THEN
  NEW.primary_group := 'chưa phân nhóm';
 END IF;

 NEW.name_norm := food_normalize(NEW.name);
 NEW.search_text := food_normalize(
  NEW.name || ' ' || NEW.address || ' ' || coalesce(NEW.primary_group, '') || ' ' ||
  coalesce((SELECT string_agg(d->>'name', ' ') FROM jsonb_array_elements(NEW.dishes) d), '')
 );
 RETURN NEW;
END;
$$;

-- 3. Dedicated lifecycle log for Create / Update / Delete / Restore / Hard-Delete timestamps & snapshots
CREATE TABLE IF NOT EXISTS restaurant_lifecycle_events (
 id bigserial PRIMARY KEY,
 restaurant_id uuid NOT NULL,
 restaurant_name text NOT NULL,
 city_slug text,
 event_type text NOT NULL CHECK (event_type IN ('created', 'updated', 'deleted', 'restored', 'hard_deleted')),
 actor_email text NOT NULL,
 changed_fields text[] NOT NULL DEFAULT '{}',
 before_snapshot jsonb,
 after_snapshot jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurant_lifecycle_events_time_idx ON restaurant_lifecycle_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS restaurant_lifecycle_events_rest_idx ON restaurant_lifecycle_events(restaurant_id, occurred_at DESC);

-- 4. Website Visit Counter (Total Pageviews, Unique Visitors, Daily Series & Live Online Window)
CREATE TABLE IF NOT EXISTS site_visit_totals (
 id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 total_pageviews bigint NOT NULL DEFAULT 0,
 total_unique_visitors bigint NOT NULL DEFAULT 0,
 manual_offset_pageviews bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO site_visit_totals(id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS site_daily_visits (
 day date PRIMARY KEY,
 pageviews bigint NOT NULL DEFAULT 0,
 unique_visitors bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_daily_uniques (
 day date NOT NULL,
 visitor_hash text NOT NULL,
 first_path text,
 last_seen timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (day, visitor_hash)
);
CREATE INDEX IF NOT EXISTS site_daily_uniques_last_seen_idx ON site_daily_uniques(last_seen DESC);

DO $$
DECLARE
 sess_cnt bigint;
 vis_cnt bigint;
BEGIN
 SELECT count(*) INTO sess_cnt FROM sessions;
 SELECT count(*) INTO vis_cnt FROM visits;
 IF (SELECT total_pageviews FROM site_visit_totals WHERE id = 1) = 0 AND (sess_cnt > 0 OR vis_cnt > 0) THEN
  UPDATE site_visit_totals
  SET total_pageviews = GREATEST(sess_cnt, vis_cnt),
      total_unique_visitors = sess_cnt,
      updated_at = now()
  WHERE id = 1;

  INSERT INTO site_daily_visits(day, pageviews, unique_visitors, updated_at)
  SELECT (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d,
         count(*)::bigint,
         count(*)::bigint,
         now()
  FROM sessions
  GROUP BY d
  ON CONFLICT (day) DO NOTHING;
 END IF;
END $$;

INSERT INTO schema_migrations(version) VALUES('013') ON CONFLICT DO NOTHING;
