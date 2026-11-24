SET LOCAL statement_timeout = 0;

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS city_slug text NOT NULL DEFAULT 'ha-noi';

ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_city_slug_check;
ALTER TABLE restaurants ADD CONSTRAINT restaurants_city_slug_check
 CHECK (city_slug IN ('ha-noi','ho-chi-minh','da-nang','hai-phong','can-tho','hue','nha-trang','da-lat','vung-tau','ha-long'));

UPDATE restaurants SET city_slug = 'ho-chi-minh' WHERE demo AND lat IS NOT NULL AND lat < 12;

CREATE INDEX IF NOT EXISTS restaurant_city_group_pop_idx
 ON restaurants(city_slug, primary_group, popularity_score DESC, id)
 WHERE active AND NOT demo;

CREATE INDEX IF NOT EXISTS restaurant_city_geo_idx
 ON restaurants USING gist(city_slug, location)
 WHERE active AND NOT demo AND location IS NOT NULL;

INSERT INTO schema_migrations(version) VALUES('011') ON CONFLICT DO NOTHING;
