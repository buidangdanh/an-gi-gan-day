SET LOCAL statement_timeout = 0;
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS name_norm text NOT NULL DEFAULT '';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS review_avg double precision;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS data_license text NOT NULL DEFAULT 'unverified_import';

ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_data_license_check;
ALTER TABLE restaurants ADD CONSTRAINT restaurants_data_license_check
 CHECK (data_license IN ('first_party','odbl','cdla_permissive','cc0','partner_licensed','demo','unverified_import'));

UPDATE restaurants SET data_license = CASE WHEN demo THEN 'demo' ELSE 'unverified_import' END WHERE data_license = 'unverified_import';
UPDATE restaurants SET name_norm = food_normalize(name) WHERE name_norm = '';

UPDATE restaurants r SET
 review_count = coalesce(a.count, 0),
 review_avg = a.average
FROM (
 SELECT restaurant_id, count(*)::int AS count, avg(score)::float AS average
 FROM reviews WHERE status = 'approved' GROUP BY restaurant_id
) a
WHERE r.id = a.restaurant_id;

CREATE OR REPLACE FUNCTION update_food_search() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT coalesce(array_agg(DISTINCT dish->>'group' ORDER BY dish->>'group'),'{}')
  INTO NEW.food_groups
  FROM jsonb_array_elements(NEW.dishes) dish
  WHERE dish->>'group' IS NOT NULL;
 NEW.primary_group = coalesce(NEW.dishes->0->>'group','chưa phân nhóm');
 NEW.name_norm = food_normalize(NEW.name);
 NEW.search_text = food_normalize(
  NEW.name || ' ' || NEW.address || ' ' ||
  coalesce((SELECT string_agg(d->>'name',' ') FROM jsonb_array_elements(NEW.dishes) d),'')
 );
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_restaurant_review_stats() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 target_id uuid;
 c integer;
 a double precision;
BEGIN
 target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.restaurant_id ELSE NEW.restaurant_id END;
 SELECT count(*)::int, avg(score)::float INTO c, a
  FROM reviews WHERE restaurant_id = target_id AND status = 'approved';
 UPDATE restaurants SET review_count = coalesce(c, 0), review_avg = a WHERE id = target_id;
 IF TG_OP = 'UPDATE' AND OLD.restaurant_id IS DISTINCT FROM NEW.restaurant_id THEN
  SELECT count(*)::int, avg(score)::float INTO c, a
   FROM reviews WHERE restaurant_id = OLD.restaurant_id AND status = 'approved';
  UPDATE restaurants SET review_count = coalesce(c, 0), review_avg = a WHERE id = OLD.restaurant_id;
 END IF;
 RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS reviews_sync_stats ON reviews;
CREATE TRIGGER reviews_sync_stats
 AFTER INSERT OR UPDATE OR DELETE ON reviews
 FOR EACH ROW EXECUTE FUNCTION sync_restaurant_review_stats();

CREATE INDEX IF NOT EXISTS restaurant_geo_public_sug
 ON restaurants USING gist(location)
 WHERE active AND NOT demo AND location IS NOT NULL
   AND primary_group NOT IN ('chưa phân nhóm','nhà hàng','quán ăn','đồ uống & tráng miệng');

CREATE INDEX IF NOT EXISTS restaurant_group_geo
 ON restaurants USING gist(primary_group, location)
 WHERE active AND NOT demo AND location IS NOT NULL;

CREATE INDEX IF NOT EXISTS restaurant_name_norm_trgm
 ON restaurants USING gin(name_norm gin_trgm_ops)
 WHERE active;

CREATE INDEX IF NOT EXISTS reviews_restaurant_approved
 ON reviews(restaurant_id, updated_at DESC)
 WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(last_seen, created_at);
CREATE INDEX IF NOT EXISTS rate_limits_expiry_idx ON rate_limits(expires_at);

INSERT INTO schema_migrations(version) VALUES('008') ON CONFLICT DO NOTHING;
